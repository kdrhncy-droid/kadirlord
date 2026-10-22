# Kadirlord — Cursor İçin En Zor Bannerlord Görevleri ve Geliştirici Kılavuzu

Bu belge, Cursor AI asistanının projeyi Bannerlord standartlarına uygun, görsel ve mimari derinlikte geliştirmesi için hazırlanmış **resmi görev ve kılavuz belgesidir**.

---

## 🛑 1. EN KRİTİK KURAL: GÖRSEL OTORİTE VE BANNERLORD ÖZGÜNLÜĞÜ

> **Cursor'a Kesin Talimat:**
> Bannerlord'da olan bir ekranı, menüyü, düğme hiyerarşisini veya savaş panelini kodlarken; o ekranın Bannerlord'da tam olarak nasıl göründüğünü **bilmiyorsan ASLA kafana göre uydurma, rastgele modern web butonları veya hayalî renkler koyma.**
> 
> **Her görsel adımda şu yöntemi uygula:**
> 1. Google Görsellerde veya Steam topluluk rehberlerinde arama yap:
>    - Kuşatma için: `"Mount & Blade II: Bannerlord siege camp UI screenshot"`, `"Bannerlord settlement under siege map icon"`
>    - Ordu için: `"Mount & Blade II: Bannerlord army creation cohesion influence UI"`
>    - Kervan için: `"Mount & Blade II: Bannerlord form a caravan companion trade UI"`
>    - Klan/Evlilik için: `"Mount & Blade II: Bannerlord clan family tree marriage UI"`
> 2. Gerçek oyun ekranındaki:
>    - Renk paletini (`#120f0c` koyu bronz zemin, `#c6a15b` / `#fbbf24` pirinç/altın çerçeveler, `#f4ecd8` antik parşömen metinleri),
>    - Sol/orta/sağ panel yerleşimini,
>    - İkonografiyi ve metin tonunu
>    incele ve **yalnızca teyit ettiğin Bannerlord görseline sadık kalarak kod yaz.**

---

## 🚫 2. İPTAL / ERTELENEN GÖREVLER (VAKİT KAYBETME)

* ⚠️ **Parça Bazlı Demircilik (Smithing) GEÇİCİ OLARAK İPTAL EDİLMİŞTİR.**
  - Oyuncu demirciliği şimdilik devre dışıdır ve yol haritasının en sonuna bırakılmıştır.
  - Demircilik menüsü, eritme/arıtma veya kılıç parçaları üzerine odaklanma; öncelik tamamen canlı savaş/sefer sistemlerindedir.

---

## ⚔️ 3. YAPILACAK EN ZOR 4 BÜYÜK GÖREV

---

### GÖREV 1: CANLI KUŞATMA SİSTEMİ VE HARİTA KUŞATMA SEÇENEKLERİ (ÖNCELİK 1)

#### Sorun ve Eksiklik:
Şu anda bir lord veya oyuncu kale kuşattığında, dünya haritasında kalenin üzerinde görsel bir kuşatma belirtisi yoktur. Oyuncu şehre yaklaştığında veya tıkladığında da Bannerlord'un o meşhur kuşatma seçenekleri (kuşatmayı yarma, kampa katılma, huruc yapma vb.) çıkmamakta, oyun sıradan şehir menüsünü açmaktadır.

#### Yapılacaklar (Adım Adım):

1. **Kuşatılan Kalenin Dünya Haritası Görünümü (`src/components/WorldCanvas.tsx`, `src/game/mapGen.ts`):**
   - Kuşatma altındaki her yerleşimin (`settlement.siegeState?.isBesieged === true`) etrafında:
     - 3B harita zemininde **Kuşatma Kampı Çemberi** (çadırlar, siperler, kazıklar).
     - Kalenin surlarından ve kamp ateşlerinden yükselen **duman/kıvılcım efektleri**.
     - Harita etiketinde (LOD) yerleşim adının yanında yanıp sönen kırmızı **"KUŞATMA ALTINDA"** rozeti ve kuşatan ordunun sancağı.

2. **Kuşatılan Yerleşime Tıklama / Yaklaşma Etkileşimi (3 Ayrı Bağlam):**
   Oyuncu kaleye tıkladığında `SettlementModal` yerine kuşatma durumuna göre **3 ayrı Bannerlord akışı** açılmalıdır:

   * **Bağlam A — Oyuncu Kaleyi Kuşatıyorsa (Kuşatma Kampı Menüsü):**
     - Üstte: Kuşatan Ordu gücü vs Garnizon/Milis gücü.
     - Ortada: **4 Aktif Kuşatma Silahı Yuvası + Rezerve Yuvaları**.
       - Silah türleri: *Trebuchet, Ağır Mangonel, Kundaklı Balista, Koçbaşı, Kuşatma Kulesi*.
       - İnşaat süresi ve makinelerin surlara otomatik bombardıman düellosu.
       - Sur Sağlığı (`wallHealth: 0-100`). Can sıfırlanınca **2 adet Sur Gediği (Breach)** açılır.
     - İstatistikler: Kalenin kalan erzak günü (sıfırlanınca garnizon her gün açlıktan erir).
     - Eylemler:
       - `[Sur Gediklerinden Hücum Et]` (Gedik açıldıysa piyadeler doğrudan şehre dalar).
       - `[Koçbaşıyla Kapıyı Zorla]` (Koçbaşı bittiyse dış kapı kırılır).
       - `[Kuşatmayı Kaldır / Geri Çekil]`.

   * **Bağlam B — Düşman Bir Kaleyi Kuşatıyorsa (Oyuncu Dışarıda):**
     - Bannerlord'daki gibi seçenekler:
       1. `[Kuşatan Orduya Taarruz Et]` -> Kuşatan lordun ordusuyla meydan savaşına girilir, kazanılırsa kuşatma kırılır.
       2. `[Kuşatmayı Yararak İçeri Gir ve Savunmaya Katıl]` -> Garnizonla birleşmek için düşman hatları yarılır (parti zayiatı riski, Cerrah becerisi kaybı azaltır). Başarılı olursa oyuncu kalenin içine girer.
       3. `[Uzaktan Gözlemle / Bekle]` -> Kuşatmanın seyrini haritadan izler.

   * **Bağlam C — Oyuncu Kuşatılan Kalenin İçindeyse (Savunma Modu):**
     - Seçenekler:
       1. `[Sur Savunmasını Yönet / Hücumu Karşıla]` -> Düşman hücum ettiğinde surlarda savunma savaşı.
       2. `[Huruc Hareketi Yap (Sally Out)]` -> Gece baskınıyla düşmanın kuşatma makinelerini yakıp geri surların içine çekilme.
       3. `[Teslim Ol / Müzakere Et]` -> Şehri bırakıp esir düşmeme pazarlığı.

---

### GÖREV 2: NÜFUZLA ORDU TOPLAMA, KRALLIK POLİTİKALARI VE UYUM (COHESION)

#### Bannerlord Özellikleri:
1. **Ordu Kurma (Create Army):**
   - Krallık Divanı (`K`) veya HUD üzerinden "Ordu Topla" ekranı açılır.
   - Krallıktaki müsait lordlar listelenir. Her lordun orduya çağrılma bedeli **Nüfuz (Influence)** cinsindendir (aradaki ilişki ve ordusunun büyüklüğüne göre 15-60 Nüfuz).
2. **Uyum (Cohesion) ve Canlı Ordu Hareketi:**
   - Ordu kurulunca haritada lordlar oyuncunun sancağına doğru yürür ve tek bir devasa partide birleşir.
   - **Uyum Çubuğu (100 -> 0):** Ordu bir arada durdukça her gün uyum kaybeder. Oyuncu nüfuz harcayarak uyumu artırabilir. Uyum 0 olursa ordu dağılır.
   - **Ordu Erzak Paylaşımı:** Ordudaki lordların yiyeceği biterse oyuncunun erzak stoğundan tüketirler (oyuncuya nüfuz kazandırır; erzak biterse ordu aç kalır).
3. **Divan Tımar ve Politika Oylamaları:**
   - Bir kale/şehir fethedildiğinde kral ve lordlar toplanır. 3 aday lord belirlenir. Oyuncu kendi nüfuzunu (20, 50, 100 nüfuz) yatırarak oy verir.
   - Krallık yasaları teklif edilir (*Kraliyet Muhafızları, Soylu Ayrıcalıkları, İl Meclisi* vb.).

---

### GÖREV 3: CANLI ŞEHİR MAKRO-EKONOMİSİ, KERVAMLAR VE ATÖLYELER

#### Bannerlord Özellikleri:
1. **Şehir & Köy Tedarik Zinciri:**
   - Köyler ürettikleri hammaddeyi (tahıl, demir cevheri, kil, zeytin, yün, at) her gün en yakın şehre taşır.
   - Köy yağmalanırsa veya kervanlar haydutlarca basılırsa şehirde hammadde kıtlığı başlar, fiyatlar 3-5 katına çıkar.
2. **Şehir Atölyeleri (Workshops):**
   - Şehirde 3 adede kadar atölye satın alınabilir (*Bira Fabrikası, Demir Ocağı, Yağ Değirmeni, Dokuma Atölyesi*).
   - Atölye şehirdeki hammaddeyi alıp işler, mamulü pazara satar. Günlük kar/zarar oyuncunun hazinesine yansır.
3. **Yoldaş Kervanı Kurma:**
   - Şehir pazarından 15.000 Dinar + 1 Yoldaş verilerek Ticaret Kervanı oluşturulur.
   - Kervan haritada canlı bir parti olarak dolaşır, ucuz şehirden alıp pahalı şehre satar, haydutlardan kaçar, oyuncuya günlük net kar getirir.

---

### GÖREV 4: YOLDAŞ YAŞAM DÖNGÜSÜ, EVLİLİK VE HANEDAN (DYNASTY)

#### Bannerlord Özellikleri:
1. **Meyhane Gezginleri (Wanderers):**
   - Meyhanelerde lakaplı yoldaşlar (*İzci, Demiryumruk, Şahin, Hekim*) üretilir.
   - Geçmiş hikâyeleri dinlenir, ücreti ödenerek kervanbaşı, vali veya savaşçı olarak partiye alınır.
2. **Evlilik ve Flört:**
   - Karşı cins lordlarla diplomasi ekranında kur yapılır (Sosyal / Cazibe ikna zarları).
   - Klan lideriyle drahoma / başlık parası pazarlığı yapılarak evlenilir.
   - Eş oyuncunun partisine veya tımarlarına yerleşir; çocuklar doğar ve klan soy ağacına eklenir.

---

## 🛠️ 4. TEST VE DOĞRULAMA TALİMATLARI

Cursor bir değişiklik yaptığında **asla test etmeden "bitti" dememelidir.**

1. **Hızlı Doğrulama (Her kod değişikliğinden sonra):**
   ```bash
   cmd /c "npm run verify:fast"
   ```
   *Bu komut TypeScript derleyicisini, kuralları, diyalog, test harness ve karakter gelişim problarını 20 saniyede doğrular.*

2. **Kuşatma için Yeni Bir Prob Ekle:**
   - Kuşatma sistemi kodlandığında `scripts/probe-siege-system.ts` yazılmalı, `package.json` içindeki `verify:fast` zincirine eklenmeli ve sur bombardımanı/makine yuvaları test edilmelidir.
