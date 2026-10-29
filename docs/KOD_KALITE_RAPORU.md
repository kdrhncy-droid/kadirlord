# Kadirlord — Kod Kalite, Mimari ve Bannerlord Uyum Raporu

> **Tarih:** 2026-10-28  
> **Kapsam:** `src/App.tsx`, `src/game/` ve `src/components/` altındaki tüm başlıca dosyalar  
> **Yöntem:** Statik okuma + grep analizi; hiçbir çalıştırma yapılmadı

---

## 1. Özet Bulgular

| Alan | Durum | Kritiklik |
|---|---|---|
| `App.tsx` ve `WorldCanvas.tsx` god-object büyüklüğü | 🔴 Ciddi | Yüksek |
| `calculateLearningLimit` ve benzer fonksiyon çoğaltmaları | 🟠 Önemli | Orta |
| `rules.ts` süper-modül (4500+ satır) | 🔴 Ciddi | Yüksek |
| `FACTION_INFO.glyph` ve emoji kalıntıları (WorldCanvas, CharacterArenaView) | 🟠 Önemli | Orta |
| `instancedArmyRenderer` frustumCulled=false evrensel açık | 🟡 Makul | Orta |
| Bannerlord'da olmayan `hireMercenariesAtTavern` sabit 4 süvari+okçu | 🟠 Önemli | Orta |
| Paralı asker sözleşme sistemi (Görev 6.3) eksik | 🟡 Ertelendi | Düşük |
| `CharacterArenaView.tsx` emoji bıçakları | 🟡 Düşük | Düşük |
| Soylu birlik ağacı (Görev 5.1) eksik | 🟡 Ertelendi | Düşük |

---

## 2. Kod Kalitesi — Teknik Borçlar

### 2.1 God-Object Dosyaları

**`src/App.tsx` — ~3170 satır**

`App.tsx`, React uygulamasının tek bileşeni olmaya devam ediyor. İçeriğinde:

- 40'tan fazla `setCampaign(...)` çağrısı (satır başına sayım: en az 40 adet)
- 20'den fazla `useState` ve `useRef` bildirimi
- 3 ayrı `setInterval` döngüsü (günlük tick, saatlik tick, lord devşirme) — satır 1117–1184
- Tüm modal açma/kapama mantığı
- Savaş sonucu çözümü, kuşatma kararları, tutsaklık arayüzü, karakter oluşturucu akışı

Bu yapı, mevcut kodu anlamayı ve yeni özellik eklemeyi gittikçe zorlaştırıyor. Her `setCampaign` çağrısı potansiyel bir re-render tetikler; bazıları aynı render döngüsü içinde ardışık tetikleniyor.

**Kanıt:** `src/App.tsx` satır 1117–1184 — üç ayrı `setInterval` aynı `useEffect` bloğu yerine ayrı bloklarda tanımlı.

**`src/components/WorldCanvas.tsx` — ~3340 satır**

Tek bir `useEffect` içinde:
- Three.js sahne kurulumu (terrain, yerleşim modelleri, lord askerleri)
- requestAnimationFrame döngüsü
- Kovalama/kaçma karşılaşma motoru
- Kuşatma marker DOM manipülasyonu
- Lord konumu senkronizasyonu (lordPositionsRef)
- Fare/klavye olayları

Three.js ve React sınırı sağlıklı: `useRef` aracılığıyla Three.js sahnesine erişim var, render'a dokunmayan imperatif kod `useEffect` içinde. Ancak dosya hâlâ tek bir React bileşeni içinde 3340 satır Three.js ve oyun mantığı barındırıyor. Sahne kurulumu, animasyon döngüsü ve karşılaşma mantığını ayrı hook'lara (`useWorldScene`, `useEncounterLoop`) çıkarmak okunabilirliği artırır.

**`src/game/rules.ts` — ~4500+ satır**

Bu dosya; veri türleri, sabitler, asker toplama, ticaret, eser sistemi, pazar, garnizon, kuşatma bombası, birim upgrade, bina yükseltme, günlük dünya tiki, yetenek puanları ve klan kademesi gibi tamamen birbirinden bağımsız 20+ sistemi bir arada tutuyor. Spesifik kanıt: satır 785'te `calculatePartyStrength`, satır 966'da `calculatePrisonerRansomValue`, satır 1519'da `settlementWorkshopIncome`, satır 3307'de `calculateSettlementDailyStats`, satır 4047'de `calculateLearningLimit`, satır 4053'te `calculateClanTier` — hepsi aynı dosyada.

### 2.2 Duplike Fonksiyonlar

**`calculateLearningLimit`** iki farklı yerde tanımlı:

1. `src/game/rules.ts` satır 4047:
   ```typescript
   return focusPoints * 30 + (attributeValue - 1) * 10;  // doğrudan formül
   ```

2. `src/game/characterDevelopment.ts` satır 92:
   ```typescript
   return calculateLearningSoftCap(attributeValue, focusPoints);  // foundation'a delege
   ```

3. `src/game/bannerlordFoundation.ts` satır 2169:
   ```typescript
   return (attribute - 1) * 10 + focus * 30;  // referans implementasyon
   ```

Üçü de aynı sonucu üretiyor; ancak `rules.ts` versiyonu `bannerlordFoundation.ts`'deki `clampInt` çağrısını atladığından `attributeValue < 1` veya `focusPoints > 5` gönderilirse farklı davranabilir. Bu bir kayan sessiz hata riskidir.

**Aynı pattern diğer fonksiyonlarda da var:**
- `calculateClanTier` sadece `rules.ts`'te tanımlı, doğru. Ama `kingdomSystem.ts` içindeki `calculateWarDesireAndTribute` ve `calculateSettlementClaimantMerit` fonksiyonları da `rules.ts`'deki `calculatePartyStrength` üzerinden dolaylı olarak çakışan hesaplar yapıyor.

### 2.3 Magic Numbers

`rules.ts` içinde sabitlenmemiş sayı örnekleri (doğrudan tespit, seçmeli liste):

| Satır yakını | Değer | Ne için? |
|---|---|---|
| `hireMercenariesAtTavern` | `120`, `4`, `2`, `2` | Meyhane maliyeti ve sabit asker sayısı |
| `settlementWorkshopIncome` | `20`, `0.08` | Atölye taban kârı |
| `calculatePartyStrength` | `14`, `18`, `32`, `28`, `45` | Birim savaş puanı çarpanları |
| `bombardSettlementWalls` | `280`, `16` | Goldloot, yiyecek ganımeti |
| `securityLoyalty` | `64`, `50`, `62.5`, `72.0` | Güvenlik/sadakat başlangıç değerleri |

Bunların çoğu Bannerlord kaynaklı formüller — iyi belgelenmiş. Ama `SIEGE_CAMP_STANDOFF`, `INTERCEPT_RADIUS`, `ENCOUNTER_COOLDOWN_SEC` gibi kritik sabitler `encounter.ts` ve `siegeMechanics.ts`'de export sabiti olarak doğru yapılandırılmış. Standart tutarsız.

### 2.4 Tip Güvenliği

- `rules.test.ts` satır 1201 ve 1205: `(l: any)` kullanımı — test dosyasında, üretim kodu değil.
- `bannerlordFoundation.ts` ve `rules.ts` genelinde `any` yok, `unknown` yerine explicit typelar kullanılıyor. Genel TypeScript disiplini güçlü.
- `CharacterArenaView.tsx` dosyasında bazı event handler'lar `as any` dönüşümü içerebilir (tam okuma yapılmadı, büyük dosya).

---

## 3. Mimari Değerlendirme

### 3.1 State Yönetimi

`CampaignState` tek bir büyük nesne; tüm oyun durumu burada. Bu Bannerlord'un kendi veri modeliyle uyumlu ama React için tehlikeli: `state.settlements` (211 yerleşim) her günlük tick'te spread operatörle kopyalanıyor. 211 yerleşim × 40 lord × troopStacks × günlük periyot ciddi nesne baskısı yaratır.

**Kanıt:** `rules.ts` içindeki `advanceDailyEconomyAndWorld` ve `worldSim.ts` içindeki `advanceWorldDay` her çağrıda `{...state, settlements: [...state.settlements.map(...)]}` benzeri tam kopya üretiyor.

**Öneri:** Kampanya state'ini React state'inden ayırmak yerine, `useRef` içinde tutulup yalnızca görüntü için gerekli alanlar (`gold`, `day`, `roster`, `playerHp`, vb.) React state'e yansıtılabilir. Bu mevcut mimarinin büyük bir kırılması olacağından kısa vadede yapılmamalı; uzun vadeli borç olarak işlenmelidir.

### 3.2 Modül Sorumluluk Dağılımı

Sorumluluklar çok net ayrışmış olmasa da işlevsel bir bölünme var:

| İyi ayrışmış | Sorunlu |
|---|---|
| `foodSystem.ts`, `logistics.ts`, `partySystem.ts`, `siegeMechanics.ts` | `rules.ts` (her şey) |
| `bannerlordFoundation.ts` (veri temeli) | `WorldCanvas.tsx` (sahne + mantık + olaylar) |
| `kingdomSystem.ts` (siyasi sistem) | `App.tsx` (tüm event handler'lar + JSX) |
| `encounter.ts`, `campaignSystem.ts` | — |

### 3.3 Three.js / React Sınırı

Genel olarak sağlıklı: Three.js nesneleri `useRef` ile saklanıyor, state geçirimi `props` üzerinden yapılıyor. `WorldCanvas.tsx` içinde `document.createElement` ile oluşturulan DOM overlay elemanları (kuşatma marker'ları, lord etiket kartları) `useRef` ile tutulmayan ve silindi mi kontrol edilmeyen elementler barındırıyor — bunlar component unmount olunca sızmaz çünkü `renderer.domElement.parentElement` temizleniyor, ama leak senaryoları yeniden mount'ta oluşabilir.

**Pre-allocated module-scope math helpers:**
```typescript
const _v1 = new THREE.Vector3();
const _projVec = new THREE.Vector3();
// ...
```
Bu pattern doğru — requestAnimationFrame döngüsünde GC baskısını önlemek için module scope'ta nesneler önceden ayrılmış.

---

## 4. Bannerlord Uyumu Analizi

### 4.1 Paralı Asker (Mercenary) Taverna Sistemi

**Mevcut durum (`rules.ts` `hireMercenariesAtTavern`):**
```typescript
const cost = 120;
// ...
cavalry: state.roster.cavalry + 2,
archer: state.roster.archer + 2,
```
Sabit 120 dinar, her zaman 2 süvari + 2 okçu veriyor. Gerçek Bannerlord'da:
- Meyhane yalnızca paralı asker **sözleşme** sunar (Görev 6.3 ertelendi); bireysel asker değil.
- Taverna'dan asker devşirme yoktur; bu Bannerlord mantığından sapmaktadır.
- YAPILACAKLAR listesi Adım 6.3'te tanımlandığı gibi "Paralı Asker Sözleşmesi" ayrı bir sistem olacak.

**Öneri:** Bu fonksiyon şu hâliyle Bannerlord'a uyumsuz. Geçici bir yer tutucu değil, aktif kullanımda. YAPILACAKLAR'a not düşülmeli: meyhane sadece depolama, moral ve NPC etkileşimi sağlamalı; asker devşirme eşraf üzerinden yapılmalı.

### 4.2 Kültür Birlik Ağaçları

`bannerlordFoundation.ts` içindeki kültür ağaçları ve `troops.ts` içindeki temsilci adlar kontrol edildi. Battania'da atlı okçu yok, Vlandia'da atlı okçu yok — bu doğru. Khuzait ve Aserai'da atlı okçu var — doğru. Empire'da `CULTURES_WITH_HORSE_ARCHERS` içinde var (`rules.ts` satır 548) — doğru (Bucellarii hattı).

### 4.3 Savaş Meydanı (CharacterArenaView)

`CharacterArenaView.tsx` içinde emoji kalıntıları mevcut (🛡️, ⚔️, 🏹, 🏰, ☠️, ❤️, 💥 vb.). Kullanıcı talebi "emojileri kaldır, Bannerlord nasılsa öyle yap" — bu dosyada henüz yapılmamış. Görev 8.11 kapsamında başlanmış ama `CharacterArenaView.tsx` dışarıda kalmış.

### 4.4 `FACTION_INFO.glyph` Alanı

`rules.ts` içindeki `FACTION_INFO` nesnesi hâlâ emoji `glyph` alanları içeriyor:
```typescript
player: { glyph: '🦅' },
vlandia: { glyph: '🦁' },
// ...
```
`WorldCanvas.tsx` satır 1336'da `fac.glyph` doğrudan HTML içine yazılıyor. `CharacterCreatorModal.tsx` bu glyphleri SVG'lere çeviriyor (doğru yaklaşım) ama `WorldCanvas.tsx`'de hâlâ emoji olarak kullanılıyor.

### 4.5 Dünya Simülasyonu Hızı

`worldSim.ts` deterministik ve `Math.random()` içermiyor — doğru. Günlük tick 16000ms / timeScale olarak ayarlanmış (`App.tsx` satır 1117). 4x hızda saniyede 1 gün geçiyor. Bannerlord'da 1 gerçek dakika ≈ 1 oyun saati (1x hız). Mevcut sistemde 1x hızda 16 saniyede 1 gün bu standartla yaklaşık uyumlu.

### 4.6 Yerleşim Sistemi

`calculateSettlementDailyStats` (`rules.ts`) refah, güvenlik, sadakat hesaplarında Bannerlord formüllerine yakın değerler kullanıyor. Güvenlik başlangıcı şehir için 62.5, kale için 72.0 — doğru kaynaklı. Sadakat 64 varsayılanı — Bannerlord wiki ile tutarlı.

**Eksik:** Atölye sistemi şu an 4 basit tür (`BREWERY`, `SMITHY`, `OLIVE_PRESS`, `WEAVERY`). Bannerlord'da 11 resmi atölye var (YAPILACAKLAR Adım 6.1). Bu bilinen ertelenmiş görev, sahte arayüz konmamış — doğru uygulama.

---

## 5. Low-Poly 3D ve Three.js Performansı

### 5.1 Güçlü Yönler

- **GPU Instancing:** `instancedArmyRenderer.ts` içinde torso, kask, kalkan, silah, at, ceset ve mermi için ayrı `InstancedMesh` nesneleri mevcut. 500v500 savaşta birim sayısından bağımsız draw-call sayısı — mimari doğru.
- **LOD sistemi:** `src/armory/` altında `'hero' | 'battle' | 'crowd'` üç kademeli LOD tanımlanmış. Polygon bütçesi korunuyor (piyade ~400-800 üçgen battle LOD'da).
- **Pre-allocated math helpers:** `WorldCanvas.tsx` en üstünde module-scope `_v1`, `_projVec`, `_camTarget` vb. — requestAnimationFrame'de GC baskısı yok.
- **Geometri dispose:** `proceduralModels.ts`, `characterRig.ts`, `battleTerrain.ts`, `siegeVisuals.ts` tüm geçici geometrileri dispose ediyor.

### 5.2 Sorunlar

**`frustumCulled = false` evrensel:**

`instancedArmyRenderer.ts` içinde tüm instanced mesh'lerin `frustumCulled = false` olarak ayarlandığı görüldü:
```typescript
helmetInstanced.frustumCulled = false;
shieldInstanced.frustumCulled = false;
weaponInstanced.frustumCulled = false;
// ...
```
Bu savaş alanında neden kabul edilebilir (savaş kamerası tüm birlikleri görür), ancak aynı pattern harita görünümüne taşınırsa 211 yerleşim modeli, tüm lord modelleri vs. frustum dışında olsa bile render'lanır. Harita tarafında `proceduralModels.ts`'deki yerleşim modellerinin frustum culling durumu ayrıca kontrol edilmeli.

**WorldCanvas içinde her frame DOM manipülasyonu:**

Kuşatma marker'ları ve lord tooltip HTML elamanları her animasyon karesinde `style.transform` ile güncelleniyor:
```typescript
rec.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, 6px)`;
```
`lastSx !== sx || lastSy !== sy` delta kontrolü var — bu iyi. Fakat her kare tüm görünür lord ve yerleşim etiketleri için string interpolasyon + DOM yazımı yapılıyor. 40 lord + 211 yerleşim → yüksek yük. CSS transform yerine `will-change: transform` ve Canvas/WebGL text rendering düşünülebilir.

**`RoomEnvironment` kullanımı:**

`WorldCanvas.tsx` üst kısmında `import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'` görülüyor. Bu genellikle IBL (Image-Based Lighting) için kullanılır ve PMREMGenerator gerektirir. Low-poly flat-shaded geometride beklenen görsel faydası sınırlı; ilk yükleme süresine maliyet katar.

---

## 6. Öncelikli 5 İyileştirme (Etki/Maliyet Oranı)

### #1 — `rules.ts` Bölünmesi (Yüksek Etki, Orta Maliyet)

`rules.ts` 4500+ satırlık süper-modülden şu bölünme önerilir:

```
rules.ts (sadece tipler, sabitler, FACTION_INFO, UNIT_DEFINITIONS — ~500 satır)
  ↓
partyRules.ts    → recruitUnit, calculatePartyStrength, calculatePartyDailyWage
economyRules.ts  → buyFoodAtSettlement, hireMercenariesAtTavern, atölye gelirleri
settlementRules.ts → calculateSettlementDailyStats, buildCanonicalCalradiaSettlements
characterRules.ts → calculateLearningLimit, calculateClanTier, allocateAttributePoint
```

Bu değişiklik kodu kırmaz (re-export wrapper'lar ile geriye uyumlu kalır), test kapsamını artırır ve birden fazla ajanın aynı anda çalışmasını kolaylaştırır.

**Dosyalar:** `src/game/rules.ts`  
**Yan etki:** `src/App.tsx` import listesi güncellenir; test dosyaları dokunulmaz.

### #2 — `calculateLearningLimit` Duplikasyonunun Giderilmesi (Orta Etki, Düşük Maliyet)

`rules.ts` içindeki `calculateLearningLimit` kaldırılıp `bannerlordFoundation.ts`'deki `calculateLearningSoftCap`'a bırakılabilir. Tüm çağıranlar zaten `characterDevelopment.ts`'deki versiyonu kullanıyor; `rules.ts`'teki versiyon sadece `GameHud.tsx` içinden doğrudan import ediliyor olabilir — kontrol edilmeli.

**Dosyalar:** `src/game/rules.ts`, `src/game/characterDevelopment.ts`, `src/components/GameHud.tsx`

### #3 — `FACTION_INFO.glyph` Emoji Temizliği (Orta Etki, Düşük Maliyet)

`rules.ts` içindeki `FACTION_INFO` nesnesinden `glyph` alanı kaldırılıp `CharacterCreatorModal.tsx`'deki `HERALDIC_SVG_EMBLEMS` mantığı `WorldCanvas.tsx` tooltip'lerine de uygulanmalı. `CharacterArenaView.tsx` içindeki tüm emoji string'leri (🛡️, ⚔️, 🏹 vb.) düz metin veya SVG ikonlara dönüştürülmeli.

Bu, kullanıcının doğrudan talebidir ("Bannerlord'da nasılsa öyle yapalım") ve YAPILACAKLAR 8.11'in kapanmamış parçasıdır.

**Dosyalar:** `src/game/rules.ts`, `src/components/WorldCanvas.tsx`, `src/components/CharacterArenaView.tsx`

### #4 — `hireMercenariesAtTavern` Bannerlord Uyum Düzeltmesi (Yüksek Etki, Düşük Maliyet)

Mevcut implementasyon Bannerlord'dakinden farklı çalışıyor: meyhane birim devşirme yeri değil; paralı asker sözleşmesi ayrı bir sistemdir (Adım 6.3). Kısa vadede bu fonksiyonun en azından belgelenmesi ve yerine:

- Sabit 4 asker yerine: `availablePool` yerleşim refahına göre değişken olmalı
- 120 dinar sabit maliyet yerine: `baseWage * poolSize * 3` gibi formül tabanlı

Uzun vadede Adım 6.3 uygulandığında bu fonksiyon tamamen kaldırılır.

**Dosyalar:** `src/game/rules.ts`

### #5 — `App.tsx` İçindeki Savaş Döngüsü Ayrıştırması (Yüksek Etki, Orta Maliyet)

`App.tsx` içindeki 3 `setInterval` döngüsü (günlük tick, saatlik tick, lord devşirme) ve `handleBattleEnd` gibi 50-100 satırlık savaş çözüm callback'leri `useCampaignTick`, `useWorldClock` gibi özel hook'lara çıkarılabilir. Bu `App.tsx`'i 3170 → ~2000 satıra indirir.

**Dosyalar:** `src/App.tsx` + yeni `src/hooks/useCampaignTick.ts`, `src/hooks/useWorldClock.ts`

---

## 7. Kanonik Listeye İşlenecek Yeni Bulgular

Aşağıdaki maddeler keşfedildi; YAPILACAKLAR_LISTESI.md'ye eklenmesi gerekiyor:

1. **`hireMercenariesAtTavern` Bannerlord uyumsuzluğu:** Mevcut implementasyon sabit asker veriyor; Bannerlord'da meyhane bireysel asker devşirme yeri değil. Adım 6.3 öncesinde en azından formül tabanlı havuz büyüklüğüne geçilmeli.

2. **`FACTION_INFO.glyph` emoji kalıntısı `WorldCanvas.tsx`'te:** Görev 8.11 kapsamında başlanmış ama WorldCanvas tooltip HTML'i ve CharacterArenaView.tsx eksi kalmış.

3. **`rules.ts` bölünmesi teknik borcu:** 4500+ satırlık süper-modül gelecekteki paralel geliştirmeyi engeller; P7 veya sonrasında ele alınmalı.

4. **`calculateLearningLimit` duplikasyonu sessiz hata riski:** `rules.ts`'teki versiyon `clampInt` koruyucusunu atlıyor; kritik değil ama birleştirilmeli.

---

## 8. Sonuç

Kod tabanı, oyun mekaniğini Bannerlord'a yaklaştırma açısından önemli bir olgunluk seviyesine ulaşmış. Birlik ağaçları, esaret sistemi, kuşatma mekaniği, pazar ekonomisi ve karakter gelişimi iyi araştırılmış formüllerle uygulanmış. Teknik borçların büyük çoğunluğu god-object boyutu (`rules.ts`, `App.tsx`, `WorldCanvas.tsx`) ve bir kaç duplike fonksiyondan kaynaklanıyor. Bu borçlar oyun deneyimini şu an bozmasa da geliştirme hızını düşürür. Three.js tarafı instanced rendering, LOD sistemi ve dispose disiplini bakımından güçlü; frustum culling eksikliği harita modu için incelenmeli.

**En kritik kısa vadeli adım:** Görev 8.11 kapsamındaki emoji temizliğini `CharacterArenaView.tsx` ve `WorldCanvas.tsx` tooltip HTML'ine de taşımak — bunlar zaten ertelenmiş iş değil, tamamlanmış olduğu işaretlenen ama eksik kalmış parçalar.
