/**
 * mapDiplomacy.ts — Bannerlord Standartlarında Harita Diplomasi ve Renklendirme Sistemi.
 *
 * Bannerlord Kuralı:
 * - Oyuncu bağımsızken yerleşimler ve lordlar standart faksiyon renklerini korur.
 * - Oyuncu bir krallığa katıldığında (vasal, paralı asker veya hükümdar olarak):
 *   - Dost / Kendi Krallığı: Yeşil (#22c55e / 0x22c55e)
 *   - Savaşta Olunan Düşman Krallıklar / Haydutlar: Kırmızı (#ef4444 / 0xef4444)
 *   - Barışta / Tarafsız Krallıklar: Standart / Nötr (#9ca3af / faksiyon rengi)
 */

import { CampaignState, FACTION_INFO, FactionId, LordAgent, Settlement } from './rules.ts';
import { isHostileToPlayer } from './encounter.ts';

export type DiplomacyStance = 'FRIENDLY' | 'HOSTILE' | 'NEUTRAL';

export interface DiplomacyVisualTheme {
  stance: DiplomacyStance;
  /** 3B Bayrak / Piyon için Hex Renk (Three.js) */
  hexColor: number;
  /** 2B HTML İsimlik / Rozet Kalkan Rengi */
  shieldBgColor: string;
  /** 2B Kalkan Çerçevesi */
  shieldBorderColor: string;
  /** 2B İsimlik Kutu Kenarlık Sınıfı */
  containerBorderClass: string;
  /** 2B İsimlik Kutu Arka Plan Stili */
  containerBgStyle: string;
  /** 2B İsim Metin Sınıfı */
  nameTextClass: string;
  /** 2B Asker / Garnizon Sayı Metin Sınıfı */
  badgeTextClass: string;
}

/**
 * Bir yerleşimin oyuncuya göre diplomasi duruşunu hesaplar.
 */
export function getSettlementDiplomacyStance(
  settlement: Settlement,
  campaign?: CampaignState | null,
): DiplomacyStance {
  if (!campaign) return 'NEUTRAL';

  // Oyuncunun kendi kurduğu/aldığı yerleşim
  if (settlement.faction === 'player') return 'FRIENDLY';

  const playerFaction = campaign.playerFaction;
  if (playerFaction && playerFaction !== 'player' && playerFaction !== 'bandits') {
    // Hizmet edilen krallığın şehri
    if (settlement.faction === playerFaction) {
      return 'FRIENDLY';
    }

    const role = campaign.allegianceRole ?? 'MERCENARY';
    if (role === 'MERCENARY' || role === 'VASSAL' || role === 'RULER') {
      const activeWars = campaign.world?.wars ?? [];
      const isAtWar = activeWars.some(
        (w) =>
          (w.a === playerFaction && w.b === settlement.faction) ||
          (w.b === playerFaction && w.a === settlement.faction),
      );
      if (isAtWar) return 'HOSTILE';
    }
  }

  // Oyuncu bağımsızken o krallığın lordlarıyla şahsi savaşta mı?
  const isPersonalWar = (campaign.lords ?? []).some(
    (l) => l.faction === settlement.faction && l.isAtWarWithPlayer,
  );
  if (isPersonalWar) return 'HOSTILE';

  return 'NEUTRAL';
}

/**
 * Bir lordun oyuncuya göre diplomasi duruşunu hesaplar.
 */
export function getLordDiplomacyStance(
  lord: LordAgent,
  campaign?: CampaignState | null,
): DiplomacyStance {
  if (isHostileToPlayer(lord, campaign ?? undefined)) {
    return 'HOSTILE';
  }
  if (!campaign) return 'NEUTRAL';
  if (lord.faction === 'player' || lord.isAlliedWithPlayer) {
    return 'FRIENDLY';
  }
  const playerFaction = campaign.playerFaction;
  if (playerFaction && playerFaction !== 'player' && lord.faction === playerFaction) {
    return 'FRIENDLY';
  }
  return 'NEUTRAL';
}

/**
 * Diplomasi duruşuna göre Bannerlord renk temasını döndürür.
 */
export function getDiplomacyVisualTheme(
  stance: DiplomacyStance,
  defaultFaction: FactionId = 'empire',
): DiplomacyVisualTheme {
  const fac = FACTION_INFO[defaultFaction] ?? FACTION_INFO.empire;

  if (stance === 'HOSTILE') {
    return {
      stance: 'HOSTILE',
      hexColor: 0xef4444, // Düşman Kırmızısı
      shieldBgColor: '#b91c1c',
      shieldBorderColor: '#f87171',
      containerBorderClass: 'border-red-600/90 group-hover:border-red-400',
      containerBgStyle:
        'linear-gradient(90deg, rgba(38, 12, 12, 0.94) 0%, rgba(55, 15, 15, 0.88) 84%, rgba(45, 12, 12, 0.35) 100%)',
      nameTextClass: 'text-[#fecaca]',
      badgeTextClass: 'text-[#f87171]',
    };
  }

  if (stance === 'FRIENDLY') {
    return {
      stance: 'FRIENDLY',
      hexColor: 0x22c55e, // Dost / Krallık Yeşili
      shieldBgColor: '#047857',
      shieldBorderColor: '#34d399',
      containerBorderClass: 'border-emerald-600/90 group-hover:border-emerald-400',
      containerBgStyle:
        'linear-gradient(90deg, rgba(8, 30, 20, 0.94) 0%, rgba(12, 42, 28, 0.88) 84%, rgba(10, 35, 24, 0.35) 100%)',
      nameTextClass: 'text-[#a7f3d0]',
      badgeTextClass: 'text-[#86efac]',
    };
  }

  // Nötr / Standart Faksiyon Teması
  return {
    stance: 'NEUTRAL',
    hexColor: fac.hex,
    shieldBgColor: fac.color,
    shieldBorderColor: '#d4af37',
    containerBorderClass: 'border-[#c6a15b]/45 group-hover:border-[#e6c885]/80',
    containerBgStyle:
      'linear-gradient(90deg, rgba(20, 17, 13, 0.92) 0%, rgba(30, 26, 20, 0.82) 84%, rgba(30, 26, 20, 0.32) 100%)',
    nameTextClass: 'text-[#f5ead4]',
    badgeTextClass: 'text-[#c6a15b]',
  };
}
