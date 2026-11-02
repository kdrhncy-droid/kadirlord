/**
 * test-150v150-fps.mjs
 * 150 vs 150 (300 Canlı Asker) Meydan Muharebesi FPS ve Performans Testi
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/chromium.mjs';

const E2E_ROOT = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://127.0.0.1:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('🚀 150 vs 150 Meydan Muharebesi FPS Testi Başlatılıyor...');

const browser = await launchChromium();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.setDefaultTimeout(120_000);

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// 1. Oyunu DEV E2E modunda aç
const params = new URLSearchParams({
  e2e: '1',
  autostart: '1',
  seed: '42',
  scenario: 'boot',
  timeScale: '0',
});
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 120_000 });
console.log('✓ Sefer motoru yüklendi.');

// 2. 3D Savaş Arenasına Geç
await page.evaluate(() => {
  window.__kadirlordTest.openArena();
});
await wait(1500);

// 3. Ordu Savaşı (MASS_BATTLE) Moduna ve 150 vs 150 (CLASH_150) Ölçeğine Geç
await page.evaluate(() => {
  if (window.__kadirlordTest?.setArenaBattleMode) {
    window.__kadirlordTest.setArenaBattleMode('MASS_BATTLE');
  }
  if (window.__kadirlordTest?.setBattleScale) {
    window.__kadirlordTest.setBattleScale('CLASH_150');
  }
});

// Prewarm modalı görünürse "Hemen Savaşa Gir" butonuna tıkla
await wait(1000);
try {
  const skipBtn = await page.$('[data-testid="prewarm-skip-btn"]');
  if (skipBtn) {
    await skipBtn.click();
    console.log('✓ Prewarm modalı kapatıldı, savaşa girildi.');
  }
} catch {}

await wait(1500);

// Canlı ordu sayılarını al (Tam olarak 150 vs 150 = 300 asker)
const initialCounts = await page.$eval('[data-testid="mass-battle-army-counts"]', (el) => el.textContent?.trim() || '');
console.log(`✓ Başlangıç Ordu Durumu: ${initialCounts}`);

// 4. Orduları Hücuma Geçir (F1-F3 Hücum)
await page.keyboard.press('Digit0');
await wait(200);
await page.keyboard.press('F1');
await wait(200);
await page.keyboard.press('F3');
console.log('✓ ⚔️ "F1-F3 Hücum!" emri verildi. 150 vs 150 asker birbirine koşuyor...');

// Orduların çarpışma hattına ulaşmasını bekle (4 saniye)
await wait(4000);

// 5. 10 Saniye Boyunca Her Kareyi (Frame) Canlı Ölç
console.log('📊 10 saniyelik kesintisiz 150 vs 150 meydan muharebesi FPS ölçümü başlıyor...');

const MEASURE_BATTLE_FPS = `async (seconds) => {
  const frameDeltas = [];
  const fpsHistory = [];
  let lastTime = performance.now();
  const startTime = lastTime;

  await new Promise((resolve) => {
    const loop = (currentTime) => {
      const dt = currentTime - lastTime;
      lastTime = currentTime;
      if (dt > 0) {
        frameDeltas.push(dt);
        const fps = Math.min(240, Math.round(1000 / dt));
        fpsHistory.push(fps);
      }
      if (currentTime - startTime < seconds * 1000) {
        requestAnimationFrame(loop);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(loop);
  });

  frameDeltas.sort((a, b) => a - b);
  fpsHistory.sort((a, b) => a - b);

  const avgDelta = frameDeltas.reduce((s, d) => s + d, 0) / Math.max(1, frameDeltas.length);
  const avgFps = Math.round(1000 / Math.max(0.01, avgDelta));
  const minFps = fpsHistory[0] ?? 0;
  const maxFps = fpsHistory[fpsHistory.length - 1] ?? 0;
  const low1PctIndex = Math.max(0, Math.floor(fpsHistory.length * 0.01));
  const onePctLow = fpsHistory[low1PctIndex] ?? minFps;

  const p95Delta = frameDeltas[Math.min(frameDeltas.length - 1, Math.floor(frameDeltas.length * 0.95))] ?? 0;

  const inEngineFps = window.__kadirlordBattleFps || null;

  return {
    totalFrames: frameDeltas.length,
    minFps,
    maxFps,
    avgFps,
    onePctLow,
    p95FrameMs: Math.round(p95Delta * 10) / 10,
    inEngineFps,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  };
}`;

const perfData = await page.evaluate(`(${MEASURE_BATTLE_FPS})(10)`);

// 6. Ekran görüntüsü al
const screenshotPath = join(E2E_ROOT, 'artifacts', '150v150_battle_fps.png');
await page.screenshot({ path: screenshotPath });
console.log(`📸 Savaş meydanı ekran görüntüsü kaydedildi: ${screenshotPath}`);

// Canlı HUD rozet ve kalan asker verileri
let hudFpsText = '';
try {
  hudFpsText = await page.$eval('[data-testid="live-battle-fps"]', (el) => el.textContent?.trim() || '');
} catch {}

let finalArmyCounts = '';
try {
  finalArmyCounts = await page.$eval('[data-testid="mass-battle-army-counts"]', (el) => el.textContent?.trim() || '');
} catch {}

console.log('\n══════════════════════════════════════════════════════════');
console.log('       150 vs 150 MEYDAN MUHAREBESİ FPS SONUÇLARI         ');
console.log('══════════════════════════════════════════════════════════');
console.log(`• Toplam Asker Sayısı : 300 Asker (150 Dost vs 150 Düşman)`);
console.log(`• Canlı Birlikler     : ${finalArmyCounts || initialCounts}`);
console.log(`• Ölçülen Toplam Kare : ${perfData.totalFrames} kare (10 saniye boyunca)`);
console.log(`• En Yüksek FPS (Max) : ${perfData.maxFps} FPS`);
console.log(`• En Düşük FPS (Min)  : ${perfData.minFps} FPS`);
console.log(`• Ortalama FPS (Avg)  : ${perfData.avgFps} FPS`);
console.log(`• %1 En Düşük (Low 1%): ${perfData.onePctLow} FPS`);
console.log(`• p95 Kare Süresi     : ${perfData.p95FrameMs} ms`);
console.log(`• JS Bellek Kullanımı : ${perfData.heapMB} MB`);
if (hudFpsText) {
  console.log(`• Canlı HUD Rozeti    : ${hudFpsText}`);
}
console.log('══════════════════════════════════════════════════════════\n');

await browser.close();
process.exit(pageErrors.length > 0 ? 1 : 0);
