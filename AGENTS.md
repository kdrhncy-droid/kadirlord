# Kadirlord — Ajan Çalışma Kılavuzu

Bu dosya, projede çalışan kod ajanlarının ilk okuması gereken kısa proje
hafızasıdır. Ayrıntılar için `YAPILACAKLAR_LISTESI.md` ve `docs/` altındaki
araştırma/denetim belgelerine bakın.

## Oyun nedir?

**Sancak-ı Kalradya: Taht ve Kılıç**, Mount & Blade II: Bannerlord'dan
ilham alan fakat onun modu olmayan, tarayıcıda çalışan Türkçe bir 3B orta
çağ sandbox aksiyon-RPG/strateji oyunudur.

Oyuncu Kalradya'da partisini yönetir; asker toplar, ticaret/görev yapar,
erzak–maaş–moral dengeler, lordlarla diplomasi kurar, meydan savaşları ve
kuşatmalara girer, klanını/krallığını büyütür. Dünya; 211 yerleşim, 40
lord/kahraman, altı ana kültür/krallık ve haydutlardan oluşur.

Teknik kimlik:

- React 19 + TypeScript + Vite; 3B katmanda Three.js/WebGL.
- Unity/Unreal kullanılmaz. Karakterler, zırhlar, harita ve savaş öğeleri
  büyük ölçüde prosedürel low-poly kodla üretilir.
- `server.ts`, Gemini destekli diplomasi için Express uçları ve deterministik
  yerel yedek cevapları barındırır.

## Kurulum ve komutlar

Node 22 ile çalışılmıştır.

```bash
npm ci
npm run dev             # http://localhost:3000
npm run verify:fast     # tsc + çekirdek kural/E2E-kancası/karşılaşma probları
npm run verify:all      # tsc + rules.test + scripts/probe-* zincirinin tamamı
npm run build
```

Gerçek tarayıcı doğrulaması:

```bash
npm run setup:e2e       # bir kez / taze sandbox'ta
npm run test:e2e        # Chromium E2E; gerekirse dev sunucusunu da açar
npm run verify:browser  # test:e2e takma adı
```

Detaylar: `tools/e2e/README.md`. E2E ekran görüntüleri
`tools/e2e/artifacts/` altındadır ve Git'e girmez.

## Mimari harita

| Alan | Başlıca dosyalar |
|---|---|
| Uygulama durumu/UI akışı | `src/App.tsx`, `src/game/uiSession.ts`, `src/game/saveGame.ts` |
| Kampanya kuralları/başlangıç verisi | `src/game/rules.ts`, `src/game/campaignSystem.ts`, `src/game/worldSim.ts` |
| Bannerlord veri temeli/göç | `src/game/bannerlordFoundation.ts` (eşya/birlik tanımları, adetli yığınlar, kahraman kayıtları, eski kayıt normalizasyonu) |
| Harita ve navigasyon | `src/components/WorldCanvas.tsx`, `src/game/mapGen.ts`, `src/game/navigation.ts` |
| Karşılaşma/diyalog | `src/game/encounter.ts`, `src/game/dialogue.ts`, `src/components/DialogueModal.tsx`, `src/game/conversation.ts` |
| Karakter/animasyon | `src/game/characterRig.ts`, `characterAnimator.ts`, `characterMorph.ts`, `ik.ts`, `portraitRenderer.ts` |
| Savaş motoru/havuzlar | `src/game/battleEnginePool.ts`, `instancedArmyRenderer.ts`, `tacticalFormation.ts` |
| Krallık/diplomasi | `src/game/kingdomSystem.ts`, `src/components/KingdomManagementModal.tsx`, `DiplomacyModal.tsx`, `server.ts` |
| Ansiklopedi/kahramanlar | `src/game/encyclopedia.ts`, `heroes.ts`, `src/components/encyclopedia/` |
| Pazar/yerleşim | `src/game/market.ts`, `marketRules.ts`, `src/components/BannerlordMarketModal.tsx`, `SettlementModal.tsx` |
| E2E kancası | `src/game/testHarness.ts`, `scripts/probe-test-harness.ts`, `tools/e2e/` |

## Bozulmaması gereken kurallar

1. **Asker sayısının kaynağı `roster`dır.** `LordAgent.armySize`,
   `getTotalTroops(roster)` ile senkron kalmalıdır. Parti gücü roster'dan
   türetilir; yalnız `armySize` değiştirmek gücü değiştirmez.
2. **Canlı lord konumunu harita rotası tutar.** `campaign.lords[].x/z`
   başlangıç/kayıt alanıdır; oyun sırasında otorite `WorldCanvas` içindeki
   `lordLiveRoutes` ve dışa verilen `lordPositionsRef`tir. Bir lordu oyun
   ortasında ışınlarsanız canlı rotayı da güncellemelisiniz; yalnız
   `campaign` alanını değiştirmek haritayı taşımaz.
3. **Zorunlu karşılaşmadan serbest çıkış olmamalıdır.** Yeni bir diyalog
   yolu eklerken Esc, X, genel App kısayolu ve `CLOSE` etkilerinin tamamını
   kontrol edin.
4. **Zaman yalnız UI katmanı mantığıyla durmalıdır.** Modallar
   `src/game/uiSession.ts` üzerinden önceki hızı saklayıp geri vermelidir.
   Bir modalı açmadan önce elle hızı 0'a çekmek geri dönüş hızını bozabilir.
5. **Pazar yerleşim dışından açılmaz.** Envanter ve pazar ayrı akışlardır.
6. **Kayıt uyumluluğu sessiz bozulmamalıdır.** `saveGame.ts` bozuk/eski
   kayıtlarda oyunu çökertmeden yeni sefere düşecek şekilde tasarlanmıştır.
   v1–v3 kayıtlar v4'e `ensureBannerlordFoundation` ile deterministik ve
   idempotent göç eder; yeni kanonik alan eklerken bu kapı ve P0/P1 testi
   birlikte güncellenmelidir.
7. **Test kancası üretimde kapalıdır.** `window.__kadirlordTest` yalnız
   `import.meta.env.DEV && ?e2e=1` iken açılır ve E2E durumunda gerçek
   sefer kaydı yazılmaz. Bu kilidi gevşetmeyin.
8. **Üretimde kullanılan yolu test edin.** Bir helper yalnız probe'da
   çağrılıyorsa, üretimde kopyalanmış ikinci bir uygulama varsa test yeşil
   olsa bile özellik kanıtlanmış sayılmaz.

## Değişiklik iş akışı

1. Önce sorunu saf fonksiyon/probe ile tekrar üretin; iddiayı ölçün.
2. Değişiklikten sonra önce ilgili dar probe'u, sonra `verify:fast`i çalıştırın.
3. UI/WebGL/akış değiştiyse `npm run test:e2e` ile gerçek Chromium kanıtı alın.
4. Geniş sistem değişikliklerinde `verify:all` ve `npm run build` çalıştırın.
5. Yeni oyun kuralına, yalnız mutlu yolu değil bütünlük invariant'larını da
   test edin: örneğin asker kaybında roster toplamı + `armySize` + güç birlikte
   değişmelidir.
6. Kullanıcının mevcut değişikliklerini geri almayın; `git status` ile başlayın.

## Bilinen açıklar (2026-10-22 denetimi)

Bu araç paketi aşağıdaki oyun hatalarını düzeltmez; onları güvenilir biçimde
tekrar üretmeyi kolaylaştırır:

- Haydut teslimiyeti esir/altın verirken haydut `roster`ını ve gücünü
  değiştirmiyor; tekrar ödül açığı var.
- Diyalog sahnesindeki `conversation.ts#heroFromLord`, meslek/cinsiyet ve
  sancak rengini birçok lord için yanlış türetiyor.
- Oyuncu teslimiyetinde erzak tabanı, erzak 4'ün altındayken net erzak
  kazancı üretebiliyor.
- Karşılaşma senaryosu, teması gerçekten kimin başlattığını değil yalnız
  güç oranını kullanıyor; eşikler kovalama/kaçma eşikleriyle tam aynı değil.
- `checkHostileMapInterception` probe'da test ediliyor ancak üretimde
  `WorldCanvas` kendi yakalama döngüsünü kullanıyor.
- `server.ts` içindeki Gemini model kimliği ayrıca doğrulanmalıdır; anahtar
  olsa bile yanlış model adı sessizce yerel yedeğe düşürebilir.

Yeni bir açık kapatıldığında bu listeyi ve ilgili denetim belgesini güncelleyin.
