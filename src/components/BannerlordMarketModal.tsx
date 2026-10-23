import React, { useEffect, useMemo, useState } from 'react';
import {
  CALRADIA_MARKETPLACE_ITEMS,
  CampaignHero,
  CampaignState,
  EquipmentSetId,
  EquipmentSlotId,
  InventoryItem,
  ItemDefinition,
  MarketCategory,
  MarketplaceItem,
  Settlement,
  getTotalTroops,
} from '../game/rules';
import {
  PLAYER_HERO_ID,
  equipInventoryItemForHero,
  getPlayerHero,
  inventoryItemQuantity,
  inventoryTotalWeight,
  resolveItemDefinition,
  setHeroActiveEquipmentSet,
  toggleInventoryStackLocked,
  unequipHeroEquipmentSlot,
} from '../game/bannerlordFoundation';
import {
  buyFromMarket,
  getMarketSettlement,
  initializeMarketSettlement,
  marketUnitBuyPrice,
  marketUnitSellPrice,
  sellAllSurplusToMarket,
  sellToMarket,
} from '../game/marketTransaction';
import { deriveRigVisualOptionsFromEquipment } from '../game/characterRig';
import { sound } from '../game/sound';
import { HeroMannequin } from './HeroMannequin';
import { ItemIcon } from './ItemIcon';
import { CATEGORY_ICON_KEYS, ITEM_ICON_KEYS, type ItemIconKey } from '../game/itemIcons';
import {
  PRICE_TONE_CLASS,
  PRICE_TONE_LABEL,
  addPurchase,
  addSale,
  buildMarketStock,
  buyPriceAt,
  carryCapacity,
  emptySession,
  marketProfile,
  priceTone,
  tradeRumours,
  type MarketProfile,
} from '../game/market';
import { calculatePartyCarryCapacity, calculatePartyLogistics } from '../game/logistics';

interface BannerlordMarketModalProps {
  settlement?: Settlement | null;
  campaign: CampaignState;
  onClose: () => void;
  onUpdateCampaign: (nextState: CampaignState) => void;
  onOpenArenaTest?: () => void;
}

function validIconKey(icon: string): ItemIconKey {
  return ITEM_ICON_KEYS.includes(icon as ItemIconKey) ? (icon as ItemIconKey) : 'crate';
}

function definitionArmorTotal(definition: ItemDefinition): number {
  return (
    (definition.stats.armorHead ?? 0) +
    (definition.stats.armorBody ?? 0) +
    (definition.stats.armorArm ?? 0) +
    (definition.stats.armorLeg ?? 0) +
    (definition.stats.armorMount ?? 0)
  );
}

function definitionToMarketRow(definition: ItemDefinition): MarketplaceItem {
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category === 'TRADE' ? 'FOOD' : definition.category,
    slot: definition.slot,
    value: definition.baseValue,
    weight: definition.weight,
    statBonus: definition.statBonus,
    iconKey: validIconKey(definition.icon),
    civilianLegal: definition.civilianLegal,
    tier: definition.tier,
    description: 'Bu şehre satılmış, tezgahtaki eşya.',
  };
}

export const BannerlordMarketModal: React.FC<BannerlordMarketModalProps> = ({
  settlement,
  campaign: committedCampaign,
  onClose,
  onUpdateCampaign,
  onOpenArenaTest,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<
    'tier' | 'name' | 'quantity' | 'price_asc' | 'price_desc' | 'weight' | 'damage' | 'armor'
  >('tier');
  const [feedback, setFeedback] = useState<string | null>(null);
  /** Faz 7: tüccar kesesi yerleşkenin refahından türetilir. */
  const fallbackProfile = useMemo<MarketProfile>(
    () => marketProfile({
      id: 'camp-roadside',
      name: 'Yol Kenarı Pazarı',
      type: 'VILLAGE',
      faction: 'player',
      x: 0,
      z: 0,
      prosperity: 2200,
      garrison: 0,
      recruitPool: {},
      foodStock: 0,
      description: '',
    } as never),
    [],
  );
  /**
   * P2 bekleyen-transfer taslağı: bütün alış/satış/kuşanma/kilit işlemleri
   * yalnız bu kopyada yaşar. `Bitti` taslağı tek seferde App'e işler;
   * `Vazgeç`/Esc hiçbir kampanya alanını değiştirmeden kapatır.
   */
  const [draftCampaign, setDraftCampaign] = useState<CampaignState>(() =>
    settlement ? initializeMarketSettlement(committedCampaign, settlement.id) : committedCampaign,
  );
  useEffect(() => {
    setDraftCampaign(
      settlement ? initializeMarketSettlement(committedCampaign, settlement.id) : committedCampaign,
    );
    setSession(emptySession());
    setFeedback(null);
    // committedCampaign bilinçli olarak bağımlılık değil: ekran açıkken dış
    // durum değişimleri oyuncunun bekleyen işlem taslağını ezmemelidir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlement?.id]);

  const campaign = draftCampaign;
  const liveSettlement = settlement
    ? (getMarketSettlement(draftCampaign, settlement.id) ?? settlement)
    : null;
  const profile = useMemo(
    () => (liveSettlement ? marketProfile(liveSettlement) : fallbackProfile),
    [liveSettlement, fallbackProfile],
  );
  const fallbackStock = useMemo(
    () =>
      Object.fromEntries(
        buildMarketStock(CALRADIA_MARKETPLACE_ITEMS, fallbackProfile).map((entry) => [
          entry.item.id,
          entry.quantity,
        ]),
      ),
    [fallbackProfile],
  );
  const stock = liveSettlement?.marketStock ?? fallbackStock;
  const merchantGold = liveSettlement?.merchantGold ?? profile.merchantGold;
  /** Faz 7: seans özeti (Bannerlord'daki net sonuç). */
  const [session, setSession] = useState(emptySession);

  const settlementName = liveSettlement?.name || settlement?.name || 'Pazaryeri & Ordugah';

  // Katalog tezgahı + oyuncunun bu şehre sattığı katalog dışı tanımlar.
  const marketRows = useMemo<MarketplaceItem[]>(() => {
    const rows = new Map(CALRADIA_MARKETPLACE_ITEMS.map((item) => [item.id, item]));
    for (const definitionId of Object.keys(stock)) {
      if (rows.has(definitionId)) continue;
      const definition = resolveItemDefinition(campaign, definitionId);
      if (definition) rows.set(definition.id, definitionToMarketRow(definition));
    }
    return [...rows.values()];
  }, [campaign, stock]);

  // Filter Market Items
  const filteredMarketItems = useMemo(() => {
    return marketRows
      .filter((item) => (stock[item.id] ?? 0) > 0)
      .filter((item) => {
        const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
        const matchSearch =
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.statBonus.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCat && matchSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
        if (sortBy === 'quantity') return (stock[b.id] ?? 0) - (stock[a.id] ?? 0);
        if (sortBy === 'price_asc') return buyPriceAt(a, profile) - buyPriceAt(b, profile);
        if (sortBy === 'price_desc') return buyPriceAt(b, profile) - buyPriceAt(a, profile);
        if (sortBy === 'weight') return a.weight - b.weight;
        if (sortBy === 'damage' || sortBy === 'armor') {
          const defA = resolveItemDefinition(campaign, a.id);
          const defB = resolveItemDefinition(campaign, b.id);
          const valueA = defA
            ? sortBy === 'damage'
              ? (defA.stats.damage ?? 0)
              : definitionArmorTotal(defA)
            : 0;
          const valueB = defB
            ? sortBy === 'damage'
              ? (defB.stats.damage ?? 0)
              : definitionArmorTotal(defB)
            : 0;
          return valueB - valueA;
        }
        return b.tier - a.tier || a.name.localeCompare(b.name, 'tr');
      });
  }, [campaign, marketRows, profile, selectedCategory, searchQuery, sortBy, stock]);

  // Filter Player Backpack Items
  const filteredPlayerItems = useMemo(() => {
    const items = campaign.inventoryItems || [];
    return items
      .filter((item) => {
        const definition = resolveItemDefinition(campaign, item.definitionId ?? item.id);
        const rawCategory = definition?.category ?? item.category ?? 'TRADE';
        const category = rawCategory === 'TRADE' ? 'FOOD' : rawCategory;
        const matchCat = selectedCategory === 'ALL' || category === selectedCategory;
        const matchSearch =
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.statBonus.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCat && matchSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
        if (sortBy === 'quantity') return inventoryItemQuantity(b) - inventoryItemQuantity(a);
        if (sortBy === 'price_asc' || sortBy === 'price_desc') {
          const defA = resolveItemDefinition(campaign, a.definitionId ?? a.id);
          const defB = resolveItemDefinition(campaign, b.definitionId ?? b.id);
          const priceA = defA ? marketUnitSellPrice(defA, profile) : a.value;
          const priceB = defB ? marketUnitSellPrice(defB, profile) : b.value;
          return sortBy === 'price_asc' ? priceA - priceB : priceB - priceA;
        }
        if (sortBy === 'weight') return a.weight - b.weight;
        if (sortBy === 'damage' || sortBy === 'armor') {
          const defA = resolveItemDefinition(campaign, a.definitionId ?? a.id);
          const defB = resolveItemDefinition(campaign, b.definitionId ?? b.id);
          const valueA = defA
            ? sortBy === 'damage'
              ? (defA.stats.damage ?? 0)
              : definitionArmorTotal(defA)
            : 0;
          const valueB = defB
            ? sortBy === 'damage'
              ? (defB.stats.damage ?? 0)
              : definitionArmorTotal(defB)
            : 0;
          return valueB - valueA;
        }
        return (b.tier ?? 0) - (a.tier ?? 0) || a.name.localeCompare(b.name, 'tr');
      });
  }, [campaign, profile, selectedCategory, searchQuery, sortBy]);

  const [selectedHeroId, setSelectedHeroId] = useState<string>(
    () => getPlayerHero(committedCampaign)?.id ?? committedCampaign.heroes?.[0]?.id ?? PLAYER_HERO_ID,
  );
  const heroes = useMemo<CampaignHero[]>(
    () => (draftCampaign.heroes ?? []).filter((hero) => hero.isInPlayerParty),
    [draftCampaign.heroes],
  );
  const playerHero = useMemo(
    () =>
      heroes.find((hero) => hero.id === selectedHeroId) ??
      heroes[0] ??
      getPlayerHero(campaign),
    [campaign, heroes, selectedHeroId],
  );
  const selectedHeroIndex = playerHero ? heroes.findIndex((hero) => hero.id === playerHero.id) : -1;
  const activeSet: EquipmentSetId = playerHero?.activeEquipmentSet ?? 'BATTLE';

  const moveHero = (direction: -1 | 1) => {
    if (heroes.length <= 1 || selectedHeroIndex < 0) return;
    const nextIndex = (selectedHeroIndex + direction + heroes.length) % heroes.length;
    setSelectedHeroId(heroes[nextIndex].id);
    setFeedback(null);
  };

  const handleSetActiveSet = (setId: EquipmentSetId) => {
    if (!playerHero || activeSet === setId) return;
    const result = setHeroActiveEquipmentSet(draftCampaign, playerHero.id, setId);
    if (!result.success) {
      setFeedback(result.reason ?? 'Ekipman seti değiştirilemedi.');
      return;
    }
    setDraftCampaign(result.nextState);
    setFeedback(
      `${playerHero.name} için ${setId === 'BATTLE' ? 'savaş' : 'sivil'} set bekleyen taslağa seçildi.`,
    );
  };

  // Derive Character Visual Options from equipped items of selected hero
  const visualOptions = useMemo(() => {
    if (!playerHero) return deriveRigVisualOptionsFromEquipment(campaign.equipment, '#b45309');
    const eqText: Partial<Record<EquipmentSlotId, string>> = {};
    const setObj = playerHero.equipment[activeSet];
    for (const [slotKey, defId] of Object.entries(setObj)) {
      const def = resolveItemDefinition(campaign, defId);
      if (def) {
        eqText[slotKey as EquipmentSlotId] = def.statBonus
          ? `${def.name} (${def.statBonus})`
          : def.name;
      }
    }
    return deriveRigVisualOptionsFromEquipment(eqText, '#b45309');
  }, [activeSet, campaign, playerHero]);

  const healthyTroops =
    (draftCampaign.troopStacks ?? []).reduce((sum, s) => sum + s.count, 0) || 20;
  const capacityBreakdown = useMemo(
    () =>
      calculatePartyCarryCapacity({
        healthyTroops,
        inventoryItems: draftCampaign.inventoryItems,
        perks: draftCampaign.unlockedPerks,
        state: draftCampaign,
      }),
    [draftCampaign, healthyTroops],
  );
  const partyLogistics = useMemo(
    () =>
      calculatePartyLogistics({
        x: draftCampaign.playerX,
        z: draftCampaign.playerZ,
        healthyTroops,
        cavalryCount: draftCampaign.roster.cavalry,
        woundedCount: (draftCampaign.troopStacks ?? []).reduce((sum, s) => sum + (s.wounded ?? 0), 0),
        prisonerCount: draftCampaign.prisoners,
        inventoryItems: draftCampaign.inventoryItems,
        morale: draftCampaign.morale,
        perks: draftCampaign.unlockedPerks,
        state: draftCampaign,
      }),
    [draftCampaign, healthyTroops],
  );

  const armorTotals = useMemo(() => {
    const totals = { head: 0, body: 0, arm: 0, leg: 0, mount: 0 };
    if (!playerHero) return totals;
    const equipmentSet = playerHero.equipment[activeSet];
    for (const definitionId of Object.values(equipmentSet)) {
      const definition = resolveItemDefinition(campaign, definitionId);
      if (!definition) continue;
      totals.head += definition.stats.armorHead ?? 0;
      totals.body += definition.stats.armorBody ?? 0;
      totals.arm += definition.stats.armorArm ?? 0;
      totals.leg += definition.stats.armorLeg ?? 0;
      totals.mount += definition.stats.armorMount ?? 0;
    }
    return totals;
  }, [activeSet, campaign, playerHero]);

  const quantityFromClick = (
    event: React.MouseEvent,
    available: number,
    affordable = Number.POSITIVE_INFINITY,
  ): number => {
    const desired = event.ctrlKey || event.metaKey ? available : event.shiftKey ? 5 : 1;
    const safeAffordable = Number.isFinite(affordable)
      ? Math.max(0, Math.floor(affordable))
      : available;
    return Math.max(0, Math.min(desired, available, safeAffordable));
  };

  // Buy item handler — yalnız taslak güncellenir.
  const handleBuy = (item: MarketplaceItem, event: React.MouseEvent) => {
    if (!liveSettlement) {
      setFeedback('Pazar yalnız bir yerleşimin içinde kullanılabilir.');
      return;
    }
    const available = stock[item.id] ?? 0;
    const definition = resolveItemDefinition(campaign, item.id);
    const unitPrice = definition ? marketUnitBuyPrice(definition, profile) : buyPriceAt(item, profile);
    const affordable = unitPrice > 0 ? Math.floor(campaign.gold / unitPrice) : 0;
    const quantity = quantityFromClick(event, available, affordable);
    if (quantity <= 0) {
      setFeedback(`Tezgahta "${item.name}" kalmadı.`);
      return;
    }
    const res = buyFromMarket(campaign, liveSettlement.id, item.id, quantity);
    if (!res.success) {
      setFeedback(res.reason || 'Satın alma başarısız.');
      return;
    }
    sound.playCoinChime();
    setDraftCampaign(res.nextState);
    setSession((prev) => addPurchase(prev, res.totalPrice, res.quantity));
    setFeedback(
      `${res.quantity} adet "${item.name}" bekleyen işleme eklendi (-${res.totalPrice} Dinar). Bitti ile onayla.`,
    );
  };

  // Sell item handler
  const handleSell = (item: InventoryItem, event: React.MouseEvent) => {
    const invItem = item;
    const definition = resolveItemDefinition(campaign, item.definitionId ?? item.id);
    const expected = definition ? marketUnitSellPrice(definition, profile) : item.value;
    if (!liveSettlement) {
      setFeedback('Pazar yalnız bir yerleşimin içinde kullanılabilir.');
      return;
    }
    if (invItem && merchantGold < expected) {
      setFeedback(
        `Tüccarın kesesinde yeterli altın yok (${merchantGold} Dinar). Daha az değerli mal sat veya başka şehre git.`,
      );
      return;
    }
    const affordable = expected > 0 ? Math.floor(merchantGold / expected) : 0;
    const quantity = quantityFromClick(event, inventoryItemQuantity(item), affordable);
    const res = sellToMarket(campaign, liveSettlement.id, item.id, quantity);
    if (!res.success) {
      setFeedback(res.reason || 'Satış başarısız.');
      return;
    }
    sound.playCoinChime();
    setDraftCampaign(res.nextState);
    setSession((prev) => addSale(prev, res.totalPrice, res.quantity));
    setFeedback(
      `${res.quantity} adet "${item.name}" bekleyen işleme eklendi (+${res.totalPrice} Dinar). Bitti ile onayla.`,
    );
  };

  const handleToggleLock = (item: InventoryItem) => {
    const res = toggleInventoryStackLocked(campaign.inventoryItems, item.id);
    if (!res.success) {
      setFeedback(res.reason || 'Kilit değiştirilemedi.');
      return;
    }
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: res.items }));
    setFeedback(
      res.stack?.locked
        ? `"${item.name}" kilitlendi; Bitti'ye kadar taslakta korunur.`
        : `"${item.name}" kilidi açıldı.`,
    );
  };

  // Equip handler
  const handleEquip = (itemId: string) => {
    const res = equipInventoryItemForHero(
      campaign,
      playerHero?.id ?? PLAYER_HERO_ID,
      itemId,
      activeSet,
    );
    if (!res.success) {
      setFeedback(res.reason || 'Eşya kuşanılamadı.');
      return;
    }
    sound.playWarhorn();
    setDraftCampaign(res.nextState);
    setFeedback('Eşya taslakta kuşanıldı; Bitti ile kalıcı olur, Vazgeç geri alır.');
  };

  // Unequip handler
  const handleUnequip = (slot: EquipmentSlotId) => {
    const res = unequipHeroEquipmentSlot(
      campaign,
      playerHero?.id ?? PLAYER_HERO_ID,
      slot,
      activeSet,
    );
    if (!res.success) {
      setFeedback(res.reason || 'Çıkarılamadı.');
      return;
    }
    setDraftCampaign(res.nextState);
    setFeedback('Eşya taslakta çıkarıldı ve sırt çantasına alındı.');
  };

  // Quick: Sell all surplus loot
  const handleSellAllLoot = () => {
    if (!liveSettlement) {
      setFeedback('Pazar yalnız bir yerleşimin içinde kullanılabilir.');
      return;
    }
    const res = sellAllSurplusToMarket(campaign, liveSettlement.id);
    if (res.totalQuantity > 0) {
      sound.playCoinChime();
      setDraftCampaign(res.nextState);
      setSession((prev) => addSale(prev, res.totalEarned, res.totalQuantity));
      setFeedback(
        `${res.totalQuantity} adet fazla ganimet bekleyen işleme eklendi (+${res.totalEarned} Dinar). Bitti ile onayla.`,
      );
    } else {
      setFeedback('Satılacak kilitsiz yedek ganimet eşyası bulunmuyor veya tüccar kasası yetersiz.');
    }
  };

  const handleDone = () => {
    onUpdateCampaign(draftCampaign);
    onClose();
  };

  const totalTroops = getTotalTroops(campaign.roster);
  const maxCapacity = totalTroops * 12 + 350;
  const currentWeight = inventoryTotalWeight(campaign.inventoryItems);
  const isOverweight = currentWeight > maxCapacity;

  const slotList = [
    { slot: 'HEAD', label: 'Başlık', icon: 'helmet' as const },
    { slot: 'SHOULDER', label: 'Omuzluk', icon: 'shoulder' as const },
    { slot: 'BODY', label: 'Gövde', icon: 'armor' as const },
    { slot: 'GLOVES', label: 'Eldiven', icon: 'gloves' as const },
    { slot: 'LEG', label: 'Çizme', icon: 'boots' as const },
    { slot: 'MOUNT', label: 'Binek', icon: 'horse' as const },
    { slot: 'HARNESS', label: 'Koşum', icon: 'harness' as const },
    { slot: 'BANNER', label: 'Sancak', icon: 'cloth' as const },
    { slot: 'WEAPON1', label: 'Silah I', icon: 'sword' as const },
    { slot: 'WEAPON2', label: 'Kalkan / II', icon: 'shield' as const },
    { slot: 'WEAPON3', label: 'Silah III', icon: 'spear' as const },
    { slot: 'WEAPON4', label: 'Silah IV', icon: 'arrows' as const },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-none pointer-events-auto select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-modal-title"
      data-testid="market-modal"
      data-market-settlement-id={liveSettlement?.id ?? ''}
    >
      <div className="w-full h-full max-w-[1500px] max-h-[96vh] rounded-lg border border-[#c6a15b]/40 bg-[#120f0c] shadow-2xl flex flex-col overflow-hidden text-[#f3ead8]">
        {/* HEADER BAR */}
        <div className="px-5 py-3 border-b border-[#c6a15b]/30 bg-[#1a1510] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <ItemIcon iconKey="tools" size={24} className="text-[#c6a15b]" />
            <div>
              <h2 id="market-modal-title" className="text-lg font-display font-bold text-[#fef08a]">
                {settlementName} · Pazaryeri ve Ticaret Loncası
              </h2>
              <div className="text-xs text-[#b5a890] flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Tüccar Kasası:{' '}
                  <strong className="text-[#fbbf24] font-mono-tabular">{merchantGold} Dinar</strong>
                </span>
                <span>·</span>
                <span>
                  Sancak Hazineniz:{' '}
                  <strong className="text-[#34d399] font-mono-tabular">{campaign.gold} Dinar</strong>
                </span>
                <span>·</span>
                <span>
                  Erzak:{' '}
                  <strong className="text-[#60a5fa] font-mono-tabular">{campaign.food} Gün</strong>
                </span>
                <span>·</span>
                <span title="Ordu Taşıma Kapasitesi (askerler + binekler + yük hayvanları)">
                  Kapasite:{' '}
                  <strong
                    className={`font-mono-tabular ${
                      capacityBreakdown.isOverweight ? 'text-red-400 font-bold' : 'text-[#fbbf24]'
                    }`}
                  >
                    {Math.round(capacityBreakdown.currentWeight)} / {capacityBreakdown.totalCapacity} kg
                  </strong>
                </span>
                <span>·</span>
                <span
                  data-testid="market-mount-summary"
                  className="px-1.5 py-0.5 rounded bg-[#231d15] border border-[#c6a15b]/30 text-[#fde68a]"
                  title="Binek Atı: Yaya askerlere harita hızı bonusu sağlar · Yük Hayvanı (Katır/Beygir): +100 kg taşıma kapasitesi verir"
                >
                  Binek Atı: <strong className="font-mono-tabular">{partyLogistics.animals.spareMounts}</strong> (+{((partyLogistics as any).spareMountSpeedBonus ?? 0).toFixed(2)} Hız) · Yük Hayvanı: <strong className="font-mono-tabular">{partyLogistics.animals.packAnimals}</strong> (+{partyLogistics.animals.packAnimals * 100} kg)
                </span>
                <span>·</span>
                <span>
                  Refah:{' '}
                  <strong className="text-[#c6a15b] font-mono-tabular">{profile.prosperity}</strong>
                  {' · '}Fiyat endeksi:{' '}
                  <strong
                    className={
                      profile.modifier > 1.03
                        ? 'text-[#fca5a5]'
                        : profile.modifier < 0.97
                          ? 'text-[#34d399]'
                          : 'text-[#e2d6c1]'
                    }
                  >
                    ×{profile.modifier.toFixed(2)}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenArenaTest && (
              <button
                type="button"
                onClick={onOpenArenaTest}
                className="px-3 py-1.5 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#fca5a5]/40 transition-colors shadow flex items-center gap-1.5"
              >
                <ItemIcon iconKey="sword" size={14} />
                <span>Karakter & Savaş Arenası</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-bold bg-[#26211a] hover:bg-[#382f25] text-[#e2d6c1] border border-[#c6a15b]/30 transition-colors"
            >
              Vazgeç [Esc]
            </button>
          </div>
        </div>

        {/* CATEGORY & SEARCH BAR */}
        <div className="px-4 py-2 border-b border-[#c6a15b]/20 bg-[#16120e] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'ALL', label: 'TÜMÜ' },
                { id: 'WEAPON', label: 'SİLAHLAR' },
                { id: 'SHIELD', label: 'KALKANLAR' },
                { id: 'ARMOR', label: 'ZIRHLAR' },
                { id: 'FOOD', label: 'ERZAK & EMTİA' },
                { id: 'HORSE', label: 'BİNEKLER' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#b45309] text-white border border-[#fde68a]/50 shadow'
                    : 'bg-[#221c16] text-[#b5a890] hover:text-white border border-transparent'
                }`}
              >
                <ItemIcon iconKey={CATEGORY_ICON_KEYS[cat.id]} size={13} />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Eşya veya özellik ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-2.5 py-1 text-xs rounded bg-[#100d0a] border border-[#c6a15b]/30 text-[#f3ead8] placeholder-[#78716c] focus:outline-none focus:border-[#fbbf24] w-48"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1 text-xs rounded bg-[#100d0a] border border-[#c6a15b]/30 text-[#e2d6c1] focus:outline-none"
            >
              <option value="tier">Kademeye Göre</option>
              <option value="name">Ada Göre</option>
              <option value="quantity">Adede Göre</option>
              <option value="price_asc">Fiyat (Artan)</option>
              <option value="price_desc">Fiyat (Azalan)</option>
              <option value="weight">Ağırlık (Hafif)</option>
              <option value="damage">Hasara Göre</option>
              <option value="armor">Zırha Göre</option>
            </select>
          </div>
        </div>

        {/* FEEDBACK NOTICE */}
        {feedback && (
          <div className="px-4 py-1.5 bg-[#2b2114] border-b border-[#f59e0b]/40 text-xs text-[#fde68a] flex items-center justify-between">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[#9ca3af] hover:text-white font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* 3-COLUMN WORKSPACE: LEFT MARKET | CENTER 3D PREVIEW + 12 SLOTS | RIGHT INVENTORY */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#c6a15b]/25">
          {/* 1. LEFT COLUMN: TOWN MERCHANT ITEMS (4 cols) */}
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden bg-[#14100c]">
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#19140f] shrink-0">
              <span className="text-xs font-bold text-[#c6a15b] tracking-wider uppercase">
                <ItemIcon iconKey="crate" size={13} className="inline-block align-[-2px] mr-1" />
                Pazaryeri Tezgahı ({filteredMarketItems.length} Eşya)
              </span>
              <span className="text-[11px] text-[#9ca3af]">Tık 1 · Shift 5 · Ctrl tümü</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredMarketItems.map((item) => {
                const definition = resolveItemDefinition(campaign, item.id);
                const price = definition ? marketUnitBuyPrice(definition, profile) : buyPriceAt(item, profile);
                const quantity = stock[item.id] ?? 0;
                const canAfford = campaign.gold >= price;
                const visitedIds = campaign.settlements
                  .filter((candidate) => candidate.visited)
                  .map((candidate) => candidate.id);
                const rumours = liveSettlement
                  ? tradeRumours(campaign, item, liveSettlement, visitedIds, 12)
                      .filter((rumour) => rumour.visited)
                      .slice(0, 2)
                  : [];
                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded bg-[#1c1712] border border-[#c6a15b]/20 hover:border-[#f59e0b]/60 transition-all flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="shrink-0 p-1.5 rounded bg-[#2a2219] text-[#e8d9b5] flex items-center justify-center">
                        <ItemIcon iconKey={item.iconKey} size={22} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#f8f0df] truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#3b2d1d] text-[#fbbf24]">
                            T{item.tier}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#34d399] truncate font-medium">
                          {item.statBonus}
                        </div>
                        <div className="text-[10px] text-[#a89b84] flex items-center gap-2 mt-0.5">
                          <span>Ağırlık: {item.weight} kg</span>
                          <span>·</span>
                          <span>Stok {quantity}</span>
                          <span>·</span>
                          <span className="italic text-[#d6cbb5] truncate">
                            {item.description}
                          </span>
                        </div>
                        {rumours.length > 0 && (
                          <div
                            className="text-[9px] text-[#8b8072] mt-0.5 truncate"
                            title="Ticaret söylentisi: yakın şehirlerdeki fiyatlar"
                          >
                            {rumours.map((r) => (
                              <span key={r.settlementId} className="mr-2">
                                {r.settlementName}:{' '}
                                <span className={PRICE_TONE_CLASS[r.tone]}>{r.price} D</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex flex-col items-end gap-0.5">
                        <span
                          className={`text-xs font-bold font-mono-tabular ${PRICE_TONE_CLASS[priceTone(price, item.value)]}`}
                          title={PRICE_TONE_LABEL[priceTone(price, item.value)]}
                        >
                          {price} D
                        </span>
                        <span className="text-[9px] text-[#8b8072]">Taban {item.value} D</span>
                        <button
                          type="button"
                          disabled={!canAfford || quantity <= 0}
                          data-testid={`market-buy-${item.id}`}
                          title="Tık: 1 adet · Shift: 5 adet · Ctrl: alınabilen tümü"
                          onClick={(event) => handleBuy(item, event)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            canAfford && quantity > 0
                              ? 'bg-[#15803d] hover:bg-[#16a34a] text-white shadow'
                              : 'bg-[#27211b] text-[#6b7280] cursor-not-allowed'
                          }`}
                        >
                          {quantity <= 0 ? 'Tükendi' : canAfford ? 'Satın Al' : 'Yetersiz'}
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford || quantity <= 0}
                        data-testid={`market-row-right-${item.id}`}
                        title="Sağa (Envantere) 1 adet aktar (>)"
                        onClick={(event) => handleBuy(item, event)}
                        className="w-6 h-8 rounded bg-[#26211a] hover:bg-[#382f25] disabled:opacity-35 border border-[#c6a15b]/35 text-[#fde68a] font-black text-xs flex items-center justify-center"
                      >
                        &gt;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. CENTER COLUMN: HERO SWITCHER, SET TOGGLE, 3D MANNEQUIN & 12 EQUIPMENT SLOTS (4 cols) */}
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden bg-[#100d0a]">
            <div className="p-2.5 border-b border-[#c6a15b]/20 bg-[#17130e] shrink-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => moveHero(-1)}
                  disabled={heroes.length <= 1}
                  data-testid="market-hero-prev"
                  className="w-7 h-7 rounded bg-[#26211a] hover:bg-[#362f25] disabled:opacity-30 text-[#fde68a] font-black"
                  aria-label="Önceki kahraman"
                >
                  ‹
                </button>
                <div className="text-center min-w-0">
                  <span
                    className="text-xs font-bold text-[#fef08a] block truncate"
                    data-testid="market-selected-hero"
                  >
                    {playerHero?.name ?? campaign.playerName}
                  </span>
                  <span className="text-[10px] text-[#b5a890] block">
                    3B Canlı Karakter Manken Önizlemesi (Fareyle Döndür)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => moveHero(1)}
                  disabled={heroes.length <= 1}
                  data-testid="market-hero-next"
                  className="w-7 h-7 rounded bg-[#26211a] hover:bg-[#362f25] disabled:opacity-30 text-[#fde68a] font-black"
                  aria-label="Sonraki kahraman"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {(
                  [
                    ['BATTLE', 'Savaş Seti'],
                    ['CIVILIAN', 'Sivil Set'],
                  ] as Array<[EquipmentSetId, string]>
                ).map(([setId, label]) => (
                  <button
                    key={setId}
                    type="button"
                    onClick={() => handleSetActiveSet(setId)}
                    data-testid={`market-set-${setId.toLowerCase()}`}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                      activeSet === setId
                        ? 'bg-[#b45309] text-white'
                        : 'bg-[#23201a] text-[#d6c7a4] hover:bg-[#2e2920]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D Model Viewport */}
            <div className="flex-1 w-full relative overflow-hidden min-h-[185px]">
              <HeroMannequin
                visualOptions={visualOptions}
                showMount={Boolean(playerHero?.equipment[activeSet].MOUNT)}
                testId="market-hero-mannequin"
              />
            </div>

            {/* 12 Equipped Slots in Center Column (Matching InventoryModal) */}
            <div className="p-2 border-t border-[#c6a15b]/20 bg-[#14100b] max-h-44 overflow-y-auto shrink-0">
              <div className="text-[10px] text-[#c6a15b] font-bold mb-1">
                Kuşanılmış Teçhizat Slotları:
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {slotList.map((slotInfo) => {
                  const equippedDefinitionId = playerHero
                    ? playerHero.equipment[activeSet][slotInfo.slot]
                    : null;
                  const equippedDefinition = resolveItemDefinition(campaign, equippedDefinitionId);
                  const eqName =
                    equippedDefinition?.name ??
                    campaign.equipment?.[slotInfo.slot] ??
                    'Boş Slot';
                  const isEquipped = Boolean(equippedDefinitionId);
                  return (
                    <div
                      key={slotInfo.slot}
                      data-testid={`market-slot-${slotInfo.slot}`}
                      className="p-1.5 rounded bg-[#1f1913] border border-[#c6a15b]/20 flex items-center justify-between gap-1 min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-[#a89b84] flex items-center gap-1 truncate">
                          <ItemIcon iconKey={slotInfo.icon} size={11} />
                          {slotInfo.label}
                        </span>
                        <span className="text-[#f8f0df] font-semibold truncate block" title={eqName}>
                          {eqName.split(' (')[0]}
                        </span>
                      </div>
                      {isEquipped && (
                        <button
                          type="button"
                          onClick={() => handleUnequip(slotInfo.slot)}
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#372f26] hover:bg-[#4a3f33] text-[#e2d6c1] shrink-0"
                          title="Slotu Çıkar"
                        >
                          Çıkar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Armor & Encumbrance Stats Dock */}
            <div className="p-2.5 border-t border-[#c6a15b]/20 bg-[#16120e] space-y-2 shrink-0 text-xs">
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[#c6a15b] font-semibold">Taşıma Ağırlığı:</span>
                  <span
                    className={`font-mono-tabular font-bold ${
                      isOverweight ? 'text-[#ef4444]' : 'text-[#34d399]'
                    }`}
                  >
                    {Math.round(currentWeight)} / {maxCapacity} kg
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#26211a] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isOverweight ? 'bg-[#dc2626]' : 'bg-[#d97706]'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((currentWeight / maxCapacity) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                <div className="p-1 rounded bg-[#1f1913] border border-[#c6a15b]/15 text-center">
                  <span className="text-[#a89b84] block">Baş</span>
                  <span className="text-[#f8f0df] font-bold">+{armorTotals.head}</span>
                </div>
                <div className="p-1 rounded bg-[#1f1913] border border-[#c6a15b]/15 text-center">
                  <span className="text-[#a89b84] block">Gövde</span>
                  <span className="text-[#f8f0df] font-bold">+{armorTotals.body}</span>
                </div>
                <div className="p-1 rounded bg-[#1f1913] border border-[#c6a15b]/15 text-center">
                  <span className="text-[#a89b84] block">Kol</span>
                  <span className="text-[#f8f0df] font-bold">+{armorTotals.arm}</span>
                </div>
                <div className="p-1 rounded bg-[#1f1913] border border-[#c6a15b]/15 text-center">
                  <span className="text-[#a89b84] block">Bacak</span>
                  <span className="text-[#f8f0df] font-bold">+{armorTotals.leg}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSellAllLoot}
                className="w-full py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors shadow"
              >
                Tüm Fazla Ganimeti Sat (&lt;&lt;)
              </button>
            </div>
          </div>

          {/* 3. RIGHT COLUMN: PLAYER INVENTORY (4 cols) */}
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden bg-[#14100c]">
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#19140f] shrink-0">
              <span className="text-xs font-bold text-[#fef08a] tracking-wider uppercase">
                <ItemIcon iconKey="crate" size={13} className="inline-block align-[-2px] mr-1" />
                Donanım & Sırt Çantası ({filteredPlayerItems.length} Eşya)
              </span>
              <span className="text-[11px] text-[#fbbf24] font-mono-tabular font-bold">
                {campaign.gold} Dinar
              </span>
            </div>

            {/* Backpack Inventory Items */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {filteredPlayerItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#a89b84]">
                  Bu kategoride envanterinizde eşya bulunmuyor. Sol taraftaki pazaryerinden kılıç,
                  zırh veya erzak satın alabilirsiniz.
                </div>
              ) : (
                filteredPlayerItems.map((item) => {
                  const definition = resolveItemDefinition(campaign, item.definitionId ?? item.id);
                  const saleUnitPrice = definition
                    ? marketUnitSellPrice(definition, profile)
                    : item.value;
                  const quantity = inventoryItemQuantity(item);
                  const totalWeight = item.weight * quantity;
                  return (
                    <div
                      key={item.id}
                      className="p-2 rounded bg-[#1c1712] border border-[#c6a15b]/20 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={(event) => handleSell(item, event)}
                        disabled={Boolean(item.locked) || merchantGold < saleUnitPrice}
                        data-testid={`market-row-left-${item.id}`}
                        title="Sola (Tüccara) 1 adet sat (<)"
                        className="w-6 h-8 rounded bg-[#26211a] hover:bg-[#382f25] disabled:opacity-35 border border-[#c6a15b]/35 text-[#fde68a] font-black text-xs flex items-center justify-center shrink-0"
                      >
                        &lt;
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[#f8f0df] truncate">
                          {item.name} <span className="text-[#fbbf24]">×{quantity}</span>
                        </div>
                        <div className="text-[10px] text-[#34d399] truncate font-medium">
                          {item.statBonus}
                        </div>
                        <div className="text-[10px] text-[#a89b84] flex flex-wrap items-center gap-x-2">
                          <span>Ağırlık: {totalWeight.toFixed(1)} kg</span>
                          <span>·</span>
                          <span className="text-[#fbbf24] font-mono">
                            Birim değer: {item.value} D
                          </span>
                          <span className="text-[#8b8072]">· Satış: {saleUnitPrice} D/adet</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleLock(item)}
                          data-testid={`market-lock-${item.id}`}
                          aria-pressed={Boolean(item.locked)}
                          title={item.locked ? 'Kilidi aç' : 'Kilitle (satış ve toplu satışta korunur)'}
                          className={`px-1.5 py-1 rounded text-[10px] font-bold border ${
                            item.locked
                              ? 'bg-[#3f2d12] text-[#fbbf24] border-[#fbbf24]/50'
                              : 'bg-[#1f1913] text-[#8b8072] border-[#c6a15b]/20'
                          }`}
                        >
                          {item.locked ? 'KİLİTLİ' : 'AÇIK'}
                        </button>
                        {item.slot !== 'TRADE' && (
                          <button
                            type="button"
                            onClick={() => handleEquip(item.id)}
                            className="px-2 py-1 rounded text-[10px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                          >
                            Kuşan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => handleSell(item, event)}
                          disabled={Boolean(item.locked) || merchantGold < saleUnitPrice}
                          data-testid={`market-sell-${item.id}`}
                          title="Tık: 1 adet · Shift: 5 adet · Ctrl: kasanın alabildiği tümü"
                          className="px-2 py-1 rounded text-[10px] font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Sat (+{saleUnitPrice} D)
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ALT BAR — Bannerlord'daki "Cancel | net sonuç | Done" şeridi */}
        <div className="shrink-0 border-t border-[#c6a15b]/30 bg-[#16120e] px-4 py-2 flex items-center justify-between gap-3 text-xs">
          <span className="text-[#8b8072]">
            {settlement ? `${settlement.name} pazaryeri` : 'Pazaryeri'} · tüccar kesesi{' '}
            <strong className="text-[#fbbf24] font-mono-tabular">{merchantGold} D</strong>
          </span>
          <span
            className={`font-mono-tabular font-bold ${
              session.net > 0 ? 'text-[#34d399]' : session.net < 0 ? 'text-[#fca5a5]' : 'text-[#a2957f]'
            }`}
            title="Bu pazaryerinde yaptığın alışverişin net sonucu"
          >
            {session.net > 0 ? '+' : ''}
            {session.net} D · {session.itemsBought} alış / {session.itemsSold} satış
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="market-cancel"
              className="px-4 py-1.5 rounded text-xs font-bold bg-[#26211a] hover:bg-[#382f25] text-[#e2d6c1] border border-[#c6a15b]/35 shadow"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleDone}
              data-testid="market-done"
              className="px-4 py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 shadow"
            >
              Bitti<span className="sr-only"> (Bitir)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
