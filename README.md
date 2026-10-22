# Kadirlord

Kadirlord, Mount & Blade II: Bannerlord'dan esinlenen, tarayıcıda çalışan fantezi
Orta Çağ sanal ülke oyunudur. React 19 + Vite + Three.js (React Three Fiber) teknolojisini
kullanır.

## Özellikler

- **Kampanya haritası:** Prosedürel dağ/deniz/orman arazisi, partiler, yerleşimler, zaman kontrolü
- **Karakter yaratımı:** Kültür seçimi, aşamalı hayat hikâyesi, yüz morfozu
- **Yerleşimler:** Şehir/kale/köy menüleri, kışla, pazar, meyhane, arenada düellolar
- **Savaş:** Silah türlerine göre prosedürel animasyon, yaya/atlı savaş, savunma yönleri
- **Kuşatma:** 3B saldırı sahnesi, koçbaşı/kule ilerlemesi, duvar/yıkılma fiziği
- **Ekonomi ve makro-simülasyon:** Fiyatlar, üretim, lord AI'ı, krallık politikası, isyan riski
- **Ansiklopedi:** 7 kategori, war-durumu halkası, gizli bilgi (fog-of-war), arama ve sıralama
- **Ses:** Prosedürel Web Audio enstrümantasyon

## Kurulum ve çalıştırma

```bash
npm ci
npm run dev
```

AI Studio dışında (düz Node ortamında) bağımlılık çatışması çıkarsa:

```bash
npm ci --legacy-peer-deps
npm run dev
```

> **Not:** `bun.lock` bilinçli olarak kaldırıldı; kurulum npm ile yapılır. Ayrıca
> `.gitignore`a `bun.lock` eklendi, yanlışlıkla yeniden eklemeyin.

## Doğrulama

```bash
npm run verify:fast    # tsc + bütün kural testleri + hızlı problar (~76 sn)
npm run verify:all     # verify:fast + ekonomi/varlık probları (~3 dk)
npm run verify:browser # gerçek Chromium'da E2E (kendi Vite sunucusunu açıp kapatır)
```

E2E bir kez kurulur: `npm run setup:e2e`. Ayrıntı: [`tools/e2e/README.md`](tools/e2e/README.md).

## Proje yapısı

| Dizin | İçerik |
| --- | --- |
| `src/App.tsx` | Kampanya durum çekirdeği (harita tick'i, eylemler, karşılaşma başlatma) |
| `src/game/` | Saf oyun kuralları (React'siz, node ile test edilebilir) |
| `src/components/` | 3B sahneler, modallar, HUD |
| `src/bannerforge/` | Prosedürel anatomi/geometri üretimi (sol kolon koordinat sistemi) |
| `scripts/` | Probe'lar, görsel doğrulama scriptleri |
| `tools/e2e/` | Tarayıcı E2E çalıştırıcısı ve senaryolar |
| `docs/` | Araştırma ve denetim belgeleri (arşiv) |

## Belgeler

- [**`YAPILACAKLAR_LISTESI.md`**](YAPILACAKLAR_LISTESI.md) — **Açık görevlerin tek ve güncel listesi** (kanonik kaynak)
- [**`AGENTS.md`**](AGENTS.md) — Kısa proje hafızası: mimari harita, test kapıları, bozulmaması gereken kurallar
- `docs/EKSIKLER_VE_HATALAR.md` — 2026-10-21 kanıtlı denetim (tarihsel arşiv; görevler kanonik listeye konsolide edildi)
- `docs/ANSIKLOPEDI_VE_UI_PLANI.md` — Ansiklopedi/UI günlüğü
- `docs/ARMORY_STUDIO_INCELEME.md` — BannerForge zip incelemesi ve entegrasyon
- `docs/BANNERLORD_MAKRO_SIMULASYON_KAYNAK_RAPORU.txt` — Makro-simülasyon kaynak araştırma raporu (Türkçe)

## Katkı notları

- Yeni bir görev bulursanız önce `YAPILACAKLAR_LISTESI.md`ye ekleyin; tamamladığınızda yalnız oradan kapatın.
- `YAPILACAKLAR_LISTESI.md` Bölüm 2'deki P2→P8 sırası bağlayıcıdır; performans (P7) ve kayıt (P8) en sonda.
- Yeni `CampaignState` alanı eklerken `ensureBannerlordFoundation` üzerinden migration yazın (eski kayıtlar bozulmaz).
- Silmeden önce referans denetimi yapın; araştırma belgeleri ve `docs/renders/` ekran görüntüleri kanıttır, silmeyin.
