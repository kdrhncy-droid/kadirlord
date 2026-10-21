# Mount & Blade II: Bannerlord Yerleşim Etkileşim ve Menü Sistemleri Araştırma Raporu

Bu dokümantasyon, **Mount & Blade II: Bannerlord** oyununun sefer haritası (campaign map) üzerindeki yerleşim etkileşim mimarisini, yaklaşma/giriş menzillerini, diyalog zaman kontrol mekaniklerini ve **Şehir (Town)**, **Kale (Castle)** ile **Köy (Village)** için özgün menü/eylem buton hiyerarşisini detaylı hem görsel hem de metin bazlı olarak inceler.

---

## BÖLÜM 1: Yerleşim Yaklaşma ve Etkileşim Mesafesi (Interaction & Arrival Distance) Matematiği

### 1.1 Sorun Analizi ve Neden Oluştu?
Bannerlord'da bir oyuncu haritadaki bir yerleşime (şehir, kale, köy) tıkladığında:
1. **Asla uzaktan menü açılmaz.**
2. Oyuncu grubu belirlenen yerleşimin kapısına/girişine doğru kara rotası (`computeLandPath`) çizerek yürüyüşe başlar.
3. Sefer haritası zamanı yürüyüş sırasında akmaya devam eder.
4. Yalnızca oyuncunun koordinatları ile yerleşimin koordinatları arasındaki Öklid mesafesi $D \le R_{\text{arrival}}$ (varış yarıçapı) şartını sağladığı anda:
   - Oyuncunun hareketi durdurulur (`targetPos = null`).
   - Sefer haritası zamanı dondurulur (`timeScale = 0`).
   - İlgili yerleşimin ana menüsü ekranı kaplar veya açılır.

Eski sistemdeki hata:
- Etkileşim mesafesi `13.5` dünya birimi gibi aşırı büyük bir değere ayarlanmıştı.
- Tıklama anında `if (dist < 13.5)` kontrolü yapılarak oyuncu daha kilometrelerce uzaktayken menü doğrudan tetikleniyordu.

### 1.2 Bannerlord Ölçeğine Uygun Fiziksel Giriş Yarıçapları ($R_{\text{arrival}}$)
Harita üzerindeki 3D modellerin ölçeği ve yürüyüş mesafelerine göre doğru etkileşim yarıçapları:

```
+-------------------+--------------------+------------------------+------------------------------------------+
| Yerleşim Tipi     | 3D Model Büyüklüğü | Giriş Yarıçapı (R)     | Açıklama                                 |
+-------------------+--------------------+------------------------+------------------------------------------+
| Şehir (Town)      | Büyük Sur Perimetri| 5.2 Dünya Birimi       | Dış sur kapısına temas anı              |
| Kale (Castle)     | Orta Taş Hisar     | 3.8 Dünya Birimi       | Kale kapısı ve barbakan hendeği          |
| Köy (Village)     | Küçük Kırsal Çiftlik| 2.6 Dünya Birimi       | Köy giriş çitleri ve meydanı             |
+-------------------+--------------------+------------------------+------------------------------------------+
```

### 1.3 Sefer Haritası İntikal ve Otomatik Giriş Durum Makinesi (State Machine)
```
[Oyuncu Haritada Yerleşime Tıklar]
          |
          v
[Mesafe Kontrolü: dist <= R_arrival ?]
    /                                \
  [EVET]                            [HAYIR]
    |                                  |
    |                         [Kara Rotası Çiz (computeLandPath)]
    |                         [Sefer Zamanı Akar (1x / 2x / 4x)]
    |                         [Hedefe Doğru İlerleme]
    |                                  |
    |                         [dist <= R_arrival Oldu mu?]
    |                                  |
    \----------------------------------/
                     |
                     v
       [Oyuncu Yürüyüşünü Durdur]
       [Sefer Zamanını Durdur (timeScale = 0)]
       [Yerleşim Menüsünü Aç]
```

---

## BÖLÜM 2: Lord Karşılaşma ve Diyalogda Zamanın/Lordun Durması (Encounter Interruption)

### 2.1 Bannerlord Karşılaşma Kuralı
1. **Harita Zamanı Donar:** Oyuncu bir lordla diyaloğa girdiğinde veya lord oyuncuya yetiştiğinde, dünya sefer zamanı derhal `0` (PAUSE) olur.
2. **Lordun ve Oyuncunun Pozisyonu Kilitlenir:** Görüşme esnasında lord haritada ilerleyemez, devriye atamaz. `isInteracting = true` durumu ile lordun hız vektörü sıfırlanır.
3. **Mesafe Eşiği:** Bir lord ile etkileşim ancak birlikler fiziksel olarak yan yana geldiğinde ($\le 3.5$ birim) başlar.
4. **Diyalogdan Çıkış:** Diyalog kapandığında zaman durmuş kalmaya devam eder (oyuncu boşluk tuşuna basarak veya yeni bir hedef seçerek sefere devam eder).

---

## BÖLÜM 3: Şehir (Town) Menüleri ve Fonksiyonları Mimarisi

Şehirler Kalradya'nın ekonomik, kültürel ve askeri merkezleridir. Bannerlord'da bir şehre girildiğinde sunulan menü mimarisi şöyledir:

### 3.1 Görsel UI Tel Çerçevesi (Town Layout Wireframe)
```
+----------------------------------------------------------------------------------------------------+
| [ARMA] LYCARON (Ticaret Şehri - Kalradya İmparatorluğu)                   [X] Haritaya Dön [ESC]    |
| Refah: 720  |  Bağlılık: 84  |  Güvenlik: 91  |  Erzak: 180  |  Garnizon: 160  |  Milis: 85        |
| Bağlı Köyler: Zeonica Köyü, Onira Mezrası | Sahibi: Güney İmparatorluğu Hanedanı                  |
+----------------------------------------------------------------------------------------------------+
|  ŞEHİRDEKİ İLERİ GELENLER (NOTABLES & LORDS):                                                      |
|  [👑 Rhagaea]   [🛡️ Muhafız Komutanı]   [💰 Tüccar Belisarios]   [🍺 Meyhaneci]   [⚔️ Gladyatör]   |
+-----------------------------------+----------------------------------------------------------------+
| EYLEM MENÜSÜ                      | AKTİF ETKİLEŞİM PANELİ (SEÇİLİ SEKMEYE GÖRE DEĞİŞİR)           |
|                                   |                                                                |
| 1. [Meydan & Genel Durum]          | - Şehir surları, lonca durumu ve garnizon özeti                |
| 2. [Kalenin İç Avlusu / Divan]    | - Soylularla görüşme talebi / Divana kabul edilme              |
| 3. [Pazaryeri ve Ticaret]         | - Erzak Satın Al (+5 Erzak · 30 Dinar)                         |
| 4. [Meyhane Bölgesi]              | - Paralı Asker Topla (Paralı Süvariler, Çapulcu Avcıları)       |
|                                   | - Esirleri Fidyeciye Teslim Et (Altın Kazan)                   |
| 5. [Arena ve Turnuva]             | - Dövüş Talimi Yap (+20 Dinar, +5 Silah Ustalığı)              |
|                                   | - Büyük Turnuvaya Katıl (Ödül: 250 Dinar + Sancak + Nam)       |
| 6. [Gönüllü Asker Topla]          | - İmparatorluk Acemisi, Okçu, Katafrakt Kışlası                |
| 7. [Şehirde Dinlen ve Bekle]      | - Zamanı geçirerek yaralı askerleri iyileştirme                |
| 8. [Şehri Kuşat / Saldır] (Savaş) | - Savaş halindeyse şehri abluka altına alma ve taarruz        |
| 9. [Şehirden Ayrıl]               | - Sefer haritasına güvenli dönüş                               |
+-----------------------------------+----------------------------------------------------------------+
| DURUM BARI:  Hazineniz: 1,450 Dinar  |  Ordu Erzağınız: 42 Günlük  |  Ordu Mevcudu: 30/50 Asker    |
+----------------------------------------------------------------------------------------------------+
```

### 3.2 Şehir Eylemleri Detay Tablosu
1. **Meydan & Genel Durum (Town Center):** Şehrin genel refahı, gıda stokları ve klan ilişkileri raporlanır.
2. **Kalenin İç Avlusu (Keep):** Şehirdeki lordlar ve leydilerle doğrudan siyasi görüşme başlatır.
3. **Pazaryeri (Marketplace):** Ordu için buğday, et, kuru balık gibi erzak ikmali yapılır; ganimetler satılır.
4. **Meyhane (Tavern):** Şehir muhafızı olmayan bağımsız paralı askerler (Mercenaries) kiralanır; esirler fidyeciye teslim edilerek dinar elde edilir.
5. **Arena:** Oyuncu dövüş ustasıyla pratik yaparak dinar kazanabilir veya arenada şampiyonluk turnuvasına girip namını yükseltebilir.
6. **Gönüllü Asker Topla (Recruit Troops):** Şehrin ileri gelenlerinden acemi piyade ve okçular orduya katılır.
7. **Bekle ve Dinlen (Wait in Town):** Ordu dinlenirken yaralılar iki kat hızlı iyileşir.

---

## BÖLÜM 4: Müstahkem Kale (Castle) Menüleri ve Fonksiyonları Mimarisi

Kaleler sivil ticaret yerleri değil, saf askeri istihkam merkezleridir. Dükkanlar veya meyhaneler bulunmaz; bunun yerine zindanlar, garnizon kışlaları ve soylu asker ocakları vardır.

### 4.1 Görsel UI Tel Çerçevesi (Castle Layout Wireframe)
```
+----------------------------------------------------------------------------------------------------+
| [ARMA] VOROCHEY KALESİ (Müstahkem Kale - Sturgiya Prensliği)              [X] Haritaya Dön [ESC]    |
| Sur Seviyesi: II. Kademe  |  Garnizon: 125 Muhafız  |  Erzak Stokları: 95 Günlük  |  Milis: 40     |
| Bağlı Köy: Mazhadan Kırsalı | Sahibi: Knyaz Raganvad                                               |
+----------------------------------------------------------------------------------------------------+
|  KALEDEKİ KOMUTANLAR:                                                                              |
|  [🛡️ Kale Muhafız Başı]   [🏹 Nöbetçi Subayı]   [⛓️ Zindan Sorumlusu]                             |
+-----------------------------------+----------------------------------------------------------------+
| EYLEM MENÜSÜ                      | AKTİF ETKİLEŞİM PANELİ                                         |
|                                   |                                                                |
| 1. [İç Kale & Divanhane]          | - Kale komutanı veya sığınmış soylularla askeri brifing        |
| 2. [Zindanı İncele]               | - Esir tutulan düşman lordlarını ve haydutları denetleme        |
| 3. [Garnizonu Yönet]              | - Kaledeki garnizona asker bırakma / garnizondan asker alma    |
| 4. [Soylu Süvari Topla]           | - Kaleden yüksek rütbeli soylu acemi birlikleri devşirme       |
| 5. [Kalede Bekle ve Dinlen]       | - Surlar arkasında güvenle dinlenme                            |
| 6. [Kuşatmayı Başlat] (Düşmansa)  | - Koçbaşı ve merdivenlerle kaleye hücum etme                   |
| 7. [Kaleden Ayrıl]                | - Kapılardan çıkarak sefer haritasına dönme                    |
+-----------------------------------+----------------------------------------------------------------+
| DURUM BARI:  Hazineniz: 1,450 Dinar  |  Ordu Erzağı: 42  |  Kaledeki Savunma: 165 Toplam Güç       |
+----------------------------------------------------------------------------------------------------+
```

### 4.2 Kale Eylemleri Detay Tablosu
1. **İç Kale / Divanhane (Keep):** Kale muhafız subayı ile görüşme, bölgedeki düşman akınları hakkında istihbarat alma.
2. **Zindan (Dungeon):** Esirleri kalenin güvenli zindanlarına hapsetme.
3. **Garnizonu Yönet (Manage Garrison):** Oyuncu kendi ordusundaki askerleri kaleye nöbetçi olarak bırakabilir veya kaledeki tecrübeli muhafızları ordusuna katabilir.
4. **Soylu Asker Yazımı (Noble Recruitment):** Kalelerden sıradan köylü yerine zırhlı süvari çekirdeği (Equite/Druzhinnik) devşirilir.

---

## BÖLÜM 5: Kırsal Köy (Village) Menüleri ve Fonksiyonları Mimarisi

Köyler surları olmayan, tarım ve hayvancılıkla geçinen, bağlı oldukları şehir veya kaleyi besleyen üretim hücreleridir.

### 5.1 Görsel UI Tel Çerçevesi (Village Layout Wireframe)
```
+----------------------------------------------------------------------------------------------------+
| [BUĞDAY] ZEONICA KÖYÜ (Kırsal Tarım Yerleşimi - Kalradya İmparatorluğu)    [X] Haritaya Dön [ESC]  |
| Üretim: Tahıl & Ekmeklik Buğday  |  Ocak Sayısı (Hearth): 240  |  Milis: 28 Köylü Savunucu          |
| Bağlı Olduğu Şehir: Lycaron Ticaret Şehri                                                          |
+----------------------------------------------------------------------------------------------------+
|  KÖYÜN İLERİ GELENLERİ:                                                                            |
|  [🌾 Köy Muhtarı Kalan]   [🐎 Nalban / Çiftçi]   [🍞 Fırıncı]                                      |
+-----------------------------------+----------------------------------------------------------------+
| EYLEM MENÜSÜ                      | AKTİF ETKİLEŞİM PANELİ                                         |
|                                   |                                                                |
| 1. [Köy Meydanı & Bilgi]          | - Köyün hasat durumu, verimlilik ve bağlı şehir lojistiği      |
| 2. [Köylü Gönüllü Asker Topla]   | - Ucuz maliyetli köylü acemileri ve avcıları orduya katma      |
| 3. [Köylülerden Erzak Satın Al]   | - Köy ambarından toptan ucuz fiyata erzak alımı (18 Dinar / +5)|
| 4. [Köyde Dinlen ve Bekle]        | - Çiftlik evlerinde mola vererek orduyu toparlama              |
| 5. [DÜŞMANCA EYLEMLER]            | - [!] Köylüleri Erzak Vermeye Zorla (Erzak gaspı)              |
|    (Hostile Actions Alt Menüsü)   | - [!] Köylüleri Asker Vermeye Zorla (Zorunlu askerlik)         |
|                                   | - [🔥] Köyü Yağmala ve Yak (Büyük ganimet, köy duman içinde)   |
| 6. [Köyden Ayrıl]                 | - Sefer haritasına dön                                         |
+-----------------------------------+----------------------------------------------------------------+
| DURUM BARI:  Hazineniz: 1,450 Dinar  |  Ordu Erzağı: 42  |  Köy Durumu: Barışçıl ve Bereketli      |
+----------------------------------------------------------------------------------------------------+
```

### 5.2 Köy Eylemleri Detay Tablosu
1. **Köylü Gönüllü Asker Topla (Recruit Peasants):** Düşük maliyetli, hızlı toplanan temel piyadeler.
2. **Köylülerden Erzak Satın Al (Buy Local Food):** Şehir pazarlarına göre çok daha ucuz (örneğin şehirde 30 Dinar iken köyde 18 Dinar).
3. **Köyü Yağmala ve Yak (Raid Village):** Düşman köylerine uygulanabilen en ağır yıkım. Köy yağmalandığında:
   - Oyuncu yüklü miktarda altın (250-400 Dinar) ve erzak (+20 Erzak) kazanır.
   - Köyün ocak sayısı düşer, haritada köyün üstünden siyah dumanlar yükselir.
   - İlgili krallıkla derhal savaş ilan edilmiş sayılır.

---

## BÖLÜM 6: Oyunumuza Yapılacak Entegrasyon ve Düzeltmeler

1. **Etkileşim Mesafesi Düzeltmesi:**
   - Uzaktan tıklamada menü açılması tamamen engellenecek.
   - Oyuncu yerleşimin kapısına gidene kadar menü açılmayacak.
   - Şehir için `5.2`, Kale için `3.8`, Köy için `2.6` varış eşiği uygulanacak. Varış anında oyuncu duracak, zaman `0` olacak ve menü açılacak.

2. **Lord İle Diyalog Zaman ve Hareket Kilidi:**
   - Diyalog açıldığında `campaignTimeScale = 0` yapılacak.
   - Konuşulan lordun hareketi durdurulacak (`isInteracting = true`), haritada asla kayıp gidemeyecek.

3. **Bannerlord Tarzı Kapsamlı SettlementModal:**
   - `SettlementModal.tsx` tamamen yenilenerek Şehir, Kale ve Köy tiplerine göre özelleştirilmiş sekmeli/aksiyonlu zengin Bannerlord arayüzü sunulacak.
   - Şehirde: Meydan, Pazaryeri, Meyhane (paralı askerler & fidye), Arena (talim & turnuva), Asker Yazımı, Dinlenme, Kuşatma.
   - Kalede: Divanhane, Zindan, Garnizonu Yönet, Soylu Asker Yazımı, Dinlenme, Kuşatma.
   - Köyde: Köy Meydanı, Ucuz Erzak Alımı, Köylü Asker Yazımı, Dinlenme ve Düşmanca Eylemler (Zorla Erzak/Asker Alma, Köyü Yağmalama!).
