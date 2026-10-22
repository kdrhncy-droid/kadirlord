import React, { useState, useMemo, useEffect } from 'react';
import type {
  CampaignState,
  CampaignHero,
  FactionId,
  Settlement,
  TroopDefinition,
  TroopStack,
  PrisonerStack,
  UnitTierId,
} from '../game/rules.ts';
import {
  getPartyLimit,
  getPrisonerLimit,
  calculatePartyLimitBreakdown,
  calculatePrisonerLimitBreakdown,
  getTroopUpgradeOptions,
  upgradeTroop,
  recruitPrisonerStack,
  ransomPrisonerStack,
  dismissTroopStack,
  transferTroopToGarrison,
  transferTroopFromGarrison,
  type TroopUpgradeOption,
} from '../game/partySystem.ts';
import {
  getTroopDefinition,
  troopStackTotal,
  troopStackWoundedTotal,
  prisonerStackTotal,
} from '../game/bannerlordFoundation.ts';
import { FACTION_INFO, calculateClanTier } from '../game/rules.ts';
import { HeroMannequin, type HeroMannequinVisualOptions } from './HeroMannequin.tsx';
import { deriveRigVisualOptionsFromEquipment } from '../game/characterRig.ts';

interface PartyModalProps {
  campaign: CampaignState;
  onClose: () => void;
  onUpdateCampaign: (nextState: CampaignState) => void;
  settlement?: Settlement | null;
}

type SelectedEntity =
  | { kind: 'HERO'; hero: CampaignHero }
  | { kind: 'TROOP'; stack: TroopStack; definition: TroopDefinition }
  | { kind: 'PRISONER'; stack: PrisonerStack; definition: TroopDefinition };

function romanNumeral(tier: number): string {
  switch (tier) {
    case 1: return 'I';
    case 2: return 'II';
    case 3: return 'III';
    case 4: return 'IV';
    case 5: return 'V';
    case 6: return 'VI';
    default: return String(tier);
  }
}

function deriveTroopVisuals(def: TroopDefinition): HeroMannequinVisualOptions {
  const faction = def.culture as FactionId;
  const color = FACTION_INFO[faction]?.color ?? '#b45309';

  let weaponText = 'Thamaskene İmparatorluk Spathası (Kesici: 84)';
  if (def.battleClass === 'archer') weaponText = 'Bozkır Refleks Yayı (Yay)';
  else if (def.battleClass === 'cavalry') weaponText = 'Ağır Kontos Kargısı (Mızrak)';
  else if (def.battleClass === 'guard') weaponText = 'İki Elli Savaş Baltası (Balta)';

  const armorText =
    def.tier >= 4
      ? 'Ağır Katafrakt Zırhı (+64 Gövde Zırhı)'
      : def.tier >= 3
        ? 'Zincir Zırhlı Süvari Yeleği (+40 Gövde)'
        : 'Deri Zırh (+22 Gövde)';

  const helmetText =
    def.tier >= 4
      ? 'Altın Kakmalı Miğfer (+48 Baş)'
      : def.tier >= 2
        ? 'Demir Miğfer (+25 Baş)'
        : 'Yün Başlık';

  const syntheticEquipment = {
    HEAD: helmetText,
    SHOULDER: def.tier >= 4 ? 'Pullu Omuzluk' : 'Basit Pelerin',
    BODY: armorText,
    GLOVES: 'Deri Eldiven',
    LEG: def.tier >= 4 ? 'Çelik Çizme' : 'Deri Bot',
    MOUNT: def.battleClass === 'cavalry' ? 'Savaş Küheylanı' : 'Yok',
    HARNESS: def.battleClass === 'cavalry' && def.tier >= 4 ? 'Pullu At Zırhı' : 'Yok',
    BANNER: 'Sancak',
    WEAPON1: weaponText,
    WEAPON2: def.battleClass === 'archer' ? 'Ok Sadağı' : 'Yok',
    WEAPON3: 'Yok',
    WEAPON4: 'Yok',
  };

  return deriveRigVisualOptionsFromEquipment(syntheticEquipment, color);
}

export const PartyModal: React.FC<PartyModalProps> = ({
  campaign: committedCampaign,
  onClose,
  onUpdateCampaign,
  settlement,
}) => {
  const [draftCampaign, setDraftCampaign] = useState<CampaignState>(committedCampaign);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Garnizon taslağı (yerleşim varsa)
  const [garrisonStacks, setGarrisonStacks] = useState<TroopStack[]>(() => {
    if (!settlement) return [];
    return [
      { troopId: `${settlement.faction}_infantry_3`, count: Math.max(10, Math.floor(settlement.garrison * 0.5)), wounded: 0, xp: 0 },
      { troopId: `${settlement.faction}_archer_3`, count: Math.max(5, Math.floor(settlement.garrison * 0.3)), wounded: 0, xp: 0 },
      { troopId: `${settlement.faction}_guard_4`, count: Math.max(2, Math.floor(settlement.garrison * 0.2)), wounded: 0, xp: 0 },
    ];
  });

  const heroes = useMemo(() => draftCampaign.heroes ?? [], [draftCampaign.heroes]);
  const troopStacks = useMemo(() => draftCampaign.troopStacks ?? [], [draftCampaign.troopStacks]);
  const prisonerStacks = useMemo(() => draftCampaign.prisonerStacks ?? [], [draftCampaign.prisonerStacks]);

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(() => {
    if (heroes.length > 0) return { kind: 'HERO', hero: heroes[0] };
    if (troopStacks.length > 0) {
      const def = getTroopDefinition(troopStacks[0].troopId);
      if (def) return { kind: 'TROOP', stack: troopStacks[0], definition: def };
    }
    return {
      kind: 'HERO',
      hero: {
        id: 'hero_player',
        name: committedCampaign.playerName,
        kind: 'PLAYER',
        culture: 'empire',
        age: 28,
        hp: committedCampaign.playerHp,
        maxHp: committedCampaign.playerMaxHp,
        wage: 0,
        level: committedCampaign.characterLevel ?? 1,
        xp: 0,
        freeAttributePoints: 0,
        freeFocusPoints: 0,
        attributes: { VIGOR: 4, CONTROL: 4, ENDURANCE: 4, CUNNING: 4, SOCIAL: 4, INTELLIGENCE: 4 },
        skills: {} as never,
        perks: [],
        equipment: { BATTLE: {} as never, CIVILIAN: {} as never },
        activeEquipmentSet: 'BATTLE',
        isInPlayerParty: true,
      },
    };
  });

  const partyCapBreakdown = useMemo(() => calculatePartyLimitBreakdown(draftCampaign), [draftCampaign]);
  const prisonerCapBreakdown = useMemo(() => calculatePrisonerLimitBreakdown(draftCampaign), [draftCampaign]);

  const totalTroopsCount = useMemo(() => troopStackTotal(troopStacks), [troopStacks]);
  const totalWoundedCount = useMemo(() => troopStackWoundedTotal(troopStacks), [troopStacks]);
  const totalPrisonersCount = useMemo(() => prisonerStackTotal(prisonerStacks), [prisonerStacks]);

  const totalDailyWage = useMemo(() => {
    return troopStacks.reduce((sum, stack) => {
      const def = getTroopDefinition(stack.troopId);
      return sum + (def?.wage ?? 2) * stack.count;
    }, 0);
  }, [troopStacks]);

  // ESC ile kapatma (taslağı iptal eder)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Seçili varlığın 3B manken verisi
  const visualOptions = useMemo<HeroMannequinVisualOptions>(() => {
    if (selectedEntity.kind === 'HERO') {
      const activeSet = selectedEntity.hero.activeEquipmentSet ?? 'BATTLE';
      const eqMap = selectedEntity.hero.equipment?.[activeSet] ?? {};
      const equipmentText: Record<string, string> = {};
      for (const [slot, val] of Object.entries(eqMap)) {
        if (val) equipmentText[slot] = val;
      }
      const color = FACTION_INFO[selectedEntity.hero.culture]?.color ?? '#b45309';
      return deriveRigVisualOptionsFromEquipment(equipmentText, color);
    }
    return deriveTroopVisuals(selectedEntity.definition);
  }, [selectedEntity]);

  const isSelectedMounted = useMemo(() => {
    if (selectedEntity.kind === 'HERO') {
      const activeSet = selectedEntity.hero.activeEquipmentSet ?? 'BATTLE';
      return Boolean(selectedEntity.hero.equipment?.[activeSet]?.MOUNT);
    }
    return selectedEntity.definition.battleClass === 'cavalry';
  }, [selectedEntity]);

  // Terfi Seçenekleri
  const upgradeOptions = useMemo<TroopUpgradeOption[]>(() => {
    if (selectedEntity.kind !== 'TROOP') return [];
    return getTroopUpgradeOptions(draftCampaign, selectedEntity.stack);
  }, [draftCampaign, selectedEntity]);

  const handleUpgradeAction = (targetTroopId: string, count: number) => {
    if (selectedEntity.kind !== 'TROOP') return;
    const res = upgradeTroop(draftCampaign, selectedEntity.stack.troopId, targetTroopId, count);
    if (!res.success) {
      setFeedback(`Terfi başarısız: ${res.reason}`);
      return;
    }
    setDraftCampaign(res.nextState);
    const targetDef = getTroopDefinition(targetTroopId);
    setFeedback(`+${count} × ${targetDef?.name ?? targetTroopId} terfi ettirildi (-${res.goldSpent} Dinar).`);

    // Seçili varlığı güncelle
    const updatedSource = res.nextState.troopStacks?.find((s) => s.troopId === selectedEntity.stack.troopId);
    if (updatedSource) {
      setSelectedEntity({ kind: 'TROOP', stack: updatedSource, definition: selectedEntity.definition });
    } else {
      const upgradedStack = res.nextState.troopStacks?.find((s) => s.troopId === targetTroopId);
      if (upgradedStack && targetDef) {
        setSelectedEntity({ kind: 'TROOP', stack: upgradedStack, definition: targetDef });
      }
    }
  };

  const handleRecruitPrisonerAction = (troopId: string, count = 1) => {
    const res = recruitPrisonerStack(draftCampaign, troopId, count);
    if (!res.success) {
      setFeedback(`Devşirme başarısız: ${res.reason}`);
      return;
    }
    setDraftCampaign(res.nextState);
    const def = getTroopDefinition(troopId);
    setFeedback(`${count} × ${def?.name ?? troopId} ordu saflarına devşirildi.`);
  };

  const handleRansomPrisonerAction = (troopId: string, count = 1) => {
    const res = ransomPrisonerStack(draftCampaign, troopId, count);
    if (!res.success) {
      setFeedback(`Fidye işlemi başarısız: ${res.reason}`);
      return;
    }
    setDraftCampaign(res.nextState);
    setFeedback(`${count} tutsak serbest bırakıldı (+${res.goldEarned} Dinar).`);
  };

  const handleDismissTroopAction = (troopId: string, count = 1) => {
    const res = dismissTroopStack(draftCampaign, troopId, count);
    if (!res.success) {
      setFeedback(`Terhis başarısız: ${res.reason}`);
      return;
    }
    setDraftCampaign(res.nextState);
    setFeedback(`${count} asker terhis edildi.`);
  };

  const handleDoneCommit = () => {
    onUpdateCampaign(draftCampaign);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 md:p-4 animate-fade-in font-display select-none"
      data-testid="party-screen-modal"
    >
      <div className="relative flex flex-col w-full h-full max-w-[1440px] max-h-[920px] bg-[#120e0a] border-2 border-[#855e2d]/60 rounded-lg shadow-2xl overflow-hidden text-[#e6d8c3]">
        {/* ÜST BAŞLIK & ÖZET ŞERİDİ */}
        <header className="flex items-center justify-between px-6 py-3.5 bg-gradient-to-r from-[#1c1610] via-[#241c14] to-[#1c1610] border-b border-[#855e2d]/40">
          <div className="flex items-center gap-4">
            <span className="text-2xl text-[#d97706]" aria-hidden="true">⚔️</span>
            <div>
              <h1 className="text-xl font-bold tracking-wide text-[#f5ebd7] flex items-center gap-2">
                Parti ve Birlikler
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#382a1c] text-[#d4af37] border border-[#855e2d]/40">
                  Kısayol: P
                </span>
              </h1>
              <p className="text-xs text-[#a89274]">
                Komutan: <strong className="text-white">{draftCampaign.playerName}</strong> · Klan Kademesi:{' '}
                <strong className="text-[#fde68a]">
                  {calculateClanTier(draftCampaign.renown).tier}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2 bg-[#1a140e] px-3 py-1.5 rounded border border-[#855e2d]/30">
              <span className="text-[#9ca3af]">Ordu:</span>
              <span
                className={`font-mono font-bold ${
                  totalTroopsCount > partyCapBreakdown.total ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {totalTroopsCount} / {partyCapBreakdown.total}
              </span>
              {totalWoundedCount > 0 && (
                <span className="text-red-400 font-mono">({totalWoundedCount} yaralı)</span>
              )}
            </div>

            <div className="flex items-center gap-2 bg-[#1a140e] px-3 py-1.5 rounded border border-[#855e2d]/30">
              <span className="text-[#9ca3af]">Tutsaklar:</span>
              <span
                className={`font-mono font-bold ${
                  totalPrisonersCount > prisonerCapBreakdown.total ? 'text-amber-400' : 'text-sky-400'
                }`}
              >
                {totalPrisonersCount} / {prisonerCapBreakdown.total}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-[#1a140e] px-3 py-1.5 rounded border border-[#855e2d]/30">
              <span className="text-[#9ca3af]">Günlük Ücret:</span>
              <span className="font-mono font-bold text-amber-300">-{totalDailyWage} Dinar</span>
            </div>

            <div className="flex items-center gap-2 bg-[#1a140e] px-3 py-1.5 rounded border border-[#855e2d]/30">
              <span className="text-[#9ca3af]">Kese:</span>
              <span className="font-mono font-bold text-yellow-400">
                {draftCampaign.gold.toLocaleString('tr-TR')} Dinar
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              data-testid="party-close-btn"
              className="text-[#a89274] hover:text-white hover:bg-white/10 rounded p-1 transition-colors"
              title="Kapat (Esc)"
            >
              ✕
            </button>
          </div>
        </header>

        {/* BİLDİRİM / GERİ BİLDİRİM ŞERİDİ */}
        {feedback && (
          <div className="bg-[#2a1c10] border-b border-[#d97706]/40 px-6 py-1.5 text-xs text-[#fde68a] flex items-center justify-between animate-fade-in">
            <span>ℹ️ {feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs text-[#a89274] hover:text-white"
            >
              Kapat
            </button>
          </div>
        )}

        {/* ANA 3-SÜTUN GÖVDE */}
        <div className="grid grid-cols-12 flex-1 min-h-0 bg-[#0e0b08]">
          {/* SOL SÜTUN: Garnizon / Bilgi Paneli / Hızlı Aksiyonlar (3/12) */}
          <section className="col-span-3 flex flex-col border-r border-[#855e2d]/30 bg-[#16110c] p-3 overflow-y-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#d4af37] pb-2 border-b border-[#855e2d]/30 mb-3 flex items-center justify-between">
              <span>{settlement ? `${settlement.name} Garnizonu` : 'Parti İstatistikleri'}</span>
              <span className="text-[10px] text-[#a89274] font-normal">
                {settlement ? `${settlement.garrison} Asker` : 'Saha Modu'}
              </span>
            </h2>

            {settlement ? (
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                <p className="text-[11px] text-[#a89274]">
                  Garnizon ve parti arasında asker aktarımı yapabilirsiniz:
                </p>
                <div className="space-y-1.5">
                  {garrisonStacks.map((gStack) => {
                    const def = getTroopDefinition(gStack.troopId);
                    return (
                      <div
                        key={gStack.troopId}
                        className="flex items-center justify-between p-2 rounded bg-[#1f1811] border border-[#855e2d]/20 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{def?.name ?? gStack.troopId}</div>
                          <div className="text-[10px] text-[#a89274]">
                            Kademe {def ? romanNumeral(def.tier) : 'I'} · {gStack.count} Asker
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const res = transferTroopFromGarrison(
                              draftCampaign.troopStacks ?? [],
                              garrisonStacks,
                              gStack.troopId,
                              1,
                              partyCapBreakdown.total,
                            );
                            if (res.moved > 0) {
                              setGarrisonStacks(res.garrisonStacks);
                              setDraftCampaign({
                                ...draftCampaign,
                                troopStacks: res.partyStacks,
                              });
                            }
                          }}
                          className="px-2 py-1 bg-[#3a2818] hover:bg-[#523922] text-[#fde68a] rounded text-[11px] font-semibold border border-[#855e2d]/30"
                        >
                          Al ➔
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-xs text-[#a89274]">
                <div className="bg-[#1c150e] p-3 rounded border border-[#855e2d]/20 space-y-2">
                  <div className="font-bold text-[#f5ebd7] text-sm">Kapasite Dökümü</div>
                  <div className="flex justify-between">
                    <span>Taban Parti:</span>
                    <span className="text-white font-mono">+{partyCapBreakdown.base}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Klan Kademesi:</span>
                    <span className="text-white font-mono">+{partyCapBreakdown.clanTierBonus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>İaşeci (İdare):</span>
                    <span className="text-white font-mono">+{partyCapBreakdown.quartermasterBonus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Liderlik:</span>
                    <span className="text-white font-mono">+{partyCapBreakdown.leadershipBonus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Nam Bonusu:</span>
                    <span className="text-white font-mono">+{partyCapBreakdown.renownBonus}</span>
                  </div>
                  <div className="border-t border-[#855e2d]/30 pt-1 flex justify-between font-bold text-[#fde68a]">
                    <span>Toplam Sınır:</span>
                    <span className="font-mono">{partyCapBreakdown.total}</span>
                  </div>
                </div>

                <div className="bg-[#1c150e] p-3 rounded border border-[#855e2d]/20 space-y-2">
                  <div className="font-bold text-[#f5ebd7] text-sm">Tutsak Kapasitesi</div>
                  <div className="flex justify-between">
                    <span>Taban:</span>
                    <span className="text-white font-mono">+{prisonerCapBreakdown.base}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ordu Boyutu Oranı:</span>
                    <span className="text-white font-mono">+{prisonerCapBreakdown.partyCapacityBonus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Haydutluk:</span>
                    <span className="text-white font-mono">+{prisonerCapBreakdown.rogueryBonus}</span>
                  </div>
                  <div className="border-t border-[#855e2d]/30 pt-1 flex justify-between font-bold text-sky-400">
                    <span>Toplam Sınır:</span>
                    <span className="font-mono">{prisonerCapBreakdown.total}</span>
                  </div>
                </div>

                <div className="bg-[#1a130c] p-2.5 rounded border border-[#855e2d]/20 text-[11px] text-[#9ca3af] leading-relaxed">
                  💡 İpucu: Birlikler savaşlarda ve saha talimlerinde tecrübe kazandıkça hazır hale gelir.
                  Gözüken sarı rozetler hazır terfileri belirtir.
                </div>
              </div>
            )}
          </section>

          {/* ORTA SÜTUN: 3B Manken Sahnesi & Birlik/Kahraman Detayı & Terfi Dalları (5/12) */}
          <section className="col-span-5 flex flex-col bg-[#140f0a] relative overflow-hidden">
            {/* 3B MANKEN ALANI */}
            <div className="relative flex-1 min-h-[320px] w-full bg-gradient-to-b from-[#18120c] to-[#0d0906]">
              <HeroMannequin
                visualOptions={visualOptions}
                showMount={isSelectedMounted}
                className="absolute inset-0"
              />

              {/* Seçili Varlık Başlık Rozeti */}
              <div className="absolute top-3 left-3 bg-[#18110b]/90 backdrop-blur-sm px-3 py-2 rounded border border-[#855e2d]/40 shadow-lg max-w-[280px]">
                <div className="text-[10px] text-[#d4af37] uppercase tracking-wider font-semibold">
                  {selectedEntity.kind === 'HERO'
                    ? selectedEntity.hero.kind === 'PLAYER'
                      ? 'Parti Lideri'
                      : 'Yoldaş / Kahraman'
                    : selectedEntity.kind === 'PRISONER'
                      ? 'Tutsak Asker'
                      : 'Muvazzaf Asker'}
                </div>
                <div className="text-base font-bold text-white truncate">
                  {selectedEntity.kind === 'HERO'
                    ? selectedEntity.hero.name
                    : selectedEntity.definition.name}
                </div>
                {selectedEntity.kind !== 'HERO' && (
                  <div className="text-xs text-[#a89274]">
                    Kademe {romanNumeral(selectedEntity.definition.tier)} · {FACTION_INFO[selectedEntity.definition.culture]?.name}
                  </div>
                )}
              </div>
            </div>

            {/* SEÇİLİ BİRLİK İSTATİSTİKLERİ VE TERFİ PANELLERİ */}
            <div className="p-4 bg-[#1a140d] border-t border-[#855e2d]/40 max-h-[300px] overflow-y-auto space-y-3">
              {selectedEntity.kind === 'HERO' ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#241a10] p-2 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Sağlık</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {selectedEntity.hero.hp} / {selectedEntity.hero.maxHp}
                      </div>
                    </div>
                    <div className="bg-[#241a10] p-2 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Seviye</div>
                      <div className="text-sm font-bold text-white">{selectedEntity.hero.level}</div>
                    </div>
                    <div className="bg-[#241a10] p-2 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Kıyafet Modu</div>
                      <div className="text-sm font-bold text-[#fde68a]">
                        {selectedEntity.hero.activeEquipmentSet === 'BATTLE' ? 'Savaş' : 'Sivil'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedEntity.kind === 'TROOP' ? (
                <div className="space-y-3 text-xs">
                  {/* İstatistikler */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-[#241a10] p-1.5 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Can</div>
                      <div className="font-bold text-white">{selectedEntity.definition.maxHp}</div>
                    </div>
                    <div className="bg-[#241a10] p-1.5 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Saldırı</div>
                      <div className="font-bold text-white">{selectedEntity.definition.attack}</div>
                    </div>
                    <div className="bg-[#241a10] p-1.5 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Zırh</div>
                      <div className="font-bold text-white">{selectedEntity.definition.defense}</div>
                    </div>
                    <div className="bg-[#241a10] p-1.5 rounded border border-[#855e2d]/20">
                      <div className="text-[10px] text-[#a89274]">Maaş</div>
                      <div className="font-bold text-amber-300">{selectedEntity.definition.wage} Dinar</div>
                    </div>
                  </div>

                  {/* Terfi Dalları */}
                  <div>
                    <div className="text-[11px] font-bold text-[#d4af37] uppercase tracking-wider mb-1.5">
                      Terfi Yolları ({upgradeOptions.length})
                    </div>
                    {upgradeOptions.length === 0 ? (
                      <p className="text-[11px] text-[#a89274] italic">
                        Bu birlik kültür ağacının zirvesine (Kademe 5) ulaşmıştır; daha ileri terfisi yoktur.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {upgradeOptions.map((opt) => (
                          <div
                            key={opt.targetDefinition.id}
                            className="flex items-center justify-between p-2 rounded bg-[#241b12] border border-[#855e2d]/30"
                          >
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                {opt.targetDefinition.name}
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#382a1c] text-[#d4af37]">
                                  Kademe {romanNumeral(opt.targetDefinition.tier)}
                                </span>
                              </div>
                              <div className="text-[10px] text-[#a89274] flex items-center gap-2">
                                <span>Ücret: {opt.goldCost} Dinar</span>
                                {opt.horseRequirement !== 'NONE' && (
                                  <span className={opt.hasHorse ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                                    🐎 {opt.horseRequirement === 'WAR_HORSE' ? 'Savaş Atı' : 'Binek Atı'}
                                  </span>
                                )}
                              </div>
                              {!opt.canUpgrade && opt.blockedReason && (
                                <div className="text-[10px] text-amber-400 font-medium">
                                  {opt.blockedReason}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!opt.canUpgrade}
                                onClick={() => handleUpgradeAction(opt.targetDefinition.id, 1)}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                                  opt.canUpgrade
                                    ? 'bg-[#d97706] hover:bg-[#b45309] text-white shadow'
                                    : 'bg-[#2a2016] text-[#6b5842] cursor-not-allowed'
                                }`}
                              >
                                Terfi Et (+1)
                              </button>
                              {opt.readyCount > 1 && (
                                <button
                                  type="button"
                                  disabled={!opt.canUpgrade}
                                  onClick={() => handleUpgradeAction(opt.targetDefinition.id, opt.readyCount)}
                                  className="px-2 py-1 rounded text-xs font-bold bg-[#78350f] hover:bg-[#92400e] text-[#fde68a]"
                                  title={`Mevcut ${opt.readyCount} askerin tamamını terfi ettir`}
                                >
                                  Tümü ({opt.readyCount})
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Terhis Butonu */}
                  <div className="pt-2 border-t border-[#855e2d]/20 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDismissTroopAction(selectedEntity.stack.troopId, 1)}
                      className="px-2.5 py-1 text-xs text-red-300 hover:text-red-100 hover:bg-red-900/40 rounded border border-red-800/40 transition-colors"
                    >
                      Birliği Terhis Et (-1)
                    </button>
                  </div>
                </div>
              ) : (
                /* PRISONER AKSIYONLARI */
                <div className="space-y-3 text-xs">
                  <div className="text-[11px] text-[#a89274]">
                    Tutsaklar zamanla ordunuza katılmaya ikna olabilir veya hanlarda esir tüccarına fidye karşılığı satılabilir.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRecruitPrisonerAction(selectedEntity.stack.troopId, 1)}
                      className="flex-1 py-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded font-bold text-xs shadow transition-colors"
                    >
                      Devşir (Asker Yap)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRansomPrisonerAction(selectedEntity.stack.troopId, 1)}
                      className="flex-1 py-1.5 bg-[#b45309] hover:bg-[#92400e] text-white rounded font-bold text-xs shadow transition-colors"
                    >
                      Fidye İle Sal (+{selectedEntity.definition.tier * 15 + 10} Dinar)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* SAĞ SÜTUN: Kahramanlar, Birlikler ve Tutsaklar Listesi (4/12) */}
          <section className="col-span-4 flex flex-col border-l border-[#855e2d]/30 bg-[#16110c] overflow-hidden">
            <div className="p-3 border-b border-[#855e2d]/30">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#d4af37] flex items-center justify-between">
                <span>Ordu Kadrosu</span>
                <span className="text-[11px] font-mono text-[#fde68a]">
                  {heroes.length} Kahraman · {troopStacks.length} Birlik
                </span>
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* 1. KAHRAMANLAR */}
              <div>
                <div className="text-[10px] font-bold text-[#a89274] uppercase tracking-wider mb-1.5">
                  Kahramanlar &amp; Yoldaşlar
                </div>
                <div className="space-y-1" data-testid="party-heroes-list">
                  {heroes.map((hero) => {
                    const isSelected = selectedEntity.kind === 'HERO' && selectedEntity.hero.id === hero.id;
                    return (
                      <div
                        key={hero.id}
                        data-testid={`party-hero-row-${hero.id}`}
                        onClick={() => setSelectedEntity({ kind: 'HERO', hero })}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer border transition-all ${
                          isSelected
                            ? 'bg-[#3b291a] border-[#d97706] text-white shadow-md'
                            : 'bg-[#1e1711] border-[#855e2d]/20 text-[#d1c2a5] hover:bg-[#281f16]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">👑</span>
                          <div>
                            <div className="font-bold text-xs">{hero.name}</div>
                            <div className="text-[10px] text-[#a89274]">
                              Seviye {hero.level} · {hero.kind === 'PLAYER' ? 'Lider' : 'Yoldaş'}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          {hero.hp}/{hero.maxHp} HP
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. BİRLİKLER */}
              <div>
                <div className="text-[10px] font-bold text-[#a89274] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Asker Birlikleri ({totalTroopsCount})</span>
                  {totalWoundedCount > 0 && (
                    <span className="text-red-400 font-mono">({totalWoundedCount} Yaralı)</span>
                  )}
                </div>
                <div className="space-y-1" data-testid="party-troops-list">
                  {troopStacks.map((stack) => {
                    const def = getTroopDefinition(stack.troopId);
                    if (!def) return null;
                    const isSelected = selectedEntity.kind === 'TROOP' && selectedEntity.stack.troopId === stack.troopId;
                    const readyCount = Math.min(stack.count, Math.floor((stack.xp ?? 0) / Math.max(1, def.upgradeXp)));
                    const xpProgress = Math.min(100, Math.round(((stack.xp ?? 0) / (stack.count * def.upgradeXp)) * 100));

                    return (
                      <div
                        key={stack.troopId}
                        data-testid={`party-troop-row-${stack.troopId}`}
                        onClick={() => setSelectedEntity({ kind: 'TROOP', stack, definition: def })}
                        className={`flex flex-col p-2 rounded cursor-pointer border transition-all ${
                          isSelected
                            ? 'bg-[#3b291a] border-[#d97706] text-white shadow-md'
                            : 'bg-[#1e1711] border-[#855e2d]/20 text-[#d1c2a5] hover:bg-[#281f16]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#2e2114] text-[#d4af37] border border-[#855e2d]/40">
                              {romanNumeral(def.tier)}
                            </span>
                            <div>
                              <div className="font-bold text-xs">{def.name}</div>
                              <div className="text-[10px] text-[#a89274]">
                                {def.battleClass === 'cavalry' ? '🐎 Süvari' : def.battleClass === 'archer' ? '🏹 Okçu' : '🛡️ Piyade'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {readyCount > 0 && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-[#d97706] text-white font-mono text-[10px] font-bold animate-pulse"
                                title={`${readyCount} asker terfiye hazır`}
                              >
                                ⮝ {readyCount}
                              </span>
                            )}
                            <div className="text-right">
                              <span className="font-mono font-bold text-xs text-white">{stack.count}</span>
                              {stack.wounded && stack.wounded > 0 ? (
                                <span className="text-red-400 font-mono text-[10px]"> (-{stack.wounded})</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* XP İlerleme Çubuğu */}
                        {def.upgrades.length > 0 && (
                          <div className="mt-1.5 w-full bg-[#120e0a] h-1 rounded-full overflow-hidden border border-[#855e2d]/20">
                            <div
                              className="bg-gradient-to-r from-[#d97706] to-[#fde68a] h-full transition-all duration-300"
                              style={{ width: `${xpProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. TUTSAKLAR */}
              {prisonerStacks.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1.5">
                    Tutsaklar ({totalPrisonersCount})
                  </div>
                  <div className="space-y-1">
                    {prisonerStacks.map((pStack) => {
                      const def = getTroopDefinition(pStack.troopId);
                      const isSelected = selectedEntity.kind === 'PRISONER' && selectedEntity.stack.troopId === pStack.troopId;
                      return (
                        <div
                          key={pStack.troopId}
                          onClick={() => {
                            if (def) setSelectedEntity({ kind: 'PRISONER', stack: pStack, definition: def });
                          }}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer border transition-all ${
                            isSelected
                              ? 'bg-[#1e2a38] border-sky-500 text-white shadow-md'
                              : 'bg-[#131b24] border-sky-900/30 text-[#b4c6d9] hover:bg-[#1a2533]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs">⛓️</span>
                            <div>
                              <div className="font-bold text-xs">{def?.name ?? pStack.troopId}</div>
                              <div className="text-[10px] text-[#7d93a8]">
                                Kademe {def ? romanNumeral(def.tier) : 'I'}
                              </div>
                            </div>
                          </div>
                          <div className="font-mono font-bold text-xs text-sky-300">
                            {pStack.count} Tutsak
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ALT ŞERİT & BUTONLAR */}
        <footer className="flex items-center justify-between px-6 py-3 bg-[#19130d] border-t border-[#855e2d]/40">
          <div className="text-xs text-[#a89274] flex items-center gap-4">
            <span>
              Toplam Ordu: <strong className="text-white font-mono">{totalTroopsCount}</strong> / {partyCapBreakdown.total}
            </span>
            <span>
              Maaş: <strong className="text-amber-300 font-mono">-{totalDailyWage} Dinar/gün</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              data-testid="party-cancel-btn"
              className="px-5 py-2 text-xs font-bold text-[#d1c2a5] hover:text-white bg-[#261d15] hover:bg-[#382b1f] border border-[#855e2d]/40 rounded shadow transition-colors"
            >
              Vazgeç (Esc)
            </button>
            <button
              type="button"
              onClick={handleDoneCommit}
              data-testid="party-done-btn"
              className="px-6 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#d97706] to-[#b45309] hover:from-[#f59e0b] hover:to-[#d97706] border border-[#fde68a]/50 rounded shadow-lg transition-all"
            >
              Bitti
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
