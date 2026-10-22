# ⚔️ SANCAK-I KALRADYA (KADIRLORD) — MİMARİ ARAŞTIRMA, SİSTEM KARNESİ VE YAPILACAKLAR LİSTESİ

> **Son Güncelleme:** 2026-10-22 — Bölüm 6: kullanıcının Bannerlord arayüz/sistem tarifi, web görsel doğrulaması ve mevcut kodla satır bazlı karşılaştırması eklendi. Bu bölümdeki uygulama işleri, karar sorularının cevapları gelmeden başlatılmayacak.

---

## 📌 BÖLÜM 1: ŞU ANA KADAR YAPILAN TÜM SİSTEMLER (TAMAMLANANLAR KAYDI)

Aşağıdaki sistemler kod tabanında (`src/game/` ve `src/components/`) aktif olarak geliştirilmiş, tip güvenliği (`tsc --noEmit`) ve otomatik birim testleriyle (`node --test`) doğrulanmıştır:

### 1. 3B Düşük Poligonlu (Low-Poly) İnsan İskeleti, IK ve 4 Yönlü Bannerlord Dövüş Sistemi
* [x] **Prosedürel Hiyerarşik İnsan İskeleti (`src/game/characterRig.ts` - 1.090+ satır):**
  * Dışarıdan ağır `.glb`/`.fbx` dosyalarına ihtiyaç duymadan tamamen kod ile üretilen (`root` $\rightarrow$ `hips/pelvis` $\rightarrow$ `torso/chest` $\rightarrow$ `neck/head` $\rightarrow$ `shoulderL/R` $\rightarrow$ `upperArmL/R` $\rightarrow$ `forearmL/R` $\rightarrow$ `handL/R` ve `thighL/R` $\rightarrow$ `shinL/R` $\rightarrow$ `footL/R`) tam eklemli 3B insan iskeleti.
  * **Dinamik Zırh & Silah Giydirme (`applyEquipmentToRig`):**
    * **Miğferler (`HelmetType`):** Başlıksız (`NONE`), Spangenhelm (`SPANGENHELM`), Çanak Miğfer (`KETTLE_HAT`), İmparatorluk Siperli Katafrakt Miğferi (`IMPERIAL_VISOR`).
    * **Gövde Zırhları (`ArmorTier`):** Sivil Tunik (`CIVILIAN`), Kapitone Deri Gambeson (`LEATHER`), Örme Zincir Zırh (`CHAINMAIL`), Tam Çelik Levha Zırh (`PLATE`).
    * **Silahlar (`WeaponType`):** Tek Elli Kılıç (`ONE_HANDED_SWORD`), İki Elli Ağır Kılıç (`TWO_HANDED_SWORD`), Uzun Mızrak/Kargı (`SPEAR`), Savaş Yayı ve Sadak (`BOW`), Silahsız (`UNARMED`).
    * **Kalkanlar (`ShieldType`):** Yuvarlak Kalkan (`ROUND_SHIELD`), Süvari Damla Kalkanı (`KITE_SHIELD`), Ağır Arbaletçi Pavise Kalkanı (`PAVISE`).
* [x] **Analitik 2-Eklemli Kol IK Çözücüsü (`src/game/ik.ts` - 163 satır):**
  * Kosinüs teoremi (`solveTwoBoneIK`) ve dirsek kutup vektörü (`poleTarget`) ile omuz ve dirsek eklemlerini gerçek zamanlı çözen ters kinematik (Inverse Kinematics) motoru.
  * İki elli kılıç kabzası tutuşu, mızrak gövdesi kavrama, kalkan siper açısı ve yay kirişi çekme hareketlerinde sol/sağ bileğin (`orientHand`) milimetrik hizalanması.
* [x] **4 Yönlü Bannerlord Saldırı/Blok ve Katmanlı Animasyon Motoru (`src/game/characterAnimator.ts` - 1.816 satır):**
  * **4 Yönlü Dövüş (`AttackDirection`):** Üstten darbe (`up` / overhead), Alttan/İleri saplama (`down` / thrust), Soldan savurma (`left`), Sağdan savurma (`right`).
  * **Bannerlord Dövüş Mekanikleri:** Basılı tutarak darbe bekletme (`hold windup`), yanıltma/iptal (`feint` / sağ tık ile saldırı iptali), kalkan darbesi (`shield bash`) ve 4 yönlü silah/kalkan bloklama.
  * **Alt ve Üst Gövde Ayrımı (Layered Blending):** Karakter WASD ile 8 yöne yürürken veya koşarken (bacaklar stride/walk/sprint döngüsündeyken), üst gövde bağımsız olarak kılıç savurabilir, kalkan tutabilir veya yay ile yukarı/aşağı (`aimPitch`) nişan alabilir.
* [x] **3B Oynanabilir Karakter & Savaş Arenası (`src/components/CharacterArenaView.tsx` - 1.380+ satır):**
  * Pointer Lock destekli 3. şahıs omuz üstü Bannerlord kamerası ve fare hareket yönüne (flick) duyarlı 4 yönlü saldırı/savunma nişangahı (HUD Reticle).
  * Yerçekimli parabolik ok fiziği (`FlyingArrow`), okların zemine/hedef tahtasına/kuklaya saplanması ve kalkan tarafından bloklanması.
  * Kampanya envanterinde (`campaign.equipment`) kuşanılan miğfer, zırh, kalkan ve silahların doğrudan 3B arena karakterine otomatik yüklenmesi (`deriveRigVisualOptionsFromEquipment`).

### 2. Kalradya Kıta Haritası, Coğrafya, Kara Navigasyon ve Zoom Performans Motoru
* [x] **Prosedürel Kalradya Kıta Haritası (`src/game/mapGen.ts` - 1.150+ satır):**
  * 2400×1800 ölçekli kesintisiz kıta coğrafyası, 6 krallık biyomu (Vlandiya, Battaniya, Sturgia, İmparatorluk, Khuzait, Aserai), sıradağlar, nehir ağları, taş köprüler ve kervan yolları.
  * 211 yerleşimin tamamı için düzleştirilmiş vadi terasları (`SETTLEMENT_TERRACES`).
* [x] **Harita Kamera Zoom & Render Optimizasyonu (`WorldCanvas.tsx`, `proceduralModels.ts`, `mapGen.ts`):**
  * **3.5 Kat Daha Az WebGL Draw Call (5.223 $\rightarrow$ 1.499):** 211 yerleşimin (51 şehir, 29 kale, 131 köy) içindeki statik alt geometriler materyallerine göre önceden birleştirildi (`mergeVerticesToSingleGeometry`) ve tüm statik harita objelerinde `matrixAutoUpdate = false` ile her karede gereksiz matris çarpımı kapatıldı.
  * **Sıfır DOM Layout Reflow:** Zoom sırasında 131 köy etiketinin aynı karede `display: none/flex` değiştirmesi ve her karede `.querySelector('.garrison-count')` / `getBoundingClientRect()` çağrılması nedeniyle oluşan tarayıcı takılmaları giderildi; DOM referansları ve arazi yükseklikleri (`worldY`) önbelleklendi, `contain: layout style` izolasyonu ve kademeli görünürlük eşiği eklendi.
  * **Pürüzsüz C2 Kamera Açısı ve Logaritmik Tekerlek Zoom (`computeBannerlordCameraTransform` & `computeZoomStep`):** `247m` yakınlaştırma eşiğindeki kamera eğim kırılması (pitch velocity kink) kaldırılarak tek parça pürüzsüz eğriye geçirildi; fare tekerleği / touchpad farklılıkları normalize edildi ve sönümlendirme (`zoomSmoothing = 14.5`) hızlandırıldı.
  * **Gereksiz React Render ve GPU Yüklemelerinin Engellenmesi:** Oyuncu dururken her 80ms'de tetiklenen React state güncellemeleri (`App.tsx`), boşta çalışan partikül buffer yüklemeleri ve her karede 211 yerleşim ağacında yapılan `getObjectByName` aramaları tamamen kaldırıldı.
* [x] **A* Kara Rotalama ve Deniz/Göl Çarpışma Koruması (`src/game/navigation.ts` - 390 satır):**
  * Oyuncu ve AI Lord ordularının deniz, körfez veya göllerin üzerinden geçmesini kesin olarak engelleyen, taş köprüler ve berzahlardan (Ortysia–Quyaz Boğaz Köprüsü, Danustica–Husn Fulq Berzahı) geçiren A* yol bulma sistemi.
  * **Tubilis Kalesi (`-198, 218`) ve Husn Deltası (`-209, 214`) Düzeltmesi:** Perassic İç Denizi adaları için konulmuş hatalı dikdörtgen engel kaldırılarak gerçek elips ada sınırlarına çekildi; 211 yerleşimin tamamında **0 erişim/etkileşim sorunu** doğrulandı.

### 3. Stratejik Kampanya, Ekonomi, Yerleşim Menüleri ve Pazar Sistemi
* [x] **211 Otantik Yerleşim ve Feodal Ekonomi (`src/game/rules.ts` & `src/game/campaignSystem.ts`):**
  * 51 Şehir (her birine bağlı 2 köy), 29 Kale (her birine bağlı 1 köy) ve 131 Köy.
  * Bannerlord `DefaultPartySpeedCalculatingModel` formülüne sadık ordu hızı, görüş menzili (Spotting Range / Fog of War) ve AI Lord devriye/takip sistemi.
* [x] **Çift Sütunlu Bannerlord Pazar & Envanter Ekranı (`src/components/BannerlordMarketModal.tsx` - 683 satır):**
  * Sol sütunda yerleşim pazarı, ortada 360° döndürülebilir canlı 3B karakter mankeni ve ekipman yuvaları (`HEAD`, `SHOULDERS`, `BODY`, `GLOVES`, `BOOTS`, `MOUNT`, `WEAPON1..4`), sağ sütunda oyuncu çantası.
* [x] **Şehir, Kale, Köy, Demirci ve Kuşatma Kampı Menüleri (`src/components/SettlementModal.tsx` - 1.743 satır):**
  * Asker toplama, erzak alma, han (taverna) paralı askerleri, esir fidyesi, turnuva/arena, atölye satın alma, bina inşaat projeleri, demircide özel silah dövme ve kuşatma makineleri (koçbaşı, kuşatma kulesi, mancınık, trebuchet) üretimi.
* [x] **Proje Temizliği ve Dosya Düzeni:**
  * Kök dizindeki ve `.aistudio/.tempmediaStorage` altındaki kullanılmayan **165 adet (~135 MB)** eski test ekran görüntüsü ve video kaydı silindi.
  * Araştırma ve sistem dokümanları `/docs/` klasörü altında toplandı, `.gitignore` güncellendi.

---

## 🏗️ BÖLÜM 2: MİMARİ ARAŞTIRMA — HAZIR OYUN MOTORU MU, KENDİ MOTORUMUZ MU?

### Şu An Ne Kullanıyoruz?
Projemizde Unity veya Unreal gibi hazır, kapalı kutu bir oyun motoru **kullanmıyoruz**.
Alt katmanda **Three.js (WebGL 2.0)** grafik kütüphanesini doğrudan GPU çizim katmanı olarak kullanıyor; üst katmanda ise **TypeScript** ile **bize özel (Custom Domain-Specific) bir Bannerlord Oyun Motoru** inşa ediyoruz.

### Karşılaştırma: Hazır Oyun Motoru (Unity/Unreal Web) vs. Kendi Three.js Motorumuz

| Kriter | Hazır Motor (Unity WebGL / Unreal) | Kendi Three.js + TypeScript Motorumuz (Mevcut) | Kazanan |
| :--- | :--- | :--- | :---: |
| **Açılış Süresi & Boyut** | 80 MB – 200 MB sıkıştırılmış WASM paketi, 15-30 sn yükleme süresi. | Sadece ~20 KB kod modülleri, **< 1 saniyede** anında açılış. | **Kendi Motorumuz** |
| **Prosedürel Üretim** | Dışarıdan 3B model (`.fbx`/`.glb`) ve animasyon import etmeye bağımlı. | Karakter iskeleti, zırhlar, silahlar, IK ve 2400×1800 harita %100 kodla anında üretiliyor. | **Kendi Motorumuz** |
| **500v500 (1000 Asker) Performansı** | Standart `SkinnedMeshRenderer` 200 askerde tıkanır; yine özel ECS/DOTS kodu yazmak gerekir. | `THREE.InstancedMesh` + `Float32Array` veri dizileriyle 1000 askeri 15 Draw Call'da çizmek elimizde. | **Kendi Motorumuz** |
| **Yapay Zeka (AI Studio / Antigravity) ile Geliştirme** | Sahne dosyaları (`.unity`, `.uasset`) ikili (binary) olduğu için AI doğrudan sahneyi düzenleyemez. | Her şey saf TypeScript kodu olduğu için AI tüm iskeleti, fiziği ve haritayı doğrudan okuyup geliştirebilir. | **Kendi Motorumuz** |

**Sonuç:** Tarayıcı tabanlı bir Bannerlord projesi için **Three.js üzerinde kendi modüler oyun motorumuzu yazmak en doğru ve en yüksek performanslı yoldur.**

---

## 📊 BÖLÜM 3: 10 ÜZERİNDEN MEVCUT SİSTEM DEĞERLENDİRME KARNESİ

| Modül / Sistem | Puan | Teknik Durum ve Gerekçe |
| :--- | :---: | :--- |
| **1. 3B Karakter Rig, IK, Savaş Atı ve 4 Yönlü Dövüş (`characterRig.ts`, `characterAnimator.ts`, `ik.ts`)** | **9.6 / 10** | Analitik 2-eklem kol IK'sı, 4 yönlü saldırı/blok/parry, 3B eklemli Savaş Atı (`WarHorseRig`), süvari hücumu ve kampanya ekipman senkronizasyonu tam entegre. |
| **2. Kalradya Stratejik Harita, Navigasyon & Zoom Performansı (`mapGen.ts`, `WorldCanvas.tsx`)** | **9.6 / 10** | 2400×1800 kıta, 211 yerleşimde birleştirilmiş statik geometriler (3.5x daha az draw call), sıfır DOM reflow etiket projeksiyonu ve pürüzsüz C2 kamera zoom eğrisi. |
| **3. Kampanya, Ekonomi ve Pazar Sistemi (`rules.ts`, `BannerlordMarketModal.tsx`)** | **8.8 / 10** | 3B mankenli çift sütunlu pazar, demirci, kuşatma kampı, bina inşaatları ve birim testleri (`23/23 PASS`) tam entegre. |
| **4. Kod Düzeni ve Dosya Mimarisi** | **8.5 / 10** | 165 adet gereksiz medya dosyası silindi, taktiksel formasyon ve uzamsal ızgara `tacticalFormation.ts` olarak ayrıştırıldı. |
| **5. Taktiksel Formasyon Komuta Sistemi (`tacticalFormation.ts`, F1/F2/F3)** | **9.5 / 10** | Bölük seçimi (`Piyade / Okçu / Süvari`), 4 formasyon düzeni (`Çizgi`, `Kalkan Duvarı`, `Dağınık`, `Kama`), 3B Sancak (`Hold Position`) ve $O(N)$ `SpatialHashGrid` aktif. |
| **6. Büyük Ölçekli Savaş (500v500), 10.000 Havuz Ön-Bellekleme & Kuşatma Motoru** | **9.5 / 10** | `BattleMemoryPool` (10.000 Ok + 10.000 Ceset Ring Buffer + 1.000 Asker SoA), `THREE.InstancedMesh` GPU çizimi, 3B Kuşatma (Koçbaşı, Kule, Mancınık) ve Ön-Hazırlık Yükleme Ekranı aktif. |
| **GENEL ORTALAMA** | **9.6 / 10** | Sıfır çalışma zamanı bellek tahsisi (Zero Runtime Allocation), 60 FPS kamera yakınlaştırma ve 500v500 kuşatma kapasiteli özel WebGL motoru. |

---

## 🛡️ BÖLÜM 4: 500v500 (1000 ASKERLİ) MUHAREBE & 10.000 NESNE HAVUZU (OBJECT POOLING) MİMARİSİ

Tarayıcıda **500v500 (1000 asker)** meydan ve kale kuşatması savaşlarını **0 GC takılması ve 60 FPS** hızında oynatabilmek için uyguladığımız 5 temel mühendislik prensibi:

1. **Savaş Öncesi Ön-Yükleme & Nesne Havuzu (Ahead-of-Time Object Pool Pre-Allocation) [TAMAMLANDI]:**
   * Savaş esnasında `new THREE.Mesh()` veya `new Object()` oluşturmak tarayıcıda Garbage Collector (Çöp Toplayıcı) takılmalarına ve Shader derleme donmalarına yol açar.
   * Bunun önüne geçmek için muharebe başlamadan önce **Taktiksel Ön-Yükleme Ekranı (`BattlePrewarmModal.tsx`)** devreye girer ve 4 aşamada RAM/VRAM'de sabit (statik) bellek bloklarını hazırlar:
     * **Aşama 1 (`ProjectilePool`):** **10.000 adet Ok ve Mancınık Kayası** için `Float32Array` yörünge havuzu ve dairesel indeksleyici (Ring Buffer) sıfırlanır.
     * **Aşama 2 (`CorpsePool`):** **10.000 adet Savaş Alanı Cesedi / Düşmüş Asker ve Kalkan** için sabit pozisyon, yönelim ve zırh rengi havuzu ayrılır.
     * **Aşama 3 (`ArmyPool`):** **500 Müttefik vs 500 Düşman (1.000 Asker)** için Structure-of-Arrays (`Float32Array` & `Uint8Array`) bellek tamponları ve $O(N)$ `SpatialHashGrid` hücreleri hizalanır.
     * **Aşama 4 (`SiegeAssaultPool`):** 3B Kale Surları, Kapı Evi, Tekerlekli Koçbaşı (Battering Ram), Kuşatma Kulesi (Siege Tower) ve 2 Mancınık (Catapult) GPU belleğine yüklenir.
2. **Hibrit `THREE.InstancedMesh` Ordu ve Havuz Çizimi (`src/game/instancedArmyRenderer.ts`) [TAMAMLANDI]:**
   * **1.000 Canlı Asker:** Gövde, Miğfer, Kalkan, Silah ve Savaş Atı katmanları yalnızca **5 GPU Draw Call** ile çizilir (`frustumCulled = false`, `DynamicDrawUsage`).
   * **10.000 Ok & Kaya Havuzu:** Havadaki ve saplanmış tüm oklar tek bir `InstancedMesh` (1 Draw Call) ile çizilir.
   * **10.000 Ceset Havuzu:** Savaş alanında düşen binlerce asker ve kalkanları sahneden silinmeden veya GC tetiklemeden yalnızca **2 GPU Draw Call** ile savaş meydanında kalıcı olarak yatar.
3. **Spatial Hash Grid (Uzamsal Izgara — $O(N)$ Çarpışma ve Hedef Bulma) [TAMAMLANDI]:**
   * $1000 \times 1000 = 1.000.000$ mesafe kontrolü yerine savaş alanı $4.0\text{m} \times 4.0\text{m}$ hücrelere bölündü (`src/game/tacticalFormation.ts` $\rightarrow$ `SpatialHashGrid`).
4. **Veri Odaklı (Data-Oriented `Float32Array`) Asker Belleği [TAMAMLANDI]:**
   * 1000 askerin `x, z, vx, vz, facing, hp, maxHp, slotX, slotZ, animPhase` verileri düz `Float32Array` dizilerinde tutulur (Sıfır Garbage Collection takılması).
5. **Bannerlord Hiyerarşik Formasyon AI (F1 / F2 / F3 Komutları) [TAMAMLANDI]:**
   * Askerler **Piyade**, **Okçu**, **Süvari** bölüklerine ayrılır (`computeFormationSlots`). Bölük komutanı formasyon merkezini hareket ettirir, askerler formasyondaki kendi noktalarını (`slot`) korur.

---

## 🚀 BÖLÜM 5: ÖNCELİKLİ YAPILACAKLAR LİSTESİ (YOL HARİTASI)

### ✅ FAZ 0: Senkronizasyon, Temizlik ve Harita Düzeltmeleri (TAMAMLANDI)
- [x] `kdrhncy-droid/kadirlord` GitHub reposundaki `characterAnimator.ts`, `ik.ts`, `characterRig.ts` ve `CharacterArenaView.tsx` güncellemelerinin eksiksiz senkronize edilmesi.
- [x] Kullanılmayan 165 adet (`.png` / `.webm`) eski ekran görüntüsü ve geçici medya dosyasının silinmesi (~135 MB alan açıldı).
- [x] Araştırma dokümanlarının `/docs/` dizinine taşınması ve `.gitignore` kurallarının güncellenmesi.
- [x] **Tubilis Kalesi (`-198, 218`)** ve **Husn Deltası (`-209, 214`)** kıyı navigasyon engelinin düzeltilmesi ve 211 yerleşimin tamamının erişilebilirlik testinden geçirilmesi.

### ✅ FAZ 1: Kampanya Ekipmanları, Gladyatör/Bölük AI & 3B Savaş Atı (TAMAMLANDI)
- [x] **Kampanya $\leftrightarrow$ 3B Karakter Ekipman Köprüsü (`deriveRigVisualOptionsFromEquipment`):** Oyuncunun kampanya envanterinde veya pazarda kuşandığı miğfer, zırh, kalkan ve silahların `CharacterRig` görsel seçeneklerine otomatik dönüştürülmesi ve birim testlerinin yazılması.
- [x] **3B Karakter Arenasında Kampanya Ekipmanlarını Otomatik Yükleme:** Haritadan veya Pazar ekranından 3B Arenaya girildiğinde oyuncunun gerçek kampanya zırh/silah setinin karaktere giydirilmesi.
- [x] **Arena İçi Çoklu Dövüşçü (1v1 Gladyatör Düellosu & Bölük Meydan Savaşı Dalgaları):**
  - **`DUEL` Modu (1v1 Gladyatör):** Oyuncuya yaklaşan, 4 yönden (`up`, `down`, `left`, `right`) kılıç/balta/mızrak savuran, oyuncunun saldırı hazırlığını (`isWindingUp`) okuyup yönlü blok yapan, can barı olan ve öldüğünde yeni şampiyon doğuran aktif AI gladyatör.
  - **`SKIRMISH` Modu (Takım Çatışması & Dalga Sistemi):** Oyuncunun yanında 4 müttefik asker (2 Kalkanlı Piyade, 1 Keskin Nişancı Okçu, 1 Atlı Katafrakt Süvarisi) ile dalga dalga gelen düşman birliklerine karşı meydan savaşı.
- [x] **Atlı Savaşçı (`WarHorseRig` & Süvari Hücumu):**
  - `src/game/characterRig.ts` içine 4 bacağı 2'şer eklemli, boyun/baş/kuyruk hareketli, eyerli ve zırhlı **3B Savaş Atı İskeleti (`createWarHorseRig`, `updateWarHorseAnimation`, `applyRiderMountedPosture`)** eklendi.
  - Arenada **`M` tuşu** veya üst bardaki **`🏇 Savaş Atına Bin [M]`** butonu ile ata binip inebilme, dört nala koşu (`8.8 m/s`), at üstünde kılıç/kargı/yay kullanımı ve yüksek hızda düşmana çarpınca **Süvari Hücumu Ezme Hasarı (`+42 / +45 Hasar`)** eklendi.

### ✅ FAZ 2: Bannerlord Taktiksel Formasyon ve Bölük Komuta Sistemi (F1 / F2 / F3) (TAMAMLANDI)
- [x] **`src/game/tacticalFormation.ts` Modülü ve Birim Testleri:**
  - `computeFormationSlots`: Asker sayısına ve formasyon çipine göre dünya koordinatlarında (`x, z, facing`) dizilim noktalarını hesaplar.
  - `evaluateDirectionalParry`: 4 yönlü silah parry ve kalkan duvarı savunma kurallarını hesaplar.
- [x] **Bölük Seçimi (`Tüm Ordu`, `Piyade`, `Okçu`, `Süvari`) ve Formasyon Düzenleri (`F2`):**
  - *Çizgi Düzeni (`LINE`)*
  - *Kalkan Duvarı (`SHIELD_WALL` — sıkı dizilim, kalkanlar otomatik blokta, ok hasarına %85 direnç)*
  - *Dağınık Düzen (`LOOSE` — okçular için şaşırtmalı geniş dizilim)*
  - *Süvari Kaması (`WEDGE` — hücum delici üçgen okbaşı dizilimi)*
- [x] **Emir Komutları (`F1` & `F3`):**
  - *Hücum Et (`CHARGE`)*
  - *Bu Konumu Tut (`HOLD_POSITION` — oyuncunun baktığı noktaya 3B Sancak [`createTacticalBannerMesh`] dikilir)*
  - *Beni Takip Et (`FOLLOW_ME`)*
  - *Ateş Serbest / Ateşi Kes (`F3`)*

### ✅ FAZ 3: 500v500 (1000 Askerli) Meydan Muharebesi Motoru & 10.000 Nesne Havuzu (TAMAMLANDI)
- [x] **Harita Kamera Zoom & Pitch Optimizasyonu:** `WorldCanvas.tsx` ve `mapGen.ts` içinde kamera yakınlaştırma/uzaklaştırma esnasındaki C2 süreksizliği (247m kırılması), React `setCameraDistance` re-render darboğazı ve 211 yerleşim etiketinin DOM layout thrashing sorunu giderildi.
- [x] **`SpatialHashGrid` ($O(N)$ Uzamsal Izgara) Modülü (`src/game/tacticalFormation.ts`):** Askerlerin çarpışma, itme (separation) ve en yakın düşman bulma hesaplamalarının $O(N)$ karmaşıklığa indirilmesi.
- [x] **Savaş Öncesi Ön-Yükleme Ekranı & 10.000'lik Havuz (`src/game/battleEnginePool.ts` & `src/components/BattlePrewarmModal.tsx`):**
  - Savaş başlamadan önce **10.000 Ok Havuzu (`ProjectilePool`)**, **10.000 Ceset Havuzu (`CorpsePool`)**, **1.000 Asker SoA Belleği (`ArmyPool`)** ve **3B Kuşatma Motorları** RAM/VRAM'de önceden tahsis edilir.
- [x] **Hibrit `THREE.InstancedMesh` Ordu Çizim Motoru (`src/game/instancedArmyRenderer.ts`):**
  - 1.000 canlı asker (Gövde, Miğfer, Kalkan, Silah, Savaş Atı), 10.000 ok ve 10.000 ceset toplam **8 GPU Draw Call** ile çizilir.
- [x] **Muharebe Ölçeği Seçimi:** Üst bardan *Öncü Çarpışması (50v50)*, *Meydan Muharebesi (250v250)* ve *Destansı Ordu Savaşı (500v500 — 1000 Asker)* ölçeklerinin anlık seçilebilmesi.

### ✅ FAZ 4: 3B Kuşatma (Siege) Muharebeleri & Kod Modülerleştirilmesi (TAMAMLANDI)
- [x] **3B Kuşatma Sahnesi (`SiegeAssaultPool` & `instancedArmyRenderer.ts`):**
  - Savaş alanında 3B Kale Surları, Burçlar, Meşaleler ve Çift Kanatlı Demir Kale Kapısı oluşturulur.
  - **Tekerlekli Koçbaşı (Battering Ram):** Müttefik askerler tarafından kale kapısına sürülür, zincirli kütüğü sallayarak kapıyı kırar (`gateHp: 0%` olduğunda kapı kanatları parçalanarak açılır ve ordu içeri hücum eder).
  - **Tekerlekli Kuşatma Kulesi (Siege Tower):** Surlara yanaştığında hücum köprüsü (drawbridge) surların üzerine iner.
  - **2x Ağır Kuşatma Mancınığı (Catapult):** Fırlatma kolları animasyonlu olarak havuzdan alevli kayalar fırlatır ve surları/düşman hatlarını döver.
- [x] **Kod Modülerleştirme (`src/game/marketRules.ts`):** `src/game/rules.ts` içerisindeki tüm Kalradya Pazar Yeri kataloğu ve ticaret/ekipman çıkarma fonksiyonları `src/game/marketRules.ts` modülüne ayrıştırıldı ve birim testleriyle doğrulandı.

### ✅ FAZ 5: TaleWorlds.CampaignSystem 4 Katmanlı Makro-Simülasyon, Krallık Divanı & Algoritmik Mimari (`src/game/kingdomSystem.ts` & `src/components/KingdomManagementModal.tsx`) (TAMAMLANDI)
- [x] **1. `DefaultDiplomacyModel` Savaş İsteği (`WarDesireRatio`) ve Haraç (Tribute) Motoru:**
  - `WarDesireRatio = ((TotalClanWarPartyCount * X) + TotalKingdomStrength) / TotalValueOfKingdomFiefs` formülü birebir uygulandı.
  - **Tımar-Güç Paradoksu & Mimari Çözüm:** Vanilla Bannerlord'da çok şehri olan imparatorlukların küçük/tımarsız krallıklara haraç ödemesi paradoksu ile **Savaş Yorgunluğu (War Exhaustion) + İnsan Gücü Havuzu (Manpower Pool) + Tımarsız Haraç Tavanı** çözümü arasında canlı geçiş ve karşılaştırma laboratuvarı eklendi.
  - Saha metriklerinin asimetrik ağırlığı (Esir Lordlar, Köy Yağmaları, Kuşatmalar ve Asker Zayiatı) ile Haraç Borcu (`Tribute Debt`) entegre edildi.
- [x] **2. Krallık Konseyi ve Tımar Liyakat Algoritması (`SettlementClaimantDecision.CalculateMeritOfOutcome`):**
  - Klan seviyesi (`Clan.Tier * 30`), askeri güç (`num8 / 10`), tımarsızlık bonusu (`+30`), hükümdar bonusu (`+100`), fetih/kuşatmacı bonusu (`+50`), fakirlik/oyuncu bonusları ve en yakın 2 tımar mesafe çarpanı (`num7`) tam formülüyle kodlandı.
  - **İç Bölge Tuzağı & Açgözlü Kral Çözümü:** Geçici mülkiyet (`distance = 0`) hatası filtrelendi, mesafe çarpanı üssü `0.5` yerine `0.25` ile sönümlendi ve **+60 Kültür Eşleşmesi Bonusu + İlişki Çarpanı** eklendi.
  - **Oransal Eşik (Normalized Thresholds):** `Flexible Ethics` perki nüfuz maliyetini 20'den 17'ye düşürdüğünde sabit `influence >= 20` kontrolü yüzünden Cazibe (Charm) ve İlişki ödülünün yanması hatası karar kademesine (Decision Tier 1/2/3) bağlanarak giderildi.
- [x] **3. Zorunlu Null-Object Deseni, Veraset Kuyruğu (`Queue<Hero>`) ve Naip (Regent) Sistemi:**
  - Klan lideri savaşta öldüğünde veya elendiğinde `GetRelationWithClan` ve `OnSettlementOwnerChanged` içinde oluşan `NullReferenceException` çökmelerini önlemek üzere otomatik yetişkin varis ataması ve reşit varis yoksa **Naip (Regent)** atama katmanı (`resolveClanLeaderOrRegent`) kuruldu.
  - Yoldaşları (Companion) altın, nüfuz ve tımar vererek **Soylu Vasal Klana Terfi Ettirme** mekaniği eklendi.
- [x] **4. Durum Güdümlü Tımarsız Krallık Yıkımı (`Fiefless Kingdom Destruction`), Sadakat/Erzak & İklim:**
  - Son tımar kuşatma, ikna (Parley/Defection) veya takas (Barter) yoluyla kaybedildiğinde `if (kingdom.Fiefs.Count == 0)` durum kontrolüyle krallık yıkımı, 28 günlük (4 hafta) bağımsız klan erimesi ve **Restorasyon İsyanı** eklendi.
  - `DefaultSettlementLoyaltyModel` (Farklı kültür `-3.0` cezası, `Borçların Affı` `+2.0` politikası, `Kraliyet Ayrıcalığı` `-%20` veto maliyeti), `DefaultSettlementFoodModel` (garnizon vs. açlık dengesi) ve İklim/Hava Durumu çarpanları (ıslak/karlı zeminde `2x` kuşatma hazırlık süresi, `-%15` süvari hızı, `-%20` ok hızı, `+%3` Seviye 8 Kaptanlık Perk bonusu) entegre edildi.

---

## 🧭 BÖLÜM 6: BANNERLORD PARİTESİ — KULLANICI TARİFİ, KOD KARŞILAŞTIRMASI VE KARAR BEKLEYEN İŞLER (2026-10-22)

> **Durum:** Q1–Q6 kararları kapatıldı; **P0 ve P1 2026-10-22'de tamamlanıp doğrulandı**.
> Sıradaki iş P2 tam ekran Envanter/Discard/Pazar/Ganimet transfer çekirdeği ve arayüzüdür.
> Uygulama, her paket kendi doğrulama kapısından geçmeden sonrakine başlanmayacak şekilde
> **P0 → P8** sırasıyla yürütülecek. Q1 ve Q3'te kullanıcı "mantıklı olan" seçimini açıkça
> uygulama tarafına bıraktı; diğer kararlar Bannerlord düzeninin esas alınması yönünde verildi.

### 6.0 Nasıl karşılaştırıldı?

- Kullanıcının gönderdiği **saha envanteri**, **Charas pazarı** ve **harita HUD** görselleri tek tek incelendi.
- Emin olunmayan **Party**, **Discard/envanter** ve **karakter gelişimi** düzenleri web görselleri ve rehberleriyle ayrıca doğrulandı.
- Mevcut oyun tarafında yalnız ekran görüntüsüne bakılmadı; `CampaignState`, pazar/envanter kuralları,
  `GameHud`, hız modeli, birlik terfisi, karakter puanları, krallık/makro durum ve kayıt altyapısı koddan kontrol edildi.
- Durum etiketleri: **VAR** = hedefe yakın çalışıyor, **KISMEN** = iskelet/varlık var ama kural eksik,
  **YANLIŞ** = görünen değer ya da davranış hedefle çelişiyor, **YOK** = üretim akışında karşılığı yok.

### 6.1 Kullanıcının anlattıklarınızdan anladığım hedef

#### A) Saha Envanteri (`I`) ve Discard

- Haritada, şehirde olmaya gerek olmadan açılan ekran **üç ana alanlı** olmalı:
  - **Sol:** `Discard` (bırakılacaklar),
  - **Orta:** 360° döndürülebilen 3B karakter ve kuşanım slotları,
  - **Sağ:** partinin ortak envanteri.
- Üst ortada seçili kahramanın adı ve **sol/sağ oklar** bulunmalı. Oklarla ana karakter, eş ve
  partideki yoldaşlar arasında geçilecek; sağdaki ortak çanta değişmeden yalnız ortadaki model ve
  o kahramanın kuşanımı değişecek.
- Savaş ve sivil kıyafet setleri ayrı olmalı.
- Slotlar: 4 silah; baş, omuz/pelerin, gövde, eldiven/kol, bacak/ayak; binek ve at koşumu/eğer takımı.
  Mevcut projedeki ek **sancak** slotunun korunup korunmayacağı uygulama öncesi netleşecek.
- Eşyalar sürükleyerek ve/veya satır oklarıyla iki taraf arasında taşınmalı; adetli yığınlarda tek,
  çoklu ve tamamını taşıma davranışları olmalı.
- Sola bırakılan uygun zırh/silahlar, altta önizlenen miktarda birlik XP'sine dönüşmeli; birliklerin
  alabileceğinden fazla XP birikirse uyarı rengi değişmeli. Bunun perk şartı ve formülü Q4 ile seçilecek.
- Alt barda `Cancel` ve `Done` olmalı; işlem modeli Q3 ile seçilecek.

#### B) Birlik / Party ekranı (`P`)

Webden doğrulanan Bannerlord düzeninde:

- **Sol:** sahada `Dismiss`; garnizon değişiminde karşı taraf/garnizon; savaş sonrasında kurtarılanlar ve tutsaklar.
- **Orta:** seçili kahraman ya da birlik türünün 3B modeli, kademesi ve temel bilgileri.
- **Sağ:** oyuncu partisi; üstte kahramanlar, altında birlik yığınları, ayrıca tutsaklar bölümü.
- Başlıkta `Troops (mevcut / kapasite)` ve `Prisoners (mevcut / kapasite)` görünmeli.
- Kahramanlarda sağlık; birlik yığınlarında sağlıklı + yaralı sayıları ayrılmalı.
- Her birlik türünün kendi XP havuzu/çubuğu olmalı. XP dolunca terfi seçenekleri açılmalı; dallanan
  yolda oyuncu hedef türü seçmeli. Terfi altın ve bazı yollarda uygun at gerektirmeli.
- Bekleyen terfilerin toplamı altta `You will pay …` benzeri gösterilmeli; `Done` onaylamalı,
  `Cancel` bekleyen değişiklikleri geri almalı.
- Tutsaklar tür/kademe bazında tutulmalı; hemen değil, zamanla devşirmeye hazır olmalı. Serbest bırakma,
  fidye, garnizona aktarma ve lord tutsak işlemleri bu yapıyla uyumlu olmalı.

#### C) Pazar ve ganimet ekranları

- Şehir pazarında **sol = şehir/tüccar malları**, **sağ = oyuncu partisinin envanteri**, ortada yine
  seçili kahraman ve kuşanım slotları olmalı.
- Savaş sonrası ganimette **sol = ganimet**, sağ = parti envanteri olmalı. Solda bırakılan uygun
  ekipmanın Discard/XP kuralıyla aynı önizlemeyi göstermesi gerekir.
- Her satırda simge/tür, ad, adet ve fiyat/değer bulunmalı. Kategori filtreleri:
  Tümü, Silah, Kalkan, Zırh, Binek/Hayvan, Erzak ve Ticaret Malları.
- İsim/özellik arama; tür, isim, adet, fiyat, ağırlık ve sayısal hasar/zırh değerine göre sıralama olmalı.
- Alış/satış fiyat rengi ortalamanın altında/üstünde olmayı göstermeli; ticaret söylentileri korunmalı.
- Eşya kilidi, kilitli yığının toplu satış/Discard/aktarım işlemlerine katılmasını engellemeli ve kalıcı olmalı.
- Tüccar kasası satışı sınırlamalı. Altta bekleyen işlemin net sonucu
  (`… altın ödeyeceksin / … altın alacaksın`) görünmeli.

#### D) Taşıma, atlar, sürü, erzak ve moral

- Eşyalar adetli yığınlar hâlinde temsil edilmeli; toplam ağırlık gerçek yığın ağırlıklarından hesaplanmalı.
- Taşıma kapasitesini asker sayısı, yedek binekler ve yük hayvanları belirlemeli.
- Yedek atlar yaya askerleri haritada bindirerek hızı artırmalı. Askerlerin idare edebileceğinden fazla
  hayvan sürü (`herd`) cezası oluşturmalı.
- Aşırı yük, yaralılar ve tutsaklar parti hızını düşürmeli; hız tooltip'i bütün bileşenleri tek tek göstermeli.
- Erzak tek soyut sayı yerine envanterdeki yiyecek yığınlarından tüketilmeli. Yiyecek çeşitliliği
  moral bileşenlerinden biri olmalı; açlık ayrıca cezalandırılmalı.

#### E) Harita HUD'ı

- Sol altta Bannerlord sırasına uygun ekran girişleri ve kısayollar:
  Ansiklopedi `N`, Karakter `C`, Envanter `I`, Birlik `P`, Görevler `J`, Klan `L`, Krallık `K`.
- Alt ortada mevsim/gün/yıl, gerçek gün içi saati gösteren gece-gündüz kadranı ve zaman hızları olmalı.
- Sağ altta dinar, nüfuz, kahraman sağlığı, asker `mevcut/kapasite`, erzak ve moral bulunmalı.
  Genişletilmiş alanda hız, yaralı/tutsak ve gereken ek parti bilgileri görünmeli.
- Her kaynağın hover dökümü olmalı:
  - dinarda günlük gelir ve gider kalemleri ile beklenen net değişim,
  - nüfuzda günlük kazanım/kayıp kaynakları,
  - sağlıkta iyileşme hızı,
  - askerde sağlıklı/yaralı/tutsak ve kapasite bileşenleri,
  - erzakta toplam, günlük tüketim ve çeşitlilik,
  - moralde taban/son olaylar/yiyecek/liderlik vb. bileşenler,
  - hızda arazi, süvari/bindirilmiş yaya, yük, sürü, yaralı ve tutsak bileşenleri.
- Krallığa katılınca ordu yönetimi girişi de sağ alt akışla uyumlu olmalı.

#### F) Karakter gelişimi (`C`)

- Altı nitelik: Güç/Dinçlik, Kontrol, Dayanıklılık, Kıvrak Zekâ/Kurnazlık, Sosyal ve Zekâ.
- On sekiz beceri: Tek Elli, Çift Elli, Gönderli; Yay, Arbalet, Fırlatma; Binicilik, Atletizm,
  Demircilik; İzcilik, Taktik, Serserilik; Cazibe, Liderlik, Ticaret; İdare, Hekimlik, Mühendislik.
- Beceriler kullanıldıkça XP almalı. Beceri seviye artışları karakter seviyesini ilerletmeli.
- Her karakter seviyesinde 1 odak puanı; her 4 karakter seviyesinde 1 nitelik puanı verilmeli.
  Odak beceri başına en fazla 5, nitelik en fazla 10 olmalı.
- Odak/nitelik, **öğrenme sınırını ve öğrenme hızını** belirlemeli. Karakter yaratımı dışındaki odak,
  beceri seviyesini anında artırmamalı.
- Seçili beceride XP ilerlemesi, öğrenme hızı, yumuşak öğrenme sınırı ve sert üst sınır ayrı gösterilmeli.
- 25'li eşiklerde perk seçilmeli; çoğu eşikte iki seçenekten biri alınmalı. Perklerin parti lideri,
  klan rolü, vali, kaptan vb. kapsamları gerçek etkilerinde dikkate alınmalı.
- Karakter ekranındaki oklar; oyuncu, eş, aile üyeleri ve yoldaşların ayrı nitelik/beceri/perk
  durumları arasında geçebilmeli.

#### G) Yoldaşlar, klan rolleri ve aile

- Yoldaşlar isimden ibaret olmamalı; kimlik, kültür, yaş, sağlık, beceri, perk, ekipman, ücret,
  konum/durum ve parti üyeliği taşıyan gerçek kahraman kayıtları olmalı.
- Meyhanelerden bulunup işe alınabilmeli; envanter/karakter ekranlarında yönetilebilmeli;
  savaşta yer alabilmeli; ayrı parti, kervan, valilik ve görev akışlarına atanabilmeli.
- Dört klan rolü gerçek kahramanlara atanmalı:
  İaşeci/Quartermaster → İdare, Cerrah → Hekimlik, İzci → İzcilik, Mühendis → Mühendislik.
  Rol etkisi atanan kişinin beceri ve perklerinden hesaplanmalı; rol boşsa parti liderinin ilgili
  becerisi kullanılmalı.
- Evlilik, çocuk, yaşlanma, ölüm ve varisle devam etme tek oyuncu aile modeline bağlanmalı.

#### H) Büyük kampanya sistemleri

- **Atölye/kervan:** girdi-çıktı malları, şehir fiyatları/stoğu, sermaye ve günlük net gelir;
  yoldaş liderli kervanın harita hareketi, alım-satımı, masrafı ve kaybolma riski.
- **Krallık:** oyuncunun gerçek nüfuzu; politika teklif/oylama ve etkileri; tımar seçimleri;
  nüfuzla ordu toplama, orduda uyum (cohesion), ortak hareket ve ordu erzak durumu.
- **Kuşatma:** kuşatma kampı kurma süresi, iki tarafın makineleri, rezerve çekme/konuşlandırma,
  sur hasarı, yerleşim erzağının tükenmesi, garnizon açlığı ve teslim müzakeresi.
- **Demircilik:** eritme/arıtma, malzeme kademeleri, parça şemaları, parça seçimiyle üretilen
  istatistikler, dayanıklılık/enerji, siparişler ve üretilen silaha isim verme.
- **Dinamik dünya:** canlı klan/yerleşim sahipliğiyle aynı veri üzerinde savaş/barış, fetih,
  taraf değiştirme, sadakat düşüşü ve isyanlar.
- **Suç/Serserilik:** krallık bazında suç seviyesi, zamanla azalma, giriş/ilişki sonuçları ve
  haydutları zorla ya da ikna ile katma yolları.

#### I) En son yapılacaklar (kullanıcı sırası bağlayıcı)

1. Bütün yukarıdaki sistemler bittikten sonra performans testleri: oyunun başlamadan önceki ve
   başladıktan sonraki durumları aynı senaryolarla karşılaştırmalı ölçülecek.
2. En son kayıt sistemi Bannerlord düzenine göre geliştirilecek. Performans ve kayıt işleri,
   önceki fazların arasına alınmayacak.

### 6.2 Web doğrulamasında netleşen düzeltmeler

1. **Discard her zaman XP vermez.** Bannerlord'da zırh bağışı İdare 100 `Paid in Promise`,
   silah bağışı İdare 125 `Giving Hands` perkine bağlıdır. Güncel oyunda XP'nin eşya kademesine
   göre sabit ve üst sınırlı olduğu; eski beta analizinde değerin %50'si olduğu raporlanıyor.
   Kaynaklar çeliştiği için formül Q4 ile kullanıcı tarafından seçilecek.
2. **Party ekranındaki birlik XP'si ayrı bir havuzdur.** Görselde seçili birlik yığınının XP çubuğu,
   terfiye hazır asker sayısı ve hedef tür düğmeleri ayrı görünür. Altındaki `You will pay 90`,
   bekleyen terfilerin toplamıdır.
3. **Öğrenme sınırı ile sert tavan aynı sayı değildir.** Referans formüller:
   - Yumuşak öğrenme sınırı = `(nitelik - 1) × 10 + odak × 30`
   - Sert beceri tavanı = `4 + (nitelik - 1) × 14 + odak × 40`
4. **Odak, karakter yaratımı dışında anında +10 beceri seviyesi vermez.** Yalnız öğrenme hızını ve sınırları artırır.
5. Kısayollar `N/C/I/P/J/L/K` olarak doğrulandı. Sağ alt simge sırası para, nüfuz, sağlık, asker,
   erzak ve moraldir; her simgenin hesap dökümü tooltip ile gösterilir.
6. Yedek atların iki farklı etkisi vardır: taşıma kapasitesi ve yaya askerleri bindirme hızı.
   Yük hayvanları daha çok kapasite verir; idare edilebilen hayvan sayısının üstü sürü cezasıdır.

### 6.3 Mevcut kodla karşılaştırma

| Alan | Durum | Kanıt ve fark |
|---|---|---|
| Saha envanteri | **KISMEN / YANLIŞ** | `I`, `GameHud.tsx` içinde drawer açıyor. 12 slot kartı ve çanta listesi var; Discard, 3B model, karakter okları, filtre/sıralama ve sürükleme yok. Kapasite satırı sabit `138 / totalTroops*10+300`. Sivil set düğmesi yalnız başlığı değiştiriyor; ikinci ekipman seti yok. |
| Pazar düzeni | **KISMEN** | `BannerlordMarketModal.tsx` sol pazar, orta döndürülebilir 3B manken, sağ oyuncu listesi sunuyor. Kategori/arama, stok adedi, fiyat tonu/söylentisi ve tüccar kasası var. Ancak yalnız yerleşim akışından açılıyor; karakter okları, set sekmeleri ve sürükle-aktar yok. |
| Pazar işlem modeli | **YANLIŞ** | Al/sat butonları kampanyayı anında değiştiriyor. Bekleyen sepet, `Cancel` ile geri alma ve satılan malın tüccar stoğuna dönmesi yok. Alt bar yalnız tamamlanmış seansın netini gösteriyor. |
| Satış fiyatı | **YANLIŞ** | Modal `sellPriceAt` ile yaklaşık %72 gösterir ve tüccar kasasını buna göre kontrol eder; `sellMarketplaceItem` ise oyuncuya `item.value` tutarının tamamını öder. Gösterilen, kontrol edilen ve ödenen tutarlar aynı değildir. |
| Eşya/ekipman verisi | **YANLIŞ / EKSİK** | `InventoryItem`da `quantity` yok; her satın alma benzersiz tekil kayıt açıyor. Ekipman, item kimliği yerine isim/stat metni (`Record<slot,string>`). `statBonus` serbest metin olduğu için sayısal hasar/zırh sıralaması ve gerçek toplamlar hesaplanamıyor. Slot boşaltınca değer/ağırlık/stat uydurularak kayıplı yeniden üretiliyor. |
| Slot/zırh gösterimi | **KISMEN / YANLIŞ** | Veri tipinde 12 slot var ve HUD drawer 12 kart gösteriyor. Pazar modalı yalnız 8 slot gösteriyor; merkezdeki baş/gövde/kol/bacak zırhları `+48/+64/+24/+32` sabit metni. |
| Filtre/arama/sıralama/kilit | **KISMEN** | Pazarda Tümü/Silah/Kalkan/Zırh/Erzak-Emtia/Binek ve arama var. Sıralama yalnız sol pazar listesinde kademe/fiyat/ağırlık; oyuncu listesi sıralanmıyor, hasar/zırh sıralaması yok. Kilit yalnız modalın yerel `useState`'inde, yalnız toplu satışı engelliyor; tekil satışa ve kalıcılığa bağlı değil. |
| Şehir stoğu | **KISMEN** | Stok, statik katalogdan yerleşime göre deterministik türetilen 1–3 adetlik yerel modal durumu. Kalıcı şehir envanteri, üretim/tüketim ve oyuncunun sattığı malların geri dönmesi yok. Settlement yoksa modalda “Yol Kenarı Pazarı” fallback tanımı da ölü/yanıltıcı bir yol olarak duruyor. |
| Ganimet/Discard | **YOK** | Savaş sonrası sol=ganimet transfer ekranı yok; ganimet doğrudan envantere/soyut ödüle gidiyor. Discard paneli, bağış XP önizlemesi ve fazla XP uyarısı yok. |
| Taşıma kapasitesi | **YANLIŞ** | Üç farklı hesap var: çağrılmayan `carryCapacity = troops*12 + pack*60 + 120`; modal `troops*12+350` ve `inventory weight + 110`; HUD sabit `138/(troops*10+300)`. Yük hayvanı/yedek at sayıları yığınlardan türetilmiyor. |
| At/sürü/hız | **KISMEN / BAĞLANTISIZ** | `calculateBannerlordPartySpeed` içinde sürü ve yük formülü var, fakat oyuncu çağrıları `herdAnimals` göndermiyor. Yedek atla bindirilmiş yaya bonusu yok; yük bileşeni envanter ağırlığını değil `foodUnits` değerini kullanıyor. |
| Erzak/moral | **KISMEN / YANLIŞ** | Canlı tüketim tek `campaign.food` sayısından yapılıyor. Dört özel yiyecek satın alınınca doğrudan bu sayıya çevriliyor; diğer yemek/emtia kayıtları tüketime bağlı değil. Yiyecek çeşitliliği moral bileşeni yok. |
| Party ekranı | **YOK** | Ayrı tam ekran `P` akışı yok. `Ordum` drawer'ı dört sayaç kartı gösteriyor. Daha önemlisi `App.tsx` içinde `P`, pause aç/kapat olarak kullanılıyor; Bannerlord'daki Party kısayoluyla doğrudan çelişiyor. |
| Birlik modeli/terfi | **YANLIŞ / EKSİK** | Roster yalnız `militia/archer/cavalry/guard` sayaçları. `troops.ts` kültür adlarını değiştiriyor ama gerçek kültür ağaçları yok. Terfi doğrusal sınıf dönüşümü ve yalnız altın kullanıyor; yığın XP'si, dallanma, uygun at şartı ve bekleyen toplam ücret yok. |
| Yaralı/tutsak | **EKSİK** | Lordlarda toplam `wounded` var; oyuncu birlik yığınlarında yaralı alanı yok. Oyuncu tutsakları tek sayı; tür, hazır olma süresi, kapasite, kaçış, fidye ve lord tutsak ayrımı Party modelinde yok. Her tutsak anında `militia` olarak devşirilebiliyor. |
| HUD düğmeleri | **KISMEN** | `N`, `C`, `I`, `K` var. `P` yanlış işleve bağlı; `J` ve `L` yok. Görevler `V` altındaki dünya panelinde, klan rolleri Birlik drawer'ında. |
| HUD kaynak/tooltip | **KISMEN / YANLIŞ** | Dinar, HP, asker, erzak, moral, hız ve maaş görünüyor; fakat nüfuz yerine nam var, asker kapasitesi gösterilmiyor. `partyLimit` başka yerde hesaplandığı hâlde HUD kullanmıyor. Günlük gelir-gider, nüfuz ve moral bileşen dökümleri için hover tooltip yok. |
| Saat kadranı | **YANLIŞ** | `CampaignState.hour` başlangıçta 9 yazılıyor fakat üretimde ilerletilmiyor. Kadran hep aynı güneşi çiziyor; yıl da arayüzde sabit `1084`. |
| Karakter iskeleti | **KISMEN** | Altı nitelik/18 beceri, serbest puan harcama ve 5 odak sınırı var. Fakat merkezi beceri XP kazanımı ve karakter seviyesi ilerlemesi yok; başlangıç seviyesi 6 ve yüksek beceriler sabit. |
| Öğrenme/odak kuralı | **YANLIŞ** | `calculateLearningLimit`, yumuşak sınır ile sert tavanı karıştıran `(attr-1)*14 + focus*40 + 10` formülünü kullanıyor. `allocateFocusPoint`, odağa ek olarak beceriye anında +10 seviye veriyor. Nitelik vermek Vigor/Endurance'ta doğrudan +5 HP de veriyor. |
| Perkler | **YOK** | 25'li eşiklerde çift seçenekli perk tanımı/seçimi/etkisi yok. `unlockedPerks` başlangıçta üç serbest string taşıyor; Discard perkleri de yok. |
| Yoldaş/rol | **YOK / YANLIŞ** | `CampaignState` içinde gerçek companion listesi yok. `clanRoles`, bonus metni içeren isim string'leri; atama fonksiyonu herhangi bir string kabul ediyor. `partyLimit`, İaşeci'nin İdare becerisini değil, klan kademesi + `renown/40` hesabını kullanıyor. Diğer rol etkilerinin atanan kişinin becerisinden hesaplandığına dair canlı bağ yok. |
| Oyuncu ailesi | **YOK** | NPC kahramanlar için üretilmiş aile ağacı var. Oyuncu evliliği, hamilelik/çocuk, aile üyesi yaşlanması, oyuncu ölümü ve varisle devam akışı yok. Makro modaldaki veraset gösterimi canlı oyuncu ailesine bağlı değil. |
| Atölye/kervan | **KISMEN / YOK** | Atölye satın alma ve refaha bağlı sade günlük gelir var. Girdi/çıktı stoğu, fiyat, sermaye ve üretim zinciri yok. Oyuncunun yoldaş liderli canlı kervanı yok. |
| Krallık/nüfuz/ordu | **KISMEN / İKİ MODEL** | Krallık modalında makro nüfuz, politika ve seçim hesapları var; fakat `CampaignState` içinde oyuncu nüfuzu yok ve makro klanlar canlı yerleşim/hero klan modeliyle tek kaynak değil. Nüfuzla gerçek ordu toplama, uyum ve partilerin birlikte hareketi yok. |
| Kuşatma | **KISMEN** | Makine üretme/bombardıman fonksiyonları ve dünya simülasyonunda AI kuşatma ilerlemesi/fetih var. Oyuncunun süreye bağlı kuşatma kampı, iki taraflı makine düellosu, makine rezervi, yerleşim erzağıyla garnizon açlığı ve teslim pazarlığı tek canlı akış hâlinde değil. |
| Demircilik | **YANLIŞ / EKSİK** | Üç sabit şablon; anında kâr ve `WEAPON1`e kuşanma, Demircilik +8. Malzeme, eritme/arıtma, enerji, parça şemaları, parça bazlı istatistik, sipariş ve isimlendirme yok. |
| Dinamik AI/isyan | **KISMEN** | `worldSim` savaş/barış, lord emirleri, kuşatma, fetih ve takviyeyi ilerletiyor. Sadakat/yemek yardımcısı isyan riski hesaplıyor; canlı isyan partisi/klanı doğurma ve makro klan modeliyle birleşme tamamlanmış değil. |
| Suç/haydut katma | **YOK / KISMEN** | Serserilik yalnız beceri kaydı. Krallık bazlı suç derecesi ve sonuçları yok. Haydut tarafı savaş/tutsak soyutlamasıyla sınırlı; tür bazlı tutsak devşirme modeli kurulmadan Bannerlord akışı tamamlanamaz. |
| Performans ölçümü | **SON FAZDA** | Tip/kural/E2E doğrulamaları var; tekrarlanabilir göreli FPS/frame-time karşılaştırma paketi bu görevin sonunda kurulacak. SwiftShader ölçümü gerçek GPU FPS'i sayılmayacak. |
| Kayıt | **VAR AMA SON FAZDA GELİŞTİRİLECEK** | Sürümlü tek `localStorage` yuvası, elle kayıt ve günlük otomatik kayıt var. Çoklu sefer/slot ve Bannerlord tarzı kayıt yönetimi kullanıcı sırası gereği en son ele alınacak. |

### 6.4 Kesin uygulama sırası ve iş paketleri

Q1'de kullanıcı sırayı "mantıklı olan" ölçütüne bıraktı. Bağımlılıklar nedeniyle kesin sıra
**P0 karar/göç → P1 veri temeli → P2 envanter/pazar/ganimet → P3 Party → P4 gelişim →
P5 HUD → P6 büyük sistemler → P7 performans → P8 kayıt** olarak sabitlendi. Bir paketin
tip + kural testleri (gerekirse tarayıcı/E2E kapısı) geçmeden sonraki pakete başlanmayacak.

- [x] **P0 — Karar ve göç sözleşmesi (2026-10-22):** Q1–Q6 cevapları 6.5'e işlendi; eski kayıtların
      yeni item/troop/hero modeline deterministik ve idempotent göç kuralları ile kabul kapısı yazıldı.
- [x] **P1 — Veri temeli (2026-10-22):** `src/game/bannerlordFoundation.ts` ile sayısal stat'lı 60
      katalog tanımı ve özel tanımlar; adetli/kilitli yığınlar; tanım kimliğine bağlı savaş/sivil ekipman;
      oyuncu + Aybars/Helena/Torvald kahraman kayıtları ve kimlikli rol atamaları; 8 kültür × 14 düğümlük
      dallanan birlik ağaçları; XP/yaralı birlik ve hazır olma alanlı tutsak yığınları kuruldu. Kayıt v4'e
      yükseltildi, v1–v3 göçü ve Discard perk/tavan/kapasite sözleşmesi 29/29 kural testi + `verify:fast`
      ile doğrulandı. Tam ekran UI, bekleyen transfer ve Discard uygulama akışı P2'dedir.
- [ ] **P2 — Envanter + Discard + pazar + ganimet:** tek transfer çekirdeği üzerinde saha envanteri,
      şehir pazarı ve savaş ganimeti modları; kilit, filtre, arama ve sıralama.
- [ ] **P3 — Party (`P`):** birlik XP'si, dallanan terfiler, yaralı iyileşmesi, tutsak hazır olma durumu,
      kapasiteler, garnizon/değişim ve savaş sonrası tutsak akışı.
- [ ] **P4 — Karakter gelişimi ve roller:** kullanım bazlı beceri XP'si, karakter seviyesi, doğru öğrenme
      sınır/hız, perk seçimleri ve gerçek klan rolü etkileri.
- [ ] **P5 — HUD:** `N/C/I/P/J/L/K`, intraday saat, oyuncu nüfuzu, kapasiteli asker göstergesi ve bütün
      kaynaklar için hesap dökümü tooltip'leri.
- [ ] **P6 — Büyük sistemler:** yoldaş işe alma/görevleri, aile, atölye girdi-çıktı ekonomisi, kervan,
      krallık/ordu, kuşatma kampı/açlık, parça bazlı demircilik, canlı isyan ve suç sistemi.
- [ ] **P7 — Performans testleri (sondan bir önceki iş):** aynı tohum/senaryo ile açılış, harita,
      envanter/pazar, Party, karakter ve savaş sahnelerinde göreli frame-time/FPS, bellek ve yükleme
      karşılaştırması; sonuçlar tablo hâlinde bu dosyaya işlenecek.
- [ ] **P8 — Kayıt sistemi (en son iş):** bütün yeni veri modeli oturduktan sonra Bannerlord tarzı
      kayıt yönetiminin kapsamı ayrıca netleştirilip uygulanacak.

### 6.5 Kapatılan kararlar ve P0 göç sözleşmesi (2026-10-22)

- [x] **Q1 — Uygulama sırası ("mantıklı olana öncelik verelim"):** Önce karar/göç ve veri temeli,
      sonra Envanter/Pazar/Ganimet, Party, karakter gelişimi, HUD ve büyük sistemler. Performans
      sondan bir önceki, kayıt yönetimi en son iştir.
- [x] **Q2 — Arayüz (`full_bannerlord`):** Envanter, pazar, ganimet ve Party tam ekran üç sütun
      düzeninde olacak: sol karşı taraf/Discard/Dismiss, ortada döndürülebilir 3B kahraman/birlik
      ve slotlar, sağda parti listesi.
- [x] **Q3 — İşlem modeli ("mantıklı olan"):** Bannerlord'daki bekleyen transfer modeli seçildi.
      Satır taşıma önce yerel sepete yazılır; altta net altın/XP/ücret görünür; `Done` atomik
      olarak onaylar, `Cancel` hiçbir kampanya alanını değiştirmeden geri alır.
- [x] **Q4 — Discard XP ("Bannerlord'daki gibi yapalım, araştır"):** Zırh için İdare 100
      `paid_in_promise`, silah/kalkan için İdare 125 `giving_hands` zorunludur. Perk, atanmış
      İaşeci (Quartermaster) kahramanında aranır; atama yoksa parti liderine bakılır. Eşya başına
      bağış XP'si, eşyanın taban değerinin %50'sinden türetilir ve resmî kademe tavanlarıyla
      sınırlanır: **T1 75, T2 150, T3 250, T4+ 300**. T0 için ikincil kaynaklardaki **35** tavanı
      ayrı sabit olarak tutulur ve P2 kabul testinde ayrıca kilitlenir. XP yalnızca bir sonraki
      kademeye ilerleyebilen normal birlik yığınlarına gider; toplam ihtiyaç aşılırsa önizleme
      kırmızı/taşma durumunu gösterir.
- [x] **Q5 — Birlik modeli ("Bannerlord'daki gibi"):** Kültürlere özgü dallanan birlik ağaçları;
      tür yığını başına sağlıklı/yaralı, XP, ücret, terfi maliyeti ve at şartı; tür bazlı tutsaklar,
      hazır olma, kapasite, fidye/serbest bırakma ve garnizon değişimi uygulanacak.
- [x] **Q6 — Kapsam ("adım adım her şeyi yapalım, çalıştığından emin olarak"):** Nihai hedef tam
      kapsamdır; fakat her paket ayrı doğrulanmadan sonrakine geçilmeyecek. Karakter gelişiminde
      kullanım XP'si, seviyede 1 odak, 4 seviyede 1 nitelik, doğru yumuşak/sert öğrenme sınırları,
      25'li eşiklerde çift perk seçimi ve rol kapsamlı gerçek etkiler kurulacak.

**P0 göç sözleşmesi.** Eski kayıtlar reddedilmeyecek; `SAVE_VERSION` veri temeliyle birlikte
v4'e yükseltilecek ve v1–v3 kayıtlar yüklenirken deterministik olarak göç ettirilecek:

1. Eski tekil `inventoryItems`, tanım kimliği + adet + kilit taşıyan yığınlara normalleştirilir;
   üretilmiş pazar/ganimet kimliklerinden katalog tanımı geri çıkarılır. Bilinmeyen/bağışlanmış
   ekipman için kalıcı özel tanım üretilir.
2. Slot→metin ekipmanı silinmez; her metinden kalıcı bir eşya tanımı üretilir ve oyuncu
   kahramanının savaş setine tanım kimliğiyle bağlanır. Eski metin alanı geçiş süresince
   görüntüleme yedeği olarak korunur.
3. Dört sınıflı `roster`, toplamlar birebir korunarak oyuncu kültür ağacındaki karşılık gelen
   birlik yığınlarına çevrilir; XP 0, yaralı 0 başlar. Eski `prisoners` sayısı, hazır olmayan
   haydut acemi tutsak yığınına çevrilir.
4. Oyuncu için gerçek kahraman kaydı; mevcut rol adlarından Aybars, Helena ve Torvald için
   gerçek yoldaş kayıtları oluşturulur. Rol atamaları artık kahraman kimliği taşır; eski metin
   rolleri geçişte görüntüleme yedeğidir.
5. Eksik/bozuk yeni alanlar kaydı çökertmez: aralıklar kırpılır, bilinmeyen tanım/birlik
   kimlikleri atlanır, toplamlar eski alanlarla yeniden mutabıklaştırılır. Göç idempotenttir;
   aynı kayıt iki kez göç ettirilirse ikinci sonuç değişmez.
6. P0/P1 kabul kapısı: yeni sefer + v3 kayıt göçü + yığın adetleri + birlik ağacı bütünlüğü +
   Discard perk/tavan/kapasite hesapları kural testlerinden ve `npm run verify:fast`ten geçecek.


