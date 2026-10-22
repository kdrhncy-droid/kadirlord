/**
 * visual-check.mjs — Tarayıcıda **gerçek** WebGL portre doğrulaması
 *
 *   npm run setup:e2e
 *   npm run dev
 *   node scripts/visual-check.mjs [url]
 *
 * Bu script genel E2E paketinin (`tools/e2e`) Chromium başlatıcısını kullanır;
 * NSS/NSPR kütüphaneleri ayrıca derlenmez. Yalnız portre çıktısı üretir ve
 * `verify:*` zincirine dahil değildir. Genel akış testleri için
 * `npm run test:e2e` kullanın.
 *
 * Ne yapar: ana menüden seferi başlatır, `N` ile ansiklopediyi açar, Kahramanlar
 * sekmesine geçer, 40 portrenin üretilmesini bekler, ölçümleri yazar ve
 * `docs/renders/` altına üç ekran görüntüsü bırakır:
 *   - `encyclopedia-heroes.png`  (liste, 36px portreler)
 *   - `encyclopedia-hero-detail.png` (208×260 detay portresi)
 *   - `portraits-webgl.png` (40 portrenin iletişim sayfası)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChromium } from '../tools/e2e/lib/chromium.mjs';

const URL = process.argv[2] ?? 'http://localhost:3000';
const OUT = 'docs/renders';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await launchChromium();

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`PAGEERROR ${e.message}`));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await wait(3000);

  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
    const ext = ctx?.getExtension('WEBGL_debug_renderer_info');
    return ctx ? ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER) : null;
  });
  console.log('WebGL:', gl ?? 'YOK');

  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('SEFERİ BAŞLAT'))?.click());
  await wait(6500);

  await page.keyboard.press('KeyN');
  await wait(1200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith('Kahramanlar'))?.click());

  const t0 = Date.now();
  let stats = { n: 0, ready: 0, size: '' };
  for (let i = 0; i < 20; i++) {
    stats = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return {
        n: imgs.length,
        ready: imgs.filter((x) => x.complete && x.naturalWidth > 0).length,
        size: imgs[0] ? `${imgs[0].naturalWidth}x${imgs[0].naturalHeight}` : '',
      };
    });
    if (stats.n >= 30 && stats.ready === stats.n) break;
    await wait(500);
  }
  console.log(`Portreler: ${stats.ready}/${stats.n} hazır, boyut ${stats.size}, ${Date.now() - t0} ms`);

  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/encyclopedia-heroes.png` });

  // 40 portrenin iletişim sayfası
  const sheet = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].slice(0, 40);
    const cols = 8, cw = 128, ch = 160, gap = 6, labelH = 14;
    const rows = Math.ceil(imgs.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * (cw + gap) + gap;
    canvas.height = rows * (ch + gap + labelH) + gap;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#141109';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    imgs.forEach((img, i) => {
      const x = gap + (i % cols) * (cw + gap);
      const y = gap + Math.floor(i / cols) * (ch + gap + labelH);
      ctx.fillStyle = '#241d12';
      ctx.fillRect(x, y, cw, ch);
      try { ctx.drawImage(img, x, y, cw, ch); } catch { /* ignore */ }
      ctx.fillStyle = '#c6a15b';
      ctx.font = '10px sans-serif';
      ctx.fillText(img.alt.slice(0, 16), x, y + ch + 10);
    });
    return canvas.toDataURL('image/png');
  });
  writeFileSync(`${OUT}/portraits-webgl.png`, Buffer.from(sheet.split(',')[1], 'base64'));


  // Detay sayfası
  await page.click('[data-testid="encyclopedia-hero-row"]');
  await page.waitForSelector(
    '[data-testid="encyclopedia-modal"][data-encyclopedia-section="HERO"]',
    { timeout: 30000 },
  );
  await wait(2500);
  await page.screenshot({ path: `${OUT}/encyclopedia-hero-detail.png` });

  const problems = logs.filter((l) => /pageerror|\[error\]/i.test(l) && !/ERR_CONNECTION_CLOSED/.test(l));
  console.log(problems.length ? `\n⚠️ konsol hataları:\n${problems.slice(0, 5).join('\n')}` : '\n✅ konsol temiz');
  console.log(`✅ ${OUT}/encyclopedia-heroes.png · encyclopedia-hero-detail.png · portraits-webgl.png`);
} finally {
  await browser.close();
}
