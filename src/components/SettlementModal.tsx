import React, { useState } from 'react';
import { FactionCrest } from './FactionCrest';
import {
  AlertTriangle,
  Beer,
  Castle,
  Coins,
  Construction,
  Crown,
  Hammer,
  Landmark,
  Lock,
  Scale,
  Shield,
  Swords,
  Target,
  Tent,
  Truck,
  Wheat,
} from 'lucide-react';
import {
  BuildingProjectId,
  CampaignState,
  FACTION_INFO,
  Settlement,
  SettlementDailyDefault,
  SiegeEngineType,
  UNIT_DEFINITIONS,
  UnitTierId,
  WorkshopTypeId,
} from '../game/rules';
import { recruitQuote, partyLimit, partySize, partyRoom } from '../game/recruitment';
import { sound } from '../game/sound';
import { generateNotables, type NotableIconKey, type SettlementNotable } from '../game/notables';
import { troopName, troopRole } from '../game/troops';

export type TownTab =
  | 'overview'
  | 'keep'
  | 'market'
  | 'tavern'
  | 'arena'
  | 'smithy'
  | 'buildings'
  | 'siege'
  | 'recruit'
  | 'wait'
  | 'garrison'
  | 'dungeon'
  | 'hostile';

export type { NotableIconKey, SettlementNotable };

/**
 * İleri gelen konuşma kartı. Ayrı bileşen çünkü hem yerleşim modalında hem
 * probe'da (seçim olmadan) doğrudan render edilebilsin.
 */
export function NotableSpeechCard({
  notable,
  onClose,
}: {
  notable: SettlementNotable;
  onClose?: () => void;
}) {
  const relationLabel =
    notable.relation > 0 ? `+${notable.relation}` : String(notable.relation);
  return (
    <div
      data-testid="notable-speech"
      className="px-4 py-3 bg-[#1d1811] border-b border-[#d97706]/40 flex items-start justify-between gap-3 text-xs"
    >
      <div className="flex items-start gap-2.5">
        <span className="text-[#c6a15b] mt-0.5">{NOTABLE_ICONS[notable.avatarIcon]}</span>
        <div>
          <span className="font-bold text-[#fde68a] block">
            {notable.name} ({notable.title})
          </span>
          <p className="text-[#e2d7c3] italic mt-0.5">"{notable.speech}"</p>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-[#c6a15b] font-mono-tabular">
            <span>NÜFUZ {notable.power}</span>
            <span>İLİŞKİ {relationLabel}</span>
          </div>
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="İleri geleni kapat"
          className="text-[#9ca3af] hover:text-white font-bold px-1 text-base leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}

const NOTABLE_ICONS: Record<NotableIconKey, React.ReactNode>= {
  crown: <Crown size={16} strokeWidth={1.6} />,
  landmark: <Landmark size={16} strokeWidth={1.6} />,
  shield: <Shield size={16} strokeWidth={1.6} />,
  coins: <Coins size={16} strokeWidth={1.6} />,
  beer: <Beer size={16} strokeWidth={1.6} />,
  swords: <Swords size={16} strokeWidth={1.6} />,
  castle: <Castle size={16} strokeWidth={1.6} />,
  lock: <Lock size={16} strokeWidth={1.6} />,
  wheat: <Wheat size={16} strokeWidth={1.6} />,
  hammer: <Hammer size={16} strokeWidth={1.6} />,
  cart: <Truck size={16} strokeWidth={1.6} />,
};

interface SettlementModalProps {
  settlement: Settlement;
  campaign: CampaignState;
  onClose: () =>void;
  onRecruit: (settlementId: string, unitId: UnitTierId, amount: number) =>string | null;
  onBuyFood: (settlementId: string, packs: number) =>string | null;
  onStartSiegeBattle: (settlement: Settlement) =>void;
  onHireMercenaries?: (settlementId: string) =>string | null;
  onRansomPrisoners?: (settlementId: string) =>string | null;
  onBuyTavernRound?: (settlementId: string) =>string | null;
  onArenaPractice?: (settlementId: string) =>string | null;
  onArenaTournament?: (settlementId: string) =>{ victory: boolean; message: string };
  onSellLoot?: (settlementId: string) =>string | null;
  onManageGarrison?: (
    settlementId: string,
    unitId: UnitTierId,
    direction: 'deposit'| 'withdraw',
    amount: number,
  ) =>string | null;
  onRestAndRecover?: (settlementId: string) =>string | null;
  onRaidVillage?: (villageId: string) =>string | null;
  onForceSupplies?: (villageId: string) =>string | null;
  onForceRecruits?: (villageId: string) =>string | null;
  onUpgradeBuilding?: (settlementId: string, buildingId: BuildingProjectId) =>string | null;
  onSetDailyDefault?: (settlementId: string, defaultType: SettlementDailyDefault) =>string | null;
  onBuyWorkshop?: (settlementId: string, workshopType: WorkshopTypeId) =>string | null;
  onForgeWeapon?: (settlementId: string, blueprintId: 'SPATHA'| 'FALX'| 'LANCE') =>string | null;
  onBuildSiegeEngine?: (
    settlementId: string,
    engineType: SiegeEngineType,
    moveToReserve?: boolean,
  ) =>string | null;
  onDeployReserveEngines?: (settlementId: string) =>string | null;
  onBombardWalls?: (settlementId: string) =>string | null;
  onOpenFullMarket?: () =>void;
  /** Faz 6: yerleşim reisi/muhtarı ile diyalog. */
  onTalkToReeve?: () =>void;
  onOpenCharacterArena?: () =>void;
  /** Başlangıç sekmesi (probe'lar ve hızlı erişim için). */
  initialTab?: TownTab;
}

export const SettlementModal: React.FC<SettlementModalProps>= ({
  settlement,
  campaign,
  onClose,
  onRecruit,
  onBuyFood,
  onStartSiegeBattle,
  onHireMercenaries,
  onRansomPrisoners,
  onBuyTavernRound,
  onArenaPractice,
  onArenaTournament,
  onSellLoot,
  onManageGarrison,
  onRestAndRecover,
  onRaidVillage,
  onForceSupplies,
  onForceRecruits,
  onUpgradeBuilding,
  onSetDailyDefault,
  onBuyWorkshop,
  onForgeWeapon,
  onBuildSiegeEngine,
  onDeployReserveEngines,
  onBombardWalls,
  onOpenFullMarket,
  onTalkToReeve,
  onOpenCharacterArena,
  initialTab = 'overview',
}) =>{
  const [activeTab, setActiveTab] = useState<TownTab>(initialTab);
  /** Faz 8: muhtarla ilişki — asker toplama kapısı ve ücret indirimi. */
  const factionRelation = (() =>{
    const lords = campaign.lords.filter((l) =>l.faction === settlement.faction);
    if (lords.length === 0) return 0;
    return Math.round(lords.reduce((a, l) =>a + l.relation, 0) / lords.length);
  })();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedNotable, setSelectedNotable] = useState<SettlementNotable | null>(null);
  const [tournamentResult, setTournamentResult] = useState<{
    victory: boolean;
    title: string;
    details: string;
  } | null>(null);

  const factionInfo = FACTION_INFO[settlement.faction];
  const isPlayerOwned = settlement.faction === 'player';
  const isVillage = settlement.type === 'VILLAGE';
  const isCastle = settlement.type === 'CASTLE';
  const isTown = settlement.type === 'TOWN';

  // Faz B0: ileri gelenler artık sefer verisinde (her yerleşime özgü, deterministik).
  const notables: SettlementNotable[] = React.useMemo(
    () =>
      settlement.notables && settlement.notables.length > 0
        ? settlement.notables
        : generateNotables(settlement, campaign.world?.seed ?? 20261021),
    [settlement, campaign.world?.seed],
  );

  // Tab Action Handlers
  const handleRecruitClick = (unitId: UnitTierId, amount = 1) =>{
    const err = onRecruit(settlement.id, unitId, amount);
    if (err) {
      setFeedback(err);
    } else {
      sound.playCoinChime();
      setFeedback(
        `${amount} × ${UNIT_DEFINITIONS[unitId].name} sancağınıza katıldı!`,
      );
    }
  };

  const handleFoodClick = () =>{
    const isRural = settlement.type === 'VILLAGE';
    const err = onBuyFood(settlement.id, 5);
    if (err) {
      setFeedback(err);
    } else {
      sound.playCoinChime();
      setFeedback(
        isRural
          ? 'Köy ambarından toptan ucuz fiyata +5 Erzak sandığı ordunuza eklendi (18 Dinar).'
          : 'Şehir pazarından +5 Erzak sandığı tedarik edildi (30 Dinar).',
      );
    }
  };

  const handleSellLootClick = () =>{
    if (onSellLoot) {
      const err = onSellLoot(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playCoinChime();
        setFeedback('Sefer ganimetleri ve fazlalıklar tüccara satıldı (+45 Dinar).');
      }
    }
  };

  const handleHireMercenaries = () =>{
    if (onHireMercenaries) {
      const err = onHireMercenaries(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playCoinChime();
        setFeedback('4 kıdemli paralı süvari ve usta okçu sancağınıza katıldı (120 Dinar).');
      }
    }
  };

  const handleRansom = () =>{
    if (onRansomPrisoners) {
      const err = onRansomPrisoners(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playCoinChime();
        setFeedback('Ordunuzdaki tüm esirler fidyeciye teslim edildi ve dinarınız ödendi.');
      }
    }
  };

  const handleTavernRound = () =>{
    if (onBuyTavernRound) {
      const err = onBuyTavernRound(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playCoinChime();
        setFeedback('Meyhanedeki herkese şarap ısmarladınız! Askerlerinizin morali coştu (+8 Moral).');
      }
    }
  };

  const handleArenaPractice = () =>{
    if (onArenaPractice) {
      const err = onArenaPractice(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playSwordSwing();
        setFeedback('Talim dövüşünde gladyatörleri mağlup ettiniz (+25 Dinar, +2 Nam).');
      }
    }
  };

  const handleArenaTournament = () =>{
    if (onArenaTournament) {
      sound.playWarhorn();
      const res = onArenaTournament(settlement.id);
      if (res.victory) {
        setTournamentResult({
          victory: true,
          title: 'TURNUVA ŞAMPİYONU OLDUNUZ!',
          details: res.message,
        });
      } else {
        setTournamentResult({
          victory: false,
          title: 'Yarı Finalde Elendiniz',
          details: res.message,
        });
      }
    }
  };

  const handleRestRecover = () =>{
    if (onRestAndRecover) {
      const err = onRestAndRecover(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        setFeedback('Ordugah kuruldu, yaralılar tedavi edildi ve dinlenildi (+6 Moral, Sağlık Tazelendi).');
      }
    }
  };

  const handleGarrisonTransfer = (unitId: UnitTierId, dir: 'deposit'| 'withdraw') =>{
    if (onManageGarrison) {
      const err = onManageGarrison(settlement.id, unitId, dir, 1);
      if (err) {
        setFeedback(err);
      } else {
        sound.playCoinChime();
        setFeedback(
          dir === 'deposit'
            ? `1 ${UNIT_DEFINITIONS[unitId].name} kale garnizonuna nöbetçi bırakıldı.`
            : `1 ${UNIT_DEFINITIONS[unitId].name} garnizondan sancağınıza devşirildi.`,
        );
      }
    }
  };

  const handleRaid = () =>{
    if (onRaidVillage) {
      sound.playWarhorn();
      const err = onRaidVillage(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        setFeedback('KÖY YAĞMALANDI VE ATEŞE VERİLDİ! (+280 Dinar, +16 Erzak). Krallıkla savaş ilan edildi!');
      }
    }
  };

  const handleForceSupplies = () =>{
    if (onForceSupplies) {
      sound.playSwordSwing();
      const err = onForceSupplies(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        setFeedback('Köylüler kılıç zoruyla erzak teslim etti (+8 Erzak).');
      }
    }
  };

  const handleForceRecruits = () =>{
    if (onForceRecruits) {
      sound.playSwordSwing();
      const err = onForceRecruits(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        setFeedback('Köyün gençleri zorla orduya katıldı (+3 Köylü Asker).');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 pointer-events-auto select-none"
      style={{ backgroundColor: 'rgba(6, 5, 4, 0.84)'}}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-modal-title"
    >
      <div className="hud-panel w-full max-w-4xl max-h-[92vh] flex flex-col rounded-lg border-2 border-[#c6a15b]/50 shadow-2xl overflow-hidden bg-[#12100d] text-[#f3ead8]">
        {/* 1. TOP HEADER & SETTLEMENT STATS BAR */}
        <div className="p-4 border-b border-[#c6a15b]/35 bg-gradient-to-r from-[#1b1712] via-[#241e17] to-[#1b1712] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Heraldry Crest */}
            <div
              style={{ backgroundColor: factionInfo.color }}
              className="w-10 h-12 flex items-center justify-center border-2 border-[#fcd34d] shadow-lg shrink-0 text-[#fde68a]"
              title={factionInfo.emblemName}
            >
              <FactionCrest faction={settlement.faction} size={26} className="border-0 shadow-none"/>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs text-[#c6a15b] tracking-wider font-semibold">
                <span>
                  {isTown
                    ? 'Ticaret Şehri'
                    : isCastle
                      ? 'Müstahkem Kale'
                      : 'Kırsal Tarım Köyü'}
                </span>
                <span>·</span>
                <span>{factionInfo.name}</span>
                <span>·</span>
                <span className="font-mono-tabular">Refah: {settlement.prosperity}</span>
              </div>
              <h2
                id="settlement-modal-title"
                className="text-2xl sm:text-3xl font-display font-extrabold text-[#fef08a] tracking-wide"
              >
                {settlement.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              type="button"
              onClick={onClose}
              aria-label="Yerleşimden ayrıl"
              className="px-4 py-2 text-xs font-bold text-[#fef08a] bg-[#2a2218] border border-[#c6a15b]/60 rounded hover:bg-[#3d3224] hover:border-[#fde68a] transition-colors whitespace-nowrap shadow-md"
            >
              Haritaya Dön [Esc]
            </button>
          </div>
        </div>

        {/* 2. NOTABLES & LORDS PRESENT BAR (Bannerlord Portreler Barı) */}
        <div className="px-4 py-2 border-b border-[#c6a15b]/20 bg-[#16130f] flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[#a89b84] font-semibold text-[11px] whitespace-nowrap mr-2">
            İleri Gelenler:
          </span>
          {notables.map((n) =>(
            <button
              key={n.id}
              type="button"
              title={`${n.name} — ${n.title}`}
              onClick={() =>{
                setSelectedNotable(n);
                setFeedback(null);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all ${
                selectedNotable?.id === n.id
                  ? 'bg-[#3b2d18] border-[#fde68a] text-[#fef08a]'
                  : 'bg-[#1e1a14] border-[#c6a15b]/30 text-[#d1c5b0] hover:bg-[#28221a]'
              }`}
            >
              <span className="text-[#c6a15b]">{NOTABLE_ICONS[n.avatarIcon]}</span>
              <span className="font-semibold whitespace-nowrap">{n.name}</span>
            </button>
          ))}
        </div>

        {/* NOTABLE SPEECH POPUP (IF CLICKED) */}
        {selectedNotable && (
          <NotableSpeechCard notable={selectedNotable} onClose={() => setSelectedNotable(null)} />
        )}

        {/* 3. MAIN WORKSPACE: LEFT ACTION MENU + RIGHT ACTIVE PANEL */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
          {/* LEFT BANNERLORD ACTION NAVIGATION */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#c6a15b]/25 bg-[#14110d] p-3 flex flex-row md:flex-col gap-1.5 overflow-x-auto shrink-0">
            {/* COMMON: OVERVIEW */}
            <button
              type="button"
              onClick={() =>{
                setActiveTab('overview');
                setFeedback(null);
              }}
              className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'overview'
                  ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                  : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
              }`}
            >
              <span>{isTown ? <Landmark size={14} strokeWidth={1.7} />: isCastle ? <Castle size={14} strokeWidth={1.7} />: <Wheat size={14} strokeWidth={1.7} />}</span>
              <span>{isTown ? 'Meydan & Genel Durum': isCastle ? 'İç Kale & Divanhane': 'Köy Meydanı & Bilgi'}</span>
            </button>

            {/* TOWN SPECIFIC BUTTONS */}
            {isTown && (
              <>
                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('keep');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'keep'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Castle size={14} strokeWidth={1.7} /></span>
                  <span>Kale</span>
                </button>

                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('market');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'market'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Scale size={14} strokeWidth={1.7} /></span>
                  <span>Pazaryeri</span>
                </button>

                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('tavern');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'tavern'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Beer size={14} strokeWidth={1.7} /></span>
                  <span>Meyhane</span>
                </button>

                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('arena');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'arena'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Swords size={14} strokeWidth={1.7} /></span>
                  <span>Arena</span>
                </button>

                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('smithy');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'smithy'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Hammer size={14} strokeWidth={1.7} /></span>
                  <span>Demirci</span>
                </button>
              </>
            )}

            {/* CASTLE SPECIFIC BUTTONS */}
            {isCastle && (
              <>
                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('dungeon');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'dungeon'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Lock size={14} strokeWidth={1.7} /></span>
                  <span>Zindan</span>
                </button>

                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('garrison');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'garrison'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Shield size={14} strokeWidth={1.7} /></span>
                  <span>Garnizon</span>
                </button>
              </>
            )}

            {/* TOWN & CASTLE BUILDING PROJECTS */}
            {(isTown || isCastle) && (
              <button
                type="button"
                onClick={() =>{
                  setActiveTab('buildings');
                  setFeedback(null);
                }}
                className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === 'buildings'
                    ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                    : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                }`}
              >
                <span className="text-[#c6a15b]"><Construction size={14} strokeWidth={1.7} /></span>
                <span>Mülk Yönetimi</span>
              </button>
            )}

            {/* VILLAGE SPECIFIC BUTTONS */}
            {isVillage && (
              <>
                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('market');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'market'
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                      : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Wheat size={14} strokeWidth={1.7} /></span>
                  <span>Erzak Al</span>
                </button>

                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('hostile');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'hostile'
                      ? 'bg-[#7f1d1d] text-white border border-[#ef4444]/60 shadow'
                      : 'text-[#fca5a5] hover:bg-[#281515] border border-transparent'
                  }`}
                >
                  <span className="text-[#c6a15b]"><AlertTriangle size={14} strokeWidth={1.7} /></span>
                  <span>Düşmanca Eylemler</span>
                </button>
              </>
            )}

            {/* RECRUIT TROOPS BUTTON (ALL SETTLEMENTS) */}
            <button
              type="button"
              onClick={() =>{
                setActiveTab('recruit');
                setFeedback(null);
              }}
              className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'recruit'
                  ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                  : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
              }`}
            >
              <span className="text-[#c6a15b]"><Shield size={14} strokeWidth={1.7} /></span>
              <span>
                {isTown
                  ? 'Gönüllü Asker Topla'
                  : isCastle
                    ? 'Soylu Süvari Topla'
                    : 'Köylü Gönüllü Asker Topla'}
              </span>
            </button>

            {/* WAIT / REST BUTTON (ALL SETTLEMENTS) */}
            <button
              type="button"
              onClick={() =>{
                setActiveTab('wait');
                setFeedback(null);
              }}
              className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'wait'
                  ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                  : 'text-[#d1c5b0] hover:bg-[#221c15] border border-transparent'
              }`}
            >
              <span className="text-[#c6a15b]"><Tent size={14} strokeWidth={1.7} /></span>
              <span>Burada Bekle</span>
            </button>

            {/* SIEGE CAMP & ASSAULT BUTTONS (IF NOT PLAYER OWNED) */}
            {!isPlayerOwned && !isVillage && (
              <>
                <button
                  type="button"
                  onClick={() =>{
                    setActiveTab('siege');
                    setFeedback(null);
                  }}
                  className={`text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeTab === 'siege'
                      ? 'bg-[#991b1b] text-white border border-[#fca5a5] shadow'
                      : 'text-[#fca5a5] hover:bg-[#281515] border border-[#ef4444]/30'
                  }`}
                >
                  <span className="text-[#c6a15b]"><Target size={14} strokeWidth={1.7} /></span>
                  <span>Kuşatma Kampı</span>
                </button>
                <button
                  type="button"
                  onClick={() =>onStartSiegeBattle(settlement)}
                  className="text-left px-3 py-2 rounded text-xs font-semibold flex items-center gap-2 bg-[#7f1d1d] hover:bg-[#991b1b] text-white border border-[#ef4444]/60 transition-all mt-auto"
                >
                  <span className="text-[#c6a15b]"><Swords size={14} strokeWidth={1.7} /></span>
                  <span>Kuşat ve Taarruz</span>
                </button>
              </>
            )}
          </div>

          {/* RIGHT ACTIVE CONTENT PANEL */}
          <div className="flex-1 p-5 overflow-y-auto bg-[#181510]">
            {/* Feedback notification */}
            {feedback && (
              <div className="mb-4 px-3.5 py-2.5 rounded bg-[#292216] border border-[#d97706]/60 text-xs text-[#fde68a] shadow animate-fade-in">
                {feedback}
              </div>
            )}

            {/* 3.A: OVERVIEW TAB */}
            {activeTab === 'overview'&& (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[#fef08a]">{settlement.name} Genel Durumu</h3>
                  <p className="text-xs text-[#d1c5b0] mt-1 leading-relaxed">
                    {settlement.description}
                  </p>
                </div>

                {/* Settlement Key Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/25">
                  <div>
                    <span className="text-[11px] text-[#a89b84] block">Refah Seviyesi</span>
                    <span className="text-base font-bold text-[#fbbf24] font-mono-tabular">
                      {settlement.prosperity}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#a89b84] block">Garnizon Muhafızı</span>
                    <span className="text-base font-bold text-[#f3ead8] font-mono-tabular">
                      {settlement.garrison} Asker
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#a89b84] block">Pazar Erzağı</span>
                    <span className="text-base font-bold text-[#34d399] font-mono-tabular">
                      {settlement.foodStock} Sandık
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#a89b84] block">Sur Seviyesi</span>
                    <span className="text-base font-bold text-[#60a5fa] font-mono-tabular">
                      {isTown ? 'Kademe II (Büyük Taş)': isCastle ? 'Kademe III (Müstahkem)': 'Açık Köy Çiti'}
                    </span>
                  </div>
                </div>

                {/* Bound settlements / Bound info */}
                {isVillage && settlement.boundSettlementName && (
                  <div className="p-3 rounded bg-[#1a1611] border border-[#c6a15b]/20 text-xs">
                    <span className="text-[#a89b84]">Bağlı Olduğu Merkez: </span>
                    <span className="font-bold text-[#fde68a]">{settlement.boundSettlementName}</span>
                    <p className="text-[11px] text-[#b5a890] mt-1">
                      Köy kervanları haftalık olarak hasat ettikleri tahıl ve tarım ürünlerini bu şehre taşır.
                    </p>
                  </div>
                )}

                {!isVillage && (
                  <div className="p-3 rounded bg-[#1a1611] border border-[#c6a15b]/20 text-xs">
                    <span className="text-[#a89b84] block mb-1 font-semibold">Bağlı Kırsal Köyler:</span>
                    <div className="flex flex-wrap gap-2">
                      {campaign.settlements
                        .filter((v) =>v.type === 'VILLAGE'&& v.boundSettlementId === settlement.id)
                        .map((v) =>(
                          <span
                            key={v.id}
                            className="px-2.5 py-1 rounded bg-[#241f17] border border-[#c6a15b]/30 text-[#f3ead8] text-[11px]"
                          >
                             {v.name} (Refah: {v.prosperity})
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3.B: KEEP TAB (TOWN / CASTLE) */}
            {activeTab === 'keep'&& (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#fef08a]">Kalenin İç Avlusu ve Divanhane</h3>
                <p className="text-xs text-[#d1c5b0] leading-relaxed">
                  Şehrin yüksek burçları ardındaki taş salonda bölge soyluları, kumandanlar ve leydiler toplanır.
                  Burada siyasi görüşmeler yapabilir, krallık ilişkilerinizi pekiştirebilirsiniz.
                </p>

                <div className="p-4 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-[#f8f0df]">Divana Kabul Edilme Talebi</div>
                    <div className="text-xs text-[#a89b84] mt-0.5">
                      {settlement.faction === 'empire'? 'İmparatoriçe Rhagaea Divanı': `${factionInfo.name} Divanı`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>{
                      sound.playWarhorn();
                      setFeedback('Nöbetçiler divan kapısını açtı. Şehir hakimi huzuruna kabul edildiniz.');
                    }}
                    className="px-3.5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                  >
                    Huzura Çık
                  </button>
                </div>
              </div>
            )}

            {/* 3.C: MARKET TAB */}
            {activeTab === 'market'&& (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#fef08a]">
                      {isVillage ? 'Köy Ambarı ve Erzak Alımı': 'Şehir Pazaryeri ve Ticaret Loncası'}
                    </h3>
                    <p className="text-xs text-[#d1c5b0]">
                      {isVillage
                        ? 'Köy ambarından taze ekmeklik buğday ve erzakları toptan ucuz fiyata alabilirsiniz.'
                        : 'Pazaryerinde silahlar, zırhlar, kalkanlar, binekler ve erzak alabilir, sefer ganimetlerini nakde çevirebilirsiniz.'}
                    </p>
                  </div>

                  {onTalkToReeve && (
                    <button
                      type="button"
                      onClick={onTalkToReeve}
                      className="px-3 py-1.5 rounded text-xs font-bold bg-[#241c12] hover:bg-[#362a1c] text-[#fde68a] border border-[#c6a15b]/40"
                    >
                      Muhtar / Reis ile Konuş
                    </button>
                  )}
                  {onOpenFullMarket && (
                    <button
                      type="button"
                      onClick={onOpenFullMarket}
                      className="px-4 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 shadow-lg transition-colors flex items-center gap-2 shrink-0"
                    >
                      <span className="text-[#c6a15b]"><Scale size={14} strokeWidth={1.7} /></span>
                      <span>Tam Ekran Pazaryeri & Envanter Arayüzü</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Buy Food Card */}
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#34d399]">Ordu Erzağı Satın Al (+5 Erzak)</div>
                      <div className="text-xs text-[#a89b84] mt-1">
                        Pazarda mevcut: <span className="font-mono font-bold text-white">{settlement.foodStock}</span>sandık
                      </div>
                      <div className="text-xs text-[#fbbf24] mt-0.5">
                        Fiyat: {isVillage ? '18 Dinar (Köy İndirimi)': '30 Dinar (Şehir Tarifesi)'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleFoodClick}
                      disabled={campaign.gold < (isVillage ? 18 : 30) || settlement.foodStock < 5}
                      className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#065f46] hover:bg-[#047857] text-white disabled:opacity-40 transition-colors"
                    >
                      Erzak Satın Al
                    </button>
                  </div>

                  {/* Sell Loot Card (Town only) */}
                  {isTown && (
                    <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-sm text-[#fbbf24]">Ganimet ve Fazlalıkları Sat</div>
                        <div className="text-xs text-[#a89b84] mt-1">
                          Savaş meydanlarında ele geçirilen zırh, kalkan ve hurda eşyalar tüccarlara toptan satılır.
                        </div>
                        <div className="text-xs text-[#34d399] mt-0.5">Gelir: +45 Dinar</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSellLootClick}
                        className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                      >
                        Ganimeti Sat (+45 Dinar)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3.D: TAVERN TAB (TOWN ONLY) */}
            {activeTab === 'tavern'&& (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#fef08a]">Meyhane Bölgesi</h3>
                <p className="text-xs text-[#d1c5b0]">
                  Gezginlerin, paralı kılıçların ve esir tacirlerinin buluşma noktası.
                </p>

                <div className="space-y-3">
                  {/* Hire Mercenaries */}
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Paralı Asker Bölüğü Kirala (4 Asker)</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        2 Kıdemli Paralı Süvari + 2 Usta Paralı Okçu derhal sancağınıza katılır.
                      </div>
                      <div className="text-xs text-[#fbbf24] mt-0.5">Ücret: 120 Dinar</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleHireMercenaries}
                      disabled={campaign.gold < 120}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      Kirala (120 Dinar)
                    </button>
                  </div>

                  {/* Ransom Prisoners */}
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Esirleri Fidyeciye Teslim Et</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        Ordunuzdaki esirler: <span className="font-bold text-[#fb923c]">{campaign.prisoners} Esir</span>
                      </div>
                      <div className="text-xs text-[#34d399] mt-0.5">
                        Getiri: Kelle başı 35 Dinar (Toplam: {campaign.prisoners * 35} Dinar)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRansom}
                      disabled={campaign.prisoners <= 0}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#374151] hover:bg-[#4b5563] text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      Fidye Al
                    </button>
                  </div>

                  {/* Buy Drinks for Morale */}
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Tüm Meyhaneye İkramda Bulun</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        Meyhanedeki ahaliye şarap ısmarlayarak askerlerinizin moralini yükseltin (+8 Moral).
                      </div>
                      <div className="text-xs text-[#fbbf24] mt-0.5">Ücret: 25 Dinar</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleTavernRound}
                      disabled={campaign.gold < 25}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#78350f] hover:bg-[#92400e] text-[#fef08a] disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      İkram Et (25 Dinar)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3.E: ARENA & TOURNAMENT TAB (TOWN ONLY) */}
            {activeTab === 'arena'&& (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#fef08a]">Arena ve Turnuva Meydanı</h3>
                <p className="text-xs text-[#d1c5b0]">
                  Binlerce tezahürat yapan seyircinin önünde kılıç çalın, yeteneklerinizi sergileyin ve şampiyonluk kazanın!
                </p>

                {tournamentResult && (
                  <div
                    className={`p-4 rounded border text-xs shadow-lg animate-fade-in ${
                      tournamentResult.victory
                        ? 'bg-[#1e3a1f] border-[#22c55e]/60 text-[#bbf7d0]'
                        : 'bg-[#2a1b1b] border-[#ef4444]/60 text-[#fecaca]'
                    }`}
                  >
                    <div className="font-extrabold text-sm mb-1">{tournamentResult.title}</div>
                    <div>{tournamentResult.details}</div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Practice Fight */}
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Dövüş Ustası ile Talim Yap</div>
                      <p className="text-xs text-[#a89b84] mt-1">
                        Arenanın kumlarında diğer gladyatörlerle pratik yapın.
                      </p>
                      <div className="text-xs text-[#fbbf24] mt-1.5">+25 Dinar & +2 Nam</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleArenaPractice}
                      className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                    >
                      Talime Başla (+25 Dinar)
                    </button>
                  </div>

                  {/* Join Tournament */}
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#fde68a]/40 shadow flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#fef08a]">Büyük Şehir Turnuvasına Katıl</div>
                      <p className="text-xs text-[#a89b84] mt-1">
                        3 Turlu eliminasyon dövüşü. Turnuva şampiyonuna büyük altın ödülü ve prestijli zırh verilir!
                      </p>
                      <div className="text-xs text-[#34d399] mt-1.5">
                        Ödül: 250 Dinar · +15 Nam · Şeref Miğferi
                      </div>
                      <div className="text-xs text-[#ef4444] mt-0.5">Giriş Harcı: 30 Dinar</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleArenaTournament}
                      disabled={campaign.gold < 30}
                      className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white disabled:opacity-40 transition-colors shadow-md"
                    >
                      Turnuvaya Gir (30 Dinar)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3.F: RECRUITMENT TAB (ALL SETTLEMENTS) */}
            {activeTab === 'recruit'&& (
              <div className="space-y-4"data-testid="recruit-panel">
                <h3 className="text-base font-bold text-[#fef08a]">
                  {isTown
                    ? 'Gönüllü Asker Topla (Kışla & Muhafız Yazımı)'
                    : isCastle
                      ? 'Soylu Süvari ve Katafrakt Ocağı'
                      : 'Köylü Gönüllü Asker Devşirme'}
                </h3>
                <p className="text-xs text-[#d1c5b0]">
                  {isTown
                    ? 'Şehirdeki loncalardan ve kışlalardan nizami piyadeler ve okçular devşirilir.'
                    : isCastle
                      ? 'Kaleler yüksek disiplinli zırhlı soylu süvarilerin yetiştiği merkezlerdir.'
                      : 'Köyler düşük maliyetli, sadık köylü acemileri sağlar.'}
                </p>

                {/* Faz 8: parti kapasitesi ve ilişki */}
                <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#c6a15b] font-semibold">Parti Kapasitesi</span>
                    <span className="font-mono-tabular text-[#f8f0df]">
                      {partySize(campaign)} / {partyLimit(campaign)} asker
                    </span>
                  </div>
                  <div className="w-full h-2 rounded bg-[#26211a] overflow-hidden">
                    <div
                      className={`h-full ${partyRoom(campaign) === 0 ? 'bg-[#dc2626]': 'bg-[#34d399]'}`}
                      style={{
                        width: `${Math.min(100, Math.round((partySize(campaign) / partyLimit(campaign)) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] mt-1">
                    <span className={factionRelation < 0 ? 'text-[#fca5a5]': 'text-[#34d399]'}>
                      Muhtarla ilişki: {factionRelation >0 ? `+${factionRelation}`: factionRelation}
                    </span>
                    <span className="text-[#a89b84]">
                      {partyRoom(campaign) >0
                        ? `${partyRoom(campaign)} boş yer`
                        : 'Parti dolu — terhis et veya kademe yükselt'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(UNIT_DEFINITIONS) as UnitTierId[]).map((unitId) =>{
                    const quote = recruitQuote(campaign, settlement, unitId, factionRelation);
                    const discount = quote.unitCost !== quote.baseCost;
                    const max = quote.maxRecruitable;

                    return (
                      <div
                        key={unitId}
                        data-unit={unitId}
                        className={`p-3 rounded bg-[#1f1a14] border flex flex-col gap-2 ${
                          max >0 ? 'border-[#c6a15b]/25': 'border-[#c6a15b]/10 opacity-80'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-sm text-[#f8f0df] flex items-center gap-1.5">
                            <span>{troopName(unitId, settlement.faction)}</span>
                          </div>
                          <div className="text-xs text-[#a89b84] mt-0.5">
                            {UNIT_DEFINITIONS[unitId].name} · {troopRole(unitId, settlement.faction)}
                          </div>
                          <div className="text-xs text-[#c6a15b] mt-1 font-mono-tabular">
                            Havuz: <span className="font-bold text-white">{quote.available}</span>· Orduda:{''}
                            {campaign.roster[unitId] ?? 0}
                          </div>
                          <div className="text-xs mt-0.5 font-mono-tabular">
                            <span className={discount ? 'text-[#34d399]': 'text-[#fbbf24]'}>
                              Ücret: {quote.unitCost} Dinar
                              {discount && (
                                <span className="text-[10px] ml-1">
                                  (taban {quote.baseCost} — ilişki {quote.unitCost < quote.baseCost ? 'indirimi': 'zammı'})
                                </span>
                              )}
                            </span>
                            <span className="text-[#a89b84]">· Maaş: {quote.dailyWage}/gün</span>
                          </div>
                          {quote.blockedReason && (
                            <div className="text-[10px] text-[#fca5a5] mt-1">{quote.blockedReason}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={max < 1}
                            onClick={() =>handleRecruitClick(unitId, 1)}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-colors ${
                              max >= 1
                                ? 'bg-[#b45309] hover:bg-[#d97706] text-white'
                                : 'bg-[#2a251e] text-[#6e6455] cursor-not-allowed'
                            }`}
                          >
                            Topla (+1)
                          </button>
                          <button
                            type="button"
                            disabled={max < 1}
                            onClick={() =>handleRecruitClick(unitId, Math.min(5, max))}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-colors ${
                              max >= 1
                                ? 'bg-[#1e3a5f] hover:bg-[#2563eb] text-white'
                                : 'bg-[#2a251e] text-[#6e6455] cursor-not-allowed'
                            }`}
                          >
                            +{Math.min(5, Math.max(1, max))} topla
                          </button>
                          <button
                            type="button"
                            disabled={max < 1}
                            onClick={() =>handleRecruitClick(unitId, max)}
                            title={`Mümkün olan en fazla: ${max}`}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-bold transition-colors ${
                              max >= 1
                                ? 'bg-[#15803d] hover:bg-[#16a34a] text-white'
                                : 'bg-[#2a251e] text-[#6e6455] cursor-not-allowed'
                            }`}
                          >
                            Tümü ({max})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3.G: WAIT & REST TAB */}
            {activeTab === 'wait'&& (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#fef08a]">Yerleşimde Dinlen ve Zaman Geçir</h3>
                <p className="text-xs text-[#d1c5b0] leading-relaxed">
                  Güvenli surlar veya köy damı altında mola vererek ordunuzun gücünü tazeleyin. Dinlenme süresince
                  yaralı askerleriniz iki kat hızlı iyileşir, erzak tüketimi minimuma iner.
                </p>

                <div className="p-4 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-[#f8f0df]">Ordugah Kur ve Dinlen</div>
                    <div className="text-xs text-[#34d399] mt-0.5">
                      +25 Komutan Canı · +6 Ordu Morali · Yaralılar İyileşir
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestRecover}
                    className="px-4 py-2 rounded text-xs font-bold bg-[#1e3a5f] hover:bg-[#2563eb] text-white transition-colors shadow"
                  >
                    Dinlenmeye Geç
                  </button>
                </div>
              </div>
            )}

            {/* 3.H: GARRISON TAB (CASTLE ONLY) */}
            {activeTab === 'garrison'&& isCastle && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#fef08a]">Garnizon Savunma Yönetimi</h3>
                <p className="text-xs text-[#d1c5b0]">
                  Kalede mevcut nöbetçi muhafız sayısı:{''}
                  <span className="font-bold text-white font-mono">{settlement.garrison} Asker</span>.
                  Buraya ordunuzdan asker bırakabilir veya garnizondan takviye alabilirsiniz.
                </p>

                <div className="space-y-2.5">
                  {(Object.keys(UNIT_DEFINITIONS) as UnitTierId[]).map((unitId) =>{
                    const def = UNIT_DEFINITIONS[unitId];
                    const ownedInParty = campaign.roster[unitId];

                    return (
                      <div
                        key={unitId}
                        className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/25 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-xs text-[#f8f0df]">{def.name}</div>
                          <div className="text-[11px] text-[#a89b84]">Ordunuzdaki Mevcut: {ownedInParty}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={ownedInParty <= 0}
                            onClick={() =>handleGarrisonTransfer(unitId, 'deposit')}
                            className="px-2.5 py-1.5 rounded text-[11px] font-bold bg-[#374151] hover:bg-[#4b5563] text-white disabled:opacity-40 transition-colors"
                          >
                            Kaleye Bırak
                          </button>
                          <button
                            type="button"
                            disabled={settlement.garrison <= 5}
                            onClick={() =>handleGarrisonTransfer(unitId, 'withdraw')}
                            className="px-2.5 py-1.5 rounded text-[11px] font-bold bg-[#065f46] hover:bg-[#047857] text-white disabled:opacity-40 transition-colors"
                          >
                            Orduya Al
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3.I: DUNGEON TAB (CASTLE ONLY) */}
            {activeTab === 'dungeon'&& isCastle && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#fef08a]">Kale Zindanı</h3>
                <p className="text-xs text-[#d1c5b0]">
                  Kalelerin yeraltı taş hücreleri düşman kumandanları ve tehlikeli haydutları hapsetmek için inşa edilmiştir.
                </p>

                <div className="p-4 rounded bg-[#1f1a14] border border-[#c6a15b]/30">
                  <div className="text-xs text-[#a89b84]">Zindan Doluluk Oranı:</div>
                  <div className="text-sm font-bold text-white mt-1">2 / 30 Hücre Dolu</div>
                  <p className="text-[11px] text-[#d1c5b0] mt-2">
                    Kaledeki demir kapılar ve gardiyanlar esirlerin kaçış ihtimalini sıfıra indirir.
                  </p>
                </div>
              </div>
            )}

            {/* 3.J: HOSTILE ACTIONS TAB (VILLAGE ONLY) */}
            {activeTab === 'hostile'&& isVillage && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-[#ef4444]">Düşmanca Eylemler (Yağma ve Baskı)</h3>
                <p className="text-xs text-[#fca5a5]">
                  Dikkat: Savunmasız köylere yapılacak düşmanca saldırılar o krallıkla derhal savaş durumu başlatır
                  ve onurunuzu düşürür.
                </p>

                <div className="space-y-3">
                  {/* Force Supplies */}
                  <div className="p-3.5 rounded bg-[#241515] border border-[#ef4444]/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#fef08a]">Köylüleri Erzak Vermeye Zorla</div>
                      <div className="text-xs text-[#d1c5b0] mt-0.5">
                        Köyü yakmadan ambarlardaki yiyecekleri kılıç zoruyla gasp edin.
                      </div>
                      <div className="text-xs text-[#34d399] mt-0.5">+8 Erzak Kazandırır</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForceSupplies}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white transition-colors shadow"
                    >
                      Erzak Gasp Et
                    </button>
                  </div>

                  {/* Force Recruits */}
                  <div className="p-3.5 rounded bg-[#241515] border border-[#ef4444]/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#fef08a]">Köylüleri Asker Vermeye Zorla</div>
                      <div className="text-xs text-[#d1c5b0] mt-0.5">
                        Köydeki gençleri silah altına almaya zorlayarak sancağınıza katın.
                      </div>
                      <div className="text-xs text-[#60a5fa] mt-0.5">+3 Zorunlu Köylü Asker</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForceRecruits}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white transition-colors shadow"
                    >
                      Zorla Askere Al
                    </button>
                  </div>

                  {/* Raid Village */}
                  <div className="p-3.5 rounded bg-[#331111] border-2 border-[#ef4444] shadow-lg flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-sm text-[#fca5a5]">Köyü Yağmala ve Ateşe Ver!</div>
                      <div className="text-xs text-[#fecaca] mt-0.5">
                        Köy ambarlarını boşaltın, evleri yakın. Köy haritada dumanlar altında kalır.
                      </div>
                      <div className="text-xs text-[#fde047] mt-0.5 font-bold">
                        Kazanç: +280 Dinar · +16 Erzak (Savaş Başlar!)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRaid}
                      disabled={settlement.isRaided}
                      className="px-4 py-2 rounded text-xs font-extrabold bg-[#dc2626] hover:bg-[#ef4444] text-white disabled:opacity-40 transition-colors shadow-xl"
                    >
                      {settlement.isRaided ? 'Zaten Yağmalandı': 'Köyü Yağmala!'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3.K: SMITHY & WORKSHOPS TAB (TOWN ONLY) */}
            {activeTab === 'smithy'&& isTown && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-[#fef08a]">
                     Şehir Demirci Ocağı (Silah Dövme & Lonca Siparişleri)
                  </h3>
                  <p className="text-xs text-[#d1c5b0] mt-0.5">
                    Sert odun kömürü ve Thamaskene çeliği kullanarak özel silahlar dövün; lonca siparişlerinden yüksek Dinar kazanın, Demircilik (Smithing: {campaign.skills?.smithing?.level ?? 60}) becerinizi artırın ve dövdüğünüz silahı kuşanın!
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        id: 'SPATHA',
                        name: 'Altın Kabzalı İmparatorluk Spathası',
                        cost: 65,
                        profit: 140,
                        stat: '+88 Hızlı Kesici Hasar',
                      },
                      {
                        id: 'FALX',
                        name: 'Thamaskene Çift Elli Savaş Falxı',
                        cost: 80,
                        profit: 165,
                        stat: '+104 Kesici ZırhYaran',
                      },
                      {
                        id: 'LANCE',
                        name: 'Usta İşi Kalradya Kontos Kargısı',
                        cost: 95,
                        profit: 195,
                        stat: '+148 Hücum Delici Hasar',
                      },
                    ] as const
                  ).map((bp) =>(
                    <div
                      key={bp.id}
                      className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-xs text-[#fef08a]">{bp.name}</div>
                        <div className="text-[11px] text-[#34d399] mt-1">{bp.stat}</div>
                        <div className="text-[11px] text-[#d1c5b0] mt-1 font-mono-tabular">
                          Cevher Maliyeti: {bp.cost} Dinar · Lonca Ödülü: {bp.profit} Dinar
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={campaign.gold < bp.cost}
                        onClick={() =>{
                          if (!onForgeWeapon) return;
                          const err = onForgeWeapon(settlement.id, bp.id);
                          if (err) {
                            setFeedback(err);
                          } else {
                            sound.playClang();
                            setFeedback(
                              `"${bp.name}"başarıyla dövüldü! Net +${bp.profit - bp.cost} Dinar kazandınız, Demircilik +8 XP arttı ve silah kuşanıldı.`,
                            );
                          }
                        }}
                        className="w-full py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40 transition-colors"
                      >
                        Ocağı Yak ve Döv ({bp.cost} Dinar)
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-[#c6a15b]/25">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#fef08a]">
                         Şehir Zanaat Atölyeleri (Pasif Gelir & Üretim)
                      </h4>
                      <p className="text-xs text-[#a89b84]">
                        Aktif Atölyeniz:{''}
                        <span className="text-[#fbbf24] font-semibold">
                          {settlement.workshopType && settlement.workshopType !== 'NONE'
                            ? settlement.workshopType
                            : 'Henüz Satın Alınmadı'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(
                      [
                        { id: 'BREWERY', name: 'Bira Fabrikası', desc: 'Tahıl işler · +45 Dinar/gün'},
                        { id: 'SMITHY', name: 'Demirci Atölyesi', desc: 'Demir işler · +60 Dinar/gün'},
                        { id: 'OLIVE_PRESS', name: 'Zeytinyağı Presi', desc: 'Zeytin işler · +50 Dinar/gün'},
                        { id: 'WEAVERY', name: 'Kadife Dokuma', desc: 'İpek/Yün işler · +55 Dinar/gün'},
                      ] as const
                    ).map((ws) =>{
                      const isActive = settlement.workshopType === ws.id;
                      return (
                        <div
                          key={ws.id}
                          className={`p-3 rounded border flex flex-col justify-between gap-2 ${
                            isActive
                              ? 'bg-[#2b2214] border-[#fbbf24]'
                              : 'bg-[#1f1a14] border-[#c6a15b]/25'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-xs text-[#f8f0df]">{ws.name}</div>
                            <div className="text-[11px] text-[#a89b84] mt-0.5">{ws.desc}</div>
                          </div>
                          <button
                            type="button"
                            disabled={isActive || campaign.gold < 220}
                            onClick={() =>{
                              if (!onBuyWorkshop) return;
                              const err = onBuyWorkshop(settlement.id, ws.id);
                              if (err) setFeedback(err);
                              else {
                                sound.playCoin();
                                setFeedback(`${settlement.name} şehrinde ${ws.name} faaliyete geçti!`);
                              }
                            }}
                            className="w-full py-1.5 rounded text-[11px] font-bold bg-[#15803d] hover:bg-[#16a34a] text-white disabled:opacity-40 transition-colors"
                          >
                            {isActive ? 'Aktif Atölye': 'Satın Al (220 D)'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3.L: BUILDING PROJECTS & DAILY DEFAULTS (TOWN & CASTLE) */}
            {activeTab === 'buildings'&& (isTown || isCastle) && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-[#fef08a]">
                     Mülk Yönetimi, Bina Projeleri (Seviye I → III) ve Günlük Varsayılanlar
                  </h3>
                  <p className="text-xs text-[#d1c5b0] mt-0.5">
                    Surları, tahıl ambarlarını, kışlaları ve su kemerlerini yükselterek yerleşimin savunma, erzak, sadakat ve vergi kapasitesini kalıcı olarak artırın.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        id: 'FORTIFICATIONS',
                        name: 'Surlar ve İstihkam (Fortifications)',
                        effect: 'Sur seviyesini ve savunma mancınık kapasitesini artırır.',
                      },
                      {
                        id: 'GRANARY',
                        name: 'Tahıl Ambarı (Granary)',
                        effect: '+25 Erzak Stoku ve kuşatmalarda açlığa dayanma süresi.',
                      },
                      {
                        id: 'BARRACKS',
                        name: 'Garnizon Kışlası (Barracks)',
                        effect: '+6 Garnizon Muhafızı ve -%10 garnizon maaş gideri.',
                      },
                      {
                        id: 'FAIRGROUNDS',
                        name: 'Panayır Alanı (Fairgrounds)',
                        effect: '+8 Halk Bağlılığı (Loyalty) — isyan riskini önler.',
                      },
                      {
                        id: 'FORUM',
                        name: 'Şehir Forumu & Divan',
                        effect: '+8 Klan Namı ve günlük Nüfuz (Influence) artışı.',
                      },
                      {
                        id: 'AQUEDUCTS',
                        name: 'Su Kemerleri (Aqueducts)',
                        effect: '+45 Şehir Refahı (Prosperity) ve vergi artışı.',
                      },
                    ] as const
                  ).map((b) =>{
                    const currentLvl =
                      settlement.buildings?.[b.id] ??
                      (b.id === 'FORTIFICATIONS'? settlement.wallLevel ?? 2 : 1);
                    const cost = currentLvl === 1 ? 180 : 320;
                    const maxed = currentLvl >= 3;
                    return (
                      <div
                        key={b.id}
                        className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-xs text-[#f8f0df]">
                            {b.name} · <span className="text-[#fbbf24]">Seviye {currentLvl}/3</span>
                          </div>
                          <div className="text-[11px] text-[#a89b84] mt-0.5">{b.effect}</div>
                        </div>
                        <button
                          type="button"
                          disabled={maxed || campaign.gold < cost}
                          onClick={() =>{
                            if (!onUpgradeBuilding) return;
                            const err = onUpgradeBuilding(settlement.id, b.id);
                            if (err) setFeedback(err);
                            else {
                              sound.playCoin();
                              setFeedback(
                                `${b.name} Seviye ${currentLvl + 1} kademesine yükseltildi!`,
                              );
                            }
                          }}
                          className="px-3 py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          {maxed ? 'Maksimum (III)': `Yükselt (${cost} D)`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-[#c6a15b]/25">
                  <h4 className="text-sm font-bold text-[#fef08a] mb-2">
                     Günlük Varsayılanlar (Daily Defaults — Sürekli Aktif Şehir Politikası)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'FESTIVAL', label: 'Festival ve Oyunlar', bonus: '+3 Bağlılık'},
                        { id: 'IRRIGATION', label: 'Köy Sulaması', bonus: '+10 Refah / Ocak'},
                        { id: 'MILITIA', label: 'Milis Eğitimi', bonus: '+4 Milis Gücü'},
                        { id: 'HOUSING', label: 'Konut İnşası', bonus: '+10 Şehir Refahı'},
                      ] as const
                    ).map((def) =>{
                      const active = (settlement.dailyDefault ?? 'FESTIVAL') === def.id;
                      return (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() =>{
                            if (!onSetDailyDefault) return;
                            onSetDailyDefault(settlement.id, def.id);
                            setFeedback(`Günlük şehir politikası "${def.label}"olarak ayarlandı (${def.bonus}).`);
                          }}
                          className={`p-2.5 rounded border text-left transition-all ${
                            active
                              ? 'bg-[#3b2d18] border-[#fbbf24] text-[#fef08a]'
                              : 'bg-[#1f1a14] border-[#c6a15b]/25 text-[#d1c5b0] hover:bg-[#2a231b]'
                          }`}
                        >
                          <div className="font-bold text-xs">{def.label}</div>
                          <div className="text-[11px] text-[#34d399] mt-0.5">{def.bonus}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3.M: SIEGE CAMP & SIEGE ENGINES TAB */}
            {activeTab === 'siege'&& !isVillage && (
              <div className="space-y-4">
                <div className="p-3.5 rounded bg-[#241515] border border-[#ef4444]/50 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#fca5a5]">
                       Kuşatma Kampı Mühendisliği: {settlement.name}
                    </h3>
                    <div className="text-xs text-[#fecaca] mt-0.5 font-mono-tabular">
                      Sur Seviyesi: {settlement.wallLevel ?? 2} · Duvar Sağlığı: %{settlement.wallHealth ?? 100} · Savunmacı Garnizon: {settlement.garrison} Asker · Savunmacı Erzağı: {settlement.foodStock}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>{
                        if (!onBombardWalls) return;
                        const err = onBombardWalls(settlement.id);
                        if (err) setFeedback(err);
                        else {
                          sound.playHit();
                          setFeedback(
                            `Kuşatma bataryaları ${settlement.name} surlarını dövdü! Surlarda gedik açıldı ve garnizon zayıflatıldı.`,
                          );
                        }
                      }}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white shadow"
                    >
                       Sur Bombardımanı Başlat
                    </button>
                    <button
                      type="button"
                      onClick={() =>onStartSiegeBattle(settlement)}
                      className="px-4 py-2 rounded text-xs font-extrabold bg-[#dc2626] hover:bg-[#ef4444] text-white shadow-lg"
                    >
                       Taarruza Önderlik Et!
                    </button>
                  </div>
                </div>

                {/* Active & Reserve Siege Engines */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30">
                    <div className="font-bold text-[#fef08a] mb-1">
                      Sahadaki Kuşatma Silahları ({(settlement.siegeEngines ?? []).length}/6)
                    </div>
                    <div className="text-[#d1c5b0]">
                      {(settlement.siegeEngines ?? []).length >0
                        ? (settlement.siegeEngines ?? []).join('· ')
                        : 'Henüz sahada aktif kuşatma silahı yok.'}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#fef08a] mb-1">
                        Rezervdeki Silahlar ({(settlement.reserveEngines ?? []).length})
                      </div>
                      <div className="text-[#d1c5b0]">
                        {(settlement.reserveEngines ?? []).length >0
                          ? (settlement.reserveEngines ?? []).join('· ')
                          : 'Rezerv boş (Trebuchetleri biriktirip aynı anda sürün).'}
                      </div>
                    </div>
                    {(settlement.reserveEngines ?? []).length >0 && (
                      <button
                        type="button"
                        onClick={() =>{
                          if (!onDeployReserveEngines) return;
                          onDeployReserveEngines(settlement.id);
                          setFeedback('Rezervdeki tüm kuşatma silahları aynı anda sahaya sürüldü!');
                        }}
                        className="px-3 py-1.5 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white whitespace-nowrap"
                      >
                        Tümünü Sahaya Sür
                      </button>
                    )}
                  </div>
                </div>

                {/* Build Siege Engines */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        id: 'TREBUCHET',
                        name: 'Trebuchet (Ağır Mancınık)',
                        cost: 90,
                        desc: 'Surlarda büyük gedik açar (-%35 Duvar Sağlığı). Rezerve çekilip 4’lü sürülebilir.',
                      },
                      {
                        id: 'MANGONEL',
                        name: 'Ateşli Mangonel (Onager)',
                        cost: 65,
                        desc: 'Hem savunmacı burç silahlarını hem de garnizonu ateş çemberine alır.',
                      },
                      {
                        id: 'BALLISTA',
                        name: 'Ağır Kuşatma Balistası',
                        cost: 50,
                        desc: 'Surlardaki okçuları avlar, hızlı inşa edilir.',
                      },
                      {
                        id: 'BATTERING_RAM',
                        name: 'Koçbaşı (Battering Ram)',
                        cost: 50,
                        desc: 'Taarruz sırasında dış kale kapısını kırmak için piyadelerce sürülür.',
                      },
                      {
                        id: 'SIEGE_TOWER',
                        name: 'Kuşatma Kulesi (Siege Tower)',
                        cost: 80,
                        desc: 'Surlara güvenli zırhlı rampa indirir, kayıpları azaltır.',
                      },
                    ] as const
                  ).map((eng) =>(
                    <div
                      key={eng.id}
                      className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-xs text-[#f8f0df]">{eng.name}</div>
                        <div className="text-[11px] text-[#a89b84] mt-0.5">{eng.desc}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={campaign.gold < eng.cost}
                          onClick={() =>{
                            if (!onBuildSiegeEngine) return;
                            const err = onBuildSiegeEngine(settlement.id, eng.id, false);
                            if (err) setFeedback(err);
                            else setFeedback(`${eng.name} inşa edildi ve kuşatma hattına yerleştirildi!`);
                          }}
                          className="flex-1 py-1.5 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40"
                        >
                          Sahaya Kur ({eng.cost} D)
                        </button>
                        <button
                          type="button"
                          disabled={campaign.gold < eng.cost}
                          onClick={() =>{
                            if (!onBuildSiegeEngine) return;
                            const err = onBuildSiegeEngine(settlement.id, eng.id, true);
                            if (err) setFeedback(err);
                            else setFeedback(`${eng.name} inşa edildi ve tek seferde sürmek üzere Rezerve çekildi!`);
                          }}
                          className="px-2 py-1.5 rounded text-[11px] font-bold bg-[#1e293b] hover:bg-[#334155] text-[#93c5fd] disabled:opacity-40"
                        >
                          Rezerve Çek
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. BOTTOM STATUS BAR */}
        <div className="px-4 py-3 border-t border-[#c6a15b]/30 bg-[#16130f] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[#a89b84] block text-[11px]">Hazineniz</span>
            <span className="text-sm font-bold font-mono-tabular text-[#fbbf24]">
               {campaign.gold} Dinar
            </span>
          </div>
          <div>
            <span className="text-[#a89b84] block text-[11px]">Ordu Erzağınız</span>
            <span className="text-sm font-bold font-mono-tabular text-[#34d399]">
               {campaign.food} Günlük Erzak
            </span>
          </div>
          <div>
            <span className="text-[#a89b84] block text-[11px]">Ordu Mevcudunuz</span>
            <span className="text-sm font-bold font-mono-tabular text-[#f3ead8]">
               {campaign.roster.militia + campaign.roster.archer + campaign.roster.cavalry + campaign.roster.guard} Asker
            </span>
          </div>
          <div>
            <span className="text-[#a89b84] block text-[11px]">Ordu Morali</span>
            <span className="text-sm font-bold font-mono-tabular text-[#a78bfa]">
               {campaign.morale}/100 Moral
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
