# Denetim 2026-10-24 — `YAPILACAKLAR_LISTESI.md`'de "Yapılanlar" Ne Kadar Doğru + Doğru Savaş Meydanı Nasıl Olmalı?

> **Kural:** Bu denetim, `AGENTS.md` → **Altın Kural** ile yapıldı: önce Bannerlord karşılığı
> **hem metin hem görsel** araştırıldı, sonra kodumuzla karşılaştırıldı.
> **Kapsam:** `YAPILACAKLAR_LISTESI.md` Bölüm 1 + ADIM 1–7 içindeki `[x]` maddeleri ve Bölüm 4
> (8.1–8.16); ayrıca haritada lordla girilen **meydan savaşı**.
> **Kod durumu:** `main@58e2d73` + `c41bd78` (Altın Kural dokümantasyonu).
> **Not:** `docs/BANNERLORD_KARSILASTIRMA_VE_PUANLAMA.md` (21 Ekim) bu konsolidasyondan
> **önce** yazılmıştır (örn. perk sayısını 0 sayıyor); güncel hüküm için bu rapor esastır.

---

## 0. Yönetici özeti (kısa cevap)

| Soru | Cevap |
|---|---|
| Yapılanlar genel olarak ne kadar iyi? | **İskelet/kapsam ≈ 7/10, Bannerlord sadakati ≈ 5,5/10, sayı/formül doğruluğu ≈ 4,5/10.** Ekran düzenleri çoğu yerde Bannerlord'a yaklaştırılmış; ama formüllerin önemli kısmı araştırılmış değer değil, "Bannerlord'a benzer uydurulmuş katsayı". |
| En doğru yapılanlar | Üç sütunlu Envanter/Pazar/Ganimet akışı (bekleyen transfer + `Bitti/Vazgeç`), Discard bağış XP'si (perk eşikleri ve kademe tavanları doğru), taşıma kapasitesi çekirdeği (asker/binek +20, yük hayvanı +100), kayıt göçü disiplini, kuşatmanın **sefer katmanı** (kamp/rezerve/gedik) fikri. |
| En yanlış "[x]" iddiaları | ① Proje şu an `tsc`den **geçemiyor** ve `npm ci` temiz makinede **çalışmıyor** — "doğrulandı" başlığı buna rağmen duruyor. ② "Tam Perk Kataloğu" denilen katalogda yalnız **42 perk** var. ③ Kültür bonusları eski+yeni Bannerlord karışımı ve bir kısmı yalnız kart metni. ④ Asker toplamada icat edilmiş **1 gün bekleme (cooldown)** Bannerlord'da yok. ⑤ Meydan savaşı (8.10/8.13) "gerçek kadro/coğrafya" dese de fiilen 28+28 kişilik bir arena dövüşü. |
| Savaş meydanı neden Bannerlord'a benzemiyor? | Çünkü ayrı bir savaş **sahnesi** yok: sefer haritasının aynı arazi ağı üzerinde, 110×110'luk görünmez bir kutuda, birbirine ~32 birim mesafede karışık ızgara hâlinde doğan en fazla 57 aktör, en yakın düşmana tek tek koşuyor. Diziliş (Order of Battle) yok, bölük (formation) yok, Bannerlord emir sistemi yok, takviye dalgası yok, moral/bozgun yok, ok bile ışın (hitscan). Ayrıntı: Bölüm 4. |
| Doğru savaş meydanı nasıl olmalı? | Bölüm 3'te madde madde: bölgeye özel arazi sahnesi → diziliş fazı (8 bölük + kaptanlar) → bölük sınıfı davranışları → F-menüsü emirleri → orantılı ilk dalga + takviyeler → yönlü dövüş/mermi fiziği → moral-bozgun → sonuç/esir/ganimet ekranları. Bölüm 5'te bunu tarayıcı ölçeğine indiren uygulanabilir faz planı var. |

---

## 1. Yöntem ve ölçülen gerçekler

### 1.1 Araştırma (metin + görsel)

- **Metin:** TaleWorlds geliştirme yazıları ve Battle Terrain / Order of Battle duyurularını aktaran kaynaklar, Mount & Blade wiki sayfaları (Skills, Culture, Notables, Army Cohesion, Clan/Renown), bannerlordperks kod analizleri, güncel rehberler (RPS, Gamepur, GamerGuides, IGN vb.). Kullanılan bağlantılar metin içinde verildi.
- **Görsel:** Gerçek Bannerlord ekranları incelendi:
  - Meydan savaşı içi: ekranın üst ortasında iki renkli **göreli güç çubuğu**, sağ altta yalnız **can + at canı + mühimmat**, sol altta tek satır emir bildirimi ("Cavalry, Horse Archers: Charge"); karakter at sırtında, üçüncü şahıs kamera omuz arkasında; ufukta nehir/köprü/dağ, yani **arazi özellikleri** sahnede.
  - Battle Terrain bölge haritası: sefer haritasının beyaz çerçeveyle işaretli bir **bölgesinin (patch)** tek savaş sahnesine karşılık geldiği resmî görsel.
  - Order of Battle paneli (erken sürüm ekranları): koyu parşömen panel, üstte **Commander** portresi, altta bölük kartları (**Infantry 65 / Archers 13 / Cavalry 70 / Horse Archers 11**), kilit ikonları, yeşil **Done** düğmesi. Güncel (1.7+) sürümde bu, sahnenin üstten görünümünde bölük kartlarıyla **yerleştirme fazına** dönüştü (bkz. §3.3).
  - Karşılaştırma için bizim karelerimiz: `docs/renders/arena-player.png` (test arenası; web formu gibi üst/alt paneller, boş dairesel pist) — seferdeki lord savaşının güncel ekran görüntüsü repoda **yok**; bu bile tek başına bir eksiktir (görsel doğrulama kanıtı yok).

### 1.2 Kod ölçümleri (bu denetimde çalıştırıldı)

| Ölçüm | Sonuç |
|---|---|
| `npm ci` (README kurulum komutu) | ❌ **Başarısız.** `package.json` esbuild `^0.28.0` isterken `package-lock.json` 0.25.12 kilitli: "lock file's @esbuild/linux-x64@0.25.12 does not satisfy @esbuild/linux-x64@0.28.2". Temiz makinede proje README ile kurulamıyor. |
| `npm install --legacy-peer-deps` (geçici çözüm) | ✅ kuruldu (denetim sonrası lock dosyası geri alındı). |
| `npm run verify:fast` | ❌ **İlk adımda başarısız:** `tsc --noEmit` → `KingdomManagementModal.tsx` içinde **19 hata** (satır 642–738): `simFiefCountA/B`, `simStrengthA/B`, `sandboxParadoxReport` tanımsız. |
| `rules.test.ts` (tek başına) | ✅ 36/36 geçti. |
| Hızlı problar | ✅ `probe-encounter`, `probe-siege-encounter`, `probe-character-development`, `probe-army-and-siege-ai`, `probe-recruitment`, `probe-loot`, `probe-market`, `probe-test-harness` geçti. ❌ `probe-troops` 1 iddiada kaldı ("genel sınıf adı da yazılıyor"). |
| Perk kataloğu | **42 kayıt** (`perks.ts` `skillId:` sayımı), çoğu yalnız 25 eşiğinde; beceri başına 2 kayıt (oneHanded/steward 4). |
| Birlik tanımları | 112 kayıt ama şablon üretim: kültür başına aynı dallanma, adı değiştirilmiş kopyalar (§2.3). |
| Eşya tanımları | 60 (`ITEM_DEFINITION_BY_ID.size`). |

> **Bunun anlamı:** `YAPILACAKLAR_LISTESI.md` üst bilgisi "her madde gerçek kod tabanında kontrol
> edilerek `[x]` işaretlendi" diyor; fakat listenin kendisi `verify:fast`in kırmızı olduğu bir
> ağaca işaret ediyor. Özellikle **8.12/5** ("Krallık Divanı test/sandbox elemanları tamamen
> kaldırıldı") iddiası kodda **yanlış**: `KingdomManagementModal.tsx:623-740` arasında
> "Canlı Tımar-Güç Paradoksu Laboratuvarı" hâlâ duruyor, üstelik state'leri silindiği için
> projeyi derlenemez hâle getiriyor. Bu, Altın Kural'ın 2. maddesindeki "Bannerlord'la alâkasız
> sistem"in derslik örneğidir ve bu raporla görev listesine düzeltme olarak işlendi (§6).

---

## 2. "Yapılanlar" karnesi — küme küme hüküm

Puan = **Bannerlord'a sadakat** (10 = mekanik + sayılar + görsel birebir; 5 = fikir doğru, sayılar/yarısı uydurma; 0 = Bannerlord'da yok/yanlış). Kod temizliği puana dahil değildir.

| Küme | Puan | Hüküm (1 cümle) |
|---|---:|---|
| 1.1 Altyapı / P0–P1 veri temeli / kayıt-zaman | **7,0** | Üç sütun + bekleyen transfer + `Bitti/Vazgeç` ve v4 göçü gerçekten Bannerlord modeli; ama "doğrulandı" iddiası, kırık `tsc`/`npm ci` yüzünden bugün geçersiz. |
| 1.2 Envanter / Pazar / Ganimet / Lojistik | **6,5** | Düzen ve Discard doğru; kapasite çekirdeği doğru; fakat **erzak matematiği yanlış** (§2.1) ve hız katsayılarının çoğu icat (§2.2). |
| 1.3 Parti / birlik ağaçları / yaralı-tutsak / asker toplama | **5,0** | Parti ekranı iskeleti iyi; birlik ağaçları her kültürde aynı şablon ve yanlış dallanıyor (§2.3); parti/tutsak kapasite formüllerine uydurma kalemler eklenmiş (§2.4); toplama yuvaları erken-erişim değerleri. |
| 1.4 Karakter gelişimi / perk / klan rolleri | **4,5** | 18 beceri + 6 nitelik + 4 rol doğru çatı; fakat üretimde kullanılan öğrenme sınırı formülü yanlış olan **ikinci** kopya (§2.5) ve "tam katalog" 42 perkten ibaret. |
| 1.5 Kuşatma (sefer katmanı) + Ordu/Cohesion | **6,0** | Kamp, makine yuvaları, rezerve, gedik, 3 bağlam ve cohesion **kavramları** Bannerlord'a uygun; cohesion/çağırma **sayıları** uydurma (§2.6). Kuşatma **saldırı sahnesi** ise meydan savaşıyla aynı ilkel arena → o kısım 1-2/10 (bkz. §4). |
| ADIM 1 Yerleşim ekranı + etiketler | **6,5** | Sol dikey menü + canlı 3B arka plan + eşraf şeridi görsel olarak doğru yön; içerideki yönetim yetkileri hâlâ Bannerlord'a aykırı (zaten 9.2'de açık görev). |
| ADIM 2 HUD + gün içi zaman + kültür/zorluk | **5,5** | HUD döküm ipuçları fikri Bannerlord tooltip'leriyle aynı; ama kültür kartları eski/yeni karışımı ve kısmen uydurma (§2.7), 7'li menüde Klan/Krallık karışıklığı 9.1'de zaten itiraf edilmiş. |
| ADIM 3 Envanter↔Pazar eşitlemesi + Ticaret XP | **6,5** | Ticaret XP'sinin kârlı satıştan gelmesi doğru; pazar ortası ekipman şeridi Bannerlord pazarında da vardır. |
| 4.1–4.3 Hover kartı / ansiklopedi konumu / Barter | **6,0** | "En son X yakınlarında görüldü" ve çift sütunlu takas doğru sistemler; tatmin çubuğunun ve otomatik dengelemenin sayısal karşılığı araştırılmış değil, yaklaşık. |
| 7.3 Karşılaşma/ekonomi/sunucu düzeltmeleri | **7,0** | Haydut teslimiyeti ve teslimiyet suistimalleri gibi gerçek hataların kapatılması doğru iş; Bannerlord karşılaşma iskeleti (teslim ol / asker gönder / kaçış fedası) mevcut. |
| Bölüm 4 (8.1–8.16) toplu | **5,0** | Küçük düzeltmelerin çoğu gerçek; ama içinde **yanlış `[x]`ler** (8.12/5 sandbox, 8.11 "sıfır emoji" abartısı), **icat sistemler** (8.12/6 asker toplama cooldown'ı) ve **abartılı savaş iddiaları** (8.10/8.13) var. |
| **Meydan savaşı (lord savaşı)** | **2,5** | Bölüm 4'te kanıtlarıyla. Oyunun Bannerlord'a **en benzemeyen** ana sistemi; kullanıcının şikâyeti haklı. |

### 2.1 Erzak: fikir doğru, sayılar yanlış (`foodSystem.ts`)

- Bizde günlük talep: `ceil((asker+1)/4)` (`foodSystem.ts:79-85`) → 100 asker günde **25** yiyecek yer.
  Bannerlord'da parti tüketimi bunun yaklaşık **beşte biri** mertebesindedir (tek kişiyle 1 yiyecek
  ~20 gün gider; 20 asker günde ~1 yiyecek tüketir ölçeği). Yani askerlerimiz ~5 kat hızlı acıkıyor.
- Çeşitlilik morali bizde `0, +2, +5, +8, +12` (5 çeşitte tavan) ve yenebilir yalnız **5 tanım** var
  (tahıl, kurutulmuş et, tütsülenmiş balık, peynir, **zeytinyağı**). Bannerlord'da **9** yiyecek türü
  (tahıl, et, balık, peynir, tereyağı, üzüm, zeytin, bira, hurma) çeşitlilik moralini yaklaşık
  **tür başına +1, tavan +7/+8** (Gourmet perkiyle ×2) yapar; tek türde kalmak ceza da verebilir;
  zeytinyağı günümüzde yiyecek sayılmaz. Kaynaklar: çeşitlilik tavanı ve 9 tür için topluluk
  doğrulamaları ([Reddit: 9 foods for +7](https://www.reddit.com/r/Bannerlord/comments/zcd1sl/what_are_the_different_food_types/),
  [Gourmet = ×2](https://www.bannerlordperks.com/perk;skill=steward)).
- Ayrıca bizde moral, tok olunan **her gün** `+2 + çeşitlilik` diye üst üste ekleniyor (tavan 100);
  Bannerlord'da moral bir **hedef değere** yakınsar (baz 50 + kalemler), günlük birikimli artmaz.
- Açlıkta bizde en fazla 3 asker yaralanır; Bannerlord'da açlık her gün kademeli yaralanma ve
  moral çöküşüyle firara gider. **Sonuç:** sistemin şekli var, ekonomisi Bannerlord değil.

### 2.2 Lojistik/hız: doğru çekirdek, icat katsayılar (`logistics.ts`)

- ✅ Kapasite çekirdeği doğru: asker ve yedek binek **+20**, yük hayvanı **+100**
  ([GameRant](https://gamerant.com/mount-blade-2-bannerlord-how-increase-inventory-capacity/),
  [PC Invasion](https://www.pcinvasion.com/mount-blade-ii-bannerlord-how-to-increase-inventory-capacity-and-army-speed/)).
- ⚠️ Hız formülündeki kalem adları (süvari oranı, bindirilmiş yaya, sürü cezası, aşırı yük, yaralı/
  tutsak, arazi) Bannerlord hız ipucundaki gerçek kalemler; fakat `-0.018×N`, `3.0 × oran × sönüm`,
  moral `+0.14/-0.22` gibi katsayılar ve "İmparatorluk Taş Yolu çarpanı" araştırılmış değerler değil.
  Bannerlord'da olmayan kalem eklemek yerine, ipucundaki gerçek kalemler (örn. savaştan sonra
  **düzensizlik (disorganized)** cezası) bizde yok. Hüküm: **yaklaşık model**, "tekil Bannerlord
  modeli" denemez.

### 2.3 Birlik ağaçları: 112 kayıt, tek şablon (`bannerlordFoundation.ts`, `troops.ts`)

Bizde her kültür: Acemi → Piyade/Okçu/**Süvari** (T2'den!) ve uydurma bir **Muhafız (guard)**
dalı. Gerçek Bannerlord'da:

- Sıradan hat yalnız **piyade ve okçu** dallarına ayrılır; süvari/atlı okçu elitleri kültürün
  **soylu (noble)** hattındandır (örn. İmparatorluk: Vigla Acemisi → … → Katafrakt T5 → Elit
  Katafrakt T6). Bizde "İmparatorluk Kataphraktı" T3'te sıradan asker — hem kademe hem hat yanlış.
  Noble T6 listesi için bkz. [v1.4.x birlik listesi](https://game-rack.com/en/articles/en-bannerlord-v1-4-5-ultimate-unit-tier-lis-931).
- "guard" Bannerlord'da bir **savaş sınıfı değildir**; savaş sınıfları Piyade / Okçu / Süvari /
  **Atlı Okçu**'dur. Bizde atlı okçu sınıfı **hiç yok** (Kuzaitlerin varlık sebebi), onun yerine
  her yerde "guard" kovası akıyor (roster, savaş aktörleri, kayıp düşümü). Bu tek başına meydan
  savaşının Bannerlord'a benzememe sebeplerinden biridir.
- Terfide at/savaş atı istemek (soylu süvari hattı) fikri doğru; ama sıradan acemiden süvariye
  T2'de at istemek Bannerlord ağacına uymuyor.

### 2.4 Parti ve tutsak kapasitesi (`partySystem.ts`, `rules.ts:3637-3650`)

- ✅ Klan kademesi nam eşikleri **birebir doğru**: 50/150/350/900/2350/6150
  ([Fandom: Clan](https://mountandblade.fandom.com/wiki/Clan)).
- ✅ İaşeci katkısı `İdare × 0.25` doğru ([IGN](https://www.ign.com/wikis/mount-blade-ii-bannerlord/How_to_Increase_Party_Size)).
- ❌ Klan kademesi parti bonuslarımız (15, 25, 50, 75, 100, 125, 150) yanlış: doğru model,
  oyuncu partisinde Kademe 1'de +25, sonrasında kademe başına +15 birikimli (≈25/40/55/70/85/100)
  şeklindedir; Kademe 0 bonus vermez.
- ❌ Formüle eklenen `Liderlik × 0.15` ve `Nam / 50` kalemleri Bannerlord parti boyutu modelinde
  **yoktur** (Liderlik yalnız belirli perklerle verir; nam zaten klan kademesi üzerinden sayılıyor —
  çifte sayım). Parti boyutu bizde sistematik şişer.
- ❌ Tutsak sınırı bizde `10 + partiLimiti×0.4 + Haydutluk×0.1`; Bannerlord'da sınır, **o anki
  sağlıklı asker sayısının yaklaşık yarısıdır** ve yaralanınca düşer
  ([RPS](https://www.rockpapershotgun.com/mount-and-blade-2-bannerlord-prisoners-ransoming-and-recruiting-enemy-soldiers)).
  Kod yorumu "yarısı" deyip 0.4 kullanıyor; Haydutluk kalemi de icat.

### 2.5 Öğrenme sınırı: iki uygulama, üretimde yanlış olan kullanılıyor

- Bannerlord'da iki ayrı kavram var: **Öğrenme Sınırı (yumuşak, yeşil bar)** =
  `Odak×30 + (Nitelik−1)×10`; **ulaşılabilir tavan** = `4 + (Nitelik−1)×14 + Odak×40` (330'a kadar)
  ([Fandom: Skills](https://mountandblade.fandom.com/wiki/Skills_(Bannerlord))).
- `bannerlordFoundation.ts:1952-1961` bunu **doğru** yazmış ve test etmiş ✅.
- Fakat `characterDevelopment.ts:85-88` aynı adla `(Nitelik−1)×14 + Odak×40 + 10` formülünü
  tanımlıyor; `CharacterModal.tsx` ve `GameHud.tsx` (üretim arayüzü) **bunu** import ediyor ve
  `probe-character-development.ts` yanlış değeri (336) doğru diye kilitlemiş. Bu tam olarak
  `AGENTS.md` Kural 8 ihlâli: doğru yardımcı test ediliyor, üretimde ikinci/yanlış kopya çalışıyor.
  Sonuç: oyuncular yanlış öğrenme sınırı/hızı görüyor.

### 2.6 Ordu ve Cohesion: kavram doğru, sayılar icat (`armySystem.ts`)

- ✅ Cohesion 100'den başlar, gün gün düşer, 0'da ordu dağılır; +10'luk artış nüfuzla alınır;
  kendi klan partileri bedava çağrılır
  ([Fandom: Army Cohesion](https://mountandblade.fandom.com/wiki/Army_Cohesion),
  [Influence](https://mountandblade.fandom.com/wiki/Influence)).
- ❌ Bizim günlük kayıp (`-2 − üye×1.5 − asker/50 − açlık 5`) ve +10 maliyeti (`10 + üye×2`)
  araştırılmış formüller değil. Bannerlord'da +10 maliyeti, ordudaki partilerin **çağırma
  maliyetleri toplamına** bağlıdır; bedava partiler maliyete hiç girmez. Çağırma maliyetimizdeki
  `12 + kademe×4.5 + asker×0.34 + mesafe...` de aynı şekilde uydurma katsayılar. (Mesafe/ilişki/
  kademe/asker sayısı etkenleri gerçektir; katsayılar değildir.)

### 2.7 Kültür bonusları: eski-yeni karışımı + uydurma satırlar (ADIM 2.5 iddiası)

`CharacterCreatorModal.tsx:291-340` kartları, erken erişim döneminin bonuslarıyla güncel
bonusları karıştırıyor ve Bannerlord'da olmayan satırlar ekliyor:

| Kültür | Bizim kartımız | Gerçek (güncel) | Durum |
|---|---|---|---|
| Vlandiya | "askerler +%20 terfi XP'si; paralı geliri +%15" | +%20 birlik XP'si **eski** bonustu; güncel: savaştan +%5 nam, paralı iken +%15 gelir, kaleye bağlı köy üretimi +%10; ceza: orduya lord çağırma +%20 nüfuz | ⚠️ Eski+yeni karışık |
| Sturgiya | "karda hız cezası %20 azalır; kalkan duvarında piyade güçlenir" | Kar bonusu **eski** sürümde vardı; güncel: piyade toplama/terfi %25 ucuz, cohesion kaybı %20 az; "kalkan duvarında güçlenme" **yok** | ❌ Karışık + uydurma satır |
| İmparatorluk | "garnizon ücreti %20 az; inşa +%25 hızlı" | Garnizon ücreti −%20 güncel ✅; ama +%25 inşa **eski** bonusun (o da +%20 idi) bozulmuşu; güncel ikinci bonus: orduda +%25 nüfuz | ⚠️ İki dönemin yarımşar bonusu |
| Aseray | "kervan %30 ucuz, ticaret cezası %10 az; çölde ceza yok" | Aynısı ✅ (ceza: parti maaşı +%5 bizde yok) | ✅ (ceza eksik) |
| Kuzait | "atlıdan +%10 ekstra harita hızı; bozkırda devşirme ucuz" | +%10 hız **eski** bonus; güncel: atlı toplama/terfi %10 ucuz + hayvan üretimi +%25; ceza: şehir vergisi −%20 | ⚠️ Eski bonus |
| Batanya | "ormanda hız cezası %10 az; görüş +%15" | Ormanda hız cezası **%50** azalır; görüş +%15 ✅ | ❌ Sayı yanlış (%10 ≠ %50) |

Kaynak: [Fandom: Culture](https://mountandblade.fandom.com/wiki/Culture) ·
[BannerlordModding kültürel feat tablosu (1.2.12)](https://docs.bannerlordmodding.lt/modding/cultures/).
Ayrıca kart metinlerinin oyun matematiğine bağlandığı iddiası (2.5) doğrulanamadı: kültür
bonusunu okuyan merkezi bir mekanizma yok; kartlar büyük ölçüde **görsel metin** (araştırmada
ayrı bir `CULTURE_BONUS` uygulama noktası bulunamadı → varsa bile keşfedilemez durumda).

### 2.8 Diğer somut yanlış/icat "[x]"ler

1. **8.12/6 — Asker toplama 1 gün cooldown'ı icattır.** Bannerlord'da yerleşimden asker almak
   günlük kilide girmez; yuvalar boşalır, eşraf zamanla (günlük şansla) yenilenir, oyuncu aynı gün
   başka eşraftan/yuvadan almaya devam edebilir. `recruitment.ts:91` + `App.tsx:1269` Bannerlord'da
   olmayan sistem getirmiş. Altın Kural 2 gereği kaldırılıp gerçek yenilenme modeliyle değişmeli.
2. **8.12/5 — Krallık sandbox temizliği yanlış** (§1.2): laboratuvar duruyor ve `tsc` kırık.
3. **8.11 — "Sıfır emoji" abartılı.** Envanter ikonları SVG olsa da `BannerlordRecruitmentModal.tsx`
   portrelerde 👑🛡️💰🍺🌾, `BattlePrewarmModal.tsx` başlıklarda ⚔️🏰☠️🏹, karakter yaratmada
   varsayılan sancak amblemi 🦅 kullanıyor. İddia "%100 SVG" değil "çoğunlukla SVG".
4. **Asker toplama yuva kilitleri `[0,0,5,10,15,20]`** erken erişim dönemi değerleridir; güncel
   oyunda erişilebilir yuva sayısı ilişki + krallık/yabancılık + yerleşim sahipliği gibi
   değiştiricilerle hesaplanır ve eşraf **gücü** (100/200 eşikleri) asker kademesini belirler
   ([Fandom: Notables](https://mountandblade.fandom.com/wiki/Notables)). Bizde eşraf gücü katmanı
   var ama yuva modeli eski sürüm kopyası — "erken Bannerlord" olarak etiketlenmeli ya da güncellenmeli.
5. **Discard tarafı ise doğru örnek:** `bannerlordFoundation.ts:1965-1986` perk eşikleri
   (İdare 100/125), kademe tavanları (35/75/150/250/300) ve değer oranı Bannerlord perk analizleriyle
   uyumlu ([bannerlordperks: Paid in Promise](https://www.bannerlordperks.com/perk;skill=steward;perk=paid-in-promise)).
   Yani ekip isterse doğru araştırabiliyor; sorun araştırma disiplininin her sisteme uygulanmaması.

> **Örüntü (bu denetimin ana bulgusu):** Ekran **düzenleri** görsel araştırmayla yaklaştırılmış;
> **formüller** ise çoğu zaman "Bannerlord hissi veren" katsayılarla icat edilmiş ve probe'lar bu
> icat değerleri kilitlediği için testler yeşilken Bannerlord sadakati düşük kalmış. Testin olması
> ≠ doğrunun test edilmesi.

---

## 3. Doğru savaş meydanı nasıl olmalı? (Bannerlord araştırması)

### 3.1 Uçtan uca akış

Haritada temas → **karşılaşma ekranı** (iki tarafın partileri, toplam güç/sayılar; yakalanan taraf
için yalnız Savaş/Teslim Ol/eteğini öp seçenekleri; yakındaki dost/düşman partiler savaşa çekilir)
→ seçim: **Saldır (Attack)** / **Asker Gönder (Send troops, otomatik çözüm)** / kaçma girişimi
(arkada asker bırakma pahasına) / teslim olma → (Saldırsa) yükleme ekranı → **diziliş fazı
(Order of Battle)** → **görev sahnesi (mission)**: oyuncu karakteriyle şahsen savaşır + bölükleri
yönetir → taraflardan biri yok olunca/bozguna uğrayınca → **sonuç ekranı** (parti parti ölü/yaralı/
kaçan, oyuncu istatistikleri) → **esir alma ekranı** (yaralı düşmanlar + kurtarılan esirler) →
**ganimet ekranı** → haritaya dönüş (nam/nüfuz/moral etkileri işlenmiş, oyuncuların gerçek
kadrolarından kayıplar düşülmüş). Savaş meydanı, sefer haritasından **ayrı bir sahnedir**; sefer
zamanı içeride akmaz.

### 3.2 Arazi: Battle Terrain System (bizim en büyük görsel farkımız)

- Dünya haritası **bölgelere (segment/patch)** bölünmüştür; her bölgenin kendi savaş sahnesi
  vardır (e1.7.0'da 72 sahne). Savaş başlayınca sistem, tarafların haritadaki **konum ve yönünü**
  kullanarak sahne içindeki doğuş/diziliş alanlarını belirler; sahne, haritadaki arazinin
  (nehir, köprü, orman, dağ geçidi, kıyı) modellendiği hâlidir — böylece oyuncu haritada
  köprü başında/ormanda/tepe eteğinde tutunarak savaş alanını **önceden seçebilir**
  ([GameBanshee: e1.7.0 duyurusu](https://www.gamebanshee.com/news/125954-mount-blade-ii-bannerlord-update-battle-terrain-system-order-of-battle-and-siege.html),
  [PC Gamer](https://www.pcgamer.com/mount-and-blade-2-announces-stunning-update-to-how-battle-terrain-is-picked/),
  [TechRaptor](https://techraptor.net/gaming/news/mount-and-blade-2-bannerlord-update-adds-battle-terrain-system-to-beta)).
- Köye çok yakınsan **köy sahnesi**, köprü/nehir üstündeysen köprülü nehir sahnesi gelir; aynı
  bölgede tekrar savaşırsan **aynı sahne** gelir (rastgele arena değil).
- Arazi taktik belirler: yüksek zemin okçu menzili/atış hattı verir, eğim süvari hücumunu köreltir,
  orman süvariyi yavaşlatır/ağaçlar atış hattını keser, sığ nehir ilerlemeyi yavaşlatır, dar geçit
  sayıyı etkisizleştirir. İki ordu birbirinden **yüzlerce metre** uzakta, sahnenin karşılıklı
  kenarlarındaki diziliş bölgelerinde başlar; sahne sınırı kırmızı perde (red wall) ile bellidir,
  kaçış/geri çekilme bu kenarlardan olur.
- Görsel dil: doğal ölçek (1 birim ≈ 1 m), gerçek ufuk/dağ silueti, günün saati ve hava sefer
  saatinden gelir; bitki örtüsü biyoma özgüdür (çölde palmiye/seyrek çalı, bozkırda çayır vb. —
  incelediğimiz ekran karelerinde aynen böyle).

### 3.3 Diziliş fazı: Order of Battle

- Oyuncunun tarafında **en az 20 asker** varsa (ve sürpriz baskın/huruç değilse) savaştan önce
  diziliş ekranı açılır: kamera sahneyi üstten görür, oyuncu bölükleri **diziliş bölgesi** içinde
  sürükleyip yön/genişlik verir, "Ready/Başla" ile savaş başlar.
- En fazla **8 bölük (formation)** kurulur. Askerler bölüklere **tür + filtre** (Kalkan / Mızrak /
  Fırlatma / Ağır) ve yüzde kaydırıcılarıyla dağıtılır. Her bölüğe bir **kaptan** (yoldaş/aile/
  oyuncunun kendisi) atanır; kaptanın ilgili perkleri o bölüğe işler. Bölüklere **başlangıç emri**
  verilebilir. Ayarlar savaşlar arasında **hatırlanır**.
- Savaş içi bölük kartlarında asker sayısı, tür ikonu, **mühimmat çubuğu** ve **moral** görünür.
  Kaynaklar: e1.7.0 Order of Battle tanımı
  ([GameBanshee](https://www.gamebanshee.com/news/125954-mount-blade-ii-bannerlord-update-battle-terrain-system-order-of-battle-and-siege.html),
  yama notu özeti [Reddit](https://www.reddit.com/r/mountandblade/comments/yk035b/why_are_my_companions_who_are_mounted_and_have/),
  kaptan perkleri [bannerlordperks](https://www.bannerlordperks.com/table;role=captain)).
- Görsel: incelediğimiz karelerde panel koyu parşömen/demir, altın başlık, bölük kartları
  (ad + sayı + kilit), komutan portresi üstte. Güncel sürümde kartlar ekran altında, sahne üstünde
  şeffaf; seçili bölük arazide yeşil sancak/yerleşim iziyle gösterilir.

### 3.4 Bölük sınıfları ve varsayılan davranışları

| Tuş | Sınıf | Bannerlord davranışı (özet) |
|---|---|---|
| 1 | Piyade (kalkanlı/şok/avcı karışık) | Hat tutar; kalkan duvarında ilerler; temas edince göğüs göğüse |
| 2 | Okçu (yay + arbalet) | Menzilde durur, atış hattı arar, yaklaşan tehdide göre geride tutulur; mühimmat bitince yakın dövüşe geçer |
| 3 | Süvari | Hücum eder, hattı yarıp **öteye geçer**, toplanıp tekrar hücum eder (cycle charge); kanat korur |
| 4 | Atlı Okçu | Mesafeyi koruyarak daire çizer (skirmish), sürekli oklar, yakın dövüşten kaçar |
| 5–8 | Oyuncunun böldüğü özel bölükler | Filtreyle ayrılmış alt gruplar (örn. ayrı kalkan duvarı + şok piyade) |
| 0 | Tümü | — |

Düşman tarafını **kaptan/çavuş AI'ı** yönetir: göreli güç, arazi ve göreve göre savunma
(mevzi tutma, okçuyu tepeye koyma) ya da taarruz seçer; süvari kanatları yoklar, atlı okçu
taciz eder. **F6 "komutayı devret"** ile oyuncu da kendi bölüklerini bu AI'a bırakabilir.

### 3.5 Emir sistemi (Bannerlord tuş düzeni)

Önce bölük seçilir (0–8, Shift ile çoklu), sonra F-menüleri
([RPS](https://www.rockpapershotgun.com/mount-and-blade-2-bannerlord-troops-guide-how-to-raise-and-command-an-army),
[Gamepur](https://www.gamepur.com/guides/troop-commands-in-mount-and-blade-ii-bannerlord)):

| Menü | Emirler |
|---|---|
| **F1 — Hareket** | F1 Konuma git (imleçteki sancağa; sürükleyerek **genişlik** verilir) · F2 Beni takip et · F3 Hücum · F4 İlerle/Temas et (düzeni bozmadan) · F5 Geri çekil (düzeni koruyarak) · F6 Dur · F7 Savaş alanından çekil |
| **F2 — Yön** | Yöne dön / Düşmana dön |
| **F3 — Düzen** | F1 Hat · F2 Kalkan Duvarı · F3 Dağınık · F4 Çember · F5 Kare · F6 Kama (Skein) · F7 Kol · F8 Serbest (Scatter) |
| **F4** | Ateş serbest / Ateşi kes |
| **F5** | Ata bin / Attan in |
| **F6** | Komutayı AI kaptanlara devret / geri al |
| **F7** | Aktarma (seçili askerleri başka bölüğe) |

Emir verilirken ekran altında **emir çubuğu** ve bölük kartları belirir; seçili bölüğün hedefi
arazide yeşil sancak zinciriyle gösterilir. Verilen her emir, askerlerin bağırarak teyit etmesi
ve sol altta kısa metinle ("Infantry: Shield Wall") geri bildirilir.

### 3.6 Ölçek ve takviyeler

- Aynı anda sahnede en fazla **1000 asker** (ayar 200–1000). Sayılar aşarsa ilk dalga, tarafların
  toplam gücüne **orantılı** paylaştırılır (1500'e 500 ise ≈250'ye 750 gibi); geri kalanlar,
  kayıplar yer açtıkça **kendi doğuş kenarlarından takviye dalgaları** olarak girer. Hangi askerin
  önce gireceğini parti ekranındaki sıralama/kademe önceliği belirler.
  ([Reddit özetleri](https://www.reddit.com/r/Bannerlord/comments/rn0rgc/how_do_reinforcements_work_exactly/),
  [Steam tartışması](https://steamcommunity.com/app/261550/discussions/0/596287646583686207/))
- Takviye noktası taktik hedeftir: düşman doğuşunun üstüne çökmek, yeni dalganın ortasına doğması
  demektir. Her aktör **1 gerçek askeri** temsil eder; ölçekleme (örn. "28 aktör = tüm ordu") yoktur.

### 3.7 Şahsi dövüş

- Birinci/üçüncü şahıs; yaya veya atlı (at ayrı bir aktördür: canı, hızı, çarpma hasarı var;
  ölürse binici yaya kalır). Ata biniş/iniş sahnede yapılır.
- **Yönlü saldırı ve blok** (fare hareketiyle 4 yön); kalkan yön eşleşmesinde daha az hasar alır
  ve **kırılabilir**; savuşturma (chamber), aldatma (feint), tekme ve kalkan vuruşu (bash) vardır.
- Silahlar gerçek değerleriyle çalışır: sallama/saplama hızı+hasarı, uzunluk, kullanım, hasar türü
  (**kesici/delici/küt**) ve zırh etkileşimi; hız bonusu; silah modları: kargıyı **koltuklama
  (couch lance, X)**, mızrak dayama (spear brace), tek/çift el geçişleri.
- Menzilli: **gerçek mermiler** (ok/bolt/cirit balistik uçar), sadakta **sınırlı** mühimmat;
  isabet; vücut bölgesi (kafa hasar çarpanı). Küt hasar alanlar ölmek yerine **bayılır** →
  esir alınabilir. Ölüm/yaralanma ihtimalini Hekimlik/Cerrah etkiler.
  Kaynaklar: [GamerGuides: Combat](https://www.gamerguides.com/mount-and-blade-ii-bannerlord/guide/introduction/useful-gameplay-tips/combat),
  [Fandom: Weapons (Bannerlord)](https://mountandblade.fandom.com/wiki/Weapons_(Bannerlord)),
  [TaleWorlds blog: hasar türleri](https://www.taleworlds.com/en/Games/Bannerlord/Blog/56).

### 3.8 Moral, bozgun, geri çekilme, bitiş

- Moral asker/bölük düzeyinde işler: yakınında yoldaş düşmesi, kayıp oranı, liderin düşmesi,
  süvari hücumu şoku vb. ile kırılır; morali kırılan asker **sahne kenarına kaçar** (bozgun),
  savaşmadan çıkar. Savaş, bir tarafın askerleri **ölünce/bayılınca/kaçınca** biter.
- Oyuncu **Tab skor ekranından** veya kenardan çıkarak geri çekilebilir (yakında düşman yoksa);
  bu, karşılaşmayı bitirmez: haritada yeniden Saldır/Asker Gönder/Teslim Ol seçilir
  ([Steam](https://steamcommunity.com/app/261550/discussions/0/3415433633266656264/)).
- Oyuncu bayılırsa savaş **bitmez**: komutayı AI kaptanlar devralır; oyuncu seyreder; tarafı yine
  kazanabilir. Kaybederse **esir düşer** (oyun bitmez; fidye/kaçış/haraç akışı başlar).
  ([Reddit](https://www.reddit.com/r/Bannerlord/comments/ii7qb2/what_happens_to_the_ai_once_the_main_character/))
- Sonuç akışı: skor/sonuç tablosu → esirler (yaralı düşmanlar + düşmanın elindeki kurtarılan
  esirler) → ganimet; çok partili savaşlarda pay, katılan partilerin katkısına göre bölünür.

### 3.9 Savaş HUD'ı (görsel)

İncelediğimiz gerçek karelerde HUD **son derece sade**: üst ortada iki renkli göreli güç çubuğu
(tarafların sancak ikonlarıyla), sağ altta oyuncu canı + at canı + mühimmat, emir modunda altta
bölük kartları/emir çubuğu, sağda ince **öldürme akışı**, sol altta kısa emir teyitleri. Yön
göstergesi yalnız vuruş/blok anında küçük ok olarak çıkar. **Kombo sayacı, dayanıklılık barı,
dash, düşman altında saldırı "telegraph" halkası, uçan hasar sayıları Bannerlord'da yoktur.**

### 3.10 Kuşatma savaşı meydan savaşından ayrıdır

Kuşatma saldırısı, yerleşimin **kendi sur sahnesinde** oynanır: dizilişte taraflar üç cepheye
merdiven/kule/koçbaşı/gedik atar; savunanlar surlarda mevzilenir; makineler mürettebatla itilir,
kapı kırılır, iç kale (keep) aşaması olabilir. Düz arazide garnizonla meydan savaşı yapmak
Bannerlord karşılığı **değildir**.

---

## 4. Bizim savaş meydanı — kod kanıtlı karşılaştırma

İncelenen üretim yolu: `App.tsx` (`handleStartFieldBattle/handleStartSiegeBattle`,
`handleBattleComplete`) → `WorldCanvas.tsx` sefer savaşı (`initBattleArena` satır 2122+ ve
savaş güncellemesi ~3418–3860) → `GameHud.tsx` savaş HUD'ı.

### 4.1 Var olan doğru iskelet (hakkını verelim)

- Karşılaşma katmanı gerçek: düşman takibi/kaçışı, yakalama senaryoları, **Asker Gönder**
  simülasyonu (`encounter.ts:561`), teslimiyet ve feda-kaçış seçenekleri.
- Savaş, temas edilen harita koordinatında ve iki tarafın **gerçek kadro oranlarıyla** başlıyor
  (8.13'ün doğru kısmı), düşman fraksiyon rengi/adıyla geliyor; okçu mesafe korumaya, kalkanlı
  bloklamaya, süvari hızlı hücuma çalışıyor; blok hasarı azaltıyor; kayıplar türlerine göre
  kadrodan düşülüyor; üstte iki tarafın canlı/toplam sayısı var; ganimet ekranına akıyor.
- Ayrı bir yerde **çok daha iyi bir motor var**: `CharacterArenaView.tsx` içinde yönlü saldırı/blok,
  gerçek ok mermileri, at yürüyüş/dörtnal hızları, bölük seçimi (`DivisionId`), düzen çözücü
  (`tacticalFormation.computeFormationSlots`), havuzlu toplu savaş (`battleEnginePool`,
  `instancedArmyRenderer`) ve kuşatma testerı. **Ama seferdeki lord savaşları bunları kullanmıyor**
  — yalnız F9/menüden açılan test arenasında (`App.tsx:2607-2613`) yaşıyorlar. "Doğru motor yazılmış
  ama oyuna bağlanmamış"; Altın Kural 2/3 + AGENTS Kural 8 gereği yapılacak iş, sıfırdan yazmak
  değil **üretim yolunu bu motora taşımak**.

### 4.2 Madde madde hüküm tablosu

| # | Bannerlord doğrusu (§3) | Bizim üretim savaşı | Hüküm |
|---|---|---|---|
| 1 | Bölgeye özel ayrı savaş sahnesi; arazi (nehir/köprü/orman/tepe) sahnede | Sefer haritasının aynı sahnesinde `overworldGroup` gizlenip aynı yükseklik haritasında (`groundHeightAt`) dövüşülüyor; savaş için ağaç/kaya/köprü gibi sahne öğesi **hiç yerleştirilmiyor** | ❌ Görsel benzemezliğin 1. sebebi |
| 2 | Yüzlerce metre alan, karşılıklı kenarlarda diziliş | `±55` birimlik kare kutuya kelepçe (`WorldCanvas:3755-3764`); biz güneyde (`+14`), düşman kuzeyde (`-18`) → aradaki mesafe **~32 birim**: savaş temasla başlıyor | ❌ Arena hissi |
| 3 | Diziliş fazı (Order of Battle) | Yok. `handleStartFieldBattle` doğrudan `setSubMode('battle')` yapıyor, askerler `7` sütunlu karışık ızgarada doğuyor (`allyIdx%7`, sınıf sıralı bloklar), okçu/süvari kanatlara ayrılmıyor | ❌ Eksik sistem |
| 4 | 8 bölük, sınıf davranışları, kaptanlar | Tek "takım" kavramı var; aktörler `militia/archer/cavalry/guard` kovalarında; **atlı okçu yok**; her AI aktör "en yakın düşmana koş" kuralıyla hareket ediyor; bölük bütünlüğü/kaptan yok | ❌ |
| 5 | 0–8 seçim + F1–F7 menüleri, konum sancağı | Tek küresel emir: `1=Hücum, 2=Kalkan Duvarı, 3=Takip, 4=Ok Yağmuru` (`App.tsx:1059-1064`). `1` Bannerlord'da "piyadeyi seç" demektir; konum/yön/emir kartı yok. Kalkan duvarı tüm müttefikleri harita üstündeki **sabit bir noktaya** (`center+6`) çeker; "HOLD_VOLLEY" diye bir Bannerlord emri yok | ❌ |
| 6 | 1000'e kadar aktör, orantılı ilk dalga + takviyeler | Taraflar **en fazla 28'er aktöre** orantılı sıkıştırılır (komutanla 29). `200'e 20` bir savaş ≈ `29'a 21`e döner: güç oranı yok olur. Takviye yok. Kayıp sayımı sıkıştırılmış aktörler üzerinden yapılır (1 aktör=1 asker sayılır), yani 200 kişilik ordudan savaşta 5 kişi düşerse kadrodan 5 silinir; "zaferde" ayrıca lord kadrosu %25'e zorla indirilir (`rules.ts:1369-1393`) — icat muhasebe | ❌ En kritik mekanik hata |
| 7 | Yönlü dövüş, silah/zırh/beceri değerleri, mermi fiziği, sınırlı ok, ayrı at aktörü | Oyuncu: `attack 38/defense 22` sabit (kuşandığı silah/zırh/beceriler **hiç** etki etmez); vuruş 3.4 birim içindeki **herkese** alan hasarı; kalkan her yöne ×0.25; oklar **hitscan** (menzil 18, sınırsız); at aktörü yok (model üstünde görsel); hasar formülü tek satır (`rules.ts:1298`): tür (kesici/delici/küt), bölge, menzil düşümü yok | ❌ |
| 8 | Moral şokları, bozgun, kenara kaçış | Moral tamamen yok: herkes ölene kadar dövüşür; savaş `enemiesAlive===0 || playerHp<=0` ile biter (`WorldCanvas:3813`) | ❌ |
| 9 | Oyuncu düşünce savaş AI ile sürer; yenilgi = esaret | Oyuncu canı 0 → anında yenilgi ve `App.tsx` `setGameState('gameover')`: arkadaşların savaşı kazanmak üzere olsa bile **oyun biter** | ❌ Bannerlord'un en temel kuralına aykırı |
| 10 | Geri çekilme Tab/kenar; karşılaşmaya dönüş | HUD'daki "Haritaya Çekil" düğmesi sadece `setSubMode('overworld')` (`App.tsx:1888`): bedelsiz, koşulsuz kaçış; ne kayıp ne tekrar karşılaşma | ❌ Sömürülebilir icat |
| 11 | Sade HUD: güç çubuğu, can/at/mühimmat, emir kartları | Üstte iki sayaç paneli var (ruhu yakın) ama oran **çubuğu** yok; artı Bannerlord'da olmayanlar: **kombo sayacı, stamina, Space ile dash, hitstop, kamera sarsıntısı, düşman altında 'telegraph' halkası, F ile saldırı, Q/Shift ile blok** | ❌ Arcade katman |
| 12 | Kamera: omuz arkası 3. şahıs / 1. şahıs; dizilişte kuşbakışı | Kamera oyuncunun 13.5 birim güneyinde ve 9.5 yükseklikte sabit takip (`WorldCanvas:3845-3858`); fareyle bakış yok; hareket ekran eksenli (W = kuzeye); at kontrolü (hızlanma/dönüş yarıçapı) yok | ❌ |
| 13 | Kuşatma = sur sahnesi | `handleStartSiegeBattle` da **aynı meydan savaşını** açar; garnizon açık arazide ızgara doğar; inşa ettiğiniz koçbaşı/kuleler/gedik sahnede **yok** | ❌ Ayrı büyük eksik |
| 14 | Sonuç: ölü/yaralı/kaçan tablosu, esir + ganimet | Ganimet ekranı var ✅; ama sonuç tablosu ve yaralıdan esir akışı savaş sonucuna bağlı değil; ölen aktör 0.42 sn'de **kaybolur** (ceset/yaralı yok) | ⚠️ Kısmi |
| 15 | Bölge→sahne sürekliliği, saat/hava | Savaş sefer saati/havasıyla senkron değil; biyom yalnız zemin yüksekliği/renginden ibaret | ⚠️ Kısmi |

### 4.3 Kullanıcının "benzemiyor" hissinin görsel sebepleri (özet)

1. Karşı ordunun uzakta bir hat olarak görünmesi yerine, 30 adım ötede karışık bir insan
   ızgarası görünüyor; ufukta nehir/tepe/orman yok, sefer haritasının boş arazisi var.
2. Sancaklı bölükler, diziliş ve emir kartları yerine tek satır "Emir: Hücum" yazısı var.
3. Sayılar Bannerlord ölçeğinin (yüzler) yerine onlar seviyesinde; iki taraf da ~29 kişi.
4. Kamera tepeden eğik bir "arena kamerası"; at üstünde omuz arkası hissi yok.
5. Arcade geri bildirimler (halka, kombo, dash, sarsıntı) Bannerlord'un sade diline tamamen yabancı.

---

## 5. Hedef: tarayıcıda doğru savaş meydanı (uygulanabilir faz planı)

Bannerlord'un 1000 aktörünü tarayıcıda hedeflemek gerekmez; **sistemlerin doğrusu** ölçekten
bağımsızdır. Önerilen ölçek: ayarlanabilir savaş boyutu 150/250/400 aktör (instancing'li
`battleEnginePool` zaten bu iş için yazılmış). Fazlar:

- **B0 — Önce derlenebilirlik:** `KingdomManagementModal` sandbox kalıntısını sil (veya state'leriyle
  geri getirip üretimden ayır), `package-lock.json`yu `package.json` ile eşitle; `verify:fast`
  yeşil olmadan savaş işine başlama.
- **B1 — Görev sahnesi + arazi yaması:** Savaşı WorldCanvas içindeki grup olmaktan çıkarıp ayrı
  misyon sahnesine taşı. `mapGen` sorgularıyla (biyom, nehre/köprüye/yola/yerleşime mesafe, eğim)
  karşılaşma noktasından **arazi profili** üret: yerel yükseklik (abartı katsayısıyla), su hattı ve
  köprü (varsa), biyom bitki/kaya serpmesi, köy yakınıysa birkaç ev/tarla engeli. Alan ~450×450,
  görünür kırmızı sınır. Doğuş kenarları, iki partinin seferdeki **yaklaşma vektöründen** türesin.
  Sefer saati/havası ışıklandırmaya taşınsın.
- **B2 — Savaş sınıflarını düzelt:** `battleClass` dörtlüsünü Bannerlord'a çevir:
  `infantry / archer / cavalry / horseArcher`; `guard` kovasını piyadeye geri kat (kadro
  gösteriminde "muhafız" adı birlik adı olarak kalabilir). Birlik ağaçlarını kültürlerin gerçek
  hatlarına (sıradan T1–T5 + soylu T2–T6) çevirmek ADIM 5.1 ile birlikte yapılmalı; savaş en
  azından doğru sınıfı okumalı.
- **B3 — Order of Battle:** ≥20 askerde diziliş modu: kuşbakışı kamera, 8'e kadar bölük kartı
  (sınıf/filtre/yüzde), kaptan atama (kahramanlar), kartı seçip araziye yerleştirme
  (konum + sürüklemeyle genişlik + yön), başlangıç emri, **Başla** düğmesi. Kartlarda sayı/tür/
  mühimmat/moral.
- **B4 — Emirler + bölük AI:** 0–8 seçim; F1 hareket alt menüsü (konum sancağı, takip, hücum,
  ilerle, geri çekil, dur, çekil), F2 yön, F3 düzenler (hat, kalkan duvarı, dağınık, çember,
  kare, kama, kol, serbest — `tacticalFormation.computeFormationSlots` genişletilerek), F4 ateş,
  F5 in/bin, F6 devret. Sınıf davranışları: okçu menzil+atış hattı korur; süvari yarıp geçer ve
  toplanır; atlı okçu kaçar-daire çizer; piyade hat bütünlüğünü korur (en yakın düşmana bireysel
  koşma kaldırılır; hedefleme yalnız temas hâlinde bireyseldir). Düşman kaptan AI: göreli güç +
  araziye göre savunma/taarruz şablonu.
- **B5 — Ölçek, takviye, muhasebe:** 1 aktör = 1 asker. İlk dalga orantılı; kalanlar kadro
  sırasıyla kendi kenarından dalga dalga. Kayıplar aktörün ait olduğu `troopStack`ten;
  ölü/yaralı ayrımı küt hasar + Hekimlik ile; kahramanlar bayılır. `%25'e zorla indirme` gibi
  icat sonuç düzeltmeleri silinir.
- **B6 — Şahsi dövüşü test arenasından üretime çek:** `CharacterArenaView`deki yönlü saldırı/blok,
  mermi fiziği + sınırlı mühimmat, at hareketi; hasar kuşanılmış eşya tanımlarından (tür, hız,
  uzunluk) ve beceriden; **dash / kombo / stamina / telegraph / hitstop üretim savaşından çıkar**.
- **B7 — Moral ve bitiş:** Bölük morali (kayıp şoku, komşu bozgunu, lider düşüşü), bozgunda kenara
  kaçış; Tab skor ekranı + kurallı geri çekilme; oyuncu düşünce AI devri + seyir; yenilgide esaret
  akışı (gameover değil); sonuç tablosu → esir ekranı → ganimet.
- **B8 — Kuşatma sahnesi (ayrı iş):** Sur/gedik/kapı + inşa edilmiş makinelerin cephelere
  yerleştiği ayrı misyon; meydan savaşı çekirdeğinin üstüne. O zamana kadar "Kuşatma Taarruzu"
  meydan savaşı açmamalı; ya devre dışı ya da açıkça "yer tutucu" işaretli olmalı (Altın Kural 2:
  yanlış sistemi doğruymuş gibi sunma).

**Kabul ölçütleri (örnek):** köprü üstünde başlayan savaşta köprü sahnesi gelir; 300'e 100 savaşta
ilk dalga oranı ve takviyeler gözle doğrulanır; yenilen lordun kadrosu 1:1 düşer; oyuncu erken
bayılsa bile tarafı kazanabilir; ekran görüntüsü referans kareyle yan yana konduğunda güç çubuğu +
bölük kartları + sancaklar aynı yerlerdedir; ilgili problar (`probe-battle-*`) üretim yolunu çağırır.

---

## 6. Bu denetimle görev listesine işlenenler

Altın Kural 2 ve 3 gereği bulgular yalnız burada kalmadı; `YAPILACAKLAR_LISTESI.md`ye
**BÖLÜM 6 (10.x)** olarak düzeltme görevleri eklendi:

- 10.1 Derlenebilirlik: `KingdomManagementModal` sandbox kalıntısı + lock dosyası eşitlemesi.
- 10.2 Meydan savaşı yeniden yapımı (B1–B7).
- 10.3 Kuşatma saldırı sahnesinin meydan savaşından ayrılması (B8).
- 10.4 Erzak formülü/çeşitlilik düzeltmesi.
- 10.5 Parti/tutsak kapasite formülü düzeltmesi.
- 10.6 Öğrenme sınırı tek kaynağa indirme (doğru formülü üretime bağlama).
- 10.7 Asker toplama cooldown'ının kaldırılıp gerçek yenilenme modeline dönülmesi.
- 10.8 Kültür bonuslarının tek sürümde (güncel) doğru yazılması ve matematiğe bağlanması.
- 10.9 Birlik ağaçlarının gerçek kültür hatlarına çevrilmesi + `guard` sınıfının kaldırılması
  (ADIM 5.1 soylu hatlarıyla birleşik).
- 10.10 "Tam Perk Kataloğu" ibaresinin gerçekle eşleşmesi (perklerin beceri/eşik bazında
  tamamlanması) veya liste metninin düzeltilmesi.
- 10.11 Cohesion/çağırma maliyeti formüllerinin araştırılmış değerlerle değişmesi.

### Kaynaklar (seçme)

Battle Terrain: <https://www.gamebanshee.com/news/125954-mount-blade-ii-bannerlord-update-battle-terrain-system-order-of-battle-and-siege.html> ·
<https://www.pcgamer.com/mount-and-blade-2-announces-stunning-update-to-how-battle-terrain-is-picked/> ·
<https://techraptor.net/gaming/news/mount-and-blade-2-bannerlord-update-adds-battle-terrain-system-to-beta> ·
Emirler: <https://www.rockpapershotgun.com/mount-and-blade-2-bannerlord-troops-guide-how-to-raise-and-command-an-army> ·
<https://www.gamepur.com/guides/troop-commands-in-mount-and-blade-ii-bannerlord> ·
<https://www.gamerguides.com/mount-and-blade-ii-bannerlord/guide/introduction/useful-gameplay-tips/tactics> ·
Takviye/ölçek: <https://www.reddit.com/r/Bannerlord/comments/rn0rgc/how_do_reinforcements_work_exactly/> ·
Beceriler: <https://mountandblade.fandom.com/wiki/Skills_(Bannerlord)> ·
Kültürler: <https://mountandblade.fandom.com/wiki/Culture> ·
<https://docs.bannerlordmodding.lt/modding/cultures/> ·
Eşraflar: <https://mountandblade.fandom.com/wiki/Notables> ·
Cohesion: <https://mountandblade.fandom.com/wiki/Army_Cohesion> ·
Klan/Nam: <https://mountandblade.fandom.com/wiki/Clan> ·
Parti boyutu: <https://www.ign.com/wikis/mount-blade-ii-bannerlord/How_to_Increase_Party_Size> ·
Discard perkleri: <https://www.bannerlordperks.com/perk;skill=steward;perk=paid-in-promise> ·
Silah/hasar: <https://mountandblade.fandom.com/wiki/Weapons_(Bannerlord)> ·
<https://www.taleworlds.com/en/Games/Bannerlord/Blog/56>
