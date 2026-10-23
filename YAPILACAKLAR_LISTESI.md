# Kadirlord — Birleştirilmiş Tüm Görevler, Tamamlananlar (`[x]`) ve Açık İşler (`[ ]`)

> **Son Konsolidasyon:** 2026-10-22 (`d929f6f` — Canlı Kuşatma, Çoklu Lord Yarım Ay Dizilimi ve Ordu/Bütünlük Sistemleri Sonrası)
> **Kapsam:** Bu dosya; eski `YAPILACAKLAR_LISTESI.md`, `docs/CURSOR_ZOR_GOREVLER.md`, `docs/EKSIKLER_VE_HATALAR.md`, **Steam Bannerlord Türkçe Detaylı Tam Rehberi (`id=2046201799` — 17 Bölüm + SSS)** ve **6 Ana Ekranın (Şehir/Köy/Kale, Harita HUD, Envanter, Pazar, Diyalog/Lord, Parti/Karakter/Krallık) Görsel/Mekanik Denetimi** içindeki **TÜM görevlerin birleştirilmiş tek kaynağıdır**.
> **Doğrulama Prensibi:** Her madde gerçek kod tabanında (`src/game/` ve `src/components/`) kontrol edilerek gerçekten tamamlanmış olanlar `[x]`, eksik/yarım/görsel olarak hatalı olanlar `[ ]` olarak işaretlenmiştir.

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
- [x] **8.12. Başlangıç Doğum Yeri Seçimi ve Yaşayan Dünya Başlangıcı (`src/game/rules.ts`, `src/components/CharacterCreatorModal.tsx`, `src/App.tsx`):**
  - Karakter yaratma ekranına 8 farklı başlangıç şehri seçimi eklendi (`poros`, `pravend`, `marunath`, `omor`, `chaikand`, `sanala`, `zeonica`, `lycaron`). Lord Kargı'nın başlangıç noktasından uzak dağ geçitlerine (`x: -312, z: 178`) taşınmasıyla başlangıçtaki ani kurgulanmış pusu kaldırıldı; yaşayan dünyada oyuncunun özgür doğuşu sağlandı. *(Tamamlandı)*
- [x] **8.13. Şehir ve Kale Garnizon & Milis Sayılarının Bannerlord Ölçeğine Yükseltilmesi (`src/game/rules.ts`):**
  - Şehir garnizonları ~280-420, kale garnizonları ~160-260, köy milisleri ~45-80 seviyesine yükseltilerek Bannerlord'daki kale ve şehirlerin gerçekçi savunma kuvvetlerine kavuşturulması sağlandı. *(Tamamlandı)*
- [x] **8.14. Karakter Mankeninin Sürekli 360 Derece Dönmesinin Kaldırılması (`src/components/HeroMannequin.tsx`, `src/components/CharacterCreatorModal.tsx`):**
  - Karakterin mankende kendi kendine sürekli dönmesi durduruldu; manken vakur duruşta sabit kalıyor ve yalnızca kullanıcı fare ile sürüklediğinde dönüyor. *(Tamamlandı)*
- [x] **8.15. Bannerlord Birebir Sol Alt HUD (Dairesel 6 Buton) ve Vakanüvis Ticker (`src/components/GameHud.tsx`):**
  - Sol altta Bannerlord ile birebir 6 dairesel buton: Karakter [C] (yüz/kask simgesi ve bildirim `!` rozeti), Envanter [I] (çuval simgesi), Birlik / Parti [P] (3 asker simgesi ve bildirim `!` rozeti), Klan Menüsü [L] (aslan klan amblemi), Krallık Divanı [K] (kraliyet tacı), Görev Günlüğü [J] (parşömen ve görev sayısı rozeti).
  - Butonların hemen üzerinde sol altta son olayları bildiren Vakanüvis haber akışı (SAVAŞ, DİPLOMASİ, TİCARET, HABER).
  - Bannerlord'da olmayan "Kıta Atlası ve Stratejik Kamera Rehberi" kaldırıldı.
  - Göksel güneş/ay kadranı ve mevsim/saat çarkı ekranın tam ortasına (`absolute left-1/2 -translate-x-1/2 bottom-0`) hizalandı. *(Tamamlandı)*
- [x] **8.16. Gökten Görev Yağmasının Önlenmesi (`src/game/quests.ts`):**
  - Oyuncu bir lorddan, leydiden veya köy eşrafından görev kabul etmediği sürece görev günlüğünde görev listelenmemesi kuralı uygulandı. *(Tamamlandı)*
- [x] **8.17. Sağ Tık Tarayıcı Menüsünün Engellenmesi ve Favicon 404 Hatasının Giderilmesi (`src/App.tsx`, `index.html`):**
  - Harita ve arayüzde sağ tıklandığında tarayıcının varsayılan menüsü engellendi; SVG kılıç favicou eklenerek konsol 404 hataları giderildi. *(Tamamlandı)*

---

## ⏸️ BÖLÜM 3 — KULLANICI KARARIYLA ERTELENEN / SONA BIRAKILAN İŞLER

- [ ] ~~**Parça Bazlı Demircilik (`Smithing`):**~~ *(Kullanıcı talimatıyla geçici olarak İPTAL / ERTELENDİ — en sona bırakıldı).*
- [x] **P7 — Performans Ölçüm ve Optimizasyon Paketi:** Başlangıç/modal FPS düşüşü ve WebGL arka plan duraklatması tamamlandı.
- [x] **P8 — Çoklu Slot Kayıt Yönetimi Ekranı:** `SAVE_VERSION = 4` ve çoklu kayıt yuvaları tamamlandı.

