import type { CampaignState, EquipmentSlotId, InventoryItem } from './rules.ts';
import type { ItemIconKey } from './itemIcons.ts';

export type MarketCategory = 'ALL' | 'WEAPON' | 'SHIELD' | 'ARMOR' | 'FOOD' | 'HORSE';

export interface MarketplaceItem {
  id: string;
  name: string;
  category: 'WEAPON' | 'SHIELD' | 'ARMOR' | 'FOOD' | 'HORSE';
  slot: EquipmentSlotId | 'TRADE';
  value: number;
  weight: number;
  statBonus: string;
  /** Faz B3: emoji yerine SVG ikon anahtarı (`components/ItemIcon.tsx`). */
  iconKey: ItemIconKey;
  civilianLegal: boolean;
  tier: number;
  description: string;
}

export const CALRADIA_MARKETPLACE_ITEMS: MarketplaceItem[] = [
  // --- WEAPONS ---
  {
    id: 'mkt_thamaskene_spatha',
    name: 'Thamaskene Lejyoner Spathası',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 580,
    weight: 1.3,
    statBonus: '+84 Kesici · +48 Saplama (Hız: 96)',
    iconKey: 'sword',
    civilianLegal: true,
    tier: 5,
    description: 'Şam çeliğinden dövülmüş, mükemmel dengeli ve keskin elit imparatorluk kılıcı.',
  },
  {
    id: 'mkt_vlandian_arming_sword',
    name: 'Vlandiya Süvari Kılıcı',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 390,
    weight: 1.4,
    statBonus: '+76 Kesici · +42 Saplama (Hız: 92)',
    iconKey: 'sword',
    civilianLegal: true,
    tier: 4,
    description: 'Vlandiya şövalyelerinin at sırtında düşman piyadelerini biçtiği ağır çift ağızlı kılıç.',
  },
  {
    id: 'mkt_battanian_falx',
    name: 'Battaniya İki Elli Falx Kılıcı',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 720,
    weight: 2.3,
    statBonus: '+112 Kesici Hasar · Kalkan Kırıcı',
    iconKey: 'axe',
    civilianLegal: false,
    tier: 5,
    description: 'Kavisli orak şeklinde devasa iki elli bıçak. Düşman kalkanlarını paramparça eder.',
  },
  {
    id: 'mkt_imperial_kontos',
    name: 'İmparatorluk Kontos Ağır Kargısı',
    category: 'WEAPON',
    slot: 'WEAPON3',
    value: 460,
    weight: 2.8,
    statBonus: '+142 Koltuklanmış Hücum Hasarı · Erişim: 265cm',
    iconKey: 'spear',
    civilianLegal: false,
    tier: 5,
    description: 'Ağır katafrakt süvarilerinin düşman hatlarını delip geçtiği devasa kargı.',
  },
  {
    id: 'mkt_steppe_composite_bow',
    name: 'Bozkır Kompozit Refleks Yayı',
    category: 'WEAPON',
    slot: 'WEAPON4',
    value: 520,
    weight: 1.1,
    statBonus: '+72 Delici Ok Hasarı · Çekiş Hızı: 88',
    iconKey: 'bow',
    civilianLegal: false,
    tier: 5,
    description: 'Boynuz ve sinirden lamine edilmiş, at sırtında olağanüstü menzilli öldürücü yay.',
  },
  {
    id: 'mkt_bodkin_arrows',
    name: 'Zırh Delici Bodkin Sadağı (x32)',
    category: 'WEAPON',
    slot: 'WEAPON4',
    value: 180,
    weight: 2.5,
    statBonus: '+4 Ekstra Delici Hasar · 32 Adet',
    iconKey: 'arrows',
    civilianLegal: false,
    tier: 4,
    description: 'Ağır çelik levha zırhları delmek için tasarlanmış kare uçlu elit oklar.',
  },

  // --- SHIELDS ---
  {
    id: 'mkt_sturgian_round_shield',
    name: 'Sturgiya Ağır Ahşap Yuvarlak Kalkan',
    category: 'SHIELD',
    slot: 'WEAPON2',
    value: 360,
    weight: 3.8,
    statBonus: 'Dayanıklılık: 520 · +58 Gövde Koruması',
    iconKey: 'shield',
    civilianLegal: false,
    tier: 4,
    description: 'Demir göbekli sert meşe kalkan. Kalkan duvarı taktiği için mükemmel koruma sağlar.',
  },
  {
    id: 'mkt_vlandian_kite_shield',
    name: 'Vlandiya Şövalye Damla Kalkanı',
    category: 'SHIELD',
    slot: 'WEAPON2',
    value: 510,
    weight: 4.2,
    statBonus: 'Dayanıklılık: 620 · +68 Bacak & Gövde Koruması',
    iconKey: 'shield',
    civilianLegal: false,
    tier: 5,
    description: 'Uzun sivri alt kısmı sayesinde binicinin bacağını ve atın boynunu koruyan asil kalkan.',
  },
  {
    id: 'mkt_legionary_scutum',
    name: 'İmparatorluk Lejyoner Pavise Kalkanı',
    category: 'SHIELD',
    slot: 'WEAPON2',
    value: 590,
    weight: 5.4,
    statBonus: 'Dayanıklılık: 680 · +76 Tam Siper Koruması',
    iconKey: 'shield',
    civilianLegal: false,
    tier: 5,
    description: 'Demir destekli devasa dikdörtgen kalkan. Düşman ok yağmurlarına karşı kale gibidir.',
  },

  // --- ARMORS ---
  {
    id: 'mkt_cataphract_helm',
    name: 'Altın Kakmalı İmparatorluk Katafrakt Miğferi',
    category: 'ARMOR',
    slot: 'HEAD',
    value: 780,
    weight: 3.2,
    statBonus: '+50 Baş Zırhı · +12 Boyun Koruması',
    iconKey: 'helmet',
    civilianLegal: false,
    tier: 6,
    description: 'Bronz yüz maskesi ve altın kakmalı tepeliğiyle düşmana korku salan muhteşem miğfer.',
  },
  {
    id: 'mkt_spangenhelm',
    name: 'Demir Burunluklu Savaşçı Spangenhelmi',
    category: 'ARMOR',
    slot: 'HEAD',
    value: 390,
    weight: 2.6,
    statBonus: '+36 Baş Zırhı · +8 Boyun Koruması',
    iconKey: 'helmet',
    civilianLegal: true,
    tier: 4,
    description: 'Perçinli çelik şeritler ve zincir ense korumalığıyla sağlam savaşçı başlığı.',
  },
  {
    id: 'mkt_heavy_cataphract_cuirass',
    name: 'Ağır İmparatorluk Katafrakt Pullu Zırhı',
    category: 'ARMOR',
    slot: 'BODY',
    value: 1350,
    weight: 12.5,
    statBonus: '+66 Gövde Zırhı · +24 Bacak Zırhı',
    iconKey: 'armor',
    civilianLegal: false,
    tier: 6,
    description: 'Üst üste binen sertleştirilmiş çelik pullardan örülmüş, Kalradya nın en dayanıklı zırhı.',
  },
  {
    id: 'mkt_hauberk_chainmail',
    name: 'Perçinli Kuzeyli Örme Zincir Zırh (Hauberk)',
    category: 'ARMOR',
    slot: 'BODY',
    value: 680,
    weight: 9.8,
    statBonus: '+48 Gövde Zırhı · +14 Kol Zırhı',
    iconKey: 'armor',
    civilianLegal: true,
    tier: 4,
    description: 'Binlerce küçük çelik halkanın birbirine perçinlenmesiyle yapılmış esnek zırh.',
  },
  {
    id: 'mkt_padded_gambeson',
    name: 'Güçlendirilmiş Kalın Dolgulu Gambeson',
    category: 'ARMOR',
    slot: 'BODY',
    value: 220,
    weight: 4.5,
    statBonus: '+28 Gövde Zırhı · +8 Kol Zırhı',
    iconKey: 'cloth',
    civilianLegal: true,
    tier: 2,
    description: 'Keten ve yün katmanlarıyla dikilmiş, hafif ve hareket kabiliyeti yüksek zırh.',
  },
  {
    id: 'mkt_scaled_pauldrons',
    name: 'Aslan Kakmalı Pullu Çelik Omuzluk & Pelerin',
    category: 'ARMOR',
    slot: 'SHOULDER',
    value: 490,
    weight: 3.5,
    statBonus: '+20 Gövde · +16 Kol Zırhı · +5 Nam',
    iconKey: 'shoulder',
    civilianLegal: true,
    tier: 5,
    description: 'Omuzları koruyan çelik katmanlar ve sancaktar renginde asil ipek pelerin.',
  },
  {
    id: 'mkt_plate_gauntlets',
    name: 'Çelik Levhalı Şövalye Eldivenleri',
    category: 'ARMOR',
    slot: 'GLOVES',
    value: 360,
    weight: 1.8,
    statBonus: '+26 Kol & El Zırhı',
    iconKey: 'gloves',
    civilianLegal: true,
    tier: 4,
    description: 'Parmak eklemlerini koruyan mafsallı çelik parçalarla zırhlanmış eldiven.',
  },
  {
    id: 'mkt_plated_greaves',
    name: 'Zincirli Çelik Dizçekli Süvari Çizmeleri',
    category: 'ARMOR',
    slot: 'LEG',
    value: 480,
    weight: 2.8,
    statBonus: '+34 Bacak Zırhı',
    iconKey: 'boots',
    civilianLegal: true,
    tier: 5,
    description: 'Diz kapaklarını ve kaval kemiklerini koruyan çelik takviyeli süvari botları.',
  },

  // --- MOUNTS & HARNESS ---
  {
    id: 'mkt_aserai_pureblood',
    name: 'Safkan Aserai Çöl Savaş Küheylanı',
    category: 'HORSE',
    slot: 'MOUNT',
    value: 920,
    weight: 0,
    statBonus: 'Hız: 68 · Manevra: 74 · Can: 240',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 6,
    description: 'Rüzgar gibi koşan, yüksek manevra kabiliyetine sahip efsanevi Aserai atı.',
  },
  {
    id: 'mkt_vlandian_charger',
    name: 'Zırhlı Vlandiya Ağır Hücum Atı (Destrier)',
    category: 'HORSE',
    slot: 'MOUNT',
    value: 840,
    weight: 0,
    statBonus: 'Hız: 62 · Hücum Hasarı: 38 · Can: 280',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 5,
    description: 'Geniş göğsüyle düşman piyadelerini ezip geçen güçlü Avrupa tarzı savaş atı.',
  },
  {
    id: 'mkt_steppe_steed',
    name: 'Dayanıklı Bozkır Akıncı Atı',
    category: 'HORSE',
    slot: 'MOUNT',
    value: 440,
    weight: 0,
    statBonus: 'Hız: 65 · Manevra: 70 · Can: 210',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 4,
    description: 'Geniş bozkırlarda yorulmadan günlerce yol alabilen çevik akıncı biniti.',
  },
  {
    id: 'mkt_pack_mule',
    name: 'Kervan Yük Katırı',
    category: 'HORSE',
    slot: 'TRADE',
    value: 160,
    weight: 0,
    statBonus: '+100 kg Ordu Taşıma Kapasitesi',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 2,
    description: 'Ordunun ganimet ve erzak taşıma kapasitesini artıran uysal katır.',
  },
  {
    id: 'mkt_cataphract_barding',
    name: 'Pullu Katafrakt At Zırhı (Barding)',
    category: 'HORSE',
    slot: 'HARNESS',
    value: 620,
    weight: 18.0,
    statBonus: '+48 Binek Zırhı',
    iconKey: 'harness',
    civilianLegal: false,
    tier: 5,
    description: 'Savaş atının boynunu ve göğsünü saran ağır koruyucu pullu zırh örtüsü.',
  },

  // --- PROVISIONS & TRADE GOODS ---
  {
    id: 'mkt_grain_sack',
    name: 'Kalradya Buğdayı ve Tahıl Çuvalı',
    category: 'FOOD',
    slot: 'TRADE',
    value: 20,
    weight: 10.0,
    statBonus: '+10 Erzak Rezervi',
    iconKey: 'grain',
    civilianLegal: true,
    tier: 1,
    description: 'Ordunun temel besin kaynağı un ve ekmek yapımında kullanılan kaliteli tahıl.',
  },
  {
    id: 'mkt_cured_meat',
    name: 'Kurutulmuş Et ve Tuzlu Sosis',
    category: 'FOOD',
    slot: 'TRADE',
    value: 45,
    weight: 8.0,
    statBonus: '+12 Erzak · +4 Ordu Morali',
    iconKey: 'meat',
    civilianLegal: true,
    tier: 3,
    description: 'Askerlerin moralini ve dövüş isteğini artıran lezzetli kurutulmuş etler.',
  },
  {
    id: 'mkt_smoked_fish',
    name: 'Tütsülenmiş Göl Balığı Sepeti',
    category: 'FOOD',
    slot: 'TRADE',
    value: 28,
    weight: 6.0,
    statBonus: '+8 Erzak · +2 Ordu Morali',
    iconKey: 'fish',
    civilianLegal: true,
    tier: 2,
    description: 'Kuzey göllerinden avlanıp tütsülenmiş dayanıklı balık.',
  },
  {
    id: 'mkt_cheese_wheel',
    name: 'Otlak Peyniri ve Tereyağı Kalıbı',
    category: 'FOOD',
    slot: 'TRADE',
    value: 32,
    weight: 5.0,
    statBonus: '+8 Erzak · +2 Ordu Morali',
    iconKey: 'cheese',
    civilianLegal: true,
    tier: 2,
    description: 'Yayla köylerinden gelen besleyici sert sarı peynir.',
  },
  {
    id: 'mkt_olive_oil',
    name: 'Zeytinyağı Amforası',
    category: 'FOOD',
    slot: 'TRADE',
    value: 85,
    weight: 12.0,
    statBonus: 'Ticari Değer: Şehirlerde kârlı satılır',
    iconKey: 'oil',
    civilianLegal: true,
    tier: 3,
    description: 'Güney imparatorluk koruluklarından toplanmış değerli sızma zeytinyağı.',
  },
  {
    id: 'mkt_iron_ingot',
    name: 'Yüksek Kalite Demir ve Çelik Külçeleri',
    category: 'FOOD',
    slot: 'TRADE',
    value: 110,
    weight: 15.0,
    statBonus: 'Demircilik ve Kervan Malı',
    iconKey: 'iron',
    civilianLegal: true,
    tier: 4,
    description: 'Madenci ocaklarından eritilip kalıba dökülmüş saf demir külçesi.',
  },
  {
    id: 'mkt_velvet_silk',
    name: 'Doğu İpeği ve Kızıl Kadife Dokuma',
    category: 'FOOD',
    slot: 'TRADE',
    value: 220,
    weight: 4.0,
    statBonus: 'Lüks Saray Ticaret Emtiası',
    iconKey: 'cloth',
    civilianLegal: true,
    tier: 5,
    description: 'Kuzait ve Aserai kervanlarıyla taşınan soyluların aradığı kıymetli kumaş.',
  },
  // --- FAZ B3: KATALOG GENİŞLETME (29 → 59) ---
  {
    id: 'mkt_iron_war_axe',
    name: 'Demir Savaş Baltası',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 180,
    weight: 2.1,
    statBonus: '+62 Kesici · Kalkan Kırıcı',
    iconKey: 'axe',
    civilianLegal: false,
    tier: 2,
    description: 'Kuzey ormanlarının demircilerinde dövülen ağır balta; zırhı yarar, kalkanı çatlatır.',
  },
  {
    id: 'mkt_two_handed_war_axe',
    name: 'Kuzeyli Çift Elli Baltası',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 460,
    weight: 3.4,
    statBonus: '+98 Kesici · Uzun erim',
    iconKey: 'axe',
    civilianLegal: false,
    tier: 4,
    description: 'Sturgiya akıncılarının iki eliyle savurduğu uzun saplı balta. Kalkan duvarını dağıtır.',
  },
  {
    id: 'mkt_iron_mace',
    name: 'Demir Topuz',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 160,
    weight: 2.6,
    statBonus: '+54 Darbe · Zırh Delici',
    iconKey: 'mace',
    civilianLegal: true,
    tier: 2,
    description: 'Zırhı kesmek yerine ezen ağır topuz; şövalye zırhına karşı en dürüst cevap.',
  },
  {
    id: 'mkt_spiked_mace',
    name: 'Dikenli Savaş Topuzu',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 430,
    weight: 3.1,
    statBonus: '+86 Darbe · Kırıcı',
    iconKey: 'mace',
    civilianLegal: false,
    tier: 4,
    description: 'Başı dikenlerle kaplı ağır topuz; miğferde iz bırakır, kalkanı deler.',
  },
  {
    id: 'mkt_aserai_spear',
    name: 'Aserai Mızrağı',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 140,
    weight: 1.8,
    statBonus: '+46 Saplama · Uzun erim',
    iconKey: 'spear',
    civilianLegal: true,
    tier: 2,
    description: 'Çöl süvarisinin hafif mızrağı; at üstünde tek elle kullanılacak kadar dengeli.',
  },
  {
    id: 'mkt_infantry_pike',
    name: 'Piyade Uzun Mızrağı',
    category: 'WEAPON',
    slot: 'WEAPON1',
    value: 210,
    weight: 2.9,
    statBonus: '+58 Saplama · Süvari Durdurucu',
    iconKey: 'spear',
    civilianLegal: true,
    tier: 3,
    description: 'Mızrak duvarının belkemiği: süvari hücumunu karşılamak için yere saplanan uzun demir.',
  },
  {
    id: 'mkt_vlandian_crossbow',
    name: 'Vlandiya Arbaleti',
    category: 'WEAPON',
    slot: 'WEAPON2',
    value: 320,
    weight: 3.6,
    statBonus: '+72 Delme · Yavaş Kurulum',
    iconKey: 'crossbow',
    civilianLegal: true,
    tier: 3,
    description: 'Şövalyelerin hor gördüğü ama surlarda en çok işe yarayan silah: zırhı delen cıvata.',
  },
  {
    id: 'mkt_hunting_bow',
    name: 'Avcı Kısa Yayı',
    category: 'WEAPON',
    slot: 'WEAPON2',
    value: 90,
    weight: 0.9,
    statBonus: '+34 Kesme · Hızlı Çekiş',
    iconKey: 'bow',
    civilianLegal: true,
    tier: 1,
    description: 'Köylülerin tavşan avladığı basit yay; savaşta da iş görür, çünkü elin boş kalır.',
  },
  {
    id: 'mkt_battanian_buckler',
    name: 'Battaniya Buckler Kalkanı',
    category: 'SHIELD',
    slot: 'WEAPON3',
    value: 70,
    weight: 1.4,
    statBonus: '+18 Blok · Çevik',
    iconKey: 'shield',
    civilianLegal: true,
    tier: 1,
    description: 'Küçük, yuvarlak ve hafif; orman savaşçısı onu kılıçla birlikte savurur.',
  },
  {
    id: 'mkt_khuzait_round_shield',
    name: 'Bozkır Deri Kalkanı',
    category: 'SHIELD',
    slot: 'WEAPON3',
    value: 160,
    weight: 2.2,
    statBonus: '+34 Blok · Ok Sekmesi',
    iconKey: 'shield',
    civilianLegal: true,
    tier: 2,
    description: 'Ahşap iskelet üzerine gerilmiş ham deri; at üstünde ok yağmuruna karşı hafif ama yeterli.',
  },
  {
    id: 'mkt_aserai_adarga',
    name: 'Aserai Adargası',
    category: 'SHIELD',
    slot: 'WEAPON3',
    value: 240,
    weight: 2.6,
    statBonus: '+44 Blok · Mızrak Yuvası',
    iconKey: 'shield',
    civilianLegal: true,
    tier: 3,
    description: 'Çöl kalkanı: kenarındaki yuvalar mızrağı kilitler, deri kaplama güneşte çatlamaz.',
  },
  {
    id: 'mkt_linen_tunic',
    name: 'Keten Tunik',
    category: 'ARMOR',
    slot: 'BODY',
    value: 45,
    weight: 1.1,
    statBonus: '+6 Zırh',
    iconKey: 'cloth',
    civilianLegal: true,
    tier: 1,
    description: 'Sıradan bir köylünün tek kat giysisi; savaşta ancak deriyi çizilmekten korur.',
  },
  {
    id: 'mkt_leather_jerkin',
    name: 'Deri Yelek',
    category: 'ARMOR',
    slot: 'BODY',
    value: 90,
    weight: 2.4,
    statBonus: '+14 Zırh',
    iconKey: 'armor',
    civilianLegal: true,
    tier: 1,
    description: 'Kaynatılmış deri katmanları; hafif, ucuz ve akıncıların ilk tercihi.',
  },
  {
    id: 'mkt_leather_cap',
    name: 'Deri Miğfer',
    category: 'ARMOR',
    slot: 'HEAD',
    value: 55,
    weight: 0.7,
    statBonus: '+8 Zırh',
    iconKey: 'helmet',
    civilianLegal: true,
    tier: 1,
    description: 'Kalınlaştırılmış deri başlık; taş ve sopaya karşı işe yarar, kılıca karşı pek değil.',
  },
  {
    id: 'mkt_chain_hood',
    name: 'Zincir Başlık',
    category: 'ARMOR',
    slot: 'HEAD',
    value: 150,
    weight: 1.5,
    statBonus: '+22 Zırh',
    iconKey: 'helmet',
    civilianLegal: false,
    tier: 2,
    description: 'Miğferin altına giyilen zincir başlık; boyun ve omuzları kesiklerden korur.',
  },
  {
    id: 'mkt_nasal_helm',
    name: 'Burunluk Miğfer',
    category: 'ARMOR',
    slot: 'HEAD',
    value: 320,
    weight: 2.2,
    statBonus: '+38 Zırh',
    iconKey: 'helmet',
    civilianLegal: false,
    tier: 3,
    description: 'Yüzü açık bırakan, burnu demirle koruyan klasik savaşçı miğferi.',
  },
  {
    id: 'mkt_leather_gloves',
    name: 'Deri Eldiven',
    category: 'ARMOR',
    slot: 'GLOVES',
    value: 40,
    weight: 0.4,
    statBonus: '+5 Zırh',
    iconKey: 'gloves',
    civilianLegal: true,
    tier: 1,
    description: 'Yay çekerken parmakları koruyan, soğukta eli donduramayan basit eldiven.',
  },
  {
    id: 'mkt_iron_boots',
    name: 'Demir Kaplama Bot',
    category: 'ARMOR',
    slot: 'LEG',
    value: 120,
    weight: 1.9,
    statBonus: '+16 Zırh',
    iconKey: 'boots',
    civilianLegal: true,
    tier: 2,
    description: 'Ayak parmaklarını demirle kaplayan bot; çamura ve kılıç darbesine dayanır.',
  },
  {
    id: 'mkt_fur_cloak',
    name: 'Kürk Pelerin',
    category: 'ARMOR',
    slot: 'SHOULDER',
    value: 180,
    weight: 2.3,
    statBonus: '+12 Zırh · Soğuk Direnci',
    iconKey: 'fur',
    civilianLegal: true,
    tier: 2,
    description: 'Sturgiya kışında sırtı sıcak tutar; aynı zamanda omuza inen darbeyi yumuşatır.',
  },
  {
    id: 'mkt_desert_courser',
    name: 'Çöl Aygırı',
    category: 'HORSE',
    slot: 'MOUNT',
    value: 520,
    weight: 0,
    statBonus: 'Hız 62 · Çeviklik 58 · Dayanıklılık 44',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 3,
    description: 'Sıcakta susuz günlerce gidebilen ince bacaklı aygır; hız için dayanıklılıktan ödün verir.',
  },
  {
    id: 'mkt_sturgian_warhorse',
    name: 'Sturgiya Savaş Atı',
    category: 'HORSE',
    slot: 'MOUNT',
    value: 480,
    weight: 0,
    statBonus: 'Hız 46 · Çeviklik 38 · Dayanıklılık 66',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 3,
    description: 'Karda ve çamurda yürümeyi öğrenmiş ağır at; yavaş ama hücumda yıkıcı.',
  },
  {
    id: 'mkt_old_horse',
    name: 'Yaşlı Beygir',
    category: 'HORSE',
    slot: 'MOUNT',
    value: 90,
    weight: 0,
    statBonus: 'Hız 28 · Çeviklik 22 · Dayanıklılık 40',
    iconKey: 'horse',
    civilianLegal: true,
    tier: 1,
    description: 'Savaşa götürmeye utanacağın, yükü ise hâlâ taşıyan ucuz beygir.',
  },
  {
    id: 'mkt_salt_box',
    name: 'Tuz Sandığı',
    category: 'FOOD',
    slot: 'TRADE',
    value: 40,
    weight: 5,
    statBonus: 'Ticaret Emtiası',
    iconKey: 'salt',
    civilianLegal: true,
    tier: 1,
    description: 'Etin bozulmasını engelleyen tuz; her kervanın taşımak istediği ağır meta.',
  },
  {
    id: 'mkt_wool_bale',
    name: 'Yün Balyası',
    category: 'FOOD',
    slot: 'TRADE',
    value: 55,
    weight: 4,
    statBonus: 'Ticaret Emtiası',
    iconKey: 'wool',
    civilianLegal: true,
    tier: 1,
    description: 'Dağ köylerinden gelen sıkıştırılmış yün; dokumacı atölyelerinin ham maddesi.',
  },
  {
    id: 'mkt_wine_amphora',
    name: 'Şarap Amforası',
    category: 'FOOD',
    slot: 'TRADE',
    value: 90,
    weight: 6,
    statBonus: 'Ticaret Emtiası · Moral',
    iconKey: 'wine',
    civilianLegal: true,
    tier: 2,
    description: 'İmparatorluk bağlarından gelen kırmızı şarap; garnizonu da kervanı da sevindirir.',
  },
  {
    id: 'mkt_honey_jar',
    name: 'Bal Testisi',
    category: 'FOOD',
    slot: 'TRADE',
    value: 45,
    weight: 2,
    statBonus: 'Ticaret Emtiası',
    iconKey: 'honey',
    civilianLegal: true,
    tier: 1,
    description: 'Orman köylerinin balı; hem tatlandırıcı hem ilaç olarak satılır.',
  },
  {
    id: 'mkt_fur_bale',
    name: 'Kürk Balyası',
    category: 'FOOD',
    slot: 'TRADE',
    value: 130,
    weight: 3,
    statBonus: 'Ticaret Emtiası',
    iconKey: 'fur',
    civilianLegal: true,
    tier: 2,
    description: 'Kuzey avcılarının kürkleri; güneyde soyluların kışlık paltosuna dönüşür.',
  },
  {
    id: 'mkt_smith_tools',
    name: 'Demirci Aletleri',
    category: 'FOOD',
    slot: 'TRADE',
    value: 110,
    weight: 3,
    statBonus: 'Atölye Girdisi',
    iconKey: 'tools',
    civilianLegal: true,
    tier: 2,
    description: 'Örs, çekiç ve eğe takımı; köy demircisi olmadan atölye açılamaz.',
  },
  {
    id: 'mkt_pottery',
    name: 'Toprak Çömlek',
    category: 'FOOD',
    slot: 'TRADE',
    value: 25,
    weight: 2,
    statBonus: 'Ticaret Emtiası',
    iconKey: 'pottery',
    civilianLegal: true,
    tier: 1,
    description: 'Her köyde yapılan, her evde kırılan ucuz çömlek; hacmi büyük, kârı küçük.',
  },
  {
    id: 'mkt_dates',
    name: 'Aserai Hurması',
    category: 'FOOD',
    slot: 'TRADE',
    value: 35,
    weight: 2,
    statBonus: 'Ticaret Emtiası · +6 Erzak',
    iconKey: 'fruit',
    civilianLegal: true,
    tier: 1,
    description: 'Çöl vahalarının hurması; uzun yolda bozulmadığı için kervanların vazgeçilmezi.',
  },
  {
    id: 'mkt_cheese_round',
    name: 'Koyun Peyniri',
    category: 'FOOD',
    slot: 'TRADE',
    value: 30,
    weight: 2,
    statBonus: 'Ticaret Emtiası · +4 Erzak',
    iconKey: 'cheese',
    civilianLegal: true,
    tier: 1,
    description: 'Dağ yaylalarının sert peyniri; askerin tayınına tuz ve yağ katar.',
  },
  // Bannerlord'un 9 yiyecek türünü tamamlayan kalemler (10.4): tereyağı, üzüm, zeytin, bira.
  {
    id: 'mkt_butter',
    name: 'Yayık Tereyağı',
    category: 'FOOD',
    slot: 'TRADE',
    value: 30,
    weight: 2,
    statBonus: 'Ticaret Emtiası · +4 Erzak',
    iconKey: 'cheese',
    civilianLegal: true,
    tier: 1,
    description: 'Ekmeğe sürülen yayık tereyağı; tayına çeşit ve yağ katar.',
  },
  {
    id: 'mkt_grapes',
    name: 'Bağ Üzümü',
    category: 'FOOD',
    slot: 'TRADE',
    value: 22,
    weight: 2,
    statBonus: 'Ticaret Emtiası · +3 Erzak',
    iconKey: 'fruit',
    civilianLegal: true,
    tier: 1,
    description: 'Güney bağlarının üzümü; taze yenir, kurutulur, şaraba gider.',
  },
  {
    id: 'mkt_olives',
    name: 'Salamura Zeytin',
    category: 'FOOD',
    slot: 'TRADE',
    value: 26,
    weight: 2,
    statBonus: 'Ticaret Emtiası · +3 Erzak',
    iconKey: 'fruit',
    civilianLegal: true,
    tier: 1,
    description: 'İmparatorluk koruluklarının zeytini; yağından ayrı, meyvesi yiyecektir.',
  },
  {
    id: 'mkt_beer',
    name: 'Arpa Birası Fıçısı',
    category: 'FOOD',
    slot: 'TRADE',
    value: 40,
    weight: 4,
    statBonus: 'Ticaret Emtiası · +5 Erzak',
    iconKey: 'wine',
    civilianLegal: true,
    tier: 1,
    description: 'Ordugâhta fıçısı açılan bira; tayın çeşitliliğine içecek de girer.',
  },
];

export function buyMarketplaceItem(
  state: CampaignState,
  item: MarketplaceItem,
  settlementName = 'Pazaryeri',
): { success: boolean; reason?: string; nextState: CampaignState } {
  if (state.gold < item.value) {
    return {
      success: false,
      reason: `Yetersiz Dinar! Bu eşyayı satın almak için ${item.value} Dinar gerekiyor (Mevcut: ${state.gold} Dinar).`,
      nextState: state,
    };
  }

  // If it is pure food, immediately increase food and morale
  if (
    item.category === 'FOOD' &&
    (item.id === 'mkt_grain_sack' ||
      item.id === 'mkt_cured_meat' ||
      item.id === 'mkt_smoked_fish' ||
      item.id === 'mkt_cheese_wheel')
  ) {
    const foodGain = item.id === 'mkt_grain_sack' ? 10 : item.id === 'mkt_cured_meat' ? 12 : 8;
    const moraleGain = item.id === 'mkt_cured_meat' ? 4 : item.id === 'mkt_grain_sack' ? 1 : 2;
    return {
      success: true,
      nextState: {
        ...state,
        gold: state.gold - item.value,
        food: state.food + foodGain,
        morale: Math.min(100, state.morale + moraleGain),
        chronicle: [
          {
            id: `buy-food-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            day: state.day,
            category: 'ECONOMY',
            text: `${settlementName} pazarından "${item.name}" satın alındı (-${item.value} Dinar, +${foodGain} Erzak).`,
          },
          ...state.chronicle,
        ].slice(0, 30),
      },
    };
  }

  // P1: aynı katalog tanımı ikinci kez alınırsa yeni satır açılmaz; yığın adedi artar.
  const currentItems = state.inventoryItems ?? [];
  const existingStackIndex = currentItems.findIndex(
    (candidate) =>
      !candidate.locked &&
      (candidate.definitionId
        ? candidate.definitionId === item.id
        : candidate.id === item.id || candidate.id.startsWith(`${item.id}_`)),
  );
  const updatedItems =
    existingStackIndex >= 0
      ? currentItems.map((candidate, index) =>
          index === existingStackIndex
            ? {
                ...candidate,
                definitionId: item.id,
                quantity: Math.max(1, Math.floor(candidate.quantity ?? 1)) + 1,
                locked: false,
              }
            : candidate,
        )
      : [
          ...currentItems,
          {
            id: `${item.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            definitionId: item.id,
            name: item.name,
            slot: item.slot,
            category: item.category,
            quantity: 1,
            locked: false,
            value: Math.round(item.value * 0.75), // Resale value in player inventory is 75%
            weight: item.weight,
            statBonus: item.statBonus,
            civilianLegal: item.civilianLegal,
            icon: item.iconKey,
            tier: item.tier,
          } satisfies InventoryItem,
        ];

  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - item.value,
      inventoryItems: updatedItems,
      chronicle: [
        {
          id: `buy-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          day: state.day,
          category: 'ECONOMY',
          text: `${settlementName} pazarından "${item.name}" satın alındı (-${item.value} Dinar).`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function sellMarketplaceItem(
  state: CampaignState,
  itemId: string,
  settlementName = 'Pazaryeri',
): { success: boolean; reason?: string; goldGained: number; nextState: CampaignState } {
  const items = state.inventoryItems ?? [];
  const itemIndex = items.findIndex((i) => i.id === itemId);
  if (itemIndex === -1) {
    return {
      success: false,
      reason: 'Eşya envanterde bulunamadı.',
      goldGained: 0,
      nextState: state,
    };
  }

  const itemToSell = items[itemIndex];
  if (itemToSell.locked) {
    return {
      success: false,
      reason: 'Kilitli eşyalar satılamaz. Önce kilidini kaldır.',
      goldGained: 0,
      nextState: state,
    };
  }
  const goldGained = Math.max(5, itemToSell.value);
  const quantity = Math.max(1, Math.floor(itemToSell.quantity ?? 1));
  const remainingItems =
    quantity > 1
      ? items.map((item, idx) => (idx === itemIndex ? { ...item, quantity: quantity - 1 } : item))
      : items.filter((_, idx) => idx !== itemIndex);

  return {
    success: true,
    goldGained,
    nextState: {
      ...state,
      gold: state.gold + goldGained,
      inventoryItems: remainingItems,
      chronicle: [
        {
          id: `sell-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          day: state.day,
          category: 'ECONOMY',
          text: `${settlementName} pazarına "${itemToSell.name}" satıldı (+${goldGained} Dinar).`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function unequipEquipmentSlot(
  state: CampaignState,
  slot: EquipmentSlotId,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const currentEq = state.equipment;
  if (!currentEq) {
    return { success: false, reason: 'Ekipman verisi bulunamadı.', nextState: state };
  }
  const currentEquippedName = currentEq[slot];

  if (!currentEquippedName || currentEquippedName === 'Boş' || currentEquippedName === 'Yok') {
    return { success: false, reason: 'Bu slot zaten boş.', nextState: state };
  }

  const defaultUnarmedNames: Record<EquipmentSlotId, string> = {
    HEAD: 'Başlıksız (0 Zırh)',
    SHOULDER: 'Omuzluksuz',
    BODY: 'Sivil Keten Tunik (+5 Zırh)',
    GLOVES: 'Eldivensiz',
    LEG: 'Kaba Deri Çarık (+4 Zırh)',
    MOUNT: 'Bineksiz (Yaya)',
    HARNESS: 'Koşumsuz',
    BANNER: 'Sancaksız',
    WEAPON1: 'Silahsız (Yumruk)',
    WEAPON2: 'Boş Slot',
    WEAPON3: 'Boş Slot',
    WEAPON4: 'Boş Slot',
  };

  const playerHero = state.heroes?.find((hero) => hero.id === 'hero_player' || hero.kind === 'PLAYER');
  const activeSet = state.outfitMode === 'CIVILIAN' ? 'CIVILIAN' : 'BATTLE';
  const equippedDefinitionId = playerHero?.equipment[activeSet][slot] ?? null;
  const customDefinition = equippedDefinitionId
    ? state.customItemDefinitions?.find((definition) => definition.id === equippedDefinitionId)
    : undefined;
  const catalogDefinition = equippedDefinitionId
    ? CALRADIA_MARKETPLACE_ITEMS.find((definition) => definition.id === equippedDefinitionId)
    : undefined;

  const unequippedItem: InventoryItem = customDefinition
    ? {
        id: `stack_${customDefinition.id}`,
        definitionId: customDefinition.id,
        name: customDefinition.name,
        slot: customDefinition.slot,
        category: customDefinition.category,
        quantity: 1,
        locked: false,
        value: customDefinition.baseValue,
        weight: customDefinition.weight,
        statBonus: customDefinition.statBonus,
        stats: { ...customDefinition.stats },
        civilianLegal: customDefinition.civilianLegal,
        icon: customDefinition.icon,
        tier: customDefinition.tier,
      }
    : catalogDefinition
      ? {
          id: `stack_${catalogDefinition.id}`,
          definitionId: catalogDefinition.id,
          name: catalogDefinition.name,
          slot: catalogDefinition.slot,
          category: catalogDefinition.category,
          quantity: 1,
          locked: false,
          value: Math.round(catalogDefinition.value * 0.75),
          weight: catalogDefinition.weight,
          statBonus: catalogDefinition.statBonus,
          civilianLegal: catalogDefinition.civilianLegal,
          icon: catalogDefinition.iconKey,
          tier: catalogDefinition.tier,
        }
      : {
          id: `unequip_${slot}_${Date.now()}`,
          name: currentEquippedName.split(' (')[0],
          slot,
          quantity: 1,
          locked: false,
          value: 120,
          weight: slot === 'BODY' ? 8 : slot === 'HEAD' || slot === 'WEAPON1' ? 2 : 1,
          statBonus: currentEquippedName.includes('(')
            ? currentEquippedName.split('(')[1].replace(')', '')
            : 'Standart',
          civilianLegal: true,
        };

  const currentItems = state.inventoryItems ?? [];
  const existingStackIndex = unequippedItem.definitionId
    ? currentItems.findIndex(
        (item) => !item.locked && (item.definitionId ?? item.id) === unequippedItem.definitionId,
      )
    : -1;
  const nextItems =
    existingStackIndex >= 0
      ? currentItems.map((item, index) =>
          index === existingStackIndex
            ? { ...item, quantity: Math.max(1, Math.floor(item.quantity ?? 1)) + 1 }
            : item,
        )
      : [...currentItems, unequippedItem];
  const nextHeroes = playerHero
    ? state.heroes?.map((hero) =>
        hero.id === playerHero.id
          ? {
              ...hero,
              equipment: {
                ...hero.equipment,
                [activeSet]: {
                  ...hero.equipment[activeSet],
                  [slot]: null,
                },
              },
            }
          : hero,
      )
    : state.heroes;

  return {
    success: true,
    nextState: {
      ...state,
      equipment: {
        ...currentEq,
        [slot]: defaultUnarmedNames[slot],
      },
      heroes: nextHeroes,
      inventoryItems: nextItems,
    },
  };
}
