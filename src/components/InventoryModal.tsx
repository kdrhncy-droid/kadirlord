import React, { useMemo, useState } from 'react';
import type {
  CampaignHero,
  CampaignState,
  EquipmentSetId,
  EquipmentSlotId,
  InventoryItem,
  ItemCategory,
  ItemDefinition,
} from '../game/rules';
import {
  EQUIPMENT_SLOT_IDS,
  PLAYER_HERO_ID,
  addInventoryStackQuantity,
  applyDiscardDonation,
  discardEligibility,
  equipInventoryItemForHero,
  getPlayerHero,
  inventoryItemQuantity,
  inventoryTotalQuantity,
  inventoryTotalWeight,
  itemDiscardXpPerUnit,
  previewDiscardDonation,
  resolveItemDefinition,
  setHeroActiveEquipmentSet,
  toggleInventoryStackLocked,
  transferInventoryQuantity,
  unequipHeroEquipmentSlot,
} from '../game/bannerlordFoundation';
import { deriveRigVisualOptionsFromEquipment } from '../game/characterRig';
import { ITEM_ICON_KEYS, type ItemIconKey } from '../game/itemIcons';
import { calculatePartyLogistics } from '../game/logistics';
import { HeroMannequin } from './HeroMannequin';
import { ItemIcon } from './ItemIcon';

interface InventoryModalProps {
  campaign: CampaignState;
  onClose: () => void;
  onUpdateCampaign: (nextState: CampaignState) => void;
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

function defaultSlotIconKey(slot: EquipmentSlotId): ItemIconKey {
  switch (slot) {
    case 'HEAD':
      return 'helmet';
    case 'SHOULDER':
    case 'BODY':
    case 'GLOVES':
    case 'LEG':
      return 'armor';
    case 'MOUNT':
    case 'HARNESS':
      return 'horse';
    case 'BANNER':
      return 'shield';
    case 'WEAPON1':
    case 'WEAPON2':
    case 'WEAPON3':
    case 'WEAPON4':
      return 'sword';
    default:
      return 'crate';
  }
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

function mergedCustomDefinitions(state: CampaignState, fallback: CampaignState): ItemDefinition[] {
  const byId = new Map<string, ItemDefinition>();
  for (const definition of fallback.customItemDefinitions ?? []) byId.set(definition.id, definition);
  for (const definition of state.customItemDefinitions ?? []) byId.set(definition.id, definition);
  return [...byId.values()];
}

function quantityFromClick(event: React.MouseEvent, available: number): number {
  const desired = event.ctrlKey || event.metaKey ? available : event.shiftKey ? 5 : 1;
  return Math.max(0, Math.min(desired, available));
}

function formatWeight(value: number): string {
  return `${Math.round(value * 10) / 10} kg`;
}

/**
 * Bannerlord saha envanteri.
 *
 * Sol Discard listesi ve ortadaki ekipman değişiklikleri yalnız yerel bir
 * kampanya taslağında yaşar. `Bitti` Discard bağışını da aynı taslağa
 * atomik uygulayıp tek seferde işler; `Vazgeç`/Esc taslağı çöpe atar.
 */
export const InventoryModal: React.FC<InventoryModalProps> = ({
  campaign: committedCampaign,
  onClose,
  onUpdateCampaign,
}) => {
  const [draftCampaign, setDraftCampaign] = useState<CampaignState>(committedCampaign);
  const [discardItems, setDiscardItems] = useState<InventoryItem[]>([]);
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

  const previewState = useMemo<CampaignState>(
    () => ({
      ...draftCampaign,
      customItemDefinitions: mergedCustomDefinitions(draftCampaign, committedCampaign),
    }),
    [committedCampaign, draftCampaign],
  );

  const discardSelections = useMemo(() => {
    const byDefinition = new Map<string, number>();
    for (const item of discardItems) {
      const definitionId = item.definitionId ?? item.id;
      byDefinition.set(definitionId, (byDefinition.get(definitionId) ?? 0) + inventoryItemQuantity(item));
    }
    return [...byDefinition].map(([definitionId, quantity]) => ({ definitionId, quantity }));
  }, [discardItems]);

  const discardPreview = useMemo(
    () => previewDiscardDonation(previewState, discardSelections),
    [discardSelections, previewState],
  );
  const discardPreviewByDefinition = useMemo(
    () => new Map(discardPreview.lines.map((line) => [line.definition.id, line])),
    [discardPreview.lines],
  );

  const filteredInventory = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return [...(draftCampaign.inventoryItems ?? [])]
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
  }, [draftCampaign, searchQuery, selectedCategory, sortBy]);

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

  const equippedWeight = useMemo(
    () => equipmentRows.reduce((sum, row) => sum + (row.definition?.weight ?? 0), 0),
    [equipmentRows],
  );
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
  const discardQuantity = inventoryTotalQuantity(discardItems);
  const discardWeight = inventoryTotalWeight(discardItems);

  const healthyTroops =
    (draftCampaign.troopStacks ?? []).reduce((sum, s) => sum + s.count, 0) || 20;
  const partyLogistics = useMemo(
    () =>
      calculatePartyLogistics({
        x: draftCampaign.playerX,
        z: draftCampaign.playerZ,
        healthyTroops,
        cavalryCount: draftCampaign.roster.cavalry,
        woundedCount: (draftCampaign.troopStacks ?? []).reduce(
          (sum, s) => sum + (s.wounded ?? 0),
          0,
        ),
        prisonerCount: draftCampaign.prisoners,
        inventoryItems: draftCampaign.inventoryItems,
        morale: draftCampaign.morale,
        perks: draftCampaign.unlockedPerks,
        state: draftCampaign,
      }),
    [draftCampaign, healthyTroops],
  );

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
    setFeedback(
      `${selectedHero.name} için ${setId === 'BATTLE' ? 'savaş' : 'sivil'} set bekleyen taslağa seçildi.`,
    );
  };

  const handleEquip = (item: InventoryItem) => {
    if (!selectedHero) return;
    const result = equipInventoryItemForHero(draftCampaign, selectedHero.id, item.id, activeSet);
    if (!result.success) {
      setFeedback(result.reason ?? 'Eşya kuşanılamadı.');
      return;
    }
    setDraftCampaign(result.nextState);
    setFeedback(`"${item.name}", ${selectedHero.name} için ${SLOT_LABELS[result.slot!]} slotuna taslakta kuşanıldı.`);
  };

  const handleUnequip = (slot: EquipmentSlotId) => {
    if (!selectedHero) return;
    const result = unequipHeroEquipmentSlot(draftCampaign, selectedHero.id, slot, activeSet);
    if (!result.success) {
      setFeedback(result.reason ?? 'Ekipman çıkarılamadı.');
      return;
    }
    setDraftCampaign(result.nextState);
    setFeedback(`${SLOT_LABELS[slot]} ekipmanı parti envanterine taslakta döndü.`);
  };

  const handleToggleLock = (item: InventoryItem) => {
    const result = toggleInventoryStackLocked(draftCampaign.inventoryItems, item.id);
    if (!result.success) {
      setFeedback(result.reason ?? 'Kilit durumu değiştirilemedi.');
      return;
    }
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.items }));
    setFeedback(`"${item.name}" ${result.stack?.locked ? 'kilitlendi' : 'kilidi açıldı'} (taslak).`);
  };

  const handleMoveToDiscard = (item: InventoryItem, event: React.MouseEvent) => {
    const quantity = quantityFromClick(event, inventoryItemQuantity(item));
    const result = transferInventoryQuantity(
      draftCampaign.inventoryItems,
      discardItems,
      item.id,
      quantity,
    );
    if (!result.success) {
      setFeedback(result.reason ?? 'Eşya Discard alanına taşınamadı.');
      return;
    }
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.sourceItems }));
    setDiscardItems(result.destinationItems);
    setFeedback(`${result.movedQuantity} adet "${item.name}" Discard önizlemesine taşındı.`);
  };

  const handleReturnFromDiscard = (item: InventoryItem, event: React.MouseEvent) => {
    const quantity = quantityFromClick(event, inventoryItemQuantity(item));
    const result = transferInventoryQuantity(
      discardItems,
      draftCampaign.inventoryItems,
      item.id,
      quantity,
      { allowLocked: true },
    );
    if (!result.success) {
      setFeedback(result.reason ?? 'Eşya envantere geri alınamadı.');
      return;
    }
    setDiscardItems(result.sourceItems);
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: result.destinationItems }));
    setFeedback(`${result.movedQuantity} adet "${item.name}" Discard alanından geri alındı.`);
  };

  const handleReturnAllDiscard = () => {
    if (discardItems.length === 0) return;
    let nextItems = draftCampaign.inventoryItems ?? [];
    for (const item of discardItems) {
      nextItems = addInventoryStackQuantity(nextItems, item, inventoryItemQuantity(item), {
        unitValue: item.value,
        locked: Boolean(item.locked),
      });
    }
    setDraftCampaign((prev) => ({ ...prev, inventoryItems: nextItems }));
    setDiscardItems([]);
    setFeedback('Discard alanındaki bütün eşyalar envantere geri alındı.');
  };

  const handleDone = () => {
    if (discardItems.length === 0) {
      onUpdateCampaign(draftCampaign);
      onClose();
      return;
    }

    // Discard listesi yerel olduğu için Bitti'de önce taslak envantere
    // geri birleştirilir; gerçek atış+XP dağıtımı tek çekirdekten geçer.
    let restoredItems = draftCampaign.inventoryItems ?? [];
    for (const item of discardItems) {
      restoredItems = addInventoryStackQuantity(restoredItems, item, inventoryItemQuantity(item), {
        unitValue: item.value,
        locked: false,
      });
    }
    const restoredState: CampaignState = {
      ...draftCampaign,
      customItemDefinitions: mergedCustomDefinitions(draftCampaign, committedCampaign),
      inventoryItems: restoredItems,
    };

    const selections: Array<{ stackId: string; quantity: number }> = [];
    for (const selection of discardSelections) {
      let remaining = selection.quantity;
      const candidates = restoredItems.filter(
        (item) => !item.locked && (item.definitionId ?? item.id) === selection.definitionId,
      );
      for (const candidate of candidates) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, inventoryItemQuantity(candidate));
        selections.push({ stackId: candidate.id, quantity });
        remaining -= quantity;
      }
      if (remaining > 0) {
        setFeedback('Discard seçimi taslak envanterle eşleştirilemedi; hiçbir değişiklik işlenmedi.');
        return;
      }
    }

    const result = applyDiscardDonation(restoredState, selections);
    if (!result.success) {
      setFeedback(result.reason ?? 'Discard uygulanamadı; hiçbir değişiklik işlenmedi.');
      return;
    }
    onUpdateCampaign(result.nextState);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 select-none">
      <div
        className="bg-[#171410] border border-[#c6a15b]/40 rounded-lg w-full max-w-[1500px] h-[97vh] lg:h-[94vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden"
        data-testid="inventory-modal"
        data-selected-hero-id={selectedHero?.id ?? ''}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[#1e1a14] border-b border-[#c6a15b]/20 shrink-0">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#fef08a] tracking-wide">
              Parti Envanteri
            </h2>
            <p className="text-[11px] text-[#b5a890] mt-0.5 flex flex-wrap items-center gap-y-1">
              <span>
                Hazine: <span className="text-[#34d399] font-mono-tabular">{draftCampaign.gold} Dinar</span>
              </span>
              <span className="mx-2 text-[#6b5d43]">·</span>
              <span>
                Yük: <span className="font-mono-tabular">{formatWeight(inventoryWeight)}</span>
              </span>
              <span className="mx-2 text-[#6b5d43]">·</span>
              <span>{inventoryQuantity} eşya</span>
              <span className="mx-2 text-[#6b5d43]">·</span>
              <span
                data-testid="inventory-mount-summary"
                className="px-1.5 py-0.5 rounded bg-[#262016] border border-[#c6a15b]/30 text-[#fde68a]"
                title="Binek Atı: Yaya askerlere harita hızı bonusu sağlar · Yük Hayvanı (Katır/Beygir): +100 kg taşıma kapasitesi verir"
              >
                Binek Atı: <strong className="font-mono-tabular">{partyLogistics.animals.spareMounts}</strong> (+{((partyLogistics as any).spareMountSpeedBonus ?? 0).toFixed(2)} Hız) · Yük Hayvanı: <strong className="font-mono-tabular">{partyLogistics.animals.packAnimals}</strong> (+{partyLogistics.animals.packAnimals * 100} kg)
              </span>
              <span className="mx-2 text-[#6b5d43]">·</span>
              <span>Değişiklikler yalnız Bitti ile işlenir</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="inventory-cancel-top"
            className="px-3 py-1.5 rounded text-xs font-bold bg-[#242019] hover:bg-[#332c21] text-[#f3e8cf] border border-[#c6a15b]/40 shrink-0"
          >
            Vazgeç [Esc]
          </button>
        </div>

        <div className="px-4 py-2 bg-[#14100b] border-b border-[#c6a15b]/15 flex flex-wrap items-center gap-2 shrink-0">
          {CATEGORY_OPTIONS.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              className={`px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center gap-1.5 ${
                selectedCategory === category.id
                  ? 'bg-[#b45309] text-white'
                  : 'bg-[#23201a] text-[#d6c7a4] hover:bg-[#2e2920]'
              }`}
            >
              <ItemIcon iconKey={category.iconKey} size={14} />
              {category.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Eşya veya özellik ara…"
              className="bg-[#0f0d09] border border-[#c6a15b]/25 rounded px-2.5 py-1.5 text-xs text-[#f8f0df] placeholder-[#7d7160] w-48"
            />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as InventorySort)}
              className="bg-[#0f0d09] border border-[#c6a15b]/25 rounded px-2 py-1.5 text-xs text-[#f8f0df]"
              aria-label="Envanter sıralaması"
            >
              <option value="tier">Kademeye Göre</option>
              <option value="name">Ada Göre</option>
              <option value="quantity">Adede Göre</option>
              <option value="value_desc">Değer (Yüksek)</option>
              <option value="value_asc">Değer (Düşük)</option>
              <option value="weight">Ağırlık</option>
              <option value="damage">Hasar</option>
              <option value="armor">Zırh</option>
            </select>
          </div>
        </div>

        {feedback && (
          <div className="px-4 py-2 bg-[#262015] border-b border-[#f59e0b]/30 text-xs text-[#fde68a] flex items-center justify-between gap-3 shrink-0">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-[#c6a15b] font-bold">
              ×
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
          {/* LEFT — DISCARD */}
          <aside className="lg:col-span-3 flex flex-col min-h-[320px] lg:min-h-0 bg-[#120f0b] border-b lg:border-b-0 lg:border-r border-[#c6a15b]/20">
            <div className="px-3 py-2 border-b border-[#c6a15b]/20 bg-[#181410] shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold tracking-wider text-red-200">DISCARD</h3>
                <span className="text-[10px] text-[#b5a890] font-mono-tabular">
                  {discardQuantity} adet · {formatWeight(discardWeight)}
                </span>
              </div>
              <p className="text-[10px] text-[#8b8072] mt-1">
                Bitti bu eşyaları kalıcı atar. Uygun perk varsa XP birliklere dağılır.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2" data-testid="inventory-discard-list">
              {discardItems.length === 0 ? (
                <div className="h-full min-h-[160px] border border-dashed border-[#c6a15b]/25 rounded flex items-center justify-center text-center text-[11px] text-[#8b8072] p-4">
                  Sağdaki envanterden “At” ile buraya eşya taşı.
                  <br />
                  Tık 1 · Shift 5 · Ctrl/Cmd tümü
                </div>
              ) : (
                discardItems.map((item) => {
                  const definition = resolveItemDefinition(previewState, item.definitionId ?? item.id);
                  const previewLine = definition
                    ? discardPreviewByDefinition.get(definition.id)
                    : undefined;
                  const quantity = inventoryItemQuantity(item);
                  const xpPerUnit = previewLine?.xpPerUnit ?? 0;
                  return (
                    <article
                      key={item.id}
                      className="rounded border border-red-900/50 bg-[#1b1210] p-2.5 flex gap-2 items-center"
                    >
                      <div className="w-9 h-9 rounded bg-[#100d0a] border border-[#c6a15b]/20 flex items-center justify-center text-red-200 shrink-0">
                        <ItemIcon iconKey={validIconKey(definition?.icon ?? item.icon)} size={21} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-[#f8f0df] leading-tight truncate">
                            {item.name}
                          </h4>
                          <span className="text-[10px] font-mono-tabular text-red-200 shrink-0">
                            ×{quantity}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#a89b84] mt-1">
                          {xpPerUnit > 0 ? (
                            <>
                              +{xpPerUnit} XP/adet · toplam{' '}
                              <b className="text-emerald-300">{xpPerUnit * quantity} XP</b>
                            </>
                          ) : (
                            (definition && discardEligibility(previewState, definition).reason) ||
                            'XP önizlemesi yok'
                          )}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-[#8b8072]">{formatWeight(item.weight * quantity)}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(event) => handleReturnFromDiscard(item, event)}
                              data-testid={`inventory-discard-return-${item.id}`}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-[#33291c] hover:bg-[#463723] text-amber-100"
                            >
                              Geri Al
                            </button>
                            <button
                              type="button"
                              onClick={(event) => handleReturnFromDiscard(item, event)}
                              data-testid={`inventory-row-right-${item.id}`}
                              title="Envantere geri aktar (>)"
                              className="w-6 h-6 rounded bg-[#26211a] hover:bg-[#382f25] border border-[#c6a15b]/35 text-[#fde68a] font-black text-xs flex items-center justify-center"
                            >
                              &gt;
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-[#c6a15b]/20 bg-[#17130e] shrink-0 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-[#b5a890]">Brüt bağış XP</span>
                <b className={discardPreview.exceedsCapacity ? 'text-red-300' : 'text-emerald-300'}>
                  <span data-testid="inventory-discard-xp">{discardPreview.grossXp}</span> XP
                </b>
              </div>
              <div className="flex justify-between gap-2 mt-1">
                <span className="text-[#b5a890]">Birlik kapasitesi</span>
                <span className="font-mono-tabular">{discardPreview.capacityXp} XP</span>
              </div>
              <div className="flex justify-between gap-2 mt-1">
                <span className="text-[#b5a890]">Dağıtılacak / taşan</span>
                <span className="font-mono-tabular">
                  {discardPreview.acceptedXp} / {discardPreview.overflowXp}
                </span>
              </div>
              {discardPreview.exceedsCapacity && (
                <p className="mt-2 rounded bg-red-950/50 border border-red-800/60 text-red-200 px-2 py-1.5 text-[10px]">
                  Kapasite aşıldı; taşan XP Bannerlord kuralıyla boşa gider.
                </p>
              )}
              {discardItems.length > 0 && discardPreview.grossXp === 0 && (
                <p className="mt-2 rounded bg-[#262015] border border-[#f59e0b]/30 text-amber-200 px-2 py-1.5 text-[10px]">
                  Bu seçim XP vermez; eşyalar yine de Bitti ile atılır.
                </p>
              )}
              <button
                type="button"
                disabled={discardItems.length === 0}
                onClick={handleReturnAllDiscard}
                data-testid="inventory-discard-return-all"
                className="mt-3 w-full px-3 py-2 rounded text-[11px] font-bold bg-[#33291c] hover:bg-[#463723] disabled:opacity-35 text-amber-100"
              >
                Tümünü Geri Al (&gt;&gt;)
              </button>
            </div>
          </aside>

          {/* CENTER — HERO */}
          <section className="lg:col-span-4 flex flex-col min-h-[620px] lg:min-h-0 bg-[#100d0a] border-b lg:border-b-0 lg:border-r border-[#c6a15b]/20">
            <div className="p-3 border-b border-[#c6a15b]/20 bg-[#17130e] shrink-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => moveHero(-1)}
                  disabled={heroes.length <= 1}
                  data-testid="inventory-hero-prev"
                  className="w-8 h-8 rounded bg-[#26211a] hover:bg-[#362f25] disabled:opacity-30 text-[#fde68a] font-black"
                  aria-label="Önceki kahraman"
                >
                  ‹
                </button>
                <div className="text-center min-w-0">
                  <h3
                    className="font-display text-base font-bold text-[#fef08a] truncate"
                    data-testid="inventory-selected-hero"
                  >
                    {selectedHero?.name ?? 'Kahraman Yok'}
                  </h3>
                  <p className="text-[10px] text-[#b5a890]">
                    Seviye {selectedHero?.level ?? 1} · Can {Math.round(selectedHero?.hp ?? 0)}/
                    {selectedHero?.maxHp ?? 100} · {selectedHeroIndex + 1}/{Math.max(heroes.length, 1)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => moveHero(1)}
                  disabled={heroes.length <= 1}
                  data-testid="inventory-hero-next"
                  className="w-8 h-8 rounded bg-[#26211a] hover:bg-[#362f25] disabled:opacity-30 text-[#fde68a] font-black"
                  aria-label="Sonraki kahraman"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
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
                    data-testid={`inventory-set-${setId.toLowerCase()}`}
                    className={`px-2 py-1.5 rounded text-[11px] font-bold ${
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

            <div className="relative flex-1 min-h-[270px] overflow-hidden">
              <HeroMannequin
                visualOptions={visualOptions}
                showMount={Boolean(selectedHero?.equipment[activeSet].MOUNT)}
                testId="inventory-hero-mannequin"
              />
              <span className="absolute left-2 bottom-2 text-[9px] uppercase tracking-[0.18em] text-[#b5a890] bg-black/45 rounded px-2 py-1 pointer-events-none">
                Fareyle döndür
              </span>
            </div>

            <div className="p-3 border-t border-[#c6a15b]/20 bg-[#16120e] shrink-0">
              <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                {[
                  ['Baş', armorTotals.head],
                  ['Gövde', armorTotals.body],
                  ['Kol', armorTotals.arm],
                  ['Bacak', armorTotals.leg],
                  ['Binek', armorTotals.mount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded bg-[#1f1913] border border-[#c6a15b]/15 px-1 py-1.5">
                    <span className="block text-[#a89b84]">{label}</span>
                    <b className="text-[#f8f0df]">+{value}</b>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-between gap-2 mt-2 text-[10px] text-[#b5a890]">
                <span>Azami silah hasarı: <b className="text-[#f8f0df]">{primaryDamage}</b></span>
                <span>Kalkan dayanıklılığı: <b className="text-[#f8f0df]">{shieldDurability}</b></span>
                <span>Kuşanılmış ağırlık: <b className="text-[#f8f0df]">{formatWeight(equippedWeight)}</b></span>
              </div>
            </div>

            <div className="max-h-[235px] shrink-0 overflow-y-auto p-2 bg-[#131009] border-t border-[#c6a15b]/15">
              <div className="grid grid-cols-2 gap-1.5">
                {equipmentRows.map(({ slot, definition }) => (
                  <div
                    key={slot}
                    className="rounded border border-[#c6a15b]/20 bg-[#1b1712] px-2 py-1.5 min-h-[52px]"
                    data-testid={`inventory-slot-${slot}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span
                        className={`w-7 h-7 rounded bg-[#100d0a] border border-[#c6a15b]/25 flex items-center justify-center shrink-0 ${
                          definition ? 'text-[#f3d38a]' : 'text-[#6b5d43]'
                        }`}
                      >
                        <ItemIcon
                          iconKey={
                            definition ? validIconKey(definition.icon) : defaultSlotIconKey(slot)
                          }
                          size={16}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] uppercase tracking-wider text-[#8b8072]">
                          {SLOT_LABELS[slot]}
                        </div>
                        <div className="text-[10px] font-bold text-[#f8f0df] leading-tight truncate" title={definition?.name}>
                          {definition?.name ?? 'Boş'}
                        </div>
                      </div>
                      {definition && (
                        <button
                          type="button"
                          onClick={() => handleUnequip(slot)}
                          data-testid={`inventory-unequip-${slot}`}
                          className="px-1.5 py-0.5 rounded bg-[#33291c] hover:bg-[#463723] text-[9px] font-bold text-amber-100 shrink-0"
                        >
                          Çıkar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT — PARTY INVENTORY */}
          <section className="lg:col-span-5 flex flex-col min-h-[420px] lg:min-h-0 bg-[#15120e]">
            <div className="px-3 py-2 border-b border-[#c6a15b]/20 bg-[#1b1712] shrink-0 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold tracking-wider text-[#fef08a]">
                PARTİ ENVANTERİ ({filteredInventory.length} YIĞIN)
              </h3>
              <span className="text-[10px] text-[#b5a890]">At: Tık 1 · Shift 5 · Ctrl tümü</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2" data-testid="inventory-items-list">
              {filteredInventory.length === 0 ? (
                <div className="text-center text-[11px] text-[#8b8072] py-10">
                  Bu filtrede gösterilecek eşya yok.
                </div>
              ) : (
                filteredInventory.map((item) => {
                  const definition = resolveItemDefinition(draftCampaign, item.definitionId ?? item.id);
                  const quantity = inventoryItemQuantity(item);
                  const canEquip = Boolean(definition && definition.slot !== 'TRADE');
                  const donationXp = definition ? itemDiscardXpPerUnit(definition) : 0;
                  const eligibility = definition ? discardEligibility(draftCampaign, definition) : null;
                  return (
                    <article
                      key={item.id}
                      className="rounded border border-[#c6a15b]/25 bg-[#1d1913] p-2.5 flex gap-2.5 items-center"
                      data-testid={`inventory-item-${item.id}`}
                    >
                      <button
                        type="button"
                        onClick={(event) => handleMoveToDiscard(item, event)}
                        disabled={Boolean(item.locked)}
                        data-testid={`inventory-row-left-${item.id}`}
                        title={item.locked ? 'Kilitli eşya atılamaz' : 'Discard alanına 1 adet aktar (<)'}
                        className="w-6 h-9 rounded bg-[#26211a] hover:bg-[#382f25] disabled:opacity-35 border border-[#c6a15b]/35 text-[#fde68a] font-black text-xs flex items-center justify-center shrink-0"
                      >
                        &lt;
                      </button>
                      <div className="w-11 h-11 rounded bg-[#100d0a] border border-[#c6a15b]/20 flex items-center justify-center text-[#f3d38a] shrink-0">
                        <ItemIcon iconKey={validIconKey(definition?.icon ?? item.icon)} size={24} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-[#f8f0df] leading-tight truncate" title={item.name}>
                              {item.name}
                            </h4>
                            <p className="text-[10px] text-emerald-300 truncate">{item.statBonus || 'Standart eşya'}</p>
                          </div>
                          <span className="text-right shrink-0">
                            <span className="block text-[11px] font-mono-tabular text-[#fef08a]">×{quantity}</span>
                            <span className="block text-[9px] text-[#8b8072]">T{definition?.tier ?? item.tier ?? 0}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#a89b84] mt-1">
                          <span className="whitespace-nowrap">Birim ağırlık: {item.weight} kg</span>
                          <span className="whitespace-nowrap">Toplam: {formatWeight(item.weight * quantity)}</span>
                          <span className="whitespace-nowrap">Değer: {definition?.baseValue ?? item.value} D</span>
                          {definition?.slot && definition.slot !== 'TRADE' && (
                            <span className="whitespace-nowrap">Slot: {SLOT_LABELS[definition.slot]}</span>
                          )}
                          {donationXp > 0 && (
                            <span className={eligibility?.eligible ? 'text-emerald-300 whitespace-nowrap' : 'whitespace-nowrap'}>
                              Bağış: {eligibility?.eligible ? `+${donationXp} XP/adet` : 'perk gerekli'}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => handleToggleLock(item)}
                            data-testid={`inventory-lock-${item.id}`}
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              item.locked
                                ? 'bg-yellow-700/70 text-yellow-50'
                                : 'bg-[#2b251c] text-[#cdbd9b] hover:bg-[#3a3125]'
                            }`}
                          >
                            {item.locked ? 'Kilidi Aç' : 'Kilitle'}
                          </button>
                          {canEquip && (
                            <button
                              type="button"
                              onClick={() => handleEquip(item)}
                              data-testid={`inventory-equip-${item.id}`}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white"
                            >
                              {selectedHero?.name.split(' ')[0] ?? 'Kahraman'} İçin Kuşan
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => handleMoveToDiscard(item, event)}
                            disabled={Boolean(item.locked)}
                            data-testid={`inventory-discard-${item.id}`}
                            title={item.locked ? 'Kilitli eşya atılamaz' : 'Discard alanına taşı'}
                            className="ml-auto px-2 py-1 rounded text-[10px] font-bold bg-red-950/80 hover:bg-red-900 disabled:opacity-35 text-red-100 border border-red-800/60"
                          >
                            At
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="px-4 py-3 bg-[#1c1812] border-t border-[#c6a15b]/25 flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular mr-auto">
            <span className="text-[#d1c5b0]">
              Taşıma Kapasitesi:{' '}
              <strong className={partyLogistics.capacity.isOverweight ? 'text-red-400 font-bold' : 'text-[#fbbf24]'}>
                {formatWeight(partyLogistics.capacity.currentWeight)} / {formatWeight(partyLogistics.capacity.totalCapacity)}
              </strong>
            </span>
            <span className="text-[#8b8072]">·</span>
            <span className="text-[#34d399]" title="Envanterdeki boş binek ve yük hayvanları">
              Binek: <strong>{partyLogistics.animals.spareMounts}</strong> · Katır: <strong>{partyLogistics.animals.packAnimals}</strong>
            </span>
            <span className="text-[#8b8072]">·</span>
            <span className="text-[#60a5fa]" title="Mevcut ağırlık ve ordu kompozisyonuna göre dünya haritası yürüyüş hızı">
              Ordu Hızı: <strong>{partyLogistics.finalSpeed}</strong>
            </span>
            {partyLogistics.capacity.isOverweight && (
              <span className="text-red-400 font-bold bg-red-950/60 px-2 py-0.5 rounded border border-red-800 inline-flex items-center gap-1">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current shrink-0" aria-hidden="true">
                  <path d="M8 1.5L1 14h14L8 1.5zm-.75 4.5h1.5v4h-1.5V6zm0 5.25h1.5v1.5h-1.5v-1.5z" />
                </svg>
                <span>Aşırı Yük ({partyLogistics.overburdenPenalty} Hız)</span>
              </span>
            )}
            {discardItems.length > 0 && (
              <span className="text-amber-200">
                · {discardQuantity} eşya Discard için bekliyor (+{discardPreview.acceptedXp} XP)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="inventory-cancel"
            className="px-4 py-2 rounded text-xs font-bold bg-[#26211a] hover:bg-[#362f25] text-[#f3e8cf] border border-[#c6a15b]/40"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleDone}
            data-testid="inventory-done"
            className="px-5 py-2 rounded text-xs font-black bg-[#b45309] hover:bg-[#d97706] text-white shadow"
          >
            Bitti
          </button>
        </div>
      </div>
    </div>
  );
};
