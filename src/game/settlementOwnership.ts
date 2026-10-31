import { FactionId, FACTION_INFO, Settlement, CampaignState } from './rules';
import { KingdomMacroState } from './kingdomSystem';

export interface SettlementOwnerDetails {
  heroId: string;
  heroName: string;
  heroTitle?: string;
  clanId: string;
  clanName: string;
  clanBannerColor: string;
  factionId: FactionId;
  factionName: string;
  factionBannerColor: string;
  boundParentId?: string;
  boundParentName?: string;
  isPlayer: boolean;
  // Aliases for convenience across all UI components
  ownerClanId: string;
  ownerClanName: string;
  ownerHeroId: string;
  ownerHeroName: string;
  isPlayerOwned: boolean;
}

// Canonical Faction Rulers and Ruling Clans for settlements that don't have an explicit hero assigned
const CANONICAL_FACTION_LEADERS: Record<
  FactionId,
  {
    heroId: string;
    heroName: string;
    heroTitle: string;
    clanId: string;
    clanName: string;
    clanBannerColor: string;
  }
> = {
  empire: {
    heroId: 'lord-rhagaea',
    heroName: 'İmparatoriçe Rhagaea',
    heroTitle: 'İmparatoriçe',
    clanId: 'clan-pethros',
    clanName: 'Pethros Hanedanı',
    clanBannerColor: '#831843',
  },
  vlandia: {
    heroId: 'lord-derthert',
    heroName: 'Kral Derthert',
    heroTitle: 'Kral',
    clanId: 'clan-dey-meroc',
    clanName: 'dey Meroc Hanedanı',
    clanBannerColor: '#991b1b',
  },
  battania: {
    heroId: 'lord-caladog',
    heroName: 'Yüksek Kral Caladog',
    heroTitle: 'Yüksek Kral',
    clanId: 'clan-fen-gruffendoc',
    clanName: 'fen Gruffendoc',
    clanBannerColor: '#166534',
  },
  sturgia: {
    heroId: 'lord-raganvad',
    heroName: 'Prens Raganvad',
    heroTitle: 'Prens',
    clanId: 'clan-gundaroving',
    clanName: 'Gundaroving Hanedanı',
    clanBannerColor: '#1e40af',
  },
  khuzait: {
    heroId: 'lord-monchug',
    heroName: 'Monchug Han',
    heroTitle: 'Kağan',
    clanId: 'clan-khergit',
    clanName: 'Urkhunait Boyu',
    clanBannerColor: '#0369a1',
  },
  aserai: {
    heroId: 'lord-unqid',
    heroName: 'Sultan Unqid',
    heroTitle: 'Sultan',
    clanId: 'clan-banu-hulyan',
    clanName: 'Banu Hulyan',
    clanBannerColor: '#b45309',
  },
  bandits: {
    heroId: 'lord-radagos',
    heroName: 'Asi Savaş Ağası Radagos',
    heroTitle: 'Savaş Ağası',
    clanId: 'clan-mountain-bandits',
    clanName: 'Dağ Haydutları İttifakı',
    clanBannerColor: '#475569',
  },
  player: {
    heroId: 'hero-player',
    heroName: 'Oyuncu',
    heroTitle: 'Komutan',
    clanId: 'clan-player',
    clanName: 'Oyuncu Hanedanı',
    clanBannerColor: '#c6a15b',
  },
};

// Canonical town/castle specific owners in initial Kalradya world state
const CANONICAL_SETTLEMENT_OWNERS: Record<
  string,
  {
    heroId: string;
    heroName: string;
    heroTitle?: string;
    clanId: string;
    clanName: string;
    clanBannerColor: string;
  }
> = {
  // Empire Towns & Castles
  zeonica: {
    heroId: 'lord-rhagaea',
    heroName: 'İmparatoriçe Rhagaea',
    heroTitle: 'İmparatoriçe',
    clanId: 'clan-pethros',
    clanName: 'Pethros Hanedanı',
    clanBannerColor: '#831843',
  },
  poros: {
    heroId: 'lord-lucon',
    heroName: 'Senatör Lucon',
    heroTitle: 'Senatör',
    clanId: 'clan-neretzes',
    clanName: 'Neretzes Hanedanı',
    clanBannerColor: '#9d174d',
  },
  danustica: {
    heroId: 'lord-rhagaea',
    heroName: 'İmparatoriçe Rhagaea',
    heroTitle: 'İmparatoriçe',
    clanId: 'clan-pethros',
    clanName: 'Pethros Hanedanı',
    clanBannerColor: '#831843',
  },
  // Vlandia Towns & Castles
  pravend: {
    heroId: 'lord-derthert',
    heroName: 'Kral Derthert',
    heroTitle: 'Kral',
    clanId: 'clan-dey-meroc',
    clanName: 'dey Meroc Hanedanı',
    clanBannerColor: '#991b1b',
  },
  galend: {
    heroId: 'lord-erdurand',
    heroName: 'Baron Erdurand',
    heroTitle: 'Baron',
    clanId: 'clan-dey-meroc',
    clanName: 'dey Meroc Hanedanı',
    clanBannerColor: '#b91c1c',
  },
  veron_castle: {
    heroId: 'lord-erdurand',
    heroName: 'Baron Erdurand',
    heroTitle: 'Baron',
    clanId: 'clan-dey-meroc',
    clanName: 'dey Meroc Hanedanı',
    clanBannerColor: '#b91c1c',
  },
  hertogea_castle: {
    heroId: 'lord-derthert',
    heroName: 'Kral Derthert',
    heroTitle: 'Kral',
    clanId: 'clan-dey-meroc',
    clanName: 'dey Meroc Hanedanı',
    clanBannerColor: '#991b1b',
  },
  // Battania Towns & Castles
  dunglanys: {
    heroId: 'lord-caladog',
    heroName: 'Yüksek Kral Caladog',
    heroTitle: 'Yüksek Kral',
    clanId: 'clan-fen-gruffendoc',
    clanName: 'fen Gruffendoc',
    clanBannerColor: '#166534',
  },
  marunath: {
    heroId: 'lord-caladog',
    heroName: 'Yüksek Kral Caladog',
    heroTitle: 'Yüksek Kral',
    clanId: 'clan-fen-gruffendoc',
    clanName: 'fen Gruffendoc',
    clanBannerColor: '#166534',
  },
  // Sturgia Towns & Castles
  revyl: {
    heroId: 'lord-olek',
    heroName: 'Boyar Olek',
    heroTitle: 'Boyar',
    clanId: 'clan-gundaroving',
    clanName: 'Gundaroving Hanedanı',
    clanBannerColor: '#1e40af',
  },
  balgard: {
    heroId: 'lord-raganvad',
    heroName: 'Prens Raganvad',
    heroTitle: 'Prens',
    clanId: 'clan-gundaroving',
    clanName: 'Gundaroving Hanedanı',
    clanBannerColor: '#1e40af',
  },
  tyal: {
    heroId: 'lord-raganvad',
    heroName: 'Prens Raganvad',
    heroTitle: 'Prens',
    clanId: 'clan-gundaroving',
    clanName: 'Gundaroving Hanedanı',
    clanBannerColor: '#1e40af',
  },
  // Khuzait Towns & Castles
  makeb: {
    heroId: 'lord-monchug',
    heroName: 'Monchug Han',
    heroTitle: 'Kağan',
    clanId: 'clan-khergit',
    clanName: 'Urkhunait Boyu',
    clanBannerColor: '#0369a1',
  },
  chaikand: {
    heroId: 'lord-monchug',
    heroName: 'Monchug Han',
    heroTitle: 'Kağan',
    clanId: 'clan-khergit',
    clanName: 'Urkhunait Boyu',
    clanBannerColor: '#0369a1',
  },
  // Aserai Towns & Castles
  sanala: {
    heroId: 'lord-unqid',
    heroName: 'Sultan Unqid',
    heroTitle: 'Sultan',
    clanId: 'clan-banu-hulyan',
    clanName: 'Banu Hulyan',
    clanBannerColor: '#b45309',
  },
  quyaz: {
    heroId: 'lord-unqid',
    heroName: 'Sultan Unqid',
    heroTitle: 'Sultan',
    clanId: 'clan-banu-hulyan',
    clanName: 'Banu Hulyan',
    clanBannerColor: '#b45309',
  },
  // Bandits
  karagecit: {
    heroId: 'lord-radagos',
    heroName: 'Asi Savaş Ağası Radagos',
    heroTitle: 'Savaş Ağası',
    clanId: 'clan-mountain-bandits',
    clanName: 'Dağ Haydutları İttifakı',
    clanBannerColor: '#475569',
  },
};

/**
 * Bannerlord kuralına göre herhangi bir yerleşimin (Şehir, Kale, Köy) gerçek sahibini ve yönetici klanını döndürür.
 * 
 * BANNERLORD KURALI:
 * 1. Şehir ve kalelerin doğrudan bir sahibi (Lord/Leydi) ve yönetici klanı (Ruling Clan) vardır.
 * 2. Köyler tek başına verilip alınamaz; her köy bağlı olduğu şehrin veya kalenin sahibine aittir.
 * 3. Oyuncu bir şehri fethettiğinde o şehir ve ona bağlı köyler oyuncunun klanına geçer.
 */
export function getSettlementOwnerDetails(
  settlement: Settlement,
  campaign?: Partial<CampaignState>,
  macroState?: KingdomMacroState,
): SettlementOwnerDetails {
  const settlements = campaign?.settlements ?? [];
  const lords = campaign?.lords ?? [];
  const playerName = campaign?.playerName ?? 'Oyuncu';

  // KURAL 4: Köy ise bağlı olduğu şehir veya kalenin sahibini bul
  if (settlement.type === 'VILLAGE') {
    const parent = settlements.find((s) => s.id === settlement.boundSettlementId);
    if (parent && parent.id !== settlement.id) {
      const parentOwner = getSettlementOwnerDetails(parent, campaign, macroState);
      return {
        ...parentOwner,
        boundParentId: parent.id,
        boundParentName: parent.name,
      };
    }
  }

  // Oyuncunun sahip olduğu yerleşim
  if (settlement.faction === 'player') {
    const playerClanName = `${playerName} Hanedanı`;
    return {
      heroId: 'hero-player',
      heroName: playerName,
      heroTitle: 'Komutan',
      clanId: 'clan-player',
      clanName: playerClanName,
      clanBannerColor: '#c6a15b',
      factionId: 'player',
      factionName: 'Bağımsız Oyuncu Klanı',
      factionBannerColor: '#c6a15b',
      isPlayer: true,
      ownerClanId: 'clan-player',
      ownerClanName: playerClanName,
      ownerHeroId: 'hero-player',
      ownerHeroName: playerName,
      isPlayerOwned: true,
    };
  }

  // Yerleşime açıkça bir lord veya klan atanmışsa
  if (settlement.ownerHeroId && settlement.ownerClanId) {
    const lord = lords.find((l) => l.id === settlement.ownerHeroId);
    const clan = macroState?.clans.find((c) => c.id === settlement.ownerClanId);
    const fac = FACTION_INFO[settlement.faction] || FACTION_INFO.empire;
    const heroName = settlement.ownerHeroName || lord?.name || 'Kalradya Derebeyi';
    const clanName = settlement.ownerClanName || clan?.name || 'Soylular Hanedanı';
    return {
      heroId: settlement.ownerHeroId,
      heroName,
      heroTitle: lord?.title,
      clanId: settlement.ownerClanId,
      clanName,
      clanBannerColor: lord?.bannerColor || fac.color,
      factionId: settlement.faction,
      factionName: fac.name,
      factionBannerColor: fac.color,
      isPlayer: false,
      ownerClanId: settlement.ownerClanId,
      ownerClanName: clanName,
      ownerHeroId: settlement.ownerHeroId,
      ownerHeroName: heroName,
      isPlayerOwned: false,
    };
  }

  // Makro durumda bu tımara sahip olan klan kontrolü
  if (macroState?.clans) {
    const owningClan = macroState.clans.find((c) => c.fiefIds.includes(settlement.id));
    if (owningClan) {
      const fac = FACTION_INFO[owningClan.faction] || FACTION_INFO.empire;
      return {
        heroId: owningClan.succession.leaderId,
        heroName: owningClan.succession.leaderName,
        heroTitle: 'Derebeyi',
        clanId: owningClan.id,
        clanName: owningClan.name,
        clanBannerColor: fac.color,
        factionId: owningClan.faction,
        factionName: fac.name,
        factionBannerColor: fac.color,
        isPlayer: owningClan.isPlayerClan,
        ownerClanId: owningClan.id,
        ownerClanName: owningClan.name,
        ownerHeroId: owningClan.succession.leaderId,
        ownerHeroName: owningClan.succession.leaderName,
        isPlayerOwned: owningClan.isPlayerClan,
      };
    }
  }

  // Yerleşime özgü kanonik kayıt
  const canonical = CANONICAL_SETTLEMENT_OWNERS[settlement.id];
  if (canonical) {
    const fac = FACTION_INFO[settlement.faction] || FACTION_INFO.empire;
    return {
      heroId: canonical.heroId,
      heroName: canonical.heroName,
      heroTitle: canonical.heroTitle,
      clanId: canonical.clanId,
      clanName: canonical.clanName,
      clanBannerColor: canonical.clanBannerColor,
      factionId: settlement.faction,
      factionName: fac.name,
      factionBannerColor: fac.color,
      isPlayer: false,
      ownerClanId: canonical.clanId,
      ownerClanName: canonical.clanName,
      ownerHeroId: canonical.heroId,
      ownerHeroName: canonical.heroName,
      isPlayerOwned: false,
    };
  }

  // Krallık liderine devret (Bannerlord'da sahipsiz mülkler kralın şahsına aittir)
  const defaultLeader = CANONICAL_FACTION_LEADERS[settlement.faction] || CANONICAL_FACTION_LEADERS.empire;
  const fac = FACTION_INFO[settlement.faction] || FACTION_INFO.empire;
  return {
    heroId: defaultLeader.heroId,
    heroName: defaultLeader.heroName,
    heroTitle: defaultLeader.heroTitle,
    clanId: defaultLeader.clanId,
    clanName: defaultLeader.clanName,
    clanBannerColor: defaultLeader.clanBannerColor,
    factionId: settlement.faction,
    factionName: fac.name,
    factionBannerColor: fac.color,
    isPlayer: false,
    ownerClanId: defaultLeader.clanId,
    ownerClanName: defaultLeader.clanName,
    ownerHeroId: defaultLeader.heroId,
    ownerHeroName: defaultLeader.heroName,
    isPlayerOwned: false,
  };
}
