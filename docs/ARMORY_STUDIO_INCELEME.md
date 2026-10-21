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
