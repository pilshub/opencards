#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const promptsPath = path.join(repoRoot, 'scripts', 'card-art-prompts.json');
const envPath = path.join(repoRoot, '.env');
const artDir = path.join(repoRoot, 'packages', 'app', 'public', 'art');
const publicManifestPath = path.join(artDir, 'manifest.json');
const sourceManifestPath = path.join(repoRoot, 'packages', 'app', 'src', 'art-manifest.ts');
const force = process.argv.includes('--force');

await loadApiKey();
const apiKey = process.env.RUNWARE_API_KEY;
if (!apiKey) {
  console.error('RUNWARE_API_KEY is required');
  process.exit(1);
}

const prompts = JSON.parse(await readFile(promptsPath, 'utf8'));
const style = prompts._style;
const subjects = prompts.subjects;
if (typeof style !== 'string' || !subjects || typeof subjects !== 'object') {
  console.error('Invalid card art prompts file');
  process.exit(1);
}

await mkdir(artDir, { recursive: true });
const kinds = Object.keys(subjects)
  .filter((kind) => !kind.startsWith('_'))
  .sort();
const status = new Map();
let sharpTransform = null;
try {
  const sharpModule = await import('sharp');
  sharpTransform = sharpModule.default;
} catch {
  console.log('[art] sharp unavailable; writing original 1152x896 WebP files without downscaling.');
}

async function generate(kind) {
  const outputPath = path.join(artDir, `${kind}.webp`);
  if (!force && (await exists(outputPath))) {
    status.set(kind, 'skipped');
    console.log(`${kind}: skipped`);
    return;
  }

  const positivePrompt = `${style} Subject: ${subjects[kind]}.`;
  const task = {
    taskType: 'imageInference',
    taskUUID: randomUUID(),
    model: 'google:4@1',
    positivePrompt,
    width: 1152,
    height: 896,
    numberResults: 1,
    outputType: 'URL',
    outputFormat: 'WEBP',
  };

  try {
    const response = await fetch('https://api.runware.ai/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify([task]),
    });
    const payload = await response.json();
    const result = payload?.data?.[0];
    if (!response.ok || !result?.imageURL) {
      const apiError = payload?.errors?.[0];
      const detail = apiError?.message ? `: ${String(apiError.message)}` : '';
      throw new Error(`Runware request failed${detail}`);
    }

    const imageResponse = await fetch(result.imageURL);
    if (!imageResponse.ok) {
      throw new Error(`image download failed with HTTP ${String(imageResponse.status)}`);
    }
    const original = Buffer.from(await imageResponse.arrayBuffer());
    const output = sharpTransform
      ? await sharpTransform(original).resize({ width: 576 }).webp({ quality: 80 }).toBuffer()
      : original;
    await writeFile(outputPath, output);
    status.set(kind, 'generated');
    console.log(`${kind}: generated`);
  } catch (error) {
    status.set(kind, 'failed');
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`${kind}: failed (${message})`);
  }
}

let nextIndex = 0;
async function worker() {
  while (nextIndex < kinds.length) {
    const index = nextIndex;
    nextIndex += 1;
    await generate(kinds[index]);
  }
}
await Promise.all([worker(), worker(), worker()]);

const artKinds = [];
for (const kind of kinds) {
  if (await exists(path.join(artDir, `${kind}.webp`))) artKinds.push(kind);
}
const manifest = `${JSON.stringify(artKinds, null, 2)}\n`;
await writeFile(publicManifestPath, manifest, 'utf8');
const sourceManifest = `export default [\n${artKinds.map((kind) => `  '${kind}',`).join('\n')}\n] as const;\n`;
await writeFile(sourceManifestPath, sourceManifest, 'utf8');

const tally = ['generated', 'skipped', 'failed'].map(
  (name) => `${name}=${String([...status.values()].filter((value) => value === name).length)}`,
);
console.log(`art tally: ${tally.join(' ')}`);
if (status.get('failed') !== undefined || [...status.values()].includes('failed'))
  process.exitCode = 1;

async function loadApiKey() {
  let envText;
  try {
    envText = await readFile(envPath, 'utf8');
  } catch {
    return '';
  }
  for (const line of envText.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim();
    if (name !== 'RUNWARE_API_KEY') continue;
    process.env.RUNWARE_API_KEY = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    return;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
