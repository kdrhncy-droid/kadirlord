# 🛡️ BANNERFORGE (armory-studio) — Depo İncelemesi ve Entegrasyon Planı

> **Tarih:** 2026-10-21
> **İnceleme kapsamı:** `workspace-01a15ba3-f746-7506-9ce7-4057d8bad525.zip` (10.0 MB, 81 dosya) + mevcut oyun deposu (`kadirlord`, ~30.000 satır TS)
> **Amaç:** Low-poly Bannerlord hedefi doğrultusunda zip içindeki "yeni kodların" depoya nasıl ve hangi sırayla bağlanacağını netleştirmek.

---

## 1. Depoda ne var? (mevcut durum — Sancak-ı Kalradya)

Tümüyle kodla üretilen (dışarıdan `.glb`/`.fbx`/doku yüklemeyen) bir tarayıcı Bannerlord denemesi:

| Katman | Dosyalar | Durum |
| :--- | :--- | :--- |
| Karakter iskeleti | `characterRig.ts` (1.492 s.) | 19+ eklem, ekipman soketleri, `WarHorseRig` |
| Animasyon + 4 yönlü dövüş | `characterAnimator.ts` (1.816 s.) | up/down/left/right, feint, shield bash, blok, yay nişanı |
| IK | `ik.ts` | analitik 2-eklem kol IK |
| Arena | `CharacterArenaView.tsx` (2.840 s.) | pointer-lock TPS, duel/skirmish/mass battle |
| Stratejik harita | `mapGen.ts` + `WorldCanvas.tsx` | 2400×1800 kıta, 211 yerleşim |
| Kalabalık savaş | `battleEnginePool.ts`, `instancedArmyRenderer.ts`, `tacticalFormation.ts` | 1000 asker, 10.000 ok/ceset havuzu, formasyon |
| Kampanya | `rules.ts`, `campaignSystem.ts`, `kingdomSystem.ts`, `marketRules.ts` | 211 yerleşim, pazar, krallık divanı |
| UI | 10 modal (`SettlementModal`, `BannerlordMarketModal`, …) | menüler tam |

**Kısa değerlendirme:** Oynanış/kampanya/AI katmanı çok ileri; **görsel varlık (model) katmanı zayıf** — miğfer 4 çeşit, zırh 4 kademe, silah 5 tip, kalkan 3 tip, tek tip "kutu-insan" estetiği. Low-poly Bannerlord'un "görsel kimliği" burada eksik kalıyor.

---

## 2. Zip içinde ne var? (BannerForge Engine)

```
armory-studio/
  armory-studio.html    505 KB  ← tek dosya derlenmiş çalışan demo (CDN importmap + three 0.169)
  demo/app.ts            82 KB  ← vitrin / laboratuvar / instans / 500v500 savaş arayüzü
  demo/shell.html + style.css
  src/                   ~1.5 MB, 9 modül, ~10.000 satır
  test/*.mjs             13 adet smoke/debug betiği
  tools/fix1..13.py      13 adet tek seferlik yama betiği + build_html.js
  shot_*.png             27 adet ekran görüntüsü (zip kökünde)
```

### `src/` modülleri

| Modül | Satır | Ne yapıyor |
| :--- | ---: | :--- |
| `Core.ts` | 1.242 | `sweep` (loft), `shellSweep`, `bendGeometry`, `lathe`, weld/capHoles, `MaterialLibrary`, `BudgetTracker`, LOD tablosu |
| `Rig.ts` | 778 | 19 eklemli insan iskeleti + **at iskeleti**, `ANIMATION_CLIPS` (idle/walk/attackSword/attackAxe/block/shootBow/…), poz sistemi |
| `Armory.ts` | 2.930 | **22 prosedürel ekipman**, 3 LOD (`hero`/`battle`/`crowd`), 150 üçgen bütçeli savaş sürümleri, saldırı animasyon tarifleri (`AttackSpec`) |
| `Armor.ts` | 906 | **10 kuşanma bölgesi × 3 tier** (hafif/orta/ağır) modüler zırh, set birleştirme |
| `Character.ts` | 817 | Gövde + zırh + silah + kalkan + miğfer montajı, `EQUIPMENT_MOUNTS`, `bakeToGeometry()` |
| `Horse.ts` | 825 | 3 ırk (war/steppe/destrier), zırhlı barding, binici bağlama |
| `Faction.ts` | 803 | 5+ fraksiyon paleti + **prosedürel heraldik** (11 arma tipi), sancak, sorguç |
| `Army.ts` | 1.106 | 500v500: **poz bake** stratejisi + `InstancedMesh`, simülasyon |
| `BattleSoundFX.ts` | 985 | 6 prosedürel savaş sesi (osilatör + noise + reverb), 0 ses dosyası |

**Bu kodun değeri:** Mevcut oyunda eksik olan **"varlık fabrikası"** (asset factory). Yani yeni zırh/silah/fraksiyon/at üretmek = parametre değiştirmek.

---

## 3. İki sistemin mimari karşılaştırması

| Konu | Mevcut oyun (`src/game`) | Zip (BannerForge) | Sonuç |
| :--- | :--- | :--- | :--- |
| Animasyon | **Gerçek zamanlı** iskelet + IK, her karede eklem güncelleme | **Poz bake**: her klip/faz için geometri önceden pişirilir | Çakışma değil, **tamamlayıcı**: oyuncu/1v1 → IK, 1000 asker → bake |
| Eklem adları | `pelvis, torso, neck, head, leftShoulder, leftUpperArm…` | `root, pelvis, spine, chest, neck, head, shoulderL/R, upperArmL/R…` | ⚠️ **Eşleme tablosu gerekli** (aşağıda) |
| Silah tutuşu | soket `Group`'ları (`rightWeaponSocket`) | `weaponR`/`weaponL` eklemleri + `EQUIPMENT_MOUNTS` | Dönüştürülebilir |
| Ekipman çeşitliliği | 5 silah / 3 kalkan / 4 miğfer / 4 zırh | 22 ekipman / 10 bölge×3 tier / 11 arma / 3 at | **Zip açık ara önde** |
| Malzeme | Parça başına `MeshStandardMaterial` (8 materyal) | Tek `mergePieces` + `vertexColors` + flatShading | Kalabalıkta zip daha hızlı |
| Ses | `sound.ts` (207 s.) basit | `BattleSoundFX.ts` panner + reverb + limiter | Zip daha iyi; taşınabilir |
| three.js sürümü | `^0.186.1` (npm) | `^0.169.0` (CDN importmap) | ⚠️ Sürüm farkı → npm 0.186 ile derlenmeli |
| Import stili | `./modul.ts` | `./Modul.js` (TS'te `.js` uzantısı) | Vite'da `allowImportingTsExtensions` ile uyumlu hale getirilmeli |
| Arayüz | React + Tailwind | saf DOM (`demo/app.ts`), `innerHTML` | Vitrin React'e taşınmalı ya da ayrı statik sayfa olarak servis edilmeli |

---

## 4. Eklem eşleme tablosu (entegrasyonun kalbi)

| BannerForge (`Rig.ts`) | Mevcut oyun (`characterRig.ts`) |
| :--- | :--- |
| `root` / `pelvis` | `root` / `pelvis` |
| `spine` + `chest` | `torso` (tek eklem — `spine`'ı `torso`'ya, `chest`'i `torso`'nun çocuğu olarak ekle) |
| `neck` / `head` | `neck` / `head` |
| `shoulderL` / `upperArmL` / `forearmL` / `handL` | `leftShoulder` / `leftUpperArm` / `leftForearm` / `leftHand` |
| `shoulderR` / `upperArmR` / `forearmR` / `handR` | `rightShoulder` / `rightUpperArm` / `rightForearm` / `rightHand` |
| `thighL` / `shinL` / `footL` | `leftThigh` / `leftShin` / `leftFoot` |
| `weaponR` / `weaponL` | `rightWeaponSocket` / `leftShieldSocket` |
| `head` ekipmanı | `helmetSocket` |
| `chest`/`pelvis` zırh | `chestArmorSocket` + `left/rightPauldronSocket` |

> Not: Kemik **offset uzunlukları** iki motorda farklı (`HUMANOID` vs `RIG_DIMENSIONS`). Parçaları eklem düğümüne bağladığımız için bu fark sadece montaj ofsetlerini (`EQUIPMENT_MOUNTS.position`) etkiler; iskeleti birebir eşitlemek gerekmez.

---

## 5. Önerilen entegrasyon yolu (3 faz)

### Faz A — "Vitrin" (düşük risk, 1 oturum)
1. `src/armory/` altına zip'in `src/*.ts` dosyalarını **olduğu gibi** kopyala (`.js` → `.ts` import düzeltmesi, three 0.186 ile derleme testi).
2. React tarafında `ArmoryShowcaseModal.tsx` (veya `CharacterCreatorModal` içine sekme): ekipman kataloğu + 360° manken. `demo/app.ts` içindeki sahne kurulumu (ışık, zemin, kamera, ekipman seçimi) React'e port edilir — DOM/`innerHTML` kısmı atılır.
3. Bu faz sayesinde **oyun görselleri değişmeden** yeni modeller gözle doğrulanır.

### Faz B — Pazar/karakter ekranlarını yeni modellere geçir (orta risk)
1. `BannerlordMarketModal` ve `CharacterCreatorModal`'daki manken `createCharacterRig` → `Character` (zip) ile değiştirilir; `Armor.ts` sayesinde zırh yuvaları (`HEAD/SHOULDERS/BODY/GLOVES/BOOTS`) gerçekten parça parça görünür olur.
2. `Armory.ts` kataloğu (`ARMORY_CATALOG`) mevcut `marketRules.ts` ekipman listesine **id eşlemesiyle** bağlanır (`gladius ↔ ONE_HANDED_SWORD`, `recurveBow ↔ BOW`, `lance ↔ SPEAR`, `kiteShield ↔ KITE_SHIELD` …). Ekonomi/denge değişmez, sadece görsel + isim zenginleşir.
3. `Faction.ts` heraldik → sancaklar, kalkan arma yüzeyleri ve şehir bayrakları.

### Faz C — Arena & savaş sahnesi (yüksek etki, yüksek risk)
1. `CharacterArenaView` içindeki oyuncu rig'i **korunur** (IK'lı gerçek zamanlı kontrol şart), ama gövde/zırh/silah geometrileri zip'ten gelir.
2. `instancedArmyRenderer` tarafında zip'in **poz-bake + `InstancedMesh`** yolu ile mevcut SoA (`Float32Array`) bellek modeli birleştirilir → 1000 askerde üçgen/draw-call düşer, görsel çeşitlilik artar.
3. `BattleSoundFX.ts`, `sound.ts`'in yerine (veya yanına) geçirilir; 3B pan ile meydan sesi.

---

## 6. Depoda tespit edilen mevcut sorunlar (entegrasyondan bağımsız)

| # | Sorun | Durum |
| :--- | :--- | :--- |
| 1 | `npm install` **başarısız**: `esbuild@^0.25.0` (devDep) ↔ `vite@8` peer `esbuild@^0.27\|\|^0.28` çakışması | ✅ `--legacy-peer-deps` ile kuruldu; kalıcı çözüm `esbuild` sürümünü `^0.28`'e çekmek veya devDep'ten çıkarmak |
| 2 | `tsc --noEmit` **2 hata** (önceden var): `battleEnginePool.ts:645-646` → `FormationStatsModifier` tipinde `lateralSpacing` / `depthSpacing` yok | Düzeltilmeli (küçük) |
| 3 | Vite dev sunucusu uzak önizleme host'unu reddediyordu (403) | ✅ `vite.config.ts` → `server.allowedHosts: true` |
| 4 | Zip kökünde 27 adet `shot_*.png` (10 MB) + `armory-studio/tools/fix*.py` (13 adet) | Bunlar motorun parçası değil; arşiv klasörüne alınmalı, repoya girmemeli |
| 5 | Depoda 10 MB'lık zip sürüm kontrolünde | Kalabilir; alternatif: `docs/` altına taşı veya `.gitignore`'a `*.zip` ekle |

---

## 7. Sonuç / tavsiye

- Zip **çöp değil, tersine projenin en değerli parçası**: oyunda eksik olan "model ve ekipman çeşitliliği" katmanını tamamlıyor.
- Ancak **doğrudan savaş sahnesine takılmamalı**. Sıra: **Faz A (vitrin) → Faz B (pazar/karakter) → Faz C (arena + kalabalık)**.
- En kritik iki teknik iş: (1) three 0.186 + Vite uyumu, (2) eklem eşleme katmanı (`rigBridge.ts`).
- Bonus: zip'in `BattleSoundFX.ts` ve `Faction.ts` heraldik motoru, oyuna **dosya eklemeden** büyük oranda "Bannerlord hissi" katar.

---

## 8. UYGULAMA DURUMU (2026-10-21 — ilk entegrasyon turu)

### ✅ Tamamlananlar

| # | İş | Dosya |
| :--- | :--- | :--- |
| 1 | BannerForge motoru (8 modül, ~9.300 satır) repoya alındı, derlenir durumda | `src/armory/` |
| 2 | Eklem köprüsü + kalibrasyon tablosu (BannerForge eklemleri → bizim rig) | `src/game/armoryBridge.ts` |
| 3 | **Zırh** (hafif/orta/ağır, 10 bölge) oyuncu rig'ine takılıyor | `applyArmoryArmor` |
| 4 | **Silah** (kılıç, çift elli, mızrak/kargı — fraksiyona göre klan/balta/topuz) | `createArmoryWeapon` |
| 5 | **Kalkan** (yuvarlak / uçurtma / pavise) | `createArmoryShield` |
| 6 | **Miğfer** (kettle hat / nasal / great helm) | `createArmoryHelmet` |
| 7 | **Ok** (uçan mermi + sırtta sadak) | `createArmoryArrow` / `createArmoryQuiver` |
| 8 | **Savaş sesleri** (6 efekt, prosedürel, reverb + limiter) `sound.ts`'e bağlandı | `src/game/armorySound.ts` |
| 9 | **At** üreticisi hazır (3 ırk, zırhlı barding) — sahneye bağlanmadı | `createArmoryHorse` |
| 10 | Tarayıcısız doğrulama betiği: `npm run verify:armory` | `scripts/verify-armory.ts` |

**Doğrulama sonuçları (hepsi geçiyor):**
- 66 ekipman (22 × 3 LOD): NaN yok, üçgen bütçesi aşılmıyor.
- Yerleşim paritesi: BannerForge modeli, eski modelin **tam olarak durduğu yerde** (kayma 0.00–0.23 m, boyut oranı 0.77–1.30).
- Zırh kapsama: tüm uzuv zırhları vücudu dışarıdan sarıyor (+9…+12 mm marj).
- Mevcut birim testleri: **28/28 geçiyor**, `tsc --noEmit` temiz, `vite build` başarılı.

**Kıyaslama anahtarı:** konsolda `__bannerforge.off()` / `__bannerforge.on()` ile eski ↔ yeni görseller arasında geçiş yapılabilir (değişiklik bir sonraki ekran girişinde etkili olur).

### ⏳ Sıradaki tur

1. **Yaylar:** Mekanik yaya bağlı (`stringGeo`, `restNock`, `nockedArrow` animasyonu). BannerForge yayının uç noktaları farklı eksende; kirişin uçlara oturması için dönüş + ölçek çözülmeli. Yanlış hizalanırsa kiriş havada asılı kalır → ayrı ve dikkatli bir tur gerekiyor.
2. **At:** `createArmoryHorse` hazır ama arena'nın `WarHorseRig` sistemi kendi iskeleti/animasyonuyla çalışıyor. İki at sistemini birleştirmek yerine, BannerForge atını **kalabalık süvarileri** için kullanmak daha güvenli.
3. **Vitrin ekranı:** 22 ekipmanı 360° mankenle gösteren React ekranı (zip'in `demo/app.ts`'i port edilmeden, sıfırdan).
4. **Gövde:** Şu an bizim "kalın" gövdemiz + BannerForge zırhı kullanılıyor. BannerForge gövdesine geçilirse zırh kalibrasyonu gereksizleşir ve görsel bütünlük artar (riskli, ölçümle yapılmalı).

---

## 9. KARAKTER OLUŞTURMA EKRANI · KAFA DÜZELTMESİ (2026-10-21)

### Sorun
Karakter oluşturma ekranında yüz "yok" gibiydi: sadece iki siyah leke ve düz bir top.

### Tespit edilen 4 kök neden (hepsi ölçümle doğrulandı)

| # | Hata | Kanıt |
| :--- | :--- | :--- |
| 1 | **Gözler kafatasının içindeydi** — göz kutuları `z = 0.119`'da, kafatası yüzeyi o noktada `z ≈ 0.131` | Sadece fasetli yüzeylerden rastgele taşan siyah kutular görünüyordu |
| 2 | **Saç "back taper"ı 360° tam silindirdi** — yüzün tam ortasında bant gibi duruyor, gözleri kapatıyordu | İzolasyon render'ı: saç tek başına yüzü örten siyah bir halka |
| 3 | **Sakallar ağzın üstünden başlıyordu** — kutu yığınları `y = HEAD.cy - 0.11`'den yukarı taşıyordu | Sakal render'ında ağız tamamen kapalı |
| 4 | **Yüz parçası yoktu** — burun, ağız, kaş, kulak, elmacık hiç üretilmiyordu | `characterRig.ts` içinde yalnızca 2 göz kutusu + 1 burun kutusu vardı |

Ek olarak: BannerForge miğferleri kendi (daha küçük) kafasına göre ölçekliydi → bizim kafamızda göz hizasına iniyordu; zırh setinin `head` bölgesi de ikinci bir miğfer üretiyordu.

### Yapılanlar
- **`src/game/characterFace.ts` (yeni):** yüz katmanı sıfırdan yazıldı — göz akı + iris + bebek, kaş, burun (köprü/uç/delik gölgesi), üst-alt dudak + ağız çizgisi, kulak, çene. Tüm plakalar **elipsoid yüzeyinden hesaplanan z** ile oturtulur (`surfaceZ`), böylece hiçbir parça kafatasının içinde kalmaz.
- **DNA entegrasyonu:** `applyFaceDNA` göz rengi, burun uzunluğu/köprü, kaş belirginliği, çene uzunluğu, çene genişliği ve yüz şeklini (oval/kare/yuvarlak/köşeli/keskin) canlı uygular.
- **Saç:** 360° silindir → ense yayı; perçemler alın çizgisine çekildi; `shoulder_wavy` ve `royal_braid` başlıkları göz hizasının üstünde bitecek şekilde kısaltıldı; Nordik örgüler kulak arkasına alındı.
- **Sakal (7 stil yeniden):** çene kütlesi tek parça altıgen prizma + koni uç (üst üste binen kutular kafatasını kesiyordu), bıyık yüzeyin dışında, ağız açık kalıyor.
- **Miğfer kalibrasyonu:** tip başına ölçek/ofset tablosu (`HELMET_FIT`); zırh setinden gelen ikinci miğfer atlandı; miğfer takılıyken saç gizlenir, kapalı miğferde yüz gizlenir.
- **Kamera:** "Yüz" kadrajı 1.52 m → 1.88 m'ye (gerçek kafa merkezi) alındı, mesafe 0.72 m.

### Doğrulama (tarayıcısız)
`npm run verify:armory` → **7 bölüm, tümü geçiyor**; yeni bölümler:
- **6) Yüz:** 11 parçanın tamamı kafatasının dışında/görünür konumda.
- **7) Saç & sakal:** 8 saç stili göz hizasını kapatmıyor, 7 sakal stili göz hizasının altında.

Görsel kanıt: `docs/renders/hair-styles.png`, `beard-styles.png`, `helmets.png`
(`npx tsx scripts/render-styles.ts` ile yeniden üretilir — tarayıcı/WebGL gerekmez.)

Mevcut testler: **28/28 geçiyor**, `tsc` temiz, `vite build` başarılı.

## 10. YAY / NİŞAN ALMA MEKANİĞİ (2026-10-21)

### Sorun
Kullanıcı bildirimi: *"nişan alma tuşuna bastığın anda zaten oku fırlatıyor"* — yani nişan ile bırakma ayrışmıyordu ve basılı tutma çalışmıyordu.

### Tespit edilen 5 kök neden (hepsi `scripts/probe-bow.ts` ile ölçüldü)

| # | Hata | Kanıt (ölçüm) |
| :--- | :--- | :--- |
| 1 | **`advance()` hold sonrası klibi bitiriyordu.** `a.t = holdAt` yapılınca `a.t >= d.duration` de doğru oluyor (`holdAt == duration`) → `bow_draw` 0.7 sn'de kendiliğinden iptal | 1200 ms basışta `bowDraw` 0.73 → **0.35 → 0** |
| 2 | **`envelope()` hold sırasında fade-out uyguluyordu** — `duration - t` üzerinden hesaplandığı için ağırlık sıfıra düşüyor, poz çöküyordu | Çekiş dolarken omuz/kol geri bırakıyor (render ile doğrulandı) |
| 3 | **`release()` gecikmeli `current.bowDraw`'a bakıyordu** — kare bazlı yumuşatılmış değer; önceki atıştan kalan 1.0 yüzünden tuşa basıldığı anda atış sayılıyordu | Basış anında `current.bowDraw` hâlâ 1.0 |
| 4 | **`onMouseUp` yay kontrolü yapmıyordu** — her sol tık bırakışı `anim.release()` çağırıyordu (HUD'a tıklamak bile ok atıyordu) | `CharacterArenaView.tsx` eski `onMouseUp` |
| 5 | **`isAimingBow` state'i ref'e geri yazılıyordu** (`useEffect`) — hızlı bas-bırak sonrası ref "true"da kalıp sonraki tıkta anında atışa yol açıyordu | Aynı dosya |

### Yapılanlar
- **`characterAnimator.ts`**
  - `heldAtHold` bayrağı + `if (heldAtHold) return;` → holdAt'ta bekleyen klip bitmez.
  - `envelope()`: basılı tutulabilen eylemde (`held && holdAt !== undefined`) fade-out **hiç** uygulanmaz → çekiş boyunca tam ağırlık.
  - `release()`: karar, eylemin **kendi zamanından** `samplePiecewise` ile hesaplanır (`bowDrawProgressOf`); `current.bowDraw` artık kullanılmaz.
  - `BOW_MIN_RELEASE_DRAW = 0.25` — altında bırakılırsa `cancelAction()`: **ok takılı kalır, atış olmaz** (Bannerlord davranışı).
  - Yeni API: `getBowDrawProgress()`, `getLastBowPower()`, `cancelBowDraw()`.
- **`CharacterArenaView.tsx`**
  - Sol tık = nişan başlat (`bow_draw`, hold). Sağ tık = `cancelBowDraw()` (atış yok).
  - Bırakma yalnızca gerçekten nişan alınıyorsa işlenir; `isAimingBow` sadece arayüz içindir, ref'e geri yazılmaz.
  - HUD: nişan sırasında **canlı çekiş gücü çubuğu** (her karede DOM'a yazılır, React render'ı yok) + `%25` eşik çizgisi ve "altında bırakırsan ok takılı kalır" ipucu. Kamera FOV'u da çekişle 40°→34° arasında daralır.
  - `FlyingArrow.power`: ok **hızı** `ARROW_SPEED × (0.45 + 0.55 × güç)`, **hasar** kuklada `50 + 40 × güç`, bot üzerinde `20 + 32 × güç`; tam çekişte ayrı renk/metin.
- **`scripts/probe-bow.ts` (yeni regresyon testi)** — 60/200/500/1200 ms basış senaryoları + iptal senaryosu.
- **`scripts/render-bow.ts`, `scripts/render-bow2.ts`** — tarayıcısız çekiş render'ı (`docs/renders/bow-draw.png`, `bow-draw-closeup.png`).

### Doğrulama (tarayıcısız)
```
✓ basılı tut (1.4 sn)    bırakma doluluğu 1.00 → atış
✓ orta basış (0.5 sn)    bırakma doluluğu 0.70 → atış
✓ çok kısa tık (0.1 sn)  bırakma doluluğu 0.00 → atış YOK
✓ anlık tık (0.03 sn)    bırakma doluluğu 0.00 → atış YOK
✓ basılı tutunca çekiş dolu kalıyor (1.00 sabit)
✓ iptal edilen nişan ok fırlatmıyor
```
Kiriş geometrisi: uç noktaları uzuv uçlarıyla birebir aynı `(0, brace, ±0.56)`; nok noktası dinlenmede `y=0.13`, tam çekişte `y=0.785` — çekiş **okçuya doğru** (bow-local `+Y`), yani string gerçekten geriliyor.

`npx tsc --noEmit` temiz · `npm run verify:armory` 7/7 · `npx tsx --test src/game/rules.test.ts` 28/28 · `npx vite build` başarılı.
