# Mount & Blade II: Bannerlord — Sefer Haritası (Campaign Map) Sistem Mimarisi, Matematiksel Modeller ve Yapılacaklar Yol Haritası

Bu doküman; paylaştığınız teknik analiz raporu, *TaleWorlds.CampaignSystem* çekirdek mekanikleri (`DefaultPartySpeedCalculatingModel`, `PartyBase`, `Settlement`, `MobilePartyAi`, `MapVisibilityModel`) ve görsel referans ekran görüntüleri birleştirilerek hazırlanmış **Derinlemesine Sistem Araştırması ve Modüler Uygulama Planıdır**.

---

## 1. Sefer Haritası (Overworld) vs. Muharebe / Yerleşim İçi (Tactical Scene) Ayrımı

Bannerlord mimarisinde oyun dünyası iki ayrı ölçek ve görsel katmandan oluşur:

1. **Stratejik Sefer Haritası (Campaign / Overworld Map)**:
   - Tüm Kalradya kıtasını (`2400m × 1800m`) kapsayan topografik simülasyon katmanıdır.
   - Ordular haritada bireysel yüzlerce asker olarak değil, **liderin atlı minyatür piyonu (Sancaktar figürü)** olarak temsil edilir.
   - Her partinin **tam altında (atın ayak hizasında)** klan/krallık arması ve mevcut asker sayısı (`45+4` formatında: sağlam + yaralı) yer alır.
   - Şehirler, kaleler ve köyler harita üzerinde kendi mimari silüetlerini yansıtan ölçekli 3B maketler (surlar, kuleler, iç kale, şehir mahalleleri, köy tarlaları) olarak yükselir.

2. **Taktiksel Muharebe ve Şehir/Kale İçi (Low-Poly Tactical Battle Scene)**:
   - Bir lordla savaşa girildiğinde veya kuşatma/meydan muharebesi başladığında, sefer haritasındaki `(x, z)` koordinatının biyomu (İmparatorluk ovası, Kuzey karlı dağ geçidi, Doğu bozkırı, Güney çöl vahası, Nehir kıyısı) okunarak gerçek insan ölçeğinde (`1:1`) taktik sahne üretilir.
   - WebGL/WebGPU ortamında yüzlerce/binlerce askerin yüksek FPS ile çarpışabilmesi için **Stylized Low-Poly (keskin yüzeyli, GPU InstancedMesh tabanlı)** piyade, okçu, süvari ve muhafız modelleri kullanılır.

---

## 2. Birlik Lojistiği ve Hareket Hızı Matematiği (`DefaultPartySpeedCalculatingModel`)

Sefer haritasında bir birliğin (oyuncu veya yapay zeka lordu) anlık hızı sabit değildir; her karede aşağıdaki matematiksel denklemle hesaplanır:

### 2.1. Taban Hız ve Grup Büyüklüğü Cezası
$$\text{Boyut Etkisi} = 5.00 - (\text{Toplam Asker } T \times 0.0075)$$
- Tek kişilik veya çok küçük bir devriye `~4.90 – 5.00` taban hızla başlar.
- Kalabalık ordular (`50–80` asker) koordinasyon zorluğu nedeniyle taban hızda `-0.35` ila `-0.60` düşüş yaşar.

### 2.2. Süvari ve Atlı Piyade (Footmen on Horses) Bonusu
$$\text{Süvari Bonusu} = 3.0 \times \frac{C}{I + C} \times D$$
- $C$: Süvari sayısı + envanterdeki yedek binek atlarını kullanan piyade sayısı.
- $I$: Yaya kalan asker sayısı.
- $D$: Grup büyüklüğüne bağlı sönümleme katsayısı ($\approx 0.45$).
- Tamamı süvarilerden oluşan çevik bozkır birlikleri (ör. Khuzait akıncıları) `+1.10` ila `+1.35` ek hız kazanırken, ağır piyade orduları daha yavaş ilerler.

### 2.3. Sürü Cezası (Herd Penalty), Kargo, Yaralılar ve Esirler
- **Sürü Cezası**: Her yaya asker 2 hayvanı, her süvari 1 ek hayvanı güdebilir. Limit aşıldığında:
  $$\text{Sürü Cezası} = \max\left(0,\; \frac{A - T \times 1.05}{10} \times 1.05 \times D\right)$$
- **Yaralı ve Esir Yükü**: Yaralı askerler (`wounded`) ve esirler (`prisoners`) ordunun yürüyüş temposunu düşürür (`-0.015 × (yaralı + esir)`).
- **Moral Etkisi**: Yüksek moral (`>75`) `+0.15` şevk bonusu verirken, düşük moral (`<40`) `-0.25` yavaşlatma uygular.
- **Arazi ve Biyom Çarpanı**:
  - İmparatorluk Taş Yolu: `×1.12` (`+12%`)
  - Açık Ova / Bozkır: `×1.00`
  - Sık Orman: `×0.78` (`-22%`)
  - Karlı Kuzey Dağları: `×0.80` (`-20%`)
  - Dik Yamaç / Dağ Geçidi: Eğim oranına göre `×0.72`

---

## 3. Görüş Menzili (Spotting Range), Savaş Sisi (Fog of War) ve İstihbarat

1. **Dinamik Görüş Yarıçapı (`Spotting Range`)**:
   - Oyuncunun haritadaki görüş yarıçapı; **Bulunduğu Rakım (Elevation)**, **İzcilik (Scouting) Yeteneği** ve **Arazi Örtüsü** ile hesaplanır:
     $$\text{Görüş Menzili} = R_{\text{taban}} + (\text{Rakım } h \times 4.5) - (\text{Orman Yoğunluğu} \times 14)$$
   - Yüksek bir tepeye çıkıldığında vadi tabanındaki lordlar çok daha uzaktan tespit edilir.
2. **Lord Görünürlüğü ve Bilgi Kısıtlaması (Information Restrictions)**:
   - Oyuncunun görüş menzili (`spottingRange`) dışındaki lordlar **Savaş Sisi (Fog of War)** içinde kalır ve haritada görünmez.
   - Görüş menziline giren lordların **tam altında** krallık sancağı ve asker sayısı (`38+3`) belirir.
   - Çok uzaktaki yerleşimlerin detaylı garnizon/erzak verileri de oyuncu keşif menziline yaklaştıkça netleşir.

---

## 4. Harita Üzerinde Sancak Etiketleri, Lord Tooltip ve Kesintisiz Takip (Follow) Sistemi

1. **Karakter Altı Sancak ve Asker Etiketi (Bannerlord Nameplate)**:
   - Hem oyuncunun hem de görünür lordların 3B atlı modellerinin **tam altında** (atın toynak hizasının hemen altında):
     - Sol tarafta krallık renginde arma/sancak ikonu,
     - Sağ tarafta sağlam asker sayısı (`38`), varsa yaralı sayısı (`+4` turuncu/kızıl) ve esir yıldızı (`★3`) gösterilir.
2. **Lord Üzerine Gelindiğinde (Hover Tooltip) Gösterilecek Bilgiler**:
   - **Lord Adı, Unvanı ve Krallığı** (ör. *Lord Kargı · İmparatorluk*)
   - **Anlık Faaliyet / Hedef** (ör. *Lycaron çevresinde devriye geziyor* / *Poros şehrine gidiyor*)
   - **Toplam Asker ve Yaralılar** (`34 Sağlam + 4 Yaralı`)
   - **Birlik Dağılımı** (`Piyade: 14 · Okçu: 10 · Süvari: 8 · Muhafız: 6`)
   - **Esirler (`Prisoners`)** (`5 Esir Asker`)
   - **Anlık Harita Hızı ve Lojistik** (`Hız: 4.7 · Erzak: 14 Gün · Moral: 84`)
3. **Kesintisiz Lord Takip (Dynamic Pursuit / Follow) Mekanizması**:
   - Oyuncu haritada bir lorda tıkladığında (veya takip başlattığında) hedef sabit bir `(x, z)` noktası değil, **lordun canlı referansı (`followingLordId`)** olur.
   - Zaman duraklatılmışsa otomatik olarak `1x` hızında başlatılır.
   - Lord nereye giderse gitsin (oyuncu lorddan yavaş olsa bile), lord **oyuncunun görüş menzilinden (`spottingRange`) çıkana kadar** oyuncunun rotası her karede lordun güncel konumuna güncellenir ve takip asla bırakılmaz.
   - Oyuncu lorda yetiştiğinde (`mesafe < 10.5m`) otomatik olarak karşılaşma/diplomasi ekranı açılır.

---

## 5. Yerleşim Ekosistemi (Şehir, Kale, Köy), Otomatik Giriş ve 3B Mimari Ölçek

1. **Uzak Yerleşime Tıklandığında Otomatik Yürüyüş ve Otomatik Menü Açılışı**:
   - Haritada uzaktaki bir Şehir, Kale veya Köye tıklandığında zaman duraklatılmışsa otomatik olarak akar (`1x`), oyuncu kara/köprü rotası üzerinden yerleşime yürür ve **kapısına vardığı anda otomatik olarak içine girip ilgili Şehir / Kale / Köy yönetim menüsü (`SettlementModal`) açılır**.
2. **Dağ Altında Kalan Yerleşimlerin Düzeltilmesi (Genişletilmiş Vadi/Teras Düzleştirme)**:
   - Tüm `51 Şehir`, `29 Kale` ve `131 Köy` (`211 yerleşim`) için `groundHeightAt` içinde geniş iç plato (`innerRadius`) ve yumuşak dış vadi geçişi (`outerBlendRadius`) uygulanarak hiçbir yerleşimin veya surunun dağ yamacı altında kalmaması garanti edilir.
3. **Büyük ve Gerçekçi 3B Şehir / Kale / Köy Modelleri**:
   - **Şehirler (Towns)**: Geniş sekizgen dış surlar, 8 burç kulesi, kemerli ana kapı, iç kale (citadel), kubbeli merkez katedral/divan binası, çok katlı şehir evleri ve pazar meydanı ile kalelerden belirgin biçimde büyük ve görkemli inşa edilir.
   - **Kaleler (Castles)**: Kademeli kaya kaide üzerinde yükselen çift katmanlı askeri tahkimat, 4 ağır köşe burcu, yüksek başkule (donjon) ve kışla avlusundan oluşur.
   - **Köyler (Villages)**: Ocak (Hearth) evleri, tahıl ambarı, yel değirmeni/kuyu, ahşap çitler ve ekili buğday/zeytin tarlalarıyla çevrili organik kırsal yerleşimlerdir.
4. **Refah, Erzak, Güvenlik ve Sadakat Döngüsü**:
   - Günlük döngüde her şehir ve kale; refahına ($\text{Refah}/80$), garnizonuna ($\text{Garnizon}/40$) ve bağlı köylerinin üretim durumuna göre erzak, güvenlik ve sadakat dengesini günceller.

---

## 6. Modüler Dosya Mimarisi (Temiz ve Şişmeyen Kod Yapısı)

Dosyaların aşırı büyümesini önlemek ve her sistemi kolayca bulabilmek için proje aşağıdaki modüllere ayrılmıştır:

| Modül Dosyası | Sorumluluk Alanı |
| :--- | :--- |
| `src/game/campaignSystem.ts` | **(YENİ)** Bannerlord parti hızı formülü (`DefaultPartySpeedCalculatingModel`), lord yapay zeka devriye/rota karar ağacı, dinamik görüş menzili (`spottingRange` / Fog of War) ve yerleşim erzak/sadakat/güvenlik hesaplamaları. |
| `src/game/mapGen.ts` | Kalradya kıta topografyası, nehirler, köprüler, dağ zincirleri ve 211 yerleşim için genişletilmiş teras/vadi düzleştirme sistemi. |
| `src/game/navigation.ts` | Kara ve köprü tabanlı A*/waypoint rota bulucu (`computeLandPath`, `stepAlongLandOnly`). |
| `src/game/proceduralModels.ts` | Büyük ölçekli 3B Şehir, Kale, Köy mimari modelleri, çok katmanlı ağaçlar ve yakın plan arazi detay shader'ı. |
| `src/game/rules.ts` | 51 Şehir, 29 Kale, 131 Bağlı Köy tanımları, başlangıç sefer durumu, diplomasi ve muharebe sonuç kuralları. |
| `src/components/WorldCanvas.tsx` | 3B sahne döngüsü, karakter altı sancak/asker etiketleri, zengin Lord & Yerleşim hover tooltip'leri, kesintisiz Lord takip sistemi ve otomatik yerleşim girişi. |
| `src/components/SettlementModal.tsx` | Şehir, Kale ve Köy iç yönetim ekranı (Bağlı köyler, refah, sadakat, güvenlik, erzak, asker toplama ve kuşatma). |

---

## 7. Yapılacaklar Listesi (Uygulama Kontrol Listesi)

- [x] **Faz 1 — Araştırma ve Mimari Dokümantasyon**: Bannerlord sefer haritası mekaniklerinin matematiksel formüllerle `BANNERLORD_MAP_SYSTEM_RESEARCH.md` dosyasına çıkarılması.
- [x] **Faz 2 — Modüler Sefer Sistemi (`src/game/campaignSystem.ts`)**:
  - [x] Grup büyüklüğü, süvari oranı, yaralı, esir, erzak/sürü yükü, moral ve araziye dayalı `calculateBannerlordPartySpeed` & `getLordDetailedIntel` motoru.
  - [x] Lordlar için yaralı (`wounded`), esir (`prisoners`), birlik dağılımı (`roster`), anlık görev (`currentAction`) ve yerleşimler arası dinamik devriye rotası (`stepLordCampaignRoute`).
  - [x] Rakım ve araziye duyarlı Görüş Menzili (`computePlayerSpottingRange`) ve Savaş Sisi (Fog of War) görünürlük kontrolü (`isWithinSpottingRange`).
- [x] **Faz 3 — Karakter Altı Sancak/Asker Etiketi & Zengin Lord Tooltip (`WorldCanvas.tsx`)**:
  - [x] Oyuncu ve Lordların krallık arması + asker sayısının (`28+2`) karakterin **tam altında** (`groundHeightAt - 0.15` hizasında) gösterilmesi.
  - [x] Fareyle Lordun üzerine gelindiğinde sağlam/yaralı asker, birlik tipleri (Piyade, Okçu, Süvari, Muhafız), esirler (`prisoners`), hız ve mevcut hedefini gösteren Bannerlord tarzı bilgi kartı.
- [x] **Faz 4 — Kesintisiz Lord Takip & Uzak Yerleşime Otomatik Giriş**:
  - [x] Lorda tıklandığında görüş açısından (`spottingRange`) çıkana kadar asla bırakmayan dinamik takip (`followingLordId`) ve ekran altı takip göstergesi.
  - [x] Uzaktaki şehir/kale/köye tıklandığında zamanın otomatik akması ve varışta doğrudan yerleşim menüsünün (`SettlementModal`) açılması.
- [x] **Faz 5 — Dağ Altında Kalan Yerleşimlerin Düzeltilmesi ve Büyük 3B Şehir/Kale Modelleri**:
  - [x] 211 yerleşimin tamamı için geniş vadi düzleştirmesi (dağların surları veya köyleri örtmesinin kesin olarak engellenmesi).
  - [x] Şehir ve kalelerin 3B modellerinin dış surlar, kuleler, iç kale ve şehir dokusuyla büyütülüp gerçekçi hale getirilmesi.
