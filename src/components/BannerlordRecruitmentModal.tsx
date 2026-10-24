import React, { useState, useMemo } from 'react';
import {
  type CampaignState,
  type FactionId,
  type Settlement,
  type TroopDefinition,
  FACTION_INFO,
} from '../game/rules';
import {
  type SettlementNotable,
  NOTABLE_POWER_POWERFUL,
  generateNotables,
} from '../game/notables';
import { hash32 } from '../game/heroes';
import {
  getTroopDefinition,
  TROOP_DEFINITIONS,
} from '../game/bannerlordFoundation';
import { getPartyLimit } from '../game/partySystem';
import { sound } from '../game/sound';
import { Shield, Users, Coins, X, RotateCcw, Check, Lock, ChevronRight } from 'lucide-react';

export interface RecruitmentSlotData {
  slotIndex: number;
  troopId: string;
  troopDef: TroopDefinition;
  requiredRelation: number;
  cost: number;
  isLocked: boolean;
}

export interface NotableRecruiterRow {
  notable: SettlementNotable;
  slots: (RecruitmentSlotData | null)[];
}

interface BannerlordRecruitmentModalProps {
  settlement: Settlement;
  campaign: CampaignState;
  onCommitRecruits: (recruits: Array<{ troopId: string; cost: number; slotKey?: string }>) => void;
  onClose: () => void;
}

/**
 * Yuva ilişki eşikleri (10.7 araştırması): Bannerlord'da ilk üç yuva ilişkisiz
 * açıktır; 4/5/6. yuvalar +5/+10/+20 ilişki ister
 * (`DefaultVolunteerModel.MaximumIndexHeroCanRecruitFromHero` davranışı;
 * topluluk SSS: "starting three troops... 4th, 5th, 6th slots +5, +10, +20").
 * Eski `[0,0,5,10,15,20]` dizisi bu eşiklerin kaymış hâliydi.
 */
const REQUIRED_RELATIONS = [0, 0, 0, 5, 10, 20];

export const BannerlordRecruitmentModal: React.FC<BannerlordRecruitmentModalProps> = ({
  settlement,
  campaign,
  onCommitRecruits,
  onClose,
}) => {
  const faction = settlement.faction;
  const factionInfo = FACTION_INFO[faction];

  // 1. Get or generate Notables for this settlement
  const notables = useMemo<SettlementNotable[]>(() => {
    if (settlement.notables && settlement.notables.length > 0) {
      return settlement.notables;
    }
    return generateNotables(settlement, campaign.world?.seed ?? 1084);
  }, [settlement, campaign.world?.seed]);

  // 2. Candidate troops from this settlement's culture
  const cultureTroops = useMemo(() => {
    return TROOP_DEFINITIONS.filter((t) => t.culture === faction);
  }, [faction]);

  const recruitTroop = cultureTroops.find((t) => t.tier === 1) || cultureTroops[0];
  const tier2Troops = cultureTroops.filter((t) => t.tier === 2 && !t.isNobleLine);
  // 10.9/10.7: soylu hattın kökü (T2) yalnız Güçlü (200+) toprak sahiplerinden
  // devşirilebilir; soylu hat ara kademeleri gönüllü olarak verilmez.
  const nobleRecruit = cultureTroops.find((t) => t.isNobleLine && t.tier === 2);

  // 3. Build initial 6 slots for each notable deterministically (emptying already-recruited slots & varying count per village)
  const initialRows = useMemo<NotableRecruiterRow[]>(() => {
    const takenSet = new Set(settlement.recruitedSlotKeys ?? []);
    const isVillage = settlement.type === 'VILLAGE';

    return notables.map((notable, nIdx) => {
      const slots: (RecruitmentSlotData | null)[] = [];
      const isLandowner = notable.role === 'headman' || notable.role === 'elder';
      // Bannerlord: soylu hat yalnız Güçlü (200+) köy toprak sahiplerinden gelir (10.7).
      const isPowerful = notable.power >= NOTABLE_POWER_POWERFUL;

      // Her köy ve eşraf farklı/rastgele sayıda gönüllü asker çıkarır (köylerde eşraf başına 1..4, şehirlerde 2..5)
      const notableSeed = hash32(`${settlement.id}:${notable.id}:${nIdx}`);
      const filledSlotCount = isVillage
        ? 1 + (notableSeed % 4)
        : 2 + (notableSeed % 4);

      for (let sIdx = 0; sIdx < 6; sIdx++) {
        const slotKey = `${notable.id}_${sIdx}`;
        // Eğer bu slot daha önce toplandıysa veya bu eşrafın mevcut gönüllü sayısını aşıyorsa slot BOŞ görünür
        if (takenSet.has(slotKey) || sIdx >= filledSlotCount) {
          slots.push(null);
          continue;
        }

        const requiredRelation = REQUIRED_RELATIONS[sIdx];
        const isLocked = notable.relation < requiredRelation;

        // Choose unit based on slot index & power
        let targetTroop = recruitTroop;
        let baseCost = 20;

        if (sIdx === 0 || sIdx === 1) {
          targetTroop = recruitTroop;
          baseCost = 20;
        } else if (sIdx === 2 || sIdx === 3) {
          if (tier2Troops.length > 0) {
            targetTroop = tier2Troops[(nIdx + sIdx + (notableSeed % 3)) % tier2Troops.length];
            baseCost = 50;
          } else {
            targetTroop = recruitTroop;
            baseCost = 20;
          }
        } else {
          // Slot 4 & 5: Güçlü toprak sahibi soylu hattın kökünü (T2) verir.
          if (isLandowner && isPowerful && nobleRecruit) {
            targetTroop = nobleRecruit;
            baseCost = 120;
          } else if (tier2Troops.length > 0) {
            targetTroop = tier2Troops[nIdx % tier2Troops.length];
            baseCost = 50;
          } else {
            targetTroop = recruitTroop;
            baseCost = 20;
          }
        }

        if (!targetTroop) {
          slots.push(null);
        } else {
          slots.push({
            slotIndex: sIdx,
            troopId: targetTroop.id,
            troopDef: targetTroop,
            requiredRelation,
            cost: baseCost,
            isLocked,
          });
        }
      }

      return {
        notable,
        slots,
      };
    });
  }, [notables, recruitTroop, tier2Troops, nobleRecruit, settlement.id, settlement.type, settlement.recruitedSlotKeys]);

  // 4. Session State: which slot recruits have been picked into pending basket
  // Key: `${notableId}_${slotIndex}`
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(new Set());

  // Pending queue of picked recruits
  const pendingRecruits = useMemo(() => {
    const list: Array<{ key: string; notableName: string; slot: RecruitmentSlotData }> = [];
    initialRows.forEach((row) => {
      row.slots.forEach((slot) => {
        if (!slot) return;
        const key = `${row.notable.id}_${slot.slotIndex}`;
        if (pickedKeys.has(key)) {
          list.push({
            key,
            notableName: row.notable.name,
            slot,
          });
        }
      });
    });
    return list;
  }, [initialRows, pickedKeys]);

  const totalCost = pendingRecruits.reduce((sum, item) => sum + item.slot.cost, 0);

  // Party limits
  const currentPartyCount = (campaign.troopStacks ?? []).reduce(
    (sum, st) => sum + st.count,
    0,
  );
  // Party limit from campaign logic (Bannerlord party limits formula)
  const maxPartyLimit = useMemo(() => {
    return getPartyLimit(campaign);
  }, [campaign]);

  const roomLeft = Math.max(0, maxPartyLimit - currentPartyCount);

  const availableUnlockedSlots = useMemo(() => {
    let count = 0;
    for (const row of initialRows) {
      for (const slot of row.slots) {
        if (slot && !slot.isLocked) count++;
      }
    }
    return count;
  }, [initialRows]);

  // Handlers
  const togglePickSlot = (notableId: string, slot: RecruitmentSlotData) => {
    if (slot.isLocked) return;
    const key = `${notableId}_${slot.slotIndex}`;
    setPickedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        sound.playCoin();
      } else {
        if (next.size >= roomLeft) {
          return prev; // Room limit reached
        }
        if (totalCost + slot.cost > campaign.gold) {
          return prev; // Not enough gold
        }
        next.add(key);
        sound.playCoin();
      }
      return next;
    });
  };

  const handleRecruitAll = () => {
    if (availableUnlockedSlots <= 0) return;
    setPickedKeys((prev) => {
      const next = new Set(prev);
      let runningCost = totalCost;

      for (const row of initialRows) {
        for (const slot of row.slots) {
          if (!slot || slot.isLocked) continue;
          const key = `${row.notable.id}_${slot.slotIndex}`;
          if (next.has(key)) continue;

          if (next.size >= roomLeft) break;
          if (runningCost + slot.cost > campaign.gold) break;

          next.add(key);
          runningCost += slot.cost;
        }
      }
      sound.playCoin();
      return next;
    });
  };

  const handleReset = () => {
    setPickedKeys(new Set());
    sound.playShieldHit();
  };

  const handleCommit = () => {
    if (pendingRecruits.length === 0) {
      onClose();
      return;
    }
    const payload = pendingRecruits.map((p) => ({
      troopId: p.slot.troopId,
      cost: p.slot.cost,
      slotKey: p.key,
    }));
    sound.playWarhorn();
    onCommitRecruits(payload);
  };

  return (
    <div
      data-testid="bannerlord-recruitment-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md pointer-events-auto select-none"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl border-2 border-[#c6a15b]/80 bg-[#14120e] text-[#f4ecd8] shadow-2xl overflow-hidden font-sans">
        {/* TOP ORNATE BANNER HEADER */}
        <div className="relative flex items-center justify-between px-6 py-3 border-b-2 border-[#c6a15b]/40 bg-gradient-to-r from-[#1c1813] via-[#2a2218] to-[#1c1813]">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚔️</span>
            <div>
              <h2 className="text-lg font-display font-bold tracking-wider text-[#fde68a] uppercase drop-shadow">
                Asker Toplama
              </h2>
              <p className="text-xs text-[#a89b84]">
                {settlement.name} · {factionInfo.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="recruitment-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#c6a15b]/40 bg-[#1e1913] hover:bg-[#342a1f] text-[#fef08a] transition"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* MAIN BODY: 2 COLUMNS (LEFT: NOTABLES & 6 SLOTS, RIGHT: PENDING BASKET) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* LEFT: NOTABLES WITH 6 SLOTS */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 border-b md:border-b-0 md:border-r border-[#c6a15b]/25">
            <div className="flex items-center justify-between text-xs text-[#c6a15b] font-semibold border-b border-[#c6a15b]/20 pb-2">
              <span>EŞRAF & YEREL BİRLİKLER</span>
              <button
                type="button"
                data-testid="recruitment-all-btn"
                disabled={availableUnlockedSlots <= 0}
                onClick={handleRecruitAll}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#b45309] hover:bg-[#d97706] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition shadow"
              >
                <span>Hepsini Al ⚑</span>
              </button>
            </div>

            {availableUnlockedSlots <= 0 && (
              <div
                data-testid="recruitment-empty-banner"
                className="p-2.5 rounded border border-[#f59e0b]/50 bg-[#292014] text-xs text-[#fde68a]"
              >
                Bu yerleşimdeki alınabilir gönüllü askerlerin tamamı toplandı (yuvalar boş). Eşraf yeni gönüllüleri günlük üretimle azar azar sunar; kilitli yuvalar için eşrafla ilişki gerekir.
              </div>
            )}

            {initialRows.map((row) => (
              <div
                key={row.notable.id}
                className="p-3 rounded-lg border border-[#c6a15b]/30 bg-[#1a1611]/90 flex flex-col lg:flex-row lg:items-center gap-3"
              >
                {/* Notable Avatar & Info */}
                <div className="w-44 shrink-0 flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-full border border-[#f59e0b]/50 bg-[#282117] flex items-center justify-center text-lg shadow-inner shrink-0">
                    {row.notable.avatarIcon === 'crown' && '👑'}
                    {row.notable.avatarIcon === 'shield' && '🛡️'}
                    {row.notable.avatarIcon === 'coins' && '💰'}
                    {row.notable.avatarIcon === 'beer' && '🍺'}
                    {row.notable.avatarIcon === 'wheat' && '🌾'}
                    {row.notable.avatarIcon === 'swords' && '⚔️'}
                    {row.notable.avatarIcon === 'hammer' && '⚒️'}
                    {!['crown', 'shield', 'coins', 'beer', 'wheat', 'swords', 'hammer'].includes(
                      row.notable.avatarIcon,
                    ) && '👤'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#fef08a] truncate">
                      {row.notable.name}
                    </div>
                    <div className="text-[10px] text-[#a89b84] truncate">
                      {row.notable.title}
                    </div>
                    <div className="text-[10px] font-mono flex items-center gap-2 mt-0.5">
                      <span className="text-[#34d399]">İlişki: {row.notable.relation > 0 ? `+${row.notable.relation}` : row.notable.relation}</span>
                      <span className="text-[#fbbf24]">Güç: {row.notable.power}</span>
                    </div>
                  </div>
                </div>

                {/* The 6 Slots Row */}
                <div className="flex-1 grid grid-cols-6 gap-2">
                  {row.slots.map((slot, sIdx) => {
                    if (!slot) {
                      return (
                        <div
                          key={sIdx}
                          className="h-20 rounded border border-dashed border-[#c6a15b]/20 bg-[#13100c]/60 flex items-center justify-center text-[10px] text-[#6b6255]"
                        >
                          Boş
                        </div>
                      );
                    }

                    const key = `${row.notable.id}_${slot.slotIndex}`;
                    const isPicked = pickedKeys.has(key);

                    if (slot.isLocked) {
                      return (
                        <div
                          key={sIdx}
                          title={`İmparatorluk Acemi Askeri\nSeviye: 6\nBu birliği elde etmek için ilgili eşraf ile yeterli ilişkin yok.\nİlişkin: ${row.notable.relation}. Gereken: ${slot.requiredRelation}`}
                          className="relative h-20 rounded border border-[#524838] bg-[#16130f] p-1.5 flex flex-col items-center justify-between opacity-50 grayscale cursor-not-allowed group"
                        >
                          <div className="absolute top-1 right-1 text-red-400">
                            <Lock size={12} />
                          </div>
                          <span className="text-xl mt-1">👤</span>
                          <span className="text-[10px] font-semibold text-center truncate w-full text-stone-400">
                            {slot.troopDef.name}
                          </span>
                          <span className="text-[10px] text-amber-500/70 font-mono">
                            {slot.cost} 🟡
                          </span>

                          {/* Hover Tooltip matching Steam guide */}
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-30 w-52 p-2 rounded bg-black/95 border border-red-500/50 text-[11px] text-[#f4ecd8] shadow-xl pointer-events-none">
                            <div className="font-bold text-[#fef08a]">{slot.troopDef.name}</div>
                            <div className="text-[10px] text-[#a89b84]">Seviye: {slot.troopDef.tier * 5}</div>
                            <div className="text-red-300 mt-1 leading-tight">
                              Bu birliği elde etmek için ilgili eşraf ile yeterli ilişkin yok.
                            </div>
                            <div className="text-[10px] text-amber-300 mt-1">
                              İlişkin: {row.notable.relation}. Gereken: {slot.requiredRelation}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={sIdx}
                        type="button"
                        data-testid={`recruitment-slot-${row.notable.id}-${slot.slotIndex}`}
                        onClick={() => togglePickSlot(row.notable.id, slot)}
                        className={`relative h-20 rounded border p-1.5 flex flex-col items-center justify-between transition-all cursor-pointer ${
                          isPicked
                            ? 'border-[#34d399] bg-[#14301d] ring-2 ring-[#34d399]/60 shadow-lg'
                            : 'border-[#c6a15b]/40 bg-[#221c15] hover:bg-[#2d251c] hover:border-[#fde68a]'
                        }`}
                      >
                        <div className="text-xl mt-0.5">
                          {slot.troopDef.battleClass === 'cavalry' && '🐎'}
                          {slot.troopDef.battleClass === 'archer' && '🏹'}
                          {slot.troopDef.battleClass === 'horseArcher' && '🏹🐎'}
                          {slot.troopDef.battleClass === 'infantry' && '⚔️'}
                        </div>
                        <span className="text-[10px] font-semibold text-center truncate w-full text-[#fef08a]">
                          {slot.troopDef.name}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-[#fbbf24]">
                          <span>{slot.cost}</span>
                          <span>🟡</span>
                        </div>
                        {isPicked && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#34d399] text-black font-bold flex items-center justify-center text-xs shadow">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: PENDING BASKET COLUMN */}
          <div className="w-full md:w-64 p-4 bg-[#18140f] flex flex-col shrink-0">
            <div className="text-xs font-bold text-[#c6a15b] uppercase tracking-wider pb-2 border-b border-[#c6a15b]/25 flex items-center justify-between">
              <span>ALINANLAR (SEPET)</span>
              <span className="font-mono text-[#fef08a]">{pendingRecruits.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto my-3 space-y-1.5 pr-1">
              {pendingRecruits.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-[#8c8273]">
                  <span>Soldaki açık slotlara tıklayarak asker seçin.</span>
                </div>
              ) : (
                pendingRecruits.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setPickedKeys((prev) => {
                        const next = new Set(prev);
                        next.delete(item.key);
                        return next;
                      });
                      sound.playCoin();
                    }}
                    className="p-2 rounded border border-[#c6a15b]/30 bg-[#221a13] hover:bg-[#342417] hover:border-red-500/50 flex items-center justify-between text-xs cursor-pointer group transition"
                    title="Sepetten çıkarmak için tıkla"
                  >
                    <div>
                      <div className="font-semibold text-[#fef08a] truncate max-w-[130px]">
                        {item.slot.troopDef.name}
                      </div>
                      <div className="text-[10px] text-[#a89b84] truncate">
                        {item.notableName}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[#fbbf24] font-mono text-xs">{item.slot.cost} 🟡</div>
                      <div className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition">
                        Çıkar ×
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* CAPACITY WARNING IF FULL */}
            {roomLeft <= 0 && (
              <div className="p-2 mb-2 rounded bg-red-950/60 border border-red-500/50 text-[11px] text-red-200 text-center">
                Parti kapasitesi dolu!
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM METRICS STRIP (MATCHING STEAM SCREENSHOT EXACTLY) */}
        <div className="px-6 py-2.5 border-t border-[#c6a15b]/30 bg-[#17130e] flex flex-wrap items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-5 text-[#f4ecd8]">
            <span className="flex items-center gap-1.5">
              <span>🐎 Hız:</span>
              <strong className="text-[#fef08a]">5.8</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span>👥 Alınan:</span>
              <strong className="text-[#34d399]">{pendingRecruits.length}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span>🛡 Parti:</span>
              <strong className={currentPartyCount + pendingRecruits.length >= maxPartyLimit ? 'text-red-400' : 'text-[#fef08a]'}>
                {currentPartyCount + pendingRecruits.length} / {maxPartyLimit}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span>💰 Kasa:</span>
              <strong className="text-[#fbbf24]">{campaign.gold} Dinar</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#a89b84]">Toplam Tutar:</span>
            <strong className="text-sm font-bold text-red-400">
              {totalCost > 0 ? `-${totalCost} Dinar` : '0 Dinar'}
            </strong>
          </div>
        </div>

        {/* BOTTOM CONFIRMATION BUTTONS: İPTAL ET | SIFIRLA | BİTTİ */}
        <div className="px-6 py-3 border-t-2 border-[#c6a15b]/40 bg-[#1a1611] flex items-center justify-between">
          <button
            type="button"
            data-testid="recruitment-cancel-btn"
            onClick={onClose}
            className="px-5 py-2 rounded text-xs font-bold bg-[#261f17] hover:bg-[#382d22] text-[#d6cbb5] border border-[#c6a15b]/40 transition"
          >
            İptal Et
          </button>

          <button
            type="button"
            data-testid="recruitment-reset-btn"
            onClick={handleReset}
            disabled={pendingRecruits.length === 0}
            className="p-2 rounded-full bg-[#201a14] hover:bg-[#332a20] text-[#c6a15b] border border-[#c6a15b]/40 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Sıfırla"
          >
            <RotateCcw size={16} />
          </button>

          <button
            type="button"
            data-testid="recruitment-done-btn"
            onClick={handleCommit}
            className="px-7 py-2 rounded text-xs font-bold bg-[#166534] hover:bg-[#15803d] text-[#ecfdf5] border border-[#34d399]/60 shadow-lg transition flex items-center gap-2"
          >
            <Check size={16} />
            <span>Bitti</span>
          </button>
        </div>
      </div>
    </div>
  );
};
