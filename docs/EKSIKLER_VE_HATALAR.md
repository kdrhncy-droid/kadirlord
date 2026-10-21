# 🔍 EKSİKLER VE HATALAR — TAM DENETİM (2026-10-21)

> Bu rapor **bulgu** raporudur: hiçbir üretim kodu değiştirilmedi, yalnız ölçüm yapıldı.
> Her bulgu için **kanıt** (dosya:satır veya komut), **etki** ve **önerilen düzeltme** yazıldı.
> Karar gerektiren üç başlık `⚖️ KARAR` olarak işaretlendi — bunlarda tek başıma karar vermiyorum.

---

## 0. Nasıl ölçüldü

| Yöntem | Komut / araç | Sonuç |
| --- | --- | --- |
| Tip kontrolü | `npx tsc --noEmit` | ✅ 0 hata |
| Ölü kod taraması | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | **69** kullanılmayan sembol (src) |
| Test/probe zinciri | `npm run verify:all` | ✅ 26 paket, **485** `ok()` kontrolü + 28 kural testi |
| Üretim derlemesi | `npx vite build` | ✅ 1.55 MB JS (gzip **429 KB**) + 73 KB CSS |
| Uygulama render'ı | `renderToStaticMarkup(<App/>)` | ✅ 4.191 bayt, çökme yok |
| Modal duman testi | 6 modal + 3 yerleşim türü SSR render | ✅ hepsi render ediyor (5.6–63 KB) |
| Ekonomi dayanıklılığı | 400 günlük `advanceDailyEconomyAndWorld` döngüsü | ✅ NaN yok, ama altın 655 → **29.455** (pasif gelir) |
| Ad tekilliği | ansiklopedi indeksi | ✅ 40 kahraman / 21 klan / 211 yerleşim hepsi tekil |
| Metin sayımı | görünür metin + tam sözcük (maskeli) | ℹ️ kahraman sayfasında `İlişki` 2× |

---

## A. KRİTİK — bozuk veya kuralla çelişen

### A1. 💾 Hiç kayıt/yükleme yok — sekmeyi yenileyince sefer sıfırlanıyor
- **Kanıt:** `grep -rn "localStorage\|indexedDB\|sessionStorage" src` → **0 sonuç**.
  Duraklatma menüsünde (`App.tsx:1029`) yalnız "Devam Et / Yeniden Başlat" var, "Kaydet" yok.
- **Etki:** Uzun bir sefer (yüzlerce gün) sayfa yenilemesi, tarayıcı çökmesi veya R tuşu ile
  tamamen kayboluyor. Oyuncu için en ağır kayıp senaryosu.
- **Ek:** `R` kısayolu (`App.tsx:219`) **onay sormadan** yeni sefer başlatıyor ve `createInitialCampaignState`
  çağrısı sabit ad kullanıyor (`App.tsx:162` → `'Komutan Demirhan'`) — karakter yaratıcıda
  seçilen ad da sıfırlanıyor.
- **Öneri:** `campaign` + `macroState` + `metHeroIds` + `campaignTimeScale`'i sürüm numaralı tek
  JSON olarak `localStorage`'a yaz (otomatik: her gün geçişinde + modal kapanışında). Duraklatma
  menüsüne **Kaydet / Yükle / Yeni Sefer** ekle; `R` yalnız onaylı çalışsın.
  Doğrulama: `probe-save.ts` (kaydet → state'i yeniden kur → derin eşitlik; bozuk JSON → sessiz yeni sefer).

### A2. ⏸️ Zaman yönetimi tutarsız: 4 modal duraklatıyor, **hiçbiri geri açmıyor**; diyalog hiç duraklatmıyor
- **Kanıt:** `setCampaignTimeScale(0)` → `App.tsx:208` (N), `:673` (yerleşim), `:677` (diplomasi),
  `:881/:883` (HUD → diplomasi/ansiklopedi). Kapatma yolları: `App.tsx:1173` (ansiklopedi),
  `:1203` (pazar), `:1219` (divan) → **hiçbirinde hız geri yüklenmiyor**.
  Diyalog ise `App.tsx:919 setDialogueLord(l)` ile açılıyor, hız **0'a çekilmiyor**.
- **Etki:** Ansiklopediyi `N` ile açıp kapatan oyuncu "oyun dondu" sanıyor (hız 0'da kalıyor,
  Space ile düzeltmesi gerekiyor); lord ile konuşurken ise dünya akmaya devam ediyor (ordular
  yürüyor, gün ilerliyor) — yani aynı oyunda iki farklı zaman davranışı.
- **Öneri:** Tek bir `openModal/closeModal` sarmalayıcısı: açarken `prevSpeed` sakla, hıza 0 yaz;
  kapanışta `prevSpeed`'e dön. Diyalog da bu sarmalayıcıyı kullansın.
  Doğrulama: `probe-time-flow.ts` — aç/kapa döngüsünde hız 4 → 0 → 4; diyalog açıkken tick yok.

### A3. 🌫️ Fog of war: tanışma durumu sıfırlanmıyor ve diyalog tanışmayı açmıyor
- **Kanıt:** `metHeroIds` (`App.tsx:108`) yalnız bellekte; `startGame` (`App.tsx:160-176`)
  bu diziyi **temizlemiyor** → R ile yeni seferde eski tanışıklıklar kalıyor.
  Tanışmayı açan tek yol ansiklopedideki düğme (`EncyclopediaModal.tsx:426-434`);
  `DialogueModal` içinde `reveal` çağrısı yok (`grep -rn "reveal" src/components/DialogueModal.tsx` → 0).
- **Etki:** Lord ile konuşup ayrıldıktan sonra ansiklopedide hâlâ "Tanış (bilgileri aç)" görünüyor,
  yaş/beceri gizli kalıyor — oysa diyalog kurmak Bannerlord'da "tanışma"dır. Tersi de var:
  yeni seferde eski lordların yaşı açık geliyor.
- **Öneri:** `metHeroIds`'i kampanya durumuna taşı (kayıtla birlikte yaşasın); `DialogueModal`
  açıldığında/ilk seçenek seçildiğinde `metHeroIds`'e ekle; `startGame` sıfırlasın.
  Doğrulama: `probe-fog.ts` — diyalog sonrası `revealed === true`; yeni seferde 0 tanışık.

### A4. ⚖️ KARAR — Pazar kuralı "yerleşkeye girmeden erişilemez" iken yakınlıkla açılıyor
- **Kanıt:** `App.tsx:921` → `canTrade={!!(activeSettlementModal || nearSettlement)}`;
  `nearSettlement` = haritada **13 dünya birimi** yakınlık (`WorldCanvas.tsx:1932-1940`).
  Kural sizin bağlayıcı talimatınızdı: *"pazar yalnızca yerleşkeye girildiğinde açılır"*.
- **Etki:** Şehrin 13 birim yanından geçerken HUD'daki "Pazaryeri" düğmesi aktif oluyor ve pazar
  açılıyor; yerleşim menüsüne girmek gerekmiyor. `probe-hud` bunu yakalamıyor çünkü yalnız
  `canTrade:false` durumunu test ediyor.
- **Seçenekler:** (a) `canTrade={!!activeSettlementModal}` yap (kurala birebir uyum, envanter/pazar
  ayrımı korunur), (b) yakınlık kalsın ama pazar düğmesi yerine "Yerleşime gir" düğmesi çıksın.
- **Not:** Yerleşim menüsü açıkken zaten `activeSettlementModal` dolu olduğu için (a) seçeneği
  hiçbir akışı bozmaz. **Onayınızı bekliyorum.**

### A5. 🏰 Klan tımar sayıları uydurma ve krallık toplamıyla tutmuyor
- **Kanıt:** `src/game/encyclopedia.ts:173` → `fiefCount: Math.round((fiefCountByFaction[kingdomId] ?? 0) / 3)`.
  Ölçüm (birim testi çıktısı):

  | Krallık | Krallık tımarı | Klanların toplamı | Gerçek yerleşim |
  | --- | --- | --- | --- |
  | Aserai | 24 | 24 (8+8+8) | 24 |
  | Battaniya | 23 | **24** | 23 |
  | İmparatorluk | 74 | **75** (25+25+25) | 74 |
  | Khuzait | 26 | **27** | 26 |
  | Sturgia | 29 | **30** | 29 |
  | Vlandiya | 32 | **33** | 32 |

- **Etki:** Aynı krallıktaki üç klan **birebir aynı** tımar sayısını gösteriyor (25+25+25) ve
  toplam krallığı aşıyor. Ansiklopedide "hangi klan neyi elinde tutuyor" sorusu cevaplanamıyor.
- **Öneri:** Yerleşimlere `ownerClanId` ata (deterministik hash ile klanlara dağıt), krallık
  toplamını da bu atamadan türet → toplamlar birebir tutar. Doğrulama: `Σ klan.fiefCount === krallık.fiefCount`.

### A6. 🧬 İki ayrı klan modeli: ansiklopedi 21 klan, krallık yönetimi 6 sabit klan
- **Kanıt:** `src/game/heroes.ts:180-215` üretilmiş klanlar (`Altınkule Hanedanı` …);
  `src/game/kingdomSystem.ts:942-1100` **elle yazılmış** 6 klan (`Pethros Hanedanı (Rhagaea)`,
  `dey Meroc Hanedanı (Derthert)`, `fen Gruffendoc (Caladog)` …), `kingdomClans: initialClans.slice(0,4)`.
- **Etki:** Aynı lord iki farklı klana ait görünüyor: İmparatoriçe Rhagaea ansiklopedide
  "Altınkule Hanedanı" üyesi, Divan'da "Pethros Hanedanı" lideri. Oyuncunun kendi klanı da
  Divan'da `<ad> Hanedanı`, ansiklopedide `Demirtaç Hanedanı` mantığıyla üretiliyor.
- **Öneri:** Tek kaynak: `deriveClan` çıktısını `kingdomSystem` da kullansın; makro klan
  kayıtları (tier, nüfuz, altın) hero klanlarına bağlansın. Doğrulama: her `clanId` hem
  ansiklopedide hem divanda **aynı ad** ve **aynı üye listesi**.

### A7. 🤖 Gemini entegrasyonu geçersiz model kimliğiyle çağrılıyor
- **Kanıt:** `server.ts:150` ve `server.ts:235` → `model: 'gemini-3.8-flash'`.
  Böyle bir model yok; `@google/genai` çağrısı hata verecek ve `catch` bloğu sessizce
  deterministik fallback'e düşecek (`server.ts:213`).
- **Etki:** `GEMINI_API_KEY` doğru olsa bile yapay zekâ **hiçbir zaman** devreye girmiyor;
  her şey "fallback" metinleriyle çalışıyor. Ayrıca README bu anahtarı zorunlu gösteriyor (bkz. B8).
- **Öneri:** Geçerli bir model kimliği (ör. `gemini-2.5-flash`) + `aiPowered` alanını arayüzde
  göster ("AI" / "yerel yanıt" etiketiyle). Doğrulama: anahtar yokken fallback, anahtar varken
  `aiPowered:true`; hata durumunda log.

### A8. ⎋ Escape yalnızca 2 modalı kapatıyor
- **Kanıt:** `App.tsx:226-238` yalnız `activeSettlementModal` ve `activeDiplomacyLord` için kapatma
  yapıyor. `isMarketModalOpen`, `isKingdomModalOpen`, `isCharacterCreatorOpen` için dal **yok**.
  Bu modallerde de kendi Escape dinleyicisi yok (`grep -c "Escape" BannerlordMarketModal.tsx → 0`).
- **Etki:** Pazar açıkken Esc → oyun duraklıyor, pazar ekranda kalıyor; Divan'da Esc → aynı.
  Karakter yaratıcıda Esc → hiçbir şey; çıkmak için ✕ aranıyor.
- **Öneri:** Modal yığını (stack) + tek `Escape` yöneticisi; her modal `onClose` verir,
  yığının en üstü kapanır. Doğrulama: `probe-modal-stack.tsx` — 5 modalın her biri Esc ile kapanıyor.

---

## B. ORTA — içerik, erişilebilirlik, tutarlılık

### B1. 🏯 28/29 kale adı İngilizce "… Castle" ve tür etiketiyle çakışıyor
- **Kanıt:** `rules.ts:1451` `'Lochana Castle'`, `:1464` `'Hertogea Castle'` … (29 kalenin 28'i).
  Ölçüm: `CASTLE` tipinde 29 yerleşim, 28'i "Castle" içeriyor; `TOWN` ve `VILLAGE`'da 0.
- **Etki:** Türkçe arayüzde ("Kale" ikonu + "Kale" etiketi) ad da "… Castle" → aynı bilgi iki kez
  ve yanlış dilde. Ansiklopedi listesinde "Lochana Castle — Kale" satırı çıkıyor.
- **Ek:** Köyler arasında **Sancaktepe** (modern İstanbul ilçesi) gibi anakronik bir ad var.
- **Öneri:** `name` alanından " Castle" son ekini kaldır (id'ler ayrı, güvenli). Doğrulama:
  `probe-content.ts` — hiçbir yerleşim adında `Castle|Village|Town` yok.

### B2. 🏴 Bağımsız (haydut) klanlarında sahte "Krallık" kartı
- **Kanıt:** Haydut klanlarında `kingdomId: null` ama `kingdomName` = `"Kara Geçit Yağmacıları"`
  (`heroes.ts:270` faction adı). Klan sayfası `LinkCard label="Krallık" value={clan.kingdomName}`
  kartını `disabled` olarak gösteriyor (`pages.tsx` ClanDetailPage).
- **Etki:** Pasif ama tıklanabilir görünen kart "Krallık: Kara Geçit Yağmacıları" yazıyor;
  oysa böyle bir krallık yok (haydutlar bağımsız). Kullanıcı var olmayan bir sayfaya gitmeye çalışıyor.
- **Öneri:** `kingdomId` yoksa kart `label="Statü" value="Bağımsız"` olsun ve tıklanamasın.

### B3. 🔁 Kahraman sayfasında hâlâ tekrar var (Faz 9g kapsamı dışında bırakıldı)
- **Ölçüm:** `İlişki` **2×** (`App`: sol kolon "Oyuncuya ilişki" + "Bilgi" bloğu "İlişki"),
  meslek **2×** (portre altı etiket + "Meslek" hücresi), savaş durumu **2×**
  ("Sizinle savaş hâlinde" rozeti + "Oyuncuya karşı: Savaşta").
- **Öneri:** Sol kolonu kimlik (portre/ad/unvan/durum) ile sınırla; ilişki/meslek yalnız Bilgi
  bloğunda kalsın. Doğrulama: mevcut `probe-encyclopedia-dedup`'a 2 kontrol eklemek yeterli.

### B4. 🧮 Divan/Ansiklopedi'de anlamsız koşul
- **Kanıt:** `pages.tsx:292` → `value={`${diplomacy.totalMembers > 0 ? kingdom.clanIds.length : 0}`}`.
- **Etki:** Üye yoksa klan sayısını 0 gösteriyor; üye varsa `clanIds.length`. Koşul gereksiz,
  bakım sırasında yanıltıcı.
- **Öneri:** `value={String(kingdom.clanIds.length)}`.

### B5. ♿ Erişilebilirlik açıkları
- **Kanıt:**
  - 8 modalden **4'ünde** `role="dialog"`/`aria-modal` var (pazar, diplomasi, divan, yerleşim);
    **4'ünde yok**: `EncyclopediaModal`, `DialogueModal`, `CharacterCreatorModal`, `BattlePrewarmModal`.
  - Odak tuzağı (focus trap) hiçbirinde yok → `Tab` ile arkadaki oyuna kaçılıyor.
  - **46** yerde `text-[9px]`, **3** yerde `text-[8px]` (okunabilirlik sınırının altı).
  - Tüm projede yalnız **16** `aria-label` var; ✕ / ikon-only düğmeler çoğunlukla yalnız `title` taşıyor
    (ansiklopedinin kapatma düğmesi, arama temizleme, divan sekmeleri …).
- **Öneri:** Ortak `<Modal>` bileşeni: `role/aria-modal/aria-labelledby`, ilk odak, `Tab` döngüsü,
  `Esc`, gövde scroll kilidi. Yazı tipi tabanı 10 px'e çekilsin (9/8 px → 10 px).

### B6. ⌨️ Ansiklopedi arama sonuçlarında klavye gezinmesi yok
- **Kanıt:** `EncyclopediaModal.tsx:104-125` sadece `Esc`, `N`, `/` tuşlarını yönetiyor;
  `↑/↓/Enter` yok. Sonuçlar fare ile seçiliyor.
- **Öneri:** `activeIndex` + `↑/↓` + `Enter`; `aria-activedescendant`.

### B7. 📱 Dokunmatik/mobil destek yok
- **Kanıt:** `grep -rn "touchstart" src` → yalnız `CharacterCreatorModal.tsx:237`.
  Harita (WASD + pointer lock), arena (pointer lock) ve tüm HUD fare/klavye varsayıyor.
- **Etki:** Telefon/tablet için oyun oynanamaz; "live preview" mobilde boş ekran gibi görünür.
- **Öneri (karar gerektirir):** ya mobil için "sadece harita + dokunmatik sürükle" modu,
  ya da açılışta "Bu oyun klavye+fare ister" bilgi ekranı.

### B8. 📄 README hâlâ AI Studio şablonu
- **Kanıt:** `README.md:5-20` → "Run and deploy your AI Studio app", kurulumda
  `GEMINI_API_KEY` **zorunlu** gösteriliyor (oysa fallback var), oyun/ kontroller/ mimari yok.
- **Öneri:** Türkçe README: ne olduğu, ekran görüntüleri, kontroller tablosu, `npm run dev|build|start`,
  `verify:all`, GEMINI'in **opsiyonel** olduğu.

### B9. 🚧 Ölü "Faz 2'de gelecek" yer tutucusu
- **Kanıt:** `EncyclopediaModal.tsx:705-712` → `placeholder()` içinde 🚧 emojisi ve
  "Bu bölüm Faz 2'de gelecek" metni. Tüm bölümler bağlı olduğu için erişilemez; yine de
  "emoji ikon kullanma" kuralına aykırı ve yanlış bilgi taşıyor.
- **Öneri:** Sil, `default` dalında `EmptyNote` döndür.

---

## C. TEKNİK BORÇ

| # | Bulgu | Kanıt | Etki |
| --- | --- | --- | --- |
| C1 | **69** kullanılmayan import/değişken | `tsc --noUnusedLocals` | Okunabilirlik; `BattlePrewarmModal` ve `battlePrewarmStages` App'te tamamen ölü (`App.tsx:61,125`) |
| C2 | Tek parça 1.55 MB JS (429 KB gzip) | `dist/assets/index-*.js` | İlk açılış ağır; pazar/arena/divan `React.lazy` ile bölünebilir |
| C3 | **234** farklı sabit hex renk | `grep -rhoE "#[0-9a-f]{6}"` | Tema tutarlılığı yalnız elle; token (`--gold`, `--ink` …) yok |
| C4 | UI test boşluğu | `scripts/probe-*` | Probu olmayan büyük bileşenler: `CharacterArenaView` (2.936), `WorldCanvas` (2.624), `KingdomManagementModal` (1.411), `DiplomacyModal` (467), `CharacterCreatorModal` (1.131), `BattlePrewarmModal`. `SettlementModal` yalnız `probe-recruitment-ui` içinde dolaylı geçiyor |
| C5 | İki kilit dosyası + şablon adı | `bun.lock` **ve** `package-lock.json`; `"name": "react-example"` | Kurulumda hangi araç belirsiz; yayın paketinde anlamsız ad |
| C6 | Doküman kayması | `docs/ANSIKLOPEDI_VE_UI_PLANI.md` §31 "19 test" → gerçek 26; §21.4 "Faz 9'da yapılacak" (yapıldı) | Yanlış durum bilgisi |
| C7 | 9.8 MB zip repoda | `git ls-files` | **Bilinçli** (sizin talimatınız: "zip repo içinde kalır") — sadece not, aksiyon yok |
| C8 | 4 × `as never` (probe props) | `scripts/probe-*.tsx` | Testte tip kaybı; tipli prop arabirimi daha güvenli |
| C9 | Ekonomi dengesi | 400 gün soak: altın 655 → 29.455, erzak 0, moral 15 | Oyuncu hiçbir şey yapmadan zenginleşiyor; denge kalibrasyonu gerek |

---

## D. DOĞRU ÇALIŞANLAR (kanıtlı — bunlara dokunmuyoruz)

- `tsc --noEmit` temiz; `npm run verify:all` **26 paket**, 485 kontrol, 28 kural testi.
- `vite build` temiz; uygulama SSR'da çöküyor değil; **6 modal + 3 yerleşim türü** duman testinden geçti.
- 400 günlük simülasyonda NaN/negatif refah yok.
- Üretim kodunda **`console.log` yok** (yalnız anlamlı `console.warn` fallback'leri), boş `onClick` yok.
- Ad tekilliği korunuyor: 40 kahraman, 21 klan, 211 yerleşim — hepsi tekil.
- Pazar kuralının *envanter ile aynı yerde olmama* tarafı doğru: `I` envanter açar, pazar açmaz
  (`GameHud.tsx:165-168`).

---

## E. ⚖️ KARAR GEREKTİREN ÜÇ BAŞLIK

1. **A4 — Pazar:** yakınlıkta açılması kalsın mı, yoksa yalnız yerleşim menüsünden mi açılsın?
2. **B7 — Mobil:** dokunmatik kontrol mü, "masaüstü gerekli" bilgi ekranı mı?
3. **B1 — Kale adları:** "Lochana Castle" → "Lochana" olarak **veri** değişsin mi
   (28 kayıt), yoksa yalnız gösterimde mi kırpılsın?

## F. ÖNERİLEN DÜZELTME SIRASI (her adım kendi doğrulamasıyla)

| Sıra | Paket | İçerik | Doğrulama |
| --- | --- | --- | --- |
| 1 | **Zaman & kayıt** | A1 + A2 + A8 (kayıt, pause/restore, modal yığını + Esc) | `probe-save`, `probe-time-flow`, `probe-modal-stack` |
| 2 | **Fog** | A3 (metHeroIds kampanyaya taşı, diyalog = tanışma) | `probe-fog` |
| 3 | **Veri doğruluğu** | A5 (klan tımarı), A6 (tek klan modeli) | `Σ klan.fiefCount === krallık.fiefCount`, aynı `clanId` aynı ad |
| 4 | **İçerik** | B1 (kale adları), B2 (bağımsız klan kartı), B9 | `probe-content` |
| 5 | **Erişilebilirlik** | B5 + B6 + A8 ile birlikte ortak `<Modal>` | `probe-a11y` (role/aria/label ölçümü) |
| 6 | **Temizlik** | C1, C5, C6, B8 (README) | `tsc --noUnusedLocals` 0 hata, README kontrol listesi |
| 7 | **Performans** | C2 (kod bölme), C3 (renk token'ları — kademeli) | `vite build` çıktısı: ilk paket < 700 KB |
| 8 | **Test kapsamı** | C4 (5 büyük bileşene duman probu) | `verify:all` sayısı 26 → 31 |
