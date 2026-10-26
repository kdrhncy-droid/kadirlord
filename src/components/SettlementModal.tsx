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
  SiegeBombardTarget,
  SiegeEngineType,
  UNIT_DEFINITIONS,
  UnitTierId,
  WorkshopTypeId,
  calculateClanTier,
  calculatePrisonerRansomValue,
  calculateSettlementDailyStats,
  getVillagePrimaryProduction,
  settlementWorkshopIncome,
} from '../game/rules';
import { BannerlordRecruitmentModal } from './BannerlordRecruitmentModal';
import { recruitQuote, partyLimit, partySize, partyRoom } from '../game/recruitment';
import { sound } from '../game/sound';
import { generateNotables, NOTABLE_POWER_INFLUENTIAL, notablePowerLabel, type NotableIconKey, type SettlementNotable } from '../game/notables';
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

const NOTABLE_ICONS: Record<NotableIconKey, React.ReactNode> = {
  crown: <Crown size={15} strokeWidth={1.7} />,
  landmark: <Landmark size={15} strokeWidth={1.7} />,
  shield: <Shield size={15} strokeWidth={1.7} />,
  coins: <Coins size={15} strokeWidth={1.7} />,
  beer: <Beer size={15} strokeWidth={1.7} />,
  swords: <Swords size={15} strokeWidth={1.7} />,
  castle: <Castle size={15} strokeWidth={1.7} />,
  lock: <Lock size={15} strokeWidth={1.7} />,
  wheat: <Wheat size={15} strokeWidth={1.7} />,
  hammer: <Hammer size={15} strokeWidth={1.7} />,
  cart: <Truck size={15} strokeWidth={1.7} />,
};

export interface NotableIssueQuest {
  title: string;
  description: string;
  actionLabel: string;
  goldReward: number;
  renownReward: number;
  relationReward: number;
}

function getNotableIssueQuest(
  notable: SettlementNotable,
  settlement: Settlement,
): NotableIssueQuest {
  const h = notable.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const templates: NotableIssueQuest[] = [
    {
      title: `${notable.name} · Kervan Yolu Güvenliği`,
      description: `${settlement.name} çevresindeki haydut gözcüleri ${notable.name} adına çalışan ulakları taciz ediyor. Devriye çıkarıp geçidi temizlemenizi istiyor.`,
      actionLabel: 'Devriye Gönder ve Geçidi Temizle',
      goldReward: 240 + (h % 5) * 20,
      renownReward: 6,
      relationReward: 10,
    },
    {
      title: `${notable.name} · Kaçak Gümrük Malları`,
      description: `${notable.name}, yerel lonca kayıtlarında eksik çıkan erzak ve demir sandıklarının izini sürmek için muhafız desteği talep ediyor.`,
      actionLabel: 'Lonca Denetimini Tamamla',
      goldReward: 210 + (h % 4) * 25,
      renownReward: 5,
      relationReward: 8,
    },
    {
      title: `${notable.name} · Çete Haracı Baskısı`,
      description: `Arka sokak çeteleri ${notable.name} himayesindeki zanaatkârlardan zorla haraç kesiyor. Sancağınızın ağırlığını koyarak çeteyi dağıtın.`,
      actionLabel: 'Çete Elebaşlarını Sindir',
      goldReward: 260 + (h % 4) * 20,
      renownReward: 7,
      relationReward: 12,
    },
    {
      title: `${notable.name} · Acil Hammadde Sevkiyatı`,
      description: `${settlement.name} atölyelerinin üretimi aksamaması için ${notable.name} acil erzak ve işgücü organizasyonu bekliyor.`,
      actionLabel: 'Sevkiyatı Organize Et',
      goldReward: 195 + (h % 6) * 15,
      renownReward: 5,
      relationReward: 9,
    },
  ];
  return templates[h % templates.length];
}

/**
 * İleri gelen konuşma kartı. Ayrı bileşen çünkü hem yerleşim modalında hem
 * probe'da (seçim olmadan) doğrudan render edilebilsin.
 */
export function NotableSpeechCard({
  notable,
  onClose,
  issueQuest,
  issueResolved,
  onResolveIssue,
}: {
  notable: SettlementNotable;
  onClose?: () => void;
  issueQuest?: NotableIssueQuest | null;
  issueResolved?: boolean;
  onResolveIssue?: () => void;
}) {
  const relationLabel =
    notable.relation > 0 ? `+${notable.relation}` : String(notable.relation);
  return (
    <div
      data-testid="notable-speech"
      className="px-3.5 py-2.5 bg-[#1b150e]/95 border-b border-[#c6a15b]/45 flex flex-col gap-2 text-xs"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2">
          <span className="text-[#c6a15b] mt-0.5">{NOTABLE_ICONS[notable.avatarIcon]}</span>
          <div>
            <span className="font-bold text-[#fde68a] block">
              {notable.name} ({notable.title})
            </span>
            <p className="text-[#e2d7c3] italic mt-0.5 leading-snug">"{notable.speech}"</p>
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

      {issueQuest && !issueResolved && onResolveIssue && (
        <div
          data-testid={`notable-quest-card-${notable.id}`}
          className="mt-1 p-2.5 rounded border border-cyan-400/50 bg-[#0d1c24]/90 text-[11px]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-cyan-400 text-black font-extrabold inline-flex items-center justify-center text-[10px]">
                !
              </span>
              {issueQuest.title}
            </span>
            <span className="font-mono text-[10px] text-[#34d399]">
              +{issueQuest.relationReward} İlişki · +{issueQuest.goldReward} Dinar
            </span>
          </div>
          <p className="text-[#d5e3ec] mt-1 leading-snug">{issueQuest.description}</p>
          <button
            type="button"
            data-testid={`resolve-notable-quest-${notable.id}`}
            onClick={onResolveIssue}
            className="mt-2 w-full py-1.5 px-3 rounded bg-gradient-to-r from-[#0e7490] to-[#0284c7] hover:from-[#0891b2] hover:to-[#0369a1] text-white font-bold text-[11px] border border-cyan-300/50 shadow transition"
          >
            {issueQuest.actionLabel} (+{issueQuest.relationReward} İlişki, +{issueQuest.goldReward} Dinar)
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Prosedürel Orta Çağ Eşraf / Yoldaş Portresi (Bannerlord sağ üst portre kutuları için)
 */
function NotablePortraitBust({
  seedId,
  name,
  role,
  accentColor,
}: {
  seedId: string;
  name: string;
  role: string;
  accentColor: string;
}) {
  const hash = (seedId + name).split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 3), 0);
  const skinTones = ['#d9a982', '#c9936b', '#e2b897', '#b8825c', '#cfa07a'];
  const hairColors = ['#2c1e16', '#4a3222', '#1a1615', '#6e4f35', '#7c746b', '#59311c'];
  const tunicColors = ['#3b2a1e', '#263328', '#3d2222', '#242c3d', '#423623', '#2e2538'];
  const skin = skinTones[hash % skinTones.length];
  const hair = hairColors[(hash >> 2) % hairColors.length];
  const tunic = tunicColors[(hash >> 4) % tunicColors.length];
  const hasBeard = hash % 3 !== 0;
  const headgearType = hash % 4; // 0: hood/cap, 1: turban/wrap, 2: noble band, 3: bare hair

  return (
    <svg viewBox="0 0 64 56" className="w-full h-full block">
      <defs>
        <linearGradient id={`bg-${hash}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#262018" />
          <stop offset="100%" stopColor="#0f0c09" />
        </linearGradient>
      </defs>
      <rect width="64" height="56" fill={`url(#bg-${hash})`} />
      {/* Subtle faction glow */}
      <circle cx="32" cy="28" r="24" fill={accentColor} opacity="0.16" />
      {/* Shoulders & Tunic */}
      <path d="M10 56 C12 41, 22 37, 32 37 C42 37, 52 41, 54 56 Z" fill={tunic} />
      <path d="M22 38 L32 49 L42 38" fill="none" stroke="#c6a15b" strokeWidth="1.4" opacity="0.75" />
      {/* Cloak / Mantle */}
      <path d="M8 56 C10 44, 17 39, 23 38 L20 56 Z" fill="#1a140f" opacity="0.7" />
      <path d="M56 56 C54 44, 47 39, 41 38 L44 56 Z" fill="#1a140f" opacity="0.7" />
      {/* Neck */}
      <rect x="27" y="30" width="10" height="9" rx="3" fill={skin} />
      {/* Head */}
      <ellipse cx="32" cy="23" rx="10.5" ry="12" fill={skin} />
      {/* Ears */}
      <ellipse cx="21" cy="24" rx="1.8" ry="3.2" fill={skin} />
      <ellipse cx="43" cy="24" rx="1.8" ry="3.2" fill={skin} />
      {/* Facial features */}
      <path d="M25 20 Q28 18.8 30 20" stroke="#2a1b12" strokeWidth="1.2" fill="none" />
      <path d="M34 20 Q36 18.8 39 20" stroke="#2a1b12" strokeWidth="1.2" fill="none" />
      <circle cx="27.5" cy="22" r="1.2" fill="#1c130d" />
      <circle cx="36.5" cy="22" r="1.2" fill="#1c130d" />
      <path d="M32 21.5 L31 26.5 L33.2 26.8" stroke="#9e6b47" strokeWidth="1.1" fill="none" />
      {/* Beard / Mustache */}
      {hasBeard ? (
        <path
          d="M22.5 26 C23 33, 28 36, 32 36 C36 36, 41 33, 41.5 26 C39 28, 35 28.5, 32 28.5 C29 28.5, 25 28, 22.5 26 Z"
          fill={hair}
          opacity="0.92"
        />
      ) : (
        <path d="M29 29.5 Q32 30.8 35 29.5" stroke="#8c583a" strokeWidth="1.2" fill="none" />
      )}
      {/* Hair / Headgear */}
      {headgearType === 0 && (
        <path d="M19 20 C20 10, 44 10, 45 20 C42 15, 22 15, 19 20 Z" fill="#4a3520" stroke="#c6a15b" strokeWidth="0.8" />
      )}
      {headgearType === 1 && (
        <path d="M19 19 C19 9, 45 9, 45 19 C40 16, 24 16, 19 19 Z" fill="#6b4c2b" />
      )}
      {headgearType === 2 && (
        <>
          <path d="M21 19 C22 10, 42 10, 43 19 C39 14, 25 14, 21 19 Z" fill={hair} />
          <rect x="21" y="15" width="22" height="2.4" rx="1" fill="#d4af37" />
        </>
      )}
      {headgearType === 3 && (
        <path d="M20.5 21 C20.5 10, 43.5 10, 43.5 21 C40 14, 24 14, 20.5 21 Z" fill={hair} />
      )}
      {/* Role badge in top-left (SVG diamond/shield) */}
      <polygon
        points="8,4 12,8 8,12 4,8"
        fill={role === 'merchant' ? '#fbbf24' : role === 'gang_leader' ? '#ef4444' : '#c6a15b'}
        opacity="0.85"
      />
    </svg>
  );
}

/**
 * Sol dikey menünün altındaki atmosferik mimari sahne illüstrasyonu (`bl-town-menu.jpg` referansı)
 */
function SettlementSceneArtwork({
  settlement,
  activeTab,
  accentColor,
}: {
  settlement: Settlement;
  activeTab: TownTab;
  accentColor: string;
}) {
  const isVillage = settlement.type === 'VILLAGE';
  const isCastle = settlement.type === 'CASTLE';
  const sceneLabel =
    activeTab === 'tavern'
      ? 'Han Bölgesi · Meşaleli Kemerler'
      : activeTab === 'arena'
        ? 'Arena · Gladyatör Kumları'
        : activeTab === 'keep'
          ? 'İç Kale · Divan Avlusu'
          : activeTab === 'smithy'
            ? 'Demirci Ocağı · Çelik ve Örs'
            : isVillage
              ? `${settlement.name} · Kırsal Ocaklar`
              : isCastle
                ? `${settlement.name} · Müstahkem Burçlar`
                : `${settlement.name} · Surlar ve Kemerler`;

  return (
    <div className="relative h-28 w-full border-t-2 border-[#8b6b36]/65 bg-[#0d0a07] overflow-hidden shrink-0">
      <svg viewBox="0 0 360 112" className="w-full h-full block" preserveAspectRatio="none">
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c2116" />
            <stop offset="55%" stopColor="#4a331d" />
            <stop offset="100%" stopColor="#140f0a" />
          </linearGradient>
          <radialGradient id="sunGlow" cx="0.72" cy="0.35" r="0.45">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="360" height="112" fill="url(#skyGrad)" />
        <rect width="360" height="112" fill="url(#sunGlow)" />
        {/* Distant hills */}
        <path d="M0 84 Q75 56 160 76 T360 66 L360 112 L0 112 Z" fill="#1e160f" />
        {/* Architectural Silhouette based on settlement type */}
        {isVillage ? (
          <>
            {/* Village cottages, waterwheel & wheat fields */}
            <path d="M25 84 L48 64 L71 84 L71 102 L25 102 Z" fill="#15100b" stroke="#6b532e" strokeWidth="1" />
            <path d="M90 86 L118 66 L146 86 L146 104 L90 104 Z" fill="#120d09" stroke="#6b532e" strokeWidth="1" />
            <circle cx="242" cy="82" r="14" fill="none" stroke="#8b6b36" strokeWidth="1.5" />
            <path d="M200 94 Q280 86 360 96 L360 112 L0 112 L0 94 Z" fill="#0d0a07" />
          </>
        ) : (
          <>
            {/* Battlements, Stone Archways, and Towers matching bl-town-menu.jpg */}
            <rect x="18" y="34" width="42" height="72" fill="#15100c" stroke="#5c4628" strokeWidth="1" />
            <path d="M16 34 H24 V28 H30 V34 H38 V28 H44 V34 H52 V28 H60 V34" fill="#15100c" />
            <rect x="60" y="48" width="160" height="58" fill="#120e0a" />
            {/* Grand Aqueduct / Gate Arches */}
            <path d="M78 104 V68 A16 16 0 0 1 110 68 V104 Z" fill="#2a1d12" />
            <path d="M126 104 V64 A20 20 0 0 1 166 64 V104 Z" fill="#332315" />
            <path d="M182 104 V68 A16 16 0 0 1 214 68 V104 Z" fill="#2a1d12" />
            {/* Citadel Tower on Right */}
            <rect x="236" y="24" width="56" height="82" fill="#16110c" stroke="#6e532e" strokeWidth="1" />
            <polygon points="232,24 264,8 296,24" fill="#1f1710" />
            {/* Faction Banner Hanging from Tower */}
            <rect x="259" y="34" width="10" height="26" fill={accentColor} stroke="#d4af37" strokeWidth="0.8" />
            {/* Warm Torchlight Dots */}
            <circle cx="94" cy="78" r="2.2" fill="#fbbf24" />
            <circle cx="146" cy="74" r="2.6" fill="#f59e0b" />
            <circle cx="198" cy="78" r="2.2" fill="#fbbf24" />
          </>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 px-3 py-1 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between text-[10px] text-[#d6c6a5]">
        <span className="font-display tracking-wider uppercase">{sceneLabel}</span>
        <span className="font-mono text-[#c6a15b]">
          {settlement.type === 'TOWN' ? 'Şehir' : settlement.type === 'CASTLE' ? 'Kale' : 'Köy'}
        </span>
      </div>
    </div>
  );
}

interface SettlementModalProps {
  settlement: Settlement;
  campaign: CampaignState;
  onClose: () => void;
  onRecruit: (settlementId: string, unitId: UnitTierId, amount: number) => string | null;
  onRecruitBatch?: (
    settlementId: string,
    recruits: Array<{ troopId: string; cost: number; slotKey?: string }>,
  ) => string | null;
  onBuyFood: (settlementId: string, packs: number) => string | null;
  onStartSiegeBattle: (settlement: Settlement) => void;
  onHireMercenaries?: (settlementId: string) => string | null;
  onRansomPrisoners?: (settlementId: string) => string | null;
  onBuyTavernRound?: (settlementId: string) => string | null;
  onArenaPractice?: (settlementId: string) => string | null;
  onArenaTournament?: (settlementId: string) => { victory: boolean; message: string };
  onSellLoot?: (settlementId: string) => string | null;
  onManageGarrison?: (
    settlementId: string,
    unitId: UnitTierId,
    direction: 'deposit' | 'withdraw',
    amount: number,
  ) => string | null;
  onRestAndRecover?: (settlementId: string) => string | null;
  onRaidVillage?: (villageId: string) => string | null;
  onForceSupplies?: (villageId: string) => string | null;
  onForceRecruits?: (villageId: string) => string | null;
  onUpgradeBuilding?: (settlementId: string, buildingId: BuildingProjectId) => string | null;
  onSetDailyDefault?: (settlementId: string, defaultType: SettlementDailyDefault) => string | null;
  onBuyWorkshop?: (settlementId: string, workshopType: WorkshopTypeId) => string | null;
  onForgeWeapon?: (settlementId: string, blueprintId: 'SPATHA' | 'FALX' | 'LANCE') => string | null;
  onBuildSiegeEngine?: (
    settlementId: string,
    engineType: SiegeEngineType,
    moveToReserve?: boolean,
  ) => string | null;
  onDeployReserveEngines?: (settlementId: string) => string | null;
  onBombardWalls?: (settlementId: string, target: SiegeBombardTarget) => string | null;
  onResolveNotableQuest?: (
    settlementId: string,
    notableId: string,
    goldGain: number,
    renownGain: number,
    relationGain: number,
    summaryText: string,
  ) => void;
  onOpenFullMarket?: () => void;
  /** Faz 6: yerleşim reisi/muhtarı ile diyalog. */
  onTalkToReeve?: () => void;
  onOpenCharacterArena?: () => void;
  /** Oyuncu kale veya şehri kuşatmaya başladığında harita kuşatma kampını ve krallık savaşını başlatır. */
  onBeginSiege?: (settlement: Settlement) => void;
  /** Başlangıç sekmesi (probe'lar ve hızlı erişim için). */
  initialTab?: TownTab;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  settlement,
  campaign,
  onClose,
  onRecruit,
  onRecruitBatch,
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
  onResolveNotableQuest,
  onOpenFullMarket,
  onTalkToReeve,
  onOpenCharacterArena: _onOpenCharacterArena,
  onBeginSiege,
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<TownTab>(initialTab);
  /** Faz 8: muhtarla ilişki — asker toplama kapısı ve ücret indirimi. */
  const factionRelation = (() => {
    const lords = campaign.lords.filter((l) => l.faction === settlement.faction);
    if (lords.length === 0) return 0;
    return Math.round(lords.reduce((a, l) => a + l.relation, 0) / lords.length);
  })();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [siegeBombardTarget, setSiegeBombardTarget] =
    useState<SiegeBombardTarget>('WALL_LEFT');
  const [selectedNotableId, setSelectedNotableId] = useState<string | null>(null);
  const [hoveredNotableId, setHoveredNotableId] = useState<string | null>(null);
  const [resolvedNotableIds, setResolvedNotableIds] = useState<Set<string>>(() => new Set());
  const [isRecruitmentModalOpen, setIsRecruitmentModalOpen] = useState(false);
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

  const selectedNotable = React.useMemo(
    () => notables.find((n) => n.id === selectedNotableId) ?? null,
    [notables, selectedNotableId],
  );

  // Günlük yerleşim istatistikleri ve (+/-) kırılımları
  const dailyStats = React.useMemo(
    () => calculateSettlementDailyStats(settlement, campaign),
    [settlement, campaign],
  );

  const villageProd = React.useMemo(
    () => (isVillage ? getVillagePrimaryProduction(settlement) : null),
    [isVillage, settlement],
  );

  // Yerleşim içinde/yakınında bulunan lord partileri (sol üst barın altındaki minyatür portre şeridi için)
  const presentLords = React.useMemo(
    () =>
      campaign.lords
        .filter((l) => l.faction !== 'bandits' && Math.hypot(l.x - settlement.x, l.z - settlement.z) <= 22)
        .slice(0, 5),
    [campaign.lords, settlement.x, settlement.z],
  );

  // Faz B0: çuvaldaki ticari emtia (satılabilir ganimet) ve toplam değeri.
  const lootGoods = React.useMemo(
    () => (campaign.inventoryItems ?? []).filter((i) => i.slot === 'TRADE' && i.category === 'FOOD'),
    [campaign.inventoryItems],
  );
  const lootValue = lootGoods.reduce((sum, item) => sum + Math.max(1, Math.round(item.value)), 0);

  // Tab Action Handlers
  const handleRecruitClick = (unitId: UnitTierId, amount = 1) => {
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

  const handleFoodClick = () => {
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

  const handleSellLootClick = () => {
    if (onSellLoot) {
      const err = onSellLoot(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playCoinChime();
        setFeedback('Çuvaldaki emtia pazara satıldı.');
      }
    }
  };

  const handleHireMercenaries = () => {
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

  const handleRansom = () => {
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

  const handleTavernRound = () => {
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

  const handleArenaPractice = () => {
    if (onArenaPractice) {
      const err = onArenaPractice(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        sound.playSwordSwing();
        setFeedback('Talim dövüşünde rakiplerinizi mağlup ettiniz (+25 Dinar).');
      }
    }
  };

  const handleArenaTournament = () => {
    if (onArenaTournament) {
      sound.playSettlementEnter();
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

  const handleRestRecover = () => {
    if (onRestAndRecover) {
      const err = onRestAndRecover(settlement.id);
      if (err) {
        setFeedback(err);
      } else {
        setFeedback('Ordugah kuruldu, yaralılar tedavi edildi ve dinlenildi (+6 Moral, Sağlık Tazelendi).');
      }
    }
  };

  const handleGarrisonTransfer = (unitId: UnitTierId, dir: 'deposit' | 'withdraw') => {
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

  const handleRaid = () => {
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

  const handleForceSupplies = () => {
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

  const handleForceRecruits = () => {
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

  const formatDelta = (delta: number) => (delta >= 0 ? `(+${delta})` : `(${delta})`);
  const deltaClass = (delta: number) =>
    delta > 0 ? 'text-[#4ade80]' : delta < 0 ? 'text-[#f87171]' : 'text-[#a89b84]';

  // 6 slotluk sağ üst portre dizisi (Eksik slotlar boş çerçeve olarak gösterilir, tıpkı Bannerlord gibi)
  const portraitSlots = Array.from({ length: 6 }, (_, i) => notables[i] ?? null);

  return (
    <div
      data-testid="settlement-modal"
      className="fixed inset-0 z-30 flex flex-col justify-between pointer-events-none select-none"
      style={{
        background:
          'linear-gradient(90deg, rgba(8,7,5,0.76) 0%, rgba(8,7,5,0.28) 32%, rgba(8,7,5,0.0) 64%), linear-gradient(180deg, rgba(8,7,5,0.82) 0%, rgba(8,7,5,0.0) 115px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-modal-title"
    >
      {/* ═════════════════════════════════════════════════════════════════════════
          1. TOP BANNERLORD BAR: LEFT SETTLEMENT STATS + RIGHT 6 NOTABLE PORTRAITS
         ═════════════════════════════════════════════════════════════════════════ */}
      <div className="w-full px-3 pt-2 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        {/* TOP-LEFT: Faction Shield + Settlement Name + 6 Stat Columns + Present Lords Sub-Bar */}
        <div className="flex flex-col pointer-events-auto" data-testid="settlement-top-stats">
          <div className="flex items-center bg-[#120f0b]/95 border-2 border-[#8b6b36] rounded-sm shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
            {/* Faction Shield & Settlement Name */}
            <div className="flex items-center gap-2.5 px-3.5 py-2 border-r border-[#8b6b36]/55 bg-gradient-to-r from-[#1f1912] to-[#15110c]">
              <div
                style={{ backgroundColor: factionInfo.color }}
                className="w-9 h-11 flex items-center justify-center border-2 border-[#fcd34d] shadow-md shrink-0 text-[#fde68a]"
                title={factionInfo.emblemName}
              >
                <FactionCrest faction={settlement.faction} size={22} className="border-0 shadow-none" />
              </div>
              <div>
                <div className="text-[10px] text-[#c6a15b] uppercase tracking-wider font-semibold">
                  {isTown ? 'Ticaret Şehri' : isCastle ? 'Müstahkem Kale' : 'Kırsal Köy'} · {factionInfo.name}
                </div>
                <h2
                  id="settlement-modal-title"
                  className="text-xl font-display font-extrabold text-[#f7eed7] tracking-wide leading-tight"
                >
                  {settlement.name}
                </h2>
              </div>
            </div>

            {/* 6 STAT COLUMNS (TOWN / CASTLE) OR VILLAGE STATS */}
            {!isVillage ? (
              <div className="flex items-center divide-x divide-[#8b6b36]/30 px-1">
                {/* 1. Sur Seviyesi */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#c6a15b]" aria-hidden="true">
                      <path d="M2 3h2v2h2V3h4v2h2V3h2v11H2V3zm4 6v5h4V9a2 2 0 00-4 0z" />
                    </svg>
                    <span>{dailyStats.wallLevel}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#a89b84]">
                    Sv.{dailyStats.wallLevel}
                  </span>
                  <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-52 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Sur Seviyesi (Seviye {dailyStats.wallLevel})
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a89b84]">Toplam Sur Dayanımı:</span>
                      <span className="font-mono text-[#4ade80]">{dailyStats.wallMaxHp} HP</span>
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[#a89b84]">Mevcut Durum:</span>
                      <span className="font-mono text-[#fde68a]">%{settlement.wallHealth ?? 100}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Refah (Prosperity) */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#fde68a] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fbbf24]" aria-hidden="true">
                      <circle cx="8" cy="8" r="3.5" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" stroke="#fbbf24" strokeWidth="1.4" />
                    </svg>
                    <span>{dailyStats.prosperity.value}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${deltaClass(dailyStats.prosperity.delta)}`}>
                    {formatDelta(dailyStats.prosperity.delta)}
                  </span>
                  <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Refah: {dailyStats.prosperity.value}
                    </div>
                    {dailyStats.prosperity.lines.map((l, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-[#d1c5b0]">{l.label}</span>
                        <span className={`font-mono ${l.positive ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {l.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Milis (Militia) */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#c6a15b]" strokeWidth="1.6" aria-hidden="true">
                      <path d="M2.5 13.5L13.5 2.5M10 2.5h3.5V6M13.5 13.5L2.5 2.5M6 2.5H2.5V6" />
                    </svg>
                    <span>{dailyStats.militia.value}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${deltaClass(dailyStats.militia.delta)}`}>
                    {formatDelta(dailyStats.militia.delta)}
                  </span>
                  <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Milis Gücü: {dailyStats.militia.value}
                    </div>
                    {dailyStats.militia.lines.map((l, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-[#d1c5b0]">{l.label}</span>
                        <span className={`font-mono ${l.positive ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {l.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Sadakat (Loyalty) */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#f59e0b]" aria-hidden="true">
                      <path d="M2 12l1.2-6.5L6 8.5 8 3.5l2 5 2.8-3L14 12H2zm0 1.2h12v1.3H2v-1.3z" />
                    </svg>
                    <span>{dailyStats.loyalty.value}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${deltaClass(dailyStats.loyalty.delta)}`}>
                    {formatDelta(dailyStats.loyalty.delta)}
                  </span>
                  <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Sadakat: {dailyStats.loyalty.value}
                    </div>
                    {dailyStats.loyalty.lines.map((l, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-[#d1c5b0]">{l.label}</span>
                        <span className={`font-mono ${l.positive ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {l.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Garnizon (Garrison) */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#93c5fd]" aria-hidden="true">
                      <path d="M8 1.5L2.5 3.8v4.4c0 3.5 2.3 6.6 5.5 7.4 3.2-.8 5.5-3.9 5.5-7.4V3.8L8 1.5z" />
                    </svg>
                    <span>{dailyStats.garrison.value}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${deltaClass(dailyStats.garrison.delta)}`}>
                    {formatDelta(dailyStats.garrison.delta)}
                  </span>
                  <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Garnizon: {dailyStats.garrison.value} Asker
                    </div>
                    {dailyStats.garrison.lines.map((l, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-[#d1c5b0]">{l.label}</span>
                        <span className="font-mono text-[#fde68a]">{l.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 6. Erzak (Food) */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#34d399]" aria-hidden="true">
                      <path d="M8 2c1.8 2 2.5 4.2 2.5 6.5S9.5 13 8 14.5C6.5 13 5.5 10.8 5.5 8.5S6.2 4 8 2z" />
                    </svg>
                    <span>{dailyStats.food.value}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${deltaClass(dailyStats.food.delta)}`}>
                    {formatDelta(dailyStats.food.delta)}
                  </span>
                  <div className="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Erzak Ambarı: {dailyStats.food.value}
                    </div>
                    {dailyStats.food.lines.map((l, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-[#d1c5b0]">{l.label}</span>
                        <span className={`font-mono ${l.positive ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {l.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7. Güvenlik (Security) */}
                <div className="relative group px-3 py-1.5 flex flex-col items-center justify-center cursor-help">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#e2e8f0]" strokeWidth="1.4" aria-hidden="true">
                      <path d="M8 2v12M3 5h10M4 5l-2 4h4L4 5zm8 0l-2 4h4l-2-4zM5 14h6" />
                    </svg>
                    <span>{dailyStats.security.value}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${deltaClass(dailyStats.security.delta)}`}>
                    {formatDelta(dailyStats.security.delta)}
                  </span>
                  <div className="hidden group-hover:block absolute top-full right-0 mt-1.5 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/70 shadow-2xl text-[11px] text-[#f3ead8] pointer-events-none">
                    <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                      Güvenlik: {dailyStats.security.value}
                    </div>
                    {dailyStats.security.lines.map((l, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-[#d1c5b0]">{l.label}</span>
                        <span className={`font-mono ${l.positive ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {l.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* VILLAGE STATS STRIP (100% SVG icons, no emojis) */
              <div className="flex items-center divide-x divide-[#8b6b36]/30 px-1">
                <div className="px-3 py-1.5 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#fde68a] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#f97316]" aria-hidden="true">
                      <path d="M8.5 1.5C9.5 4 12 5.5 12 9a4 4 0 01-8 0c0-2 1-3.5 2-4.5.2 1.2 1 1.8 1.5 2-.2-2 .5-3.8 1-5z" />
                    </svg>
                    <span>{settlement.hearths ?? Math.round(settlement.prosperity * 1.15)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#4ade80]">(+1 Ocak)</span>
                </div>
                <div className="px-3 py-1.5 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fbbf24]" aria-hidden="true">
                      <circle cx="8" cy="8" r="3.5" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" stroke="#fbbf24" strokeWidth="1.4" />
                    </svg>
                    <span>{settlement.prosperity}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#4ade80]">(+2 Refah)</span>
                </div>
                <div className="px-3 py-1.5 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#f5ebd6] font-mono-tabular">
                    <Swords size={13} className="text-[#c6a15b]" />
                    <span>{dailyStats.militia.value}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#a89b84]">Milis</span>
                </div>
                <div className="px-3 py-1.5 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-xs font-bold text-[#86efac]">
                    <Wheat size={13} className="text-[#86efac]" />
                    <span>{villageProd?.name ?? 'Tahıl'}</span>
                  </div>
                  <span className="text-[10px] text-[#a89b84]">Birincil Üretim</span>
                </div>
                {settlement.boundSettlementName && (
                  <div className="px-3 py-1.5 flex flex-col items-center">
                    <div className="flex items-center gap-1 text-xs font-bold text-[#fde68a]">
                      <Castle size={13} className="text-[#c6a15b]" />
                      <span>{settlement.boundSettlementName}</span>
                    </div>
                    <span className="text-[10px] text-[#a89b84]">Bağlı Mülk</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SUB-BAR UNDER TOP-LEFT STATS: Present Lord Parties & Town Workshops (quest_blue_exclamation.jpg) */}
          <div className="flex items-center gap-2 mt-1 pl-2">
            {presentLords.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-b border border-t-0 border-[#8b6b36]/60 bg-[#14100b]/90 text-[10px] text-[#e7d8b9] shadow">
                <span className="text-[#c6a15b] font-semibold">Garnizondaki Sancaklar:</span>
                {presentLords.map((l) => (
                  <span
                    key={l.id}
                    title={`${l.title} ${l.name} (${l.armySize} Asker)`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#231c14] border border-[#c6a15b]/35 text-[#fde68a]"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: l.bannerColor }}
                    />
                    <span>{l.name}</span>
                  </span>
                ))}
              </div>
            )}
            {isTown && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-b border border-t-0 border-[#8b6b36]/50 bg-[#14100b]/85 text-[10px] text-[#d1c5b0]">
                <Hammer size={11} className="text-[#c6a15b]" />
                <span>Atölyeler:</span>
                <span className="text-[#fde68a] font-semibold">
                  {settlement.workshopType && settlement.workshopType !== 'NONE'
                    ? `${settlement.workshopType} (Sizin)`
                    : 'Bira · Demirhane · Dokuma'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* TOP-RIGHT: 6 NOTABLE / COMPANION PORTRAIT CARDS WITH BLUE '!' QUEST BADGES & HOVER TOOLTIPS */}
        <div
          data-testid="settlement-notables-bar"
          className="flex items-stretch bg-[#120f0b]/95 border-2 border-[#8b6b36] rounded-sm p-1 gap-1 shadow-[0_10px_28px_rgba(0,0,0,0.9)] pointer-events-auto"
        >
          <span className="sr-only">İleri Gelenler:</span>
          {portraitSlots.map((n, idx) => {
            if (!n) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="w-[74px] h-[74px] rounded-sm border border-[#8b6b36]/25 bg-[#0c0a07]/80 flex flex-col items-center justify-center opacity-50"
                >
                  <div className="w-7 h-7 rounded-full border border-[#8b6b36]/20 bg-[#17130e]" />
                </div>
              );
            }

            const hasRawIssue = n.power >= NOTABLE_POWER_INFLUENTIAL || idx === 1;
            const isResolved = resolvedNotableIds.has(n.id);
            const hasIssue = hasRawIssue && !isResolved;
            const isSelected = selectedNotableId === n.id;
            const powerLabel = notablePowerLabel(n.power);
            const attitudeLabel =
              n.relation >= 15 ? 'Dost' : n.relation <= -10 ? 'Mesafeli' : 'Tarafsız';
            const propertyDesc =
              n.role === 'merchant' || n.role === 'horseTrader'
                ? `${settlement.name} içerisinde 1 kervansarayın sahibi`
                : n.role === 'smith'
                  ? `${settlement.name} içerisinde 1 darphanenin sahibi`
                  : n.role === 'gladiator' || n.role === 'tavernkeeper'
                    ? `${settlement.name} arka sokaklarının hakimi`
                    : `${settlement.name} eşraf meclisi üyesi`;

            return (
              <div
                key={n.id}
                className="relative group"
                onMouseEnter={() => setHoveredNotableId(n.id)}
                onMouseLeave={() => setHoveredNotableId((prev) => (prev === n.id ? null : prev))}
              >
                <button
                  type="button"
                  data-testid={`notable-portrait-${n.id}`}
                  onMouseEnter={() => setHoveredNotableId(n.id)}
                  onMouseLeave={() => setHoveredNotableId((prev) => (prev === n.id ? null : prev))}
                  onClick={() => {
                    setSelectedNotableId((prev) => (prev === n.id ? null : n.id));
                    setFeedback(null);
                  }}
                  className={`w-[78px] h-[74px] rounded-sm border flex flex-col overflow-hidden transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#fde68a] ring-2 ring-[#fbbf24]/60 bg-[#2b2115]'
                      : 'border-[#8b6b36]/60 bg-[#17130e] hover:border-[#fde68a]'
                  }`}
                >
                  <div className="relative w-full h-[54px] overflow-hidden bg-[#120e0a]">
                    <NotablePortraitBust
                      seedId={n.id}
                      name={n.name}
                      role={n.role}
                      accentColor={factionInfo.color}
                    />
                    {hasIssue && (
                      <span
                        data-testid={`notable-quest-badge-${n.id}`}
                        title="Mevcut bir sorunu var (Görev)"
                        className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-cyan-400 text-black font-extrabold flex items-center justify-center text-[11px] shadow-[0_0_8px_rgba(34,211,238,0.9)] border border-white/80"
                      >
                        !
                      </span>
                    )}
                  </div>
                  <div className="w-full h-[20px] px-1 bg-[#0e0b08] border-t border-[#8b6b36]/40 flex items-center justify-center">
                    <span className="text-[9.5px] font-semibold text-[#e7d8b9] truncate">
                      {n.name}
                    </span>
                  </div>
                </button>

                {/* AUTHENTIC BANNERLORD NOTABLE HOVER TOOLTIP (quest_blue_exclamation.jpg) */}
                <div
                  data-testid={`notable-tooltip-${n.id}`}
                  className={`${
                    hoveredNotableId === n.id ? 'block' : 'hidden group-hover:block'
                  } absolute top-full right-0 mt-1.5 z-50 w-64 p-3 rounded-sm bg-[#0d0b08]/95 border-2 border-[#8b6b36] shadow-[0_16px_40px_rgba(0,0,0,0.95)] text-[11px] text-[#e7d8b9] pointer-events-none`}
                >
                  <div className="font-display font-bold text-sm text-[#fbbf24] border-b border-[#8b6b36]/40 pb-1 mb-1.5">
                    {n.name}
                  </div>
                  {hasIssue && (
                    <div className="text-cyan-300 font-semibold mb-0.5">
                      Mevcut bir sorunu var
                    </div>
                  )}
                  <div className="text-[#d1c5b0] mb-0.5">{attitudeLabel}</div>
                  <div className="text-[#b8a990] text-[10px] mb-2">{propertyDesc}</div>
                  <div className="space-y-0.5 border-t border-[#8b6b36]/30 pt-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#a89b84]">İlişki:</span>
                      <span className="font-mono font-bold text-[#f5ebd6]">{n.relation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a89b84]">Ana Sayfa:</span>
                      <span className="font-semibold text-[#fde68a]">{settlement.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a89b84]">Güç:</span>
                      <span className="font-mono text-[#f5ebd6]">
                        {powerLabel} ({n.power})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a89b84]">Tür:</span>
                      <span className="text-[#f5ebd6]">{n.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#a89b84]">Yer:</span>
                      <span className="text-[#d1c5b0]">
                        {activeTab === 'tavern' ? 'Han' : activeTab === 'keep' ? 'Avlu' : 'Merkez'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Far-Right '+' Collapse/Info Button matching Bannerlord */}
          <button
            type="button"
            onClick={() => {
              const firstWithIssue = notables.find(
                (n, idx) => (n.power >= NOTABLE_POWER_INFLUENTIAL || idx === 1) && !resolvedNotableIds.has(n.id),
              );
              const pick = firstWithIssue ?? notables[0] ?? null;
              if (pick) setSelectedNotableId(pick.id);
            }}
            title="Eşraf & Görev Özeti"
            className="w-7 rounded-sm border border-[#8b6b36]/50 bg-[#1a150f] hover:bg-[#2a2117] text-[#c6a15b] font-bold text-sm flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════
          2. MIDDLE WORKSPACE: LEFT VERTICAL BANNERLORD MENU + SUB-PANEL DRAWER
         ═════════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex items-stretch gap-3 px-3 my-2 min-h-0 pointer-events-none">
        {/* LEFT VERTICAL BANNERLORD MENU PANEL (~368px) */}
        <div
          data-testid="settlement-left-menu"
          className="w-[368px] max-h-[calc(100vh-145px)] flex flex-col justify-between rounded-sm border-2 border-[#8b6b36] bg-[#110e0a]/95 text-[#f3ead8] shadow-[0_20px_55px_rgba(0,0,0,0.95)] overflow-hidden pointer-events-auto shrink-0"
        >
          {/* Top Atmospheric Prose & Active Notable Speech Card */}
          <div className="overflow-y-auto flex-1 flex flex-col">
            <div className="p-3.5 border-b border-[#8b6b36]/40 bg-gradient-to-b from-[#1c1610] to-[#120e0a]">
              <p className="text-xs text-[#dfd3bc] leading-relaxed">
                {settlement.description}{' '}
                <span className="text-[#a89b84]">
                  {isVillage
                    ? `(${factionInfo.name} sancağı altında; milis kıtasında ${dailyStats.militia.value} köylü muhafız, ambarda ${settlement.foodStock} sandık erzak bulunuyor.)`
                    : `(${factionInfo.name} sancağı altında; garnizonda ${settlement.garrison} muhafız, ambarda ${settlement.foodStock} sandık erzak bulunuyor.)`}
                </span>
              </p>

              {feedback && (
                <div
                  data-testid="settlement-feedback"
                  className="mt-2.5 px-3 py-2 rounded bg-[#292014] border border-[#f59e0b]/60 text-xs text-[#fde68a] shadow"
                >
                  {feedback}
                </div>
              )}
            </div>

            {/* Selected Notable Speech & Issue Resolution Card */}
            {selectedNotable && (
              <NotableSpeechCard
                notable={selectedNotable}
                onClose={() => setSelectedNotableId(null)}
                issueQuest={
                  selectedNotable.power >= NOTABLE_POWER_INFLUENTIAL ||
                  notables.findIndex((n) => n.id === selectedNotable.id) === 1
                    ? getNotableIssueQuest(selectedNotable, settlement)
                    : null
                }
                issueResolved={resolvedNotableIds.has(selectedNotable.id)}
                onResolveIssue={() => {
                  const q = getNotableIssueQuest(selectedNotable, settlement);
                  setResolvedNotableIds((prev) => new Set(prev).add(selectedNotable.id));
                  const summary = `${selectedNotable.name} (${settlement.name}) sorunu çözüldü: +${q.relationReward} İlişki, +${q.goldReward} Dinar, +${q.renownReward} Nam!`;
                  if (onResolveNotableQuest) {
                    onResolveNotableQuest(
                      settlement.id,
                      selectedNotable.id,
                      q.goldReward,
                      q.renownReward,
                      q.relationReward,
                      summary,
                    );
                  } else {
                    sound.playCoinChime();
                  }
                  setFeedback(summary);
                }}
              />
            )}

            {/* BANNERLORD VERTICAL ACTION ROWS */}
            <div className="divide-y divide-[#8b6b36]/25 text-[13px]">
              {/* ŞEHİR (TOWN) ANA EYLEMLERİ */}
              {isTown && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (onTalkToReeve) onTalkToReeve();
                      else setFeedback(`${settlement.name} sokaklarında devriye gezdiniz; esnaf ve nöbetçiler sancağınızı selamladı.`);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] text-[#f3ead8] transition-colors"
                  >
                    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.6" aria-hidden="true">
                      <path d="M3 12V7a4 4 0 014-4h5M9 1l3 2-3 2" />
                    </svg>
                    <span className="font-semibold">Şehir merkezinde yürüyüşe çık</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeTab === 'keep' ? 'overview' : 'keep');
                      setFeedback(null);
                    }}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#241c13] transition-colors ${
                      activeTab === 'keep' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-[#c6a15b]" aria-hidden="true">
                        <path d="M2 3h2v2h2V3h4v2h2V3h2v11H2V3zm4 6v5h4V9a2 2 0 00-4 0z" />
                      </svg>
                      <span className="font-semibold">Avluya git (Kale)</span>
                    </span>
                    <span className="text-[10px] text-[#a89b84]">Divan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeTab === 'arena' ? 'overview' : 'arena');
                      setFeedback(null);
                    }}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#241c13] transition-colors ${
                      activeTab === 'arena' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.6" aria-hidden="true">
                        <path d="M2.5 13.5L13.5 2.5M10 2.5h3.5V6M13.5 13.5L2.5 2.5M6 2.5H2.5V6" />
                      </svg>
                      <span className="font-semibold">Arenaya git</span>
                    </span>
                    <span className="text-[10px] text-[#fbbf24]">Turnuva</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeTab === 'tavern' ? 'overview' : 'tavern');
                      setFeedback(null);
                    }}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#241c13] transition-colors ${
                      activeTab === 'tavern' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.5" aria-hidden="true">
                        <path d="M3 4h7v8a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm7 2h2a1.5 1.5 0 010 3h-2" />
                      </svg>
                      <span className="font-semibold">Han bölgesine git</span>
                    </span>
                    <span className="text-[10px] text-[#a89b84]">Paralı Asker & Fidye</span>
                  </button>
                </>
              )}

              {/* KALE (CASTLE) ANA EYLEMLERİ */}
              {isCastle && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeTab === 'keep' ? 'overview' : 'keep');
                      setFeedback(null);
                    }}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] transition-colors ${
                      activeTab === 'keep' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-[#c6a15b]" aria-hidden="true">
                      <path d="M2 3h2v2h2V3h4v2h2V3h2v11H2V3zm4 6v5h4V9a2 2 0 00-4 0z" />
                    </svg>
                    <span className="font-semibold">Avluya git (İç Kale)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeTab === 'dungeon' ? 'overview' : 'dungeon');
                      setFeedback(null);
                    }}
                    className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] transition-colors ${
                      activeTab === 'dungeon' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.5" aria-hidden="true">
                      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
                      <path d="M6 2.5v11M10 2.5v11M2.5 8h11" />
                    </svg>
                    <span className="font-semibold">Zindana git</span>
                  </button>

                  {isPlayerOwned && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(activeTab === 'garrison' ? 'overview' : 'garrison');
                        setFeedback(null);
                      }}
                      className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] transition-colors ${
                        activeTab === 'garrison' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                      }`}
                    >
                      <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-[#c6a15b]" aria-hidden="true">
                        <path d="M8 1.5L2.5 3.8v4.4c0 3.5 2.3 6.6 5.5 7.4 3.2-.8 5.5-3.9 5.5-7.4V3.8L8 1.5z" />
                      </svg>
                      <span className="font-semibold">Garnizonu yönet</span>
                    </button>
                  )}
                </>
              )}

              {/* KÖY (VILLAGE) ANA EYLEMLERİ */}
              {isVillage && (
                <button
                  type="button"
                  onClick={() => {
                    if (onTalkToReeve) onTalkToReeve();
                    else if (notables[0]) setSelectedNotableId(notables[0].id);
                  }}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] text-[#f3ead8] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.6" aria-hidden="true">
                    <path d="M3 12V7a4 4 0 014-4h5M9 1l3 2-3 2" />
                  </svg>
                  <span className="font-semibold">Köy meydanında dolaş (Muhtar)</span>
                </button>
              )}

              {/* ASKER TOPLA (TÜM YERLEŞİMLER) */}
              <button
                type="button"
                data-testid="settlement-open-recruitment"
                onClick={() => {
                  setIsRecruitmentModalOpen(true);
                  setFeedback(null);
                }}
                className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#241c13] text-[#f3ead8] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-[#c6a15b]" aria-hidden="true">
                    <circle cx="8" cy="5" r="2.6" />
                    <path d="M3.2 13.5c0-2.5 2.1-4.2 4.8-4.2s4.8 1.7 4.8 4.2H3.2z" />
                  </svg>
                  <span className="font-semibold">Asker topla</span>
                </span>
                <span className="text-[10px] font-mono text-[#34d399]">Gönüllüler</span>
              </button>

              {/* TİCARET / ÜRÜN SATIN AL */}
              {(isTown || isVillage) && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenFullMarket && isTown) {
                      onOpenFullMarket();
                    } else {
                      setActiveTab(activeTab === 'market' ? 'overview' : 'market');
                    }
                    setFeedback(null);
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#241c13] transition-colors ${
                    activeTab === 'market' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-[#c6a15b]" aria-hidden="true">
                      <path d="M6 2h4l-1 2.5 3.5 2A4.5 4.5 0 0110 14H6a4.5 4.5 0 01-2.5-7.5l3.5-2L6 2z" />
                    </svg>
                    <span className="font-semibold">
                      {isVillage ? 'Ürün satın al' : 'Ticaret'}
                    </span>
                  </span>
                  {isVillage && villageProd && (
                    <span className="text-[10px] text-[#86efac] flex items-center gap-1">
                      <Wheat size={11} className="shrink-0" />
                      <span>{villageProd.shortLabel}</span>
                    </span>
                  )}
                </button>
              )}

              {/* DEMİRCİ & ATÖLYELER (ŞEHİR) */}
              {isTown && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(activeTab === 'smithy' ? 'overview' : 'smithy');
                    setFeedback(null);
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] transition-colors ${
                    activeTab === 'smithy' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                  }`}
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.5" aria-hidden="true">
                    <path d="M3 13l6-6M7 4l5 5M5.5 2.5l3 3-2 2-3-3 2-2z" />
                  </svg>
                  <span className="font-semibold">Demirciye gir & Atölyeler</span>
                </button>
              )}

              {/* ŞEHRİ / KALEYİ YÖNET (BİNA PROJELERİ & GÜNLÜK VARSAYILANLAR — YALNIZ OYUNCU MÜLKÜ) */}
              {(isTown || isCastle) && isPlayerOwned && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(activeTab === 'buildings' ? 'overview' : 'buildings');
                    setFeedback(null);
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] transition-colors ${
                    activeTab === 'buildings' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                  }`}
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.4" aria-hidden="true">
                    <path d="M2 6l6-4 6 4M3.5 6v6.5M8 6v6.5M12.5 6v6.5M2 13h12" />
                  </svg>
                  <span className="font-semibold">
                    {isTown ? 'Şehri yönet (Projeler)' : 'Kaleyi yönet (Projeler)'}
                  </span>
                </button>
              )}

              {/* DÜŞMANCA BİR EYLEMDE BULUN (KÖY — YALNIZ YABANCI KÖY) */}
              {isVillage && !isPlayerOwned && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(activeTab === 'hostile' ? 'overview' : 'hostile');
                    setFeedback(null);
                  }}
                  className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#2b1414] transition-colors ${
                    activeTab === 'hostile' ? 'bg-[#451515] text-[#fecaca]' : 'text-[#fca5a5]'
                  }`}
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-[#ef4444]" aria-hidden="true">
                    <path d="M8.5 1.5C9.5 4 12 5.5 12 9a4 4 0 01-8 0c0-2 1-3.5 2-4.5.2 1.2 1 1.8 1.5 2-.2-2 .5-3.8 1-5z" />
                  </svg>
                  <span className="font-semibold">Düşmanca bir eylemde bulun</span>
                </button>
              )}

              {/* KUŞATMA KAMPI (DÜŞMAN ŞEHİR/KALE — TEK KANONİK KUŞATMA GİRİŞİ) */}
              {!isPlayerOwned && !isVillage && (
                <>
                  {onBeginSiege ? (
                    <button
                      type="button"
                      data-testid="settlement-begin-siege-btn"
                      onClick={() => {
                        sound.playSettlementEnter();
                        onBeginSiege(settlement);
                      }}
                      className="w-full px-4 py-2.5 text-left flex items-center justify-between bg-[#2b1212]/90 hover:bg-[#451515] text-[#fecaca] transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#ef4444]" strokeWidth="1.6" aria-hidden="true">
                          <path d="M2.5 13.5L13.5 2.5M10 2.5h3.5V6M13.5 13.5L2.5 2.5M6 2.5H2.5V6" />
                        </svg>
                        <span className="font-bold">Kale / Şehri Kuşat (Kuşatma Kampı Kur)</span>
                      </span>
                      <span className="text-[10px] font-mono text-[#fca5a5]">Savaş İlanı</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="settlement-siege-tab-btn"
                      onClick={() => {
                        setActiveTab(activeTab === 'siege' ? 'overview' : 'siege');
                        setFeedback(null);
                      }}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#2b1414] transition-colors ${
                        activeTab === 'siege' ? 'bg-[#451515] text-[#fecaca]' : 'text-[#fca5a5]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#ef4444]" strokeWidth="1.5" aria-hidden="true">
                          <circle cx="8" cy="8" r="5.5" />
                          <circle cx="8" cy="8" r="2" />
                        </svg>
                        <span className="font-semibold">Kuşatma Silahları &amp; Surlara Taarruz</span>
                      </span>
                      <span className="text-[10px] font-mono text-[#fca5a5]">İstihkâm</span>
                    </button>
                  )}
                </>
              )}

              {/* BİR SÜRE BURADA BEKLE */}
              <button
                type="button"
                onClick={() => {
                  handleRestRecover();
                  setActiveTab('wait');
                }}
                className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-[#241c13] transition-colors ${
                  activeTab === 'wait' ? 'bg-[#2e2316] text-[#fde68a]' : 'text-[#f3ead8]'
                }`}
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.4" aria-hidden="true">
                  <path d="M4 2h8M4 14h8M5 2c0 3 3 4.5 3 6s-3 3-3 6M11 2c0 3-3 4.5-3 6s3 3 3 6" />
                </svg>
                <span className="font-semibold">Bir süre burada bekle</span>
              </button>

              {/* ÇIKIŞ */}
              <button
                type="button"
                data-testid="settlement-leave-btn"
                onClick={onClose}
                aria-label="Yerleşimden ayrıl"
                className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-[#2e1f14] text-[#fde68a] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 fill-none stroke-[#c6a15b]" strokeWidth="1.6" aria-hidden="true">
                    <path d="M13 12V7a4 4 0 00-4-4H4M7 1L4 3l3 2" />
                  </svg>
                  <span className="font-bold">Çıkış</span>
                </span>
                <span className="text-[10px] font-mono text-[#a89b84]">[Esc]</span>
              </button>
            </div>
          </div>

          {/* BOTTOM ARCHITECTURAL SCENE PAINTING (bl-town-menu.jpg) */}
          <SettlementSceneArtwork
            settlement={settlement}
            activeTab={activeTab}
            accentColor={factionInfo.color}
          />
        </div>

        {/* CONTEXTUAL SUB-PANEL DRAWER (OPEN ONLY WHEN A SUB-TAB IS SELECTED — KEEPS 3D MAP VISIBLE!) */}
        {activeTab !== 'overview' && (
          <div
            data-testid={`settlement-subpanel-${activeTab}`}
            className="w-full max-w-xl max-h-[calc(100vh-145px)] flex flex-col rounded-sm border-2 border-[#8b6b36] bg-[#14110c]/95 text-[#f3ead8] shadow-[0_20px_55px_rgba(0,0,0,0.95)] overflow-hidden pointer-events-auto"
          >
            <div className="px-4 py-2.5 border-b border-[#8b6b36]/40 bg-[#1c1610] flex items-center justify-between">
              <span className="font-display font-bold text-sm text-[#fde68a] tracking-wide uppercase">
                {activeTab === 'keep' && 'Kalenin İç Avlusu ve Divanhane'}
                {activeTab === 'market' && (isVillage ? 'Köy Ambarı ve Ürün Satın Alımı' : 'Şehir Pazaryeri ve Ticaret')}
                {activeTab === 'tavern' && 'Han Bölgesi (Paralı Asker, Fidyeci ve Hancı)'}
                {activeTab === 'arena' && 'Arena ve Turnuva Meydanı'}
                {activeTab === 'smithy' && 'Demirci Ocağı ve Şehir Atölyeleri'}
                {activeTab === 'buildings' && 'Mülk Yönetimi, Bina Projeleri ve Politikalar'}
                {activeTab === 'garrison' && 'Garnizon Savunma Yönetimi'}
                {activeTab === 'dungeon' && 'Kale Zindanı'}
                {activeTab === 'hostile' && 'Düşmanca Eylemler'}
                {activeTab === 'wait' && 'Yerleşimde Dinlenme ve Ordugah'}
                {activeTab === 'siege' && `Kuşatma Kampı: ${settlement.name}`}
                {activeTab === 'recruit' && 'Hızlı Asker Devşirme'}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="px-2.5 py-1 rounded text-xs font-bold bg-[#282016] hover:bg-[#3a2e20] text-[#fde68a] border border-[#8b6b36]/50"
              >
                ↩ Geri
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* KEEP TAB */}
              {activeTab === 'keep' && (
                <div className="space-y-3">
                  <p className="text-[#d1c5b0] leading-relaxed">
                    Şehrin yüksek burçları ardındaki taş salonda bölge soyluları, kumandanlar ve leydiler toplanır.
                  </p>
                  <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-[#f8f0df]">Divana Kabul Edilme Talebi</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        {settlement.faction === 'empire' ? 'İmparatoriçe Rhagaea Divanı' : `${factionInfo.name} Divanı`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playWarhorn();
                        if (onTalkToReeve) onTalkToReeve();
                        else setFeedback('Nöbetçiler divan kapısını açtı. Şehir hakimi huzuruna kabul edildiniz.');
                      }}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                    >
                      Huzura Çık
                    </button>
                  </div>
                </div>
              )}

              {/* MARKET TAB */}
              {activeTab === 'market' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {onOpenFullMarket && (
                      <button
                        type="button"
                        onClick={onOpenFullMarket}
                        className="px-4 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 shadow flex items-center gap-2"
                      >
                        <Scale size={14} strokeWidth={1.7} />
                        <span>Tam Ekran Pazaryeri & Envanter Arayüzü</span>
                      </button>
                    )}
                    {onTalkToReeve && (
                      <button
                        type="button"
                        onClick={onTalkToReeve}
                        className="px-3 py-2 rounded text-xs font-bold bg-[#241c12] hover:bg-[#362a1c] text-[#fde68a] border border-[#c6a15b]/40"
                      >
                        Muhtar / Reis ile Konuş
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-sm text-[#34d399]">Ordu Erzağı Satın Al (+5 Erzak)</div>
                        <div className="text-xs text-[#a89b84] mt-1">
                          Pazarda mevcut: <span className="font-mono font-bold text-white">{settlement.foodStock}</span> sandık
                        </div>
                        <div className="text-xs text-[#fbbf24] mt-0.5">
                          Fiyat: {isVillage ? '18 Dinar (Köy İndirimi)' : '30 Dinar (Şehir Tarifesi)'}
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

                    {isTown && (
                      <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-sm text-[#fbbf24]">Ganimet ve Fazlalıkları Sat</div>
                          <div className="text-xs text-[#34d399] mt-1">
                            {lootGoods.length > 0
                              ? `Çuvalda ${lootGoods.length} kalem emtia · Gelir: +${lootValue} Dinar`
                              : 'Çuvalda satılacak emtia yok'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleSellLootClick}
                          disabled={lootGoods.length === 0}
                          className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40 transition-colors"
                        >
                          {lootGoods.length > 0 ? `Ganimeti Sat (+${lootValue} Dinar)` : 'Ganimeti Sat'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAVERN TAB */}
              {activeTab === 'tavern' && (
                <div className="space-y-3">
                  <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Paralı Asker Bölüğü Kirala (4 Asker)</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        2 Kıdemli Paralı Süvari + 2 Usta Paralı Okçu sancağınıza katılır.
                      </div>
                      <div className="text-xs text-[#fbbf24] mt-0.5">Ücret: 120 Dinar</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleHireMercenaries}
                      disabled={campaign.gold < 120}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40 whitespace-nowrap"
                    >
                      Kirala (120 Dinar)
                    </button>
                  </div>

                  <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Esirleri Fidyeciye Teslim Et</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        Ordunuzdaki esirler: <span className="font-bold text-[#fb923c]">{campaign.prisoners} Esir</span> · Getiri: {calculatePrisonerRansomValue(campaign)} Dinar (Kademeye Göre)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRansom}
                      disabled={campaign.prisoners <= 0}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#374151] hover:bg-[#4b5563] text-white disabled:opacity-40 whitespace-nowrap"
                    >
                      Fidye Al
                    </button>
                  </div>

                  <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">Tüm Meyhaneye İkramda Bulun</div>
                      <div className="text-xs text-[#a89b84] mt-0.5">
                        Ahaliye şarap ısmarlayarak askerlerinizin moralini yükseltin (+8 Moral).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleTavernRound}
                      disabled={campaign.gold < 25}
                      className="px-3.5 py-2 rounded text-xs font-bold bg-[#78350f] hover:bg-[#92400e] text-[#fef08a] disabled:opacity-40 whitespace-nowrap"
                    >
                      İkram Et (25 Dinar)
                    </button>
                  </div>
                </div>
              )}

              {/* ARENA TAB */}
              {activeTab === 'arena' && (
                <div className="space-y-3">
                  {tournamentResult && (
                    <div
                      className={`p-3.5 rounded border text-xs shadow-lg ${
                        tournamentResult.victory
                          ? 'bg-[#1e3a1f] border-[#22c55e]/60 text-[#bbf7d0]'
                          : 'bg-[#2a1b1b] border-[#ef4444]/60 text-[#fecaca]'
                      }`}
                    >
                      <div className="font-extrabold text-sm mb-1">{tournamentResult.title}</div>
                      <div>{tournamentResult.details}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-sm text-[#f8f0df]">Dövüş Ustası ile Talim Yap</div>
                        <div className="text-xs text-[#fbbf24] mt-1">+25 Dinar &amp; Silah Antrenmanı</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleArenaPractice}
                        className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white"
                      >
                        Talime Başla (+25 Dinar)
                      </button>
                    </div>
                    <div className="p-3.5 rounded bg-[#1f1a14] border border-[#fde68a]/40 flex flex-col justify-between">
                      <div>
                        <div className="font-bold text-sm text-[#fef08a]">Büyük Şehir Turnuvasına Katıl</div>
                        <div className="text-xs text-[#34d399] mt-1">Giriş Ücretsiz · Ödül: 250 Dinar · +3 Nam · Şeref Miğferi</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleArenaTournament}
                        disabled={settlement.lastTournamentDay === campaign.day}
                        className="mt-3 w-full py-2 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white disabled:opacity-40"
                      >
                        {settlement.lastTournamentDay === campaign.day
                          ? 'Bugünkü Turnuva Tamamlandı'
                          : 'Turnuvaya Katıl (Ücretsiz)'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* RECRUIT TAB (Preserves Faz 8 probe compatibility) */}
              {activeTab === 'recruit' && (
                <div className="space-y-3" data-testid="recruit-panel">
                  <div className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/30">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[#c6a15b] font-semibold">Parti Kapasitesi</span>
                      <span className="font-mono-tabular text-[#f8f0df]">
                        {partySize(campaign)} / {partyLimit(campaign)} asker
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className={factionRelation < 0 ? 'text-[#fca5a5]' : 'text-[#34d399]'}>
                        Muhtarla ilişki: {factionRelation > 0 ? `+${factionRelation}` : factionRelation}
                      </span>
                      <span className="text-[#a89b84]">{partyRoom(campaign)} boş yer</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(Object.keys(UNIT_DEFINITIONS) as UnitTierId[]).map((unitId) => {
                      const quote = recruitQuote(campaign, settlement, unitId, factionRelation);
                      const max = quote.maxRecruitable;
                      return (
                        <div key={unitId} className="p-3 rounded bg-[#1f1a14] border border-[#c6a15b]/25">
                          <div className="font-semibold text-xs text-[#f8f0df]">
                            {troopName(unitId, settlement.faction)} ({troopRole(unitId, settlement.faction)})
                          </div>
                          <div className="text-[11px] text-[#c6a15b] mt-0.5">
                            Havuz: {quote.available} · Ücret: {quote.unitCost} Dinar
                          </div>
                          {quote.blockedReason && (
                            <div className="text-[10px] text-[#fca5a5] mt-0.5">{quote.blockedReason}</div>
                          )}
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              type="button"
                              disabled={max < 1}
                              onClick={() => handleRecruitClick(unitId, 1)}
                              className="flex-1 px-2 py-1 rounded text-[11px] font-bold bg-[#b45309] text-white disabled:opacity-40"
                            >
                              Topla (+1)
                            </button>
                            <button
                              type="button"
                              disabled={max < 1}
                              onClick={() => handleRecruitClick(unitId, max)}
                              className="flex-1 px-2 py-1 rounded text-[11px] font-bold bg-[#15803d] text-white disabled:opacity-40"
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

              {/* WAIT TAB */}
              {activeTab === 'wait' && (
                <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-[#f8f0df]">Ordugah Kur ve Dinlen</div>
                    <div className="text-xs text-[#34d399] mt-0.5">
                      +25 Komutan Canı · +6 Ordu Morali · Yaralılar İyileşir (Zaman İlerler)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestRecover}
                    className="px-4 py-2 rounded text-xs font-bold bg-[#1e3a5f] hover:bg-[#2563eb] text-white"
                  >
                    Dinlenmeye Geç
                  </button>
                </div>
              )}

              {/* GARRISON TAB */}
              {activeTab === 'garrison' && !isVillage && (
                <div className="space-y-2">
                  {(Object.keys(UNIT_DEFINITIONS) as UnitTierId[]).map((unitId) => {
                    const def = UNIT_DEFINITIONS[unitId];
                    const ownedInParty = campaign.roster[unitId];
                    return (
                      <div
                        key={unitId}
                        className="p-2.5 rounded bg-[#1f1a14] border border-[#c6a15b]/25 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-xs text-[#f8f0df]">{def.name}</div>
                          <div className="text-[11px] text-[#a89b84]">Ordunuzdaki Mevcut: {ownedInParty}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={ownedInParty <= 0}
                            onClick={() => handleGarrisonTransfer(unitId, 'deposit')}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-[#374151] text-white disabled:opacity-40"
                          >
                            Kaleye Bırak
                          </button>
                          <button
                            type="button"
                            disabled={settlement.garrison <= 5}
                            onClick={() => handleGarrisonTransfer(unitId, 'withdraw')}
                            className="px-2.5 py-1 rounded text-[11px] font-bold bg-[#065f46] text-white disabled:opacity-40"
                          >
                            Orduya Al
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* DUNGEON TAB */}
              {activeTab === 'dungeon' && (
                <div className="p-3.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30">
                  <div className="text-xs text-[#a89b84]">Zindan Doluluk Oranı:</div>
                  <div className="text-sm font-bold text-white mt-1">2 / 30 Hücre Dolu</div>
                </div>
              )}

              {/* HOSTILE TAB */}
              {activeTab === 'hostile' && isVillage && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded bg-[#241515] border border-[#ef4444]/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-[#fef08a]">Köylüleri Erzak Vermeye Zorla</div>
                      <div className="text-[11px] text-[#34d399]">+8 Erzak Kazandırır (Savaş &amp; İlişki Cezası)</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForceSupplies}
                      className="px-3 py-1.5 rounded text-xs font-bold bg-[#991b1b] text-white"
                    >
                      Erzak Gasp Et
                    </button>
                  </div>
                  <div className="p-3 rounded bg-[#241515] border border-[#ef4444]/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-[#fef08a]">Köylüleri Asker Vermeye Zorla</div>
                      <div className="text-[11px] text-[#60a5fa]">+3 Zorunlu Köylü Asker (Savaş &amp; İlişki Cezası)</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleForceRecruits}
                      className="px-3 py-1.5 rounded text-xs font-bold bg-[#991b1b] text-white"
                    >
                      Zorla Askere Al
                    </button>
                  </div>
                  <div className="p-3 rounded bg-[#331111] border-2 border-[#ef4444] flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-xs text-[#fca5a5]">Köyü Yağmala ve Ateşe Ver!</div>
                      <div className="text-[11px] text-[#fde047]">+280 Dinar · +16 Erzak (Savaş Başlar!)</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRaid}
                      disabled={settlement.isRaided}
                      className="px-3.5 py-1.5 rounded text-xs font-extrabold bg-[#dc2626] text-white disabled:opacity-40"
                    >
                      {settlement.isRaided ? 'Zaten Yağmalandı' : 'Köyü Yağmala!'}
                    </button>
                  </div>
                </div>
              )}

              {/* SMITHY & WORKSHOPS TAB */}
              {activeTab === 'smithy' && isTown && (
                <div className="space-y-4">
                  {(() => {
                    const clanTier = calculateClanTier(campaign.renown).tier;
                    const maxWorkshops = clanTier + 1;
                    const ownedWorkshops = campaign.settlements.filter((s) => s.workshopOwner === 'player').length;
                    const isAlreadyOwnedHere = settlement.workshopOwner === 'player';
                    const limitReached = !isAlreadyOwnedHere && ownedWorkshops >= maxWorkshops;
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold text-xs text-[#fef08a]">Şehir Zanaat Atölyeleri</div>
                          <div className="text-[11px] font-mono text-[#c6a15b]">
                            Atölye Limiti: <span className="text-white font-bold">{ownedWorkshops} / {maxWorkshops}</span> (Klan Kademesi {clanTier})
                          </div>
                        </div>
                        {limitReached && (
                          <div className="mb-2 p-2 rounded bg-[#2b1414] border border-[#ef4444]/40 text-[11px] text-[#fca5a5]">
                            Klan Kademesi {clanTier} en fazla {maxWorkshops} atölyeye izin verir. Yeni atölye için Nam kazanarak klan kademenizi yükseltin.
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              { id: 'BREWERY', name: 'Bira Fabrikası', input: 'Tahıl işler' },
                              { id: 'SMITHY', name: 'Demirci Atölyesi', input: 'Demir işler' },
                              { id: 'OLIVE_PRESS', name: 'Zeytinyağı Presi', input: 'Zeytin işler' },
                              { id: 'WEAVERY', name: 'Kadife Dokuma', input: 'İpek/Yün işler' },
                            ] as const
                          ).map((ws) => {
                            const isActive = settlement.workshopType === ws.id && settlement.workshopOwner === 'player';
                            return (
                              <div key={ws.id} className="p-2.5 rounded border border-[#c6a15b]/25 bg-[#1f1a14] flex items-center justify-between gap-2">
                                <div>
                                  <div className="font-bold text-xs text-[#f8f0df]">{ws.name}</div>
                                  <div className="text-[10px] text-[#a89b84]">
                                    {ws.input} · +{settlementWorkshopIncome({ ...settlement, workshopType: ws.id })} D/gün
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={isActive || campaign.gold < 220 || limitReached}
                                  onClick={() => {
                                    if (!onBuyWorkshop) return;
                                    const err = onBuyWorkshop(settlement.id, ws.id);
                                    if (err) setFeedback(err);
                                    else {
                                      sound.playCoin();
                                      setFeedback(`${ws.name} faaliyete geçti!`);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded text-[10px] font-bold bg-[#15803d] text-white disabled:opacity-40"
                                >
                                  {isActive ? 'Aktif' : '220 D'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* BUILDINGS & DAILY DEFAULTS TAB */}
              {activeTab === 'buildings' && (isTown || isCastle) && isPlayerOwned && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    {(
                      [
                        { id: 'FORTIFICATIONS', name: 'Surlar ve İstihkam', effect: 'Sur seviyesini artırır.' },
                        { id: 'GRANARY', name: 'Tahıl Ambarı', effect: '+25 Erzak Stoku.' },
                        { id: 'BARRACKS', name: 'Garnizon Kışlası', effect: '+6 Garnizon Muhafızı.' },
                        { id: 'FAIRGROUNDS', name: 'Panayır Alanı', effect: '+8 Halk Sadakati.' },
                        { id: 'FORUM', name: 'Şehir Forumu', effect: '+1 Günlük Krallık Nüfuzu.' },
                        { id: 'AQUEDUCTS', name: 'Su Kemerleri', effect: '+45 Şehir Refahı.' },
                      ] as const
                    ).map((b) => {
                      const currentLvl =
                        settlement.buildings?.[b.id] ?? (b.id === 'FORTIFICATIONS' ? settlement.wallLevel ?? 2 : 1);
                      const cost = currentLvl === 1 ? 180 : 320;
                      const maxed = currentLvl >= 3;
                      return (
                        <div key={b.id} className="p-2.5 rounded bg-[#1f1a14] border border-[#c6a15b]/30 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-xs text-[#f8f0df]">
                              {b.name} · <span className="text-[#fbbf24]">Sv. {currentLvl}/3</span>
                            </div>
                            <div className="text-[10px] text-[#a89b84]">{b.effect}</div>
                          </div>
                          <button
                            type="button"
                            disabled={maxed || campaign.gold < cost}
                            onClick={() => {
                              if (!onUpgradeBuilding) return;
                              const err = onUpgradeBuilding(settlement.id, b.id);
                              if (err) setFeedback(err);
                              else {
                                sound.playCoin();
                                setFeedback(`${b.name} Seviye ${currentLvl + 1} oldu!`);
                              }
                            }}
                            className="px-3 py-1 rounded text-[11px] font-bold bg-[#b45309] text-white disabled:opacity-40"
                          >
                            {maxed ? 'Maks (III)' : `Yükselt (${cost} D)`}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-[#c6a15b]/25">
                    <div className="font-bold text-xs text-[#fef08a] mb-1.5">Günlük Politikalar (Daily Defaults)</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'FESTIVAL', label: 'Festival ve Oyunlar', bonus: '+3 Sadakat' },
                          { id: 'IRRIGATION', label: 'Köy Sulaması', bonus: '+10 Refah / Ocak' },
                          { id: 'MILITIA', label: 'Milis Eğitimi', bonus: '+4 Milis Gücü' },
                          { id: 'HOUSING', label: 'Konut İnşası', bonus: '+10 Şehir Refahı' },
                        ] as const
                      ).map((def) => {
                        const active = (settlement.dailyDefault ?? 'FESTIVAL') === def.id;
                        return (
                          <button
                            key={def.id}
                            type="button"
                            onClick={() => {
                              if (!onSetDailyDefault) return;
                              onSetDailyDefault(settlement.id, def.id);
                              setFeedback(`Günlük politika "${def.label}" olarak ayarlandı.`);
                            }}
                            className={`p-2 rounded border text-left ${
                              active
                                ? 'bg-[#3b2d18] border-[#fbbf24] text-[#fef08a]'
                                : 'bg-[#1f1a14] border-[#c6a15b]/25 text-[#d1c5b0]'
                            }`}
                          >
                            <div className="font-bold text-[11px]">{def.label}</div>
                            <div className="text-[10px] text-[#34d399]">{def.bonus}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* SIEGE TAB */}
              {activeTab === 'siege' && !isVillage && (
                <div className="space-y-3" data-testid="settlement-siege-panel">
                  <div className="p-3 rounded bg-[#241515] border border-[#ef4444]/50 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-[#fecaca]">
                          {settlement.name} İstihkâm ve Kuşatma Hattı
                        </div>
                        <div className="text-[11px] text-[#fca5a5] font-mono-tabular mt-0.5">
                          Sol Sur: %{settlement.wallSections?.[0] ?? settlement.wallHealth ?? 100} · Sağ Sur: %{settlement.wallSections?.[1] ?? settlement.wallHealth ?? 100} · Garnizon: {settlement.garrison} · Milis: {settlement.militia ?? 35}
                        </div>
                      </div>
                      {onBeginSiege && (
                        <button
                          type="button"
                          onClick={() => onBeginSiege(settlement)}
                          className="px-3 py-1.5 rounded text-xs font-bold bg-[#7f1d1d] hover:bg-[#991b1b] text-[#fef2f2] border border-[#ef4444]/60"
                        >
                          Haritada Kuşatma Kampı Kur
                        </button>
                      )}
                    </div>

                    {/* Kuşatma Silahları İnşası (Bannerlord 4 Menzilli Slot + Koçbaşı / Kuşatma Kulesi) */}
                    {onBuildSiegeEngine && (
                      <div className="pt-2 border-t border-[#ef4444]/30">
                        <div className="text-[11px] font-bold text-[#fde68a] mb-1.5">
                          Kuşatma Mühendisliği &amp; Silah İnşası (Kurulu: {(settlement.siegeEngines ?? []).join(', ') || 'Yok'})
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'RAM' as SiegeEngineType, label: 'Koçbaşı (60 D)' },
                              { id: 'SIEGE_TOWER' as SiegeEngineType, label: 'Kuşatma Kulesi (95 D)' },
                              { id: 'BALLISTA' as SiegeEngineType, label: 'Balista (55 D)' },
                              { id: 'ONAGER' as SiegeEngineType, label: 'Mancınık / Onager (85 D)' },
                              { id: 'TREBUCHET' as SiegeEngineType, label: 'Görkemli Trebuchet (130 D)' },
                            ] as const
                          ).map((eng) => (
                            <button
                              key={eng.id}
                              type="button"
                              onClick={() => {
                                const err = onBuildSiegeEngine(settlement.id, eng.id, false);
                                if (err) setFeedback(err);
                                else {
                                  sound.playClang();
                                  setFeedback(`${eng.label} kuşatma hattına inşa edildi!`);
                                }
                              }}
                              className="px-2 py-1.5 rounded text-[11px] font-bold bg-[#1c1410] hover:bg-[#2d1f18] text-[#fde68a] border border-[#c6a15b]/40 text-left"
                            >
                              + {eng.label}
                            </button>
                          ))}
                          {onDeployReserveEngines && (settlement.reserveEngines?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const err = onDeployReserveEngines(settlement.id);
                                if (err) setFeedback(err);
                                else setFeedback('İhtiyattaki tüm kuşatma makineleri cephe hattına sürüldü!');
                              }}
                              className="px-2 py-1.5 rounded text-[11px] font-bold bg-[#065f46] text-white"
                            >
                              İhtiyatı Cepheye Sür ({settlement.reserveEngines?.length})
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#ef4444]/30 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Bombardıman hedefi"
                          value={siegeBombardTarget}
                          onChange={(event) =>
                            setSiegeBombardTarget(event.target.value as SiegeBombardTarget)
                          }
                          className="rounded border border-[#c6a15b]/50 bg-[#17120d] px-2 py-1 text-xs text-[#fde68a]"
                        >
                          <option value="WALL_LEFT">Sol Sur Kesimi</option>
                          <option value="WALL_RIGHT">Sağ Sur Kesimi</option>
                          <option value="PEOPLE">Garnizon &amp; Savunmacılar</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (!onBombardWalls) return;
                            const err = onBombardWalls(settlement.id, siegeBombardTarget);
                            if (err) setFeedback(err);
                            else {
                              sound.playHit();
                              setFeedback(`Kuşatma bataryaları ${settlement.name} surlarını dövdü!`);
                            }
                          }}
                          className="px-3 py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white"
                        >
                          Surları Bombardımana Tut
                        </button>
                      </div>
                      <button
                        type="button"
                        data-testid="settlement-siege-assault-btn"
                        onClick={() => onStartSiegeBattle(settlement)}
                        className="px-4 py-1.5 rounded text-xs font-extrabold bg-[#dc2626] hover:bg-[#ef4444] text-white shadow"
                      >
                        Taarruza Kalk (3B Kuşatma Savaşı)!
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom spacing so left vertical menu clears the bottom HUD */}
      <div className="mb-14 pointer-events-none" />

      {/* ═════════════════════════════════════════════════════════════════════════
          4. BANNERLORD 6-SLOT RECRUITMENT MODAL OVERLAY
         ═════════════════════════════════════════════════════════════════════════ */}
      {isRecruitmentModalOpen && (
        <BannerlordRecruitmentModal
          settlement={settlement}
          campaign={campaign}
          onCommitRecruits={(recruits) => {
            if (onRecruitBatch) {
              onRecruitBatch(settlement.id, recruits);
            }
            setIsRecruitmentModalOpen(false);
          }}
          onClose={() => setIsRecruitmentModalOpen(false)}
        />
      )}
    </div>
  );
};
