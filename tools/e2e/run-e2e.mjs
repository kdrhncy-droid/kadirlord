/**
 * run-e2e.mjs — Kadirlord uçtan uca tarayıcı testleri
 *
 *   npm ci
 *   npm run setup:e2e
 *   npm run test:e2e
 *
 * Testler yalnız DEV sunucusunda açık olan `window.__kadirlordTest`
 * kancasını kullanır. Sunucu 3000'de yoksa bu script başlatır ve yalnız
 * kendi başlattığı süreci kapatır. Ekran görüntüleri ve hata çıktıları
 * `tools/e2e/artifacts/` altındadır (Git'e girmez).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/chromium.mjs';

const E2E_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(dirname(E2E_ROOT));
const ARTIFACT_DIR = join(E2E_ROOT, 'artifacts');
const BASE_URL = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 120_000);

mkdirSync(ARTIFACT_DIR, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/* ───────────────────── geliştirme sunucusu ───────────────────── */

let serverProcess = null;
let serverStartedByRunner = false;
let serverOutput = '';

async function isServerReachable() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerReachable()) {
    console.log(`ℹ️  Mevcut sunucu kullanılıyor: ${BASE_URL}`);
    return;
  }

  if (!existsSync(join(REPO_ROOT, 'node_modules', '.bin', 'tsx'))) {
    throw new Error('Kök bağımlılıklar kurulu değil. Önce repo kökünde "npm ci" çalıştırın.');
  }

  console.log(`ℹ️  Geliştirme sunucusu başlatılıyor: ${BASE_URL}`);
  serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: REPO_ROOT,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DISABLE_HMR: 'true',
    },
  });
  serverStartedByRunner = true;

  const collect = (chunk) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-12_000);
  };
  serverProcess.stdout?.on('data', collect);
  serverProcess.stderr?.on('data', collect);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isServerReachable()) return;
    if (serverProcess.exitCode !== null) break;
    await wait(500);
  }
  throw new Error(`Sunucu zamanında açılamadı.\n--- sunucu çıktısı ---\n${serverOutput}`);
}

async function stopServer() {
  if (!serverStartedByRunner || !serverProcess || serverProcess.exitCode !== null) return;

  const exited = new Promise((resolve) => serverProcess.once('exit', resolve));
  try {
    if (process.platform !== 'win32' && serverProcess.pid) {
      process.kill(-serverProcess.pid, 'SIGTERM');
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch {
    serverProcess.kill('SIGTERM');
  }

  await Promise.race([exited, wait(5_000)]);
  if (serverProcess.exitCode === null) {
    try {
      if (process.platform !== 'win32' && serverProcess.pid) {
        process.kill(-serverProcess.pid, 'SIGKILL');
      } else {
        serverProcess.kill('SIGKILL');
      }
    } catch {
      /* süreç zaten kapanmış olabilir */
    }
  }
}

/* ───────────────────── sayfa yardımcıları ───────────────────── */

function attachPageProblems(page) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`PAGEERROR: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Sandbox'ta dış font/servis istekleri ağ kısıtı nedeniyle düşebilir;
    // uygulama kodu hataları ile kaynak yükleme gürültüsünü ayırıyoruz.
    if (/Failed to load resource|ERR_|favicon/i.test(text)) return;
    problems.push(`CONSOLE: ${text}`);
  });
  return problems;
}

function assertNoPageProblems(problems, label) {
  assert(problems.length === 0, `${label}: sayfa hataları var:\n${problems.join('\n')}`);
}

async function openPage(browser, query) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.setDefaultTimeout(TIMEOUT_MS);
  page.setDefaultNavigationTimeout(TIMEOUT_MS);
  const problems = attachPageProblems(page);

  const params = new URLSearchParams({
    e2e: '1',
    autostart: '1',
    seed: '42',
    ...query,
  });
  await page.goto(`${BASE_URL}/?${params}`, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => window.__kadirlordTest?.ready === true,
    { timeout: TIMEOUT_MS },
  );
  return { page, problems };
}

const getTestState = (page) => page.evaluate(() => window.__kadirlordTest.getState());

async function screenshot(page, name) {
  await page.screenshot({
    path: join(ARTIFACT_DIR, name),
    timeout: 30_000,
  });
}

/* ───────────────────── testler ───────────────────── */

const results = [];
let activePage = null;

async function runTest(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
    if (activePage) {
      try {
        await screenshot(activePage, `failure-${name}.png`);
      } catch {
        /* hata görüntüsü ikincildir */
      }
    }
  } finally {
    if (activePage) {
      try {
        await activePage.close();
      } catch {
        /* sayfa zaten kapalı olabilir */
      }
      activePage = null;
    }
  }
}

let browser = null;
let exitCode = 0;

try {
  await ensureServer();
  browser = await launchChromium();
  console.log(`ℹ️  Tarayıcı: ${await browser.version()}`);

  await runTest('boot-webgl', async () => {
    const { page, problems } = await openPage(browser, {
      scenario: 'boot',
      timeScale: '0',
    });
    activePage = page;

    await page.waitForSelector('[data-testid="world-canvas-container"] canvas', {
      timeout: TIMEOUT_MS,
    });
    const state = await getTestState(page);
    assert(state.gameState === 'playing', `oyun playing değil: ${state.gameState}`);
    assert(state.subMode === 'overworld', `başlangıç modu overworld değil: ${state.subMode}`);
    assert(state.counts.lords === 40, `40 lord bekleniyor, gelen: ${state.counts.lords}`);
    assert(
      state.counts.settlements === 211,
      `211 yerleşim bekleniyor, gelen: ${state.counts.settlements}`,
    );

    const webgl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!context) return null;
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      const parameter = debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER;
      return String(context.getParameter(parameter));
    });
    assert(webgl, 'WebGL bağlamı oluşturulamadı');
    console.log(`   WebGL: ${webgl}`);

    await screenshot(page, 'boot.png');
    assertNoPageProblems(problems, 'boot-webgl');
  });

  await runTest('encyclopedia-heroes', async () => {
    const { page, problems } = await openPage(browser, {
      scenario: 'boot',
      timeScale: '0',
    });
    activePage = page;

    await page.evaluate(() => window.__kadirlordTest.openEncyclopedia());
    await page.waitForSelector(
      '[data-testid="encyclopedia-modal"][data-encyclopedia-section="HOME"]',
      { timeout: TIMEOUT_MS },
    );
    await page.click('[data-testid="encyclopedia-section-heroes"]');
    await page.waitForSelector(
      '[data-testid="encyclopedia-modal"][data-encyclopedia-section="HEROES"]',
      { timeout: TIMEOUT_MS },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="encyclopedia-hero-row"]').length === 40,
      { timeout: TIMEOUT_MS },
    );

    const portraits = await page.waitForFunction(
      () => {
        const list = document.querySelector('[data-testid="encyclopedia-hero-list"]');
        if (!list) return false;
        const images = [...list.querySelectorAll('[data-testid="encyclopedia-hero-portrait"]')];
        const ready = images.filter((img) => img.complete && img.naturalWidth > 0);
        const uniqueHeroes = new Set(images.map((img) => img.dataset.heroId));
        return images.length === 40 && ready.length === images.length && uniqueHeroes.size === 40
          ? {
              total: images.length,
              ready: ready.length,
              uniqueHeroes: uniqueHeroes.size,
              size: `${images[0].naturalWidth}x${images[0].naturalHeight}`,
            }
          : false;
      },
      { timeout: TIMEOUT_MS },
    );
    const stats = await portraits.jsonValue();
    console.log(
      `   Portreler: ${stats.ready}/${stats.total} hazır, ${stats.uniqueHeroes} benzersiz kahraman, ${stats.size}`,
    );

    const state = await getTestState(page);
    assert(state.encyclopediaOpen, 'test durumu ansiklopediyi açık göstermiyor');
    await screenshot(page, 'encyclopedia-heroes.png');
    assertNoPageProblems(problems, 'encyclopedia-heroes');
  });

  await runTest('forced-encounter', async () => {
    const { page, problems } = await openPage(browser, {
      scenario: 'bandit-caught-player',
      timeScale: '0',
    });
    activePage = page;

    await page.waitForSelector('[data-testid="dialogue-modal"]', { timeout: TIMEOUT_MS });
    await page.waitForSelector('[data-testid="forced-encounter-badge"]', {
      timeout: TIMEOUT_MS,
    });
    await page.waitForSelector('[data-testid="conversation-canvas"] canvas', {
      timeout: TIMEOUT_MS,
    });

    const state = await getTestState(page);
    assert(state.dialogue.forced, 'senaryo zorunlu karşılaşma olarak işaretlenmemiş');
    assert(
      state.dialogue.scenario === 'BANDIT_CAUGHT_PLAYER',
      `yanlış senaryo: ${state.dialogue.scenario}`,
    );
    assert(state.dialogue.lordId === 'lord-kargi', `yanlış muhatap: ${state.dialogue.lordId}`);
    assert(state.player.troops === 6, `zayıf oyuncu ordusu 6 olmalı: ${state.player.troops}`);

    const closeButtons = await page.$$('[aria-label="Diyaloğu kapat"]');
    assert(closeButtons.length === 0, 'zorunlu karşılaşmada kapatma düğmesi görünüyor');

    await screenshot(page, 'forced-encounter.png');

    await page.keyboard.press('Escape');
    await wait(500);
    const stillOpen = await page.$('[data-testid="dialogue-modal"]');
    assert(stillOpen, 'Esc zorunlu karşılaşmayı kapattı');

    await page.click('[data-testid="dialogue-option-bandit-fight"]');
    await page.waitForSelector('[data-testid="dialogue-option-enc-attack"]', {
      timeout: TIMEOUT_MS,
    });
    for (const option of ['enc-autoresolve', 'enc-escape', 'enc-surrender']) {
      const element = await page.$(`[data-testid="dialogue-option-${option}"]`);
      assert(element, `karşılaşma menüsünde seçenek eksik: ${option}`);
    }

    await screenshot(page, 'forced-encounter-menu.png');
    assertNoPageProblems(problems, 'forced-encounter');
  });

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${failed.length === 0 ? '✅' : '❌'} E2E: ${results.length - failed.length}/${results.length} başarılı`);
  console.log(`📸 Çıktılar: ${ARTIFACT_DIR}`);
  if (failed.length > 0) exitCode = 1;
} catch (error) {
  exitCode = 1;
  console.error(`❌ E2E çalıştırılamadı: ${error instanceof Error ? error.stack ?? error.message : error}`);
} finally {
  if (browser) {
    await Promise.race([browser.close().catch(() => {}), wait(10_000)]);
  }
  await stopServer();
  process.exit(exitCode);
}
