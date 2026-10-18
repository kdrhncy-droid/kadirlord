# Kalradya Harita İyileştirmesi, Akıcı Kamera, Yüksek Çözünürlüklü Doku ve Dokun-ve-Git Planı

Bannerlord (Kalradya) sefer haritasında Aserai çöl coğrafyasının düzeltilmesi, yapay çim köprünün kaldırılarak otantik dar taş köprülü boğaza dönüştürülmesi, yakın çekimde pürüzsüz deniz/arazi detay dokuları, kademeli yerleşim görünürlüğü (LOD), sıfır gecikmeli etiket takibi, hızlı ve orantılı fare tekerleği zumu ile akıcı dokun-ve-git etkileşiminin mimari uygulama planıdır.

---

### Kullanıcı Tercihleri ve Kesinleşen Kararlar

> [!IMPORTANT]
> Kullanıcı ile yapılan netleştirme aşamasında teyit edilen kararlar:
> - **Harita Uzaklık Görünürlüğü (LOD)**: Uzaktan bakıldığında yalnızca **Şehirler ve Kaleler** belirgin olacak; **Köyler** yalnızca kamerayla yakınlaşıldığında ortaya çıkacak. Böylece yazılar ve kalkanlar birbirine girmeyecek.
> - **Aserai & Ortysia-Quyaz Geçişi**: Yapay ve yeşil çimenli köprü artifact'i kaldırılacak; yerine doğal kumtaşı falezlerle daralan sahil burnu ve ortasında otantik kemerli taş köprü yer alacak. Aserai kıyıları yemyeşil değil, otantik sıcak altın çöl kumu ve kumtaşından oluşacak.
> - **Dokun ve Git (Click-to-Move)**: Haritada herhangi bir kara veya yerleşime tıklandığında ordu hemen yola çıkacak; sefer zamanı duraklatılmışsa otomatik olarak **1x hıza** geçecek ve bir kale, şehir veya lordan varıldığında etkileşim penceresi otomatik açılacak.

---

## 1. Genel Bakış ve Temel Hedefler

1. **Aserai ve Perassic Denizi Coğrafi Doğrulaması**:
   - Aserai yarımadasının kuzey kıyılarında (`z >= 140`) yeşil ova dokuları yerine sıcak altın sarısı çöl kumu, kanyon falezleri ve vaha geçişleri uygulanacak.
   - `Ortysia` ile `Quyaz` arasındaki boğaz, iki yakadan uzanan doğal sahil burunları ve aralarındaki zarif kemerli taş köprü ile Bannerlord'un klasik geçişine dönüştürülecek.
2. **Kademeli Görünürlük (Settlement LOD Hierarchy)**:
   - Uzak / Kıta Görünümünde (`zoomDist > 200`): Yalnızca 25 Şehir ve 14 Kale görünecek; 22 Köy ve gereksiz etiketler gizlenecek.
   - Orta Görünümde (`zoomDist 80..200`): Şehirler, Kaleler ve yaklaşan Lordlar net okunacak.
   - Yakın Görünümde (`zoomDist < 80`): İlgili bölgedeki Köyler ve yerel detaylar pürüzsüzce belirecek.
3. **Sıfır Gecikmeli (0ms Jitter) Etiket Takibi**:
   - Etiketlerin ekrandaki 2D koordinatları 12 FPS'lik React state (`setState`) yerine, WebGL render döngüsü (`requestAnimationFrame`) içerisinde her karede (60/120 FPS) doğrudan DOM elemanlarının `transform: translate3d(x, y, 0)` stiline yazılacak. WASD veya fareyle harita kaydırılırken isimler milisaniyelik bile geride kalmayacak, araziye çivilenmiş gibi hareket edecek.
4. **Hızlı ve Orantılı Zum (Dynamic Exponential Zoom)**:
   - Mevcut sabit `0.12` kat sayısı yerine irtifaya bağlı orantılı adım (`deltaY * (zoomDist * 0.0035 + 0.4)`) uygulanacak. Kullanıcı fare tekerleğini çevirdiğinde 6-8 çentikte karakter başından tüm kıtaya kadar akıcı ve zahmetsizce geçiş yapabilecek.
5. **Yüksek Çözünürlüklü Yakın Plan Doku ve Gerçekçi Dünya Ölçeği**:
   - Tek bir harita kaplamasının gerilmesinden kaynaklanan pikselleşme, Three.js materyaline eklenecek yüksek frekanslı prosedürel detay normal/roughness katmanı (yakında çimen telleri, kaya damarları, kum dalgalanması) ve nehir/deniz için animasyonlu su şaderi ile giderilecek.
   - Karakter seviyesine inildiğinde (`zoomDist = 16..36m`) kamera açısı ve çevresel ağaç/arazi ölçeği optimize edilerek dünyanın büyüklüğü ve derinliği tam olarak hissettirilecek.
6. **Kusursuz Dokun-ve-Git (Click-to-Move)**:
   - Haritaya tıklandığında altın hedef halkası ve su üzerinden geçmeyen çoklu köprü/kıstak rotası anında çizilecek.
   - Sefer zamanı duraklatılmışsa (`timeScale = 0`), tıklandığı an otomatik olarak `timeScale = 1` yapılacak; ordu hedefe vardığında ise sefer zamanı durdurulup yerleşim/diplomasi penceresi açılacak.

---

## 2. Kullanıcı Deneyimi ve Arayüz Akışı

### Kullanıcı Sefer Haritası Akışı
```
[ Harita Tıklaması (Yerleşim / Kara) ]
               │
               ▼
   [ snapToNearestLand ] (Deniz tıklandıysa en yakın kıyıya kenetle)
               │
               ▼
   [ computeLandPath ] (Su aşmayan, köprü ve kıstakları kullanan rota)
               │
               ▼
   [ Zamanı Otomatik 1x Yap ] (Kullanıcı beklemeden ordu yürüyüşe başlar)
               │
               ▼
   [ Hedefe Varış ] ───► [ Yerleşim / Diplomasi Penceresini Otomatik Aç ]
```

### Görsel Tasarım ve Bannerlord Arayüz Prensipleri
- **Üst Kısım Temizliği**: Harita ekranının üst kısmı tamamen açık bırakılarak 3D manzaranın görkemi korunacak. Yalnızca sağ üst köşede kompakt bronz buton grubu (`Sancak [C]`, `Tam Kıta [V]`, ses, duraklatma) yer alacak.
- **Alt Arayüz**: Bannerlord'un klasik bronz ve altın işlemeli 3 parçalı alt paneli (Kıta Atlası / Ordu / Vakanüvis, Takvim/Zaman Çarkı, Kaynak Çubuğu) korunacak.
- **Pikselleşmeyen Su ve Kıyı**: Kıyı şeritlerinde pürüzsüz dalga hareketi, kumlu sığlıklar ve derin lacivert su yüzeyi.

---

## 3. Mimari ve Modüler Sistem Tasarımı

```
┌─────────────────────────────────────────────────────────────┐
│                       src/App.tsx                           │
│   (Kampanya Durumu, Zaman Skalası 0/1/2/4, Aktif Modallar)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│  src/game/navigation.ts      │ │  src/game/mapGen.ts          │
│  - isNavigableLandAt()       │ │  - groundHeightAt()          │
│  - computeLandPath() (A*)    │ │  - getMacroWaterDepthAt()    │
│  - snapToNearestLand()       │ │  - CONTINENTAL_BRIDGES       │
│  - stepAlongLandOnly()       │ │  - Aserai kum/falez matematiği│
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               └───────────────┬────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               src/components/WorldCanvas.tsx                │
│  - 60 FPS Three.js Render Döngüsü                           │
│  - Direct DOM Ref ile Sıfır Gecikmeli Etiket Takibi (0ms)    │
│  - Prosedürel Detay Normal Dokusu (Pikselleşmeyi Önleyen)   │
│  - Üstel Hızlı Zum (6-8 tıkta tam kıta)                     │
│  - Otomatik Zaman Açan Dokun-ve-Git Mekanizması             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 src/components/GameHud.tsx                  │
│  - Kademeli Görünürlük (Uzakta Şehir/Kale, Yakında Köy)     │
│  - Sadeleştirilmiş, Gereksiz Panellerden Arındırılmış Bannerlord Arayüzü │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Uygulama Adımları ve Teknik Değişiklikler

### Adım 1: Aserai & Ortysia-Quyaz Coğrafyasının Düzeltilmesi (`src/game/mapGen.ts`)
- `mapGen.ts` içerisindeki yapay çim köprü tanımı (`onOrtysiaBridge`) kaldırılacak.
- `Ortysia` burnu (`-232, 102`) ve `Quyaz` burnu (`-232, 192`) doğal kumtaşı falezlerle birbirine yaklaştırılacak; aradaki dar deniz boğazına otantik kemerli taş köprü (`bridge_quyaz_strait`) yerleştirilecek.
- Aserai bölgesinin zemin yükseklik ve doku haritasında (`z > 140`), yeşil çayır dokusu tamamen sıcak altın çöl kumuna, kurak kumtaşı tepelerine ve vaha kıyılarına dönüştürülecek.

### Adım 2: 60 FPS Sıfır Gecikmeli Etiket Motoru (`WorldCanvas.tsx` & `GameHud.tsx`)
- Etiketlerin ekran pozisyonu hesaplaması 12 FPS'lik React state'ten çıkarılacak.
- `WorldCanvas` içerisinde her bir yerleşim ve lord için oluşturulan DOM kapsayıcıları, Three.js'in `requestAnimationFrame` döngüsünde doğrudan `transform: translate3d(x, y, 0)` ile güncellenecek.
- Böylece WASD ile haritada gezinirken veya fareyle harita sürüklenirken etiketler 1 salise dahi gecikmeyecek, araziye tam kilitli kalacak.

### Adım 3: Kademeli Yerleşim Görünürlüğü (Settlement LOD)
- `zoomDist > 200` (Kıta Görünümü): Yalnızca 25 Şehir ve 14 Kale gösterilecek; köyler gizlenecek. Şehir ve kale isimleri aralıklı ve net olacak.
- `zoomDist <= 200`: Köyler (`VILLAGE`) pürüzsüzce görünür hale gelecek.

### Adım 4: Hızlı ve Akıcı Fare Tekerleği Zumu
- `handleWheel` dinleyicisindeki sabit adım yerine:
  ```typescript
  const zoomFactor = Math.max(0.4, targetCamZoomDist * 0.0035);
  const zoomStep = e.deltaY * zoomFactor;
  targetCamZoomDist = clamp(targetCamZoomDist + zoomStep, 16, 920);
  ```
  böylece 6-8 tekerlek çentiği ile yakın karakter bakışından kıta görünümüne kolayca geçilebilecek.

### Adım 5: Yüksek Çözünürlüklü Yakın Plan Doku ve Derinlik Hissi
- Karakterin yakınına inildiğinde (`zoomDist 16..36m`) arazinin ve suyun piksel piksel görünmemesi için Three.js materyaline yüksek frekanslı prosedürel normal ve detay gürültüsü (`bumpMap` / `roughnessMap` frekansı artırılacak) eklenecek.
- Su materyaline hafif dalga speküleri eklenerek yakın planda canlı ve kaliteli bir görünüm sağlanacak; karakter boyutu ve görüş açısı (FOV) ile dünyanın devasa hissettirmesi sağlanacak.

### Adım 6: Dokun-ve-Git (Click-to-Move) ve Otomatik Zaman/Etkileşim
- Haritaya tıklandığında `campaignTimeScale === 0` ise otomatik olarak `1` yapılacak (ordu hemen harekete geçecek).
- Bir şehre, kaleye veya lordan tıklandığında ordu kapıya vardığı anda otomatik olarak `onOpenSettlement(target)` veya `onOpenDiplomacy(target)` tetiklenecek.

### Adım 7: Doğrulama ve Test
- `node --test src/game/rules.test.ts` ile tüm navigasyon, köprü ve sınır testleri doğrulanacak.
- `playwright-cli` ile hem Kıta (LOD) hem de Aserai boğazı ve yakın plan vadi ekran görüntüleri alınarak görsel kusursuzluk onaylanacak.
