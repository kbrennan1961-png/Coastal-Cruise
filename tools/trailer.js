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

function scale(flag, fallback) {
  const match = /^(\d+)[xX](\d+)$/.exec(value(flag, ''));
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function readShotsFile(file) {
  const abs = resolvePath(file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read shots file ${abs}: ${err.message}`);
  }
  const list = Array.isArray(parsed) ? parsed
    : (parsed && Array.isArray(parsed.shots) ? parsed.shots : null);
  if (!list || !list.length) {
    throw new Error(`Shots file ${abs} must contain a non-empty array or {shots: [...]}`);
  }
  return list.map((shot, i) => {
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) {
      throw new Error(`Shot ${i + 1} in ${abs} must be an object`);
    }
    return shot;
  });
}

function clipName(name, index) {
  const base = String(name || 'shot')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'shot';
  return `${String(index + 1).padStart(2, '0')}-${base}`;
}

function shotAudioPath(audio, shotsFile) {
  if (!audio) return null;
  const fromCwd = resolvePath(audio);
  if (fs.existsSync(fromCwd)) return fromCwd;
  if (shotsFile && !path.isAbsolute(audio)) {
    const fromFile = path.resolve(path.dirname(resolvePath(shotsFile)), audio);
    if (fs.existsSync(fromFile)) return fromFile;
  }
  return fromCwd;
}

async function encodeFrames(frameDir, frames, audio, out, opts) {
  const ffmpeg = require('ffmpeg-static');
  const scaleArgs = opts.scale ? ['-vf', `scale=${opts.scale}:flags=lanczos`] : [];
  const inputPattern = path.join(frameDir, 'frame-%06d.jpg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (audio) {
    const duration = frames / opts.fps;
    const fadeOut = Math.min(2, Math.max(0.5, duration / 6));
    const filter = `atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`;
    await execFileAsync(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(opts.fps), '-i', inputPattern,
      '-i', audio,
      '-filter_complex', `[1:a]${filter}[a]`,
      '-map', '0:v:0', '-map', '[a]',
      ...scaleArgs,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest', '-movflags', '+faststart', out
    ], { maxBuffer: 8 * 1024 * 1024 });
  } else if (path.extname(out).toLowerCase() === '.webm') {
    await execFileAsync(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(opts.fps), '-i', inputPattern,
      ...scaleArgs,
      '-c:v', 'libvpx-vp9', '-b:v', String(opts.bitrate), '-pix_fmt', 'yuv420p',
      '-an', out
    ], { maxBuffer: 8 * 1024 * 1024 });
  } else {
    await execFileAsync(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(opts.fps), '-i', inputPattern,
      ...scaleArgs,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-an', '-movflags', '+faststart', out
    ], { maxBuffer: 8 * 1024 * 1024 });
  }
}

function help() {
  console.log(`Coastal Cruise trailer harness

Usage:
  npm run trailer -- [options]

Options:
  --url URL          Game URL (default: local file:// index.html)
  --out FILE         Output video (default: capture/coastal-cruise-trailer.mp4)
  --shots FILE       Shots JSON (array or {shots:[...]}); render one clip per shot
                     into capture/clips/<NN-name>.mp4 (shot.audio overrides music)
  --music FILE       Music to mux (default: media/base_211.m4a)
  --no-music         Keep the silent WebM canvas capture only
  --width N          Viewport width (default: 1280)
  --height N         Viewport height (default: 720)
  --fps N            Capture frame rate (default: 60)
  --bitrate N        WebM video bitrate (default: 8000000)
  --units N          Timeline scale; 0.1 is useful for smoke tests
  --keep-raw         Keep intermediate frames/WebM after encoding
  --scale WxH        Resize output video, e.g. 1920x1080
  --chromium PATH     Use a specific Chromium binary (or set CC_CHROMIUM_PATH)
  --debug            Print browser console messages
  --help             Show this text

Examples:
  npm run trailer
  npm run trailer -- --url http://192.168.0.77/ --music audio/playback-fm.mp3
  npm run trailer -- --no-music --out capture/test.webm --units 0.1
  npm run trailer -- --shots tools/shots.json --units 0.1
`);
}

async function main() {
  if (has('--help')) { help(); return; }

  const shotsFile = has('--shots') ? value('--shots', null) : null;
  if (has('--shots') && !shotsFile) throw new Error('--shots requires a JSON file path');
  const opts = {
    url: value('--url', DEFAULT_URL),
    out: resolvePath(value('--out', path.join(ROOT, 'capture', 'coastal-cruise-trailer.mp4'))),
    shotsFile: shotsFile,
    shots: shotsFile ? readShotsFile(shotsFile) : null,
    music: resolvePath(value('--music', DEFAULT_MUSIC)),
    noMusic: has('--no-music'),
    width: number('--width', 1280),
    height: number('--height', 720),
    fps: number('--fps', 60),
    bitrate: number('--bitrate', 8000000),
    units: number('--units', 1),
    keepRaw: has('--keep-raw'),
    scale: scale('--scale', null),
    chromium: process.env.CC_CHROMIUM_PATH || value('--chromium', null),
    debug: has('--debug')
  };

  const captureDir = path.join(ROOT, 'capture');
  fs.mkdirSync(captureDir, { recursive: true });
  const rawPath = opts.shots ? null : path.join(captureDir, `coastal-cruise-raw-${Date.now()}.webm`);
  if (rawPath) fs.writeFileSync(rawPath, Buffer.alloc(0));
  let frameDir = null;
  if (!opts.shots) {
    frameDir = path.join(captureDir, `frames-${Date.now()}`);
    fs.mkdirSync(frameDir, { recursive: true });
  }
  let frameCount = 0;

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
      if (!rawPath) return;
      fs.appendFileSync(rawPath, Buffer.from(base64, 'base64'));
    });
    await context.exposeBinding('__ccTrailerFrame', async (_source, base64) => {
      if (!frameDir) return;
      const file = path.join(frameDir, `frame-${String(frameCount++).padStart(6, '0')}.jpg`);
      await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));
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

    async function startCapture() {
      return page.evaluate((options) => window.CCTrailer.startCapture(options), {
        fps: opts.fps,
        bitrate: opts.bitrate,
        width: opts.width,
        height: opts.height,
        manual: true
      });
    }
    async function stopCapture() {
      const stopped = await page.evaluate(() => window.CCTrailer.stopCapture());
      if (rawPath && stopped.inline && stopped.inline.length) {
        for (const base64 of stopped.inline) {
          fs.appendFileSync(rawPath, Buffer.from(base64, 'base64'));
        }
      }
      return stopped;
    }
    async function logState() {
      const state = await page.evaluate(() => window.CCTrailer.getState());
      console.log(`Final state: ${state.activeKey} at ${state.pos ? `${state.pos.x.toFixed(0)}, ${state.pos.z.toFixed(0)}` : 'unknown'}`);
    }

    if (opts.shots) {
      const clipsDir = path.join(captureDir, 'clips');
      fs.mkdirSync(clipsDir, { recursive: true });
      console.log(`Rendering ${opts.shots.length} shot clip(s) -> ${clipsDir}`);
      for (let i = 0; i < opts.shots.length; i++) {
        const shot = opts.shots[i];
        const label = clipName(shot.name, i);
        frameDir = path.join(captureDir, `frames-${label}-${Date.now()}`);
        fs.mkdirSync(frameDir, { recursive: true });
        frameCount = 0;
        console.log(`Shot ${i + 1}/${opts.shots.length}: ${label} (${shot.vehicle || '?'} / ${shot.mode || '?'})`);
        const info = await startCapture();
        console.log(`  capture: ${info.mode || 'recorder'}`);
        let runError = null;
        let stopped = null;
        let result = null;
        try {
          result = await page.evaluate((args) => window.CCTrailer.runShot(args.shot, { units: args.units }), {
            shot: shot,
            units: opts.units
          });
        } catch (err) {
          runError = err;
        } finally {
          stopped = await stopCapture();
        }
        if (runError) throw runError;
        const frames = stopped && stopped.mode === 'frames' ? (stopped.frames || frameCount) : 0;
        if (!frames) throw new Error(`No deterministic frames were captured for shot ${label}`);
        console.log(`  ${frames} frames (${(frames / opts.fps).toFixed(1)}s, timeline ${Math.round((result.durationMs || 0) / 1000)}s)`);
        const out = path.join(clipsDir, `${label}.mp4`);
        const requestedAudio = shot.audio ? shotAudioPath(shot.audio, opts.shotsFile) : null;
        const audio = requestedAudio && fs.existsSync(requestedAudio) ? requestedAudio : null;
        if (requestedAudio && !audio) console.warn(`  Audio not found (${requestedAudio}); keeping clip silent.`);
        await encodeFrames(frameDir, frames, audio, out, opts);
        if (!opts.keepRaw) fs.rmSync(frameDir, { recursive: true, force: true });
        frameDir = null;
        const outBytes = fs.statSync(out).size;
        console.log(`  -> ${out} (${(outBytes / 1048576).toFixed(1)} MiB)`);
      }
      await logState();
    } else {
      const captureInfo = await startCapture();
      console.log(`Capture mode: ${captureInfo.mode || 'recorder'} (${captureInfo.mime})`);

      let runError = null;
      let stopped = null;
      try {
        const result = await page.evaluate((units) => window.CCTrailer.run({ units }), opts.units);
        console.log(`Timeline complete: ${Math.round(result.durationMs / 1000)}s`);
      } catch (err) {
        runError = err;
      } finally {
        stopped = await stopCapture();
      }

      await logState();

      if (runError) throw runError;

      const manualFrames = !!(stopped && stopped.mode === 'frames');
      const frames = manualFrames ? (stopped.frames || frameCount) : 0;
      if (manualFrames) {
        if (!frames) throw new Error('No deterministic frames were captured');
        console.log(`Captured ${frames} frames at ${opts.fps} fps (${(frames / opts.fps).toFixed(1)}s)`);
      } else {
        const rawBytes = fs.statSync(rawPath).size;
        if (!rawBytes) throw new Error('MediaRecorder produced an empty video');
        console.log(`Raw WebM: ${(rawBytes / 1048576).toFixed(1)} MiB`);
      }

      const musicAvailable = !opts.noMusic && fs.existsSync(opts.music);
      if (!opts.noMusic && !musicAvailable) {
        console.warn(`Music not found (${opts.music}); keeping silent video.`);
      }

      const ffmpeg = require('ffmpeg-static');
      const scaleArgs = opts.scale ? ['-vf', `scale=${opts.scale}:flags=lanczos`] : [];
      fs.mkdirSync(path.dirname(opts.out), { recursive: true });

      if (manualFrames) {
        await encodeFrames(frameDir, frames, musicAvailable ? opts.music : null, opts.out, opts);
        if (!opts.keepRaw) {
          fs.rmSync(frameDir, { recursive: true, force: true });
          fs.rmSync(rawPath, { force: true });
        }
      } else if (musicAvailable) {
        const duration = 44 * opts.units;
        const fadeOut = Math.min(2, Math.max(0.5, duration / 6));
        const filter = `atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`;
        await execFileAsync(ffmpeg, [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', rawPath,
          '-i', opts.music,
          '-filter_complex', `[1:a]${filter}[a]`,
          '-map', '0:v:0', '-map', '[a]',
          ...scaleArgs,
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k',
          '-shortest', opts.out
        ], { maxBuffer: 8 * 1024 * 1024 });
        if (!opts.keepRaw) fs.rmSync(rawPath, { force: true });
      } else if (path.extname(opts.out).toLowerCase() !== '.webm') {
        await execFileAsync(ffmpeg, [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', rawPath,
          ...scaleArgs,
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
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`Trailer failed: ${err.stack || err.message || err}`);
  process.exitCode = 1;
});
