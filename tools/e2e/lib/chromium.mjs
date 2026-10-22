/**
 * chromium.mjs — sandbox/CI uyumlu başsız Chromium başlatıcı
 *
 * Neden `@sparticuz/chromium`?
 *   Arena sandbox'ında Debian depolarına ve Playwright/Puppeteer tarayıcı
 *   CDN'lerine erişim yok; yalnız npm erişilebilir. Bu paket Chromium'u npm
 *   tarball'ı içinde taşır. Paketteki AL2023 arşivi ayrıca Chromium'un ihtiyaç
 *   duyduğu `libnspr4/libnss3` dosyalarını içerir; onları bir kez
 *   `tools/e2e/.cache/chromium-libs` altına açıp `LD_LIBRARY_PATH`e ekleriz.
 *
 * Kendi Chrome/Chromium'unuzu kullanmak isterseniz:
 *   E2E_CHROME_PATH=/usr/bin/chromium npm run test:e2e
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const E2E_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = join(E2E_ROOT, '.cache', 'chromium-libs');
const LIB_DIR = join(CACHE_DIR, 'lib');

function ensureBundledLinuxLibraries() {
  const marker = join(LIB_DIR, 'libnspr4.so');
  if (!existsSync(marker)) {
    const archive = join(
      E2E_ROOT,
      'node_modules',
      '@sparticuz',
      'chromium',
      'bin',
      'al2023.tar.br',
    );
    if (!existsSync(archive)) {
      throw new Error(
        `Chromium kütüphane arşivi bulunamadı: ${archive}. Önce kökten "npm run setup:e2e" çalıştırın.`,
      );
    }

    mkdirSync(CACHE_DIR, { recursive: true });
    const tarPath = join(CACHE_DIR, 'al2023.tar');
    writeFileSync(tarPath, brotliDecompressSync(readFileSync(archive)));

    const result = spawnSync('tar', ['-xf', tarPath, '-C', CACHE_DIR], {
      encoding: 'utf8',
    });
    if (result.status !== 0 || !existsSync(marker)) {
      throw new Error(
        `Chromium NSS/NSPR kütüphaneleri açılamadı.\n${result.stderr || result.stdout || ''}`,
      );
    }
  }

  const entries = [LIB_DIR, '/tmp', process.env.LD_LIBRARY_PATH].filter(Boolean);
  process.env.LD_LIBRARY_PATH = [...new Set(entries.join(':').split(':'))]
    .filter(Boolean)
    .join(':');
  return LIB_DIR;
}

export async function launchChromium({ headless = true } = {}) {
  const externalPath = process.env.E2E_CHROME_PATH;
  if (externalPath) {
    return puppeteer.launch({
      executablePath: externalPath,
      headless,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--window-size=1440,900',
      ],
    });
  }

  if (process.platform !== 'linux') {
    throw new Error(
      'Paketli @sparticuz/chromium yalnız Linux içindir. Bu platformda E2E_CHROME_PATH ile sistem Chrome/Chromium yolunu verin.',
    );
  }

  ensureBundledLinuxLibraries();
  const executablePath = await chromium.executablePath();

  return puppeteer.launch({
    executablePath,
    headless,
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--window-size=1440,900',
    ],
  });
}

export async function probeChromium() {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const webgl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!context) return null;
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      const parameter = debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER;
      return String(context.getParameter(parameter));
    });
    return {
      version: await browser.version(),
      webgl,
      libraryPath: process.env.E2E_CHROME_PATH ? null : LIB_DIR,
    };
  } finally {
    await browser.close();
  }
}
