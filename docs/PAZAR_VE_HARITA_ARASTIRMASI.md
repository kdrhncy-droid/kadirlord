# Pazaryeri, Harita Modu ve Diyalog — Araştırma + Karar Notu

> Tarih: 2026-10-21 · Kapsam: pazar arayüzü, harita/HUD sadeleştirmesi, diyalog fazı
> Kaynak: TaleWorlds dev blogları, Bannerlord wiki, oyuncu/moderatör tartışmaları, oyun içi ekran görüntüleri.

---

## 1. BANNERLORD PAZARYERİ (TİCARET EKRANI)

### 1.1 Yapı (görsel analiz — ekran görüntüleri)

Bannerlord'un ticaret ekranı **üç sütunlu** bir düzendir, tam ekran değil haritanın üzerine
binen bir katmandır:

```
┌──────────────────────────────┬──────────────────────┬──────────────────────────────┐
│  ŞEHİR MALI (sol)            │   KARAKTER (orta)    │  OYUNCU ENVANTERİ (sağ)      │
│  ┌────────────────────────┐  │   tam boy 3B model   │  ┌────────────────────────┐  │
│  │ Type │ Name  │ Value  │  │   + 12 ekipman slotu │  │ Type │ Name  │ Value  │  │
│  ├──────┼───────┼────────┤  │     (2 sütun)        │  ├──────┼───────┼────────┤  │
│  │  ⚔   │ Grain │  11    │  │                      │  │  ⚔   │ Horse │  30    │  │
│  └────────────────────────┘  │   [item tooltip]     │  └────────────────────────┘  │
│  Şehir altını: 10.000        │   "Can be sold for…" │  Taşıma: 264/2500 · 1.329    │
└──────────────────────────────┴──────────────────────┴──────────────────────────────┘
                  [Cancel]            [Done]              (altın/gün/hız şeridi)
```

Gözlemlenen ayrıntılar (RPS ve GamerGuides ekran görüntüleri):

| Öğe | Ayrıntı |
| --- | --- |
| Sütun başlıkları | `Type` (kategori ikonu), `Name`, `Value` — üçü de **sıralanabilir** |
| Kategori filtresi | Karakterin üstünde **daire dizisi**: Tümü, Silah, Kalkan/Menzilli, Zırh, Binek/Eyer, Erzak/Ticari mal |
| Kıyafet seti | Üstte iki sekme: **Savaş Donanımı** / **Sivil Kıyafet** |
| Para birimi | Her satırda fiyat; alt ortada **net sonuç** (`+`/`−` dinar) |
| Şehir altını | Sol üstte şehrin kasası; satış bu limitle sınırlı (**"Transfer All"** altın bitince durur) |
| Tooltip | Malın ağırlığı, kategorisi ve **"Can be sold for…"** satırları: hangi şehirde kaça alınıp satıldığı (ticaret söylentileri) |
| Renk kodu | Yeşil = uygun/ucuz, sarımsı = ortalama, kırmızı = pahalı. **Alış** tarafında yeşil "burada al", **satış** tarafında yeşil "burada sat" |
| Kilit | Sağda `Locked` kolonu: kilitlenen mal takas dışı kalır |
| Onay | `Cancel` / `Done` — işlem **Done'a basınca** tamamlanır; mal-mal takası mümkün |

### 1.2 Ekonomi mantığı (metin kaynakları)

- TaleWorlds Dev Blog (25.04.2019): her şehir **kategori başına bütçe** ayırır
  (ör. refah 5000 olan şehir günde 500 dinar tahıla, 400 et, 200 tereyağı).
  Fiyat = arz/talep; atölyelerin hammadde talebi ve şehir tüketimi fiyatı yukarı iter,
  stok bolluğu aşağı çeker.
- Wiki: piyasa çarpanı 1.0'ın üzerindeyse kıtlık; tüccar bunu "We have shortages of…" diye söyler.
- 1.3 yaması: şehir ticaret komisyonu **5 katına** çıktı; şehir gelirinin ~⅓'ü gümrükten gelir.
  "Transfer All" artık şehrin altınıyla sınırlı, tekrar basınca kalanı aktarır.
- Ticaret becerisi: seviye 25 → kâr/zarar rengi, seviye 50 → ortalama fiyata göre renk.
  Söylentiler yalnız **ziyaret edilen** şehirler için oluşur.

### 1.3 Bizde eksik olanlar (mevcut `BannerlordMarketModal.tsx`)

| Özellik | Durum | Yapılacak |
| --- | --- | --- |
| Üç sütun (şehir / karakter / oyuncu) | var (yaklaşık) | sütun başlıkları `Type·Name·Value` + sıralama |
| Şehir altını limiti | **sabit 14.800** | yerleşimin refahından türet, satışta düş |
| Kategori filtresi | var | karakterin üstünde daire dizisi (görsel) |
| Tooltip "şurada kaça" | **yok** | ziyaret edilen şehirlerin fiyat söylentileri |
| Renk kodu (yeşil/sarı/kırmızı) | **yok** | ortalama fiyata göre |
| Kıyafet seti (savaş/sivil) | var (envanterde) | pazar ekranına taşı |
| `Locked` kolonu | **yok** | toplu satışta koruma |
| Mal-mal takas | **yok** | `Done` öncesi net sonuç hesabı |
| **Yerleşim şartı** | **YOK — hata** | aşağıya bakınız |

### 1.4 KRİTİK DÜZELTME — pazar yerleşim dışından açılıyordu

Kullanıcı haklı: pazaryeri haritada gezerken `I` ile açılıyordu ve envanterle aynı yerdeydi.
Bannerlord'da pazaryeri **yalnız şehir/kale/köy menüsünden** girilir.

Uygulanan düzeltme (bu commit):
- `I` tuşu **yalnız envanteri** açar (pazar açmaz).
- `I` etiketi "Envanter & Pazar [I]" → **"Envanter [I]"**.
- Pazaryeri düğmesi yerleşim içinde değilken **pasif**: "Pazaryeri (yerleşimde)" +
  ipucu "Pazara girmek için bir şehir, kale veya köye girin".
- `App.tsx`: pazar modalı yalnız `activeSettlementModal || nearSettlement` varken render edilir.
- Arena ekranındaki "Pazar & Envanter" düğmesi → **"Envanter"** (arena yerleşim değil).

Sonraki adım (Faz 7): pazarı **yerleşim menüsünden** açılan, şehir altını/refah/söylenti
verilerini kullanan üç sütunlu ekrana dönüştürmek.

---

## 2. HARİTA MODU (CAMPAIGN MAP) ARAŞTIRMASI

### 2.1 Bannerlord harita HUD'ı — gerçekte ne var?

Kaynaklar (Reddit ipuçları, bannerlord-online rehberi, PSNProfiles, setreadygame):

| Bölge | İçerik | Bizde |
| --- | --- | --- |
| **Sol üst** | Parti sancağı + gün/saat, altında altın | var |
| **Sağ üst** | (boş — kamera/araç düğmeleri) | bizde **7 düğme** var |
| **Alt sol** | Parti portresi, hız, erzak, moral, ücret (katlanabilir panel) | var ama **çok düğme** |
| **Alt orta** | Zaman kontrolü (⏸ ▶ ▶▶ ▶▶▶) | var |
| **Sağ alt** | Altın, nüfuz, at sayısı, moral, ücret — **hover ile detay** | bizde ayrı ayrı |
| **Harita üzeri** | Yerleşim adları + sancak, klan ikonu, devriye partileri | var |
| **Bağlam** | Yerleşime yaklaşınca **menü katmanı** (Enter Town / Attack / Leave) | var (SettlementModal) |

Anahtar gözlem: Bannerlord HUD'ı **tek satırlık alt şerit + iki küçük köşe paneli**dir.
Her şey hover ile açılır; ekranda sürekli görünen düğme sayısı ~8'i geçmez.

### 2.2 Bizdeki sorun (kullanıcı: "UI HUD'lar gereksiz derecede fazla")

Mevcut alt şeritte **9 düğme** var: Karakter, Envanter, Ordum, Kıta Atlası, Vakanüvis,
Ansiklopedi, Berber & Suret, Krallık & Divan, Karakter & Savaş Arenası + Meydan Savaşı.
Ayrıca üstte kamera/araç pill'i ve ayrı bir "Savaş & Karakter Arenası" düğmesi (mükerrer).

### 2.3 Sadeleştirme planı (Faz 4)

1. **Tek "Parti" paneli** (sağ alt): altın · nüfuz · hız · moral · ücret/erzak — hover ile detay.
2. **Alt şerit 9 → 5:** `Karakter`, `Envanter`, `Ordum`, `Divan`, `Ansiklopedi`.
3. **Atlas/Vakanüvis** → tek "Harita & Günlük" düğmesi (yan panel).
4. **Berber** → Karakter panelinin içine (sekme), ayrı düğme kalkar.
5. **Arena** → ana menüye taşınır (sefer sırasında erişim gerekmiyor) veya `F9` test kısayolu.
6. **Mükerrer** "Savaş & Karakter Arenası" düğmesi kaldırılır.
7. Tüm kısayollar tek yerde listelenir (`H` paneli).

---

## 3. DİYALOG EKRANI (FAZ 6 — kullanıcı isteğiyle plana eklendi)

### 3.1 Bannerlord diyaloğunun yapısı

- Konuşma **haritanın üzerine binen** alt-orta panelde açılır; kamera NPC'ye
  yaklaşır, oyuncunun bakış açısı korunur (1./3. şahıs), alan derinliği NPC'ye odaklanır.
- Lord, **muhafızlarıyla çevrili** görünür; NPC'ler baş/eller ile konuşur.
- Seçenekler **numaralı liste** (1–9), altta "Devam / Bitir".
- Sağ üstte muhatabın portresi + ilişki göstergesi.
- İkna (persuasion) için **ayrı alt-ekran**: 4 argüman kartı, başarı/başarısızlık.
- Ticaret söylentisi olan NPC'de **madeni para ikonu** görünür.

### 3.2 Bizim planımız (Faz 9'dan öne alındı)

| Adım | İş |
| --- | --- |
| 6a | Veri: `DialogueNode`, `DialogueOption`, `DialogueCondition` (ilişki, rütbe, savaş durumu, görev) |
| 6b | Bileşen: alt-orta panel + numaralı seçenekler + portre + ilişki çubuğu |
| 6c | İçerik: karşılama / görev / ticaret / ikna / tehdit / vedalaşma düğümleri |
| 6d | 3B: NPC'ye yumuşak kamera yaklaşımı (mevcut `CharacterArenaView` rig'leri yeniden kullanılır) |
| 6e | Probe: her düğümün erişilebilir olduğu, döngü/çıkmaz olmadığı |

---

## 4. FAZ SIRASI (güncel)

| Faz | Konu | Durum |
| --- | --- | --- |
| 0 / 0b | Veri temeli / dünya nüfusu | ✅ |
| 1a / 1b | Ansiklopedi kabuğu / krallık-klan-yerleşim-kavram | ✅ |
| 1c | Baked portreler | ✅ |
| 1f | Beden oranları + zırh oturması | ✅ |
| 1g | Yara izleri | ✅ |
| 1h | Leydi yüzleri + deterministik DNA | ✅ |
| 1i | UI cilası (SVG ikon, kontrast, liste portreleri) | ✅ |
| 1j | Eller | ✅ |
| 1k | Pazar yerleşim şartı (bu commit) | ✅ |
| **2** | **Entity sayfaları (aile, teçhizat, esir, diplomatik durum)** | **sırada** |
| 3 | Aile ağacı | |
| **4** | **Harita HUD sadeleştirme (9 → 5 düğme + tek parti paneli)** | |
| 5 | Quest sistemi | |
| **6** | **Diyalog ekranı (Bannerlord tarzı)** | |
| 7 | Pazaryeri (üç sütun, şehir altını, söylenti, renk kodu) | |
| 8 | Asker toplama | |
| 9 | Yüzler, içerik zenginleştirme (klan adı tekrarı), sesler | |
