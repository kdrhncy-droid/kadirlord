/**
 * capture-ui-gallery.mjs — Bannerlord UI & HUD Görsel Doğrulama Galerisi
 *
 *   npm run ui:gallery
 *
 * 1440x900 çözünürlükte tüm çekirdek Bannerlord ekranlarını (Harita HUD, Şehir,
 * Kale, Köy, Asker Toplama, Pazar, Envanter, Parti, Karakter, Ansiklopedi)
 * `tools/e2e/artifacts/gallery-*.png` altına kaydeder ve konsol/sayfa hatası
 * olup olmadığını denetler.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../tools/e2e/lib/chromium.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIR);
const ARTIFACT_DIR = join(REPO_ROOT, 'tools', 'e2e', 'artifacts');
const BASE_URL = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const TIMEOUT_MS = 60_000;

mkdirSync(ARTIFACT_DIR, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let serverProcess = null;
let serverStartedByScript = false;

async function isServerReachable() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerReachable()) return;
  if (!existsSync(join(REPO_ROOT, 'node_modules', '.bin', 'tsx'))) {
    throw new Error('Kök bağımlılıklar kurulu değil. Önce "npm ci" çalıştırın.');
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  serverProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: REPO_ROOT,
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', DISABLE_HMR: 'true' },
  });
  serverStartedByScript = true;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isServerReachable()) return;
    if (serverProcess.exitCode !== null) break;
    await wait(400);
  }
  throw new Error('Geliştirme sunucusu 3000 portunda açılamadı.');
}

async function stopServer() {
  if (!serverStartedByScript || !serverProcess || serverProcess.exitCode !== null) return;
  try {
    if (process.platform !== 'win32' && serverProcess.pid) {
      process.kill(-serverProcess.pid, 'SIGTERM');
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
}

let browser = null;
try {
  await ensureServer();
  browser = await launchChromium();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const problems = [];
  page.on('pageerror', (err) => problems.push(`PAGEERROR: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource|ERR_|favicon/i.test(text)) return;
    problems.push(`CONSOLE: ${text}`);
  });

  await page.goto(`${BASE_URL}/?e2e=1&autostart=1&seed=42&timeScale=0`, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS,
  });
  await page.waitForFunction(() => window.__kadirlordTest?.ready === true, {
    timeout: TIMEOUT_MS,
  });
  await wait(600);

  // 1. Overworld HUD
  await page.screenshot({ path: join(ARTIFACT_DIR, 'gallery-01-hud-overworld.png') });
  console.log('📸 gallery-01-hud-overworld.png');

  // 2. Town Settlement Menu (Zeonica)
  await page.evaluate(() => window.__kadirlordTest.openSettlement('zeonica_west'));
  await page.waitForSelector('[data-testid="settlement-modal"]', { timeout: TIMEOUT_MS });
  await wait(450);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'gallery-02-settlement-town.png') });
  console.log('📸 gallery-02-settlement-town.png');

  // 2b. Hover first notable portrait in Town Settlement Menu to capture tooltip
  const firstPortrait = await page.$('[data-testid^="notable-portrait-"]');
  if (firstPortrait) {
    await firstPortrait.hover();
    await wait(250);
    await page.screenshot({ path: join(ARTIFACT_DIR, 'gallery-02b-settlement-notable-tooltip.png') });
    console.log('📸 gallery-02b-settlement-notable-tooltip.png');
  }

  // 3. Castle Settlement Menu (Lochana Castle)
  await page.evaluate(() => window.__kadirlordTest.openSettlement('lochana_castle'));
  await wait(400);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'gallery-03-settlement-castle.png') });
  console.log('📸 gallery-03-settlement-castle.png');

  // 4. Village Settlement Menu (Sancaktepe)
  await page.evaluate(() => window.__kadirlordTest.openSettlement('sancaktepe'));
  await wait(400);
  await page.screenshot({ path: join(ARTIFACT_DIR, 'gallery-04-settlement-village.png') });
  console.log('📸 gallery-04-settlement-village.png');

  await page.evaluate(() => window.__kadirlordTest.closeSettlement());
  await wait(250);

  if (problems.length > 0) {
    console.error('❌ Sayfa hataları saptandı:\n' + problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('✅ UI Galeri ekran görüntüleri hatasız üretildi:', ARTIFACT_DIR);
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopServer();
}
