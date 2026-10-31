

KRİTİK SORUNLAR VE ÇÖZÜMLER
Tarih: 31 Ekim 2026 Proje: Sancak-ı Kalradya: Taht ve Kılıç Durum: Araştırma ve Planlama

İÇİNDEKİLER
Giriş
KRİTİK HATALAR (Öncelik 1)
1. Save/Load Sıfırlanması
2. Beyaz Ekran Bug'ları
3. FPS Düşüşü (50v50+ Savaşlar)
4. Diplomasi Görsel Hatası
MEKANİK HATALARI (Bannerlord Araştırması)
5. Atölye Sistemi
6. Lord Asker Toplama Davranışı
7. Harita Renklendirme
8. Kuşatma Mekaniği
9. Lord Hover Tooltip
KALİTE SORUNLARI
10. Kod Karmaşıklığı
11. Savaş Meydanı Terrain Bug
Öncelik Matrisi
Kaynaklar
GİRİŞ
Bu belge, Kadirlord projesinde tespit edilen 11 kritik sorunu, kök neden analizlerini ve mimari çözüm yaklaşımlarını içermektedir. Her sorun için:

Kök neden analizi (mevcut kod incelemesi)
Bannerlord referansı (uygulanabilirse, kaynaklarla)
Mimari çözüm yaklaşımı (konsept seviyesi)
Etkilenen dosyalar
Riskler ve bağımlılıklar
Önemli: Bu belge yalnızca araştırma ve planlama içerir. Kod implementasyonu içermez.

KRİTİK HATALAR (Öncelik 1)
1. Save/Load Sıfırlanması
🔴 Öncelik: YÜKSEK 📊 Etki: Oynanabilirlik bozucu 📁 Etkilenen Dosyalar: 
saveGame.ts
, 
App.tsx
, 
WorldCanvas.tsx

Kök Neden Analizi
saveGame.ts incelemesinde tespit edilen sorunlar:

Lord pozisyonları yalnız campaign.lords[].x/z'ye kaydediliyor - oyun sırasında kullanılan canlı pozisyon WorldCanvas içindeki lordLiveRoutes ve lordPositionsRefte tutuluyor
Çoklu kayıt yuvaları sistemi var ama tutarsız - SAVE_SLOT_DEFINITIONS tanımlı fakat getSlotStorageKey geriye dönük uyumluluk için slot1'i ana SAVE_KEY'e eşliyor
Göç fonksiyonları (ensureWorld, ensureNotables, ensureBannerlordFoundation) deterministik ancak oyun sırasında değişen dinamik durumları geri yüklemiyor
campaign.world durumu (savaşlar, sayaçlar, kuşatma süreleri) v2'de eklendi ama tam persiste edilmiyor
AGENTS.md'den İlgili Kural
Kural 2: Canlı lord konumunu harita rotası tutar. campaign.lords[].x/z başlangıç/kayıt alanıdır; oyun sırasında otorite WorldCanvas içindeki lordLiveRoutes ve dışa verilen lordPositionsReftir.

Mimari Çözüm
Yaklaşım 1: Tam Durum Normalizasyonu (Önerilen)


SaveData Interface'ine eklenecekler:
├─ lordLivePositions: Map<lordId, {x, z, targetX, targetZ}>
├─ worldCanvasState: { playerCameraPos, siegeMarkers, etc. }
├─ uiSessionState: { timeScale, lastModalStack, etc. }
└─ timestamp: number (kayıt anı, tutarlılık kontrolü için)
Adımlar:

SaveData interface'ini genişlet (v5 versiyonu)
writeSave'de WorldCanvas.lordPositionsRef ve uiSession durumunu da kaydet
readSave'de bu verileri okuyup ilgili ref'lere geri yükle
parseSave içinde v4→v5 göç mantığı ekle
Yaklaşım 2: Snapshot Validation

Her save işleminde:

Kayıt öncesi: mevcut durumdan bir hash üret (player.x, lords[].x, day, gold)
Kayıt sonrası okuma testi: hash'i karşılaştır
Uyumsuzluk varsa kullanıcıya uyarı göster
Etkilenen Dosyalar:


saveGame.ts
 (ana kayıt mantığı)

App.tsx
 (save/load akışı)

WorldCanvas.tsx
 (lord pozisyon ref'lerini dışa ver)

uiSession.ts
 (UI durumu serileştirme)
Riskler:

Geriye dönük uyumluluk: v4 kayıtları okuyamaz hale gelebilir (göç fonksiyonu gerekli)
localStorage boyut limiti: Çok fazla detay kaydedilirse taşma riski
Race condition: Kayıt sırasında oyun devam ederse tutarsızlık
Bağımlılıklar:

P1 test suite'inin güncellenmesi (
probe-save-load.ts
)
E2E testlerine kayıt-yükleme senaryoları eklenmesi
2. Beyaz Ekran Bug'ları
🔴 Öncelik: YÜKSEK 📊 Etki: Oyun akışı bozucu 📁 Etkilenen Dosyalar: 
App.tsx
, 
BannerlordMarketModal.tsx
, 
battleEnginePool.ts

Kök Neden Analizi
Ticaret Sonrası Beyaz Ekran:

BannerlordMarketModal kapatılırken uiSession.resumeTime() çağrılmıyor
Modal state cleanup eksik - React state güncellemesi tamamlanmadan WorldCanvas render'a geçiyor
campaign objesi mutasyondan sonra immutable güncelleme yapılmıyor (React re-render tetiklenmiyor)
Savaş Sonrası Beyaz Ekran:

battleEnginePool.ts dispose sonrası Three.js sahnesi temizlenmiyor
WebGL context kaybolup geri dönüş yapılamıyor
Battle'dan overworld'e geçişte subMode değişimi async ama WebGL hazır değil
Çık-Gir Çözümü Sebebi:

Sayfa yenilenince tüm React state sıfırlanıyor ve temiz bir başlangıç yapılıyor
WebGL context yeniden oluşturuluyor
Mimari Çözüm
Ticaret İçin:

Modal Lifecycle Audit

Her modal'ın onClose handler'ında uiSession.resumeTime() garantile
useEffect cleanup fonksiyonunda state reset yap
Atomic state update pattern kullan (immer.js veya spread operator)
State Transition Guard


App.tsx'te transition lock mekanizması:
- marketClosing = true → render block
- state cleanup complete → marketClosing = false
- render'a izin ver
Savaş İçin:

WebGL Context Recovery

Three.js renderer.dispose() + renderer.forceContextLoss() düzgün çağrılsın
Canvas element'i DOM'dan kaldırıp yeniden ekle
Context lost event listener'ı ekle
Submode Transition Queue


battleEnginePool dispose tamamlanana kadar subMode='battle' tut:
- Dispose başlat
- Promise.all([dispose tüm geometriler, dispose tüm materyaller])
- subMode='overworld' geçişine izin ver
Etkilenen Dosyalar:


App.tsx
 (transition guard)

BannerlordMarketModal.tsx
 (cleanup)

DialogueModal.tsx
 (cleanup)

battleEnginePool.ts
 (dispose mantığı)

uiSession.ts
 (time management)
Riskler:

Memory leak: Dispose eksik olursa Three.js nesneleri bellekte kalır
Race condition: Async cleanup tamamlanmadan yeni render başlarsa çakışma
Test Stratejisi:

E2E test: Ticaret yap → kapat → tekrar aç (5 kez döngü)
E2E test: Savaş → kazan → overworld → tekrar savaş (10 kez)
Memory profiler ile leak kontrolü (Chrome DevTools)
3. FPS Düşüşü (50v50+ Savaşlar)
🔴 Öncelik: YÜKSEK 📊 Etki: Oynanabilirlik 📁 Etkilenen Dosyalar: 
battleEnginePool.ts
, 
instancedArmyRenderer.ts

Kök Neden Analizi
battleEnginePool.ts stepSimulation metodunda:

Her frame 100+ asker için spatial hash rebuild - spatialGrid.rebuild(activeProxies) O(n) karmaşıklık
Projectile collision check O(n*m) - Her ok için tüm askerler kontrol ediliyor
Formation slot calculation her frame - computeFormationSlots() 120 asker için trigonometric hesaplar
No distance-based LOD - Kameranın uzağındaki askerler de full simülasyon alıyor
Separation loop - Her asker için 4 komşu kontrolü, ama çok sık çağrılıyor
Bannerlord Performans Referansı:

Bannerlord 1000+ birimli savaşlarda LOD sistemleri kullanır
Uzaktaki askerler sadece animasyon update alır, fizik simülasyonu almaz
Particle effect density savaş büyüklüğüne göre azaltılır
GPU instancing ile render performansı artırılır
Mimari Çözüm
1. Distance-Based LOD Sistemi


Asker distance kategorileri:
├─ Near (<30m): Full sim + full anim
├─ Mid (30-80m): Reduced sim (0.5x tick rate) + full anim
├─ Far (80m+): No sim + keyframe anim only
└─ Culled (>150m): Skip entirely
2. Spatial Hash Optimizasyonu

Rebuild her frame değil, her 3-4 frame'de bir
Incremental update: yalnız hareket eden askerleri güncelle
Cell size'ı büyüt (şu an muhtemelen çok küçük)
3. Projectile Pooling İyileştirmesi


Mevcut: 10,000 slot projectile pool (iyi!)
Eklenecek:
- Broad-phase culling: Yalnız kamera frustum içindeki oklar collision check alsın
- Hit caching: Aynı frame'de aynı hedefe birden fazla ok isabet ederse tek hasar say
4. Animation Budget System


Frame budget: 16.67ms (60 FPS hedef)
Simulation budget: 8ms
Render budget: 6ms
Overhead: 2.67ms

100+ asker olunca:
- Animation update frequency: 1.0x → 0.5x
- Particle spawn rate: 1.0x → 0.3x
Etkilenen Dosyalar:


battleEnginePool.ts
 (LOD + spatial hash opt)

instancedArmyRenderer.ts
 (render LOD)

tacticalFormation.ts
 (formation caching)
Ölçülebilir Hedefler:

50v50: Min 45 FPS (şu an ~20-25 FPS düşüyor)
100v100: Min 30 FPS
200v200: Min 20 FPS (degraded experience mode)
Riskler:

Gameplay impact: LOD çok agresifse oyuncu uzaktaki düşmanları göremez
Visual pop-in: LOD geçişleri çok keskin olursa fark edilir
Test:

Performance profiler (Chrome DevTools)
battleEnginePool methodlarına manuel timer ekleme
50v50, 100v100, 200v200 benchmark savaşları
4. Diplomasi Görsel Hatası
🟡 Öncelik: ORTA 📊 Etki: UI/UX 📁 Etkilenen Dosyalar: 
DiplomacyModal.tsx
, 
WorldCanvas.tsx

Kök Neden Analizi
Diplomasi modal açılınca harita modu bozulması:

Camera state kaydedilmiyor - Modal açılınca kamera pozisyonu değişiyor ama önceki pozisyon restore edilmiyor
Three.js renderer resize - Modal açılınca canvas boyutu değişiyor, aspect ratio bozuluyor
Z-index conflicts - Modal overlay ile WorldCanvas 3D elementleri çakışıyor
Time scale bug - Diplomasi sırasında zaman duruyor ama lord rotaları güncelleniyor
Mimari Çözüm
1. Camera State Preservation


DiplomacyModal açılmadan önce:
├─ Mevcut camera position, target, zoom kaydet
├─ Modal açılınca camera'yı lock'la (user input disable)
└─ Modal kapanınca saved state'i restore et
2. Canvas Isolation


WorldCanvas'ı iki mode'da çalıştır:
├─ 'interactive': Normal oyun modu, full input
└─ 'background': Diplomasi/modal sırasında, input disabled, fixed camera
3. Modal Lifecycle Hook

typescript

// Pseudo-code
function useDiplomacyModal() {
  const onOpen = () => {
    worldCanvas.saveState();
    worldCanvas.setMode('background');
    uiSession.pauseTime();
  };

  const onClose = () => {
    worldCanvas.restoreState();
    worldCanvas.setMode('interactive');
    uiSession.resumeTime();
  };

  return { onOpen, onClose };
}
Etkilenen Dosyalar:


DiplomacyModal.tsx

KingdomManagementModal.tsx

WorldCanvas.tsx
 (state save/restore API)

uiSession.ts
Riskler:

State corruption: Restore sırasında farklı game state ise çakışma
Performance: Her modal açılışında state snapshot overhead
Test:

E2E: Haritada hareket → diplomasi aç → kapat → pozisyon aynı mı?
E2E: Diplomasi açık iken lordlar hareket etmemeli
MEKANİK HATALARI (Bannerlord Araştırması)
5. Atölye Sistemi
🟢 Öncelik: DÜŞÜK (Mekanik doğruluk) 📊 Etki: Ekonomi dengesi 📁 Etkilenen Dosyalar: 
market.ts
, 
SettlementModal.tsx

Bannerlord Araştırması
Kaynak 1: Mount & Blade Wiki - Workshop

"There should never be more than one workshop of the same kind in a town."

Kaynak 2: Mount & Blade Wiki - Clan

"+1 Workshop limit (2 max)" (Klan seviyeleri için)

Kaynak 3: Steam Tartışması

"You can have more than 1 per city. But the overall amount of workshops you can have is limited by your clan level."

Doğru Mekanik:

✅ Her şehirden atölye alınabilir (aynı şehirden bile birden fazla)
✅ Toplam atölye sayısı klan seviyesiyle sınırlı
✅ Klan Tier 1: Max 1 atölye
✅ Klan Tier 2+: Max 2 atölye
⚠️ Aynı türde atölye (örn. iki demirci) aynı şehirde yarışır, ikisi de az kazanır
Mevcut Kod Durumu
market.ts incelemesinde atölye mantığı yok - yalnız ticaret var. Atölye sistemi muhtemelen başka bir dosyada veya henüz implemente edilmemiş.

Mimari Çözüm
Yeni Modül: 
workshop.ts

typescript

interface WorkshopOwnership {
  workshopId: string;
  settlementId: string;
  workshopType: 'SMITHY' | 'TANNERY' | 'BREWERY' | 'POTTERY' | 'LINEN_WEAVERY';
  purchaseDay: number;
  dailyIncome: number;
}

interface ClanWorkshopLimits {
  tier1: 1,
  tier2: 2,
  tier3: 2,
  tier4: 3,
  tier5: 3,
  tier6: 4
}

function canPurchaseWorkshop(
  campaign: CampaignState,
  settlementId: string,
  workshopType: string
): {allowed: boolean, reason?: string} {
  const ownedCount = campaign.ownedWorkshops?.length ?? 0;
  const clanTier = campaign.clanTier ?? 1;
  const limit = ClanWorkshopLimits[`tier${clanTier}`];

  if (ownedCount >= limit) {
    return {
      allowed: false,
      reason: `Klan seviyeniz ${clanTier} - maksimum ${limit} atölye sahibi olabilirsiniz`
    };
  }

  // Aynı şehirde aynı tür var mı? (Warning, block değil)
  const competingWorkshop = campaign.ownedWorkshops?.find(
    w => w.settlementId === settlementId && w.workshopType === workshopType
  );

  if (competingWorkshop) {
    // İzin ver ama kullanıcıyı uyar
    return {
      allowed: true,
      reason: `Uyarı: Bu şehirde zaten bir ${workshopType} var. Her ikisi de daha az kazanacak.`
    };
  }

  return {allowed: true};
}
UI Değişiklikleri:

SettlementModal içine "Atölye Satın Al" sekmesi:

Mevcut şehirdeki boş atölyeleri listele
Her atölye türü için tahmini gelir göster
"Satın Al" butonunda canPurchaseWorkshop kontrolü
Klan tier yetersizse buton disabled, tooltip ile açıklama
Etkilenen Dosyalar:


workshop.ts
 (yeni dosya)

rules.ts
 (CampaignState interface'ine ownedWorkshops ekle)

SettlementModal.tsx
 (UI)

saveGame.ts
 (workshop persistence)
Riskler:

Ekonomi dengesizliği: Atölye gelirleri çok yüksekse oyun kolay olur
Rekabet mekaniği: Aynı tür atölye rekabetini simüle etmek karmaşık
Öncelik Notu: Kapsam İlkesi'ne göre bu özellik P6-P7 arasında ertelenebilir. Oyun hissini değiştiren savaş/lord mekanikleri önce yapılmalı.

6. Lord Asker Toplama Davranışı
🟡 Öncelik: ORTA (Görsel gerçekçilik) 📊 Etki: AI davranışı, immersion 📁 Etkilenen Dosyalar: 
WorldCanvas.tsx
, 
worldSim.ts

Bannerlord Araştırması
Kaynak 1: Steam - AI Recruitment

"The A.I. gets soldiers in a different way than the player, in the sense that it does not have to physically go to villages to get recruits."

Kaynak 2: Steam - Rapid Recruitment

"They are then able to recruit rapidly from villages/towns since they sort of have cheated max relationship with most notables of their faction."

Doğru Mekanik:

✅ AI lordlar yerleşkelerden asker toplar (oyuncu gibi)
✅ Yerleşkeye gittiklerinde durmaları gerekir (2-6 saat arası)
✅ İlişki seviyesine göre daha iyi birlikler alabilirler
✅ Garnizondaki birliklerini de çekebilirler (anında)
Mevcut Kod Durumu
WorldCanvas.tsx içinde lord hareket mantığı var ama "asker toplama" davranışı eksik. Lordlar sürekli hareket halinde, hiçbir yerde durmuyorlar.

AGENTS.md Kural 2'ye göre:

Canlı lord konumunu harita rotası tutar. campaign.lords[].x/z başlangıç/kayıt alanıdır; oyun sırasında otorite WorldCanvas içindeki lordLiveRoutes ve lordPositionsReftir.

Mimari Çözüm
1. Lord AI Behavior State Machine

typescript

type LordBehavior =
  | 'IDLE'
  | 'PATROLLING'
  | 'RECRUITING'      // ← YENİ
  | 'RAIDING'
  | 'BESIEGING'
  | 'RETREATING';

interface LordAgent {
  id: string;
  x: number;
  z: number;
  behavior: LordBehavior;
  behaviorTimer: number;  // ← YENİ: davranış ne kadar sürecek
  targetSettlementId?: string;
  troopCount: number;
  // ...
}
2. Recruitment Decision Logic

typescript

// worldSim.ts içinde
function decideLordBehavior(lord: LordAgent, campaign: CampaignState): LordBehavior {
  // Eğer asker sayısı düşükse ve savaşta değilse, asker topla
  const troopThreshold = 60;
  const isUnderStrength = lord.troopCount < troopThreshold;
  const notInCombat = !lord.targetEnemyId;

  if (isUnderStrength && notInCombat) {
    return 'RECRUITING';
  }

  // Diğer davranışlar...
  return 'PATROLLING';
}

function updateRecruitingLord(lord: LordAgent, dt: number, campaign: CampaignState) {
  // Hedef yerleşke seç (en yakın friendly settlement)
  if (!lord.targetSettlementId) {
    const nearest = findNearestFriendlySettlement(lord, campaign);
    lord.targetSettlementId = nearest.id;
    lord.behaviorTimer = 0;
  }

  const target = campaign.settlements.find(s => s.id === lord.targetSettlementId);
  const distance = Math.hypot(target.x - lord.x, target.z - lord.z);

  // Yerleşkeye varmışsa DUR
  if (distance < 2.0) {
    if (lord.behaviorTimer === 0) {
      // İlk varış - asker toplama süresini hesapla
      const recruitTime = 4 + (60 - lord.troopCount) * 0.05; // 4-7 saat arası
      lord.behaviorTimer = recruitTime;
    }

    lord.behaviorTimer -= dt;

    if (lord.behaviorTimer <= 0) {
      // Asker toplama tamamlandı
      const recruited = Math.floor(Math.random() * 15 + 10); // 10-25 asker
      lord.troopCount += recruited;
      lord.behavior = 'PATROLLING';
      lord.targetSettlementId = undefined;
    }

    // Pozisyonu DEĞİŞTİRME - yerinde dur
    return;
  }

  // Hâlâ yoldaysa normal hareket
  moveTowardsTarget(lord, target, dt);
}
3. Görsel Feedback

Lord'un üstünde "Asker Topluyor..." metni göster
Settlement ikonunda lord varsa özel bir marker ekle
Lord hover tooltip'te "Recruiting at Sargoth (3.2 hours remaining)" gibi bilgi
Etkilenen Dosyalar:


worldSim.ts
 (AI davranış mantığı)

WorldCanvas.tsx
 (görsel feedback)

rules.ts
 (LordAgent interface'ine behavior state ekle)
Riskler:

Performance: Çok sayıda lord için behavior tree her frame çalışırsa yavaşlama
Predictability: AI çok tahmin edilebilir olursa oyun kolay olur
Test:

E2E: Bir lordu takip et → düşük asker sayısında yerleşkeye gitsin → 5 dakika dursun → asker sayısı artsın
7. Harita Renklendirme
🟡 Öncelik: ORTA (Kullanıcı deneyimi) 📊 Etki: UI/UX, görsel netlik 📁 Etkilenen Dosyalar: 
WorldCanvas.tsx
, 
kingdomSystem.ts

Bannerlord Araştırması
Kaynak 1: Nexus Mod - Blue Allies

"Vanilla Bannerlord only colors settlements with two relation states: your own kingdom (green) and your enemies (red). Everyone else looks identical to total strangers."

Kaynak 2: Fandom - Factions

"A freelance player may hire themselves as a sellsword party, which will be color-coded to the player's custom banner from character creation."

Doğru Mekanik:

✅ Kendi krallık: Yeşil
✅ Düşman krallık: Kırmızı
✅ Müttefik: Vanilla'da ayrım yok (modlar mavi ekliyor)
✅ Nötr: Gri/beyaz
✅ Paralı asker olunca işveren krallık yeşil, düşmanları kırmızı
Mevcut Kod Durumu
WorldCanvas.tsx incelemesinde settlement ve lord renklendirmesi var ama diplomasi durumuna göre dinamik değil. Muhtemelen her krallık kendi banner renginde gösteriliyor.

Mimari Çözüm
1. Faction Relation Color Mapping

typescript

// kingdomSystem.ts içinde
function getEntityColorForPlayer(
  entityKingdomId: string,
  campaign: CampaignState,
  macroState: KingdomMacroState
): 'green' | 'red' | 'gray' {
  const playerKingdomId = campaign.playerKingdomId;
  const isMercenary = campaign.playerMercenaryFor;

  // Oyuncunun krallığı veya işveren (paralı asker)
  const alignedKingdom = isMercenary ?? playerKingdomId;

  if (!alignedKingdom) {
    // Bağımsız oyuncu - hepsi nötr
    return 'gray';
  }

  if (entityKingdomId === alignedKingdom) {
    return 'green'; // Kendi taraf
  }

  // Savaş durumu kontrol et
  const isAtWar = macroState.wars.some(
    w => (w.attacker === alignedKingdom && w.defender === entityKingdomId) ||
         (w.defender === alignedKingdom && w.attacker === entityKingdomId)
  );

  if (isAtWar) {
    return 'red'; // Düşman
  }

  return 'gray'; // Nötr/yabancı
}
2. Visual Rendering Update

typescript

// WorldCanvas.tsx içinde settlement/lord render kısmında
function renderSettlement(settlement: Settlement) {
  const colorCode = getEntityColorForPlayer(
    settlement.kingdomId,
    campaign,
    macroState
  );

  const color = {
    'green': 0x34d399,
    'red': 0xef4444,
    'gray': 0x9ca3af
  }[colorCode];

  // Settlement ikonunu bu renkle çiz
  settlementMesh.material.color.setHex(color);

  // Banner outline da aynı renk
  bannerOutline.material.color.setHex(color);
}
3. Dynamic Update

Diplomasi durumu değiştiğinde (savaş ilan/barış) renkleri güncelle:

typescript

// kingdomSystem.ts içinde declareWar() fonksiyonunda
function declareWar(attackerId: string, defenderId: string, macroState: KingdomMacroState) {
  // ... mevcut mantık

  // Renk cache'ini invalidate et
  invalidateEntityColorCache();
}
Etkilenen Dosyalar:


kingdomSystem.ts
 (color mapping helper)

WorldCanvas.tsx
 (settlement/lord render)

DiplomacyModal.tsx
 (renk legend'i ekle)
UI İyileştirme:

Diplomasi modalına veya harita legend'ine renk açıklaması ekle:


🟢 Yeşil: Kendi krallık/işveren
🔴 Kırmızı: Düşman krallıklar
⚪ Gri: Nötr/yabancı
Riskler:

Performance: Her frame tüm settlementlar için color check yapılırsa yavaşlama
Color blindness: Kırmızı-yeşil renk körlüğü olanlar için alternative (pattern/icon)
Test:

E2E: Bağımsız başla → hepsi gri olmalı
E2E: Krallığa katıl → kendi yeşil, düşmanlar kırmızı
E2E: Savaş ilan edilince renk değişimi
8. Kuşatma Mekaniği
🟡 Öncelik: ORTA (Strateji derinliği) 📊 Etki: Kuşatma realism 📁 Etkilenen Dosyalar: 
WorldCanvas.tsx
, 
worldSim.ts
, 
battleEnginePool.ts

Bannerlord/Warband Araştırması
Kaynak 1: Warband Fandom - Sieges

"If you do not want to assault it directly, you will have to wait until the residents surrender, usually from starvation (30 days in a castle and 100 days in a town)."

Kaynak 2: Steam - Defending Sieges

"Go into the place being besieged and wait for the battle to start. Works even in neutral fiefs so long as you are enemies with the attacking side. Alternatively, wait for the actual fighting to start, then go to the fief to join in."

Doğru Mekanik:

✅ Savunucu lord kale/şehrin içinde bekler (haritada görünür)
✅ Yardım kuvvetleri (relief army) dışarıda bekler, saldırı başlayınca katılır
✅ Kale üstüne mouse götürünce içindeki lord görünür
✅ Oyuncu kaleye girip savunabilir
✅ 30 gün (kale) / 100 gün (şehir) erzak bitince teslim
Mevcut Kod Durumu
WorldCanvas.tsx'te kuşatma kamp visualleri var (SiegeMapMarker, addStaticSiegeCampVisuals) ama garrison lord mekaniği eksik.

battleEnginePool.ts'te siege state var (SiegeAssaultState) ama savunucu lord pozisyonlama yok.

Mimari Çözüm
1. Garrison Lord Positioning

typescript

// rules.ts içinde
interface Settlement {
  // ... mevcut alanlar
  garrisonLordId?: string;  // ← YENİ: şu an içeride olan lord
  garrisonLordEnteredDay?: number;  // hangi gün girdi
}

interface LordAgent {
  // ... mevcut alanlar
  insideSettlementId?: string;  // ← YENİ: şu an hangi settlement içinde
}
2. Siege Garrison Logic

typescript

// worldSim.ts içinde
function updateSiegeDefense(campaign: CampaignState) {
  for (const settlement of campaign.settlements) {
    const siege = settlement.siegeState;
    if (!siege) continue;

    // Bu settlement'ın sahibi olan krallığın lordlarını bul
    const defendingLords = campaign.lords.filter(
      l => l.kingdomId === settlement.kingdomId &&
           l.troopCount > 20 &&
           !l.insideSettlementId
    );

    // En yakın lord'u garrison'a ata
    if (!settlement.garrisonLordId && defendingLords.length > 0) {
      const nearest = findNearest(defendingLords, settlement);

      // Lord kaleye girer
      nearest.insideSettlementId = settlement.id;
      settlement.garrisonLordId = nearest.id;
      settlement.garrisonLordEnteredDay = campaign.day;

      // Haritada görünmez olur (çünkü içeride)
      nearest.x = settlement.x;
      nearest.z = settlement.z;
    }
  }
}
3. Relief Army Behavior

typescript

// Dışarıdan yardıma gelen lordlar
function updateReliefForces(campaign: CampaignState) {
  for (const lord of campaign.lords) {
    if (lord.behavior !== 'RELIEVING_SIEGE') continue;

    const target = campaign.settlements.find(
      s => s.id === lord.targetSettlementId
    );

    if (!target?.siegeState) {
      lord.behavior = 'PATROLLING';
      continue;
    }

    const distance = Math.hypot(target.x - lord.x, target.z - lord.z);

    if (distance < 8.0) {
      // Kuşatma dışında bekle (saldırı başlayınca join et)
      lord.x = target.x + Math.cos(lord.yaw) * 7.0;
      lord.z = target.z + Math.sin(lord.yaw) * 7.0;
      lord.waitingForAssault = true;
    }
  }
}
4. Visual Rendering

typescript

// WorldCanvas.tsx içinde
function renderSiegedSettlement(settlement: Settlement) {
  // Normal settlement render
  renderSettlementIcon(settlement);

  // Garrison lord varsa settlement üstünde göster
  if (settlement.garrisonLordId) {
    const lord = campaign.lords.find(l => l.id === settlement.garrisonLordId);

    // Küçük bir lord portresi settlement ikonunun üstüne
    renderGarrisonLordOverlay(settlement.x, settlement.z + 2, lord);
  }

  // Kuşatma kampı
  renderSiegeCamp(settlement);

  // Relief armies (yardım kuvvetleri)
  const reliefLords = campaign.lords.filter(
    l => l.targetSettlementId === settlement.id && l.waitingForAssault
  );
  reliefLords.forEach(lord => {
    renderLordParty(lord);
    // Lord ile settlement arasına kesikli çizgi çek
    renderReliefConnection(lord, settlement);
  });
}
Etkilenen Dosyalar:


rules.ts
 (interface güncellemeleri)

worldSim.ts
 (garrison/relief mantığı)

WorldCanvas.tsx
 (görsel render)

battleEnginePool.ts
 (relief forces spawn)
Riskler:

Complexity: Relief army timing karmaşık olabilir
AI confusion: Lordlar arasında koordinasyon gerektiriyor
Öncelik Notu: Bu özellik stratejik derinlik ekler ama oyun hissini değiştirmez. P5-P6 aralığında yapılabilir.

9. Lord Hover Tooltip
🟢 Öncelik: DÜŞÜK (UX polish) 📊 Etki: Bilgilendirme 📁 Etkilenen Dosyalar: 
WorldCanvas.tsx

Bannerlord Araştırması
Kaynak 1: Steam Tips

"The ALT key highlights enemy formations and dropped weapons in battle and POI in cities/towns, it also shows detail information on parties on the overworld."

Kaynak 2: Nexus - Party Sorted Tooltip

"Get the party description tooltip sorted by unit number in descending order, allowing for better readability."

Doğru Mekanik:

✅ ALT tuşu basılı iken detaylı bilgi göster
✅ Lord adı ve klanı
✅ Toplam asker sayısı
✅ Birlik kompozisyonu (tier sıralı)
✅ Mevcut davranış (patrolling, raiding, etc.)
✅ Parti hızı ve modifiers
✅ Moral ve gıda kalan gün
✅ Düşman ise tahmini güç (player'a göre)
Mevcut Kod Durumu
WorldCanvas.tsx'te lord hover var ama çok basit - muhtemelen sadece isim gösteriyor.

Mimari Çözüm
1. Detaylı Tooltip Component

typescript

// components/LordPartyTooltip.tsx (yeni dosya)
interface LordPartyTooltipProps {
  lord: LordAgent;
  campaign: CampaignState;
  showDetailed: boolean; // ALT basılı mı?
}

function LordPartyTooltip({lord, campaign, showDetailed}: Props) {
  if (!showDetailed) {
    // Basit mod: Sadece isim
    return <div>{lord.name}</div>;
  }

  // Detaylı mod: Tam bilgi
  const troops = getTroopBreakdown(lord.roster);
  const behavior = getLordBehaviorLabel(lord.behavior);
  const speed = calculatePartySpeed(lord, campaign);

  return (
    <div className="lord-tooltip-detailed">
      <div className="header">
        <strong>{lord.name}</strong>
        <span className="clan">{lord.clanName}</span>
      </div>

      <div className="troops">
        <div>Total: {lord.troopCount}</div>
        {troops.map(t => (
          <div key={t.tier}>
            Tier {t.tier}: {t.count}x {t.name}
          </div>
        ))}
      </div>

      <div className="status">
        <div>Behavior: {behavior}</div>
        <div>Speed: {speed.toFixed(1)} km/h</div>
        <div>Morale: {lord.morale}/100</div>
        <div>Food: {lord.foodDays} days</div>
      </div>

      {lord.isEnemy && (
        <div className="threat">
          Estimated Strength: {getThreatLevel(lord, campaign)}
        </div>
      )}
    </div>
  );
}
2. ALT Key Detection

typescript

// WorldCanvas.tsx içinde
const [altKeyPressed, setAltKeyPressed] = useState(false);

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') setAltKeyPressed(true);
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt') setAltKeyPressed(false);
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
}, []);
3. Hover Detection (Raycasting)

typescript

// WorldCanvas.tsx içinde mouse move handler
function onMouseMove(event: MouseEvent) {
  // Mouse → world coordinates raycasting
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouseNDC, camera);

  // Lord meshlerini intersect et
  const intersects = raycaster.intersectObjects(lordMeshes);

  if (intersects.length > 0) {
    const hoveredLord = intersects[0].object.userData.lord;
    setHoveredLord(hoveredLord);
  } else {
    setHoveredLord(null);
  }
}
Etkilenen Dosyalar:


LordPartyTooltip.tsx
 (yeni component)

WorldCanvas.tsx
 (ALT key + hover detection)

rules.ts
 (troop breakdown helpers)
Riskler:

Performance: Her mouse move'da raycasting yapılırsa yavaşlama
UI clutter: Çok fazla bilgi tooltip'i şişirebilir
Optimizasyon:

Raycasting throttle: 100ms'de bir check et
Tooltip lazy render: Yalnız ALT basılı iken detay fetch et
KALİTE SORUNLARI
10. Kod Karmaşıklığı
🟡 Öncelik: ORTA (Uzun vadeli sürdürülebilirlik) 📊 Etki: Developer experience, maintainability 📁 Etkilenen Dosyalar: Tüm proje

Sorun Analizi
Kod incelemesinde tespit edilen kalite sorunları:

Monolitik dosyalar:

WorldCanvas.tsx: 823+ satır, çok fazla sorumluluk
battleEnginePool.ts: Simulation + rendering + memory management karışık
kingdomSystem.ts: 900+ satır, çok sayıda helper fonksiyon
Sıkı bağımlılıklar:

WorldCanvas direkt campaign objesine bağımlı
Circular dependency riski: App → WorldCanvas → uiSession → App
State management:

Bazı state React'te, bazısı ref'lerde, bazısı global
Tek bir truth source yok
Type safety:

Bazı yerlerde any kullanımı
Interface'ler tam tanımlı değil (optional alanlar çok)
Mimari Çözüm
1. Modüler Yapı (Öncelik: Yüksek)


src/
├─ game/
│  ├─ campaign/          # Kampanya state management
│  │  ├─ state.ts
│  │  ├─ actions.ts
│  │  └─ selectors.ts
│  ├─ simulation/        # Dünya simülasyonu
│  │  ├─ lordAI.ts
│  │  ├─ economy.ts
│  │  └─ siege.ts
│  ├─ battle/            # Savaş motoru
│  │  ├─ engine.ts
│  │  ├─ rendering.ts
│  │  └─ physics.ts
│  └─ persistence/       # Save/load
│     ├─ saveGame.ts
│     └─ migrations.ts
├─ components/
│  ├─ world/             # Harita bileşenleri
│  │  ├─ WorldCanvas.tsx
│  │  ├─ LordRenderer.tsx
│  │  └─ SettlementRenderer.tsx
│  └─ ui/                # UI modals
│     ├─ MarketModal.tsx
│     └─ DiplomacyModal.tsx
└─ lib/                  # Paylaşılan utilities
   ├─ spatial/           # Spatial hashing
   ├─ math/              # Math helpers
   └─ hooks/             # React hooks
2. State Management Standardizasyonu

Seçenek A: Zustand (Önerilen - hafif, TypeScript-first)

typescript

// stores/campaignStore.ts
import create from 'zustand';

interface CampaignStore {
  campaign: CampaignState;
  updateLord: (lordId: string, update: Partial<LordAgent>) => void;
  addGold: (amount: number) => void;
  // ...
}

const useCampaignStore = create<CampaignStore>((set) => ({
  campaign: initialCampaign,
  updateLord: (id, update) => set((state) => ({
    campaign: {
      ...state.campaign,
      lords: state.campaign.lords.map(l =>
        l.id === id ? {...l, ...update} : l
      )
    }
  })),
  // ...
}));
Seçenek B: React Context + useReducer (Vanilla, dependency yok)

typescript

// contexts/CampaignContext.tsx
const CampaignContext = React.createContext<{
  state: CampaignState;
  dispatch: Dispatch<CampaignAction>;
}>(null!);

function campaignReducer(
  state: CampaignState,
  action: CampaignAction
): CampaignState {
  switch (action.type) {
    case 'UPDATE_LORD':
      return {
        ...state,
        lords: state.lords.map(l =>
          l.id === action.lordId ? {...l, ...action.update} : l
        )
      };
    // ...
  }
}
3. Type Safety İyileştirmeleri

typescript

// Strict null checks
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,  // array[i] → array[i] | undefined
    "exactOptionalPropertyTypes": true
  }
}

// Branded types (ID safety)
type LordId = string & { __brand: 'LordId' };
type SettlementId = string & { __brand: 'SettlementId' };

function createLordId(id: string): LordId {
  return id as LordId;
}

// Artık yanlışlıkla settlement ID'yi lord ID yerine geçiremezsin
4. Refactoring Stratejisi

Faz 1: Büyük dosyaları böl (1-2 hafta)

WorldCanvas.tsx → WorldCanvas.tsx + LordRenderer.tsx + SettlementRenderer.tsx
battleEnginePool.ts → BattleEngine.ts + BattleRenderer.ts
Faz 2: State management birleştir (1 hafta)

Zustand veya Context seç
campaign state'ini merkezi store'a taşı
Ref'leri azalt (yalnız Three.js nesneleri için kullan)
Faz 3: Type safety sıkılaştır (1 hafta)

any kullanımlarını temizle
Branded types ekle
Strict mode aç
Faz 4: Test coverage artır (devam eden)

Her modül için unit test
Integration testler
Etkilenen Dosyalar:

Tüm proje (kademeli refactoring)
Riskler:

Regression: Refactoring sırasında bug girme riski
Team coordination: Birden fazla kişi çalışıyorsa merge conflict
Hafifletme:

Her refactoring sonrası verify:all + test:e2e çalıştır
Küçük PR'lar (her biri bir dosya/modül)
Feature freeze: Yeni özellik eklerken refactoring yapma
11. Savaş Meydanı Terrain Bug
🔴 Öncelik: YÜKSEK (Görsel/gameplay bozucu) 📊 Etki: Savaş deneyimi 📁 Etkilenen Dosyalar: 
battleEnginePool.ts
, 
BattleCanvas.tsx
 (varsayılan)

Kök Neden Analizi
Askerler yerin altında kalma sorunu:

Y pozisyonu sabit - battleEnginePool.ts'te soldierY array'i var ama stepSimulation içinde güncellenmemiş
Terrain mesh yok - Düz bir zemin var, tepe/vadi simülasyonu yok
Raycasting eksik - Asker spawn edilirken terrain yüksekliği kontrol edilmiyor
Collision detection - Yalnız horizontal (X/Z) separation var, vertical (Y) yok
stepSimulation metodunda:

typescript

// Line 500+ - Y pozisyonu hiç güncellenmiyor
this.soldierX[i] = x;
this.soldierZ[i] = z;
// soldierY[i] güncellenmesi YOK!
Ayrıca siege wall collision var ama terrain collision yok:

typescript

// Line 600+
if (this.siege.enabled && !this.siege.gateBreached) {
  // Z axis wall check var
  if (team === 1 && z < -20.6) {
    z = -20.6;  // Wall blocker
  }
}
// Ama terrain Y check yok!
Mimari Çözüm
1. Terrain Height Map Ekleme

typescript

// battleEnginePool.ts içinde
class BattleMemoryPool {
  // Mevcut arrays...
  private terrainHeightMap: Float32Array;  // ← YENİ
  private terrainGridSize: number = 128;   // 128x128 height grid
  private terrainWorldSize: number = 200;  // 200m x 200m alan

  constructor() {
    // ...
    this.terrainHeightMap = new Float32Array(
      this.terrainGridSize * this.terrainGridSize
    );
    this.generateTerrainHeightMap();
  }

  private generateTerrainHeightMap() {
    // Basit Perlin noise veya sine wave ile tepe/vadi üret
    for (let z = 0; z < this.terrainGridSize; z++) {
      for (let x = 0; x < this.terrainGridSize; x++) {
        const idx = z * this.terrainGridSize + x;

        // Basit sine wave (test için)
        const worldX = (x / this.terrainGridSize) * this.terrainWorldSize - 100;
        const worldZ = (z / this.terrainGridSize) * this.terrainWorldSize - 100;
        const height = Math.sin(worldX * 0.05) * 2 + Math.cos(worldZ * 0.08) * 1.5;

        this.terrainHeightMap[idx] = Math.max(0, height);
      }
    }
  }

  private getTerrainHeight(worldX: number, worldZ: number): number {
    // World space → grid space
    const gx = ((worldX + 100) / this.terrainWorldSize) * this.terrainGridSize;
    const gz = ((worldZ + 100) / this.terrainWorldSize) * this.terrainGridSize;

    // Clamp to grid bounds
    const x = Math.max(0, Math.min(this.terrainGridSize - 1, Math.floor(gx)));
    const z = Math.max(0, Math.min(this.terrainGridSize - 1, Math.floor(gz)));

    const idx = z * this.terrainGridSize + x;
    return this.terrainHeightMap[idx];
  }
}
2. Soldier Y Position Update

typescript

// stepSimulation içinde movement sonrası
this.soldierX[i] = x;
this.soldierZ[i] = z;

// ← YENİ: Terrain height'a snap et
const terrainY = this.getTerrainHeight(x, z);
this.soldierY[i] = Math.max(terrainY, this.soldierY[i] - 9.8 * dt);  // Gravity + terrain
3. Spawn Position Fix

typescript

// spawnBattleArmies içinde
for (let i = 0; i < count; i++) {
  const x = spawnX + (Math.random() - 0.5) * spread;
  const z = spawnZ + (Math.random() - 0.5) * spread;

  const terrainY = this.getTerrainHeight(x, z);  // ← YENİ

  this.soldierX[idx] = x;
  this.soldierY[idx] = terrainY + 0.05;  //約5cm yukarıda spawn
  this.soldierZ[idx] = z;
  // ...
}
4. Visual Terrain Mesh (BattleCanvas)

typescript

// BattleCanvas.tsx içinde (varsayılan dosya adı)
function createTerrainMesh(heightMap: Float32Array, gridSize: number) {
  const geometry = new THREE.PlaneGeometry(
    200,  // world size
    200,
    gridSize - 1,  // segments X
    gridSize - 1   // segments Z
  );

  // Height map'ten vertex pozisyonlarını güncelle
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getY(i);  // PlaneGeometry'de Y yukarı, Z ileri

    const height = heightMap[i];
    positions.setZ(i, height);
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x7a9450,  // Çimen yeşili
    roughness: 0.9,
    metalness: 0.1
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;  // Yatay konumda
  return mesh;
}
Etkilenen Dosyalar:


battleEnginePool.ts
 (terrain heightmap + Y update)

BattleCanvas.tsx
 (terrain mesh rendering - varsayılan ad)
Performance Optimizasyon:

Terrain height lookup her frame 100+ asker için yapılacak. Optimize et:

typescript

// Cache-friendly lookup
private cachedTerrainHeights: Map<string, number> = new Map();

private getTerrainHeightCached(x: number, z: number): number {
  const key = `${Math.floor(x)}_${Math.floor(z)}`;
  if (this.cachedTerrainHeights.has(key)) {
    return this.cachedTerrainHeights.get(key)!;
  }

  const height = this.getTerrainHeight(x, z);
  this.cachedTerrainHeights.set(key, height);
  return height;
}
Riskler:

Collision complexity: Terrain collision siege wall collision ile çakışabilir
Performance: 128x128 heightmap her frame lookup performans etkisi
Test:

Unit test: getTerrainHeight(0, 0) doğru değer dönsün
E2E: Savaş başlat → askerlerin hepsi zemin üstünde olmalı
Performance: 100 asker için frame time < 16ms
ÖNCELİK MATRİSİ
Sorun	Öncelik	Etki	Çözüm Süresi	Bağımlılık
1. Save/Load Sıfırlanması	🔴 Yüksek	Oynanabilirlik bozucu	3-5 gün	P1 test
2. Beyaz Ekran Bug'ları	🔴 Yüksek	Oyun akışı bozucu	2-4 gün	-
3. FPS Düşüşü	🔴 Yüksek	Oynanabilirlik	5-7 gün	Performance profiling
11. Terrain Bug	🔴 Yüksek	Savaş deneyimi	2-3 gün	-
4. Diplomasi Görsel	🟡 Orta	UI/UX	1-2 gün	-
6. Lord Asker Toplama	🟡 Orta	Immersion	2-3 gün	WorldSim refactor
7. Harita Renklendirme	🟡 Orta	UI/UX	1-2 gün	KingdomSystem
8. Kuşatma Mekaniği	🟡 Orta	Strateji derinliği	4-6 gün	WorldSim + BattleEngine
10. Kod Karmaşıklığı	🟡 Orta	Sürdürülebilirlik	2-4 hafta	-
5. Atölye Sistemi	🟢 Düşük	Ekonomi dengesi	2-3 gün	-
9. Lord Hover Tooltip	🟢 Düşük	UX polish	1 gün	-
Önerilen Uygulama Sırası
Sprint 1 (1-2 hafta): Kritik Bug'lar

Beyaz Ekran Bug'ları (hızlı kazanım)
Terrain Bug (savaş deneyimi düzeltme)
Save/Load Sıfırlanması (en kritik)
Sprint 2 (1-2 hafta): Performans 4. FPS Düşüşü (LOD + optimization)

Sprint 3 (1-2 hafta): UI/UX İyileştirmeleri 5. Harita Renklendirme 6. Diplomasi Görsel Hatası 7. Lord Hover Tooltip

Sprint 4 (2-3 hafta): Mekanik Derinlik 8. Lord Asker Toplama Davranışı 9. Kuşatma Mekaniği 10. Atölye Sistemi

Devam Eden: Kod Kalitesi 11. Kod Karmaşıklığı (kademeli refactoring, her sprint'te biraz)

KAYNAKLAR
Bannerlord Resmi Kaynaklar
Mount & Blade Wiki - Workshop
Mount & Blade Wiki - Clan
Mount & Blade Wiki - Sieges
Mount & Blade Wiki - Factions
Steam Topluluk Tartışmaları
Workshop Limits
ALT Key Functionality
AI Recruitment
Defending Sieges (Warband)
Modlar (Referans)
Nexus - Party Sorted Tooltip
Nexus - Blue Allies
Teknik Kaynaklar
Three.js Performance Best Practices
React Performance Optimization
TypeScript Strict Mode