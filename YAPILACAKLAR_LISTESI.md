# Kadirlord — Birleştirilmiş Tüm Görevler, Tamamlananlar (`[x]`) ve Açık İşler (`[ ]`)

> **Son Konsolidasyon:** 2026-10-22 (`d929f6f` — Canlı Kuşatma, Çoklu Lord Yarım Ay Dizilimi ve Ordu/Bütünlük Sistemleri Sonrası)
> **Kapsam:** Bu dosya; eski `YAPILACAKLAR_LISTESI.md`, `docs/CURSOR_ZOR_GOREVLER.md`, `docs/EKSIKLER_VE_HATALAR.md`, **Steam Bannerlord Türkçe Detaylı Tam Rehberi (`id=2046201799` — 17 Bölüm + SSS)** ve **6 Ana Ekranın (Şehir/Köy/Kale, Harita HUD, Envanter, Pazar, Diyalog/Lord, Parti/Karakter/Krallık) Görsel/Mekanik Denetimi** içindeki **TÜM görevlerin birleştirilmiş tek kaynağıdır**.
> **Doğrulama Prensibi:** Her madde gerçek kod tabanında (`src/game/` ve `src/components/`) kontrol edilerek gerçekten tamamlanmış olanlar `[x]`, eksik/yarım/görsel olarak hatalı olanlar `[ ]` olarak işaretlenmiştir.
> **⚠️ 2026-10-24 denetimi:** Bazı `[x]` maddelerin sayı/formül ve doğrulama bakımından Bannerlord'a uymadığı (ve `verify:fast`in kırmızı olduğu) kod kanıtıyla tespit edildi; düzeltmeler **Bölüm 6 (10.1–10.11)** altında takip edilir. Ayrıntı: [`docs/DENETIM_2026-10-24_YAPILANLAR_VE_SAVAS_MEYDANI.md`](docs/DENETIM_2026-10-24_YAPILANLAR_VE_SAVAS_MEYDANI.md).

---

## ✅ BÖLÜM 1 — KOD TABANINDA TAMAMLANMIŞ VE DOĞRULANMIŞ GÖREVLER (`[x]`)

### 1.1. Altyapı, Veri Temeli ve Kayıt/Zaman Düzeltmeleri (`P0` – `P1` & `Faz 10`)
- [x] **Hız Paketi ve E2E Altyapısı (`AGENTS.md`, `src/game/testHarness.ts`, `tools/e2e/`):** Deterministik test kancası (`window.__kadirlordTest`), repo içi Chromium/Puppeteer E2E ve kademeli `verify:fast` / `verify:all` komutları.
- [x] **Bannerlord P0 Mimari Kararları:** Tam ekran üç sütun düzen (`Envanter / Pazar / Parti / Ganimet`), bekleyen transfer (`Pending Transfer`) + atomik `Bitti / Vazgeç (Done / Cancel)`, Bannerlord Discard/perk modeli ve kültür birlik ağaçları.
- [x] **Bannerlord P1 Veri Temeli (`src/game/bannerlordFoundation.ts`, `src/game/saveGame.ts`):** Sayısal stat'lı eşya tanımları, adetli/kilitli yığınlar (`InventoryItem`), tanım kimliğine bağlı ekipman (`BATTLE` / `CIVILIAN`), gerçek oyuncu/yoldaş kayıtları (`CampaignHero`), XP/yaralı alanlı birlik (`troopStacks`) ve tutsak (`prisonerStacks`) yığınları; kayıt biçimi `v4` ve `v1–v3` göçü (`ensureBannerlordFoundation`).
- [x] **A1 — Kayıt / Yükleme Sistemi Temeli (`src/game/saveGame.ts`, `src/components/BannerlordPauseModal.tsx`):** `localStorage` üzerinde sürüm numaralı kayıt/yükleme ve duraklatma menüsü (`probe-save.ts`).
- [x] **A2 — Modal Zaman Yönetimi Tutarsızlığının Giderilmesi (`src/game/uiSession.ts`, `src/App.tsx`):** Modallar açılırken zamanın duraklatılması ve kapandığında önceki hıza (`prevSpeed`) geri dönmesi (`probe-ui-session.ts`).
- [x] **A4 — Pazarın Yalnızca Yerleşkeye Girildiğinde Açılması (`src/App.tsx`):** `canTrade={!!activeSettlementModal}` kuralı ile haritada sadece yakınından geçerken pazarın açılması engellendi.

### 1.2. Envanter, Discard, Pazar, Ganimet ve Lojistik (`P2`)
- [x] **Saha Envanteri (`I`) Tam Ekran 3 Sütun Düzeni (`src/components/InventoryModal.tsx`):** Sol `DISCARD` sütunu, ortada 360° döndürülebilir `HeroMannequin` + kuşanılmış binek ve 12 ekipman slotu, sağda Parti Envanteri; `< Kahraman >` geçiş okları, `Savaş Seti / Sivil Set` sekmeleri ve sayısal zırh/hasar özeti.
- [x] **Canlı Ekipman Kuşanma/Çıkarma Çekirdeği (`src/game/bannerlordFoundation.ts`):** Seçili kahramanın seçili setine (`BATTLE` / `CIVILIAN`) kuşanma, yığından 1 adet düşme, eski parçayı envantere döndürme ve sivil yasallık kontrolü (`probe-equipment.ts`).
- [x] **Discard Bağış ve Birlik XP Dağıtımı (`src/game/bannerlordFoundation.ts`, `InventoryModal.tsx`):** `Paid in Promise` (zırh/koşum) ve `Giving Hands` (silah/kalkan/sadak) perkleriyle atılan eşyaların birliklere kapasite dahilinde XP dağıtması, taşmanın kırmızı gösterilmesi.
- [x] **Şehir Pazarı 3 Sütun ve Kalıcı Stok/Kasa (`src/components/BannerlordMarketModal.tsx`, `src/game/marketTransaction.ts`):** Sol kalıcı şehir stoğu (`Settlement.marketStock`), kalıcı tüccar kasası (`merchantGold`), adetli alım/satım (`Tık=1, Shift=5, Ctrl=Tümü`), kalıcı kilit (`locked`), kategori/arama/sıralama, ortalama fiyat renkleri ve ziyaret edilmiş şehir ticaret söylentileri (`Trade Rumors`).
- [x] **Savaş Sonrası Ganimet Ekranı (`src/components/BattleLootModal.tsx`, `src/game/lootTransaction.ts`):** Sol ganimet, orta 3B manken + Discard/kapasite özeti, sağ parti envanteri; `Tümünü Al / Tümünü Bırak`, ganimeti doğrudan Discard XP'sine bağışlama ve atomik `Bitti / Vazgeç` (`probe-loot.ts`).
- [x] **Tekil Lojistik ve Harita Hızı Modeli (`src/game/logistics.ts`):** Taşıma kapasitesi (`taban 40 + sağlıklı asker×20 + yedek binek×20 + yük hayvanı×100 + pack_mules +%20`) ve harita hızı (`ordu boyutu, süvari oranı, bindirilmiş yaya bonusu, aşırı yük cezası, sürü cezası / herd penalty, yaralı/tutsak sürtünmesi ve arazi çarpanları`).
- [x] **Canlı Erzak Yığınları ve Yemek Çeşitliliği (`src/game/foodSystem.ts`):** Alınan yiyeceklerin doğrudan `inventoryItems` yığınlarına işlenmesi, günlük round-robin erzak tüketimi, `1..5+` çeşit gıda için `0..+12` çeşitlilik morali ve açlık cezaları.

### 1.3. Parti (`P`), Birlik Ağaçları, Yaralılar, Tutsaklar ve Garnizon (`P3`)
- [x] **3 Sütunlu Parti Ekranı ve `P` Kısayolu (`src/components/PartyModal.tsx`, `src/game/partySystem.ts`):** Sol sütunda Garnizon Transferi veya Kapasite/Tutsak Dökümü, orta sütunda 3B `HeroMannequin` + seçili birlik/kahraman istatistikleri ve terfi dalları, sağ sütunda Kahramanlar + Muvazzaf Birlikler + Tutsaklar (`Bitti / Vazgeç` atomik taslak).
- [x] **`troopStacks` Tek Kaynak ve Kültür Birlik Ağaçları (`src/game/bannerlordFoundation.ts`):** 6 kültürün `Tier 1..5` dallanan piyade/okçu/süvari ağaçları, terfi XP'si, altın ve `HORSE` / `WAR_HORSE` binek gereksinimi (`probe-troops.ts`).
- [x] **Yaralı İyileşme ve Tür Bazlı Tutsak Sistemi (`src/game/partySystem.ts`):** Savaş sonrası sağlıklı/yaralı ayrımı, Cerrah/Hekimlik ve yerleşimde bekleme iyileşme hızları; tutsak kapasitesi, zamanla devşirmeye hazır olma (`conformity`), fidye/satış ve serbest bırakma.
- [x] **Garnizon Yığın Transferi ve Parti Sınırı Dökümü (`PartyModal.tsx`):** Yerleşim garnizonu ile oyuncu partisi arasında iki yönlü birlik yığını transferi; Klan Kademesi + İaşeci (İdare) + Liderlik + Nam parti kapasite dökümü.
- [x] **Eşraf (Notable) 6 Yuvalı Asker Toplama Ekranı (`src/components/BannerlordRecruitmentModal.tsx`, `src/game/recruitment.ts`):** Yerleşim eşraflarının yan yana 6 asker yuvası (`[0, 0, 5, 10, 15, 20]` ilişki kilidi), `Tümünü Topla` ve atomik ödeme (`probe-recruitment.ts`).

### 1.4. Karakter Gelişimi, Perk Kataloğu ve Klan Rolleri (`P4`)
- [x] **Kullanım Bazlı 18 Beceri ve 6 Nitelik Motoru (`src/game/characterDevelopment.ts`):** `VIG, CTR, END, CNG, SOC, INT` nitelikleri ve 18 beceri, Odak puanları (`0..5`), yeşil **Öğrenme Sınırı (`Learning Limit`)** ve **Öğrenme Hızı (`Learning Rate`)** formülleri, her seviyede 1 odak ve her 4 seviyede 1 nitelik puanı (`probe-character-development.ts`).
- [x] **Karakter Ekranı ve Perk Ağacı (`src/components/CharacterModal.tsx`, `src/game/perks.ts`):** `< Kahraman >` geçiş okları, XP ilerleme çubukları, 25'li eşiklerde çift seçenekli tam Perk Kataloğu (`PERK_CATALOG`) ve 4 Klan Rolü (`QUARTERMASTER / İaşeci, SCOUT / İzci, SURGEON / Cerrah, ENGINEER / Mühendis`) atama arayüzü.

### 1.5. Canlı Kuşatma Sistemi ve Ordu / Bütünlük (`GÖREV 1` & `GÖREV 2`)
- [x] **Canlı Kuşatma Kampı, Makine Düellosu ve Sur Gediği (`src/components/SiegeEncounterModal.tsx`, `src/components/WorldCanvas.tsx`, `src/game/worldSim.ts`, `src/game/siegeEncounter.ts`):**
  - Haritada 3D kuşatma çadırları, siper kazıkları, ateş/duman efektleri ve kaleye bakan **4 Menzilli + 2 Yakın Dövüş + 4 Savunma Kulesi** interaktif 3D makine yuvası.
  - Gerçek Bannerlord **Sol Dikey Kuşatma Menüsü (`~360px`)** + **Üst Orta İki Sancaklı Kuşatma Barı** (Garnizon/Milis, Surlar, Erzak, Kuşatan Güç).
  - **Rezerveye Çek (`Move to Reserve`)** mekaniği, karşılıklı topçu düellosu, **Sur Gediği (`Breach`)** açılması ve garnizon açlığı.
  - 3 Bağlamlı etkileşim: *Kuşatan (`attacker`)*, *Dışarıdan Yardıma Gelen (`outsider` — kuşatanlara saldır / zayiat vererek kaleye sız)* ve *İçeride Savunan (`defender` — Huruc / Sally Out, Pusu / Ambush, Çemberi Yarıp Kaç)* (`probe-siege-encounter.ts`).
- [x] **Çoklu Lord Yarım Ay (`Half-Moon Arc`) Kuşatma Dizilimi ve Yardım (`DEFEND`) AI (`src/game/worldSim.ts`, `src/game/campaignSystem.ts`, `src/components/WorldCanvas.tsx`):**
  - Birden fazla lord aynı kaleyi kuşattığında kalenin içine girmek yerine surların dışında yarım ay yayında (`23m` yarıçap) dizilmesi ve birleşik kuşatma gücü hesabı.
  - Dost lordların kuşatma altındaki kaleyi algılayıp yardıma (`DEFEND`) koşması ve güç yettiğinde kuşatmayı kırması (`probe-army-and-siege-ai.ts`).
- [x] **Ordu Yönetimi (`Army Management`) ve Bütünlük (`Cohesion`) (`src/components/ArmyModal.tsx`, `src/game/armySystem.ts`, `src/components/GameHud.tsx`):**
  - Nüfuz harcayarak (klan partileri için `0 Nüfuz`) ordu toplama, 6 sütunlu sıralanabilir birlik tablosu, 4 sütunlu portre ızgarası, **Bütünlük (`Cohesion`)** barı ve `[+10]` nüfuzla artırma, `[Orduyu Dağıt]` butonu ve HUD sağ-alt genişletilebilir Ordu çubuğu.

---

## 🛠️ BÖLÜM 2 — YAPILACAKLAR: EKRAN EKRAN VE SİSTEM SİSTEM TÜM AÇIK GÖREVLER (`[ ]`)

> Aşağıdaki maddeler **ADIM 1'den ADIM 7'ye kadar sırayla ve ayrı ayrı** kodlanacak, her adım sonunda test + Chrome ekran görüntüsü (SS) ile doğrulanacaktır.

---

### ADIM 1 — Şehir / Kale / Köy Ekranı (`SettlementModal.tsx`) ve Harita Yerleşim Etiketleri (`WorldCanvas.tsx`)

- [x] **1.1. Şehir/Kale/Köy Ekranını Gerçek Bannerlord "Sol Dikey Menü + Arka Planda Canlı 3D Harita" Düzenine Çevir (`SettlementModal.tsx`):**
  - **Mevcut Hata:** Şu an yerleşime girildiğinde arka plandaki 3D haritayı tamamen kapatan dev bir siyah pencere (`max-w-5xl bg-[#16120e]`) açılıyor.
  - **Yapılacak:** Kuşatma ekranında olduğu gibi arka planda **3D dünya haritası ve yerleşimin 3D modeli açık kalacak** (`pointer-events-none` kapsayıcı):
    - **Üst Sol Şerit:** Krallık sancağı + Yerleşim adı + 6 istatistik ikonu (*Sur Seviyesi, Refah, Milis, Garnizon, Gıda, Sadakat/Güvenlik*) ve altlarında yeşil/kırmızı günlük `+/-` değişim.
    - **Üst Orta Şerit:** Yerleşimde bulunan lord birlikleri ve atölye rozetleri.
    - **Üst Sağ Şerit:** Yerleşimdeki **Eşraf (`Notables`) ve Yoldaşların portre kutuları** (aktif görevi olanın sağ üstünde **mavi `!` ünlem rozeti**).
    - **Sol Dikey Aksiyon Paneli (`~350px`):** Üstte atmosferik durum metni, ortada ikonlu menü satırları (`Kaleye Git`, `Taverna Bölgesine Git`, `Arenaya Git`, `Asker Topla`, `Ticaret Yap`, `Şehri/Kaleyi Yönet`, `Burada Bir Süre Bekle`, `Ayrıl`), altta mekana göre sahne illüstrasyonu.
- [x] **1.2. Harita Üzerindeki Köy/Şehir Etiketlerine Hammadde Üretim İkonu Ekle (`WorldCanvas.tsx`):**
  - Köylerin harita isim etiketlerinin yanında o köyün ürettiği hammadde ikonu (*Tahıl, Demir, At, Balık, Üzüm, Zeytin, Koyun/Yün, Keten, Kil, Kereste*) gösterilecek; üzerine gelince (tooltip) bağlı olduğu şehir, refah ve üretim bilgisi açılacak.
- [x] **1.3. Eşraf (`Notable`) Mavi `!` Görev Rozeti ve Kilitli Asker Slotu Bağlantısı (`SettlementModal.tsx`, `quests.ts`, `BannerlordRecruitmentModal.tsx`):**
  - Eşraf portresindeki mavi `!` işaretine tıklayınca o eşrafın görevinin açılması, tamamlandığında eşraf ilişkisinin (`relation`) artması ve `Asker Topla` ekranındaki kilitli üst kademe yuvaların (`+5, +10, +15, +20` ilişki) açılması.

---

### ADIM 2 — Harita Alt HUD (`GameHud.tsx`), Gün İçi Zaman (`P5`) ve Karakter Oluşturma Kültür/Zorluk Adımı (`CharacterCreatorModal.tsx`)

- [x] **2.1. Sol Alt 7'li Bannerlord Menü Çerçevesi ve Kısayol Sırası (`GameHud.tsx`):**
  - Sol altta Bannerlord'un 7 ana ikonu (`1-Sefer Menüsü [ESC], 2-Karakter [C], 3-Envanter [I], 4-Parti [P], 5-Görevler [J], 6-Klan [L], 7-Krallık [K]`) tek metal çerçevede dizilecek; `Klan [L]` ve `Görevler [J]` kendi sekmelerine açılacak, `Ansiklopedi [N]` ayrı erişimde olacak.
- [x] **2.2. Sağ Alt Kaynak Şeridine Eksik `#19 Günlük Maaş` ve `#21 Aç/Kapat (▲/▼)` Butonu Ekle (`GameHud.tsx`):**
  - Steam rehberindeki 21 HUD elemanından eksik olan **#19 Günlük Asker Maaşı (`Daily Troop Wage`)** ve sağ alt paneli daraltıp genişleten **#21 Aç/Kapat (`▲/▼`) ok butonu** eklenecek; **#20 Ordu (`Army`)** barı sağ alt köşeye hizalanacak.
- [x] **2.3. Sağ Alt İstatistikler İçin Detaylı Hesap Dökümü İpuçları (`Tooltips #11–#18`) (`GameHud.tsx`):**
  - Fareyle üzerine gelince **#11 Altın** (vergi/atölye/kervan vs maaş), **#12 Nüfuz** (krallık/bina/ordu besleme), **#13 Can** (baz + Cerrah/Hekimlik + yerleşim), **#14 Birlik** (sağlıklı/yaralı/kapasite dökümü), **#15 Gıda** (tüketim + kaç gün yeteceği + çeşitlilik morali), **#16 Moral**, **#17 Hız** (taban + süvari + binekli piyade - kargo/sürü/arazi) ve **#18 Görüş Mesafesi** (baz + İzcilik + gece/orman) dökümleri açılacak.
- [x] **2.4. Gün İçi Saat ve Gece-Gündüz Kadranı Senkronu (`GameHud.tsx`, `worldSim.ts`):**
  - Gün kesri, mevsim/yıl (`1084+`) ve orta-alt güneş/ay çarkı aynı canlı saat kaynağından ilerleyecek.
- [x] **2.5. Karakter Oluşturma Ekranına 6 Kültür Bonusu, Zorluk Ayarları ve Klan Adı/Sancağı Adımı Ekle (`CharacterCreatorModal.tsx`, `logistics.ts`, `worldSim.ts`):**
  - Steam rehberi Bölüm 2'deki **6 Kültür Bonusu** (*Vlandiya: savaşta +%20 birlik XP; Sturgiya: karda -%20 hız cezası; İmparatorluk: +%20 şehir/sur/kuşatma inşa hızı; Aseray: -%30 kervan kurma bedeli & -%10 ticaret cezası; Kuzait: +%10 atlı harita hızı; Batanya: ormanda -%10 hız cezası*) hem arayüzde gösterilecek hem de oyun matematiğine bağlanacak.
  - **5 Zorluk Ayarı** (*Dost Birlik Hasarı, Dost Parti Hasarı, Oyuncu Hasarı, Asker Toplama Kolaylığı +1/+2 slot, Harita Hızı*) + **Ölüm/Doğum (`Permadeath`)** onay kutusu ve **Klan Soyadı & Sancak Seçimi** eklenecek.

---

### ADIM 3 — Envanter (`InventoryModal.tsx`) ve Pazar (`BannerlordMarketModal.tsx`) Birebir Eşitlemesi

- [x] **3.1. Pazar Ortasındaki Kahraman Seçimini ve Ekipman Slotlarını Envanterle Eşitle (`BannerlordMarketModal.tsx`):**
  - Pazar ekranının orta sütununa da `< Kahraman >` geçiş okları, `Savaş Seti / Sivil Set` seçimi ve 12 kuşanılmış ekipman slotu eklenecek; sağ ekipman şeridinin dar görünümlerde kesilmesi düzeltilecek.
- [x] **3.2. Envanter ve Pazar Satır Okları (`<` / `>`) ile Binek/Yük Hayvanı Özet Rozetleri (`InventoryModal.tsx`, `BannerlordMarketModal.tsx`):**
  - Satırlarda tek tıkla sağa/sola aktarma okları (`<` / `>`), üstte toplam **Binek Atı** (piyade hız bonusu) ve **Yük Hayvanı** (*Katır/Yük Beygiri* `+100 kg` kapasite ve sürü cezası sınırı) göstergeleri eklenecek.
- [x] **3.3. Kârlı Satıştan Ticaret (`Trade`) XP Kazanımı ve Kervan Başı / Şehir Tüccarı İndirimi (`marketTransaction.ts`, `characterDevelopment.ts`):**
  - Satın alınan fiyattan daha pahalıya mal satıldığında edilen kâr üzerinden **Ticaret (`Trade`)** yeteneğine canlı XP yazılacak ve *Kervan Başı / Şehir Tüccarı* perk indirimleri fiyatlara uygulanacak.

---

### ADIM 4 — Diyalog (`DialogueModal.tsx`), Harita Lord İpuçları, Ansiklopedi Konum Takibi ve Takas (`Barter`) Ekranı

- [x] **4.1. Haritada Lord Üzerine Gelince Açılan Detaylı Bilgi Kartı (`WorldCanvas.tsx`):**
  - Haritada bir lordun üzerine gelince: tam unvanı, klanı, krallığı, **şu anki canlı emri** (*"Lochana Kalesi'ni kuşatıyor"*, *"Zeonica'yı savunmaya gidiyor"*, *"Derthert'in Ordusunda"*), **Sağlıklı + Yaralı asker sayısı**, **Esir sayısı** ve **Harita Hızı** gösterilecek.
- [x] **4.2. Ansiklopedide "En Son X Yakınlarında Görüldü" Canlı Konum Takibi ve Diyalogla Tanışma (`EncyclopediaModal.tsx`, `DialogueModal.tsx`):**
  - Ansiklopedide (`N`) her lord ve gezgin için **"En son bugün/X gün önce [Yerleşim] yakınlarında görüldü"** satırı canlı koordinatlardan üretilecek; lordla ilk kez diyalog kurulduğunda `metHeroIds` (tanışma) otomatik açılacak (`A3` hatası çözümü).
- [x] **4.3. Yeşil "Tatmin Olma Çubuğu (`Satisfaction Bar`)" Olan Çift Sütunlu Takas / Pazarlık (`Barter`) Ekranı (`DialogueModal.tsx`, `DiplomacyModal.tsx`):**
  - Gerçek Bannerlord Takas ekranı: **Sol Sütun = Karşı Tarafın Varlıkları**, **Sağ Sütun = Oyuncunun Teklifi (Altın sürgüsü, Eşyalar, Esirler, Tımarlar)**, **Orta = Yeşil Tatmin Olma Çubuğu (`Satisfaction Bar`) + `[El Sıkışma / Otomatik Dengele]` + `[Teklif Et]`** butonları; barış antlaşması, lordu kendi krallığına çekme ve evlilik başlık parası bu ekran üzerinden çalışacak.
- [ ] **4.4. 2 Aşamalı Evlilik İkna (`Persuasion`) Sistemi ve Hanedan / Çocuk Doğumu (`DialogueModal.tsx`, `familyTree.ts`, `worldSim.ts`):**
  - Bekar lord/leydilerle 2 aşamalı ikna sınavı (Cazibe, Onur ve kişilik uyumuna göre başarı yüzdeleri ve 3 olumlu tik toplama), klan lideriyle **Başlık Parası (`Dowry`)** takası, eşin partiye/klana katılması, **37 günlük hamilelik ve çocuk doğumu** döngüsü.

---

### ADIM 5 — Parti (`PartyModal.tsx`), 6 Soylu (`Noble`) T6 Asker Ağacı, Esir Lord İdamı ve Yoldaş Görevlendirmeleri

- [ ] **5.1. 6 Kültürün Soylu (`Noble`) T6 Birim Ağaçları ve "Disiplinci (`Disciplinarian`)" Perki (`bannerlordFoundation.ts`, `notables.ts`):**
  - Kaleye bağlı köylerin güçlü eşrafından çıkan 6 kültürün özel **Soylu (`Noble`) T2–T6** birim hatları (*Sturgiya: Druznik Şampiyonu, Batanya: Fian Şampiyonu, Vlandiya: Sancak Şövalyesi, Kuzait: Kağan'ın Muhafızı, Aseray: Öncü Faris, İmparatorluk: Elit Katafrakt*) eklenecek.
  - Liderlik **Disiplinci (`Disciplinarian`)** perkiyle haydut birimlerin düzenli ordu birimine terfi ettirilmesi sağlanacak.
- [ ] **5.2. Yenilen Düşman Lordları Esir Alma ve Kırmızı "İdam Et (`Execute`)" Butonu (`PartyModal.tsx`, `worldSim.ts`, `rules.ts`):**
  - Savaşta yenilen düşman lordların esir düşmesi ve `PartyModal.tsx` tutsak listesinde esir lordun yanında **kırmızı kuru kafa "İdam Et (`Execute`)"** butonu (onay penceresi + **Onur (`Honor`) kaybı / Zalim özelliği** + diğer lordlarla ağır ilişki cezası + lordun kalıcı ölümü).
- [ ] **5.3. Yoldaş (`Companion`) 5 Lakap Grubu ve 4 Klan Görevlendirmesi (`EncyclopediaModal.tsx`, `KingdomManagementModal.tsx`, `SettlementModal.tsx`):**
  - Ansiklopedide `Gezgin (Wanderer)` filtresi ve 5 uzmanlık grubu (*Savaşçılar, Taktisyenler, İzciler, Doktorlar, Haydutlar*).
  - Yoldaşları **4 farklı göreve** atama: **1) Şehre/Kaleye Vali (`Governor`) Ata**, **2) Ticaret Kervanı Kurdur** (*15.000 / 22.500 Dinar*, haritada gezen kervan partisi ve günlük gelir), **3) Ayrı Klan Partisi Kurdur** (*0 Nüfuz ile orduya çağrılabilen*), **4) Yanına Asker Verip Göreve Gönder**.

---

### ADIM 6 — 11 Resmi Atölye, Paralı Asker Sözleşmesi, Kendi Krallığını Kurma ve Krallık/Klan Veri Tekilleştirmesi

- [ ] **6.1. 11 Resmi Bannerlord Atölyesi (`Workshops`) ve Hammadde Kâr Zinciri (`SettlementModal.tsx`, `rules.ts`, `worldSim.ts`):**
  - Şehirlerdeki 4 basit atölye yerine Bannerlord'un **11 resmi atölyesi** (*Bira Fabrikası, Şarap İmalathanesi, Zeytinyağı Presi, Çömlek Atölyesi, Kadife Atölyesi, Keten Dokuma, Yün Dokuma, Tabakhane, Ahşap Atölyesi, Demirci, Gümüşçü/Kuyumcu*); bağlı köylerin ürettiği hammadde bolluğuna göre günlük net kâr hesabı, atölye türünü değiştirme ve satma.
- [ ] **6.2. Arena Turnuva Bahis (`Betting`) & İpucu ve Taverna Masa Oyunu (`SettlementModal.tsx`):**
  - Arenada **Turnuva Ustası** ile konuşup aktif turnuva olan şehirleri öğrenme, turlarda **kendi üzerine bahis yatırma** ve kazanınca **Nadir Ödül Eşyası + +3 Ün (`Renown`)** alma; Tavernada masa oyunu oynama.
- [ ] **6.3. Klan Seviyesi 1 Paralı Asker (`Mercenary`) Sözleşmesi ve Klan Seviyesi 3 Kendi Krallığını Kurma (`KingdomManagementModal.tsx`, `DialogueModal.tsx`):**
  - **Klan Seviyesi 1:** Krallıklara Paralı Asker olarak katılma, kesilen düşman birliği/nüfuz başına günlük altın ödemesi alma ve ceza almadan sözleşmeden ayrılma.
  - **Klan Seviyesi 3:** *Klan Seviyesi 3 + En az 100 Asker + En az 1 Şehir/Kale* şartlarıyla (*İmparatorluk / Istiana veya Anti-İmparatorluk / Arzagos* seçimiyle) bağımsız **Kendi Krallığını Kurma**.
  - **Krallık Politikaları:** Günlük yüksek nüfuz veren **Kanun Sözcüsü (`Council of the Commons`)** ve **Kutsal Majesteleri (`Sacred Majesty`)** politikalarının nüfuz/sadakat hesaplarına bağlanması.
- [ ] **6.4. Ansiklopedi ve Divan Klan/Tımar Verisini Tek Kaynağa İndir (`A5` & `A6` Hataları — `encyclopedia.ts`, `kingdomSystem.ts`):**
  - Yerleşimlere `ownerClanId` atanarak klan tımar toplamlarının krallık toplamıyla birebir tutması; Ansiklopedi ile Krallık Divanı'nın aynı `clanId`, ad ve üye listesini kullanması; Kuzey/Güney/Batı İmparatorluğu (*Lucon / Rhagaea / Garios*) ayrımının net gösterilmesi.

---

### ADIM 7 — Savaş İçi Birlik Grupları (`1–4`) & Emir Menüsü (`F1–F7`), 7 Kuşatma Silahı ve Kalan Bilinen Hatalar

- [ ] **7.1. Savaş Alanında `1–4` Birlik Grubu Seçimi ve `F1–F7` Taktik Emir Çubuğu (`CharacterArenaView.tsx`, `tacticalFormation.ts`):**
  - `1` Piyade, `2` Okçu, `3` Süvari, `4` Atlı Okçu (ve `0` Tüm Birlikler) grup seçimi; seçili gruba özel `F1` Konum (`Buraya Yürü / Beni Takip Et / Hücum / Geri Çekil`), `F2` Yön, `F3` Ateş Serbest/Kes, `F4` Formasyon (*Çizgi, Kalkan Duvarı, Dağınık, Kama, Çember*) emirleri ve üst-sol görsel emir kartları.
- [ ] **7.2. 7 Kuşatma Silahı (`Ateşli Balista` & `Ateşli Mancınık`) ve Harita "Surlar Çatırdadı!" Bildirimi (`siegeEncounter.ts`, `SiegeEncounterModal.tsx`, `WorldCanvas.tsx`):**
  - Kuşatma silahı kataloğuna **Ateşli Balista (`FIRE_BALLISTA`)** ve **Ateşli Mancınık (`FIRE_MANGONEL`)** eklenerek 7 kuşatma makinesinin tamamlanması; kuşatma sırasında sur canı sıfırlandığında harita ekranında **"Surlar çatırdadı! Gedik açıldı!"** bildirimi.
- [x] **7.3. Bilinen Karşılaşma, Ekonomi ve Sunucu Düzeltmeleri (`Bölüm 3` Hataları):**
  - Haydut teslimiyetinde haydut partisinin `roster/armySize` değerinin düşürülmesi (aynı partiden tekrar ödül alınmasının engellenmesi).
  - Oyuncu teslimiyetinde erzak 4'ün altındayken net erzak kazancı oluşmaması.
  - `server.ts` içindeki geçersiz `gemini-3.8-flash` model kimliğinin geçerli model (`gemini-2.5-flash`) + deterministik yedekle (`fallback`) düzeltilmesi.

---

## 🎯 BÖLÜM 4 — KULLANICI TALİMATIYLA EKLENEN YENİ GÖREVLER (BANNERLORD TAM ÖZGÜNLÜK PAKETİ)

- [x] **8.1. Başlangıç Ekranı, Kayıt Yükle ve Yeni Oyun FPS Düşüşü Çözümü (`src/App.tsx`, `src/components/WorldCanvas.tsx`, `src/game/proceduralModels.ts`):**
  - Ana menüde Yeni Oyun (`CharacterCreatorModal`), Kayıt Yükle (`BannerlordPauseModal`) veya tam ekran modallar açıldığında arka planda çalışan `WorldCanvas` 3B WebGL döngüsünün duraklatılması (`isRenderPaused`) ve arazi dokusu üretiminin optimize edilmesi. *(Tamamlandı)*
- [x] **8.2. Bannerlord Yükleme Ekranı (Loading Screen), Özgün Ana Menü ve Ayarlar Ekranı (`src/App.tsx`):**
  - Yeni oyuna veya kayıtlı oyuna girerken direkt oyuna atlamak yerine Bannerlord tarzı illüstrasyonlu ve tarihsel ipuçlu **Yükleme Ekranı (`Loading Screen`)** gösterilmesi; ana menünün Bannerlord tipografisi ve sol dikey menü düzeniyle yenilenmesi; Ses, Grafik ve Oynanış ayarlarını içeren **Ayarlar (`Settings`)** penceresinin eklenmesi. *(Tamamlandı)*
- [x] **8.3. Ana Menü ve Oyun İçi Test / Arena Butonlarının Kaldırılması veya Gizlenmesi (`src/App.tsx`, `src/components/SettlementModal.tsx`, `src/components/GameHud.tsx`):**
  - Ana menüdeki `KARAKTERİNİ MODELLE [B]` ve `SAVAŞ & KARAKTER ARENASI TEST ET` butonları ile oyun içindeki hızlı meydan savaşı / test butonlarının gizlenmesi. *(Tamamlandı)*
- [x] **8.4. Oyuncu Kale ve Şehir Kuşatma Sisteminin Düzeltilmesi ve Otomatik Savaş İlanı (`src/game/siegeEncounter.ts`, `src/components/SettlementModal.tsx`, `src/App.tsx`):**
  - Oyuncu bir şehir veya kaleyi kuşatmaya başladığında (`startPlayerSiege`) o yerleşimin bağlı olduğu krallıkla otomatik olarak düşman olması (`isAtWarWithPlayer = true` ve `world.wars` kaydı) ve harita üzerinde gerçek Bannerlord kuşatma kampı ekranının (`SiegeEncounterModal`) açılması. *(Tamamlandı)*
- [x] **8.5. Bannerlord 6 Aşamalı Karakter Hikayesi, Başlangıç Ailesi, Başlangıç Ekipmanı ve 0 Asker Kuralı (`src/components/CharacterCreatorModal.tsx`, `src/game/rules.ts`):**
  - Karakter oluştururken Bannerlord'daki gibi 6 aşamalı geçmiş/hikaye seçimi (*Aile Kökeni, Erken Çocukluk, Ergenlik, Gençlik, Başlangıç Gerekçesi, Kader Dönüm Noktası*) yapılması; oyuncunun yanında ailesinden bir kardeşin (`FAMILY` kahraman) bulunması; başlangıçta **hazır asker verilmemesi (0 asker)**, bunun yerine biraz yiyecek (tahıl, kurutulmuş et), bir kılıç, bir yay, ok, bir binek atı ve sıradan kıyafetler verilmesi. *(Tamamlandı)*
- [x] **8.6. Nam (`Renown`) Sisteminin Düzeltilmesi (`src/game/rules.ts`):**
  - Bina yükseltme, atölye satın alma, demircilik, esir fidyesi, arena antrenmanı ve sur bombardımanı gibi saçma kaynaklardan kazanılan namların kaldırılması; namın yalnızca gerçek muharebe zaferlerinden, turnuva şampiyonluğundan (+3 Nam) ve görevlerden kazanılması. *(Tamamlandı)*
- [x] **8.7. Başlangıç Sesi Düzeltmesi ve Oyun İçi Harita Hareket / Atmosfer Sesleri (`src/game/sound.ts`, `src/App.tsx`, `src/components/CharacterCreatorModal.tsx`, `src/components/WorldCanvas.tsx`):**
  - Oyuna girince veya karakter kurunca çalan rahatsız edici yüksek borazan (`playWarhorn`) sesinin kaldırılması; oyuncu haritada hareket ederken gerçekçi at nalı / yürüyüş adımı sesleri ve yerleşim giriş seslerinin eklenmesi. *(Tamamlandı)*
- [x] **8.8. Şehir, Kale, Köy ve Lord İsimlerinin Mouse Üzerine Gelince Hareket Etmesi Sorununun Çözümü (`src/components/WorldCanvas.tsx`, `src/components/GameHud.tsx`):**
  - Harita üzerindeki yerleşim (şehir, kale, köy) ve lord etiketlerindeki `transition-transform` ve `hover:scale-*` sınıflarının kaldırılarak fare üzerine gelindiğinde ismin hareket etmesinin/titremesinin tamamen engellenmesi. *(Tamamlandı)*
- [x] **8.9. Aserai Bölgesinin Genişletilmesi, Gerçekçi Şehir/Kale/Köy 3B Modelleri ve Tıkla-Git / Tıkla-Takip Et İyileştirmesi (`src/game/mapGen.ts`, `src/game/rules.ts`, `src/game/proceduralModels.ts`, `src/components/WorldCanvas.tsx`):**
  - Güneydeki Aserai çöl, vaha ve kıyı coğrafyası ile yerleşimlerinin düzeltilip genişletilmesi; şehir, kale ve köylerin harita modundaki 3B modellerinin daha gerçekçi hale getirilmesi; tıkla-git ve tıkla-takip et (`followingLordId`) sisteminin iyileştirilmesi. *(Tamamlandı)*
- [x] **8.10. Krallığa Özel Asker Sayıları, Yaşayan Dünya ve Savaş Meydanları Sistemi (`src/game/heroGen.ts`, `src/game/rules.ts`, `src/game/worldSim.ts`):**
  - Her krallığa özel asker sayıları ve kültür doktrinlerinin düzeltilmesi (`CULTURE_TROOP_DOCTRINE` & `makeCultureRoster`); yaşayan dünya ve bölge coğrafyasına uygun savaş meydanları sisteminin geliştirilmesi. *(Tamamlandı)*
- [x] **8.11. Gerçek Bannerlord Teması, Özel Mouse İmleci, Sıfır Emoji (Tamamen SVG) ve Bannerlord Envanter Sistemi (`src/index.css`, `src/components/InventoryModal.tsx`, `src/components/ItemIcon.tsx`, `src/components/GameHud.tsx`, `src/components/WorldCanvas.tsx`):**
  - Cıvık turuncu/yeşil temaların kaldırılıp gerçek Bannerlord koyu demir/eskitilmiş pirinç/parşömen temasının uygulanması; oyuna Bannerlord tarzı özel mouse imleci eklenmesi; tüm emojilerden kurtulup kaliteli SVG görünümlere geçilmesi; envanter sisteminin tıpkı Bannerlord'daki gibi üç sütunlu ve %100 SVG eşya ikonlu (hiçbir eşyada emoji veya sadece yazı olmadan) görünmesi. *(Tamamlandı)*
- [x] **8.12. Yarım Kalan 6 UI ve Mekanik Denetim Maddesinin Tamamlanması (`src/game/rules.ts`, `src/game/bannerlordFoundation.ts`, `src/game/recruitment.ts`, `src/components/SettlementModal.tsx`, `src/components/BannerlordRecruitmentModal.tsx`, `src/components/GameHud.tsx`, `src/components/KingdomManagementModal.tsx`, `src/App.tsx`):**
  1. **Köylerde Garnizon Sıfırlama (`garrison = 0`):** `rules.ts` (`buildCanonicalCalradiaSettlements`, `advanceDailyEconomyAndWorld`, `calculateSettlementDailyStats`, `manageGarrisonTransfer`) ve `bannerlordFoundation.ts` içinde köylerde garnizonun her zaman `0` kalması garanti altına alındı; `SettlementModal.tsx` içinde köylerde garnizon sekmesi ve garnizon metni tamamen kapatıldı (yalnız milis gösterilir).
  2. **Sağ Alt HUD Ultra-Kompakt 2 Satırlı Düzen (`GameHud.tsx`):** Sağ alt kaynak çubuğundaki uzun metin etiketleri (`Dinar`, `Şöhret`, `Nüfuz`, `HP`, `Asker`, `Erzak:`, `Moral:`, `Hız:`, `Görüş:`, `Maaş:`) kaldırılarak yalnızca `[SVG İkon + Sayı]` içeren 2 satırlı kompakt Bannerlord düzenine geçildi; detaylı hover kırılım kartları (tooltips) korundu.
  3. **Sol Alt Buton İpuçları + Şeffaf Haber Akışı (`GameHud.tsx`):** Sol alt menü dock'unun (`hud-dock`) hemen üstüne siyah kutusu olmayan (`bg-transparent`), tamamen şeffaf akan canlı sefer haber/kronik akışı (`hud-transparent-news-feed`) eklendi.
  4. **J Menüsü (`Atlas` Sekmesi Silindi) ve `Gemini Divan Raporu Al` Butonu Kaldırıldı (`GameHud.tsx`):** `WorldPane` ve `WorldTabs` içinden `'atlas'` sekmesi tamamen kaldırıldı (`J` doğrudan Görevler'i, `V` Sefer Kroniği'ni açar); sağ üstteki `'Gemini Divan Raporu Al'` butonu ve yapay zeka divan çağrısı temizlendi.
  5. **Krallık Divanı Test / Sandbox Elemanlarının Temizlenmesi (`KingdomManagementModal.tsx`):** `WarDesireRatio` test sürgüleri (`Canlı "Tımar-Güç Paradoksu" Laboratuvarı`), `Veraset & Null-Safety Testi`, `Son Tımarı Devret & Yıkımı Test Et` butonları ve decompile/debug metinleri tamamen kaldırılarak özgün Bannerlord Krallık Divanı görünümüne kavuşturuldu.
  6. **Asker Alma 1 Gün Bekleme Süresi (`lastRecruitDay` Cooldown) (`recruitment.ts`, `BannerlordRecruitmentModal.tsx`, `SettlementModal.tsx`, `App.tsx`):** Bir yerleşimden asker toplandığında `settlement.lastRecruitDay = campaign.day` kaydedilerek aynı gün içinde aynı yerleşimden tekrar asker toplanması hem kural motorunda (`recruitQuote` / `recruitBatch` / `handleRecruitBatch`) hem de arayüzde (`recruitment-cooldown-banner`) engellendi. *(Tamamlandı)*
- [x] **8.13. Sefer Meydan Savaşlarının Gerçek Harita Coğrafyası ve Gerçek Ordu Kadrolarına Bağlanması (`src/components/WorldCanvas.tsx`):**
  - `initBattleArena()` içinde sabit `-18, 14` koordinatları ve sabit 11 kişilik düşman dizisi yerine, muharebenin haritada temasın gerçekleştiği gerçek coğrafi koordinatlarda (`playerOverworldX, playerOverworldZ` — çöl, kar, orman, bozkır) başlaması, müttefik ve düşman askerlerinin `camp.roster` ve `targetLord.roster` / `targetSettlement.garrison` kadrolarından orantılı üretilmesi ve savaş sonunda ölen askerlerin gerçek birim sınıflarına (`militia, archer, cavalry, guard`) göre düşülmesi sağlandı. *(Tamamlandı)*
- [x] **8.14. Karakter Nitelik, 18 Beceri, Perk ve Klan Rollerinin %100 Türkçeye Çevrilmesi (`src/game/characterDevelopment.ts`, `src/game/perks.ts`, `src/components/CharacterModal.tsx`, `src/components/CharacterCreatorModal.tsx`, `src/components/encyclopedia/EncyclopediaModal.tsx`, `src/components/GameHud.tsx`):**
  - İngilizce parantezli nitelik, 18 beceri, perk ve klan rolü adları kaldırılarak tüm karakter ekranları ve ansiklopedi %100 Türkçe hale getirildi. *(Tamamlandı)*
- [x] **8.15. Asker Toplama Slotlarının Boşalması (`recruitedSlotKeys`), Köylerde Rastgele/Farklı Sayıda Gönüllü Asker ve Başlangıç Haydut Azaltımı (`src/components/BannerlordRecruitmentModal.tsx`, `src/App.tsx`, `src/game/rules.ts`, `src/game/heroGen.ts`, `src/game/recruitment.ts`):**
  - Bir yerleşimden asker toplandığında alınan slotların anahtarları (`recruitedSlotKeys`) yerleşime kaydedilerek tekrar **"Asker Topla"** ekranı açıldığında toplanmış slotların **"Boş"** görünmesi sağlandı (günler ilerledikçe kademeli olarak yenilenir).
  - Her köyün sabit 5-6 asker yerine eşraf başına rastgele/farklı sayıda (`1..4` slot) gönüllü çıkarması sağlandı.
  - Başlangıçtaki haydut partisi sayısı azaltıldı, `Kargı` başlangıç köyü Sancaktepe'nin dibinden uzaklaştırıldı ve gerçekçi başlangıç modunda haydut çetelerinin asker mevcudu erken oyuna uygun şekilde küçültüldü. *(Tamamlandı)*
- [x] **8.16. Harita Hover `"Emir:"` Önekinin Kaldırılması, Yeni Karakterde `0` Başlangıç İlişkisi ve Gerçek Bannerlord Lord/Kral/Leydi Diyalog Ağacı (`src/components/WorldCanvas.tsx`, `src/game/heroGen.ts`, `src/game/rules.ts`, `src/game/dialogue.ts`, `src/components/DialogueModal.tsx`, `src/game/conversation.ts`, `src/App.tsx`):**
  - Harita üzerinde lordların, kralların ve haydutların üzerine fare getirildiğinde çıkan bilgi kartındaki `"Emir: "` öneki kaldırıldı; artık doğrudan ne yaptıkları (`"Sargot yönüne ilerliyor"`, `"Devriye geziyor"` vb.) yazıyor.
  - Yeni açılan karakterin tüm krallar, lordlar ve leydilerle başlangıç ilişkisi `0` olarak ayarlandı (`heroGen.ts` ve `rules.ts`).
  - Chrome/Web üzerinden *Mount & Blade II: Bannerlord* resmi lord diyalog sistemi araştırılarak doğrulanmış **5 ana diyalog dalı** eklendi:
    1. **İlk Tanışma (`intro-root`, `hasMet === false`):** Daha önce tanışılmamış bir hükümdar/lord/leydi ile ilk kez konuşulduğunda *"Çıkaramadım seni yolcu. Kimsin?"* tanışma sahnesi açılır; oyuncu kendini tanıttığında Ansiklopedide (`MEET_HERO`) kilidi açılır ve ana konuşma ağacına geçilir.
    2. **"Konuşmamız gereken bir şey var." (`discuss-hub` -> `discuss-menu`):** Hükümdarlarla **Vasallık Bağlılık Yemini (`discuss-fealty`)**, lord/hükümdarlarla **Paralı Askerlik Sözleşmesi (`discuss-mercenary`)**, leydilerle **Kur Yapma / İltifat (`discuss-courtship`)**, **Hanedan & Evlilik İttifakı (`discuss-marriage`)**, **Karşılıklı Takas Teklifi (`OPEN_BARTER`)** ve **Krallık Siyaseti & Divan Müzakeresi (`OPEN_COUNCIL`)**.
    3. **"Size bir sorum var." (`ask-question-hub` -> `question-menu`):** Krallıktaki diğer soyluların canlı harita konumlarını ve hangi yerleşimin yakınında olduklarını sorma (`question-locate`), krallığın kimlerle savaşta veya barışta olduğunu sorma (`question-politics`) ve klan/unvan geçmişini sorma (`question-lore`).
    4. **"Yapabileceğim bir görev var mı?" (`noble-task-hub` -> `noble-quest-menu`):** Aktif soylu görevi veya dinamik soylu görevleri (*Haydut Devriyesi Avı*, *Garnizon İçin Kıdemli Asker Eğitimi*, *Sefer Erzak Desteği*).
    5. **"İkimizin de yararına olacak bir teklifim var. (Takas)" (`barter-direct`):** Doğrudan çift sütunlu Bannerlord Takas (`Barter`) ekranını açar.
  - Ayrıca `AGENTS.md` ve bu dosyaya kalıcı **Bannerlord Web Araştırması Kuralı** işlendi: *Herhangi bir sistem yaparken Bannerlord ile birebir aynı olduğundan emin olmak için önce Chrome/Web üzerinden araştırılıp teyit edilecektir.* *(Tamamlandı)*

---

## 🔧 BÖLÜM 5 — DÜZENLENECEKLER: BANNERLORD BİREBİR SİSTEM UYUM DENETİMİ (CHROME/WEB DOĞRULAMALI)

> Chrome/Web üzerinden gerçek *Mount & Blade II: Bannerlord* mekanikleriyle kod tabanımız karşılaştırılarak tespit edilen ve düzeltilmesi gereken **10 temel sistem uyumsuzluğu**:

- [ ] **9.1. Sol Alt HUD Menü İkonları ve Klan (`L`) — Krallık (`K`) Ayrımı (`src/components/GameHud.tsx`):**
  - **Gerçek Bannerlord:** Sol alt menüde sırasıyla **6 ana ikon** bulunur: **Karakter (`C`), Envanter (`I`), Parti (`P`), Görevler (`J`), Klan (`L`), Krallık (`K`)**. Oyuncu henüz bir krallığa katılmamışsa veya kendi krallığını kurmamışsa **Krallık (`K`)** ikonu kilitlidir/pasiftir. **Klan (`L`)** sekmesi ayrıdır (*Üyeler, Partiler, Tımarlar, Atölyeler/Kervanlar*).
  - **Bizdeki Hata (Düzenlenecek):** Sol altta hem `Ordum` çekmecesi hem `Parti [P]` butonu mükerrer duruyor; `Görevler [J]` yerine `Harita & Günlük` yazıyor; **Klan (`L`)** menüsü yok ve oyuncu 1. günde bağımsız bir gezginken bile **Divan (`K`)** açık olup krallık yönetebiliyor.
- [ ] **9.2. Şehir / Kale / Köy Menüsü ve Mülk Yönetimi Sınırları (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Yabancı bir şehre girildiğinde sol menüde yalnızca *Kışlaya/ Kaleye Git, Han'a Git, Ticaret, Arena, Asker Topla, Bir süre burada bekle* bulunur. **"Şehri Yönet (`Manage Town`)"** ve **"Garnizonu Yönet"** yalnızca yerleşim oyuncunun klanına aitse (`isPlayerOwned`) açılır. Binalar altın verip anında (0 saniyede) yükselmez; günlük **İnşaat Gücü (`Construction`)** ile günler içinde tamamlanır, aynı anda 1 aktif inşaat + 4 günlük proje seçilir. Kalelerde şehir binaları (*Forum, Panayır, Su Kemeri*) yerine kaleye özel binalar (*Surlar, Garnizon Kışlası, Eğitim Alanı, Gözetleme Kulesi, Tahıl Ambarı, Bahçeler, Kuşatma Atölyesi, Vergi Gişesi*) bulunur.
  - **Bizdeki Hata (Düzenlenecek):** Oyuncu kendisine ait olmayan yabancı şehirlerde ve kalelerde bile **`Binalar`** sekmesine girip başkasının şehrine inşaat yapabiliyor ve **`Garnizon`** sekmesinden yabancı garnizona asker koyup çekebiliyor (`!isPlayerOwned` kilidi eksik). Binalar 300-450 Dinar verip anında seviye atlıyor ve `FORUM` açıklamasında hâlâ `+8 Klan Namı` yazıyor.
- [ ] **9.3. Köy Yağmalama (`Raid`), Zorla Erzak ve Zorla Asker Alma (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Bir köyde **"Düşmanca Eylemde Bulun"** (*Köyü Yağmala, Köylüleri Erzak Vermeye Zorla, Köylüleri Asker Vermeye Zorla*) seçildiğinde köylü milisler direnir (savaş/çatışma çıkar), yağma haritada zaman alır, köyün bağlı olduğu krallıkla savaş/suç ve ağır ilişki/onur cezası doğurur. Dost veya oyuncuya ait köy yağmalanamaz.
  - **Bizdeki Hata (Düzenlenecek):** Köye girip **"Köyü Yağmala"** butonuna basınca hiçbir savaş çıkmadan ve zaman geçmeden anında `+280 Dinar, +16 Erzak` veriyor; **"Erzak Vermeye Zorla"** ve **"Asker Vermeye Zorla"** butonları ilişki düşürmeden ve savaş açmadan bedava erzak/asker veriyor; oyuncu kendi köyünü bile yağmalayabiliyor. Ayrıca köy üst istatistik şeridinde hâlâ emojiler (`🔥`, `☀`, `⚔`, `🌾`, `🏰`) kalmış durumda.
- [ ] **9.4. Kuşatma Sekmesinin Yerleşim Menüsünün İçinde Olması (`src/components/SettlementModal.tsx`):**
  - **Gerçek Bannerlord:** Düşman bir şehir veya kalenin içine elini kolunu sallayarak girip içerideki bir sekmeden surları bombardımana tutamazsın. Düşman yerleşimine yaklaşıldığında dışarıdan **Kuşatma Kampı (`SiegeEncounterModal`)** kurulur.
  - **Bizdeki Hata (Düzenlenecek):** `SettlementModal.tsx` içinde **"Kale / Şehri Kuşat"** butonunun hemen altında hâlâ eski `activeTab === 'siege'` (*"Kuşatma Silahları & Surlara Taarruz"*) sekmesi duruyor; yerleşim içinden kaldırılıp tamamen dış kuşatma kampına (`SiegeEncounterModal`) bırakılmalı.
- [ ] **9.5. Arena ve Turnuva Sistemi (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Turnuvaya katılmak **ücretsizdir** (giriş parası alınmaz); oyuncu tur başı kendi üzerine **Bahis (`Bet`)** yatırarak para kazanır. Turnuva her şehirde her saniye sınırsız tekrar edilmez; o şehirde aktif turnuva varsa girilir, kazanılınca biter (**Nadir Eşya Ödülü + +3 Nam**). Kazanma ihtimali oyuncunun ordusundaki asker sayısına değil, dövüşüne/karakterine bağlıdır.
  - **Bizdeki Hata (Düzenlenecek):** Turnuvaya girişten `30 Dinar` kesiliyor, kazanma şansı oyuncunun **ordu gücüne (`calculatePartyStrength(state.roster)`)** göre zar atılarak hesaplanıyor ve aynı şehirde arka arkaya sınırsız kez turnuvaya girip para/nam kasılabiliyor.
- [ ] **9.6. Han (`Tavern`) — Yoldaş (`Wanderer`) ve Kademeli Fidye Sistemi (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Şehir hanlarında rastgele **Gezgin Yoldaşlar (`Wanderers`)** bulunur; onlarla konuşup hikayelerini dinleyerek altın karşılığı klana katılırlar. Fidye aracısı (`Ransom Broker`) esirlerin kademesine (`Tier 1..6`) göre farklı fiyat öder; handa yerel masa oyunu oynanabilir.
  - **Bizdeki Hata (Düzenlenecek):** Han sekmesinde yalnızca *Paralı Asker Kiralama, Fidye Aracısı ve Ziyafet* var; handan Gezgin/Yoldaş işe alma yok (oyun başında yoldaşlar bedava hazır geliyor) ve tüm esirler kademesine bakılmaksızın sabit `35 Dinar`'a satılıyor.
- [ ] **9.7. Şehir Atölyeleri (`Workshops`) ve Demirci Ocağı Hilesi (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Şehirlerde **11 resmi atölye türü** (*Bira, Şarap, Zeytinyağı, Çömlek, Kadife, Keten, Yün, Tabakhane, Ahşap, Demirci, Kuyumcu*) vardır; maksimum atölye sayısı **Klan Seviyesi + 1** ile sınırlıdır; atölye satın alma maliyeti yüksektir ve bağlı köylerin ürettiği hammaddeye göre kâr eder.
  - **Bizdeki Hata (Düzenlenecek):** Sadece 4 atölye var, klan seviyesi sınırı yok ve `220 Dinar` gibi çok ucuz bir fiyata alınıp günde `~75 Dinar` basıyor. Ayrıca `Demirci Ocağı (smithy)` sekmesinde hâlâ tek tıkla sınırsız silah ve para üreten eski buton (`forgeCustomWeaponAtSmithy`) duruyor.
- [ ] **9.8. "Bir Süre Burada Bekle" (`Wait Here`) Mekaniği (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Yerleşimde **"Bir süre burada bekle"** seçildiğinde oyuncu yerleşim içinde kalırken harita zamanı akar ve saatler/günler geçtikçe can ile moral dinlenerek dolar.
  - **Bizdeki Hata (Düzenlenecek):** Butona basınca zaman hiç ilerlemeden anında `+25 HP` ve `+6 Moral` veriyor; arka arkaya tıklayarak 0 saniyede can ve moral %100 yapılabiliyor.
- [ ] **9.9. Takvim ve Mevsim Süresi Tutarsızlığı (`src/components/GameHud.tsx` vs `src/game/rules.ts`):**
  - **Gerçek Bannerlord:** Kalradya takviminde **1 Mevsim = 21 Gün**, **1 Yıl = 84 Gün**dür (*İlkbahar, Yaz, Sonbahar, Kış*).
  - **Bizdeki Hata (Düzenlenecek):** `GameHud.tsx` mevsimi 21 gün (84 günlük yıl) üzerinden gösterirken, `rules.ts` içindeki `advanceDailyEconomyAndWorld` her **10 günde bir** mevsim değiştiriyor (40 günlük yıl). İkisi **21 gün / mevsim** olarak eşitlenmeli.
- [ ] **9.10. İmparatorluk Üçlü İç Savaş Bölünmesi (`Kuzey / Güney / Batı İmparatorluğu`):**
  - **Gerçek Bannerlord:** İmparatorluk tek parça değildir; iç savaşta olan **3 ayrı krallığa** bölünmüştür: **Kuzey İmparatorluğu (Lucon)**, **Güney İmparatorluğu (Rhagaea)** ve **Batı İmparatorluğu (Garios)**.
  - **Bizdeki Hata (Düzenlenecek):** Lucon, Rhagaea ve Garios tek bir `'empire'` krallığı altında birleşik duruyor ve birbirleriyle hiç savaşmıyorlar.

---

## ⏸️ BÖLÜM 3 — KULLANICI KARARIYLA ERTELENEN / SONA BIRAKILAN İŞLER

- [ ] ~~**Parça Bazlı Demircilik (`Smithing`):**~~ *(Kullanıcı talimatıyla geçici olarak İPTAL / ERTELENDİ — en sona bırakıldı).*
- [x] **P7 — Performans Ölçüm ve Optimizasyon Paketi:** Başlangıç/modal FPS düşüşü ve WebGL arka plan duraklatması tamamlandı.
- [x] **P8 — Çoklu Slot Kayıt Yönetimi Ekranı:** `SAVE_VERSION = 4` ve çoklu kayıt yuvaları tamamlandı.

---

## 🔍 BÖLÜM 6 — 2026-10-24 DENETİM DÜZELTMELERİ (Altın Kural 2–3: yanlış/eksik Bannerlord sistemi)

> Kaynak denetim: [`docs/DENETIM_2026-10-24_YAPILANLAR_VE_SAVAS_MEYDANI.md`](docs/DENETIM_2026-10-24_YAPILANLAR_VE_SAVAS_MEYDANI.md).
> Bu bölümdeki maddeler, yukarıda `[x]` görünen bazı işlerin Bannerlord'a **sayı/formül ya da bütünlük**
> bakımından uymadığının kod kanıtıyla tespitidir; `[x]` satırları tarihî kayıt olarak bırakılmıştır,
> düzeltme buradan takip edilir.

- [x] **10.1. Derlenebilirlik ve "doğrulandı" iddiasını geri kazan (`KingdomManagementModal.tsx`, `package-lock.json`):** *(2026-10-24 yapıldı)*
  - *Canlı Tımar-Güç Paradoksu Laboratuvarı* (tanımsız `simFiefCountA/B`, `simStrengthA/B`, `sandboxParadoxReport` referansları, 119 satır) tamamen silindi; canlı savaş-isteği paneli tam genişliğe alındı. Bannerlord'da böyle bir laboratuvar ekranı yok.
  - Lock eşitlendi (`npm install --legacy-peer-deps` → esbuild 0.28.2); `node_modules` zaten repoda izlenmiyordu (0 dosya).
  - `probe-troops`: hatalı iddia düzeltildi — genel (bozkır temalı) `UNIT_DEFINITIONS.cavalry.name`'in Vlandiya kasabasında yazılması yerine kültürel rol metninin yazılması ve genel adın sızmaması beklenir (probe içi not).
  - Kanıt: temiz `rm -rf node_modules && npm ci` sonrası `npx tsc --noEmit` 0 hata, `npm run verify:fast` yeşil, `probe-troops` yeşil.
- [ ] **10.2. Meydan Savaşını Bannerlord Doğrusuna Göre Yeniden Yap (`WorldCanvas.tsx` sefer savaşı → ayrı misyon; `CharacterArenaView.tsx` + `battleEnginePool.ts` + `tacticalFormation.ts` üretim yoluna taşınacak):**
  - Ayrıntı ve fazlar (B1–B7) denetim raporu Bölüm 3 ve 5'te: bölge-arazi sahnesi (nehir/köprü/orman/köy yakınlığı, yaklaşma vektöründen doğuş kenarları, ~450×450 alan, kırmızı sınır), **Order of Battle** diziliş fazı (≤8 bölük, filtreler, kaptanlar, başlangıç emirleri), 0–8 bölük seçimi + F1/F2/F3/F4/F5/F6 emirleri ve konum sancağı, sınıf davranışları (piyade/okçu/süvari/**atlı okçu**) + düşman kaptan AI, **1 aktör = 1 asker** (28+28 sıkıştırması kalkacak), orantılı ilk dalga + kendi kenarından takviye dalgaları, yönlü dövüş + gerçek mermiler + sınırlı mühimmat + ayrı at aktörü (kuşanılmış eşya/beceriden hasar), moral/bozgun, Tab skor ekranı + kurallı geri çekilme, oyuncu bayılınca AI devri ve yenilgide **esaret** (`gameover` değil), sonuç → esir → ganimet akışı.
  - Kaldırılacak alâkasız katman: Space dash + stamina, kombo sayacı, hitstop/kamera sarsıntısı, düşman altı telegraph halkası, bedelsiz "Haritaya Çekil", `BattlePrewarmModal`daki uydurma ipuçları ("%82 koruma", "[M] +45 ezme" vb.), zaferde lord kadrosunu %25'e zorla indirme.
- [ ] **10.3. Kuşatma Taarruz Sahnesini Meydan Savaşından Ayır (`App.tsx:handleStartSiegeBattle`):**
  - Şu an kuşatma taarruzu açık arazide ızgara meydan savaşı açıyor. Doğrusu: sur/gedik/kapı + inşa edilmiş makinelerin (koçbaşı/kuleler/merdivenler) cephelere yerleştiği ayrı sur sahnesi. Sahne hazır olana kadar taarruz düğmesi meydan savaşını "kuşatma" diye sunmamalı.
- [x] **10.4. Erzak Tüketimi ve Çeşitlilik Moralini Düzelt (`foodSystem.ts`):** *(2026-10-24 yapıldı)*
  - Tüketim Bannerlord ölçeğine çekildi: `ceil((asker+1)/20)` (~20 askere günde 1 birim). Yiyecek türleri 9'a tamamlandı (tereyağı/üzüm/zeytin/bira pazar kalemleri eklendi); yenebilirlik artık tanım→tür eşlemesiyle (zeytinyağı ve çömlek gibi `FOOD` kategorili ticaret malları yenmez), çeşit türle sayılır (iki peynir tek çeşit).
  - Çeşitlilik morali tür başına +1, tavan +8 (Gourmet parametresi ×2 hazır, perk bağlaması 10.10'da). Moral artık günlük toplamsal şişmez; beslenen partide `50 + çeşitlilik` hedefine %25 yakınsar.
  - Kalan küçük fark: kesirli günlük tüketim yerine tam birime yuvarlama (kod içinde notlu).
- [x] **10.5. Parti/Tutsak Kapasite Formüllerini Düzelt (`partySystem.ts`, `rules.ts:calculateClanTier`):** *(2026-10-24 yapıldı)*
  - Klan kademesi parti bonusu doğrusuna çekildi: Kademe 0: 0, Kademe 1: +25, sonra +15/kademe birikimli (25/40/55/70/85/100). Uydurma `Liderlik×0.15`, `Nam/50` ve `recruitment.partyLimit`teki `Nam/40` kaldırıldı; parti limiti tek kaynaktan (`partySystem.getPartyLimit`) besleniyor (HUD'daki `45 + kademe` kopyası da buna bağlandı). Parti ekranı dökümünden sahte satırlar silindi.
  - Tutsak sınırı artık **sağlıklı (yaralı olmayan) mevcut askerin yarısı**; yaralılar düşülür, sınır savaş sonrası kendiliğinden azalır. Parti ekranı bu dökümü gösterir.
- [x] **10.6. Öğrenme Sınırını Tek Kaynağa İndir (`characterDevelopment.ts` vs `bannerlordFoundation.ts`):** *(2026-10-24 yapıldı)*
  - Kanonik kaynak `bannerlordFoundation.calculateLearningSoftCap/HardCap`. `characterDevelopment.calculateLearningLimit` buna devreder; `rules.ts` kopyası da yumuşak sınıra çekilip eşitliği `rules.test.ts` ile kilitlendi. Arayüzler artık doğru sınırı gösterir (5N/4O: 160, eskiden 226).
  - Öğrenme hızı da araştırılmış Bannerlord formülüne çevrildi: sınır altında `0.5N + 1.25O + 1.25`, üstünde seviye başına `-0.125`, sert tavanda 0. Probe beklentileri (226/336) düzeltildi.
  - [ ] Kalıntı: beceri XP ihtiyaç eğrisi (`getXpRequiredForSkillLevel`) hâlen proje ölçekli; Bannerlord eğrisiyle değişimi ayrı denge işi.
- [x] **10.7. Asker Toplama 1 Gün Cooldown'ını Kaldır (`recruitment.ts:91`, `App.tsx:1269`, `lastRecruitDay`):** *(2026-10-24 yapıldı)*
  - Günlük kilit tamamen kaldırıldı (`lastRecruitDay` alanı ve tüm yazımları silindi); aynı gün tekrar toplama serbest (probe ile kilitli). 3 günde bir toplu tazeleme + yuva sıfırlama kaldırıldı; üretim tek yerden, günlük tikten azar azar (havuz artışı + günde 2 yuvanın geri açılması).
  - Yuva eşikleri araştırılmış modele çekildi: ilk üç yuva serbest, 4/5/6. yuvalar +5/+10/+20 ilişki (`[0,0,0,5,10,20]`). Eşraf nüfuzu Bannerlord ölçeğine taşındı (Sıradan <100, Etkili 100–199, Güçlü 200+; tek kaynak `notables.ts`); soylu hat yalnız Güçlü toprak sahiplerinden.
  - Kalan: yuva içeriği hâlâ ekran açılışında deterministik üretiliyor; gerçek günlük üretim olasılığı ve yuva-içi kademe yükselmesi 10.9 birlik ağaçlarıyla birlikte ele alınacak.
- [ ] **10.8. Kültür Bonuslarını Tek Sürümde Doğru Yaz + Matematiğe Bağla (`CharacterCreatorModal.tsx`, `cultureBonuses.ts`):** *(2026-10-24 kısmen yapıldı)*
  - ✅ Tek kaynak kuruldu: `src/game/cultureBonuses.ts` (Wiki "Culture" güncel feat listesi, cezalar dahil). Kartlar buradan türer; kartta yazan her satırın `wiredIn` karşılığı var: Aserai çöl hızı + ücret +%5 cezası, Batanya orman cezası %50 az, Kuzait atlı devşirme −%10 + şehir vergisi −%20 cezası, Sturgia ordu toplama −%50 nüfuz, Vlandiya nam +%5 + ordu çağırma +%20 cezası. Kültür seçiminin oyuncu kahramanına yazılmaması hatası da düzeltildi. Probe: `probe-culture-feats.ts`.
  - [ ] Kalan: sistemi projede olmayan satırlar karta çıkmıyor (`pendingLines`): Aserai kervan/ticaret cezası, Batanya görüş menzili + veteran milis + proje hızı, Kuzait terfi indirimi + köy hayvancılığı, Sturgia tahıl + karar ilişki cezası, Vlandiya paralı asker geliri + kale köyü üretimi, İmparatorluk'un üç satırı (garnizon ücreti, ordu nüfuzu, ocak). Bu sistemler kuruldukça satırlar bağlanacak; İmparatorluk kartı şimdilik bunu açıkça söyler.
- [x] **10.9. Birlik Ağaçlarını Gerçek Kültür Hatlarına Çevir + `guard` Sınıfını Kaldır (`bannerlordFoundation.ts`, `troops.ts`, ADIM 5.1 ile birleşik):** *(2026-10-24 yapıldı)*
  - Savaş sınıfları Bannerlord dörtlüsü oldu: `infantry/archer/cavalry/horseArcher`; uydurma `guard` ve kademe-anlamlı `militia` roster/aktör/kayıp muhasebesinden çıktı. Atlı okçu hem atlı hem menzilli (model, hız, KITER arketipi).
  - Altı kültürün ağacı vanilla zincirlerle veri odaklı yazıldı (`TROOP_TREES`, 140 tanım): T1 halk kökü → kültüre özgü dallar T5; T2 soylu kök → T6 (Katafrakt, Sancak Şövalyesi, Fian Şampiyonu, Drujinik Şampiyonu, Han Muhafızı, Öncü Faris). İstisnalar korunur: Batanya'da halk okçusu yok (Fian soylu hattı), Vlandiya/Sturgiya/Batanya'da atlı okçu yok (havuz da vermez), Sturgiya soylu hattı yaya başlayıp süvariye geçer, İmparatorluk acemisi doğrudan okçuya terfi eder.
  - Eski kayıt göçü kayıpsız: rosterda `militia+guard → infantry`; eski `*_guard_N` vb. kimlikler sınıf+kademe korunarak yeni ağaça eşlenir (`migrateLegacyTroopId`). Soylu kök (T2) yalnız Güçlü (200+) toprak sahibinden devşirilir. Sahte sınıf-sınıf terfi (`upgradeTroopTier` + HUD düğmesi) kaldırıldı; terfi Parti ekranında ağaçtan yapılır. Doğrulama: `probe-troops` + tsc + `verify:fast` + tüm probe süpürgesi yeşil (10.12'nin ikisi hariç).
- [ ] **10.10. Perk Kataloğunu "Tam" Seviyesine Getir veya İddiayı Düzelt (`perks.ts` — şu an 42 kayıt):**
  - Her beceride 25'lik eşiklerde çift seçenekli gerçek perk listesine genişlet; perk etkilerinin hangi sistemde uygulandığını katalogda işlevsel karşılığıyla bağla (yalnız ad/açıklama yetmez — Discard perkleri doğru örnek).
- [x] **10.11. Cohesion ve Ordu Çağırma Formüllerini Araştırılmış Değerlerle Değiştir (`armySystem.ts`):** *(2026-10-24 yapıldı)*
  - Günlük kayıp araştırılmış modele çekildi: **-2 baz − 1/ek parti − 0.5/aç parti** (asker sayısı terimi silindi). Kaynak: rehber dökümü ("always -2, another 1 for each party") + oyun içi açlık satırı bildirimi; kod yorumunda atıflı.
  - +10 maliyeti artık **üye partilerin çağrı maliyetleri toplamının %10'u**; çağrı maliyeti 0 olan klan partileri girmez (yalnız klan ordusunda bedava — Fandom "Influence" doğrulaması). `calculateCohesionBoostCost(army, state)` imzası ve tüm çağrıları güncellendi.
  - Dürüst not: çağrı maliyetinin etkenleri Bannerlord'undur (asker/kademe/ilişki/mesafe) ama katsayıları proje nüfuz ekonomisine ölçeklidir; kesin oyun katsayıları yayımlı olmadığından kod yorumunda böyle belirtilir.

- [ ] **10.12. Önceden kırmızı problar (`probe-hud`, `probe-ui-session`):** 2026-10-24 düzeltme turunda, değişiklikler geri alınarak (stash) bu iki probun HEAD'de de kırmızı olduğu doğrulandı (HUD menü etiketleri ve UI katman sayısı beklentileri kodla uyumsuz). `verify:fast` içinde olmadıkları için fark edilmemiş. Beklentiler güncel HUD/UI ile karşılaştırılıp ya kod ya probe düzeltilecek; ikisi de `verify:fast`e eklenmeli.
