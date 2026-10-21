# Kadirlord E2E Araçları

Bu paket, ajan ve CI ortamlarının oyunu gerçek bir Chromium içinde
doğrulayabilmesi için ayrı tutulur. Oyun paketine tarayıcı bağımlılığı
eklenmez.

## Kurulum

Repo kökünden:

```bash
npm ci
npm run setup:e2e
```

`setup:e2e` iki iş yapar:

1. `tools/e2e/package-lock.json` ile `@sparticuz/chromium` ve
   `puppeteer-core` kurulumunu yapar.
2. Chromium'u gerçekten başlatır, sürümünü ve WebGL renderer'ını doğrular.
   Linux'ta gereken NSS/NSPR kütüphaneleri paketin AL2023 arşivinden
   `tools/e2e/.cache/chromium-libs/` altına açılır.

## Testler

```bash
npm run test:e2e
# eşdeğeri
npm run verify:browser
```

Varsayılan adres `http://127.0.0.1:3000`dir. Sunucu çalışmıyorsa test
çalıştırıcısı `npm run dev` başlatır ve yalnız kendi başlattığı süreci
kapatır.

Kapsam:

- `boot-webgl`: oyun açılır, 40 lord/211 yerleşim yüklenir, WebGL çalışır,
  uygulama konsol hatası yoktur.
- `encyclopedia-heroes`: ansiklopedi açılır ve 40 kahraman portresi üretilir.
- `forced-encounter`: `bandit-caught-player` senaryosunda zorunlu diyalog
  açılır; kapatma düğmesi ve Esc ile kaçış yoktur; savaş öncesi karar
  seçeneklerinin tamamı görünür.

Ekran görüntüleri `tools/e2e/artifacts/` altına yazılır ve Git'e girmez.

## Senaryo kancası

Test kancası yalnız geliştirme derlemesinde ve açık parametreyle çalışır:

```text
/?e2e=1&autostart=1&seed=42&scenario=bandit-caught-player&timeScale=0
```

Tarayıcıda `window.__kadirlordTest` şu işleri sağlar:

- `getState()`
- `setTimeScale(0|1|2|4)`
- `setPlayer(patch)` / `setLord(id, patch)`
- `getLordPosition(id)` — canlı rota konumunu okur
- `openDialogue(id)` / `closeDialogue()`
- `openEncyclopedia()` / `closeEncyclopedia()`

Üretim derlemesinde aynı URL hiçbir test yetkisi vermez. E2E oturumunda
kalıcı sefer kaydı yazılmaz.

Not: Oyuncu ve lordların canlı harita konumlarını `WorldCanvas` içindeki
rota durumu tutar. Bu ilk sürüm konumları okur; senaryo başlangıç konumları
oyun ilk kampanya durumu kurulurken ayarlanır. Oyun ortası ışınlama API'si
eklenirse canlı rotalar da güncellenmelidir.

## Sistem Chromium'u kullanma

```bash
E2E_CHROME_PATH=/usr/bin/chromium npm run test:e2e
```

Linux dışı platformlarda bu yol zorunludur; paketli Chromium Linux içindir.

## Sorun giderme

- `libnspr4.so: cannot open shared object file`:
  `tools/e2e/.cache/` dizinini silip `npm run setup:e2e` çalıştırın.
- Sunucu açılmıyor: kökte `npm ci` yapıldığından ve 3000 portunun boş
  olduğundan emin olun; çalıştırıcı sunucu çıktısının son bölümünü gösterir.
- Zaman aşımı: `E2E_TIMEOUT_MS=240000 npm run test:e2e` kullanın.
  SwiftShader CPU ile render yaptığı için gerçek GPU FPS'i temsil etmez.
