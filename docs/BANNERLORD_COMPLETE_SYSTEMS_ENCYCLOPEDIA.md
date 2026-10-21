# Mount & Blade II: Bannerlord — Tüm Oyun Sistemleri, İç Menüler, Kuşatma, Karakter, Envanter, Beceriler ve Lord AI Ansiklopedisi & Yapılacaklar Listesi

Bu doküman, Google üzerinden yapılan kapsamlı teknik ve görsel araştırmalar sonucunda **Mount & Blade II: Bannerlord**'un tüm çekirdek sistemlerini en ufak ayrıntısına kadar hem **görsel kullanıcı arayüzü şemaları (UI Wireframes)** hem de **matematiksel/mekanik kuralları** ile belgelemektedir. Dokümanın sonunda projemiz için eksiksiz **Yapılacaklar Listesi (Master TODO & Roadmap)** yer almaktadır.

---

## BÖLÜM 1: Şehir, Kale ve Köy İç Menüleri, Bina Projeleri ve Yerleşim Ekonomisi

### 1.1 Şehir (Town) Tam Ekran Arayüzü ve Etkileşim Mimarisi
Bannerlord'da bir şehre girildiğinde ekran 4 ana bölgeye ayrılır:
1. **Üst Durum Çubuğu (Settlement Info Bar):** Şehir Sancağı, Şehir Adı, Sahibi Olan Klan, Kültür, **Sur Seviyesi (1-3)**, **Refah (Prosperity)**, **Garnizon**, **Milis (Militia)**, **Erzak (Food)**, **Bağlılık (Loyalty 0-100)**, **Güvenlik (Security 0-100)**.
2. **Sağ Üst İleri Gelenler ve Soylular Portre Çubuğu (Notables & Characters Bar):**
   - **Divandaki Soylular (Keep):** Şehirde bulunan lordlar ve leydiler.
   - **Şehir İleri Gelenleri (Notables):** Tüccarlar (Merchants), Zanaatkarlar (Artisans), Çete Liderleri (Gang Leaders). Her birinin **Güç (Power: प्रभाव)** puanı (örn. 120, 250, 400+) ve oyuncuyla **İlişki (-100 ile +100)** seviyesi vardır.
   - **Meyhanedeki Gezginler (Tavern):** Yoldaş adayları (Wanderers/Companions), Fidyeci (Ransom Broker), Paralı Asker Lideri.
3. **Sol Eylem Menüsü (Action Buttons):**
   - `Şehir Merkezinde Dolaş (Take a walk around the town center)`
   - `Kalenin İç Avlusuna Git (Go to the Keep)` → *Divan (Lord's Hall)* ve *Zindan (Dungeon)* alt seçenekleri açılır.
   - `Arenaya Git (Arena)` → *Pratik Dövüşü (Practice Fight)*, *Turnuvaya Katıl (Join Tournament)*, *Turnuva Liderlik Tablosu*.
   - `Meyhane Bölgesine Git (Go to the Tavern District)` → *Paralı Asker Kirala*, *Esirleri Fidye Karşılığı Sat*, *Yoldaş Kirala*, *Hancıdan İstihbarat Al*, *Masa Oyunu (Tablut/Seega) Oyna*.
   - `Asker Topla (Recruit Troops)` → İlişki puanına göre açılan 6'lı gönüllü slot matrisi.
   - `Ticaret Yap (Trade)` → Çift panelli tam envanter ve pazar ekranı.
   - `Demirciye Git (Enter Smithy)` → Cevher Arıtma (Refine), Silah Eritme (Smelt), Özel Silah Dövme (Forge) ve Siparişler (Orders).
   - `Şehri Yönet (Manage Town)` → *(Yalnızca şehir oyuncuya aitse görünür)* Bina inşası, Vali (Governor) atama, İhtiyat Akçesi (Reserve Gold) ve Günlük Varsayılanlar.
   - `Burada Biraz Zaman Geçir (Wait here for some time)`
   - `Ayrıl (Leave)`

#### Görsel Şema: Şehir Yönetimi (Manage Town) ve Bina Projeleri Ekranı
```
+----------------------------------------------------------------------------------------------------------+
| [ŞEHİR YÖNETİMİ: LYCARON]                                   [İhtiyat Kasası: 10,000 Dinar (+50 İnşaat)]  |
+----------------------------------------------------------------------------------------------------------+
| VALİ (GOVERNOR): [Soylu Yoldaş Seç / Atanmadı]   |   GÜNLÜK İNŞAAT GÜCÜ (Construction): +68 / gün        |
| Sadakat Etkisi: +1.0 (Aynı Kültür)               |   Vergi Geliri: +1,420 Dinar / gün                    |
+--------------------------------------------------+-------------------------------------------------------+
| BİNA PROJELERİ (Seviye I -> II -> III)           | AKTİF İNŞAAT KUYRUĞU & GÜNLÜK VARSAYILANLAR           |
|                                                  |                                                       |
| [🏛️ Surlar (Fortifications)]       Seviye: II    | İNŞAAT KUYRUĞU:                                       |
| [🌾 Tahıl Ambarı (Granary)]        Seviye: III   | 1. [Su Kemerleri Seviye II] (%64 - 4 Gün Kaldı)       |
| [🍎 Meyve Bahçeleri (Orchards)]    Seviye: II    | 2. [Kışla Seviye III] (Sırada)                        |
| [🛡️ Garnizon Kışlası (Barracks)]   Seviye: II    |                                                       |
| [🏹 Talim Alanı (Training Fields)] Seviye: I     | GÜNLÜK VARSAYILANLAR (Daily Defaults - Sürekli Aktif):|
| [⚖️ Pazar Yeri (Marketplace)]      Seviye: II    | (o) Festival ve Oyunlar (+3 Bağlılık / gün)           |
| [🏛️ Forum]                         Seviye: I     | ( ) Sulama / Irrigation (+Köy Ocak Büyümesi)          |
| [💧 Su Kemerleri (Aqueducts)]      Seviye: I     | ( ) Milis Eğitimi (+1 Milis / gün)                    |
| [🎪 Panayır Alanı (Fairgrounds)]   Seviye: II    | ( ) Konut İnşası (+1 Refah / gün)                     |
| [⚒️ Kuşatma Atölyesi (Workshop)]   Seviye: I     |                                                       |
| [📜 Vergi Dairesi (Toll Collector)]Seviye: I     | [Onayla ve Kaydet]                                    |
+--------------------------------------------------+-------------------------------------------------------+
```

### 1.2 Şehir ve Kale Bina Projelerinin Tam Listesi ve Matematiksel Etkileri
Her bina **Seviye 1, Seviye 2 ve Seviye 3**'e yükseltilebilir. İnşaat hızı şehrin/kalenin **Bağlılık (Loyalty)** ve **Refah** değerine bağlıdır (İhtiyat kasasına 10.000 Dinar bırakılırsa günlük inşaat hızı ikiye katlanır, her gün 500 Dinar harcanır):

1. **Surlar / İstihkam (Fortifications):**
   - Seviye 1 → 2 → 3: Savunma duvarlarının yüksekliğini, kalınlığını, burç sayısını ve kuşatma sırasında savunmacıların yerleştirebileceği mancınık/balista sayısını artırır.
2. **Garnizon Kışlası (Barracks):**
   - Garnizon kapasitesini (+20 / +40 / +60) artırır ve garnizon maaş giderlerini %10 / %20 / %30 azaltır.
3. **Talim Alanı (Training Fields):**
   - Garnizondaki tüm askerlere her gün +1 / +2 / +3 XP kazandırarak acemilerin kendi kendine kıdemli birliğe terfi etmesini sağlar.
4. **Milis Kışlası / Karakol (Militia Grounds / Guard House):**
   - Şehrin ücretsiz savunma gücü olan Milislerin günlük artış hızını (+1 / +2 / +3) yükseltir.
5. **Tahıl Ambarı (Granary):**
   - Şehrin maksimum gıda depolama kapasitesini (+200 / +400 / +600) artırır; kuşatmalarda açlığa dayanma süresini uzatır.
6. **Meyve Bahçeleri / Tarlalar (Orchards / Farmlands):**
   - Köyler yağmalansa bile şehre/kaleye doğrudan günlük +10 / +20 / +30 gıda üretir.
7. **Panayır Alanı (Fairgrounds):**
   - Şehir halkının **Bağlılığını (Loyalty)** günlük +0.5 / +1.0 / +1.5 artırır (İsyanları önleyen en kritik binadır; Bağlılık < 25 olursa şehir isyan edebilir).
8. **Forum (Yalnızca Şehir):**
   - Klan sahibine her gün +0.5 / +1.0 / +1.5 **Nüfuz (Influence)** kazandırır.
9. **Pazaryeri / Gümrük (Marketplace / Tax Office):**
   - Şehir ticaret vergilerini ve gümrük gelirlerini %5 / %10 / %15 artırır.
10. **Su Kemerleri / Kanalizasyon (Aqueducts / Waterworks):**
    - Şehrin günlük **Refah (Prosperity)** artışına +1 / +2 / +3 katkı sağlar.
11. **Kuşatma Atölyesi ve Taş Ocağı (Siege Workshop & Lime Kiln):**
    - Kuşatma sırasında savunma mancınıklarının üretim hızını %30 / %60 / %100 artırır ve duvarların yıkılma direncini güçlendirir.
12. **Kale Dizdarlığı (Castellan's Office - Yalnızca Kale):**
    - Kaledeki garnizon ücretlerini düşürür ve bağlı köylerin vergi verimini artırır.

### 1.3 Şehir Atölyeleri (Workshops), Arka Sokaklar (Alleys) ve Demirci Ocağı (Smithy)
- **Atölyeler (Workshops):** Oyuncu her şehirde bağlı köylerin ürettiği hammaddeye göre atölye satın alabilir:
  - *Bira Fabrikası (Brewery):* Tahıl (Grain) işler → Bira üretir.
  - *Demirci Atölyesi (Smithy):* Demir Cevheri (Iron Ore) işler → Silah/Alet üretir.
  - *Zeytinyağı Presi (Olive Press):* Zeytin işler → Yağ üretir.
  - *Şarap Mahzeni (Winery):* Üzüm işler → Şarap üretir.
  - *Dokuma Tezgahı (Wool Weavery / Velvet Weavery):* Yün veya İpek işler → Kumaş/Kadife üretir.
  - *Çömlekçi (Pottery Shop):* Kil (Clay) işler → Çömlek üretir.
- **Demirci Ocağı (Smithy):**
  - **Arıtma (Refine):** 2 Sert Odun (Hardwood) → 1 Odun Kömürü (Charcoal); Ham Demir → İşlenmiş Demir → Çelik → Thamaskene Çeliği.
  - **Eritme (Smelt):** Savaşta ele geçirilen silahları eriterek metal külçeleri elde etme ve yeni silah parçası kalıpları (Blueprints) açma.
  - **Dövme (Forge):** Kabza, Balçak, Namlu ve Topuz parçalarını seçip boyunu ayarlayarak özel kılıç/mızrak/balta üretme.
- **Arka Sokaklar (Alleys):** Şehirdeki haydut çetelerini temizleyip yüksek "Roguery (Serserilik)" becerisine sahip bir yoldaş bırakarak pasif altın ve haydut askeri geliri elde etme.

### 1.4 İleri Gelenlerden Gönüllü Asker Toplama (6'lı Slot Matrisi)
Şehir ve köylerde "Asker Topla" ekranında her ileri gelenin (Notable) bir satırı ve **6 askeri slotu** vardır:
```
+---------------------------------------------------------------------------------------------------+
| İLERİ GELEN                   | İLİŞKİ | SLOT 1   | SLOT 2   | SLOT 3   | SLOT 4   | SLOT 5   | 6 |
+-------------------------------+--------+----------+----------+----------+----------+----------+---+
| 🌾 Muhtar Kalan (Güç: 240)    |  +12   | [Acemi]  | [Acemi]  | [Okçu]   | [KİLİTLİ]| [KİLİTLİ]| 🔒|
|   (Köylü Birlikleri Verir)    |        | 20 Dinar | 20 Dinar | 45 Dinar | İlişki 10| İlişki 20|   |
+-------------------------------+--------+----------+----------+----------+----------+----------+---+
| 🏰 Soylu Toprak Sahibi (380)  |  +25   | [Vigla]  | [Equite] | [Equite] | [Katafrk]| [KİLİTLİ]| 🔒|
|   (Soylu Süvari Hattı Verir)  |        | 50 Dinar | 100 Dinar| 100 Dinar| 200 Dinar| İlişki 30|   |
+---------------------------------------------------------------------------------------------------+
```
- İlişki `0` iken yalnızca ilk 2-3 slot açıktır. İlişki `+10`, `+20`, `+40` oldukça sağdaki kıdemli slotlar açılır.
- Gücü (Power > 200) yüksek olan kırsal ileri gelenler **Soylu Birlik Ağacı** (Imperial Vigla Recruit → Katafrakt, Vlandia Squire → Banner Knight, Battania Highborn Youth → Fian Champion) verir!

---

## BÖLÜM 2: Kuşatma (Siege) Sefer Haritası ve Savaş Mekanikleri

### 2.1 Sefer Haritasında Kuşatma Kampı ve Mühendislik Mimarisi
Oyuncu düşman bir şehir veya kaleye "Kuşat (Besiege)" dediğinde sefer haritasında yerleşimin etrafına çadırlar ve kazıklar dikilir.

#### Görsel Şema: Sefer Haritası Kuşatma Arayüzü (Siege Overlay)
```
+----------------------------------------------------------------------------------------------------------+
| KUŞATMA ALTINDA: LYCARON (Sur Seviyesi: II · Duvar Sağlığı: %100 | Sol Gedik: Yok | Sağ Gedik: Yok)      |
| Savunmacı Garnizon: 165 Asker  |  Savunmacı Erzağı: 12 Günlük (Açlık Yok)  |  Kuşatan Ordu: 240 Asker    |
+----------------------------------------------------------------------------------------------------------+
| SAVUNMACI BURÇ SİLAHLARI (4 Slot):                                                                       |
|   [Burç 1: Ateşli Mancınık (%85 HP)]  [Burç 2: Balista (%100 HP)]  [Burç 3: İnşa %40]  [Burç 4: Boş]     |
|                            ||  (Karşılıklı Topçu Düellosu / Bombardment)  ||                             |
| KUŞATMACI MENZİLLİ SİLAHLAR (4 Slot):                                                                    |
|   [Slot 1: Trebuchet (%100 HP) -> Rezerve Çek]  [Slot 2: Mangonel (%60 HP)]  [Slot 3: Boş]  [Slot 4: Boş]|
|                                                                                                          |
| KUŞATMACI TAARRUZ ARAÇLARI (2 Slot):                                                                     |
|   [Taarruz 1: Koçbaşı / Battering Ram (Hazır)]       [Taarruz 2: Kuşatma Kulesi / Siege Tower (%75)]     |
+----------------------------------------------------------------------------------------------------------+
| REZERVDEKİ SİLAHLAR: [1x Trebuchet (Hazır)] [1x Balista (Hazır)]                                         |
| AKSİYONLAR: [⚔️ Taarruza Önderlik Et (Lead Assault)]  [🎲 Otomatik Çöz (Send Troops)]  [🏳️ Kuşatmayı Kaldır]|
+----------------------------------------------------------------------------------------------------------+
```

### 2.2 Kuşatma Silahları ve "Rezerve Çekme (Reserve Trick)" Mekanikleri
1. **Kuşatma Kampı Hazırlığı (Camp Preparation):** Her şeyden önce kuşatma kampı çadırlarının kurulması gerekir. Mühendislik (Engineering) becerisi ve ordudaki toplam asker sayısı inşaat hızını belirler.
2. **Menzilli Kuşatma Silahları (4 Slot):**
   - **Balista (Ballista):** Hızlı inşa edilir, surlardaki savunmacı askerleri tek tek avlar; duvar yıkamaz.
   - **Ateşli Balista (Fire Ballista):** Düşman kuşatma silahlarına ekstra yanıcı hasar verir.
   - **Mancınık / Onager (Mangonel):** Orta hızda inşa edilir, hem düşman burç silahlarını hem de surları döver.
   - **Trebuchet (Ağır Karşı Ağırlıklı Mancınık):** En yüksek cana ve yıkım gücüne sahiptir. Surlarda **Fiziksel Gedik (Wall Breach)** açmak için kullanılır.
3. **Bannerlord'un Meşhur "Rezerve Çekme (Move to Reserve)" Taktiği:**
   - Savunmacıların burçlarında 4 mancınık hazır beklediği için, kuşatmacı tek bir Trebuchet inşa ettiğinde savunmacıların 4 mancınığı aynı anda ateş ederek onu parçalar.
   - Bu yüzden usta oyuncular Trebuchet tamamlanır tamamlanmaz üzerine tıklayıp **"Rezerve Çek (Move to Reserve)"** der.
   - 4 Trebuchet de arka arkaya inşa edilip rezerve alındıktan sonra, oyun duraklatılır ve **4'ü aynı anda sahaya sürülür**; böylece düşman burçları ezilir ve şehir duvarlarında 2 büyük gedik açılır!
4. **Taarruz Araçları (2 Slot - Haritada Ateş Etmez, Savaş İçinde Kullanılır):**
   - **Koçbaşı (Battering Ram):** Piyadeler tarafından dış kapıya sürülür, ana kapıyı kırar.
   - **Kuşatma Kulesi (Siege Tower):** Merdivenlerin yerine surlara güvenli rampa indirir, aynı anda 3 koldan asker çıkarır.
5. **Garnizonu Aç Bırakma (Starvation) ve Huruc (Sally Out):**
   - Kuşatma uzadıkça şehirdeki erzak stoku sıfırlanır. Erzak `0` olduğunda garnizon askerleri her gün açlıktan yaralanır (Wounded) ve savaş dışı kalır.
   - Eğer içerideki savunmacıların gücü kuşatmacıdan fazlaysa, kapıları açıp **Huruc Harekatı (Sally Out)** yaparak kuşatma kampına saldırırlar!

---

## BÖLÜM 3: Karakter Ekranı (Character Sheet), 6 Nitelik, 18 Beceri ve Perk Sistemi

### 3.1 6 Ana Nitelik (Attributes) ve 18 Beceri (Skills) Matrisi
Oyuncu her **4 seviyede 1 Nitelik Puanı (Attribute Point)** ve **her seviyede 1 Odak Puanı (Focus Point)** kazanır.

```
+----------------------------------------------------------------------------------------------------------+
| KARAKTER EKRANI: KOMUTAN DEMİRHAN (Seviye 12 · Sonraki Seviye: 4,200 / 6,000 XP)                         |
| Serbest Nitelik Puanı: [ 1 ]                        Serbest Odak Puanı (Focus): [ 2 ]                    |
+----------------------------------------------------------------------------------------------------------+
| NİTELİK (ATTRIBUTE)      | BECERİ 1 (SKILL)         | BECERİ 2 (SKILL)         | BECERİ 3 (SKILL)        |
+--------------------------+--------------------------+--------------------------+-------------------------+
| 1. DİNÇLİK (VIGOR)       | Tek Elli (One-Handed)    | Çift Elli (Two-Handed)   | Gönderli (Polearm)      |
|    Puan: 5  [+]          | Seviye: 110 ●●●●○ (x4.2) | Seviye: 45  ●●○○○ (x2.5) | Seviye: 95  ●●●○○ (x3.4)|
+--------------------------+--------------------------+--------------------------+-------------------------+
| 2. KONTROL (CONTROL)     | Yay (Bow)                | Arbalet (Crossbow)       | Fırlatma (Throwing)     |
|    Puan: 4  [+]          | Seviye: 80  ●●●○○ (x3.1) | Seviye: 25  ●○○○○ (x1.8) | Seviye: 40  ●○○○○ (x1.6)|
+--------------------------+--------------------------+--------------------------+-------------------------+
| 3. DAYANIKLILIK (END)    | Binicilik (Riding)       | Atletizm (Athletics)     | Demircilik (Smithing)   |
|    Puan: 5  [+]          | Seviye: 125 ●●●●○ (x4.0) | Seviye: 70  ●●○○○ (x2.8) | Seviye: 60  ●●○○○ (x2.9)|
+--------------------------+--------------------------+--------------------------+-------------------------+
| 4. KURNAZLIK (CUNNING)   | İzcilik (Scouting)       | Taktik (Tactics)         | Serserilik (Roguery)    |
|    Puan: 4  [+]          | Seviye: 90  ●●●○○ (x3.0) | Seviye: 85  ●●●○○ (x3.1) | Seviye: 35  ●○○○○ (x1.9)|
+--------------------------+--------------------------+--------------------------+-------------------------+
| 5. SOSYALLİK (SOCIAL)    | Cazibe (Charm)           | Liderlik (Leadership)    | Ticaret (Trade)         |
|    Puan: 6  [+]          | Seviye: 115 ●●●●○ (x4.5) | Seviye: 140 ●●●●● (x5.2) | Seviye: 75  ●●○○○ (x2.7)|
+--------------------------+--------------------------+--------------------------+-------------------------+
| 6. ZEKA (INTELLIGENCE)   | İdarecilik (Steward)     | Hekimlik (Medicine)      | Mühendislik (Engineer)  |
|    Puan: 5  [+]          | Seviye: 130 ●●●●○ (x3.9) | Seviye: 95  ●●●○○ (x3.3) | Seviye: 80  ●●●○○ (x3.5)|
+----------------------------------------------------------------------------------------------------------+
```

### 3.2 Öğrenme Sınırı (Learning Limit) ve Perk Etkileri Matematiği
- Bir beceriye en fazla **5 Odak Puanı (Focus Point)** ve ilgili niteliğe **10 Nitelik Puanı** verilebilir.
- **Öğrenme Sınırı (Learning Limit) Formülü:**
  $$\text{Learning Limit} = (\text{Attribute} - 1) \times 14 + (\text{Focus} \times 40) + 10$$
- Her **25 beceri seviyesinde** (25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275) oyuncuya 2 özel **Perk (Avantaj)** seçeneği sunulur:
  - *Tek Elli 25:* **Shield Wall** (+%4 Kalkan Canı, +%5 Tek Elli Hızı) vs **Basher** (Kalkan darbesiyle sersemletme).
  - *Binicilik 50:* **Full Speed** (+%5 At Hücum Hasarı) vs **Nimble Stead** (+%10 At Manevrası).
  - *İzcilik 25:* **Day Traveler** (Gündüz harita hızı +%2) vs **Night Runner** (Gece harita hızı +%5 ve görüş +%10).
  - *Liderlik 75:* **Fervent Attacker** (Taarruz başında moral +%10) vs **Stout Defender** (Kuşatma savunmasında garnizon morali +%15).
  - *İdarecilik 50:* **Spartan** (Ordu erzak tüketimi -%10) vs **War Rations** (Birlik kapasitesi +15).
  - *Hekimlik 25:* **Preventive Medicine** (Her savaştan sonra komutanın canı %30 yenilenir) vs **Walk It Off** (Hareket halindeyken yaralı iyileşme hızı +%10).

---

## BÖLÜM 4: Envanter, 12 Ekipman Slotu, Sivil Kıyafet ve Ticaret Sistemi

### 4.1 3 Sütunlu Envanter Arayüzü (Inventory Screen)
```
+----------------------------------------------------------------------------------------------------------+
| PAZAR / GANİMET (SOL PANEL)        | 3B KARAKTER & 12 EKİPMAN SLOTU    | OYUNCU ENVANTERİ (SAĞ PANEL)    |
| Filtre: [Tümü][Silah][Zırh][Erzak] |  [⚔️ Savaş Seti] [👘 Sivil Set]   | Kapasite: 145 / 420 Ağırlık     |
+------------------------------------+-----------------------------------+---------------------------------+
| [🗡️ İmparatorluk Spathası] 340 D > |  [Miğfer]   (👤)   [Silah 1: Kılıç]| < [🗡️ Çentikli Kılıç]   110 D 🔒|
| [🛡️ Süvari Kalkanı]        220 D > |  [Omuzluk]  /||\   [Silah 2: Kalkan]| < [🌾 Tahıl (x18)]       9 D 🔒|
| [🏹 Kompozit Yay]          480 D > |  [Göğüs]    |  |   [Silah 3: Yay]  | < [🧀 Peynir (x6)]       18 D 🔒|
| [🐎 Bozkır Savaş Atı]      650 D > |  [Eldiven]  /  \   [Silah 4: Sadak]| < [🐎 Yük Katırı (x4)]   90 D 🔒|
| [🍺 Bira Fıçısı]            28 D > |  [Çizme]           [Sancak: Kartal]| < [🪨 Demir Cevheri]     32 D   |
| [🫒 Zeytinyağı]             65 D > |  [Binek Atı]       [At Koşumu/Zırh]|                                 |
+------------------------------------+-----------------------------------+---------------------------------+
| Zırh Özeti: Baş 38 | Gövde 52 | Kol 24 | Bacak 28  |  Ödenecek / Alınacak Fark: +180 Dinar [İşlemi Onayla]|
+----------------------------------------------------------------------------------------------------------+
```

### 4.2 Envanter Kuralları
- **12 Ekipman Slotu:**
  - Sağ 4 Slot: Silah 1, Silah 2, Silah 3, Silah 4 (Kılıç, Kalkan, Mızrak, Yay, Ok Sadağı).
  - Sol 5 Zırh Slotu: Başlık (Head), Omuzluk/Pelerin (Cape/Shoulder), Gövde Zırhı (Body), Eldiven (Gloves), Çizme (Leg).
  - Alt 2 Binek Slotu: At (Mount) ve At Zırhı/Eyer (Harness).
  - Özel Slot: Sancak (Banner - örn. *Sancak-ı Kalradya: +%10 Yakın Dövüş Hasarı*).
- **Savaş Kıyafeti vs Sivil Kıyafet:** Şehir içinde gezerken veya çete kavgalarında ağır zırh ve mızrak yasaktır; yalnızca "Sivil" etiketli hafif zırhlar ve kılıçlar kuşanılır.
- **Taşıma Kapasitesi (Carry Weight):**
  - Her asker +10 kg, her binek atı +20 kg, her **Yük Beygiri / Katır (Sumpter Horse / Mule)** +100 kg taşıma kapasitesi verir. Kapasite aşılırsa ordu hızı ağır ceza alır (Overburdened).

---

## BÖLÜM 5: Birlik (Party), Terfi Ağacı, Esirler ve 4 Klan Rolü

### 5.1 Birlik Terfi (Troop Upgrade) ve At Gereksinimi
- Savaşlarda ve talim alanlarında askerler XP kazanır.
- Terfi etmeye hazır askerlerin yanında `(+)` ikonu belirir:
  - *İmparatorluk Acemisi (Tier 1)* → *İmparatorluk Piyadesi (Tier 2)* veya *İmparatorluk Okçusu (Tier 2)*
  - *İmparatorluk Piyadesi* → *Lejyoner (Legionary)* veya *Menavliaton*
  - *İmparatorluk Vigla Acemisi* → *Equite (Binek Atı İster)* → *Ağır Katafrakt (Savaş Atı / War Mount İster)*
- **Esir Devşirme (Recruit Prisoners):** Esirler orduda kaldıkça **Uyum (Conformity)** puanı biriktirir. Uyum dolduğunda esirler ikna edilip oyuncunun kendi ordusuna asker olarak katılabilir!
- **4 Klan Rolü (Party Roles):**
  1. **İaşe Subayı (Quartermaster - Steward):** Maksimum birlik kapasitesini (+20 ile +150 arası) artırır.
  2. **İzci (Scout - Scouting):** Sefer haritası görüş mesafesini ve hareket hızını artırır.
  3. **Cerrah (Surgeon - Medicine):** Savaşta ölümleri yaralanmaya çevirir ve iyileşme hızını artırır.
  4. **Mühendis (Engineer - Engineering):** Kuşatma silahlarının inşaat ve yıkım hızını artırır.

---

---

## BÖLÜM 6: Lord AI, 4 Aşamalı İkna Sistemi (Persuasion), Takas (Barter), Klan Kademeleri ve Krallık Politikaları

### 6.1 Lord Kişilik Özellikleri (Personality Traits) ve İkna (4-Pip Persuasion) Sistemi
Bannerlord'da her lordun davranışını ve ikna seçeneklerinin başarı şansını belirleyen **Kişilik Özellikleri (Traits)** vardır:
- **Şeref (Honor / Deceitful):** Sözüne sadık lordlar onurlu argümanlardan etkilenir; hilekâr lordlar kişisel çıkar arar.
- **Cesaret (Valor / Cautious):** Cesur lordlar güç ve zafer vaadine, temkinli lordlar ise güvenli ittifaka önem verir.
- **Merhamet (Mercy / Cruel):** Merhametli lordlar köy yağmalanmasından nefret eder; zalim lordlar sert güçten anlar.
- **Cömertlik (Generosity / Calculating):** Cömert lordlar sadakati ödüllendirir; çıkarcı (Calculating) lordlar altın ve tımar hesabına bakar.

#### Görsel Şema: 4 Aşamalı Lord İkna (Persuasion) ve Takas (Barter) Arayüzü
```
+----------------------------------------------------------------------------------------------------------+
| LORD DİYALOĞU & İKNA SİSTEMİ: ARKON LUGAR (Güney İmparatorluğu · Kişilik: Onurlu & Temkinli · İlişki: +18)|
+----------------------------------------------------------------------------------------------------------+
| İKNA İLERLEME ÇUBUĞU (4 Aşama / Pips):  [ ● Başarılı ]  [ ● Başarılı ]  [ ○ Bekliyor ]  [ ○ Bekliyor ]    |
|                                                                                                          |
| ARKON LUGAR: "İmparatorluk sancağına ettiğim yemini bozmamı mı istiyorsun? Bunun için haklı bir sebep ver!"|
|                                                                                                          |
| İKNA ARGÜMAN SEÇENEKLERİ (Charm / Cazibe & Kişilik Uyumuna Göre):                                        |
|  1. [⚖️ Onur ve Adalet Argümanı] "Mevcut hükümdarınız kanunları çiğnedi, gerçek onur halkı korumaktır."   |
|     -> Başarı Şansı: %78 (Cazibe + Onur Uyumu) | Kritik Başarı: %15 (+2 Pip) | Kritik Hata: %5           |
|  2. [💰 Çıkar ve Tımar Vaadi] "Sancağım altında sana yeni kaleler ve vergi imtiyazı vaat ediyorum."      |
|     -> Başarı Şansı: %52 (Ticaret / İdarecilik) | Kritik Başarı: %8          | Kritik Hata: %12          |
|  3. [⚔️ Askeri Güç ve Caydırıcılık] "Ordum kapında bekliyor; ya müttefikim olursun ya da esirim!"         |
|     -> Başarı Şansı: %64 (Liderlik & Ordu Gücü) | Kritik Başarı: %10         | Kritik Hata: %18          |
+----------------------------------------------------------------------------------------------------------+
| TAKAS VE ANTLAŞMA MASASI (Barter Offer):                                                                 |
|   Oyuncu Teklifi: [ 1,500 Dinar ] + [ 2 Savaş Esiri ]  <===>  Lord Karşılığı: [ Ateşkes / Sancağa Katılım ]|
|   [🤝 Teklifi Sun ve El Sıkış]                                                                           |
+----------------------------------------------------------------------------------------------------------+
```

### 6.2 Klan Kademeleri (Clan Tiers 0 – 6) ve Sağladığı Kapasiteler
Klan Kademesi **Nam (Renown)** biriktikçe yükselir ve ordunun büyüklüğünü doğrudan belirler:
- **Kademe 0 (0 Nam):** +15 Birlik Kapasitesi, 1 Yoldaş, 1 Askeri Grup.
- **Kademe 1 (50 Nam):** +25 Birlik Kapasitesi, Paralı Asker Sözleşmesi (Mercenary Contract) imzalama hakkı.
- **Kademe 2 (150 Nam):** +50 Birlik Kapasitesi, Bir Krallığa **Derebeyi / Vasal (Vassal)** olarak yemin etme hakkı.
- **Kademe 3 (350 Nam):** +75 Birlik Kapasitesi, 2. Klan Grubu kurma.
- **Kademe 4 (900 Nam):** +100 Birlik Kapasitesi, **Kendi Bağımsız Krallığını İlan Etme (Create Kingdom)** hakkı!
- **Kademe 5 (2350 Nam):** +125 Birlik Kapasitesi, 4 Klan Grubu, 4 Atölye.
- **Kademe 6 (6150 Nam):** +150 Birlik Kapasitesi, Maksimum İmparatorluk İtibarı.

### 6.3 Krallık Politikaları (Kingdom Policies) ve Ordu Uyum (Army Cohesion)
- **Krallık Politikaları:** Nüfuz (Influence) harcanarak yürürlüğe konan yasalar:
  - *Kutsal Majesteleri (Sacred Majesty):* Hükümdar klanına günde +3 Nüfuz verir.
  - *Soylu Maiyetler (Noble Retinues):* Kademe 4+ klanlara +40 Birlik Kapasitesi ve günde +1 Nüfuz kazandırır.
  - *Borçların Affı (Forgiveness of Debts):* Tüm şehir ve kalelerde Bağlılığı (Loyalty) günde +2 artırır, üretim verimini %5 düşürür.
  - *Kraliyet Muhafızları (Royal Guard):* Hükümdarın birlik kapasitesini +60 artırır.
- **Ordu Uyumu (Army Cohesion):** Birden fazla lord tek bir Ordu (Army) çatısında toplandığında Uyum `100`'den geriye doğru erir; Nüfuz harcanarak uyum yeniden `+10` / `+20` doldurulur.

---

## BÖLÜM 7: Eksiksiz Yapılacaklar Listesi (Master Implementation Checklist)

Aşağıdaki kontrol listesi, araştırmadaki tüm sistemlerin oyunumuza modüler olarak entegrasyon planıdır:

- [x] **1. Harita Yaklaşma ve Fiziksel Kapı Etkileşim Menzili:**
  - [x] Şehir (`5.2`), Kale (`3.8`) ve Köy (`2.6`) varış yarıçapları.
  - [x] Uzaktan tıklamada menü açılmasının engellenmesi, kapıya varınca zamanın durup menünün açılması.
- [x] **2. Lord Diyalog Durdurma ve Hareket Kilidi:**
  - [x] Diyalog başladığında `campaignTimeScale = 0` yapılması ve konuşulan lordun dondurulması.
- [x] **3. Şehir, Kale ve Köy Temel İç Menüleri:**
  - [x] İleri Gelenler (Notables) portre çubuğu ve diyalogları.
  - [x] Pazaryeri, Meyhane (Paralı asker ve Fidye), Arena (Talim ve Turnuva), Köylü/Soylu Asker Yazımı, Köy Yağmalama ve Zorla İkmal.
- [x] **4. Şehir & Kale Bina Projeleri, Atölyeler ve Demirci Ocağı (Yeni Entegrasyon):**
  - [x] Şehir ve Kalelerde **"Mülkü Yönet (Bina Projeleri)"** sekmesi: Surlar (Fortifications), Tahıl Ambarı (Granary), Kışla (Barracks), Panayır Alanı (Fairgrounds), Forum ve Su Kemerleri seviye yükseltmeleri (I → II → III) ve Günlük Varsayılanlar (Festival, Sulama, Milis Eğitimi).
  - [x] Şehirlerde **"Demirci Ocağı (Smithy) & Atölyeler"** sekmesi: Özel silah dövme ve şehirde pasif gelir getiren Atölye (Bira, Zeytinyağı, Demirci, Dokuma) satın alma.
- [x] **5. Kuşatma Kampı ve Kuşatma Silahları İnşası (Yeni Entegrasyon):**
  - [x] Düşman şehir/kalesinde **"Kuşatma Kampı & Silah İnşası"** ekranı: Trebuchet, Mangonel, Balista, Koçbaşı (Battering Ram) ve Kuşatma Kulesi (Siege Tower) inşa etme, Rezerve Çekme, Sur Bombardmanı (Duvar Gediği Açma), Garnizonu Aç Bırakma ve Taarruza Önderlik Etme.
- [x] **6. Karakter Ekranı: 6 Nitelik, 18 Beceri, Odak Puanları ve Perkler (Yeni Entegrasyon):**
  - [x] Alt HUD çubuğunda **"Karakter [C]"** ekranı: Vigor, Control, Endurance, Cunning, Social, Intelligence nitelikleri; 18 beceri, Odak Puanı (Focus Point) dağıtımı, Öğrenme Sınırı (Learning Limit) ve Perk seçimleri.
- [x] **7. Envanter ve 12 Slotlu Ekipman Ekranı (Yeni Entegrasyon):**
  - [x] Alt HUD çubuğunda **"Envanter [I]"** ekranı: Silah, Kalkan, Yay, Miğfer, Gövde Zırhı, Omuzluk, Eldiven, Çizme, Savaş Atı ve Sancak kuşanma; Savaş Seti / Sivil Set geçişi; Yük Kapasitesi ve Ticaret Malları.
- [x] **8. Birlik Terfi (XP Upgrade), Esir Devşirme, Klan Rolleri ve 4 Aşamalı Lord İkna/Takas Sistemi (Yeni Entegrasyon):**
  - [x] Ordum ekranında birlikleri XP ve Dinar ile üst kademeye terfi ettirme, esirleri sancağa katma ve İaşe Subayı / İzci / Cerrah / Mühendis klan rollerini atama.
  - [x] Lord Diyalog ekranında **4 Aşamalı İkna (4-Pip Persuasion Check)** ve **Takas (Barter)** mekanikleri.

