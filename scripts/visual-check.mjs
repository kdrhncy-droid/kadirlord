/**
 * visual-check.mjs — Tarayıcıda **gerçek** WebGL doğrulaması (opsiyonel ajan aracı)
 *
 *   VIS_DIR=/tmp/vis node scripts/visual-check.mjs [url]
 *
 * Neden ayrı: bu repoda tarayıcı bağımlılığı yok. Ajan sandbox'ında başsız
 * Chromium ancak npm'den gelen `@sparticuz/chromium` + `puppeteer-core` ve
 * derlenmiş NSS kütüphaneleriyle çalışıyor (bkz. aşağıdaki not). Bu script
 * `verify:*` zincirine **dahil değildir**; sadece görsel kontrol için.
 *
 * Ne yapar: ana menüden seferi başlatır, `N` ile ansiklopediyi açar, Kahramanlar
 * sekmesine geçer, 40 portrenin üretilmesini bekler, ölçümleri yazar ve
 * `docs/renders/` altına üç ekran görüntüsü bırakır:
 *   - `encyclopedia-heroes.png`  (liste, 36px portreler)
 *   - `encyclopedia-hero-detail.png` (208×260 detay portresi)
 *   - `portraits-webgl.png` (40 portrenin iletişim sayfası)
 *
 * NSS notu (sandbox): Chromium `libnspr4/libnss3/libnssutil3` ister ve imajda
 * yoksa `error while loading shared libraries` verir. Kaynaktan derleme:
 *   curl -L https://codeload.github.com/mozilla/nspr/tar.gz/refs/heads/main | tar xz
 *   cd nspr-main && ./configure --prefix=/tmp/nssbuild/root --enable-64bit &&
 *     make -j2 && make install
 *   curl -L https://codeload.github.com/nss-dev/nss/tar.gz/refs/heads/main | tar xz
 *   cd nss-main && pip install --break-system-packages ninja gyp-next &&
 *     ./build.sh --opt --disable-tests --with-nspr=/tmp/nssbuild/root/include/nspr:/tmp/nssbuild/root/lib
 *   mkdir -p /tmp/nsslibs && cp /tmp/nssbuild/root/lib/*.so /tmp/nssbuild/dist/Release/lib/*.so /tmp/nsslibs/
 *   LD_LIBRARY_PATH=/tmp/nsslibs node scripts/visual-check.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const VIS_DIR = process.env.VIS_DIR ?? '/tmp/vis';
const URL = process.argv[2] ?? 'http://localhost:3000';
const OUT = 'docs/renders';

// Bağımlılıklar repoda değil: VIS_DIR'deki kurulumdan çözülür.
const requireFromVis = createRequire(`${VIS_DIR}/package.json`);
const load = async (name) => (await import(pathToFileURL(requireFromVis.resolve(name)).href)).default;
const chromium = await load('@sparticuz/chromium');
const puppeteer = await load('puppeteer-core');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  executablePath: await chromium.executablePath(),
  headless: true,
});

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

  // Detay sayfası
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.querySelector('img'))[0]?.click());
  await wait(2500);
  await page.screenshot({ path: `${OUT}/encyclopedia-hero-detail.png` });

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

  const problems = logs.filter((l) => /pageerror|\[error\]/i.test(l) && !/ERR_CONNECTION_CLOSED/.test(l));
  console.log(problems.length ? `\n⚠️ konsol hataları:\n${problems.slice(0, 5).join('\n')}` : '\n✅ konsol temiz');
  console.log(`✅ ${OUT}/encyclopedia-heroes.png · encyclopedia-hero-detail.png · portraits-webgl.png`);
} finally {
  await browser.close();
}
