# Kadirlord — Açık Görevler ve Yol Haritası

> **Son konsolidasyon:** 2026-10-22
> **Kapsam:** Bu dosya, projede **yapılmamış işlerin tek güncel listesidir**. Eski araştırma ve
> denetim belgeleri kanıt/arka plan arşivi olarak korunur; bir görev bu dosyada yoksa önce buraya
> eklenmeli, tamamlanan görev de yalnız burada kapatılmalıdır. Çelişki hâlinde güncel kod ve bu
> dosya esas alınır.
>
> **Uygulama sırası bağlayıcıdır:** P2 → P3 → P4 → P5 → P6 → içerik/ürünleşme borçları →
> **P7 performans** → **P8 kayıt yönetimi**. Her paket; tip kontrolü, ilgili kural/probe testleri
> ve gerekiyorsa gerçek tarayıcı E2E kapısından geçmeden sonraki pakete başlanmaz.
>
> 2026-10-22 konsolidasyonunda GitHub'da açık Issue veya Pull Request bulunmuyordu. Oyun
> yalnız masaüstüdür; mobil/dokunmatik destek kullanıcı kararıyla kapsam dışıdır.

## 1. Tamamlanmış temel

- Hız Paketi: `AGENTS.md`, deterministik test kancası, repo içi Chromium/Puppeteer E2E ve kademeli
  `verify` komutları `main`e girdi.
- Bannerlord P0 kararları kapatıldı: tam ekran üç sütun düzen, bekleyen transfer + `Done/Cancel`,
  Bannerlord Discard/perk modeli, tam kültür birlik ağaçları ve adım adım tam kapsam.
- Bannerlord P1 veri temeli tamamlandı: sayısal stat'lı eşya tanımları, adetli/kilitli yığınlar,
  tanım kimliğine bağlı ekipman, gerçek oyuncu/yoldaş kayıtları, XP/yaralı alanlı birlik ve
  tutsak yığınları; kayıt biçimi v4 ve v1–v3 göçü `ensureBannerlordFoundation` ile çalışıyor.
- P2'nin pazar dilimi tamamlandı (`59a9d10`): bekleyen-transfer taslağı, kalıcı şehir stoğu ve
  tüccar kasası, adetli alım/satım, kalıcı kilit, ziyaret edilmiş şehir söylentileri ve gerçek
  `Vazgeç/Bitti` atomikliği pazar ekranına bağlandı.
- P2'nin saha envanteri dilimi tamamlandı (`0d41b25`): tam ekran üç sütun `I` ekranı, sol Discard,
  kahraman geçiş okları, savaş/sivil setler, bütün kahramanlar için tek kuşan/çıkar çekirdeği ve
  Discard'ın gerçek birlik XP dağıtımı çalışıyor.
- Bu konsolidasyonun temizlik kısmı için Bölüm 12'ye bakın.

## 2. Sıradaki ana yol — Bannerlord paketleri

### P2 — Envanter, Discard, pazar, ganimet ve lojistik

- [ ] **Bekleyen-transfer etkileşimini tamamla:** Saf transfer/kilit çekirdeği ve satır
      düğmelerinde tık = 1, Shift = 5, Ctrl/Cmd = tümü çalışıyor; `Done` taslağı atomik işliyor,
      `Cancel` kampanyayı değiştirmiyor. Sürükle-bırak ve satır okları henüz yok; eklenirse aynı
      çekirdek kullanılacak.
- [x] **Saha Envanteri (`I`) ekranını tam ekran üç sütun yap:** Sol Discard, ortada 360°
      döndürülebilir kahraman + kuşanılmışsa binek ve 12 slot, sağda parti envanteri. Kahraman
      geçiş okları, gerçek savaş/sivil set sekmeleri ve sayısal zırh/stat özeti bağlı.
- [x] **Ekipman akışını canlı modelde tamamla:** Tek çekirdek seçili kahramanın seçili setine
      yazar, yığından bir adet düşer, eski parçayı envantere döndürür; sivil yasallık ve slot
      uyumu doğrulanır, 3B manken seçili setten türetilir.
- [x] **Discard uygulamasını bitir:** Perk/tavan/kapasite önizlemesi gerçek XP dağıtımına bağlı.
      XP yalnız terfi edebilen normal birlik yığınlarına kapasite kadar gider; taşma kırmızı
      gösterilir ve boşa gider. Zırh/koşum ile silah/kalkan/sadak ayrımı ve T0 35 tavanı kural
      testleriyle kilitli.
- [x] **Şehir pazarını aynı ekrana taşı:** Sol kalıcı şehir stoğu, orta kahraman, sağ parti
      envanteri. Tüccar kasası kalıcıdır; oyuncunun sattığı mallar stoğa döner; gösterilen ve
      ödenen birim fiyat aynı tanım tabanlı yardımcıdan gelir.
- [ ] **Pazar ortasındaki kahraman seçimini saha envanteriyle eşitle:** Pazar hâlâ yalnız oyuncu
      kahramanını gösteriyor. Kahraman geçiş okları ve savaş/sivil set seçimi eklenmeli; ayrıca
      sağdaki kuşanılmış-slot şeridinin ekran görüntüsünde kısmen kesilmesi görsel olarak
      düzeltilmeli.
- [x] **Pazar liste işlevlerini tamamla:** Kategori, arama ve kademe/ad/adet/fiyat/ağırlık/
      hasar/zırh sıralaması; ortalama fiyat renkleri; yalnız ziyaret edilmiş şehir söylentileri;
      kalıcı kilidin satış, toplu satış ve Discard'ı engellemesi bağlı.
- [x] **Savaş sonrası ganimet ekranını ekle:** Sol ganimet, orta 3B manken + Discard/kapasite
      özeti, sağ parti envanteri; bekleyen transfer, Shift (5) / Ctrl (tümü) / tekil aktarım,
      `Tümünü Al` / `Tümünü Bırak`, sol teçhizatı Discard XP'sine bağışlama ve atomik `Bitti` ile
      kampanyaya işleme bağlandı. Vazgeç durumunda taslak temizlenir. Gerçek Chromium E2E
      `battle-loot-screen` ve kural testleri (33/33) yeşil.
- [x] **Tek lojistik modeli kur:** Toplam ağırlık birim ağırlık × adet hesabı ekranlarda doğru
      gösteriliyor; kapasite formülleri (`calculatePartyCarryCapacity`) ve harita hızı (`calculatePartyLogistics`)
      `src/game/logistics.ts` altında tekilleştirildi. Kapasite taban (40) + sağlıklı askerler (20 kg) +
      yedek binekler (20 kg) + yük hayvanları (100 kg) ve `pack_mules` perk'iyle (+%20) hesaplanır.
      Hız modeli ordu boyutu, süvari oranı, bindirilmiş yaya bonusu, aşırı yük (overburden drag),
      sürü cezası (herd penalty), yaralı/tutsak sürtünmesi ve arazi çarpanlarını tek çatıya topladı.
      Kural testi (34/34) yeşil.
- [x] **Erzak yığınlarını canlı tüketime bağla:** `src/game/foodSystem.ts` kuruldu. Pazar geçiş
      katmanındaki soyut `SPECIAL_FOOD_GAIN` baypası kaldırıldı; alınan yiyecekler doğrudan
      `inventoryItems` yığınlarına işlenir. Günlük tüketim (`advanceDailyPartyFood` / `advanceDailyEconomyAndWorld`)
      envanterdeki gerçek yiyecek yığınlarından dengeli/round-robin tüketir; 1..5+ çeşit gıda için
      0..+12 çeşitlilik morali verir. Yiyecek kalmadığında açlık felaketi (-15 moral, askerlerin dermansız
      düşmesi ve vakayiname uyarısı) işler. Kural testi (35/35) yeşil.
- [x] **P2 kabul kapısı:** P2 kapsamındaki tüm alt dilimler tamamlandı. Kural testleri **35/35**,
      `npm run verify:fast` ve gerçek donanım hızlandırmalı Chromium E2E **6/6** başarıyla geçti
      (`boot-webgl`, `encyclopedia-heroes`, `forced-encounter`, `market-pending-transfer`,
      `field-inventory-discard`, `battle-loot-screen`). P2 başarıyla kapandı, P3'e geçiliyor.

#### P2 ilerleme kaydı — 2026-10-22

- `59a9d10`: `src/game/marketTransaction.ts`, kalıcı `Settlement.marketStock/merchantGold/visited`,
  taslak tabanlı `BannerlordMarketModal`, pazar E2E. Tarayıcıda yakalanan “`visited` yazılınca boş
  stok” regresyonu sanitizasyon + başlatıcı tarafında kapatıldı ve teste eklendi.
- `0d41b25`: `src/components/InventoryModal.tsx`, ortak `HeroMannequin`, bütün kahramanlar için
  `equipInventoryItemForHero` / `unequipHeroEquipmentSlot` / `setHeroActiveEquipmentSet`, Discard UI
  ve saha-envanteri E2E. Eski HUD kompakt envanter çekmecesi kaldırıldı; `I` ve HUD düğmesi artık
  tam ekranı açar.
- `ea3bd6a`: Ganimet Ekranı Dilimi: `src/game/lootTransaction.ts`, `src/components/BattleLootModal.tsx`, test kancasında
  `openLoot/closeLoot`, saf kural testi (33/33) ve Chromium E2E `battle-loot-screen` (6/6).
- Lojistik ve Erzak Dilimi: `src/game/logistics.ts` (tekil taşıma kapasitesi ve parti hız modeli, sürü cezası, bindirilmiş yaya),
  `src/game/foodSystem.ts` (canlı envanter erzak yığınları, çeşitlilik morali, açlık etkileri), pazar soyut gıda baypasının kaldırılması,
  kural testleri (35/35) ve E2E (6/6). P2 kapısı kapandı.
- **Devam noktası:** P3 — Party (`P`), birlikler ve tutsaklar (Party ekranı, `troopStacks` tek kaynak yapılması, dallanan terfi, yaralılar ve tutsaklar).
  Performans (P7) ve kayıt sistemi (P8) kullanıcı kararıyla hâlâ en sonda.

### P3 — Party (`P`), birlikler ve tutsaklar

- [x] **Party ekranını ve `P` kısayolunu kur:** Sol Dismiss/garnizon/kurtarılan-tutsak bağlamı,
      orta seçili kahraman/birlik 3B modeli, sağ kahramanlar + birlikler + tutsaklar. `P`'nin
      mevcut pause işleviyle çakışmasını kaldır; duraklatma için ayrı erişimi koru.
- [x] **`troopStacks`i tek kaynak yap:** Asker toplama, ücret, savaş zayiatı/yaralı, garnizon ve
      parti gücü yığınlardan türetilsin; eski dört sınıflı `roster` yalnız türetilmiş özet/göç
      uyumluluğu olarak kalsın.
- [x] **Birlik XP ve dallanan terfiyi tamamla:** Savaş/eğitim/Discard XP'si yığına yazılsın;
      hazır asker sayısı, hedef dal seçimi, altın ve normal/savaş atı şartı, bekleyen toplam ödeme,
      `Done/Cancel` ile çalışsın.
- [x] **Yaralı sistemini işlet:** Savaş sonuçları sağlıklı/yaralı ayrımını yazsın; Cerrah/Hekimlik,
      yerleşimde bekleme ve kahraman yaralanması iyileşme hızlarını etkilesin.
- [x] **Tür bazlı tutsakları tamamla:** Kapasite, zamanla hazır olma, devşirme, fidye/satış,
      serbest bırakma, kaçış ve lord tutsaklarının ayrı kaydı/akışı olsun.
- [x] **Garnizon değişimini yığın modeline taşı:** Yerleşim garnizonu tek sayı yerine
      `garrisonRoster`/birlik yığınları kullansın; Party ekranından iki yönlü bekleyen transfer yapılsın.
- [x] **Parti sınırını Bannerlord bileşenleriyle hesapla:** Klan kademesi, İaşeci'nin İdare
      becerisi/perkleri, politikalar ve diğer bonuslar ayrı satırlar hâlinde gösterilsin.
- [x] **P3 kabul kapısı:** Toplamların roster/armySize/güç ile senkronu, terfi/at tüketimi,
      yaralı iyileşmesi, tutsak hazır olma ve garnizon transfer testleri + Party E2E.

### P4 — Karakter gelişimi, perkler ve klan rolleri

- [x] **Kullanım bazlı beceri XP motoru kur:** 18 becerinin oyun eylemlerinden XP kazanımı,
      öğrenme hızı, yumuşak sınır ve sert tavan; beceri artışlarının karakter seviyesini ilerletmesi.
- [x] **Seviye ödüllerini düzelt:** Her seviyede 1 odak, her 4 seviyede 1 nitelik. Odağın beceriye
      anında +10 seviye vermesi ve niteliğin doğrudan HP vermesi gibi eski yan etkileri kaldır.
- [x] **`CampaignHero`yu tek gelişim kaynağı yap:** Oyuncu için eski `attributes/skills/perks`
      alanlarıyla çift yönlü senkron yerine kahraman kaydı esas alınsın; kayıt göçü korunarak
      eski alanlar aşamalı kaldırılsın.
- [x] **Karakter ekranını yenile:** Oyuncu/eş/aile/yoldaş okları; XP çubukları, öğrenme hızı,
      yumuşak/sert sınır ve seviye ilerlemesi seçili kahramana göre gösterilsin.
- [x] **Tam perk kataloğu ve etkilerini uygula:** 25'li eşiklerde çift seçenekler; kişisel,
      kaptan, parti lideri, klan rolü ve vali kapsamları gerçek hesaplara bağlansın. Eski serbest
      metin perkleri katalog kimliklerine göç ettirilsin.
- [x] **Klan rollerini gerçek hesaplara bağla:** İaşeci/Cerrah/İzci/Mühendis etkileri atanan
      kahramanın beceri/perklerinden gelsin; rol boşsa parti lideri kullanılsın. Rol atama arayüzü
      kahraman kimliğiyle çalışsın.
- [x] **P4 kabul kapısı:** XP eğrileri, sınır/hız, seviye ödülleri, bütün perk etkilerinin en az
      birer invariant testi ve rol değiştirme sonuçları.

### P5 — Harita HUD'ı ve gün içi zaman

- [ ] **Kısayolları Bannerlord sırasına getir:** Ansiklopedi `N`, Karakter `C`, Envanter `I`,
      Party `P`, Görevler `J`, Klan `L`, Krallık `K`. Klan ve görev ekranlarını kendi girişlerine taşı.
- [ ] **Gün içi saati gerçekten ilerlet:** Gün kesri, mevsim/yıl ve gece-gündüz kadranı aynı saat
      kaynağından türetilsin; sabit saat 9 ve sabit yıl 1084 gösterimi kalksın.
- [ ] **Sağ alt kaynak şeridini düzelt:** Dinar, nüfuz, sağlık, asker mevcut/kapasite, erzak ve
      moral; genişletilmiş görünümde hız, sağlıklı/yaralı, tutsak ve günlük değişimler olsun.
- [ ] **Hesap dökümü tooltip'leri ekle:** Altın gelir/gideri, nüfuz kaynakları, iyileşme hızı,
      kapasite bileşenleri, erzak tüketimi/çeşitliliği, moral bileşenleri ve hız bileşenleri.
- [ ] **P5 kabul kapısı:** Klavye ile bütün ekranların açılıp kapanması, saat ilerlemesi ve her
      tooltip toplamının ana değerle tutması için E2E/kural testleri.

### P6 — Büyük kampanya sistemleri

- [ ] **Yoldaş yaşam döngüsünü tamamla:** Meyhanelerde gezgin üretimi ve işe alma, ücret/ilişki,
      savaşta yer alma, ayrı parti/kervan/valilik/görev atamaları, ayrılma ve ölüm durumları.
- [ ] **Oyuncu ailesini kur:** Evlilik teklifi ve eş kaydı, çocuklar, yaşlanma, ölüm ve varisle
      devam; aile üyeleri karakter/envanter/Party ekranlarında yönetilebilsin.
- [ ] **Şehir ekonomisini kalıcı yap:** Yerleşim üretimi/tüketimi/stoğu ve fiyatları tek modelde;
      köy girdileri, şehir talebi, kervan hareketleri ve kıtlık fiyatları birbirini etkilesin.
- [ ] **Atölyeleri girdi-çıktı modeline taşı:** Yerleşim başına çoklu atölye kaydı; sahip, tür,
      sermaye, hammadde alımı, ürün satışı, ücret ve günlük net gelir aynı hesaptan gösterilsin.
- [ ] **Yoldaş kervanlarını ekle:** Kurulum maliyeti, lider/koruma, harita partisi olarak hareket,
      şehirler arası alım-satım, masraf, savaş/kaybolma riski ve gelir raporu.
- [ ] **Krallık ve klan modelini tek kaynağa indir:** Ansiklopedi ile Divan aynı `clanId`, ad,
      üye ve tımar verisini kullansın. Yerleşimlere `ownerClanId` atanıp klan tımar toplamları
      krallık toplamıyla birebir tutsun.
- [ ] **Nüfuz/politika/ordu akışını tamamla:** Oyuncu nüfuz kazanımı/harcaması, politika teklif
      ve oylama etkileri, tımar seçimleri, nüfuzla ordu toplama, uyum (cohesion), ortak hareket
      ve ordu erzağı canlı kampanyada çalışsın.
- [ ] **Canlı isyanları birleştir:** Sadakat/erzak baskısı isyan partisi/klanı doğursun; fetih,
      taraf değiştirme ve restorasyon akışları tek klan/yerleşim modelini kullansın.
- [ ] **Kuşatma kampanyasını tamamla:** Kamp kurma süresi, iki tarafın makine düellosu,
      rezerve çekme/konuşlandırma, sur hasarı, yerleşim erzağı ve garnizon açlığı, teslim
      müzakeresi; oyuncu ve AI aynı zamanlı kuralları kullansın.
- [ ] **Parça bazlı demirciliği kur:** Malzeme kademeleri, eritme/arıtma, dayanıklılık/enerji,
      parça şemaları ve parça seçiminden türeyen istatistikler, siparişler ve silaha isim verme.
      Üretilen eşya P1 tanım/yığın modeline girsin.
- [ ] **Suç ve arka sokakları ekle:** Krallık bazlı suç seviyesi ve azalması, giriş/ilişki
      sonuçları; şehir çetelerini temizleyip Serserilik sahibi yoldaşla arka sokak işletme,
      haydutları zorla/ikna ile katma yolları.
- [ ] **Görevleri kalıcı örnek modeline taşı:** Kabul/red, ilerleme ve ödül durumu seferde
      saklansın; ileri gelen güç/ilişkisi görev ve asker toplama sonuçlarını etkilesin. Görev
      türleri sürü teslimi, eğitim, esir kurtarma, kervan koruma, haydut sığınağı, turnuva ve
      vergi tahsilatıyla genişletilsin.

## 3. Bilinen hatalar ve veri doğruluğu

Bu bölümdeki işler, ilgili P paketine bağlanarak kapatılmalıdır; ana sıra değişmez.

### Karşılaşma ve diyalog

- [ ] Haydut teslimiyetinde haydut partisinin `roster`, `armySize` ve gücünü kaldır/düşür;
      aynı partiden tekrar esir/altın ödülü alınamaz invariantını üretim yolunda test et.
- [ ] Oyuncu teslimiyetindeki erzak tabanı, erzak 4'ün altındayken net erzak kazancı üretmesin;
      kayıp kurallarını açıkça tanımlayıp test et.
- [ ] Karşılaşma sınıflandırmasını yalnız güç oranına değil teması kimin başlattığına bağla;
      kovalama/kaçma eşiklerini tek tabloda birleştir.
- [ ] `checkHostileMapInterception` ya üretim yakalama döngüsünde kullanılsın ya da kopya mantık
      kaldırılıp üretim yolu doğrudan test edilsin.
- [ ] `conversation.ts#heroFromLord`, meslek/cinsiyet/sancak rengini kanonik lord/kahraman
      verisinden alsın; 40 lordun tamamı için tablo testi yazılsın.

### Ansiklopedi ve fog-of-war

- [ ] Lordla ilk diyalog tanışmayı açsın: `metHeroIds`e ekleme ve `probe-fog` eklenmeli.
      (Yeni seferde sıfırlama ve kayıtla saklama zaten çalışıyor.)
- [ ] Bağımsız/haydut klanında sahte “Krallık” kartı yerine tıklanamayan `Statü: Bağımsız`
      gösterilsin.
- [ ] Kahraman detayında ilişki, meslek ve savaş durumunun iki kez gösterilip gösterilmediğini
      güncel arayüzde ölç; kalan tekrarları kaldır ve dedup probuna ekle.
- [ ] Krallık sayfasındaki gereksiz `totalMembers > 0 ? clanIds.length : 0` koşulunu sadeleştir.
- [ ] Ulaşılamaz “Faz 2'de gelecek” yer tutucusunu ve emoji metnini kaldır; varsayılan dal
      standart boş-durum bileşenini döndürsün.

### Ekonomi ve harici servis

- [ ] 400 günlük soak sonucunu güncel kodla yeniden ölç ve pasif altın birikimi, erzak tükenmesi
      ile moral tabanını hedef aralıklara kalibre et.
- [ ] `server.ts` içindeki geçersiz `gemini-3.8-flash` kimliğini desteklenen modelle değiştir;
      model yapılandırmasını ortam değişkenine al, `aiPowered` durumunu arayüzde göster ve
      anahtarsız/hatalı durumda deterministik fallback'i loglayarak test et.

## 4. Erişilebilirlik ve arayüz tutarlılığı

- [ ] Ortak `<Modal>` altyapısı kur: Ansiklopedi, diyalog, karakter yaratıcı ve savaş hazırlığı
      dahil bütün modallarda `role="dialog"`, `aria-modal`, etiket, ilk odak, odak tuzağı,
      `Esc` ve gövde kaydırma kilidi aynı davransın.
- [ ] İkon-only düğmelere gerçek `aria-label` ekle; yalnız `title`a güvenme.
- [ ] 8–9 px metinleri tek tek gözden geçir; bilgi taşıyan metinde tabanı 10 px'e çıkar.
- [ ] Ansiklopedi arama sonuçlarında `↑/↓/Enter` gezinmesi ve `aria-activedescendant` ekle.
- [ ] Yeni P2 ekranlarından başlayarak ortak renk/Panel tasarım token'larını çıkar; mevcut
      ekranlardaki sabit hex renkleri ve emoji/glif ikonlarını kademeli olarak token + SVG/Lucide
      sözlüğüne taşı.

## 5. İçerik, görsel ve ses genişletmeleri

Bunlar P2–P6 çekirdeğini bölmeden, ilgili paketlerin kabul kapılarından sonra ele alınacak
birikimdir.

- [ ] Eşya kataloğunu dengeli kademe/slot dağılımıyla 60'tan en az 120 tanıma çıkar; her tanımda
      sayısal stat ve SVG ikon bütünlüğünü prob ile doğrula.
- [ ] Kişilik, ilişki bandı, savaş durumu ve kültüre göre diyalog içeriğini genişlet; ikna
      aşamalarına ayrı argüman setleri ve takasa eşya/tımar/barış vaadi seçenekleri ekle.
- [ ] BannerForge yay geometrisini mevcut kiriş/nok mekaniğine hizala; yanlış hizalanmış kiriş
      regresyonu için yakın-plan render ve prob ekle.
- [ ] BannerForge at üreticisini oyuncu `WarHorseRig`ini bozmadan kalabalık süvari sahnelerinde
      kullanmayı ölçerek entegre et.
- [ ] 22 ekipmanlık BannerForge kataloğunu gösteren 360° vitrin/inceleme görünümünü P2 mankeni
      üzerine kur; ayrı ve bakımsız ikinci bir vitrin motoru oluşturma.
- [ ] BannerForge gövdesine geçişi ancak zırh oturması, animasyon ve üçgen/draw-call ölçümleri
      mevcut gövdeden daha iyi ise yap.
- [ ] Ortak parşömen/Panel yüzey dili, ansiklopedi ve yerleşim illüstrasyonları, yerleşim
      menüsünün haritayı görünür bırakan yerleşim alternatifi için görsel prototipi gerçek
      ekran görüntüleriyle karşılaştır.
- [ ] Harita atmosferini güçlendir: skybox/bulut, sis, gölge/aydınlatma ve P5 saatiyle uyumlu
      şafak/öğle/akşam geçişleri.
- [ ] Vuruş hissini ölçülü ekle: hit-stop, ekran sarsıntısı ve havuzdan beslenen kıvılcım/
      kalkan kırılması efektleri; kare başına yeni tahsis yaratma.
- [ ] Harita, savaş ve yerleşim için geçişli müzik katmanları ile kuş/rüzgâr/şehir ortam seslerini
      prosedürel veya lisansı doğrulanmış kaynaklarla ekle.

## 6. Teknik borç ve test kapsamı

- [ ] `tsc --noUnusedLocals --noUnusedParameters` ile ölçülen **85 kullanılmayan sembolü**
      (2026-10-22: 74'ü `src/`, 11'i `scripts/`+`tools/`) temizle ve bu kontrolleri kademeli
      olarak kalıcı kapıya al; `strict` durumunu da aynı turda yeniden değerlendir. App'teki ölü
      prewarm import/state'i, bileşenin arenadaki gerçek kullanımını koruyarak kaldır.
- [ ] `App`, `WorldCanvas`, `CharacterArenaView`, `SettlementModal` gibi god-component'leri
      davranış değiştirmeden hook/modüllere böl; her bölmede ilgili prob ve `verify:fast` çalıştır.
- [ ] Probe'lardaki `as never` kullanımlarını tipli prop fikstürleriyle değiştir.
- [ ] Büyük bileşenlere üretim yolu duman/E2E kapsamı ekle: `CharacterArenaView`, `WorldCanvas`,
      `KingdomManagementModal`, `DiplomacyModal`, `CharacterCreatorModal`, `BattlePrewarmModal`
      ve SettlementModal'in bütün sekmeleri.
- [ ] Doğrudan `?scenario=encyclopedia` açılışındaki hazır-olma zaman aşımının kök nedenini bul;
      çalışan `boot + openEncyclopedia()` E2E yolunu bozmadan senaryo yolunu da kapsa.
- [ ] Eski araştırma belgelerindeki tarihî durum sayılarının güncel sanılmasını önlemek için
      her birinin başına arşiv tarihi ve bu dosyaya bağlantı eklenip eklenmeyeceğini topluca gözden
      geçir; araştırma içeriğini silme.

## 7. Karar bekleyen ürün önerileri

Bu maddeler eski yol haritasındaki önerilerdir; kullanıcı onayı olmadan uygulamaya alınmaz.

- [ ] 5 adımlı öğretici (tutorial) isteniyor mu?
- [ ] Ses/grafik/kontrol ayarları ekranı isteniyor mu?
- [ ] Türkçe dışında yerelleştirme altyapısı isteniyor mu?
- [ ] İsteğe bağlı ve varsayılanı kapalı telemetri isteniyor mu?
- [ ] Depoya hangi lisansın ekleneceği seçilecek mi?

## 8. P7 — Performans testleri (sondan bir önceki iş)

- [ ] Aynı tohum ve senaryolarla açılış, harita, envanter/pazar, Party, karakter ve savaş
      sahnelerinde tekrarlanabilir ölçüm paketi kur: frame-time/FPS yüzdelikleri, bellek,
      yükleme süresi, draw call ve üçgen sayıları.
- [ ] SwiftShader sonuçlarını gerçek GPU FPS'i olarak sunma; yalnız göreli öncesi/sonrası
      karşılaştırma tablosunu bu dosyaya işle.
- [ ] Ölçüme dayanarak kod bölme (`React.lazy`/dinamik import), ilk paket boyutu ve sıcak
      döngü tahsislerini optimize et; hedefleri ölçümden önce değil baz çizgisinden sonra koy.

## 9. P8 — Kayıt yönetimi (en son iş)

- [ ] Kapsamı uygulamadan hemen önce kullanıcıyla netleştir: çoklu sefer/slot, adlandırma,
      üzerine yazma/silme, otomatik kayıt rotasyonu ve kayıt özeti.
- [ ] Bannerlord tarzı kayıt/yükleme ekranını, bozuk kayıt kurtarma ve eski sürüm göçleriyle
      birlikte uygula. P2–P7 sırasında yalnız veri uyumluluğunu korumak için gereken göçler yapılır.

## 10. Kaynak belgeler

| Belge | Rolü |
| --- | --- |
| `AGENTS.md` | Kısa proje hafızası, komutlar ve bozulmaması gereken kurallar |
| `docs/EKSIKLER_VE_HATALAR.md` | 2026-10-21 tarihli kanıtlı denetim arşivi |
| `docs/ANSIKLOPEDI_VE_UI_PLANI.md` | Ansiklopedi/UI uygulama günlüğü ve ekran referansları |
| `docs/ARMORY_STUDIO_INCELEME.md` | BannerForge zip'i, entegrasyon durumu ve ölçümler |
| `docs/BANNERLORD_KARSILASTIRMA_VE_PUANLAMA.md` | Tarihî karşılaştırma/karne ve eski yol haritası |
| `docs/BANNERLORD_COMPLETE_SYSTEMS_ENCYCLOPEDIA.md` | Bannerlord sistem araştırma özeti |
| `docs/BANNERLORD_MAP_SYSTEM_RESEARCH.md` | Harita/hız/görüş araştırma ve formülleri |
| `docs/BANNERLORD_SETTLEMENT_MENUS_RESEARCH.md` | Yerleşim menü araştırması |
| `docs/PAZAR_VE_HARITA_ARASTIRMASI.md` | Pazar/HUD araştırma ve karar notları |
| `docs/BANNERLORD_MAKRO_SIMULASYON_KAYNAK_RAPORU.txt` | Makro-simülasyon kaynak raporu |
| `tools/e2e/README.md` | Gerçek tarayıcı E2E kurulumu ve çalıştırma |

## 11. Korunan dosyalar ve ekran görüntüleri

- `workspace-01a15ba3-f746-7506-9ce7-4057d8bad525.zip` **silinmez**: özgün BannerForge
  kaynaklarını ve 25'ten fazla referans ekran görüntüsünü içerir; önceki kullanıcı talimatı da
  zip'in repo içinde kalması yönündedir.
- `docs/renders/reference/` altındaki Bannerlord referans görüntüleri **korunur**; P2/P3/P5
  ekranları yapılırken kullanılacaktır.
- `docs/renders/` altındaki kendi ekran görüntülerimiz benzersiz kareler veya belgelerde/problarda
  referans verilen görsel kanıtlar olduğu için korunur. Yalnız birebir aynı dosya veya tam
  çözünürlüklü kaynağı duran, referanssız bir kırpma silinebilir.
- Araştırma belgeleri yalnız tarihî oldukları için silinmez; güncel görev durumu bu dosyadan izlenir.

## 12. 2026-10-22 temizlik kaydı

- [x] Bütün MD belgeleri, kod TODO işaretleri, GitHub Issue/PR listeleri ve bilinen denetim
      bulguları tarandı; açık işler bu tek dosyada toplandı.
- [x] Takip edilen 190 dosyada birebir aynı içerikli kopya bulunmadığı hash ile doğrulandı.
- [x] Kullanılmayan ikinci paket kilidi `bun.lock` silindi; npm tek kurulum yolu olarak bırakıldı
      ve paket adı `react-example` yerine `kadirlord` yapıldı.
- [x] `docs/renders/equip-fixed.png` tam şeridi korunurken onun referanssız sol kırpması olan
      `equip-helmet-crop.png` silindi. Diğer ekran görüntüleri benzersiz/referanslı olduğu için korundu.
- [x] Uzantısız makro-simülasyon metni, çalışmayan bir `public` varlığı olmaktan çıkarılıp
      içeriği korunarak `docs/BANNERLORD_MAKRO_SIMULASYON_KAYNAK_RAPORU.txt` adına taşındı.
- [x] README, AI Studio şablonu olmaktan çıkarılıp proje, kontroller, doğrulama ve belge
      haritasını anlatan Türkçe proje README'sine çevrildi.
