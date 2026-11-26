#!/usr/bin/env node
/* Turn a map-editor prompt job into a baked, offline Coastal Cruise model.

  node tools/blender-ai-asset.js generate <job.json> [--out result.json] \
    [--models js/CustomModels.js] [--height 12]

The job JSON is downloaded by the map editor's New Asset dialog. This helper
runs Blender 3.6 headless with tools/blender_prompt_asset.py, merges the baked
model into js/CustomModels.js, and writes a result JSON that can be imported
back into the open editor. No MCP add-on, network, or runtime fetch is needed.

Set BLENDER=/path/to/blender to override the default macOS location. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';

function fail(message) {
  console.error('blender-ai-asset: ' + message);
  process.exit(1);
}

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function ensureParent(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slug(value) {
  return String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'generated-asset';
}

function extractBraced(text, brace) {
  let depth = 0, inString = false, escaped = false;
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (!depth) return text.slice(brace, i + 1);
    }
  }
  throw new Error('unterminated object in CustomModels.js');
}

function loadExistingModels(file) {
  if (!fs.existsSync(file)) return { textures: {}, models: {} };
  const text = fs.readFileSync(file, 'utf8');
  const marker = 'CC.CustomModels = ';
  const start = text.indexOf(marker);
  if (start < 0) return { textures: {}, models: {} };
  const brace = text.indexOf('{', start);
  if (brace < 0) return { textures: {}, models: {} };
  const data = JSON.parse(extractBraced(text, brace));
  return {
    textures: data.textures || {},
    models: data.models || {}
  };
}

function usage() {
  console.log('Coastal Cruise Blender 3.6 prompt asset helper\n\n' +
    '  node tools/blender-ai-asset.js generate <job.json> [options]\n\n' +
    'Options:\n' +
    '  --out FILE       Result JSON imported by the map editor\n' +
    '  --models FILE    Baked model registry (default js/CustomModels.js)\n' +
    '  --height N       Override the prompt height in world units\n\n' +
    'Environment:\n' +
    '  BLENDER          Path to Blender (default macOS Blender.app)\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    usage();
    return;
  }
  if (argv[0] !== 'generate') fail('Unknown command: ' + argv[0]);
  argv.shift();
  const jobPath = argv.shift();
  if (!jobPath) fail('generate needs a downloaded job JSON file.');

  let outPath = null, modelsPath = path.join(ROOT, 'js', 'CustomModels.js'), height = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) outPath = argv[++i];
    else if (argv[i] === '--models' && argv[i + 1]) modelsPath = argv[++i];
    else if (argv[i] === '--height' && argv[i + 1]) height = Number(argv[++i]);
    else fail('Unknown option: ' + argv[i]);
  }

  const jobFile = abs(jobPath);
  if (!fs.existsSync(jobFile)) fail('Job file not found: ' + jobFile);
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  if (!job.prompt && !job.description) fail('Job has no detailed prompt.');
  const key = String(job.key || ('ai_' + slug(job.name || 'generated-asset')));
  job.key = key;
  if (Number.isFinite(height) && height > 0) job.height = height;

  const resultFile = abs(outPath || path.join(ROOT, 'capture', 'generated-' + slug(key) + '.json'));
  ensureParent(resultFile);
  ensureParent(modelsPath);

  const blenderJob = abs(path.join(ROOT, 'capture', '.' + slug(key) + '.blender-job.json'));
  ensureParent(blenderJob);
  fs.writeFileSync(blenderJob, JSON.stringify(job, null, 2));

  if (!fs.existsSync(BLENDER)) fail('Blender not found at ' + BLENDER + '. Set BLENDER=/path/to/blender.');
  const args = ['-b', '--python', path.join(ROOT, 'tools', 'blender_prompt_asset.py'),
    '--', blenderJob, resultFile];
  const run = spawnSync(BLENDER, args, { stdio: 'inherit', cwd: ROOT });
  if (run.error) fail(run.error.message);
  if (run.status !== 0) process.exit(run.status || 1);
  try { fs.unlinkSync(blenderJob); } catch (e) { /* best effort */ }

  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  const registry = loadExistingModels(abs(modelsPath));
  Object.keys(result.models || {}).forEach(function (modelKey) {
    registry.models[modelKey] = result.models[modelKey];
  });

  const body = '/* Generated by tools/blender-ai-asset.js - do not edit by hand. */\n' +
    '(function () {\n  \'use strict\';\n  const CC = window.CC = window.CC || {};\n' +
    '  CC.CustomModels = ' + JSON.stringify(registry, null, 2) + ';\n' +
    '  if (CC.GeneratedAssets) {\n' +
    '    Object.assign(CC.GeneratedAssets.textures, CC.CustomModels.textures || {});\n' +
    '    Object.assign(CC.GeneratedAssets.models, CC.CustomModels.models);\n' +
    '  }\n' +
    '})();\n';
  fs.writeFileSync(abs(modelsPath), body);

  console.log('\nSaved baked model registry: ' + abs(modelsPath));
  console.log('Saved editor import file:   ' + resultFile);
  console.log('Back in the map editor, open BLENDER 3.6 ROUND TRIP and import the result JSON.');
}

main();
