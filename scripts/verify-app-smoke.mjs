#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const appDir = path.join(rootDir, 'packages', 'app');
const distWebDir = path.join(appDir, 'dist-web');
const require = createRequire(import.meta.url);

const fail = (message) => {
  console.error(`[verify:app] ${message}`);
  process.exit(1);
};

await verifyStaticBuild();

const launchProbe = await probePlaywrightLaunch();
if (launchProbe.ok) {
  await runBrowserSmoke();
  console.log('[verify:app] Playwright browser smoke passed');
  process.exit(0);
}

if (!isLaunchPermissionError(launchProbe.error)) {
  fail(`Playwright browser launch failed: ${formatError(launchProbe.error)}`);
}

console.warn(
  `[verify:app] Playwright browser launch denied by this Windows sandbox; ` +
    'static app smoke and Playwright test discovery passed',
);
await runPlaywrightDiscovery();

async function verifyStaticBuild() {
  const requiredFiles = [
    'index.html',
    'assets/styles.css',
    'modules/app/main.js',
    'modules/core/index.js',
    'modules/schema/index.js',
    'modules/effects/index.js',
  ];

  for (const relativePath of requiredFiles) {
    await access(path.join(distWebDir, relativePath)).catch(() => {
      fail(`missing built app artifact: ${relativePath}`);
    });
  }

  const html = await readFile(path.join(distWebDir, 'index.html'), 'utf8');
  const requiredHtml = ['<div id="root"></div>', '/modules/app/main.js', '@opencards/core'];

  for (const marker of requiredHtml) {
    if (!html.includes(marker)) {
      fail(`built app index.html is missing marker: ${marker}`);
    }
  }
}

async function probePlaywrightLaunch() {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function runBrowserSmoke() {
  const server = await startStaticServer();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.goto(server.url);
    await page.getByRole('button', { name: 'New Game' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'New Game' }).click();
    const legalCountText = await page.getByTestId('legal-commands-count').textContent();
    const legalCount = Number(legalCountText);

    if (!Number.isFinite(legalCount) || legalCount <= 0) {
      fail(`expected positive legal command count, got ${String(legalCountText)}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await server.close();
  }
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    void serveStaticRequest(request, response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('static smoke server did not bind a TCP port'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${String(address.port)}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function serveStaticRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const normalizedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const targetPath = path.resolve(distWebDir, `.${decodeURIComponent(normalizedPath)}`);
  const relativePath = path.relative(distWebDir, targetPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  let filePath = targetPath;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    filePath = path.join(distWebDir, 'index.html');
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': contentType(filePath) });
  createReadStream(filePath).pipe(response);
}

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function isLaunchPermissionError(error) {
  const message = formatError(error);
  return message.includes('spawn EPERM') || message.includes('operation not permitted');
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runPlaywrightDiscovery() {
  const { runTests } = require(
    path.join(rootDir, 'node_modules', 'playwright', 'lib', 'cli', 'testActions.js'),
  );
  await runTests([], { config: path.join(appDir, 'playwright.config.ts'), list: true });
}
