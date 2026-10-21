import type { CampaignState, EquipmentSlotId, InventoryItem } from './rules.ts';

export type MarketCategory = 'ALL' | 'WEAPON' | 'SHIELD' | 'ARMOR' | 'FOOD' | 'HORSE';

export interface MarketplaceItem {
  id: string;
  name: string;
  category: 'WEAPON' | 'SHIELD' | 'ARMOR' | 'FOOD' | 'HORSE';
  slot: EquipmentSlotId | 'TRADE';
  value: number;
  weight: number;
  statBonus: string;
  icon: string;
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
    icon: '🗡️',
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
    icon: '⚔️',
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
    icon: '🪓',
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
    icon: '🔱',
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
    icon: '🏹',
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
    icon: '🎯',
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
    icon: '🛡️',
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
    icon: '🛡️',
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
    icon: '🛡️',
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
    icon: '🪖',
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
    icon: '🪖',
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
    icon: '🥋',
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
    icon: '🥋',
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
    icon: '🦺',
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
    icon: '🧣',
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
    icon: '🧤',
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
    icon: '👢',
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
    icon: '🐎',
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
    icon: '🐎',
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
    icon: '🐎',
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
    icon: '🫏',
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
    icon: '🛡️',
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
    icon: '🌾',
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
    icon: '🥩',
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
    icon: '🐟',
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
    icon: '🧀',
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
    icon: '🫒',
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
    icon: '⛏️',
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
    icon: '🧵',
    civilianLegal: true,
    tier: 5,
    description: 'Kuzait ve Aserai kervanlarıyla taşınan soyluların aradığı kıymetli kumaş.',
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

  // Create InventoryItem to add to player's inventoryItems
  const newItem: InventoryItem = {
    id: `${item.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: item.name,
    slot: item.slot,
    category: item.category,
    value: Math.round(item.value * 0.75), // Resale value in player inventory is 75%
    weight: item.weight,
    statBonus: item.statBonus,
    civilianLegal: item.civilianLegal,
    icon: item.icon,
    tier: item.tier,
  };

  const updatedItems = [...(state.inventoryItems ?? []), newItem];

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
  const goldGained = Math.max(5, itemToSell.value);
  const remainingItems = items.filter((_, idx) => idx !== itemIndex);

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

  const unequippedItem: InventoryItem = {
    id: `unequip_${slot}_${Date.now()}`,
    name: currentEquippedName.split(' (')[0],
    slot: slot,
    value: 120,
    weight: slot === 'BODY' ? 8 : slot === 'HEAD' || slot === 'WEAPON1' ? 2 : 1,
    statBonus: currentEquippedName.includes('(')
      ? currentEquippedName.split('(')[1].replace(')', '')
      : 'Standart',
    civilianLegal: true,
  };

  const nextItems = [...(state.inventoryItems ?? []), unequippedItem];

  return {
    success: true,
    nextState: {
      ...state,
      equipment: {
        ...currentEq,
        [slot]: defaultUnarmedNames[slot],
      },
      inventoryItems: nextItems,
    },
  };
}
