# 📜 SANCAK-I KALRADYA — ANSİKLOPEDİ, DİYALOG VE ARAYÜZ MASTER PLANI

> **Tarih:** 2026-10-21 · **Durum:** Araştırma tamamlandı, uygulama başlamadı
> **Hazırlayan:** Arena Agent (kod taraması + Bannerlord arayüz araştırması)
> **Bağlı dokümanlar:** `YAPILACAKLAR_LISTESI.md`, `docs/ARMORY_STUDIO_INCELEME.md`

---

## 0. KISA ÖZET (TL;DR)

Bannerlord'un **Ansiklopedi (Encyclopedia)**, **Diyalog/Barter**, **Pazar** ve **Askere Alma** ekranlarını
araştırdım; hem metin hem ekran görüntüsü düzeyinde doğruladım. Bu doküman:

1. **Ne öğrenmem gerektiğini** (araştırma soruları),
2. **Ne öğrendiğimi** (kaynaklı bulgular + referans görseller),
3. **Bizim depoda bugün ne olduğunu** (dosya/durum envanteri),
4. **Yeni veri modelini** (lord/leydi/kral kayıtları, son görülme, aile, savaş durumu),
5. **Arayüz tasarım sistemini** (renk, bileşen, wireframe),
6. **Faz faz yol haritasını** (kabul kriterli),
7. **Karar bekleyen açık soruları** içerir.

**Tek cümle:** Önce **veri temeli** (lord/kale/klan kayıtları), sonra **Ansiklopedi kabuğu**,
sonra **entity sayfaları**, sonra **diğer HUD'lar → quest → diyalog → pazar → askere alma → yüzler**.

---

## 1. İSTENENLER (kullanıcı brief'i, sırası korunarak)

| # | İstek | Not |
| :--- | :--- | :--- |
| 1 | **Bannerlord Ansiklopedisi** tarzı UI | Krallıklar, lordlar, leydiler, krallar; **son nerede görüldü**, **savaşta mı**, **yaş** |
| 2 | **Diğer UI ve HUD'lar** | Mevcut panellerin Bannerlord düzenine çekilmesi |
| 3 | **Quest sistemi** | Ansiklopedi/HUD turundan sonra |
| 4 | **Diyalog ekranı** | Bannerlord'daki gibi |
| 5 | **Pazar ekranı** | Bannerlord ticaret düzeni |
| 6 | **Asker toplama ekranı** | Bannerlord "Recruitment" düzeni |
| 7 | **Yüzler + diyaloglar + etkileşimler** | Lord/kral/leydi portreleri, konuşma içerikleri |

Kural: **Emin olmadığım yerde karar vermeyeceğim, sana soracağım.** (Bkz. §11)

---

## 2. YÖNTEM

Her faz şu dört adımla ilerler:

1. **Ölç** — mevcut kodda ne var, ne yok (satır/sayı/kanıt).
2. **Tasarla** — wireframe + veri sözleşmesi (TypeScript tipi) önce yazılır.
3. **Uygula** — küçük, derlenebilir dilimler hâlinde.
4. **Doğrula** — `tsc --noEmit` + `vite build` + birim test + **headless render** (tarayıcısız görsel kanıt) + `probe-*.ts`.

Doğrulama altyapımız hazır: `scripts/lib/softRender.ts` (CPU rasterizasyon) sayesinde **tarayıcı açmadan**
arayüzün 3B portre katmanını ve kart düzenlerini PNG olarak üretebiliyoruz (bkz. `docs/renders/*.png`).

---

## 3. BÖLÜM A — ÖNCE ÖĞRENMEM GEREKENLER (araştırma soruları)

Aşağıdaki 14 soruyu araştırdım. Sağ sütun sonucu gösterir.

| # | Soru | Sonuç |
| :--- | :--- | :---: |
| A1 | Ansiklopedi nasıl açılıyor, hangi kısayol, nerelerden link veriliyor? | ✅ |
| A2 | Ana sayfa düzeni nedir (kart? sekme? liste?) | ✅ |
| A3 | Hangi varlık türleri var (hero, klan, krallık, yerleşim, birlik, kavram)? | ✅ |
| A4 | Liste sayfalarında hangi filtre ve sıralamalar var? | ✅ |
| A5 | **Hero sayfasında tam olarak hangi bilgiler, hangi yerleşimde duruyor?** | ✅ |
| A6 | "Son görüldü" bilgisi nasıl çalışıyor, ne sıklıkla güncelleniyor? | ✅ |
| A7 | Görülmemiş karakterler nasıl gizleniyor (fog of war)? | ✅ |
| A8 | Aile ağacı sayfası nasıl çiziliyor? | ✅ |
| A9 | Diyalog ekranı: kamera, panel, seçenek listesi, ikna (persuasion) sistemi | ✅ |
| A10 | Barter (takas) ekranı düzeni | ✅ |
| A11 | Askere alma ekranı düzeni | ✅ |
| A12 | Pazar/ticaret ekranı düzeni | ⚠️ kısmen (metin kaynaklı) |
| A13 | Ortak görsel dil: renk, çerçeve, tipografi, ikonografi | ✅ |
| A14 | Hangi bilgiler oyun motorunda hangi alanlara karşılık geliyor (mod API'si) | ✅ |

---

## 4. BÖLÜM B — ARAŞTIRMA BULGULARI

> Görseller `docs/renders/reference/` altındadır. Kaynak numaraları §12'dedir.
> ✅ = ekran görüntüsüyle doğrulandı · 🟡 = metin kaynağıyla doğrulandı

### B.1 Erişim ve gezinme ✅

- Ansiklopedi **`N` tuşuyla** açılır [3][5][6].
- Ayrıca: **Klan menüsü → kendi portren → Encyclopedia**, sohbet sırasında lord adına tıklama,
  yerleşim metinlerindeki vurgulu isimlere tıklama, parti ekranında birliğe sağ tıklama [3][6].
- Üstte **"Encyclopedia" plakası**, sağda **arama kutusu**, en sağda **kapat (X)**.
- Plakanın altında **breadcrumb**: `Home / Heroes / Hap the Hyena` (görsel: `bl-hero-page.jpg`).
- Sayfalar arası gezinme **link tabanlı**: her isim tıklanabilir, bir yığın (stack) gibi geri gider.

> **Bizim için anlamı:** Tek bir `EncyclopediaModal` + `navigationStack: EncyclopediaRoute[]` yeterli.
> Oyunun her yerinden `openEncyclopedia({type:'hero', id})` çağrılabilmeli.

### B.2 Ana sayfa: yatay kart karuseli ✅

Görsel: `docs/renders/reference/bl-encyclopedia-home.png`

- Ekranın ortasında **yatay sıralanmış dikey kartlar**: `Settlements · Heroes · Troops · Kingdoms · Clans · Concepts`.
- Her kartın üstünde **küçük-caps serif başlık**, altında **resimsel sanat** (manzara, portre, sancak, kalkan).
- Kartlar "sayfa" gibi kaydırılır; kenardaki kartlar hafif kırpılır (carousel hissi).

> **Bizim için:** Kart sanatını **AI görsel** yerine **prosedürel 3B render** ile üretebiliriz
> (aynı `softRender`/Three sahnesi → doku). Böylece dış dosya bağımlılığı olmaz.

### B.3 Liste sayfaları, filtreler, sıralama 🟡

- Sol tarafta **filtre grupları** (Types / Culture / Occupation / Status …), sağda sonuç listesi.
- Sıralama seçenekleri: **Relation (oyuncuya ilişki), Age (yaş), Level, Tier, Strength, Fiefs** vb. [8]
- Mod toplulukları bunu genişletiyor: **Kingdom, Prisoner/Free, Clan Leader** filtreleri [1][4][8] —
  yani temel oyunda bunların bir kısmı **yok**; biz baştan koyabiliriz (avantaj).

### B.4 ⭐ HERO SAYFASI ANATOMİSİ ✅

Görsel: `docs/renders/reference/bl-hero-page.jpg`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⟡ Encyclopedia                                    [ arama… ]        ✕   │
│  Home / Heroes / Hap the Hyena                                           │
├──────────────────────────┬───────────────────────────────────────────────┤
│                          │  ⭐ Hap the Hyena        (sağ üst)            │
│                          │  Last seen at Phocaon, 5 days ago  ◀── çok    │
│      TAM BOY             │                                        önemli │
│      3B PORTRE           │  ▾ Info                                       │
│      (canlı render)      │  ┌───────────┬───────────┬──────────┬───────┐ │
│                          │  │ Culture   │ Age       │ Occupation│ Rel. │ │
│                          │  │ Aserai    │ 18        │ Wanderer  │ -1   │ │
│                          │  └───────────┴───────────┴──────────┴───────┘ │
│                          │                                               │
│  ┌────────────────────┐  │  ▸ Klan: …           ▸ Krallık: …            │
│  │ Skills             │  │  ▸ Aile: eş / çocuklar / ebeveyn              │
│  │ [silah][at][tıp]…  │  │  ▸ Dostlar / Düşmanlar (3 satır + tooltip)    │
│  │  180  120  190     │  │  ▸ Kişilik özellikleri (trait'ler)            │
│  └────────────────────┘  │  ▸ Açıklama (lore metni)                      │
└──────────────────────────┴───────────────────────────────────────────────┘
```

Doğrulanan alanlar:

| Bölge | İçerik |
| :--- | :--- |
| Sol panel | **Tam boy 3D portre** (kıyafetiyle), altında **beceri ikonları + sayılar** |
| Sağ üst | **"Last seen at `<yerleşim>`, `<N>` days ago"** — tıklanınca yerleşim sayfasına gider [2][5] |
| Info grid | **Culture · Age · Occupation · Relation** |
| Alt bölümler | Klan, krallık, aile, dost/düşman listeleri, kişilik/özellik, açıklama |
| Durum | **Esir** ("Prisoner of …"), **orduda**, **ölü** bilgileri ayrı satır olarak gösterilir [4] |
| Ekstra (mod) | Seviye, teçhizat ve satış değeri, perk'ler, nitelikler [4] |

### B.5 "Son görüldü" mekaniği 🟡 (kritik)

- Lordlar sürekli hareket eder; ansiklopedi **son görüldükleri yeri ve kaç gün önce olduğunu** yazar [2][5][6].
- Konum **günde bir kez** ve/veya **bir yerleşime girince** tazelenir ("dedikodu" mantığı) [3].
- Hiç karşılaşılmamış kahraman: **"Never seen before"**, beceriler gizli [3].
- Yerleşim adına tıklayınca **yerleşim sayfası** açılır; oradan **"Track"** ile haritada işaretlenir [5][6].

> **Bizim simülasyon kuralı (öneri):** her lord hareket ettikçe
> `lastSeen = { settlementId, day, status }` güncellenir; oyuncu bir yerleşime girdiğinde
> **o yerleşimdeki son görülmeler "taze"** işaretlenir (1 gün). Böylece "dedikodu" hissi doğar.

### B.6 Aile ağacı ✅

Görsel: `docs/renders/reference/bl-family-tree.jpg`

- Solda **büyük portre**, sağda **portre kartlarından oluşan soyağacı**; kuşaklar arası **çizgilerle** bağlı.
- Kartlar küçük (yüz + isim), ölü karakterler soluk gösterilir.

### B.7 Kavramlar (Concepts) ✅

Görsel: `docs/renders/reference/bl-concepts.jpg`

- Oyun terimleri sözlüğü: `Army, Influence, Kingdom, Party, Perks, Renown, Skills, Trade Goods…`
- Sol tarafta "Types" filtresi, sağda alfabetik liste.

> Bizde bu, **tooltip + terim sözlüğü** olarak çok işe yarar (örn. "Renown", "Nüfuz", "Haraç").

### B.8 DİYALOG EKRANI ✅ / 🟡

Görsel: `docs/renders/reference/bl-barter-dialogue.png` · Tasarım notu: [7]

- Diyalog, ayrı bir "menü" değil; **sahnenin içinde sinematik bir kamera**:
  - Kamera oyuncunun bakış açısını **korur** (1. şahıssa 1., 3. şahıssa 3. şahıs),
  - **Depth of field** ile karşıdaki karaktere odaklanır,
  - UI **göze batmaz** (minimal),
  - Lord/ haydut lideri konuşurken **yanında muhafızlar** görünür (statü göstergesi) [7].
- Diyalog seçenekleri **alt panelde dikey liste** hâlinde; seçimle ilerler (dallanan ağaç).
- Oyunda **ikna (persuasion)** mini-oyunu var (seçenek + puan/risk).

### B.9 BARTER (takas) EKRANI ✅

Görsel: `docs/renders/reference/bl-barter-dialogue.png`

```
┌───────────────────┐                        ┌───────────────────┐
│ [portre] Fafen    │      (3B SAHNE)        │       Justin [pr] │
│ 🪙 57.800         │   iki karakter karşı   │          🪙 10.436 │
│ ▾ Denars          │        karşıya         │          ▾ Denars  │
│ ▾ Fiefs           │                        │          ▾ Fiefs   │
│ ▾ Prisoners       │                        │          ▾ Items   │
│ ▾ Items           │                        │            Mule  7 │
│ ▾ Diplomacy       │                        │            …      │
│ ▾ Other           │                        │                   │
└───────────────────┘  ┌──────────────────┐  └───────────────────┘
                       │  Offer özeti      │
                       │  "Make peace…"    │
                       └──────────────────┘
                  [ Cancel ]      [ Offer ]
```

- **Sol = karşı taraf, sağ = oyuncu**, ikisi de **akordeon** bölümler (Denars/Fiefs/Prisoners/Items/Diplomacy/Other).
- Satır sağındaki **turuncu ok** = transfer; **altın limiti** var (karşı tarafın altınından fazlasını alamazsın).
- Ortada **teklif özeti**, altta **Cancel / Offer**.

### B.10 ASKERE ALMA (Recruitment) ✅

Görsel: `docs/renders/reference/bl-recruitment.jpg`

```
┌────────────────────────────────────────────────────────────────┐
│                        ⟡ Recruitment ⟡                      ✕  │
├──────────────┬──────────────────────────────────────┬──────────┤
│ Zestia       │  [kart][kart][kart][kart][kart]      │          │
│ (köy metni)  │   Aserai Genç  …                     │ detay /  │
│ ▸ Take a walk│  İsim · adet · ücret                 │ seçili   │
│ ▸ Recruit    │  [kart][kart][kart][kart]            │ birlik   │
│ ▸ Buy goods  │                        Recruit All  │          │
│ ▸ Wait here  │                                      │          │
│ ▸ Leave      │                                      │          │
├──────────────┴──────────────────────────────────────┴──────────┤
│ 🏇 6.0   👥 4   ⚔ 5/21   🪙 920            [Cancel]  [Done]     │
└────────────────────────────────────────────────────────────────┘
```

- Ortada **birlik kartları**: portre + ad + **adet** (yeşil rozet) + **maliyet**.
- Sağ üstte **"Recruit All (N) »"**.
- Alt barda **hız / asker / parti kapasitesi / altın**; sağ altta `Cancel / Done`.
- Sol sütunda yerleşim metni + aksiyon listesi (Bannerlord menü dili).

### B.11 PAZAR / TİCARET 🟡

- İki sütun: **şehir envanteri ↔ oyuncu envanteri**, satırda **ikon + ad + fiyat + adet**.
- **"Transfer All"** düğmesi, hedefin **altın limitine kadar** aktarır [9].
- Altta iki tarafın **altını**, üstte yerleşim adı ve **gümrük/vergi** bilgisi.

> Bizde `BannerlordMarketModal.tsx` (646 satır) zaten çift sütunlu. **Sıfırdan yazmayacağız**, düzenini
> Bannerlord şemasına çekeceğiz: akordeon bölümler, turuncu transfer okları, alt bar, "hepsini aktar".

### B.12 ORTAK GÖRSEL DİL (design tokens) ✅

| Öğe | Bannerlord | Bizim mevcut kod |
| :--- | :--- | :--- |
| Panel yüzeyi | Koyu ahşap + eskitilmiş parşömen | `#120f0b`, `#1a1510` |
| Çerçeve/çizgi | Altın/bronz çift çizgi, perçin | `#c6a15b`, `#b45309` |
| Başlık plakası | Ortada kalkan biçimli plaka | `GameHud` plaka stili |
| Tipografi | Küçük-caps serif | `--font-display: Cinzel` (zaten var!) |
| Vurgu | Sıcak altın, kehribar | `#fbbf24`, `#fde68a` |
| Tehlike | Koyu kırmızı | `#991b1b` |
| Arka plan | Sahne karartılır (vignette) | `bg-black/60 backdrop-blur` |

**Sonuç:** Renk paletimiz ve Cinzel fontumuz zaten Bannerlord diline çok yakın.
Yeni bir tema yazmaya gerek yok; **bileşen kütüphanesi** çıkarmak yeterli.

---

## 5. BÖLÜM C — BİZİM DEPODA BUGÜN NE VAR?

### C.1 Arayüz envanteri

| Dosya | Satır | Durum | Plan |
| :--- | ---: | :--- | :--- |
| `src/components/GameHud.tsx` | 1434 | 5 sekme: atlas / ordu / karakter / envanter / kronik | Bannerlord düzenine çekilecek (Faz 4) |
| `src/components/WorldCanvas.tsx` | 2624 | Harita + kamera + etiketler | Dokunulmayacak (sadece "Track" bağlanacak) |
| `src/components/SettlementModal.tsx` | 1743 | 11 sekme: overview/keep/market/tavern/arena/smithy/dungeon/garrison/buildings/recruit/siege | Sol aksiyon listesi + merkez kart düzeni |
| `src/components/KingdomManagementModal.tsx` | 1411 | Krallık divanı | Ansiklopediye bağlanacak |
| `src/components/CharacterCreatorModal.tsx` | 1131 | DNA tabanlı yaratıcı | Portre üretiminde yeniden kullanılacak |
| `src/components/BannerlordMarketModal.tsx` | 646 | Çift sütunlu pazar + 3B manken | **Var olanı geliştireceğiz** (Faz 7) |
| `src/components/DiplomacyModal.tsx` | 467 | Lord diplomasi (Gemini destekli) | Barter/diyalog ile birleştirilecek (Faz 6) |
| `src/components/BattlePrewarmModal.tsx` | 202 | Yükleme ekranı | Aynı plaka dili |
| `src/components/LordPortraitCanvas.tsx` | 168 | **Canlı 3B lord portresi** | ⭐ Ansiklopedi portrelerinin temeli |
| `src/components/CharacterArenaView.tsx` | 2933 | Arena + HUD | Dokunulmayacak |

### C.2 Veri modeli boşlukları (en kritik bulgu)

`LordAgent` (rules.ts:167) alanları:

```
id, name, title, faction, personality, relation, x, z, targetX, targetZ,
armySize, roster, wounded?, prisoners?, morale?, foodDays?,
isAtWarWithPlayer, isAlliedWithPlayer, currentAction, bannerColor,
persuasionPips?, morphDNA?
```

**Eksik olanlar (Bannerlord'da olup bizde olmayan):**

| Alan | Neden gerekli | Nerede kullanılacak |
| :--- | :--- | :--- |
| `birthDay` / `age` | Yaş, evlilik, varis, yaşlılık ölümü | Hero sayfası, aile ağacı |
| `clanId` | Klan sayfası, "hangi haneden" | Hero + Klan sayfası |
| `kingdomId` | Krallık sayfası, savaş listesi | Krallık sayfası |
| `lastSeen { settlementId, day, status }` | **"Son nerede görüldü"** | Hero sayfası + arama |
| `fatherId / motherId / spouseId / childrenIds` | Aile ağacı | Aile sayfası |
| `skills` | Beceri ikonları | Hero sayfası |
| `traits` | Kişilik (cesaret, onur, cömertlik, merhamet) | Hero sayfası |
| `occupation` | Lord / Leydi / Kral / Gezgin / Önemli kişi | Filtreler |
| `bio` | Lore metni | Hero sayfası |
| `isPrisonerOf` / `isDead` | Durum satırı | Hero sayfası |
| `equipment` | "Savaşta ne taşıyor" | Hero sayfası |

> İyi haber: `CampaignState.skills`, `BannerlordSkillId`, `unlockedPerks` tipleri **zaten var** (kullanılmıyor).
> Yani veri modelinin yarısı hazır, sadece lordlara bağlanmamış.

### C.3 Eksik ekranlar

- ❌ Ansiklopedi (hiç yok)
- ❌ Diyalog ekranı (sadece `DiplomacyModal` var)
- ❌ Quest / görev defteri (hiç yok)
- ⚠️ Pazar (var ama Bannerlord düzeninde değil)
- ⚠️ Askere alma (`SettlementModal` içinde sekme, ayrı ekran değil)

---

## 6. BÖLÜM D — YENİ VERİ MODELİ (taslak)

> Amaç: **tek kaynak (single source of truth)**. Ansiklopedi, diyalog, quest ve savaş aynı kayıtları okur.

```ts
// src/game/heroes.ts (YENİ)

export type Occupation =
  | 'RULER' | 'LORD' | 'LADY' | 'HEIR' | 'CLAN_LEADER'
  | 'WANDERER' | 'NOTABLE' | 'MERCHANT' | 'GANG_LEADER' | 'HEADMAN';

export type HeroStatus =
  | 'AT_SETTLEMENT'   // bir yerleşimde duruyor
  | 'TRAVELING'       // yolda
  | 'IN_ARMY'         // bir ordunun içinde
  | 'IN_BATTLE'       // savaşta
  | 'PRISONER'        // esir
  | 'DEAD';

export interface LastSeen {
  settlementId: string;   // en son görüldüğü yerleşim
  day: number;            // kampanya günü
  status: HeroStatus;
  /** Oyuncu o yerleşime girdiğinde "taze" sayılır (dedikodu) */
  fresh?: boolean;
}

export interface HeroTraits {
  valor: number;       // -2..+2  cesaret / hesapçılık
  honor: number;       // -2..+2  onur
  generosity: number;  // -2..+2  cömertlik
  mercy: number;       // -2..+2  merhamet
}

export interface HeroRecord {
  id: string;
  name: string;
  title: string;
  occupation: Occupation;
  culture: FactionId;
  clanId: string;
  kingdomId: string | null;

  birthDay: number;          // yaş bundan hesaplanır
  relation: number;          // -100..+100 (oyuncuya)

  skills?: Partial<Record<BannerlordSkillId, { level: number; focus: number }>>;
  traits?: HeroTraits;
  attributes?: Record<AttributeId, number>;

  family: {
    fatherId?: string;
    motherId?: string;
    spouseId?: string;
    childrenIds: string[];
  };

  lastSeen: LastSeen;
  status: HeroStatus;
  prisonerOf?: string;

  equipment?: Record<EquipmentSlotId, string>;
  bannerColor: string;
  morphDNA?: CharacterMorphDNA;   // zaten var → portre üretimi
  bio?: string;
}
```

```ts
// src/game/kingdoms.ts (YENİ)
export interface KingdomRecord {
  id: string;
  name: string;
  culture: FactionId;
  rulerId: string;            // kral/lord id
  clanIds: string[];
  fiefIds: string[];          // şehir/kale/köy
  treasury: number;
  wars: { kingdomId: string; sinceDay: number; warScore: number }[];
  policies: string[];
  bannerColor: string;
}

export interface ClanRecord {
  id: string;
  name: string;
  kingdomId: string | null;
  leaderId: string;
  memberIds: string[];
  tier: number;
  renown: number;
  wealth: number;
  fiefIds: string[];
  bannerColor: string;
}
```

**Göç stratejisi (geriye uyum):**

1. `LordAgent` alanları **korunur** (oyunun geri kalanı bozulmaz).
2. Yeni `HeroRecord` üretilirken `LordAgent`'tan **türetilir** (adapter), sonra iki yön senkronlanır.
3. `CampaignState`'e `heroes?: Record<string, HeroRecord>`, `clans?: Record<string, ClanRecord>`,
   `kingdoms?: Record<string, KingdomRecord>` **opsiyonel** olarak eklenir → eski save'ler bozulmaz.
4. Ansiklopedi **yalnızca yeni kayıtları** okur. Lord hareket ettiğinde `lastSeen` güncellenir.

---

## 7. BÖLÜM E — ARAYÜZ TASARIM SİSTEMİ

### E.1 Tokenlar

```css
--bl-wood-900:#0e0b08;  --bl-wood-800:#17120c;  --bl-wood-700:#231a11;
--bl-gold-500:#c6a15b;  --bl-gold-300:#e2c489;  --bl-gold-100:#f8f0df;
--bl-ember:#f59e0b;     --bl-danger:#991b1b;    --bl-ok:#34d399;
--bl-frame: 1px solid rgba(198,161,91,.55);
--bl-plaque: linear-gradient(180deg,#2a2015,#140f09);
```

### E.2 Bileşen kütüphanesi (yeni: `src/components/ui/`)

| Bileşen | Görev |
| :--- | :--- |
| `<Plaque>` | Ortada kalkan biçimli başlık plakası (Cancel/Done çubukları dâhil) |
| `<Panel>` | Çift çizgili altın çerçeve + perçin köşeler |
| `<PortraitFrame>` | 3B portre yuvası (lazy mount, tek WebGL bağlamı) |
| `<StatRow>` | İkon + etiket + değer satırı |
| `<AccordionSection>` | Barter/Info bölümleri |
| `<FilterGroup>` | Sol filtre listesi (checkbox ağacı) |
| `<ListRow>` | Ansiklopedi liste satırı (portre + ad + 2 satır bilgi) |
| `<TabStrip>` | Sekmeler (Settlements/Heroes/…) |
| `<Breadcrumb>` | `Home / Heroes / …` |
| `<Tooltip>` | Terim sözlüğü (Concepts) entegre |
| `<DialogOption>` | Diyalog seçeneği satırı |
| `<MoneyBar>` | Alt bar: altın, hız, asker, parti kapasitesi |

### E.3 Wireframe'ler

**(a) Ansiklopedi ana sayfa**

```
┌───────────────────────────────────────────────────────────────┐
│                      ⟡  ANSİKLOPEDİ  ⟡                    ✕   │
├───────────────────────────────────────────────────────────────┤
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│   │YERLEŞİM│ │KAHRAMAN│ │ BİRLİK │ │KRALLIK │ │  KLAN  │      │
│   │  🏰    │ │  🧔    │ │  ⚔     │ │  🛡    │ │  🏳    │      │
│   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘      │
│                        ‹  1 / 2  ›                             │
└───────────────────────────────────────────────────────────────┘
```

**(b) Kahraman listesi**

```
┌────────────┬──────────────────────────────────────────────────┐
│ FİLTRE     │  [arama…………………]        sırala: [İlişki ▾]      │
│ ▸ Tür      │ ┌─────────────────────────────────────────────┐  │
│  ▸ Lord    │ │ [pr] Hap the Hyena   Gezgin · Aserai        │  │
│  ▸ Leydi   │ │      İlişki -1 · Yaş 18 · Phocaon (5g)      │  │
│  ▸ Kral    │ ├─────────────────────────────────────────────┤  │
│ ▸ Kültür   │ │ [pr] …                                      │  │
│ ▸ Krallık  │ └─────────────────────────────────────────────┘  │
└────────────┴──────────────────────────────────────────────────┘
```

**(c) Diyalog**

```
┌───────────────────────────────────────────────────────────────┐
│  (3B sahne: oyuncu ↔ lord, muhafızlar arkada, DOF açık)        │
│                                                               │
│   ┌───────────────────────────────────────────────────────┐   │
│   │ Lord Vlan: "Yine mi sen? Kalradya seni fazla şımartmış."│   │
│   ├───────────────────────────────────────────────────────┤   │
│   │ ▸ Bir iş teklifin var mı?                             │   │
│   │ ▸ Savaş hakkında ne düşünüyorsun?                     │   │
│   │ ▸ [İkna] Bana katıl. (Zorluk: Orta)                   │   │
│   │ ▸ Sadece geçmek istiyorum.                            │   │
│   └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### E.4 Etkileşim

| Kısayol | İşlev |
| :--- | :--- |
| `N` | Ansiklopediyi aç/kapat |
| `Esc` | Bir sayfa geri / kapat |
| `/` | Aramaya odaklan |
| `↑ ↓ Enter` | Liste gezinme |
| `Tab` | Sağ/sol panel (barter) |
| `B` | Bulunduğun yerleşimi "takip et" (Track) |

### E.5 Performans kuralları

1. **Tek WebGL bağlamı:** Ansiklopedi portreleri için ayrı `WebGLRenderer` açılmayacak; ortak bir
   `PortraitRenderer` (offscreen, 256×384) kullanılıp **`CanvasTexture`** olarak önbelleğe alınacak.
2. Portre yalnızca **görünür olduğunda** üretilecek (IntersectionObserver benzeri mantık veya `requestIdleCallback`).
3. Liste sanallaştırma: 500+ kahraman satırı için `overflow-y-auto` + görünür dilim (windowing).
4. Portre önbelleği: `heroId + morphDNA hash + equipment hash` anahtarıyla LRU (max ~64 doku).

---

## 8. BÖLÜM F — FAZ FAZ YOL HARİTASI

> Efor birimi: **1 birim ≈ yarım gün**. Her fazın sonunda commit + doğrulama.

### ✅ Faz 0 — Veri temeli (2 birim) · *ön koşul*
- `HeroRecord`, `ClanRecord`, `KingdomRecord`, `LastSeen` tipleri.
- `LordAgent` → `HeroRecord` adapter; `CampaignState`'e opsiyonel alanlar.
- Yaş hesabı (`birthDay`), `lastSeen` güncelleme kancası (lord hareketi + yerleşime giriş).
- **Kabul:** `probe-heroes.ts` → 60 lordun tamamı için yaş, klan, krallık, son görülme dolu; `tsc` temiz.

### ✅ Faz 1 — Ansiklopedi kabuğu (2 birim)
- `EncyclopediaModal` + `navigationStack` + breadcrumb + arama + `N` kısayolu.
- Ana sayfa kart karuseli (prosedürel sanat).
- **Kabul:** her yerden `openEncyclopedia()`; `Esc` geri gider; arama 3 karakterde sonuç verir.

### ✅ Faz 2 — Entity sayfaları (4 birim)
- Hero, Klan, Krallık, Yerleşim, Birlik sayfaları; filtre + sıralama.
- **Kabul:** Hero sayfasında 14 alan dolu; her isim tıklanabilir; "Track" haritada işaretler.

### ✅ Faz 3 — Aile ağacı + ilişkiler (1 birim)
- Kuşak çizgileri, ölü/çocuk/evlilik durumları.

### ✅ Faz 4 — Diğer HUD'lar (3 birim)
- GameHud sekmeleri, ordu paneli, krallık paneli, karakter/envanter, kronik → plaka dili.

### ✅ Faz 5 — Quest sistemi + görev defteri (3 birim)
- Quest veri modeli, tetikleyiciler, ödüller, günlük (journal) UI.

### ✅ Faz 6 — Diyalog ekranı (4 birim)
- Diyalog grafiği (node/edge), seçenek listesi, ikna mini-oyunu, barter geçişi.

### ✅ Faz 7 — Pazar (2 birim)
- Mevcut `BannerlordMarketModal`'ı Bannerlord şemasına çekme (akordeon + transfer okları + alt bar).

### ✅ Faz 8 — Askere alma (1 birim)
- Birlik kartları, `Recruit All`, alt bar.

### ✅ Faz 9 — Yüzler, diyaloglar, etkileşimler (3 birim)
- 24–40 önemli karaktere özgü DNA + kişilik + diyalog seti.

**Toplam ≈ 25 birim.**

---

## 9. BÖLÜM G — DOĞRULAMA PLANI

| Katman | Yöntem | Araç |
| :--- | :--- | :--- |
| Tip/bütünlük | `tsc --noEmit` | `npm run lint` |
| Veri | Birim testleri | `npx tsx --test src/game/rules.test.ts` (+ yeni `heroes.test.ts`) |
| Görsel | Headless render → PNG | `scripts/render-encyclopedia.ts` (yeni) |
| Etkileşim | DOM'suz durum makinesi testi | `scripts/probe-encyclopedia.ts` (yeni) |
| Regresyon | Mevcut | `npm run verify:armory`, `npx tsx scripts/probe-bow.ts` |
| Derleme | `vite build` | — |

---

## 10. BÖLÜM H — RİSKLER

| Risk | Etki | Önlem |
| :--- | :--- | :--- |
| 60+ WebGL portre = bağlam patlaması | 🔴 Yüksek | Tek offscreen renderer + doku önbelleği (§E.5) |
| Veri modeli ikiye ayrılır (LordAgent vs HeroRecord) | 🟠 Orta | Tek yönlü adapter + tek senkron noktası |
| Ansiklopedi 2933 satırlık arena dosyasına sızar | 🟠 Orta | Ayrı klasör: `src/components/encyclopedia/` |
| Türkçe metin taşması (uzun isimler) | 🟡 Düşük | `text-ellipsis` + test cümleleri |
| Mevcut `DiplomacyModal` ile çakışma | 🟡 Düşük | Faz 6'da birleştirme kararı |

---

## 11. BÖLÜM I — KARARLAR (onaylandı: 2026-10-21)

Sorduğum 4 soru yanıtlandı; aşağıdaki kararlar **bağlayıcıdır**:

| # | Soru | Karar | Sonuç |
| :--- | :--- | :--- | :--- |
| 1 | Görsel dil | **Hibrit** | Düzen/çerçeve Bannerlord gibi, ağır parşömen yerine hafif dokulu **koyu yüzey**. Mevcut `#c6a15b` + Cinzel korunur. |
| 2 | Fog of war | **Orta yol** | İsim, unvan, klan, krallık, ilişki **her zaman** görünür. **Yaş ve beceriler** yalnızca kahramanla tanışılınca (`revealed`). |
| 3 | Portreler | **Tek kare (baked)** | Portreler bir kez render edilip doku olarak önbelleğe alınır (LRU ~64). Canlı 3B yalnızca detay sayfasında opsiyonel. |
| 4 | Sıra | **Önce veri temeli** | `Faz 0 → Faz 1 (Ansiklopedi kabuğu) → …` Kullanıcının verdiği içerik sırası korunur. |

### ⚠️ Faz 0 sırasında çıkan kritik bulgu

Depoda **yalnızca 9 lord** var (`rules.test.ts:83` → `state.lords.length === 9`).
Bannerlord'da bir krallıkta tek başına 10–20 klan/lord bulunur; ansiklopedi 9 kayıtla **boş görünür**.

**Karar gerekiyor:** kahraman sayısı (§14'te soru olarak duruyor). Faz 0 bunu **veri üretimini
tek yerden** yapabilecek şekilde kurguladı: `buildHeroRegistry()` kaç lord olursa olsun çalışır.

---

## 12. KAYNAKLAR

**Metin kaynakları**

- [1] The Book of Knowledge (mod) — filtre/sıralama listesi: <https://www.nexusmods.com/mountandblade2bannerlord/mods/9490>
- [2] r/Bannerlord — "last seen" konum tazeleme davranışı: <https://www.reddit.com/r/mountandblade/comments/frxf0q/bannerlord_list_of_companions_by_surname_and/>
- [3] Gamer of Passion — "Never seen before", günlük konum tazeleme: <https://gamerofpassion.com/bannerlord-companions/>
- [4] Encyclopedia Extender (mod) — hero page ek alanları (seviye, teçhizat, esir durumu): <https://steamcommunity.com/sharedfiles/filedetails/?id=2875180306>
- [5] Set Ready Game — ansiklopedi kullanımı, "Last seen", Track: <https://www.setreadygame.com/games/guides/how-to-open-and-use-the-encyclopedia-in-mount-and-blade-bannerlord/>
- [6] PCGamesN — `N` tuşu, Heroes → Wanderer akışı: <https://www.pcgamesn.com/mount-and-blade-2-bannerlord/companions-locations-best>
- [7] TaleWorlds geliştirici blogu — konuşma kamerası, DOF, muhafızlar, ikna: <https://gamebanshee.com/news/121762-mount-blade-ii-bannerlord-developer-blog-conversation-camera.html>
- [8] GOGDB yama notları — ansiklopedi sıralamaları (Relation, Age…): <https://www.gogdb.org/product/1564781494/releasenotes>
- [9] 1.3 yama notları — "Transfer All" altın limiti: <https://www.bisecthosting.com/blog/mount-blade-bannerlord-1-3-update-patch-notes-release-date-beta>
- [10] Mod API dokümanı — `HeroLastSeenInformation` alanları: <https://docs.bannerlordmodding.com/_csharp-api/campaignsystem/hero.html>

**Ekran görüntüsü referansları** (`docs/renders/reference/`)

| Dosya | Ne gösteriyor |
| :--- | :--- |
| `bl-encyclopedia-home.png` | Ana sayfa kart karuseli |
| `bl-hero-page.jpg` | **Hero sayfası**: portre, skills, Info grid, "Last seen" |
| `bl-family-tree.jpg` | Aile ağacı |
| `bl-barter-dialogue.png` | Diyalog sahnesi + barter panelleri |
| `bl-recruitment.jpg` | Askere alma ekranı |
| `bl-concepts.jpg` | Kavramlar sözlüğü |

> Görseller yalnızca **tasarım referansı** olarak saklanmıştır; oyun varlığı olarak kullanılmayacaktır.

---

## 13. FAZ 0 — VERİ TEMELİ (TAMAMLANDI ✅)

### Eklenen dosyalar

| Dosya | İçerik |
| :--- | :--- |
| `src/game/heroes.ts` (~330 satır) | `HeroRecord`, `LastSeen`, `HeroTraits`, `HeroFamily`, `HeroRegistry` tipleri; `buildHeroRegistry()`, `ageOf()`, `locative()`, `lastSeenLabel()`, `revealHero()`, `visibleHeroInfo()`, `searchHeroes()` |
| `scripts/probe-heroes.ts` | 14 doğrulama: kapsam, zorunlu alanlar, yaş, **determinizm**, son görülme, krallık/klan, beceri, kişilik, fog, arama, durum |

### Tasarım notları

- **Deterministik türetim:** yaş, beceri ve kişilik `hash32(heroId)` üzerinden üretilir →
  aynı lord her açılışta aynı yaşta/beceride. Save dosyasına yazmak gerekmez.
- **`LordAgent` şeması değişmedi** → oyunun geri kalanı ve mevcut testler etkilenmedi.
- **Türkçe bulunma hâli:** `locative()` ünlü uyumu + ünsüz sertleşmesi uygular.
  `Lycaron'da · Chanos'ta · Marunath'ta · Pravend'de · Sotysia'da` (çok sözcüklü adlarda
  `… yerleşiminde` güvenli biçimi).
- **Durum çıkarımı:** `LordAgent.currentAction` metninden (`esir`, `kuşatma`, `ordu` …) +
  en yakın yerleşime uzaklıktan `HeroStatus` üretilir.

### Ölçüm sonucu

```
✓ her lord için kayıt var (9/9)          ✓ son görülme yerleşimi geçerli (9/9)
✓ zorunlu alanlar dolu                   ✓ her kahramanda 18 beceri
✓ yaşlar 37–61, tam sayı                 ✓ beceri seviyeleri 30–173
✓ iki kez üretim birebir aynı            ✓ kişilik özellikleri -2..+2
✓ krallık adları FACTION_INFO uyumlu     ✓ tanışılmamışta yaş+beceri gizli
```

Örnek çıktı:

```
Rhagaea    58  RULER        Kalradya İmparatorluğu   Lycaron'da bugün görüldü
Kargı      50  GANG_LEADER  Kara Geçit Yağmacıları   Chanos'ta bugün görüldü
Derthert   46  RULER        Vlandiya Krallığı        Pravend'de bugün görüldü
Unqid      58  RULER        Aserai Sultanlığı        Tubilis Köyü yerleşiminde …
```

---

## 14. FAZ 0b — DÜNYA NÜFUSU (TAMAMLANDI ✅)

### Kararlar (onaylandı)

| Konu | Karar |
| :--- | :--- |
| Kahraman sayısı | **~40** (9 elle yazılmış + 31 üretilen) |
| Simülasyon | **Gerçek partiler** — haritada dolaşır, savaşa girer, "son görüldü" gerçekten değişir |

### Uygulama

- **`src/game/heroGen.ts` (yeni):** kültür başına isim/unvan/sancak havuzları
  (`empire, vlandia, battania, sturgia, khuzait, aserai, bandits`), deterministik
  **izole** isim seçimi (aynı kültürde tekrar yok), 16–30 kişilik gerçek partiler.
- **`createInitialCampaignState`:** `[...elle yazılan, ...generateLordParties()]`
  → tek satırlık entegrasyon; `LordAgent` şeması değişmedi.
- **`rules.test.ts`:** lord sayısı beklentisi `9 → 40` güncellendi.

### Ölçüm

```
40 kahraman · 211 yerleşim · 905 toplam asker
faksiyon: empire 10 · vlandia 6 · battania 5 · sturgia 5 · khuzait 5 · aserai 5 · bandits 4
isim tekrarı: yok        benzersiz id: 40/40
13 leydi (LADY), 13 hükümdar sınıfı (RULER)
kampanya kurulumu: 1.7 ms      40 lord için A* toplam: 9.4 ms (0.24 ms/lord)
```

### Etki analizi

| Alan | Etki | Durum |
| :--- | :--- | :--- |
| Harita (WorldCanvas) | Lord başına 1 atlı model + 1 DOM etiketi → **31 ek nesne** | ✅ kabul edilebilir |
| Navigasyon (A*) | 40 yol, toplam 9.4 ms | ✅ |
| Kampanya tick'i | `lords.map` → 40 kayıt | ✅ |
| Testler | 28/28 geçiyor | ✅ |
| Build | `vite build` başarılı | ✅ |

---

## 15. FAZ 1a — ANSİKLOPEDİ KABUĞU (TAMAMLANDI ✅)

### Eklenen dosyalar

| Dosya | Satır | İçerik |
| :--- | ---: | :--- |
| `src/game/encyclopedia.ts` | ~380 | **Saf mantık** (React/Three yok): rota tipleri, gezinme yığını (`pushRoute`/`goBack`/`jumpTo`), dizin (`buildEncyclopediaIndex`), arama (`searchEncyclopedia`), filtre/sıralama (`filterHeroes`), breadcrumb |
| `src/components/encyclopedia/EncyclopediaModal.tsx` | ~560 | Arayüz kabuğu: plaka başlık, arama, breadcrumb + geri, ana sayfa kart karuseli, kahraman listesi (filtre + sıralama), kahraman detay sayfası |
| `scripts/probe-encyclopedia.ts` | ~140 | 30 mantık doğrulaması |
| `scripts/probe-encyclopedia-ui.tsx` | ~90 | **26 arayüz duman testi** (`renderToStaticMarkup`, tarayıcısız) |

### Kullanım

- **`N`** → ansiklopedi aç/kapat · **`Esc`** → bir sayfa geri (kök sayfada kapatır)
- **`/`** → aramaya odaklan
- Üst barda **📖 Ansiklopedi [N]** düğmesi
- Açılırken kampanya zamanı durur (`campaignTimeScale = 0`)

### Ne çalışıyor

| Özellik | Durum |
| :--- | :--- |
| Ana sayfa kart karuseli (Kahramanlar / Krallıklar / Klanlar / Yerleşimler / Kavramlar) | ✅ |
| Arama (kahraman + klan + krallık + yerleşim, tür etiketli) | ✅ |
| Breadcrumb + geri yığını (`Ansiklopedi / Kahramanlar / Rhagaea`) | ✅ |
| Kahraman listesi: meslek filtresi, krallık filtresi, 5 sıralama | ✅ |
| Kahraman detayı: bilgi ızgarası, son görülme (tıklanabilir), klan/krallık bağlantısı, kişilik, beceri, açıklama | ✅ |
| Orta yol fog: yaş + beceri gizli, "Tanış" düğmesiyle açılıyor | ✅ |
| Krallık / Klan / Yerleşim / Kavram sayfaları | 🚧 Faz 2 (yer tutucu) |
| Portreler | 🚧 Faz 1b (şu an baş harf + sancak rengi) |

### Doğrulama

```
✓ tsc --noEmit                      ✓ vite build (536 ms)
✓ rules.test.ts 28/28               ✓ probe-heroes (40 kahraman)
✓ probe-encyclopedia (30 kontrol)   ✓ probe-encyclopedia-ui (26 kontrol)
```

`probe-encyclopedia-ui` örnek çıktısı:

```
✓ başlık plakası render edildi        ✓ detayda Bilgi bölümü
✓ ana sayfa kartı: Kahramanlar        ✓ detayda son görülme satırı
✓ ana sayfa kartı: Krallıklar         ✓ fog: beceriler gizli
✓ liste başlığı ("N kayıt")           ✓ tanışılmışta beceriler açık
✓ fog: tanışılmamışta yaş gizli       ✓ geçersiz hero id çökmüyor
```

Yeni komutlar: `npm run verify:heroes`, `npm run verify:encyclopedia`

---

## 16. FAZ 1b — KRALLIK / KLAN / YERLEŞİM / KAVRAM SAYFALARI (TAMAMLANDI ✅)

### Eklenen dosyalar

| Dosya | Satır | İçerik |
| :--- | ---: | :--- |
| `src/components/encyclopedia/parts.tsx` | ~95 | Ortak parçalar: `initials`, `occupationColor`, `InfoCell`, `LinkCard`, `Chip`, `SectionTitle`, `BannerBadge` |
| `src/components/encyclopedia/pages.tsx` | ~600 | Krallık listesi+detayı, Klan listesi+detayı, Yerleşim listesi+detayı, Kavramlar sözlüğü |
| `src/game/encyclopedia.ts` | +90 | `kingdomClans`, `kingdomMembers`, `kingdomFiefs`, `clanMembers`, `settlementHeroes`, `settlementKingdom`, `warringKingdoms`, `SETTLEMENT_TYPE_LABELS` |

### Sayfa içerikleri

| Sayfa | Gösterilen |
| :--- | :--- |
| **Krallık listesi** | Sancak rozeti, ad, hükümdar, klan/lord sayısı, tımar sayısı, "Savaşta" etiketi |
| **Krallık detayı** | Kültür, savaş/barış durumu, hükümdar kartı, **klanlar**, **topraklar** (şehir → kale → köy), **lordlar ve leydiler** listesi |
| **Klan listesi/detayı** | Klan adı, krallık, üye sayısı, lider (en üstte), üye listesi |
| **Yerleşim listesi** | Tür filtresi (Şehir/Kale/Köy) + ada göre arama, refah değeri |
| **Yerleşim detayı** | Tür, krallık bağlantısı, refah/garnizon/erzak, yağma durumu, açıklama, **"burada son görülenler"** |
| **Kavramlar** | 16 terim, 4 grup (Savaş / Ekonomi / Siyaset / Karakter) filtresi |

Tüm sayfalar birbirine bağlı: yerleşim → krallık → klan → lord → son görüldüğü yerleşim.
Breadcrumb her kademeyi gösteriyor (`Ansiklopedi / Krallıklar / Kalradya İmparatorluğu`).

### Doğrulama

```
✓ tsc --noEmit                       ✓ vite build (604 ms)
✓ rules.test 28/28                   ✓ probe-heroes
✓ probe-encyclopedia  (44 kontrol)   ✓ probe-encyclopedia-ui (40 kontrol)
```

Yeni arayüz kontrolleri (örnek):

```
✓ krallık listesinde krallık adı      ✓ yerleşim detayında "Burada son görülenler"
✓ krallık detayında Topraklar         ✓ kavramlar: Kalkan Duvarı
✓ klan detayında Lider                ✓ geçersiz kingdom/clan/settlement id çökmüyor
```

### Bilinen sınırlar

- **Portreler** hâlâ baş harf + sancak rengi (Faz 1c).
- **Klan üye sayıları düşük** (kraliyet dışı klanlarda 2–4). Faz 3'te aile/hane üretimiyle dolacak.
- **Yerleşim başına kahraman** az (40 kahraman / 211 yerleşim) → detayda çoğu zaman 0–1 kişi görünür.
  İçerik üretimi (Faz 9) bunu çözecek.

---

## 17. SONRAKİ ADIM — Faz 1c (portreler)

1. **Baked portre hattı:** tek offscreen `WebGLRenderer`, kahraman başına `createCharacterRig` + DNA +
   teçhizat → 128×160 render → `CanvasTexture`/data URL, LRU 64 önbellek.
2. Kullanım yerleri: kahraman listesi (36×36), kahraman detayı (240×320), krallık/klan üye listeleri (32×32).
3. Portre hazır olana kadar mevcut baş harf rozeti "iskelet" olarak kalacak (kademeli yükleme).
