# Kadirlord — Birleştirilmiş Tüm Görevler, Tamamlananlar (`[x]`) ve Açık İşler (`[ ]`)

> **Son Konsolidasyon:** 2026-10-27 (`c3799f4` — Savaş Meydanı v1 Adım 1, Sancak Birliği Kahraman Sayımı, Klan Menüsü ve Harita Savaşları Yol Haritası)
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
- [x] **5.2. Yenilen Düşman Lordları Esir Alma, Kırmızı "İdam Et (`Execute`)" Butonu ve Tam Esir/Esaret Sistemi (`partySystem.ts`, `PartyModal.tsx`, `SettlementModal.tsx`, `BattleLootModal.tsx`, `WorldCanvas.tsx`, `worldSim.ts`, `rules.ts`, `App.tsx`):** *(2026-10-26 yapıldı)*
  - **1) Veri Mimarisi (`CharacterState: 'FREE' | 'CAPTIVE' | 'WOUNDED' | 'DEAD'`):** Lordlarda `characterState`, `captorId`, `dungeonSettlementId`, `daysCaptive` ve oyuncuda `playerCaptureState` + `escapedCaptivityNotice` alanları tanımlandı.
  - **2) Savaş Sonu Kararı (`BattleLootModal.tsx`, `lootTransaction.ts`):** Bir lord/hükümdar/leydi/haydut komutanı yenildiğinde ganimet ekranında **"Zincire Vur (Esir Al)"** veya **"Serbest Bırak (+10 İlişki, +10 Onur)"** seçeneği sunulur.
  - **3) Parti ve Zindan Eylemleri (`PartyModal.tsx`, `SettlementModal.tsx`):** Partideki tutsak komutanlar için **Fidye İle Sat (`ransomCaptiveLord`)**, **Serbest Bırak (`releaseCaptiveLord`, `+10 İlişki`, `+10 Onur`)**, **Zindana At (`donateCaptiveLordToDungeon` & `donatePrisonersToDungeon`, `+Nüfuz` ve `+Güvenlik`)** ve onay kutulu kırmızı **İdam Et (`executeCaptiveLord`, `characterState = 'DEAD'`, klan/krallık lordlarıyla `-50 İlişki`, `-30 Onur`)** eklendi. Sıradan esir askerler için günlük **Uyum (`Conformity` -> `readinessProgress` / `ready`)** çubuğu eklendi.
  - **4) Oyuncu Esaret Modu (`PlayerCaptureState` & Kamera Kilidi):** Oyuncu meydan savaşında veya otomatik muharebede yenildiğinde `gameover` yerine kazanan birliğin esiri olur (`triggerPlayerCapturedSequence`); haritada serbest tıklama kapanır, kamera esir alan birliğin canlı rotasına (`WorldCanvas.tsx`) kilitlenir, zaman `4x` hızlanır, günlük kaçış zarı (`computePlayerDailyEscapeChance`) ve **Rastgele Esaret İkilemleri (`CaptivityDilemmaEvent`)** ile kaçış veya fidye ödeyerek kurtulma (`"Esaretten Kaçtınız!"` modalı) çalışır (`scripts/probe-prisoner-system.ts` ile doğrulandı).
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

- [x] **9.1. Sol Alt HUD Menü İkonları ve Klan (`L`) — Krallık (`K`) Ayrımı (`src/components/GameHud.tsx`):** *(2026-10-26 yapıldı)*
  - Sol alt 6 ikonlu menü şeridi (`hud-dock`) gerçek Bannerlord sırasına (**C Karakter, I Envanter, P Parti, J Görevler, L Klan, K Krallık**) dizildi; oyuncu henüz bir krallığa katılmamışsa veya kendi krallığını kurmamışsa **Krallık (`K`)** butonu ve `KeyK` kısayolu kilitli/pasif hale getirildi (`L Klan` her zaman açık). Ayrıca savaş esnasında (`subMode !== 'overworld'`) harita kısayollarının (`R`, `V`, `N`, `B`, `C`, `I`, `P`, `J`, `L`, `K`) sızması engellendi.
- [x] **9.2. Şehir / Kale / Köy Menüsü ve Mülk Yönetimi Sınırları (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):** *(2026-10-26 yapıldı)*
  - Yabancı şehir ve kalelerde (`!isPlayerOwned`) **"Şehri/Kaleyi Yönet (Projeler)"** ve **"Garnizonu Yönet"** sekmeleri kapatıldı; yalnızca oyuncuya ait mülklerde (`isPlayerOwned`) açılır. `FORUM` binasının sahte `+8 Klan Namı` açıklaması ve etkisi kaldırılarak gerçek Bannerlord karşılığı olan `+1 Krallık Nüfuzu`na bağlandı (`8.6` kapsamında ikna ve yoldaş vasallaştırmadaki sahte nam sızıntıları da temizlendi). *(Not: Günlük inşaat gücü kuyruğu ve kaleye özgü ayrı bina ağacı Kapsam İlkesi gereği ileri fazda ele alınacaktır).*
- [x] **9.3. Köy Yağmalama (`Raid`), Zorla Erzak ve Zorla Asker Alma (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):** *(2026-10-26 yapıldı)*
  - Oyuncuya ait köylerde **"Düşmanca bir eylemde bulun"** sekmesi gizlendi (`!isPlayerOwned`). **"Köylüleri Erzak Vermeye Zorla"** ve **"Köylüleri Asker Vermeye Zorla"** eylemleri artık bağlı krallıkla savaş (`isAtWarWithPlayer: true`) ve ilişki cezası (`-15` / `-20`) doğuruyor. Ayrıca köy üst istatistik şeridindeki ve eşraf büstlerindeki tüm emojiler (`🔥`, `☀`, `⚔`, `🌾`, `🏰`, `⚒`) temizlenerek %100 SVG ikonlara geçirildi.
- [x] **9.4. Kuşatma Sekmesinin Yerleşim Menüsünün İçinde Olması (`src/components/SettlementModal.tsx`):** *(2026-10-26 yapıldı)*
  - `SettlementModal.tsx` sol menüsündeki mükerrer iç `settlement-siege-tab-btn` (*"Kuşatma Silahları & Surlara Taarruz"*) kaldırıldı; düşman şehir/kalelerde yalnızca dış kuşatma kampını (`SiegeEncounterModal`) başlatan kanonik **"Kale / Şehri Kuşat (Kuşatma Kampı Kur)"** butonu gösterilir.
- [x] **9.5. Arena ve Turnuva Sistemi (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):** *(2026-10-26 yapıldı)*
  - Turnuvaya katılım **ücretsiz** (`entryFee = 0`) yapıldı; kazanma ihtimali ordu gücü (`calculatePartyStrength`) yerine oyuncu kahramanının kişisel yakın dövüş/atletizm becerilerine (`oneHanded`, `twoHanded`, `polearm`, `athletics`) ve can oranına bağlandı; aynı şehirde günde en fazla 1 turnuva (`lastTournamentDay === state.day`) sınırı getirildi.
- [x] **9.6. Han (`Tavern`) — Kademeli Fidye Sistemi (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):** *(2026-10-26 yapıldı)*
  - Fidye aracısı (`ransomPrisonersAtTavern` ve `calculatePrisonerRansomValue`) esir yığınlarını (`prisonerStacks`) kademesine (`Tier 1..6` → `35, 50, 80, 120, 180, 260` Dinar) göre fiyatlandırıyor ve teslimatta `prisonerStacks` yığınlarını da sıfırlıyor. *(Han içi rastgele Gezgin/Wanderer diyalogla işe alma ve masa oyunu Kapsam İlkesi gereği ayrı içerik işidir).*
- [x] **9.7. Şehir Atölyeleri (`Workshops`) ve Demirci Ocağı Hilesi (`src/components/SettlementModal.tsx`, `src/game/rules.ts`):** *(2026-10-26 yapıldı)*
  - `Demirci Ocağı (smithy)` sekmesindeki tek tıkla sınırsız altın üreten 3 sahte silah dövme kartı kaldırıldı; şehir atölyelerine gerçek Bannerlord **`Klan Kademesi + 1`** (`calculateClanTier(state.renown).tier + 1`) üst sınırı hem `buyOrChangeWorkshop` kural motorunda hem arayüzde eklendi.
- [x] **9.8. "Bir Süre Burada Bekle" (`Wait Here`) Mekaniği (`src/components/SettlementModal.tsx`, `src/game/rules.ts`, `src/App.tsx`):** *(2026-10-26 yapıldı)*
  - Yerleşimde **"Bir süre burada bekle"** seçildiğinde artık hem komutan canı/morali ve yaralı askerler (`troopStacks[].wounded`) iyileşiyor hem de `advanceWorldDay` ile sefer zamanı/günü ilerletiliyor (0 saniyede sınırsız can/moral doldurma açığı kapatıldı).
- [x] **9.9. Takvim ve Mevsim Süresi Tutarsızlığı (`src/components/GameHud.tsx` vs `src/game/rules.ts`):** *(2026-10-26 yapıldı)*
  - `rules.ts#advanceDailyEconomyAndWorld` içindeki 10 günlük mevsim döngüsü gerçek Bannerlord takvimine (**1 Mevsim = 21 Gün, 1 Yıl = 84 Gün**, `Math.floor(((nextDay - 1) % 84) / 21)`) çekilerek `GameHud.tsx` ile birebir eşitlendi.
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
  - **İlerleme (2026-10-24): B1 + B2 tamam.** B2 = 10.9 (sınıflar + gerçek ağaçlar). B1: savaş ayrı misyona taşındı — `battlefield.ts` karşılaşma noktasından arazi profili üretir (nehir yatağı oyma + köprü eşleşmesi, orman maskesine bağlı serpme, köy evleri, yaklaşma vektöründen doğuş kenarları; `probe-battlefield` doğrular), `battleTerrain.ts` sahneyi kurar (460×460, kırmızı yumuşak sınır şeritleri), `BattlefieldView.tsx` misyonu koşar (suda/yokuşta yavaşlama, köprü güvertesi zemini, sınıf şeritleriyle doğuş, oyuncu bayılınca taraf savaşmaya devam eder). WorldCanvas'taki arena savaşı (~800 satır) ve arcade katman (dash/stamina/kombo/hitstop/telegraph/sarsıntı + telemetri alanları + bedelsiz "Haritaya Çekil") silindi; BattlePrewarm ipuçları gerçeklerle değiştirildi. Kalan: B4 emirler/bölük AI, B5 1:1 ölçek+takviye (şimdilik taraf başı ≤60 aktör, kayıplar orantılı), B6 yönlü dövüş/mermi/at, B7 moral/Tab/çekilme/esaret (yenilgi hâlâ `gameover`a gidiyor).
  - **B3 çekirdek tamam (2026-10-24):** Oyuncu tarafında ≥20 askerde savaş konuşlanma fazıyla açılıyor (Bannerlord eşiği ~20 — e1.7.0 Order of Battle). Saf mantık `deployment.ts` (+ `probe-deployment`): 4 sınıf bölüğü Bannerlord numaralarıyla (1 Piyade, 2 Okçu, 3 Süvari, 4 Atlı Okçu), diziliş bölgesi (x ±175, z 55–218), yuva çözümü `tacticalFormation.computeFormationSlots` çekirdeğinin sınıf aralığı + cephe genişliği sarmalı (Hat/Kalkan Duvarı/Seyrek/Kama çekirdekten, Çember/Kare/Kol eklendi; dokunmadan başlanırsa diziliş B1 şeritleriyle birebir — probe kilitli). BattlefieldView: taktik kamera (WASD+tekerlek), kart/1–4 seçim, sol tık yerleştir, sağ tık sürükle yön, F diziliş, [ ] cephe, Q/E döndür, Enter/Başla; diziliş+cephe tercihleri savaşlar arasında kalıcı. Canlı kanıt: `tools/e2e/b3-check.mjs` (70 asker: panel+taşıma+diziliş+yön+başla) ve `b1-check` (6 asker: konuşlanma yok, doğrudan savaş). **B3 kalıntıları:** filtreler (Kalkan/Mızrak/Fırlatma/Ağır) + yüzde kaydırıcısıyla özel bölükler 5–8 ve kaptan atama — aktör = tekil asker tipi (B5) ve sahada kahraman aktörleri ister; bölük başına başlangıç emri B4 emir modeliyle gelecek; bölük kartlarında mühimmat/moral ilgili sistemlerle (B5/B7). Konuşlanma sonrası bölükler savaş içinde dizilişi koruyarak hareket etmiyor (hedefleme bireysel) — formasyon bütünlüklü hareket B4 işi.
  - **B4 çekirdek tamam (2026-10-24):** Bölükler artık her meydan savaşında ve **iki takım için de** kuruluyor (yalnız konuşlanma gösterilen savaşlarda değil); konuşlanma gösterimi yine ≥20 askerde. Eski uydurma global 4 emir (App `activeOrder`, GameHud emir düğmeleri, `TacticalOrder` tipi) tamamen kaldırıldı; yerine araştırılmış Bannerlord komuta ağacı geldi: seçim **0 Tümü / 1 Piyade / 2 Okçu / 3 Süvari / 4 Atlı Okçu**, **F1 Hareket** (Konuma Git — bakış noktasında yeşil konum sancağı, Beni Takip Et, Hücum, İlerle, Geri Çekil, Dur, Ricat), **F2 Yön** (Sancak yönüne/Düşmana), **F3 Diziliş** (Hat/Kalkan Duvarı/Seyrek/Çember/Kare/Kama/Kol — sınıfa uymayan diziliş reddedilir), **F4 Ateş Serbest/Ateş Kes**, **F6 Komutayı Devret**, **F9 Geri**; savaş içinde **[ ]** cephe ve **Q/E** döndürme de çalışır. Formasyon bütünlüklü hareket: bölük çapası emre göre yürür, aktörler slotlarını korur (uzakta hızlanarak yetişir), yalnız temas/menzil içinde bireysel dövüşe girer; Hücum düzeni bozar, süvari hattı geçip geride toplanarak çevrim hücumu yapar; okçu İlerle'de menzil bandında durur; Ricat eden aktör kendi kenarından ayrılır ve kayıp sayılmaz (kurallı çekilme bedeli B7'de). Düşman bölükleri devredilmiş şablon AI ile davranır (piyade yaklaşınca hücum, okçu menzilde tutar, süvari yakında hücum, atlı okçu taciz); oyuncu bölükleri konuşlandıkları yerde durur (Bannerlord varsayılanı). HUD telemetrisi artık seçili bölük emir özetini gösterir; savaş içi komut paneli bölük kartları + bağlamsal F menüsünden oluşur. Canlı kanıt: `tools/e2e/b4-check.mjs` (seçim + F1 menü + İlerle/Ateş Kes + F3 Kalkan Duvarı + Tümü Hücum + temas/kayıp), `b1-check` regresyonu yeşil. **Bilinçli ertelenenler (kapsam ilkesi):** F5 Ata Bin/İn (ayrı at aktörü B6 ister; F5 tarayıcı yenilemesiyle de çakışır), F3 Serpinti (Scatter — rastgele dağılım, düşük getiri), F7 Transfer (bölük paylaşımı; B5 tekil asker modeliyle), konuşlanma ekranında bölük başına başlangıç emri seçimi (emir modeli hazır, UI sonra), güç oranına göre hücum/savunma başlangıç şablonu (şimdilik mesafe temelli kaptan AI), kartlarda mühimmat/moral (B5/B7 sistemleri). Not: tüm bölüklere Ricat verilse bile oyuncu komutanı sahada kaldığı için savaş bitmez (tek başına dövüş sürer) — kurallı çekilme B7.
  - **B5 çekirdek tamam (2026-10-24):** 1 aktör = 1 asker. Taraf başına 60 aktör sıkıştırması ve sınıf bazlı orantılı kayıp yazısı kalktı; yerine araştırılmış Bannerlord modeli geldi (TaleWorlds MissionSpawnSettings): saf mantık `reinforcements.ts` (+ `probe-reinforcements`) — saha bütçesi (yerel "savaş büyüklüğü": 200, vekil model maliyeti; B6 instancing ile yükselecek) ordu büyüklüklerine **orantılı** paylaştırılır, bir taraf en çok **%75** pay alır; sığmayanlar yedekte bekler; tarafın sahadaki mevcudu ilk dalganın **yarısına** düşünce ~3 sn'lik kontrolle eksik kadar **takviye dalgası** kendi konuşlanma kenarından girip bölüğüne koşar (sınıf bileşimi "dengeli" tahsisle korunur — kadro sınıf tabanlı olduğu için kademe sıralı doğuşun karşılığı budur). Kayıplar bire bir: ölen aktör = kadrodan bir asker; ricatla ayrılan ve hiç çıkmayan yedek kayıp değildir; savaş ancak saha+yedek tümüyle tükenince biter. Zaferde düşman kadrosunu zorla %25'e indiren uydurma ceza iki kopyasından da (`rules.ts resolveBattleOutcome`, `lootTransaction.ts`) kaldırıldı. HUD toplamları yedekler dahil tam orduyu gösterir. Canlı kanıt: `tools/e2e/b5-check.mjs` (yeni `big-battle` senaryosu 130v130: konuşlanma ilk dalga 100, hücum sonrası canlı yarıya inince çıkan toplam 100 → 130) + b4/b1 regresyonları (b4'te kartlar artık 20/20 tam kadro). **B5'ten B7'ye bilinçli devirler (araştırıldı, sonuç akışıyla gelecek):** yaralı/ölü ayrımı formülü `1 - 1/(1 + 0.03·seviye + 0.01·Tababet)` (şu an kayıplar düz ölü yazılıyor; formül asker seviyesi ister — kademe sistemi aktöre indiğinde bağlanacak), esir kazancının düşman yaralılarından türemesi (şimdilik `lootTransaction`da %35 düz oran duruyor; lordun `wounded + %35` yazısıyla çift sayım da B7'de temizlenecek), dalga sayısı ayarı (Bannerlord'da 3/5/sınırsız seçenek; bizde yedek bitene kadar) ve kahraman ölüm şansı (%2 taban). B3 kalıntıları notu: filtreli özel bölükler (5–8) + kaptan atama artık tekil asker tipine (kademe ağacının aktöre inmesine) bağlı; B6 model/at işiyle birlikte ele alınacak.
  - **Kullanıcı bildirim paketi düzeltildi (2026-10-24, B6 öncesi):**
    - *Savaş zemini:* koyu yeşil taban kaldırıldı; `battlefield.ts` köşe renkleri açık kırmızımsı kuru kum/bozkır tonuna çekildi + iki ölçekli gürültü güçlendirildi; tutamlar 700 → 1600, kuru ot rengi (kar biyomu hariç).
    - *Komutanın "kutusu":* `proceduralModels` atında bacak yokmuş (gövde+boyun+koni baş) — dört bacak (koyu çorap), kuyruk, eyer+hizi örtüsü, ağızlık/kulak/yele eklendi; binici bacakları yanlara açıldı.
    - *Turuncu üniforma + "ışığı kapalı" parçalar:* gövde artık hizi renginin solmuş kumaş tonu (tam renk kalkan/sancak/bardakta); yüksek metalness ortam haritasız simsiyah gösteriyordu → çelik/altın/ağır zırh metalness düşürüldü, deri açıldı.
    - *Menü açılışında FPS düşüşü + kayma isteği:* tam ekran menü köklerinden `backdrop-blur` kaldırıldı (canlı WebGL üzerinde bulanıklaştırma pahalıydı), `modal-anim-in` kayma animasyonu eklendi (Parti/Karakter/Envanter/Asker Alımı/Duraklatma/Ganimet/Karakter Oluşturma).
    - *Asker çubukları:* diyalog güç çubuğu + parti XP çubuğunda raydaki çift çizgi (border) kaldırıldı; dolgu artık kenardan başlıyor.
    - *Asker detay kartı:* Parti ekranında satırın üstüne gelince sabit detay kartı (kademe/sınıf/asıl hat, mevcut+yaralı, maaş, sağlık/saldırı/savunma/hız, XP, terfiye hazır sayısı, terfi yolları + at gereksinimi).
    - *Mavi ünlem:* sorun rozeti zaten camgöbeğiydi; ipucu kartındaki "Mevcut bir sorunu var" satırı da maviye çevrildi.
    - *Buğday ikonu:* tahıl ikonu (ItemIcon) çapraz yapraklı çizim yerine kesişmeyen daneli tek parça başak olarak yeniden çizildi.
    - *Diyalog kamerası:* diyalog açılınca kamera, birlik o an haritada görünmese bile lordun birliğine yakınlaşıyor (oyuncu+lord aynı Karede).
    - *Kervan koruma görevi ("sürücüler"):* görevde fiziksel kervan yokmuş — artık kervan (4 kişilik görsel grup) çıkış köyünde bekliyor, oyuncu yanına varınca arkasına takılıp hedefe kadar izliyor (`quests.ts` `originSettlementId` + WorldCanvas). Yolda açılan ani diyalog = haydut yakalaması (görev metnindeki baskın riski; Bannerlord düzeni).
    - *Ordu sayıları denetimi:* lord partileri 22–40 başlar, takviye tavanı 60; garnizon toparlanma tavanı şehir 70/kale 50/köy 12; milis savunma formüllerinde sayılıyor (0,3–0,55 ağırlık). Görülen 300/900'ler birleşik **ordu** (birden çok parti) ve güç puanı toplamları — Bannerlord'da da böyledir; tek tek parti/garnizon sayıları zaten mütevazı. Yeni oyun başlangıcı da zaten gerçekçi düzende (0 asker, 1000 dinar; eski kayıtlar eski hâliyle sürer). Körlemesine sayı kısılmadı; dengesizlik görülürse kanıtla ayrıca bakılacak.
  - **B6 faz planı (araştırma tamam, uygulama sırası):** (a) gerçek mermiler + sınırlı cephane (taban: sadak ~30 ok; okçu 1 sadak = 30, atlı okçu 2 sadak = 60; bitince yakın dövüşe geçer), (b) oyuncuda yönlü saldırı (4 yön: sol/sağ savurma, tepeden, dürtme — fare hareketi yönüyle; ekran yön okları), (c) model yükseltme (instancedArmyRenderer entegrasyonu veya vekil modelin zenginleştirilmesi — maliyet incelemesi sürüyor), (d) ayrı at aktörü (at canı, binici düşme, F5 bin/in, kargı hamlesi), (e) oyuncu hasarının kuşanılmış eşya/beceriden gelmesi. Chamber/feint gibi ileri teknikler kapsam ilkesiyle ertelendi.
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

- [x] **10.12. Önceden kırmızı problar (`probe-hud`, `probe-ui-session`):** *(2026-10-26 yapıldı)* `probe-ui-session.ts` 10 katmanlı `UI_LAYER_ORDER` ile, `probe-hud.tsx` 6 ikonlu Bannerlord sol alt menü şeridi (`C, I, P, J, L, K`) ile hizalandı ve her iki probe `package.json` `verify:fast` zincirine eklendi.

- [x] **10.13. B1 sonrası kullanıcı QA paketi (kuşatma görünürlüğü, WASD, beceri menüsü, savaş hissi):** *(2026-10-24 yapıldı; kanıt: e2e `b1-check`/`skills-check`/`siege-zoom-check` ekran görüntüleri)*
  - Kuşatma ancak kuşatan varıp kampı Kurunca başlar/görünür (`besiegedSettlementIdSet` varış koşulu); kamp halkası zoom ≤320, motor/duvar işaretleri ≤175 iken görünür — Bannerlord'da kuşatma ikonu küçüktür ve ancak zoom yapınca görünür, motor detayı kuşatma ekranındadır (Steam topluluk tartışması + Fextralife siege rehberi). Eski hâlde SIEGE emri verilen an şehir haritadan "kuşatılmış + 4 mancınık" görünüyordu.
  - Köy üretiminin yeni save'den haritada görünmesi Bannerlord doğrusu — sorun değil: TaleWorlds Blog 12 "it is now possible to see what a village produces by looking at its icon".
  - Meydan savaşı A/D tersliği düzeltildi (D artık kameraya göre sağa gider); simülasyon 1/60 sabit adım + akümülatör (düşük FPS'te ağır çekim yok); WorldCanvas savaşta sökülmeden `isRenderPaused` ile donuyor (harita sıfırlanması bitti); savaşta Pause sahneyi sökmüyor.
  - Savaş hissi: sık formasyonlar, formasyon + oyuncu sancağı, arazi renk tanesi, instanced çim/fundalık, ACES 1.08, yumuşak sınır soluklaştırıldı. [ ] Kalıntı (B6): aktörler hâlâ sefer-ölçeği bloklu modeller — tam rig + instanced render B6'da; BattlefieldView cleanup'ında materyal dispose eksik.
  - Beceri menüsü sadeleştirildi: solda tek satırlık nitelik başlıkları + kompakt beceri karoları + 5 odak çentiği; sağda tek satırlık beceri özeti, kademe başına iki perk düğmesi ve tek perk detayı (hover/tıkla). Katalog kapsamı (beceri başına 2 kademe) 10.10'da duruyor.
  - Harita FPS: kuşatma işaretlerinin DOM yazıları değişim-kontrollü; gerçek profilleme (SwiftShader temsili değil) ve kalan etiket yazılarının kapılanması B-perf işi olarak açık.
  - AI kuşatmalarında `siegeEngines` hiç üretilmiyor (yalnız oyuncu kuşatması + test senaryosu doldurur; B8 kuşatma turunda AI motor üretimi ilerlemeye bağlanacak).
- [x] **10.14. Performans + denge denetimi (2026-10-24; rapor: `docs/DENETIM_2026-10-24_PERFORMANS_VE_DENGE.md`):** *(ölçüldü: `tools/e2e/perf-check.mjs` + `scripts/probe-balance.ts`)*
  - ✅ Düzeltildi: `createWarriorModel` geometri (19+ yapıcı) + malzeme (çelik/deri/altın/yün + fraksiyon kumaşı cache) modül-paylaşımlı; `armorMat` vuruş parlaması için aktör bazlı kaldı. Kuruluş sivrilikleri 1477→659 ms (uzun görev ≥50 ms: 25→17), heap 73→65 MB. BattlefieldView temizliği malzemeleri de dispose ediyor (10.13 kalıntısı kapandı).
  - ✅ Düzeltildi — **kademeye göre maaş**: `calculatePartyDailyWage(state)` `troopStacks` varsa birlik tanım ücretlerini (`TroopDefinition.wage`) toplar, yoksa sınıf ücretine düşer; `advanceDailyEconomyAndWorld` ve GameHud günlük maaş gösterimi aynı tek kaynağı kullanır. Önceki düz sınıf ücreti elit kadroyu acemi fiyatına çalıştırıyordu (rules.test beklentisi güncellendi, fark +69 dinar).
  - 🟠 **Asıl savaş perf çözümü hâlâ B6(c) instancing**: paylaşım bellek/kuruluşu düzeltir ama draw-call sayısını düşürmez (büyük savaş SwiftShader p95 ~950–1083 ms bandında kaldı). Yakın zumda (p95 94–126 ms, uzun görev 0) maliyet çizim/gölge — gölge haritası boyutu/kademesi ayrıca bakılacak. Paket ~2,0 MB tek chunk; kod bölme ağrı yaratırsa yapılacak.
  - 🟠 **DÜNYA-SİM (yeni büyük madde):** `probe-balance` 120 gün sim: şehir/kale dağılımı gün 0/30/60/120'de birebir aynı; WAR olayı 309, kuşatma anan olay 5, **fetih 0**. Lord partileri (medyan 32, max ~63) garnizon+milis savunma ağırlığını (~99) kıramıyor; harita fetih ekseninde donuk. İlaç: AI sefer ordusu (army) kavramı + kuşatma gücü dengesi — ayrı paket (B6 sonrası, B7 ile birlikte değerlendilecek).
  - 🟢 Savaş dengesi notları: süvari her sınıfı 3–4 vuruşta (4–5,5 sn) öldürüyor; okçu (5,2) piyadeden (5,0) hızlı ve ıskalamasız menzil ateşiyle yakalanamıyor → kite riski. İlaç B6(a) (mermi/isabet/cephane) + B6(d) at canı içinde; stat çıpası gözden geçirmesi B6(a) ile birlikte.
  - Sağlıklı doğrulananlar: erken oyun ekonomisi (17 asker 89 dinar/gün, 8 düşenli zafer 296 dinar), nam/kademe eşikleri, WorldCanvas'ta Karede-başı tam sim yok (kuşatma 20 / token 672 kapaklı), kapanmayan rAF/listener bulunmadı.
- [x] **10.15. Kullanıcı hata bildirimleri paketi (2026-10-24; prob: `scripts/probe-user-reports.ts`, canlı: `tools/e2e/user-report-check.mjs`):** *(yeni özellik yok — yalnız düzeltme)*
  - ✅ **İsimsiz 3–4 kişi:** Kervan Koruma görev görselinin 4 takipçi figürü oyuncu konumunda doğup görünür olur olmaz çıkış köyüne koşuyordu (görev günlüğü sentetik: ESCORT kabul edilmeden de `ACTIVE`). Artık çıkış ilk çözüldüğünde figürler doğrudan köye yerleştirilir; oyuncunun yanında belirme/koşma yok. (İlgili tamamlayıcı eksikler ayrı madde: görev kabul akışı yok, kervan figürlerinde isim levhası yok.)
  - ✅ **Sıkışma bekçisi:** `stepLordCampaignRoute`a net-ilerleme bekçisi: rota noktası varken 4 sim saniyesinde 2 birimden az net yol alınırsa (kıyıda teğet-kayma salınımı) nokta atlanır; partiler sonsuza dek aynı noktada takılı kalamaz.
  - ✅ **Rapor şeridi solar:** sol alt olay şeridi yeni olayda belirir, 7 saniyede solar (opaklık canlıda 1→0 ölçüldü); kalıcı kayıt "Raporlar" panelinde.
  - ✅ **"Asker topluyor ama azalıyor":** iki kök neden düzeltildi — (a) iaşe yalnız asker alınırken doluyordu: garnizonunda bekleyen tavan-üstü lord açlıktan eriyordu (prob öncesi: 100→90 asker/2 gün, erzak 1→0; sonrası: 100→100, erzak 1→11; ayrıca evinde olan lord aynı tik içinde açlık cezası almaz), (b) etiket yoldayken de "garnizonunda asker topluyor" diyordu: artık varışa kadar "garnizonuna takviye almaya gidiyor".
  - [ ] **Bilinen eksik (bu turda eklenmedi — kullanıcı talimatı):** sentetik görev günlüğü görevleri kabul edilmeden aktif sayıyor; gerçek kabul akışı (Bannerlord: görev verenle konuşup alma) ve kervan partisi isim levhası ayrı iş.

---

## 🚀 BÖLÜM 7 — 2026-10-27 KULLANICI ONAYLI ADIM ADIM YOL HARİTASI (SAVAŞ MEYDANI v1, KLAN MENÜSÜ VE HARİTA SAVAŞLARI)

> **Çalışma Kuralı:** Her yeni adım kodlanmadan önce kullanıcıya sunulup açık onay alınır; tamamlandığında testlerle (`verify:fast`) doğrulanır.

- [x] **11.1. Savaş Meydanı v1 — Adım 1: At Rig/Animasyonu, Sağ El Bayrakların Kaldırılması ve `F` ile Attan İnme/Binme (`src/game/proceduralModels.ts`, `src/components/BattlefieldView.tsx`, `scripts/probe-battle-combat.ts`):** *(2026-10-27 yapıldı)*
  - Askerlerin ve komutanın sağ elinde tuttuğu formasyon bayrakları (`createFormationBanner`) tamamen kaldırıldı.
  - At modeli iki eklemli (dizden bükülen `horseLegs` + `horseKnees`), yuvarlatılmış göğüs/sağrı, dörtnala ritmik baş-boyun (`horseNeck`) ve hızla savrulan kuyruk (`horseTail`) animasyonuyla yenilendi; binici grubu (`riderGroup`) ayrıştırıldı.
  - **`F` tuşu (`KeyF` / `KeyZ`)** ile attan inme/binme eklendi: attan inildiğinde at 3B savaş alanında olduğu yerde nefes alarak bekler (`dismountedHorse`), oyuncu yere (`y = 0`) inip yaya yürür; ata `3.8m` yaklaşıldığında `🐎 [F] Ata Bin` ipucu çıkar ve tekrar binilebilir.
- [x] **11.2. Sağ Alt HUD `"Sancak Birliği: 0"` Hatası Düzeltmesi — Oyuncu ve Ağabey/Yoldaşların Sayılması (`src/game/rules.ts`, `src/components/GameHud.tsx`, `src/components/WorldCanvas.tsx`, `src/components/PartyModal.tsx`, `scripts/probe-hud.tsx`):** *(2026-10-27 yapıldı)*
  - `getPlayerPartyHeadcount(state)` eklendi: oyuncuyu ve partideki aile/yoldaş kahramanları (`isInPlayerParty !== false`) parti mevcuduna dahil eder (`LordAgent.armySize === getTotalTroops(roster)` kuralını bozmadan).
  - Gerçekçi yeni oyun başlangıcında (`realisticBannerlordStart: true`, 0 asker + Oyuncu + Ağabey Niasen) sağ alt HUD (`#12 Birlik & Kalkan`), harita üzerindeki oyuncu sancağı ve Parti ekranı (`P`) artık `0` yerine **`2`** (`2 Kahraman · 0 Asker`) gösterir.
- [x] **11.3. Savaş Meydanı v1 — Adım 2: Birim Çarpışması, Kalkan Bloklama, Basılı Tutarak Silah Hazır Bekletme (`Hold-to-Chamber`), Yön Okları ve Okçu/Piyade/Süvari Muharebe Yapay Zekası (`src/game/battleCombat.ts`, `src/game/proceduralModels.ts`, `src/components/BattlefieldView.tsx`, `scripts/probe-battle-combat.ts`):** *(2026-10-27 yapıldı)*
  - **Sol Tık Basılı Tutunca Hazır Bekletme (`READY`) ve Bırakınca Savurma (`ACTIVE`):** `stepPlayerAttackState` ile oyuncu sol tıka (`LMB`) basılı tuttuğu sürece kılıç hemen savrulmaz; seçilen yönde (`UP / DOWN / LEFT / RIGHT`) elini savurmaya hazır bekletir (yayda kirişi gerili tutar) ve yalnızca sol tık bırakıldığında (`MouseUp`) savurma/atış gerçekleşir. Hazır beklerken sağ tıka (`RMB`) basılırsa saldırı iptal (`feint`) edilip anında bloğa geçilir.
  - **Saldırı ve Savunma Yönüne Göre HUD Okları (`computeDirectionalReticleState`):** Oyuncu saldırı hazırlarken/savururken altın sarısı, savunma/blok yaparken çelik mavisi kavisli Bannerlord SVG yön okları (`reticle-arrow-up/down/left/right`) ve Türkçe durum etiketi (`Hazır (...) — Bırak: Vur` / `Blok (...)`) ekran ortasında belirecek şekilde bağlandı.
  - **İç İçe Geçmeyi Önleyen Kalkan Hattı Çarpışma Çözücüsü (`resolveBattleActorCollisions`):** Çok-iterasyonlu kütle ağırlıklı ayrım çözücüsüyle dost birimlerin omuz omuza (`1.08m` kalkan duvarı, `1.22m` normal) dizilmesi, karşıt cephelerin birbirinin içinden geçememesi (`1.38m` sert cephe bariyeri + içe doğru normal hızın sıfırlanması) ve dörtnala (`>= 7.8 m/s`) çarpan süvarilerin piyadeleri sarsıp çiğneme hasarı (`CavalryTrampleEvent`) vermesi sağlandı.
  - **Sınıf Muharebe Yapay Zekası:** Piyadeler ok yağmuru altında ve kalkan duvarında kalkan kaldırır, silah erişim mesafesinde (`1.75m`) durup çarpışır; okçular parabolik 3B ok atar ve sadağı bitince ya da düşman `3.4m` yaklaşınca otomatik kılıca geçer; süvariler koltuklanmış kargı ve döngüsel taarruz (`ATTACK` -> `REGROUP`) uygular.
- [ ] **11.4. Savaş Meydanı v1 — Adım 3: Moral / Bozgun (`Routing`), `Tab` Muharebe Skoru ve Savaş Sonu Esir / Ganimet Akışı (`src/components/BattlefieldView.tsx`, `src/App.tsx`):**
  - Ağır kayıp veren tarafın moralinin kırılıp harita sınırına doğru kaçması (`ROUTING`).
  - `Tab` tuşuyla canlı muharebe özeti (*Sağlam / Yaralı / Ölü / Kaçan*) ve kurallı geri çekilme.
  - Savaş bittiğinde gerçek yaralı/ölü ayrımı, esir alma ve ganimet ekranına (`BattleLootModal`) geçiş.
- [ ] **11.5. Bannerlord Klan Menüsü (`L` Kısayolu — ` src/components/ClanModal.tsx`, Görsel ve Metin Araştırmalı):**
  - Krallık (`K`) ekranından bağımsız, oyun başından itibaren her zaman açılabilen gerçek Bannerlord **Klan Ekranı (`L`)**.
  - **Üst Başlık:** Klan Sancağı, Klan Adı değiştirme, Klan Kademesi (`Tier 0..6`) ve Nam (`Renown`) ilerleme çubuğu, Günlük Gelir/Gider özeti.
  - **4 Ana Sekme:**
    1. **Üyeler (`Members`):** Oyuncu, Ağabey/Aile üyeleri ve Yoldaşlar; konumları, sağlık durumları ve **4 Klan Rolü Ataması** (*İaşeci, İzci, Cerrah, Mühendis*) + Vali / Parti Lideri atama.
    2. **Birlikler (`Parties`):** Oyuncunun ana birliği, klan üyelerinin yönettiği ek klan partileri (asker mevcudu, maaş sınırı, tutumu: *Saldırgan / Savunmacı / Dengeli*) ve kervanlar.
    3. **Tımarlar (`Fiefs`):** Klana ait şehirler, kaleler ve bağlı köyler; refah, sadakat, güvenlik, garnizon, vergi geliri ve vali ataması.
    4. **Diğer (`Other`):** Klana ait **Atölyeler (`Workshops`)**, **Kervanlar (`Caravans`)** ve detaylı **Finans (Gelir / Gider) Dökümü**.
- [ ] **11.6. Harita Üzeri AI-AI Lord Savaşları (`MapEvent`), Kuşatma Asker Düşüşü ve Yardıma Gitme (`src/game/worldSim.ts`, `src/components/WorldCanvas.tsx`, `src/components/SiegeEncounterModal.tsx`):**
  - Düşman lord partileri haritada çarpıştığında veya kuşatma yapan bir lordun (ör. Rhagaea) üzerine savunma/destek orduları geldiğinde iç içe geçip beklemek veya anında el değiştirmek yerine **aktif harita muharebesi (`MapEvent`)** başlaması.
  - Savaşan lordların ve kuşatılan yerleşimlerin üzerinde çapraz kılıç / kuşatma göstergesi, bilgi kartında **"Savaşıyor: [Karşı Taraf]"** / **"Kuşatma Altında"** yazması ve her iki tarafın asker sayısının zaman aktıkça **kademeli olarak düşmesi** (canlı erime / attrition).
  - Oyuncunun haritada süren bir AI-AI meydan savaşına veya kuşatma muharebesine tıklayarak müttefik/dost tarafa **destek olarak savaşa katılabilmesi** (veya düşmana saldırabilmesi).
