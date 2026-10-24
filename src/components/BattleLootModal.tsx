import React, { useMemo, useState } from 'react';
import type {
  CampaignHero,
  CampaignState,
  EquipmentSetId,
  EquipmentSlotId,
  InventoryItem,
  ItemCategory,
  ItemDefinition,
} from '../game/rules.ts';
import {
  EQUIPMENT_SLOT_IDS,
  PLAYER_HERO_ID,
  equipInventoryItemForHero,
  getPlayerHero,
  inventoryItemQuantity,
  inventoryTotalQuantity,
  inventoryTotalWeight,
  resolveItemDefinition,
  setHeroActiveEquipmentSet,
  toggleInventoryStackLocked,
  unequipHeroEquipmentSlot,
} from '../game/bannerlordFoundation.ts';
import {
  commitBattleLoot,
  leaveAllUnlockedToLoot,
  previewLootDiscard,
  takeAllLoot,
  transferInventoryToLoot,
  transferLootToInventory,
  type CommitBattleLootResult,
  type PendingBattleLoot,
} from '../game/lootTransaction.ts';
import { deriveRigVisualOptionsFromEquipment } from '../game/characterRig.ts';
import { ITEM_ICON_KEYS, type ItemIconKey } from '../game/itemIcons.ts';
import { calculatePartyCarryCapacity } from '../game/logistics.ts';
import { HeroMannequin } from './HeroMannequin.tsx';
import { ItemIcon } from './ItemIcon.tsx';

export interface BattleLootModalProps {
  campaign: CampaignState;
  pendingLoot: PendingBattleLoot;
  onClose: () => void;
  onCommit: (result: CommitBattleLootResult) => void;
}

type InventoryCategoryFilter = ItemCategory | 'ALL';
type InventorySort =
  | 'tier'
  | 'name'
  | 'quantity'
  | 'value_desc'
  | 'value_asc'
  | 'weight'
  | 'damage'
  | 'armor';

const SLOT_LABELS: Record<EquipmentSlotId, string> = {
  HEAD: 'Başlık',
  SHOULDER: 'Omuzluk',
  BODY: 'Gövde',
  GLOVES: 'Eldiven',
  LEG: 'Çizme',
  MOUNT: 'Binek',
  HARNESS: 'Koşum / At Zırhı',
  BANNER: 'Sancak',
  WEAPON1: 'Silah I',
  WEAPON2: 'Silah II',
  WEAPON3: 'Silah III',
  WEAPON4: 'Silah IV',
};

const SLOT_EMPTY_TEXT: Record<EquipmentSlotId, string> = {
  HEAD: 'Başlıksız',
  SHOULDER: 'Omuzluksuz',
  BODY: 'Sivil Tunik',
  GLOVES: 'Eldivensiz',
  LEG: 'Çizmesiz',
  MOUNT: 'Bineksiz',
  HARNESS: 'Koşumsuz',
  BANNER: 'Sancaksız',
  WEAPON1: 'Silahsız',
  WEAPON2: 'Boş Slot',
  WEAPON3: 'Boş Slot',
  WEAPON4: 'Boş Slot',
};

const CATEGORY_OPTIONS: Array<{ id: InventoryCategoryFilter; label: string; iconKey: ItemIconKey }> = [
  { id: 'ALL', label: 'Tümü', iconKey: 'crate' },
  { id: 'WEAPON', label: 'Silahlar', iconKey: 'sword' },
  { id: 'SHIELD', label: 'Kalkanlar', iconKey: 'shield' },
  { id: 'ARMOR', label: 'Zırhlar', iconKey: 'armor' },
  { id: 'HORSE', label: 'Binekler', iconKey: 'horse' },
  { id: 'FOOD', label: 'Erzak', iconKey: 'grain' },
  { id: 'TRADE', label: 'Emtia', iconKey: 'crate' },
];

function validIconKey(icon: string | undefined): ItemIconKey {
  return icon && ITEM_ICON_KEYS.includes(icon as ItemIconKey) ? (icon as ItemIconKey) : 'crate';
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

function quantityFromClick(event: React.MouseEvent, available: number): number {
  const desired = event.ctrlKey || event.metaKey ? available : event.shiftKey ? 5 : 1;
  return Math.max(0, Math.min(desired, available));
}

function formatWeight(value: number): string {
  return `${Math.round(value * 10) / 10} kg`;
}

/**
 * Bannerlord Savaş Sonrası Ganimet Ekranı.
 *
 * Sol: Düşmandan ele geçirilen ganimet eşyaları + Tümünü Al + Discard XP önizlemesi.
 * Orta: 360° döndürülebilir kahraman mankeni, 12 kuşanım slotu ve istatistikler.
 * Sağ: Parti envanteri + Tümünü Bırak + kilit + filtre/arama/sıralama.
 * Alt: Zafer altını, taşıma ağırlığı ve Bitti / Vazgeç eylemleri.
 */
export const BattleLootModal: React.FC<BattleLootModalProps> = ({
  campaign: committedCampaign,
  pendingLoot,
  onClose,
  onCommit,
}) => {
  const [draftCampaign, setDraftCampaign] = useState<CampaignState>(committedCampaign);
  const [lootItems, setLootItems] = useState<InventoryItem[]>(pendingLoot.lootItems);
  const [selectedHeroId, setSelectedHeroId] = useState<string>(
    () => getPlayerHero(committedCampaign)?.id ?? committedCampaign.heroes?.[0]?.id ?? PLAYER_HERO_ID,
  );
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<InventorySort>('tier');
  const [feedback, setFeedback] = useState<string | null>(null);

  const heroes = useMemo<CampaignHero[]>(
    () => (draftCampaign.heroes ?? []).filter((hero) => hero.isInPlayerParty),
    [draftCampaign.heroes],
  );
  const selectedHero =
    heroes.find((hero) => hero.id === selectedHeroId) ?? heroes[0] ?? getPlayerHero(draftCampaign);
  const selectedHeroIndex = selectedHero ? heroes.findIndex((hero) => hero.id === selectedHero.id) : -1;
  const activeSet: EquipmentSetId = selectedHero?.activeEquipmentSet ?? 'BATTLE';

  // Discard XP önizlemesi: sol tarafta bırakılan teçhizat
  const discardPreview = useMemo(
    () => previewLootDiscard(draftCampaign, lootItems),
    [draftCampaign, lootItems],
  );

  const filterAndSortItems = (items: InventoryItem[]) => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return [...items]
      .filter((item) => {
        const definition = resolveItemDefinition(draftCampaign, item.definitionId ?? item.id);
        const category = definition?.category ?? item.category ?? 'TRADE';
        if (selectedCategory !== 'ALL' && category !== selectedCategory) return false;
        if (!query) return true;
        return (
          item.name.toLocaleLowerCase('tr-TR').includes(query) ||
          item.statBonus.toLocaleLowerCase('tr-TR').includes(query)
        );
      })
      .sort((a, b) => {
        const defA = resolveItemDefinition(draftCampaign, a.definitionId ?? a.id);
        const defB = resolveItemDefinition(draftCampaign, b.definitionId ?? b.id);
        if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
        if (sortBy === 'quantity') return inventoryItemQuantity(b) - inventoryItemQuantity(a);
        if (sortBy === 'value_desc') return (defB?.baseValue ?? b.value) - (defA?.baseValue ?? a.value);
        if (sortBy === 'value_asc') return (defA?.baseValue ?? a.value) - (defB?.baseValue ?? b.value);
        if (sortBy === 'weight') return (defA?.weight ?? a.weight) - (defB?.weight ?? b.weight);
        if (sortBy === 'damage') return (defB?.stats.damage ?? 0) - (defA?.stats.damage ?? 0);
        if (sortBy === 'armor') {
          return (defB ? definitionArmorTotal(defB) : 0) - (defA ? definitionArmorTotal(defA) : 0);
        }
        return (defB?.tier ?? b.tier ?? 0) - (defA?.tier ?? a.tier ?? 0) || a.name.localeCompare(b.name, 'tr');
      });
  };

  const filteredLoot = useMemo(() => filterAndSortItems(lootItems), [draftCampaign, lootItems, searchQuery, selectedCategory, sortBy]);
  const filteredInventory = useMemo(
    () => filterAndSortItems(draftCampaign.inventoryItems ?? []),
    [draftCampaign, searchQuery, selectedCategory, sortBy],
  );

  const equipmentRows = useMemo(() => {
    if (!selectedHero) return [];
    return EQUIPMENT_SLOT_IDS.map((slot) => {
      const definitionId = selectedHero.equipment[activeSet][slot];
      return {
        slot,
        definitionId,
        definition: definitionId ? resolveItemDefinition(draftCampaign, definitionId) : null,
      };
    });
  }, [activeSet, draftCampaign, selectedHero]);

  const armorTotals = useMemo(() => {
    const totals = { head: 0, body: 0, arm: 0, leg: 0, mount: 0 };
    for (const row of equipmentRows) {
      if (!row.definition) continue;
      totals.head += row.definition.stats.armorHead ?? 0;
      totals.body += row.definition.stats.armorBody ?? 0;
      totals.arm += row.definition.stats.armorArm ?? 0;
      totals.leg += row.definition.stats.armorLeg ?? 0;
      totals.mount += row.definition.stats.armorMount ?? 0;
    }
    return totals;
  }, [equipmentRows]);

  const primaryDamage = useMemo(() => {
    const damages = equipmentRows
      .filter((row) => row.slot.startsWith('WEAPON'))
      .map((row) => row.definition?.stats.damage ?? 0);
    return Math.max(0, ...damages);
  }, [equipmentRows]);

  const shieldDurability = useMemo(() => {
    const values = equipmentRows.map((row) => row.definition?.stats.shieldDurability ?? 0);
    return Math.max(0, ...values);
  }, [equipmentRows]);

  const visualOptions = useMemo(() => {
    const equipmentText: Partial<Record<EquipmentSlotId, string>> = {};
    for (const row of equipmentRows) {
      equipmentText[row.slot] = row.definition
        ? row.definition.statBonus
          ? `${row.definition.name} (${row.definition.statBonus})`
          : row.definition.name
        : SLOT_EMPTY_TEXT[row.slot];
    }
    return deriveRigVisualOptionsFromEquipment(equipmentText, '#b45309');
  }, [equipmentRows]);

  const inventoryQuantity = inventoryTotalQuantity(draftCampaign.inventoryItems);
  const inventoryWeight = inventoryTotalWeight(draftCampaign.inventoryItems);
  const lootQuantity = inventoryTotalQuantity(lootItems);
  const lootWeight = inventoryTotalWeight(lootItems);

  // Tek lojistik modeline bağlı taşıma kapasitesi (askerler + binekler + yük hayvanları)
  const totalTroops = (draftCampaign.troopStacks ?? []).reduce((sum, s) => sum + s.count, 0) || 20;
  const capacityBreakdown = useMemo(
    () =>
      calculatePartyCarryCapacity({
        healthyTroops: totalTroops,
        inventoryItems: draftCampaign.inventoryItems,
        perks: committedCampaign.unlockedPerks,
        state: draftCampaign,
      }),
    [draftCampaign, totalTroops, committedCampaign.unlockedPerks],
  );
  const carryCapacity = capacityBreakdown.totalCapacity;
  const isOverweight = capacityBreakdown.isOverweight;

  const moveHero = (direction: -1 | 1) => {
    if (heroes.length <= 1 || selectedHeroIndex < 0) return;
    const nextIndex = (selectedHeroIndex + direction + heroes.length) % heroes.length;
    setSelectedHeroId(heroes[nextIndex].id);
    setFeedback(null);
  };

  const handleSetActiveSet = (setId: EquipmentSetId) => {
    if (!selectedHero || activeSet === setId) return;
    const result = setHeroActiveEquipmentSet(draftCampaign, selectedHero.id, setId);
    if (!result.success) {
      setFeedback(result.reason ?? 'Ekipman seti değiştirilemedi.');
      return;
    }
    setDraftCampaign(result.nextState);
    setFeedback(`${selectedHero.name} için ${setId === 'BATTLE' ? 'savaş' : 'sivil'} set seçildi.`);
  };

  const handleTakeLootItem = (item: InventoryItem, event: React.MouseEvent) => {
    const quantity = quantityFromClick(event, inventoryItemQuantity(item));
    const result = transferLootToInventory(
      lootItems,
      draftCampaign.inventoryItems ?? [],
      item.id,
      quantity,
    );
    if (!result.success) {
      setFeedback(result.reason ?? 'Ganimet envantere aktarılamadı.');
      return;
    }
    setLootItems(result.sourceItems);
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.destinationItems }));
    setFeedback(`${result.movedQuantity} adet "${item.name}" envantere alındı.`);
  };

  const handleReturnInventoryItem = (item: InventoryItem, event: React.MouseEvent) => {
    const quantity = quantityFromClick(event, inventoryItemQuantity(item));
    const result = transferInventoryToLoot(
      draftCampaign.inventoryItems ?? [],
      lootItems,
      item.id,
      quantity,
    );
    if (!result.success) {
      setFeedback(result.reason ?? 'Eşya ganimet alanına bırakılamadı.');
      return;
    }
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.sourceItems }));
    setLootItems(result.destinationItems);
    setFeedback(`${result.movedQuantity} adet "${item.name}" ganimet/terk alanına bırakıldı.`);
  };

  const handleTakeAll = () => {
    if (lootItems.length === 0) return;
    const result = takeAllLoot(lootItems, draftCampaign.inventoryItems ?? []);
    setLootItems(result.nextLoot);
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.nextInventory }));
    setFeedback(`Tüm ganimet (${result.movedCount} adet) envantere aktarıldı.`);
  };

  const handleLeaveAll = () => {
    const unequipped = draftCampaign.inventoryItems ?? [];
    if (unequipped.length === 0) return;
    const result = leaveAllUnlockedToLoot(unequipped, lootItems);
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.nextInventory }));
    setLootItems(result.nextLoot);
    setFeedback(`Kilitli olmayan ${result.movedCount} adet eşya ganimet/terk alanına bırakıldı.`);
  };

  const handleToggleLock = (item: InventoryItem) => {
    const result = toggleInventoryStackLocked(draftCampaign.inventoryItems, item.id);
    if (!result.success) {
      setFeedback(result.reason ?? 'Kilit durumu değiştirilemedi.');
      return;
    }
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.items }));
    setFeedback(`"${item.name}" ${result.stack?.locked ? 'kilitlendi' : 'kilidi açıldı'}.`);
  };

  const handleEquip = (item: InventoryItem) => {
    if (!selectedHero) return;
    const result = equipInventoryItemForHero(draftCampaign, selectedHero.id, item.id, activeSet);
    if (!result.success) {
      setFeedback(result.reason ?? 'Eşya kuşanılamadı.');
      return;
    }
    setDraftCampaign(result.nextState);
    setFeedback(`"${item.name}", ${selectedHero.name} için ${SLOT_LABELS[result.slot!]} slotuna kuşanıldı.`);
  };

  const handleUnequip = (slot: EquipmentSlotId) => {
    if (!selectedHero) return;
    const result = unequipHeroEquipmentSlot(draftCampaign, selectedHero.id, slot, activeSet);
    if (!result.success) {
      setFeedback(result.reason ?? 'Ekipman çıkarılamadı.');
      return;
    }
    setDraftCampaign(result.nextState);
    setFeedback(`${SLOT_LABELS[slot]} ekipmanı parti envanterine döndü.`);
  };

  const handleCommitDone = () => {
    const result = commitBattleLoot(committedCampaign, pendingLoot, {
      finalInventoryItems: draftCampaign.inventoryItems ?? [],
      leftoverLootItems: lootItems,
      applyDiscard: true,
    });
    onCommit(result);
  };

  return (
    <div
      className="fixed inset-0 modal-anim-in z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loot-modal-title"
      data-testid="battle-loot-modal"
    >
      <div className="hud-panel rounded-xl flex flex-col w-full h-[95vh] max-w-[1560px] overflow-hidden border border-[#c6a15b]/40 shadow-2xl bg-[#0f0d0a]/95 text-[#e5d8c3]">
        {/* Üst Başlık Şeridi */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#c6a15b]/25 bg-[#16120c]/90">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚔️</span>
            <div>
              <h2 id="loot-modal-title" className="text-lg font-display font-bold tracking-wide text-[#fbbf24]">
                {pendingLoot.isSiegeVictory ? 'KUŞATMA ZAFERİ GANİMETİ' : 'MUHAREBE MEYDANI GANİMETİ'}
              </h2>
              <p className="text-xs text-[#a89b84]">
                Düşman hatları dağıtıldı. Ele geçirilen ganimeti seçin, doğrudan kuşanın veya ordugaha aktarın.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono-tabular">
            <div className="px-3 py-1.5 rounded bg-[#1f1a13] border border-[#c6a15b]/30 text-[#fbbf24]">
              Hazine Ganimeti: <span className="font-bold">+{pendingLoot.goldLoot} Dinar</span>
            </div>
            <div className="px-3 py-1.5 rounded bg-[#1f1a13] border border-[#c6a15b]/30 text-[#34d399]">
              Zafer Namı: <span className="font-bold">+{pendingLoot.renownGain} Nam</span>
            </div>
            <div className="px-3 py-1.5 rounded bg-[#1f1a13] border border-[#c6a15b]/30 text-[#60a5fa]">
              Tutsaklar: <span className="font-bold">+{pendingLoot.prisonersGain} Esir</span>
            </div>
          </div>
        </div>

        {/* Geri Bildirim Şeridi */}
        {feedback && (
          <div className="px-6 py-1.5 text-xs bg-[#241c10] border-b border-[#c6a15b]/30 text-[#f6d28b] flex items-center justify-between">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[#a89b84] hover:text-[#f8f0df] text-xs"
            >
              ×
            </button>
          </div>
        )}

        {/* 3 Sütunlu Ana Gövde */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#c6a15b]/20">
          {/* SOL SÜTUN: GANİMET LİSTESİ (4 Kolon) */}
          <div className="lg:col-span-4 flex flex-col min-h-0 bg-[#120f0b]/60">
            {/* Ganimet Başlık & Tümünü Al */}
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#18130d]">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#e2d6c1] flex items-center gap-1.5">
                  <ItemIcon iconKey="crate" size={14} className="text-[#fbbf24]" />
                  Ele Geçirilen Ganimet
                </span>
                <span className="text-[11px] text-[#a89b84] block font-mono-tabular">
                  {lootQuantity} adet · {formatWeight(lootWeight)}
                </span>
              </div>
              <button
                type="button"
                data-testid="loot-take-all"
                disabled={lootItems.length === 0}
                onClick={handleTakeAll}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#2a2216] hover:bg-[#3b2f1f] text-[#fbbf24] border border-[#c6a15b]/40 disabled:opacity-40 transition-colors"
              >
                Tümünü Al →
              </button>
            </div>

            {/* Arama & Kategori & Sıralama */}
            <div className="p-2.5 border-b border-[#c6a15b]/15 space-y-2 bg-[#14100b]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ganimet veya özellik ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs rounded bg-[#0a0806] border border-[#c6a15b]/30 text-[#f8f0df] focus:border-[#fbbf24] outline-none"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as InventorySort)}
                  className="px-2 py-1 text-xs rounded bg-[#0a0806] border border-[#c6a15b]/30 text-[#d1c5b0] outline-none font-mono-tabular"
                >
                  <option value="tier">Kademe</option>
                  <option value="name">İsim</option>
                  <option value="quantity">Adet</option>
                  <option value="value_desc">Pahalı</option>
                  <option value="value_asc">Ucuz</option>
                  <option value="weight">Ağırlık</option>
                  <option value="damage">Hasar</option>
                  <option value="armor">Zırh</option>
                </select>
              </div>

              {/* Kategori Filtre Butonları */}
              <div className="flex flex-wrap gap-1">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-[#c6a15b] text-[#120f0b] font-bold'
                        : 'bg-[#1b1610] text-[#a89b84] hover:text-[#f8f0df] border border-[#c6a15b]/15'
                    }`}
                  >
                    <ItemIcon iconKey={cat.iconKey} size={12} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ganimet Eşya Listesi */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5" data-testid="loot-items-list">
              {filteredLoot.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center p-6 text-[#8a7c68] text-xs">
                  {lootItems.length === 0 ? 'Savaş alanındaki tüm ganimet alındı.' : 'Seçili filtrelere uygun eşya yok.'}
                </div>
              ) : (
                filteredLoot.map((item) => {
                  const def = resolveItemDefinition(draftCampaign, item.definitionId ?? item.id);
                  const qty = inventoryItemQuantity(item);
                  return (
                    <div
                      key={item.id}
                      className="group p-2 rounded bg-[#18130d] hover:bg-[#221b12] border border-[#c6a15b]/15 hover:border-[#c6a15b]/40 flex items-center justify-between gap-2 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="relative w-8 h-8 rounded bg-[#241c12] border border-[#c6a15b]/30 flex items-center justify-center shrink-0">
                          <ItemIcon iconKey={validIconKey(def?.icon ?? item.icon)} size={18} className="text-[#fbbf24]" />
                          {item.tier !== undefined && item.tier > 0 && (
                            <span className="absolute -top-1 -right-1 text-[9px] px-1 rounded bg-[#b45309] text-white font-bold leading-tight">
                              T{item.tier}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#f8f0df] truncate flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {qty > 1 && (
                              <span className="text-[11px] font-mono-tabular px-1.5 py-0.2 rounded bg-[#332617] text-[#fbbf24]">
                                ×{qty}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#a89b84] truncate">
                            {item.statBonus || SLOT_LABELS[item.slot as EquipmentSlotId] || item.slot}
                            <span className="mx-1">·</span>
                            {formatWeight(item.weight)}
                            <span className="mx-1">·</span>
                            <span className="text-[#f59e0b] font-mono-tabular">{item.value} D</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid={`loot-transfer-${item.definitionId ?? item.id}`}
                          onClick={(e) => handleTakeLootItem(item, e)}
                          title="Tık: 1 adet, Shift: 5 adet, Ctrl/Cmd: Tümünü al"
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-[#2a2014] hover:bg-[#b45309] text-[#fbbf24] hover:text-white border border-[#c6a15b]/30 transition-colors"
                        >
                          Al →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sol Sütun Altı: Discard / Birlik XP Önizlemesi */}
            <div className="p-3 border-t border-[#c6a15b]/20 bg-[#16110a] text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[#d1c5b0]">
                <span className="font-semibold flex items-center gap-1.5">
                  <ItemIcon iconKey="sword" size={13} className="text-[#c6a15b]" />
                  Terk Edilen Teçhizat:
                </span>
                <span className="font-mono-tabular text-[#a89b84]">{lootQuantity} eşya sol tarafta</span>
              </div>

              {discardPreview.grossXp > 0 ? (
                <div className="p-2 rounded bg-[#1e170d] border border-[#c6a15b]/30 space-y-1">
                  <div className="flex items-center justify-between text-[#34d399] font-bold">
                    <span>Kazanılacak Birlik XP'si:</span>
                    <span className="font-mono-tabular">+{discardPreview.acceptedXp} XP</span>
                  </div>
                  {discardPreview.exceedsCapacity && (
                    <div className="text-[11px] text-[#f87171] leading-tight">
                      ⚠️ {discardPreview.overflowXp} XP birlik seviye ihtiyacını aşıyor ve boşa gidecek!
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-[#8a7c68] leading-tight">
                  {lootQuantity > 0
                    ? 'İdare 100/125 Discard perki yoksa sol taraftaki eşyalar savaş alanında terk edilir.'
                    : 'Tüm ganimet toplandı; terk edilen eşya yok.'}
                </div>
              )}
            </div>
          </div>

          {/* ORTA SÜTUN: 3B KAHRAMAN MANKENİ VE SLOTLAR (4 Kolon) */}
          <div className="lg:col-span-4 flex flex-col min-h-0 bg-[#0e0c09] relative">
            {/* Kahraman Seçimi ve Set Değişimi */}
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#15110c] z-10">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="loot-hero-prev"
                  disabled={heroes.length <= 1}
                  onClick={() => moveHero(-1)}
                  className="w-6 h-6 rounded bg-[#241c12] hover:bg-[#332617] disabled:opacity-30 text-xs text-[#fbbf24] flex items-center justify-center"
                >
                  ◀
                </button>
                <div className="text-center px-2">
                  <span className="text-xs font-bold text-[#f8f0df] block truncate max-w-[140px]">
                    {selectedHero?.name ?? 'Kahraman'}
                  </span>
                  <span className="text-[10px] text-[#a89b84]">
                    {selectedHero?.id === PLAYER_HERO_ID ? 'Parti Lideri' : 'Yoldaş'}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="loot-hero-next"
                  disabled={heroes.length <= 1}
                  onClick={() => moveHero(1)}
                  className="w-6 h-6 rounded bg-[#241c12] hover:bg-[#332617] disabled:opacity-30 text-xs text-[#fbbf24] flex items-center justify-center"
                >
                  ▶
                </button>
              </div>

              {/* Set Seçimi */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="loot-set-battle"
                  onClick={() => handleSetActiveSet('BATTLE')}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    activeSet === 'BATTLE'
                      ? 'bg-[#b45309] text-white'
                      : 'bg-[#1e1710] text-[#a89b84] hover:text-[#f8f0df]'
                  }`}
                >
                  Savaş
                </button>
                <button
                  type="button"
                  data-testid="loot-set-civilian"
                  onClick={() => handleSetActiveSet('CIVILIAN')}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    activeSet === 'CIVILIAN'
                      ? 'bg-[#b45309] text-white'
                      : 'bg-[#1e1710] text-[#a89b84] hover:text-[#f8f0df]'
                  }`}
                >
                  Sivil
                </button>
              </div>
            </div>

            {/* 3B Manken Sahnesi */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <HeroMannequin
                visualOptions={visualOptions}
                showMount={Boolean(selectedHero?.equipment[activeSet].MOUNT)}
                testId="loot-hero-mannequin"
              />

              {/* Sol Slotlar (Zırh & Binek) */}
              <div className="absolute left-2 top-2 bottom-2 w-28 flex flex-col justify-between pointer-events-auto z-10 py-1">
                {(['HEAD', 'SHOULDER', 'BODY', 'GLOVES', 'LEG', 'MOUNT'] as EquipmentSlotId[]).map((slot) => {
                  const row = equipmentRows.find((r) => r.slot === slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-testid={`loot-slot-${slot}`}
                      onClick={() => row?.definitionId && handleUnequip(slot)}
                      title={row?.definition ? `${row.definition.name} (Çıkarmak için tıkla)` : `${SLOT_LABELS[slot]} (Boş)`}
                      className="p-1 rounded bg-[#130f0a]/85 hover:bg-[#201810] border border-[#c6a15b]/25 hover:border-[#fbbf24] text-left transition-colors flex items-center gap-1.5"
                    >
                      <ItemIcon iconKey={validIconKey(row?.definition?.icon)} size={14} className="text-[#fbbf24] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] text-[#a89b84] block leading-none">{SLOT_LABELS[slot]}</span>
                        <span className="text-[10px] text-[#f8f0df] truncate block font-medium">
                          {row?.definition?.name ?? SLOT_EMPTY_TEXT[slot]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Sağ Slotlar (Silahlar & Sancak & Koşum) */}
              <div className="absolute right-2 top-2 bottom-2 w-28 flex flex-col justify-between pointer-events-auto z-10 py-1">
                {(['HARNESS', 'BANNER', 'WEAPON1', 'WEAPON2', 'WEAPON3', 'WEAPON4'] as EquipmentSlotId[]).map((slot) => {
                  const row = equipmentRows.find((r) => r.slot === slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-testid={`loot-slot-${slot}`}
                      onClick={() => row?.definitionId && handleUnequip(slot)}
                      title={row?.definition ? `${row.definition.name} (Çıkarmak için tıkla)` : `${SLOT_LABELS[slot]} (Boş)`}
                      className="p-1 rounded bg-[#130f0a]/85 hover:bg-[#201810] border border-[#c6a15b]/25 hover:border-[#fbbf24] text-left transition-colors flex items-center gap-1.5"
                    >
                      <ItemIcon iconKey={validIconKey(row?.definition?.icon)} size={14} className="text-[#fbbf24] shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] text-[#a89b84] block leading-none">{SLOT_LABELS[slot]}</span>
                        <span className="text-[10px] text-[#f8f0df] truncate block font-medium">
                          {row?.definition?.name ?? SLOT_EMPTY_TEXT[slot]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orta Sütun Altı: Kahraman İstatistik Özeti */}
            <div className="p-2.5 border-t border-[#c6a15b]/20 bg-[#14100c] z-10 font-mono-tabular text-[11px] grid grid-cols-4 gap-2 text-center">
              <div className="rounded bg-[#1a140e] p-1 border border-[#c6a15b]/15">
                <span className="text-[10px] text-[#a89b84] block">Baş Zırhı</span>
                <span className="text-[#f8f0df] font-bold">+{armorTotals.head}</span>
              </div>
              <div className="rounded bg-[#1a140e] p-1 border border-[#c6a15b]/15">
                <span className="text-[10px] text-[#a89b84] block">Gövde Zırhı</span>
                <span className="text-[#f8f0df] font-bold">+{armorTotals.body}</span>
              </div>
              <div className="rounded bg-[#1a140e] p-1 border border-[#c6a15b]/15">
                <span className="text-[10px] text-[#a89b84] block">Silah Hasarı</span>
                <span className="text-[#fbbf24] font-bold">{primaryDamage || '-'}</span>
              </div>
              <div className="rounded bg-[#1a140e] p-1 border border-[#c6a15b]/15">
                <span className="text-[10px] text-[#a89b84] block">Kalkan Dayan.</span>
                <span className="text-[#60a5fa] font-bold">{shieldDurability || '-'}</span>
              </div>
            </div>
          </div>

          {/* SAĞ SÜTUN: PARTİ ENVANTERİ (4 Kolon) */}
          <div className="lg:col-span-4 flex flex-col min-h-0 bg-[#120f0b]/60">
            {/* Parti Envanteri Başlık & Tümünü Bırak */}
            <div className="p-3 border-b border-[#c6a15b]/20 flex items-center justify-between bg-[#18130d]">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#e2d6c1] flex items-center gap-1.5">
                  <ItemIcon iconKey="crate" size={14} className="text-[#c6a15b]" />
                  Parti Çantası
                </span>
                <span className={`text-[11px] font-mono-tabular block ${isOverweight ? 'text-[#f87171] font-bold' : 'text-[#a89b84]'}`}>
                  {inventoryQuantity} adet · {formatWeight(inventoryWeight)} / {formatWeight(carryCapacity)}
                </span>
              </div>
              <button
                type="button"
                data-testid="loot-leave-all"
                disabled={draftCampaign.inventoryItems?.length === 0}
                onClick={handleLeaveAll}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#2a2216] hover:bg-[#3b2f1f] text-[#fbbf24] border border-[#c6a15b]/40 disabled:opacity-40 transition-colors"
              >
                ← Tümünü Bırak
              </button>
            </div>

            {/* Arama & Kategori & Sıralama (Aynı filtreler paylaşılır) */}
            <div className="p-2.5 border-b border-[#c6a15b]/15 space-y-2 bg-[#14100b]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Çantada ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs rounded bg-[#0a0806] border border-[#c6a15b]/30 text-[#f8f0df] focus:border-[#fbbf24] outline-none"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as InventorySort)}
                  className="px-2 py-1 text-xs rounded bg-[#0a0806] border border-[#c6a15b]/30 text-[#d1c5b0] outline-none font-mono-tabular"
                >
                  <option value="tier">Kademe</option>
                  <option value="name">İsim</option>
                  <option value="quantity">Adet</option>
                  <option value="value_desc">Pahalı</option>
                  <option value="value_asc">Ucuz</option>
                  <option value="weight">Ağırlık</option>
                  <option value="damage">Hasar</option>
                  <option value="armor">Zırh</option>
                </select>
              </div>

              {/* Kategori Filtre Butonları */}
              <div className="flex flex-wrap gap-1">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-[#c6a15b] text-[#120f0b] font-bold'
                        : 'bg-[#1b1610] text-[#a89b84] hover:text-[#f8f0df] border border-[#c6a15b]/15'
                    }`}
                  >
                    <ItemIcon iconKey={cat.iconKey} size={12} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Çanta Eşya Listesi */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5" data-testid="loot-inventory-list">
              {filteredInventory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center p-6 text-[#8a7c68] text-xs">
                  Çanta boş.
                </div>
              ) : (
                filteredInventory.map((item) => {
                  const def = resolveItemDefinition(draftCampaign, item.definitionId ?? item.id);
                  const qty = inventoryItemQuantity(item);
                  const isEquipable = Boolean(def?.slot && def.slot !== 'TRADE');

                  return (
                    <div
                      key={item.id}
                      className="group p-2 rounded bg-[#18130d] hover:bg-[#221b12] border border-[#c6a15b]/15 hover:border-[#c6a15b]/40 flex items-center justify-between gap-2 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="relative w-8 h-8 rounded bg-[#241c12] border border-[#c6a15b]/30 flex items-center justify-center shrink-0">
                          <ItemIcon iconKey={validIconKey(def?.icon ?? item.icon)} size={18} className="text-[#c6a15b]" />
                          {item.tier !== undefined && item.tier > 0 && (
                            <span className="absolute -top-1 -right-1 text-[9px] px-1 rounded bg-[#b45309] text-white font-bold leading-tight">
                              T{item.tier}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#f8f0df] truncate flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {qty > 1 && (
                              <span className="text-[11px] font-mono-tabular px-1.5 py-0.2 rounded bg-[#332617] text-[#fbbf24]">
                                ×{qty}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#a89b84] truncate">
                            {item.statBonus || SLOT_LABELS[item.slot as EquipmentSlotId] || item.slot}
                            <span className="mx-1">·</span>
                            {formatWeight(item.weight)}
                            <span className="mx-1">·</span>
                            <span className="text-[#f59e0b] font-mono-tabular">{item.value} D</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Kilit Butonu */}
                        <button
                          type="button"
                          data-testid={`loot-lock-${item.definitionId ?? item.id}`}
                          onClick={() => handleToggleLock(item)}
                          title={item.locked ? 'Kilidi aç' : 'Kilitle'}
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-colors ${
                            item.locked
                              ? 'bg-[#7f1d1d]/70 text-[#fca5a5] border border-[#ef4444]/40'
                              : 'bg-[#241c12] text-[#8a7c68] hover:text-[#f8f0df]'
                          }`}
                        >
                          {item.locked ? '🔒' : '🔓'}
                        </button>

                        {/* Kuşan Butonu */}
                        {isEquipable && (
                          <button
                            type="button"
                            data-testid={`loot-equip-${item.definitionId ?? item.id}`}
                            onClick={() => handleEquip(item)}
                            className="px-2 py-1 rounded text-[11px] font-semibold bg-[#221c13] hover:bg-[#342718] text-[#c6a15b] hover:text-[#fbbf24] border border-[#c6a15b]/25 transition-colors"
                          >
                            Kuşan
                          </button>
                        )}

                        {/* Bırak Butonu */}
                        <button
                          type="button"
                          data-testid={`loot-return-${item.definitionId ?? item.id}`}
                          disabled={item.locked}
                          onClick={(e) => handleReturnInventoryItem(item, e)}
                          title={item.locked ? 'Kilitli eşyalar bırakılamaz' : 'Tık: 1 adet, Shift: 5 adet, Ctrl/Cmd: Tümünü bırak'}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-[#2a2014] hover:bg-[#3a2c1a] text-[#fbbf24] border border-[#c6a15b]/30 disabled:opacity-30 transition-colors"
                        >
                          ← Bırak
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sağ Sütun Altı: Kapasite ve Taşıma Durumu */}
            <div className="p-3 border-t border-[#c6a15b]/20 bg-[#16110a] text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#a89b84]">Ordu Taşıma Kapasitesi:</span>
                <span className="font-mono-tabular font-bold text-[#f8f0df]">{formatWeight(carryCapacity)}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#201810] mt-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all ${isOverweight ? 'bg-[#ef4444]' : 'bg-[#c6a15b]'}`}
                  style={{ width: `${Math.min(100, Math.round((inventoryWeight / carryCapacity) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ALT ŞERİT (Footer Action Bar) */}
        <div className="p-3 sm:px-6 sm:py-3.5 border-t border-[#c6a15b]/30 bg-[#15110b] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs font-mono-tabular">
            <span className="text-[#fbbf24] font-semibold">
              Kazanılan Altın: +{pendingLoot.goldLoot} Dinar
            </span>
            {discardPreview.acceptedXp > 0 && (
              <span className="text-[#34d399] font-semibold">
                Birlik XP Bağışı: +{discardPreview.acceptedXp} XP
              </span>
            )}
            {isOverweight && (
              <span className="text-[#f87171] font-semibold">
                ⚠️ Aşırı Yük: Parti haritada yavaşlayacak!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="loot-cancel"
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold bg-[#241c12] hover:bg-[#332617] text-[#e2d6c1] border border-[#c6a15b]/30 transition-colors"
            >
              Ganimeti Terk Et
            </button>
            <button
              type="button"
              data-testid="loot-done"
              onClick={handleCommitDone}
              className="px-6 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white shadow-lg transition-colors"
            >
              Ganimeti Al ve Devam Et [Bitti]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
