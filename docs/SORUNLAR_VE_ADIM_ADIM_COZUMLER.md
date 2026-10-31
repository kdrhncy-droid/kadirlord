# Sancak-ı Kalradya: Sorunlar, Kök Neden Analizleri ve Adım Adım Modüler Çözüm Planı

**Tarih:** 1 Kasım 2026  
**Hedef:** Basit kod mimarisi, modüler veri yönetimi, Bannerlord 1.2+ aslına sadakat ve sıfır çökme (zero-crash).

---

## 📋 Genel Bakış ve Öncelik Sıralaması

Kullanıcı tarafından bildirilen ve kod tabanında tespit edilen 11 ana başlık, oynanış kritikliğine göre 3 faza ayrılmıştır:

| No | Konu | Öncelik | Kök Neden / Durum | Çözüm Yaklaşımı |
|---|---|---|---|---|
| **1** | **Beyaz Ekran (Ticaret & Savaş)** | 🔴 ACİL (P0) | React ErrorBoundary yok; `HeroMannequin` her tıklamada WebGLRenderer oluşturup WebGL context limitini patlatıyor; context loss işlenmiyor | `ErrorBoundary` eklenmesi + `HeroMannequin` WebGL context'inin tek sefer kurulup yalnız rig ekipmanının güncellenmesi + `forceContextLoss` ve `webglcontextlost` koruması |
| **2** | **Save / Load Pozisyon Senkronizasyonu** | 🔴 ACİL (P0) | `handleLoadSaveData` ve `continueGame` içinde `playerPositionCommandRef` ve `lordPositionCommandsRef` doldurulmuyor; `WorldCanvas` eski pozisyonda kalıp save verisini eziyor | Load akışında `playerPositionCommandRef` ve `lordPositionCommandsRef`'e anlık komut yazılarak WorldCanvas rotalarının yüklenen koordinatlara zıplatılması |
| **3** | **Savaş Meydanı Yerin Altında Kalan Askerler** | 🔴 ACİL (P0) | `CharacterArenaView` içinde `floorMesh.scale.set(3.5, 1, 3.5)` çağrısı yerel Z eksenini (dünya Y yüksekliği) 3.5 kat büyüterek araziyi 10m yukarı kaldırıyor; birimler ise ölçeksiz formülle hesaplanıyor | Zemin scale çarpanının kaldırılması (`scale.set(1, 1, 1)`); birim yüksekliklerinin arazi mesh tepe noktalarıyla birebir eşitlenmesi |
| **4** | **Savaşta FPS Düşüşü (50v50)** | 🟡 YÜKSEK (P1) | 64 tam iskeletli rig (her birinde 40+ alt mesh ve gölge dökücü), her frame animatör hesabı, limitsiz gölge haritası | Mesafeye dayalı LOD (yakın: tam rig, orta/uzak: basitleştirilmiş instanced model), gölge dökücülerin yalnız yakın çevreye sınırlandırılması, animasyon bütçelemesi (15-30Hz throttling) |
| **5** | **Lord Asker Toplama Davranışı** | 🟡 YÜKSEK (P1) | Lordlar yerleşkeye varınca haritada durmaksızın yürümeye devam ederken asker topluyor | AI Durum Makinesi: `TRAVELING_TO_RECRUIT` → Yerleşkeye varınca `RECRUITING_AT_SETTLEMENT` (3-6 oyun saati hareketsiz bekleme) → `PATROLLING` |
| **6** | **Düşman Harita Renklendirmesi (Kırmızı/Yeşil)** | 🟡 YÜKSEK (P1) | Krallığa girildiğinde veya paralı asker olunduğunda haritadaki düşman yerleşim ve lordları kendi banner renginde kalıyor | Bannerlord standardı: Oyuncunun tarafı = Yeşil, Düşman = Kırmızı, Nötr = Standart/Gri. Tekil saf fonksiyon ile dinamik renk türetimi |
| **7** | **Kuşatma Savunma Orduları (Garnizona Girme)** | 🟢 ORTA (P2) | Kuşatma savunmasına gelen ordular haritada dışarıda bekliyor | Kuşatılan kente varan dost lordun `insideSettlementId` alarak haritadan kalkması (şehre girmesi); dışarıdan gelen takviyenin ise kuşatma halkası dışında beklemesi |
| **8** | **Yerleşim / Kale Üstüne Gelince İçerideki Lordlar** | 🟢 ORTA (P2) | Şehir kartlarında içeride bulunan lordlar listelenmiyor | Warband/Bannerlord yerleşim tooltip'i: "Şehirdeki Soylular: [Lord Adı (Asker Sayısı)]", refah, erzak, garnizon dökümü |
| **9** | **Lord Hover Durum Tooltip'i** | 🟢 ORTA (P2) | Lord üzerine fare götürüldüğünde durum bilgisi çok sınırlı | Bannerlord tooltip: Lord adı, klanı, seviyesi, birlik dökümü (piyade/okçu/süvari), hızı ve anlık hedefi ("Köyden asker topluyor", "X ordusunu takip ediyor") |
| **10** | **Atölye Sistemi Kuralları** | 🟢 ORTA (P2) | Her şehirden atölye alınamaz zannediliyordu; aynı şehirden ikinci atölye için klan seviyesi gerekiyor | Bannerlord formülü: Her şehirden atölye alınabilir; klan seviyesi başına toplam atölye kotası (T1: 1, T2: 2, T3: 3, T4: 4). Aynı şehirde aynı tür atölye kâr düşürür |
| **11** | **Kod Sadeliği & Modüler Veri Yönetimi** | 🔵 SÜREKLİ (Tümü) | Çok büyük monolitik bileşenler (`CharacterArenaView` 5300+ satır, `App.tsx` 3100+ satır), karışık yan etkiler | Küçük, tek sorumluluklu saf fonksiyon modülleri; UI, simülasyon ve WebGL katmanlarının birbirinden bağımsız ayrıştırılması |

---

## 🔍 DETAYLI ANALİZ VE MODÜLER ÇÖZÜMLER

### 1. Beyaz Ekran (Ticaret ve Savaş Çıkışı)

#### Kök Neden:
1. **React 19 ErrorBoundary Eksikliği:** Uygulama kökünde (`main.tsx` veya `App.tsx`) hiçbir `ErrorBoundary` bulunmamaktadır. Render esnasında veya bir event handler sonrasında fırlatılan en ufak bir istisna React ağacını tamamen sökerek ekranı bembeyaz bırakmaktadır.
2. **`HeroMannequin` WebGL Context Tükenmesi:** `HeroMannequin.tsx` bileşeninde `useEffect(..., [showMount, visualOptions])` kullanılmıştır. Pazar veya Ganimet ekranında her bir eşya alımında/satımında `visualOptions` yeni bir obje referansı almakta ve **her tıklamada sıfırdan yeni bir `THREE.WebGLRenderer` oluşturulmaktadır.** Tarayıcıların 8-16 WebGL context limiti dolduğunda en eski context olan `WorldCanvas` veya yeni açılan context `webglcontextlost` ile düşmekte, render loop'u patlamakta ve beyaz ekran oluşmaktadır. Çık-gir yapıldığında tarayıcı sıfırdan taze tek bir context ile açıldığı için düzelmektedir.
3. **`CharacterArenaView` Unmount Temizliği:** Savaştan overworld'e dönerken WebGL context'i `forceContextLoss()` ile serbest bırakılmamakta, bellek ve GPU çakışması yaşanmaktadır.

#### Adım Adım Çözüm:
1. **`src/components/ErrorBoundary.tsx` Oluşturulması:**
   - React `componentDidCatch` ile hataları yakalayan, çökmeyi engelleyen Bannerlord temalı acil durum ekranı.
   - "Seferi Kurtar / Haritaya Dön" düğmesi ile güvenli duruma sıfırlama imkanı.
2. **`HeroMannequin.tsx` Refaktörü:**
   - WebGL renderer, sahne, kamera ve ışıklar **yalnızca bileşen mount olduğunda tek bir defa (`[]`)** oluşturulacak.
   - `visualOptions` değiştiğinde context **asla yeniden oluşturulmayacak**, yalnızca mevcut `heroRig` üzerindeki parçalar `applyEquipmentToRig(heroRig, visualOptions)` ile güncellenecektir.
   - Unmount anında `renderer.forceContextLoss()` çağrılarak GPU context'i anında temizlenecektir.
3. **Context Lost Koruyucusu:**
   - `WorldCanvas.tsx` ve `CharacterArenaView.tsx` canvas elementlerine `webglcontextlost` ve `webglcontextrestored` dinleyicileri eklenerek render döngüsünün sessizce duraklatılıp kurtarılması sağlanacak.

---

### 2. Save / Load Pozisyon Senkronizasyonu

#### Kök Neden:
`App.tsx` içindeki `handleLoadSaveData` ve `continueGame` fonksiyonlarında:
- `campaign.playerX` ve `playerZ` state'e atanıyor fakat `WorldCanvas`'ın dinlediği `playerPositionCommandRef.current = { x: fresh.playerX, z: fresh.playerZ };` çağrısı **yapılmıyordu**.
- Benzer şekilde lordların canlı rotalarını tutan `lordPositionCommandsRef.current` Map'i doldurulmuyordu (yalnızca dışa aktarılan `lordPositionsRef` dolduruluyordu).
- Sonuç olarak `WorldCanvas` kendi içindeki eski `playerOverworldX` ve lord pozisyonlarını çalıştırmaya devam ediyor, bir sonraki `handleUpdatePlayerPos` tikinde kaydedilmiş konumu eski konumla eziyordu.

#### Adım Adım Çözüm:
`handleLoadSaveData` ve `continueGame` bloklarına şu iki kritik satır eklenir:
```ts
// 1. Oyuncu pozisyonunu WorldCanvas motoruna emret
playerPositionCommandRef.current = { x: fresh.playerX, z: fresh.playerZ };

// 2. Lordların pozisyonlarını WorldCanvas canlı rotalarına emret
lordPositionCommandsRef.current.clear();
if (data.lordLivePositions) {
  Object.entries(data.lordLivePositions).forEach(([lordId, pos]) => {
    lordPositionCommandsRef.current.set(lordId, { x: pos.x, z: pos.z });
  });
} else {
  fresh.lords.forEach((l) => {
    lordPositionCommandsRef.current.set(l.id, { x: l.x, z: l.z });
  });
}
```

---

### 3. Savaş Meydanı Yerin Altında Kalan Askerler

#### Kök Neden:
`CharacterArenaView.tsx` satır 1461'de:
```ts
if (floorMesh) floorMesh.scale.set(3.5, 1, 3.5);
```
- Zemin `floorGeo = new THREE.PlaneGeometry(420, 420, 42, 42)` olarak kurulmuş ve `-90°` X rotasyonu verilmiştir.
- Bu rotasyonda yerel Z ekseni, dünya Y eksenine (yükseklik) karşılık gelir.
- `scale.set(3.5, 1, 3.5)` çağrısı yerel Z'yi 3.5 kat büyütür; yani **tepelerin yüksekliği 3.5 kat artarak 10-12 metreye fırlar!**
- Ancak askerler ve oyuncu pozisyon alırken formüldeki ham değeri (`getFieldElevation(x, z)`) kullanır (çarpan yok).
- Bu sebeple zemin görsel olarak askerlerin 7-10 metre yukarısına çıkar ve tüm askerler yerin dibine gömülmüş görünür!

#### Adım Adım Çözüm:
1. `floorMesh.scale.set(3.5, 1, 3.5)` çağrısı kaldırılıp `floorMesh.scale.set(1, 1, 1)` yapılmalıdır (420x420 geometri zaten fazlasıyla geniştir).
2. Askerlerin `y` koordinatı doğrudan `getFieldElevation(x, z)` ile birebir örtüşür; zemin ve askerler milimetrik hizalanır.

---

### 4. 50v50 Savaşta FPS Düşüşü

#### Kök Neden:
1. `CharacterArenaView` 64 adet tam iskeletli rig üretmektedir. Her bir rig'de 40'tan fazla Three.js mesh'i, parmaklar, eklemler, zırh kaplamaları vardır (`64 × 40 = 2560+ mesh`).
2. Her bir parça gölge dökmektedir (`castShadow = true`).
3. Her frame her 64 asker için tam forward kinematics ve kemik rotasyonu hesaplanmaktadır.

#### Adım Adım Çözüm:
1. **LOD (Level of Detail):**
   - Oyuncuya 25 metreden yakın birimler: Tam iskeletli rig + gölge.
   - 25 metreden uzak birimler: Basitleştirilmiş gövde/silah modeli, gölge devre dışı.
2. **Animasyon Güncelleme Bütçesi:**
   - Uzaktaki birimlerin animasyon tikleri her frame değil, 2 frame'de bir (30 FPS) veya 3 frame'de bir (20 FPS) güncellenir.
3. **Menzil Kontrol Optimizasyonu:**
   - Yakın düşman arama döngüsü her frame değil, `aiTimer` periyotlarında (0.2s) çalıştırılır.

---

### 5. Lord Asker Toplama Davranışı (Hareketsiz Durma)

#### Bannerlord Kuralı:
Bannerlord'da bir AI lord asker toplamak için dost bir köye veya şehre gider. Yerleşkeye vardığında haritada **durur** ("Recruiting troops at Village X"), birkaç oyun saati hareketsiz kalır, askerlerini toplar ve ardından devriyeye veya sefere çıkar.

#### Modüler Çözüm (`src/game/lordRecruitmentAi.ts`):
- `LordAgent` durumuna `recruitmentState?: { settlementId: string; remainingHours: number }` eklenir.
- Lord yerleşkeye vardığında canlı rotası `isWaiting: true` yapılır ve hızı 0'a çekilir.
- Süre dolduğunda askerler eklenir ve lord normal devriye rotasına bırakılır.

---

### 6. Harita Renklendirmesi (Düşman Kırmızı, Kendi Taraf Yeşil)

#### Bannerlord Kuralı:
- Bağımsız oyuncu: Tüm krallıklar standart/nötr banner renginde.
- Bir krallığa katılınca (vasal veya paralı asker):
  - Kendi krallığın ve lordların: **Yeşil** (#22c55e)
  - Savaşta olduğun krallıklar, kaleler, köyler ve lordlar: **Kırmızı** (#ef4444)
  - Barışta olduğun yabancı krallıklar: **Nötr / Beyaz-Gri**

#### Modüler Çözüm (`src/game/diplomacyColors.ts`):
```ts
export function getEntityRelationColor(
  entityKingdomId: string,
  playerKingdomId: string | null,
  playerMercenaryFor: string | null,
  wars: KingdomWar[]
): 'friendly' | 'hostile' | 'neutral' {
  const activeKingdom = playerMercenaryFor ?? playerKingdomId;
  if (!activeKingdom) return 'neutral';
  if (entityKingdomId === activeKingdom) return 'friendly';
  const isAtWar = wars.some(
    (w) => (w.attacker === activeKingdom && w.defender === entityKingdomId) ||
           (w.defender === activeKingdom && w.attacker === entityKingdomId)
  );
  return isAtWar ? 'hostile' : 'neutral';
}
```

---

### 7. Kuşatmalarda Savunma Orduları (Garnizona Girme)

#### Bannerlord Kuralı:
Kuşatılan bir kaleyi savunmak isteyen bir lord, kuşatma halkasını yarıp kalenin içine girer (`insideSettlementId`). İçeri girdiğinde haritadaki 3B lord piyonu kaybolur çünkü artık kale garnizonunun komutanıdır. Dışarıda kalan dost ordular ise kuşatmanın menzili dışında toplanıp taarruz anını bekler.

#### Modüler Çözüm:
- Şehre giren lord `insideSettlementId = settlement.id` alır, `WorldCanvas` içinde harita piyonu gizlenir.
- Kale tooltip'inde bu lord "Garnizon Komutanı" olarak listelenir.

---

### 8 & 9. Yerleşim ve Lord Detaylı Hover Tooltip'leri

#### Bannerlord Kuralı:
1. **Yerleşim Üzerine Gelindiğinde:**
   - Şehir/Kale Adı, Bağlı Olduğu Krallık, Sahibi Olan Klan
   - Refah (Prosperity), Erzak (Food), Sadakat (Loyalty)
   - Savunma Kuvveti: Garnizon + Milis
   - **Şehirdeki Lordlar:** "Şehirdeki Soylular: [Lord Adı, Birlik Sayısı]"
2. **Lord Üzerine Gelindiğinde:**
   - Lordun Adı, Unvanı, Klanı ve Klan Seviyesi
   - Parti Büyüklüğü ve Birlik Ayrımı (örn: 54 Asker — 28 Piyade, 16 Okçu, 10 Süvari)
   - Parti Hızı (örn: 4.8)
   - **Mevcut Durum / Faaliyet:** ("Köyden asker topluyor", "Sargoth'a seyahat ediyor", "Düşman birliğini kovalıyor")

---

### 10. Atölye Sistemi (Workshops)

#### Bannerlord Kuralı:
- Her şehirden atölye satın alınabilir.
- Toplam sahip olunabilecek atölye sayısı **Klan Seviyesine (Clan Tier)** bağlıdır:
  - Klan Seviyesi 1: Maks 1 Atölye
  - Klan Seviyesi 2: Maks 2 Atölye
  - Klan Seviyesi 3: Maks 3 Atölye
  - Klan Seviyesi 4+: Maks 4-6 Atölye
- Aynı şehirden birden fazla atölye alınabilir; ancak aynı şehirde aynı türden iki atölye (örn: 2 birahane) açılırsa birbiriyle rekabet edip hammaddeyi tüketir ve kâr düşer.

---

### 11. Kod Sadeliği ve Modüler Veri Yönetimi

#### Yaklaşım:
- Dev dosyalara (`CharacterArenaView.tsx`, `App.tsx`) yeni sistemler doğrudan yapıştırılmayacak.
- Her yeni mekanik (`workshop.ts`, `lordAi.ts`, `mapColor.ts`, `tooltips.ts`) bağımsız, test edilebilir, saf (pure) fonksiyonlar olarak yazılacak.
- State mutasyonları yerine deterministik fonksiyonel veri akışı kullanılacak.
