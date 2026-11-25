#!/usr/bin/env node
/* Script a repeatable Coastal Cruise trailer and capture the WebGL canvas. */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { chromium } = require('playwright');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const RUNTIME = path.join(__dirname, 'trailer-runtime.js');
const DEFAULT_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const DEFAULT_MUSIC = path.join(ROOT, 'media', 'base_211.m4a');

function has(flag) { return process.argv.includes(flag); }

function value(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function number(flag, fallback) {
  const n = Number(value(flag, String(fallback)));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function help() {
  console.log(`Coastal Cruise trailer harness

Usage:
  npm run trailer -- [options]

Options:
  --url URL          Game URL (default: local file:// index.html)
  --out FILE         Output video (default: capture/coastal-cruise-trailer.mp4)
  --music FILE       Music to mux (default: media/base_211.m4a)
  --no-music         Keep the silent WebM canvas capture only
  --width N          Viewport width (default: 1280)
  --height N         Viewport height (default: 720)
  --fps N            Capture frame rate (default: 60)
  --bitrate N        WebM video bitrate (default: 8000000)
  --units N          Timeline scale; 0.1 is useful for smoke tests
  --keep-raw         Keep the intermediate WebM after MP4 muxing
  --chromium PATH     Use a specific Chromium binary (or set CC_CHROMIUM_PATH)
  --debug            Print browser console messages
  --help             Show this text

Examples:
  npm run trailer
  npm run trailer -- --url http://192.168.0.77/ --music audio/playback-fm.mp3
  npm run trailer -- --no-music --out capture/test.webm --units 0.1
`);
}

async function main() {
  if (has('--help')) { help(); return; }

  const opts = {
    url: value('--url', DEFAULT_URL),
    out: resolvePath(value('--out', path.join(ROOT, 'capture', 'coastal-cruise-trailer.mp4'))),
    music: resolvePath(value('--music', DEFAULT_MUSIC)),
    noMusic: has('--no-music'),
    width: number('--width', 1280),
    height: number('--height', 720),
    fps: number('--fps', 60),
    bitrate: number('--bitrate', 8000000),
    units: number('--units', 1),
    keepRaw: has('--keep-raw'),
    chromium: process.env.CC_CHROMIUM_PATH || value('--chromium', null),
    debug: has('--debug')
  };

  const captureDir = path.join(ROOT, 'capture');
  fs.mkdirSync(captureDir, { recursive: true });
  const rawPath = path.join(captureDir, `coastal-cruise-raw-${Date.now()}.webm`);
  fs.writeFileSync(rawPath, Buffer.alloc(0));

  console.log(`Trailer: ${opts.url}`);
  console.log(`Capture: ${opts.width}x${opts.height} @ ${opts.fps} fps`);

  const browser = await chromium.launch(Object.assign({
    headless: true,
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--autoplay-policy=no-user-gesture-required'
    ]
  }, opts.chromium ? { executablePath: resolvePath(opts.chromium) } : {}));

  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: 1
    });
    await context.exposeBinding('__ccTrailerChunk', async (_source, base64) => {
      fs.appendFileSync(rawPath, Buffer.from(base64, 'base64'));
    });

    const page = await context.newPage();
    page.on('pageerror', (err) => console.error(`[browser error] ${err.stack || err.message}`));
    page.on('console', (msg) => {
      if (opts.debug || msg.type() === 'error') {
        console.log(`[browser:${msg.type()}] ${msg.text()}`);
      }
    });

    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(
      () => window.CC && window.CC.Game && window.CC.Game.renderer && window.CC.bootStage === 'ready',
      null,
      { timeout: 180000 }
    );
    console.log('Game ready. Starting scripted capture…');

    await page.addScriptTag({ path: RUNTIME });
    const runtimeError = await page.evaluate(() => window.CCTrailer && window.CCTrailer.error);
    if (runtimeError) throw new Error(runtimeError);

    const captureInfo = await page.evaluate((options) => window.CCTrailer.startCapture(options), {
      fps: opts.fps,
      bitrate: opts.bitrate
    });
    console.log(`Recorder: ${captureInfo.mime}`);

    let runError = null;
    try {
      const result = await page.evaluate((units) => window.CCTrailer.run({ units }), opts.units);
      console.log(`Timeline complete: ${Math.round(result.durationMs / 1000)}s`);
    } catch (err) {
      runError = err;
    } finally {
      const stopped = await page.evaluate(() => window.CCTrailer.stopCapture());
      if (stopped.inline && stopped.inline.length) {
        for (const base64 of stopped.inline) {
          fs.appendFileSync(rawPath, Buffer.from(base64, 'base64'));
        }
      }
    }

    const state = await page.evaluate(() => window.CCTrailer.getState());
    console.log(`Final state: ${state.activeKey} at ${state.pos ? `${state.pos.x.toFixed(0)}, ${state.pos.z.toFixed(0)}` : 'unknown'}`);

    if (runError) throw runError;

    const rawBytes = fs.statSync(rawPath).size;
    if (!rawBytes) throw new Error('MediaRecorder produced an empty video');
    console.log(`Raw WebM: ${(rawBytes / 1048576).toFixed(1)} MiB`);

    const musicAvailable = !opts.noMusic && fs.existsSync(opts.music);
    if (!opts.noMusic && !musicAvailable) {
      console.warn(`Music not found (${opts.music}); keeping silent WebM.`);
    }

    if (musicAvailable) {
      const duration = 44 * opts.units;
      const fadeOut = Math.min(2, Math.max(0.5, duration / 6));
      const filter = `atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`;
      fs.mkdirSync(path.dirname(opts.out), { recursive: true });
      await execFileAsync(require('ffmpeg-static'), [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', rawPath,
        '-i', opts.music,
        '-filter_complex', `[1:a]${filter}[a]`,
        '-map', '0:v:0', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest', opts.out
      ], { maxBuffer: 8 * 1024 * 1024 });
      if (!opts.keepRaw) fs.rmSync(rawPath, { force: true });
    } else if (path.extname(opts.out).toLowerCase() !== '.webm') {
      fs.mkdirSync(path.dirname(opts.out), { recursive: true });
      await execFileAsync(require('ffmpeg-static'), [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', rawPath,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-an', opts.out
      ], { maxBuffer: 8 * 1024 * 1024 });
      if (!opts.keepRaw) fs.rmSync(rawPath, { force: true });
    } else {
      fs.copyFileSync(rawPath, opts.out);
      if (!opts.keepRaw) fs.rmSync(rawPath, { force: true });
    }

    const outBytes = fs.statSync(opts.out).size;
    console.log(`Trailer: ${opts.out} (${(outBytes / 1048576).toFixed(1)} MiB)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Trailer failed: ${err.stack || err.message || err}`);
  process.exitCode = 1;
});
