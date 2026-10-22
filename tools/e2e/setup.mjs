/**
 * setup.mjs — Chromium kurulumunu gerçekten başlatıp WebGL ile doğrular.
 *
 * Kurulum çıktısı "başarılı" demek tarayıcının açılacağı anlamına gelmez;
 * eksik NSS/NSPR kütüphaneleri ancak ilk başlatmada görülür. Bu adım bu
 * yüzden bir sayfa açıp WebGL renderer'ını da okur.
 */
import { probeChromium } from './lib/chromium.mjs';

try {
  const result = await probeChromium();
  if (!result.webgl) {
    throw new Error('Chromium açıldı ancak WebGL bağlamı oluşturulamadı.');
  }
  console.log(`✅ Chromium hazır: ${result.version}`);
  console.log(`✅ WebGL: ${result.webgl}`);
  if (result.libraryPath) console.log(`✅ NSS/NSPR: ${result.libraryPath}`);
} catch (error) {
  console.error(`❌ Chromium kurulumu doğrulanamadı: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
