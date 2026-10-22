# Kadirlord — Cursor İçin Bannerlord Sistemleri Ansiklopedik Geliştirici Kılavuzu

Bu belge; **Mount & Blade II: Bannerlord** oyun kaynak kodları, Fandom wiki'si ve resmi mekanik dokümantasyonundan derlenmiş **kesin matematiksel formülleri, arayüz (UI) yuva düzenlerini ve etkileşim akışlarını** içerir. Cursor AI asistanı, projeyi geliştirirken bu belgedeki detayları kılavuz kabul etmelidir.

---

## 🛑 1. EN KRİTİK KURAL: GÖRSEL VE MEKANİK OTORİTE

> **Cursor'a Kesin Direktif:**
> Bannerlord'da olan bir ekranı, menüyü, düğme hiyerarşisini veya savaş panelini kodlarken; o ekranın Bannerlord'da tam olarak nasıl göründüğünü **bilmiyorsan ASLA kafana göre uydurma, rastgele modern web butonları veya hayalî renkler koyma.**
> 
> **Görsel Araştırma Kuralı:**
> - Kod yazmadan önce Google Görsellerde `"Mount & Blade II: Bannerlord [özellik adı] UI screenshot"` araması yap.
> - Renk Paleti Standartları:
>   - Arka Plan: Koyu bronz, demir ve deri dokuları (`#120f0c`, `#181510`, `#1a140d`, `#1c1914`).
>   - Çerçeveler / Vurgular: Eskitme pirinç ve altın işlemeler (`#c6a15b`, `#d4af37`, `#fbbf24`, `#fde68a`).
>   - Tipografi: Başlıklar `Cinzel`/`font-display`, istatistikler `font-mono-tabular`, metinler `#f4ecd8` / `#e2d6c1`.
>   - Butonlar: Ahşap/demir kabartmalı dokular, hover durumunda altın ışıltı (`hover:border-[#fbbf24] shadow-md`).

---

## 🚫 2. İPTAL / ERTELENEN GÖREVLER (VAKİT KAYBETME)

* ⚠️ **Parça Bazlı Demircilik (Smithing) GEÇİCİ OLARAK İPTAL EDİLMİŞTİR.**
  - Oyuncu demirciliği şimdilik devre dışıdır ve yol haritasının en sonuna bırakılmıştır.
  - Demircilik menüsü, eritme/arıtma veya kılıç parçaları üzerine odaklanma; öncelik tamamen canlı kuşatma, ordu toplama, ekonomi ve hanedan sistemlerindedir.

---

## ⚔️ 3. DERİNLEMESİNE ARAŞTIRILMIŞ EN ZOR 4 BÜYÜK SİSTEM

---

### GÖREV 1: CANLI KUŞATMA SİSTEMİ (SIEGE CAMP, ENGINE DUEL & ASSAULT)

#### A. Harita Görünümü (`src/components/WorldCanvas.tsx`, `src/game/mapGen.ts`):
* Bir yerleşim kuşatıldığında (`settlement.siegeState?.isBesieged === true`):
  1. Yerleşimin 3B etrafında dairesel **Kuşatma Kampı Çemberi** (siper kazıkları, çadırlar ve kuşatma silahı modelleri).
  2. Sur mazgallarından ve kamp ateşlerinden yükselen **duman ve kıvılcım parçacıkları**.
  3. Harita etiketinde kırmızı yanıp sönen **`KUŞATMA ALTINDA`** rozeti ve kuşatan ordunun sancağı.

#### B. Kuşatılan Kaleye Tıklama / Yaklaşma Menüsü (3 Ayrı Bağlam):
Oyuncu bir kaleye/şehre tıkladığında durum kuşatmaysa doğrudan normal şehir menüsü açılmamalıdır; Bannerlord'un gerçek kuşatma seçenekleri çıkmalıdır:

##### 1. Bağlam: Oyuncu Kaleyi Kuşatıyorsa (Kuşatma Kampı Menüsü)
* **Kuşatma Kampı İnşası:** Kuşatma başladığında önce bir "Kuşatma Kampı Kuruluyor" ilerleme çubuğu dolar. Kamp bitmeden silah inşa edilemez.
* **4 Aktif Yuva + Rezerve Mekaniği (The Reserve Mechanic):**
  - Bannerlord'da saldıran tarafın **4 adet aktif menzilli silah yuvası** vardır.
  - **Kritik Oynanış Taktiği:** Silahlar teker teker sahaya sürülürse kalenin savunma mancınıkları yeni yapılan silahı anında yıkar. Bu yüzden oyuncu silah tamamlandığı anda **"Rezerveye Çek (Move to Reserve)"** düğmesine basar.
  - 4 adet Trebuchet veya Ağır Mancınık rezerveye çekildikten sonra hepsi aynı anda sahaya sürülür ve kalenin savunma silahları ezilir.
* **Sur Gediği (Wall Breach):**
  - Trebuchet ve Mancınıklar surlara ateş eder. Kalenin **Sol Sur** ve **Sağ Sur** can barları (0-100) bulunur.
  - Sur canı 0'a indiğinde sur yıkılır ve **"Sur Gediği (Breach)"** açılır.
  - Gedik açıldığında hücumda merdiven veya kuleye gerek kalmaz; süvari ve piyadeler doğrudan molozların üstünden şehre dalar!
* **Garnizon Açlığı (Starvation):**
  - Kuşatma sürdükçe kalenin erzak stoğu sıfırlanır. Erzak bitince garnizon her gün açlıktan kırılır (yaralanır ve ölür).
* **Taarruz Seçenekleri:**
  - `[Sur Gediklerinden Hücum Et]` (Gedikler açıldıysa).
  - `[Koçbaşı ve Kulelerle Hücum Et]` (Koçbaşı kapıyı kırar, kuleler sura yanaşır).
  - `[Kuşatmayı Kaldır / Geri Çekil]`.

##### 2. Bağlam: Düşman Bir Kaleyi Kuşatıyorsa (Oyuncu Dışarıda)
1. `[Kuşatan Orduya Taarruz Et]` -> Kuşatan lordun ordusuyla açık meydan muharebesi başlatılır.
2. `[Kuşatmayı Yararak İçeri Gir ve Savunmaya Katıl (Break in to help defenders)]`:
   - Düşman kuşatma hatlarını yararak kaleye sığınma eylemidir.
   - **Mekanik:** Birlikler düşman çemberini yararken **%15-%25 oranında zayiat (yaralı/ölü)** verir. Oyuncu kalenin içine girer ve içerideki garnizonla birleşip sur savunmasına katılır!
3. `[Uzaktan Gözlemle / Bekle]` -> Kuşatmayı haritadan takip eder.

##### 3. Bağlam: Oyuncu Kuşatılan Kalenin İçindeyse (Savunma Modu)
1. `[Huruc Hareketi Yap (Sally Out)]`:
   - Kuşatmacılar henüz taarruz etmeden kapıdan aniden fırlayıp kuşatma kampına doğrudan meydan savaşı açmak.
2. `[Kuşatma Silahlarına Pusu Kur (Ambush)]`:
   - Gece vakti küçük bir birlikle gizlice sızıp düşmanın koçbaşını veya kulelerini yakıp surların içine geri dönme.
3. `[Sur Savunmasını Yönet]`:
   - Düşman hücum ettiğinde surların tepesinden savunma savaşı.
4. `[Kuşatmayı Yarıp Dışarı Kaç (Break Out)]`:
   - Şehri terk edip canını kurtarmak için zayiat vererek kuşatma hatlarından dışarı kaçma.

---

### GÖREV 2: NÜFUZLA ORDU TOPLAMA, KRALLIK POLİTİKALARI VE UYUM (COHESION)

#### A. Ordu Toplama (Create Army):
* **Giriş:** Krallık Divanı (`K`) veya HUD'daki bayrak butonundan açılır.
* **Nüfuz Maliyeti Formülü:**
  - Kendi klanının yoldaş/aile partilerini orduya çağırmak: **0 Nüfuz**.
  - Diğer lordların partileri: Lordun klan kademesine, ordusunun asker sayısına ve oyuncuyla olan ilişkisine göre **15 ila 65 Nüfuz** arası değişir.

#### B. Ordu Uyumu (Army Cohesion):
* Ordu kurulduğunda **100 Uyum** ile başlar.
* **Günlük Uyum Kaybı:** Ordudaki parti sayısı arttıkça günlük uyum kaybı hızlanır (`-(Parti Sayısı * 1.5 + Birlik / 50)`).
* **Uyum Yenileme:** Oyuncu Nüfuz harcayarak uyumu +10'luk adımlarla doldurabilir.
* **Dağılma:** Uyum **0**'a düştüğünde ordu otomatik olarak dağılır ve lordlar kendi devriyelerine döner.

#### C. Ordu Erzak Paylaşımı:
* Ordu tek bir lojistik gövde gibi davranır. Ordudaki diğer lordların erzağı bittiğinde oyuncunun envanterindeki erzakları yerler.
* Oyuncu ordudaki aç lordları besledikçe her gün **Nüfuz (Influence)** kazanır. Oyuncunun da erzağı biterse ordu aç kalır, moral çöker ve uyum hızla tükenir.

#### D. Divan Tımar ve Politika Oylamaları:
* Bir kale/şehir fethedildiğinde **3 aday lord** belirlenir.
* Krallıktaki tüm lordlar 3 seviyede nüfuz yatırır:
  - Düşük Destek: **20 Nüfuz**
  - Orta Destek: **60 Nüfuz**
  - Yüksek Destek: **100 Nüfuz**
* Kral en çok oyu alan adayı seçebilir veya kendi nüfuzunu harcayarak kararı veto edip tımarı istediğine verebilir.

---

### GÖREV 3: CANLI ŞEHİR MAKRO-EKONOMİSİ, KERVAMLAR VE ATÖLYELER

#### A. Şehir ve Köy Tedarik Zinciri:
* Her köyün bağlı olduğu bir şehir ve ürettiği **Hammadde** vardır.
* Köylüler ve yerel kervanlar her gün hammaddeyi şehre taşır. Şehirde hammadde bolluğu varsa alış fiyatı düşer, kıtlık varsa katlanır.

#### B. 11 Gerçek Bannerlord Atölyesi (Workshops):
Şehirlerde satın alınabilen (13.000 - 16.000 Dinar) 11 resmi atölye türü ve girdi/çıktı tablosu:

| Hammadde Girdisi | Atölye Türü | Üretilen Mamul |
| :--- | :--- | :--- |
| **Tahıl (Grain)** | Bira Fabrikası (Brewery) | Bira (Beer) |
| **Üzüm (Grapes)** | Şarap İmalathanesi (Wine Press) | Şarap (Wine) |
| **Zeytin (Olives)** | Zeytinyağı Presi (Olive Press) | Yağ (Oil) |
| **Keten (Flax)** | Keten Dokuma (Linen Weavery) | Keten Kumaş / Giysi |
| **Yün (Wool)** | Yün Dokuma (Wool Weavery) | Yün Kumaş / Giysi |
| **Kadife/Pamuk (Cotton)** | Kadife Atölyesi (Velvet Weavery) | Lüks Kadife Giysi |
| **Kil (Clay)** | Çömlek Atölyesi (Pottery Shop) | Çömlek (Pottery) |
| **Ham Deri (Rawhide)** | Tabakhane (Tannery) | İşlenmiş Deri / Zırh |
| **Sert Ahşap (Hardwood)** | Marangoz / Ahşap Atölyesi (Wood Workshop) | Yay, Ok, Kalkan |
| **Demir Cevheri (Iron Ore)** | Demir Dökümhane (Smithy) | Silah, Zırh, Aletler |
| **Gümüş (Silver)** | Kuyumcu (Silversmith) | Mücevher (Jewellery) |

#### C. Yoldaş Ticaret Kervanı:
* Şehir pazarından tüccarla konuşulur:
  - Standart Kervan: **15.000 Dinar** + 1 Yoldaş.
  - Muhafızlı Kervan: **22.500 Dinar** + 1 Yoldaş (Daha güçlü askerler).
* Kervanbaşı yoldaşın **Ticaret (Trade)** becerisi kar oranını, **İzcilik (Scouting)** hızı ve haydutlardan kaçışı, **Taktik (Tactics)** otomatik savaş kazanma şansını belirler.
* Kervan haritada serbestçe gezer ve her gün oyuncunun hazinesine net kar/zarar aktarır.

---

### GÖREV 4: YOLDAŞ YAŞAM DÖNGÜSÜ, EVLİLİK VE HANEDAN (DYNASTY)

#### A. Meyhane Gezginleri (Wanderers):
* Bannerlord'un lakaplı yoldaşları üretilir:
  - *"Baharatçı" (The Spicevendor)*: Yüksek Ticaret (İdeal Kervanbaşı).
  - *"Şahin / Hızlı" (The Swift)*: Yüksek İzcilik ve Haydutluk.
  - *"Hekim / Şifacı" (The Healer/Bitterdraught)*: Yüksek Hekimlik (Cerrah).
  - *"Mühendis / Mimar" (The Engineer/Knowing)*: Yüksek Mühendislik.
  - *"Kalkan Kıran / Demiryumruk"*: Yüksek Savaşçı statları.

#### B. Evlilik ve Flört Aşamaları:
1. **Hedef:** Karşı cinsten, evli olmayan bir soylu.
2. **2 Aşamalı Cazibe / İkna Sınavı:**
   - 1. Konuşma: Karakterin kişilik özelliklerine (Onur, Cesaret, Cömertlik) uygun 3 argüman seçilir. Başarılı olunursa birkaç gün beklenir.
   - 2. Konuşma: İkinci ikna testi yapılır.
3. **Başlık Parası / Drahoma (Dowry):**
   - Eş ikna edildikten sonra hedef soylunun **Klan Lideri** bulunur.
   - Barter (Takas) ekranında soylunun klan kademesine göre altın/eşya verilerek evlilik resmileştirilir. Eş oyuncunun klanına katılır.

#### C. Hamilelik, Çocuklar ve Yaşlanma:
* **Hamilelik:** Eş ile oyuncu aynı partide veya aynı şehirde beklerken tetiklenir (**37 oyun günü** sürer). *Virile (Doğurgan)* perki şansı 2 katına çıkarır.
* **Büyüme:** Çocuklar **18 yaşına** geldiğinde klanın tam donanımlı kahramanı haline gelir.
* **Permadeath (Varis Seçimi):** Ana karakter savaşta veya yaşlılıktan öldüğünde klan dağılmaz; çocuklardan veya eşten yeni lider seçilir ve sefere devam edilir.

---

## 🛠️ 5. TEST VE DOĞRULAMA KURALI

Her sistem yazıldığında Cursor mutlaka şu adımları izlemelidir:
1. İlgili kural için saf fonksiyon probu yaz (`scripts/probe-[sistem-adi].ts`).
2. Doğrulamayı çalıştır:
   ```bash
   cmd /c "npm run verify:fast"
   ```
3. UI eklendiyse tarayıcıda veya E2E kancasıyla doğrula.
