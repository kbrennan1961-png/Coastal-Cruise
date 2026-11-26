#!/usr/bin/env node
/* Deterministic offline capture of intro-cutscene.html.
 *
 * With no --shots, renders the built-in 16-second Harbor cutscene. With an
 * exported INAV shots file, the same renderer follows that camera plan, so the
 * map editor's autonomous waypoint actions can author cutscenes as well as
 * gameplay trailers.
 *
 *   node tools/cutscene-capture.js --out capture/harbor.mp4
 *   node tools/cutscene-capture.js --shots capture/mission-shots.json \
 *     --out capture/inav-cutscene.mp4 --fps 24
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CUTSCENE = path.join(ROOT, 'intro-cutscene.html');
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg');

function has(flag) { return process.argv.includes(flag); }

function value(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function number(flag, fallback) {
  const n = Number(value(flag, String(fallback)));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function help() {
  console.log(`Cutscene capture

Usage:
  node tools/cutscene-capture.js [options]

Options:
  --shots FILE    INAV shots JSON to render instead of the built-in camera path
  --out FILE      Output MP4 (default capture/cutscene.mp4)
  --fps N         Fixed capture rate (default 30)
  --width N       Output width (default 1280)
  --height N      Output height (default 960)
  --help          Show this text
`);
}

async function main() {
  if (has('--help')) { help(); return; }

  const shotsFile = value('--shots', '');
  const plan = shotsFile ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), shotsFile), 'utf8')) : null;
  const out = path.resolve(process.cwd(), value('--out', path.join('capture', 'cutscene.mp4')));
  const fps = number('--fps', 30);
  const width = Math.round(number('--width', 1280));
  const height = Math.round(number('--height', 960));
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cutscene-'));

  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files', '--use-gl=swiftshader', '--enable-webgl']
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(String(err)));

  try {
    await page.goto(pathToFileURL(CUTSCENE).href);
    await page.waitForFunction(() => window.__harborIntro &&
      typeof window.__harborIntro.beginCapture === 'function', null, { timeout: 120000 });

    if (plan) {
      const loaded = await page.evaluate(p => window.__harborIntro.loadShotPlan(p), plan);
      if (!loaded) throw new Error('The shots file did not contain a usable shot plan.');
    }
    const duration = await page.evaluate(() => {
      window.__harborIntro.beginCapture();
      const hint = document.getElementById('hint');
      if (hint) hint.style.display = 'none';
      return window.__harborIntro.duration;
    });
    const frames = Math.max(1, Math.ceil(duration * fps));
    const dt = 1 / fps;

    for (let i = 0; i < frames; i++) {
      await page.evaluate(([t, step]) => window.__harborIntro.renderAt(t, step), [i * dt, dt]);
      await page.screenshot({
        path: path.join(frameDir, 'frame-' + String(i).padStart(5, '0') + '.png'),
        type: 'png',
        animations: 'disabled'
      });
    }
    const state = await page.evaluate(t => {
      window.__harborIntro.renderAt(t, 1 / 30);
      return {
        elapsed: window.__harborIntro.elapsed,
        finished: window.__harborIntro.finished,
        batteryLow: window.__harborIntro.batteryLow,
        duration: window.__harborIntro.duration,
        shots: window.__harborIntro.shotPlan
          ? window.__harborIntro.shotPlan.shots.length : 0
      };
    }, duration);
    if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));

    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync(FFMPEG, [
      '-y', '-framerate', String(fps), '-start_number', '0',
      '-i', path.join(frameDir, 'frame-%05d.png'),
      '-frames:v', String(frames),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out
    ], { stdio: 'inherit' });
    const bytes = fs.readFileSync(out);
    console.log(JSON.stringify({
      out, fps, frames, duration, state, bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    fs.rmSync(frameDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error('cutscene-capture: ' + (err && err.message ? err.message : err)); process.exit(1); });
