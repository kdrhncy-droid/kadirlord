import React, { useState, useMemo } from 'react';
import {
  type AttributeId,
  type BannerlordSkillId,
  type CampaignHero,
  type CampaignState,
  type ClanRoleId,
  FACTION_INFO,
} from '../game/rules';
import {
  SKILL_ATTRIBUTE_MAP,
  ATTRIBUTE_SKILLS_MAP,
  SKILL_LABELS,
  ATTRIBUTE_LABELS,
  calculateLearningLimit,
  calculateLearningRate,
  getXpRequiredForSkillLevel,
  getCharacterXpRequired,
  allocateHeroFocus,
  allocateHeroAttribute,
  syncPlayerHeroToCampaign,
} from '../game/characterDevelopment';
import {
  PERK_CATALOG,
  getPerksForSkill,
  unlockHeroPerk,
} from '../game/perks';
import { sound } from '../game/sound';
import {
  Shield,
  Zap,
  Star,
  Award,
  ChevronLeft,
  ChevronRight,
  X,
  Lock,
  Check,
  User,
} from 'lucide-react';

const CLAN_ROLE_LABELS: Record<ClanRoleId, string> = {
  QUARTERMASTER: '📦 İaşeci (Steward)',
  SCOUT: '🧭 İzci (Scout)',
  SURGEON: '⚕️ Cerrah (Surgeon)',
  ENGINEER: '⚙️ Mühendis (Engineer)',
};

interface CharacterModalProps {
  campaign: CampaignState;
  onUpdateCampaign: (next: CampaignState) => void;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  campaign,
  onUpdateCampaign,
  onClose,
  onShowToast,
}) => {
  const toast = (msg: string) => onShowToast?.(msg);
  // 1. Available Heroes to inspect (Player + Companions + Family)
  const heroes = useMemo<CampaignHero[]>(() => {
    return campaign.heroes ?? [];
  }, [campaign.heroes]);

  const [selectedHeroIndex, setSelectedHeroIndex] = useState<number>(0);
  const currentHero = heroes[selectedHeroIndex] ?? heroes[0];

  // 2. Selected skill for viewing Perk Tree in right panel
  const [selectedSkillId, setSelectedSkillId] = useState<BannerlordSkillId>('oneHanded');

  if (!currentHero) return null;

  const charLevel = currentHero.level || 1;
  const charXp = currentHero.xp || 0;
  const charXpReq = getCharacterXpRequired(charLevel);
  const charXpPercent = Math.min(100, Math.floor((charXp / charXpReq) * 100));

  const freeAttrs = currentHero.freeAttributePoints || 0;
  const freeFocus = currentHero.freeFocusPoints || 0;

  // Navigation between heroes
  const handlePrevHero = () => {
    sound.playCoin();
    setSelectedHeroIndex((prev) => (prev > 0 ? prev - 1 : heroes.length - 1));
  };

  const handleNextHero = () => {
    sound.playCoin();
    setSelectedHeroIndex((prev) => (prev < heroes.length - 1 ? prev + 1 : 0));
  };

  // Attribute allocation handler
  const handleAllocateAttribute = (attrId: AttributeId) => {
    const res = allocateHeroAttribute(currentHero, attrId);
    if (res.success) {
      sound.playWarhorn();
      toast(`${ATTRIBUTE_LABELS[attrId].name} niteliği artırıldı!`);
      const nextCampaign = syncPlayerHeroToCampaign(res.hero, campaign);
      onUpdateCampaign(nextCampaign);
    } else if (res.reason) {
      toast(res.reason);
    }
  };

  // Focus point allocation handler
  const handleAllocateFocus = (skillId: BannerlordSkillId) => {
    const res = allocateHeroFocus(currentHero, skillId);
    if (res.success) {
      sound.playCoin();
      toast(`${SKILL_LABELS[skillId]} için 1 Odak Puanı yatırıldı!`);
      const nextCampaign = syncPlayerHeroToCampaign(res.hero, campaign);
      onUpdateCampaign(nextCampaign);
    } else if (res.reason) {
      toast(res.reason);
    }
  };

  // Perk unlock handler
  const handleUnlockPerk = (perkId: string) => {
    const res = unlockHeroPerk(currentHero, perkId);
    if (res.success) {
      sound.playWarhorn();
      toast('Yeni perk başarıyla açıldı!');
      const nextCampaign = syncPlayerHeroToCampaign(res.hero, campaign);
      onUpdateCampaign(nextCampaign);
    } else if (res.reason) {
      toast(res.reason);
    }
  };

  // Active Clan Role of current hero
  const assignedRole: ClanRoleId | null =
    (Object.keys(campaign.roleAssignments ?? {}) as ClanRoleId[]).find(
      (role) => campaign.roleAssignments?.[role] === currentHero.id,
    ) ?? null;

  const handleAssignRole = (newRole: ClanRoleId | 'NONE') => {
    const nextAssignments = { ...(campaign.roleAssignments ?? {}) };
    (Object.keys(nextAssignments) as ClanRoleId[]).forEach((r) => {
      if (nextAssignments[r] === currentHero.id) {
        nextAssignments[r] = null;
      }
    });
    if (newRole !== 'NONE') {
      nextAssignments[newRole] = currentHero.id;
    }
    const nextClanRoles: Record<ClanRoleId, string> = {
      QUARTERMASTER: campaign.clanRoles?.QUARTERMASTER ?? '',
      SCOUT: campaign.clanRoles?.SCOUT ?? '',
      SURGEON: campaign.clanRoles?.SURGEON ?? '',
      ENGINEER: campaign.clanRoles?.ENGINEER ?? '',
    };
    (Object.keys(nextAssignments) as ClanRoleId[]).forEach((r) => {
      const hid = nextAssignments[r];
      const h = heroes.find((candidate) => candidate.id === hid);
      nextClanRoles[r] = h?.name ?? '';
    });

    const nextCampaign: CampaignState = {
      ...campaign,
      roleAssignments: nextAssignments,
      clanRoles: nextClanRoles,
    };
    onUpdateCampaign(nextCampaign);
    sound.playCoin();
    toast(
      newRole !== 'NONE'
        ? `${currentHero.name} artık klanın ${CLAN_ROLE_LABELS[newRole]} rolünde!`
        : `${currentHero.name} üzerindeki klan rolü kaldırıldı.`,
    );
  };

  // Selected skill perks
  const perkPairs = getPerksForSkill(selectedSkillId);
  const selectedAttrId = SKILL_ATTRIBUTE_MAP[selectedSkillId];
  const selectedAttrVal = currentHero.attributes[selectedAttrId] ?? 2;
  const selectedSkillState = currentHero.skills[selectedSkillId] ?? { level: 10, focus: 0, xp: 0 };
  const selectedLimit = calculateLearningLimit(selectedAttrVal, selectedSkillState.focus);
  const selectedRate = calculateLearningRate(
    selectedSkillState.level,
    selectedAttrVal,
    selectedSkillState.focus,
  );

  return (
    <div
      data-testid="bannerlord-character-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md pointer-events-auto select-none animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-7xl h-[94vh] rounded-xl border-2 border-[#c6a15b]/80 bg-[#120f0c] text-[#f4ecd8] shadow-2xl flex flex-col overflow-hidden font-sans">
        
        {/* ========================================================= */}
        {/* TOP HEADER: HERO SELECTOR, LEVEL & UNSPENT POINTS         */}
        {/* ========================================================= */}
        <header className="px-5 py-3 border-b-2 border-[#c6a15b]/40 bg-[#1a1510] flex flex-wrap items-center justify-between gap-3">
          {/* Left: Hero Switcher */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="char-prev-hero"
              onClick={handlePrevHero}
              className="p-1.5 rounded bg-[#261f17] hover:bg-[#382d22] text-[#c6a15b] border border-[#c6a15b]/30 transition"
              title="Önceki Kahraman"
            >
              <ChevronLeft size={18} />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-display font-bold text-[#fef08a] tracking-wide">
                  {currentHero.name}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#241c14] border border-[#c6a15b]/30 text-[#d4af37] font-semibold">
                  {currentHero.kind === 'PLAYER' ? '👑 Klan Lideri' : '⚔️ Yoldaş'}
                </span>
                <select
                  data-testid="char-clan-role-select"
                  aria-label="Klan Rolü Ata"
                  value={assignedRole ?? 'NONE'}
                  onChange={(e) => handleAssignRole(e.target.value as ClanRoleId | 'NONE')}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#18130e] border border-[#c6a15b]/40 text-[#fde68a] font-semibold cursor-pointer hover:border-[#fbbf24] transition outline-none"
                  title="Klan Rolü Ata"
                >
                  <option value="NONE">Rol: Yok</option>
                  <option value="QUARTERMASTER">📦 İaşeci (Steward)</option>
                  <option value="SCOUT">🧭 İzci (Scout)</option>
                  <option value="SURGEON">⚕️ Cerrah (Surgeon)</option>
                  <option value="ENGINEER">⚙️ Mühendis (Engineer)</option>
                </select>
              </div>
              <div className="text-xs text-[#a89b84]">
                {FACTION_INFO[currentHero.culture]?.name || 'Kalradya'} · {currentHero.age} Yaşında
              </div>
            </div>

            <button
              type="button"
              data-testid="char-next-hero"
              onClick={handleNextHero}
              className="p-1.5 rounded bg-[#261f17] hover:bg-[#382d22] text-[#c6a15b] border border-[#c6a15b]/30 transition"
              title="Sonraki Kahraman"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Center: Character Level & XP Bar */}
          <div className="flex-1 max-w-xs hidden md:flex flex-col gap-1">
            <div className="flex justify-between text-xs font-semibold text-[#e2d6c1]">
              <span>Karakter Seviyesi: <strong className="text-[#fbbf24]">{charLevel}</strong></span>
              <span className="text-[10px] text-[#a89b84]">{charXp} / {charXpReq} XP</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-[#201a14] border border-[#c6a15b]/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#b45309] to-[#fbbf24] transition-all duration-300"
                style={{ width: `${charXpPercent}%` }}
              />
            </div>
          </div>

          {/* Right: Unspent Points & Close */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <div
                className={`px-2.5 py-1 rounded border flex items-center gap-1.5 font-bold ${
                  freeAttrs > 0
                    ? 'bg-[#450a0a] border-[#ef4444] text-[#fca5a5] animate-pulse'
                    : 'bg-[#1e1913] border-[#c6a15b]/20 text-[#a89b84]'
                }`}
                title="Her 4 karakter seviyesinde 1 Nitelik puanı kazanılır"
              >
                <span>🔴 Nitelik:</span>
                <span className="text-sm">{freeAttrs}</span>
              </div>

              <div
                className={`px-2.5 py-1 rounded border flex items-center gap-1.5 font-bold ${
                  freeFocus > 0
                    ? 'bg-[#451a03] border-[#f59e0b] text-[#fde68a] animate-pulse'
                    : 'bg-[#1e1913] border-[#c6a15b]/20 text-[#a89b84]'
                }`}
                title="Her karakter seviyesinde 1 Odak puanı kazanılır"
              >
                <span>🟡 Odak:</span>
                <span className="text-sm">{freeFocus}</span>
              </div>
            </div>

            <button
              type="button"
              data-testid="char-modal-close"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#201a14] hover:bg-[#332a20] text-[#c6a15b] border border-[#c6a15b]/40 transition"
              title="Kapat [Esc / C]"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ========================================================= */}
        {/* MAIN BODY: 2-PANEL LAYOUT (LEFT: ATTRIBUTES & SKILLS,     */}
        {/*                          RIGHT: PERK TREE INSPECTION)    */}
        {/* ========================================================= */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* ------------------------------------------------------- */}
          {/* LEFT COLUMN: 6 ATTRIBUTES & 18 SKILLS LIST              */}
          {/* ------------------------------------------------------- */}
          <div className="w-full lg:w-7/12 h-1/2 lg:h-full overflow-y-auto p-3 sm:p-4 space-y-4 border-b lg:border-b-0 lg:border-r border-[#c6a15b]/30 bg-[#14100c]/90">
            {(
              [
                'VIGOR',
                'CONTROL',
                'ENDURANCE',
                'CUNNING',
                'SOCIAL',
                'INTELLIGENCE',
              ] as AttributeId[]
            ).map((attrId) => {
              const attrVal = currentHero.attributes[attrId] ?? 2;
              const attrSkills = ATTRIBUTE_SKILLS_MAP[attrId];
              const attrInfo = ATTRIBUTE_LABELS[attrId];

              return (
                <div
                  key={attrId}
                  className="rounded-lg border border-[#c6a15b]/30 bg-[#1a1510] p-3 shadow-md"
                >
                  {/* Attribute Title Header */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#c6a15b]/20">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-display text-[#fde68a] tracking-wide">
                        {attrInfo.name}
                      </span>
                      <span className="text-base font-mono font-bold text-[#fef08a] px-2 py-0.5 rounded bg-[#282015] border border-[#c6a15b]/30">
                        {attrVal} / 10
                      </span>
                      <span className="text-[11px] text-[#a89b84] hidden sm:inline">
                        — {attrInfo.desc}
                      </span>
                    </div>

                    {freeAttrs > 0 && attrVal < 10 && (
                      <button
                        type="button"
                        onClick={() => handleAllocateAttribute(attrId)}
                        className="px-2.5 py-1 rounded bg-[#b45309] hover:bg-[#d97706] text-white text-xs font-bold transition flex items-center gap-1 shadow"
                        title="Nitelik puanı ver (+1)"
                      >
                        <span>+ Nitelik Ver</span>
                      </button>
                    )}
                  </div>

                  {/* Skills Grid under this Attribute */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {attrSkills.map((sId) => {
                      const skillState = currentHero.skills[sId] ?? { level: 10, focus: 0, xp: 0 };
                      const limit = calculateLearningLimit(attrVal, skillState.focus);
                      const rate = calculateLearningRate(skillState.level, attrVal, skillState.focus);
                      const isSelected = selectedSkillId === sId;

                      return (
                        <div
                          key={sId}
                          onClick={() => {
                            sound.playCoin();
                            setSelectedSkillId(sId);
                          }}
                          className={`cursor-pointer rounded-lg p-2.5 border transition-all flex flex-col justify-between gap-1.5 ${
                            isSelected
                              ? 'border-[#fbbf24] bg-[#292015] ring-1 ring-[#fbbf24]/50 shadow-lg'
                              : 'border-[#c6a15b]/20 bg-[#16120e] hover:bg-[#221a13] hover:border-[#c6a15b]/50'
                          }`}
                        >
                          {/* Skill Name & Level */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold truncate text-[#f4ecd8]">
                              {SKILL_LABELS[sId]}
                            </span>
                            <span className="text-xs font-mono font-bold text-[#fbbf24]">
                              {skillState.level}
                            </span>
                          </div>

                          {/* Focus Points Pips (● ● ○ ○ ○) */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {[0, 1, 2, 3, 4].map((idx) => (
                                <div
                                  key={idx}
                                  className={`w-2.5 h-2.5 rounded-full border ${
                                    idx < skillState.focus
                                      ? 'bg-[#fbbf24] border-[#d97706]'
                                      : 'bg-[#201a14] border-[#c6a15b]/30'
                                  }`}
                                />
                              ))}
                            </div>

                            {freeFocus > 0 && skillState.focus < 5 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAllocateFocus(sId);
                                }}
                                className="w-5 h-5 rounded bg-[#b45309] hover:bg-[#d97706] text-white text-xs font-bold flex items-center justify-center shadow"
                                title="Odak puanı ver (+1)"
                              >
                                +
                              </button>
                            )}
                          </div>

                          {/* Learning Rate & Limit Info */}
                          <div className="flex items-center justify-between text-[10px] text-[#a89b84]">
                            <span>Hız: <strong className="text-[#34d399]">{rate}x</strong></span>
                            <span>Sınır: <strong className="text-[#fde68a]">{limit}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ------------------------------------------------------- */}
          {/* RIGHT COLUMN: PERK TREE FOR SELECTED SKILL              */}
          {/* ------------------------------------------------------- */}
          <div className="w-full lg:w-5/12 h-1/2 lg:h-full overflow-y-auto p-4 sm:p-6 bg-[#16120d] flex flex-col">
            
            {/* Header of Selected Skill */}
            <div className="pb-3 mb-4 border-b border-[#c6a15b]/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-display font-bold text-[#fef08a] flex items-center gap-2">
                    <span>⚔️</span>
                    <span>{SKILL_LABELS[selectedSkillId]}</span>
                  </h3>
                  <p className="text-xs text-[#b5a890] mt-0.5">
                    Bağlı Nitelik: <strong className="text-[#fde68a]">{ATTRIBUTE_LABELS[selectedAttrId].name}</strong> ({selectedAttrVal})
                  </p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-2xl font-bold text-[#fbbf24]">{selectedSkillState.level}</div>
                  <div className="text-[10px] text-[#a89b84]">Seviye Sınırı: {selectedLimit}</div>
                </div>
              </div>

              {/* Learning Multiplier Banner */}
              <div className="mt-3 p-2 rounded bg-[#201a14] border border-[#c6a15b]/20 flex items-center justify-between text-xs">
                <span className="text-[#c6a15b]">Mevcut Öğrenme Hızı:</span>
                <span className="font-bold font-mono text-[#34d399]">{selectedRate}x Kat</span>
              </div>
            </div>

            {/* Perk Milestone Branches */}
            <div className="flex-1 space-y-4">
              <h4 className="text-xs font-bold text-[#c6a15b] tracking-wider uppercase mb-2">
                Açılabilir Beceri Perkleri (Her kademede 1 seçim)
              </h4>

              {Object.keys(perkPairs).length === 0 ? (
                <div className="text-xs text-[#8b8072] italic p-4 text-center">
                  Bu beceri için henüz perk düğümü tanımlanmadı.
                </div>
              ) : (
                Object.entries(perkPairs).map(([reqLevelStr, [perkA, perkB]]) => {
                  const reqLevel = Number(reqLevelStr);
                  const isEligible = selectedSkillState.level >= reqLevel;
                  const heroPerks = currentHero.perks ?? [];
                  const isAActive = heroPerks.includes(perkA.id);
                  const isBActive = heroPerks.includes(perkB.id);

                  return (
                    <div
                      key={reqLevel}
                      className={`p-3 rounded-xl border transition ${
                        isEligible
                          ? 'border-[#c6a15b]/40 bg-[#1c1712]'
                          : 'border-[#44382a]/30 bg-[#14100c]/60 opacity-65'
                      }`}
                    >
                      {/* Milestone Header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-[#2b2218] text-[#fef08a] border border-[#c6a15b]/30">
                          SEVİYE {reqLevel}
                        </span>
                        {!isEligible && (
                          <span className="text-[10px] text-[#ef4444] font-semibold flex items-center gap-1">
                            <Lock size={12} /> Kilitli ({reqLevel - selectedSkillState.level} seviye kaldı)
                          </span>
                        )}
                      </div>

                      {/* 2 Choice Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Option A */}
                        <div
                          className={`p-2.5 rounded-lg border flex flex-col justify-between gap-2 transition ${
                            isAActive
                              ? 'border-[#34d399] bg-[#14301d] ring-1 ring-[#34d399]'
                              : isEligible
                              ? 'border-[#c6a15b]/30 bg-[#221a13] hover:border-[#fbbf24]'
                              : 'border-[#3a3024]/40 bg-[#16120e]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#fef08a]">{perkA.name}</span>
                              {isAActive && <Check size={14} className="text-[#34d399]" />}
                            </div>
                            <p className="text-[11px] text-[#d4c7b2] mt-1 leading-snug">
                              {perkA.description}
                            </p>
                          </div>

                          {isEligible && !isAActive && (
                            <button
                              type="button"
                              onClick={() => handleUnlockPerk(perkA.id)}
                              className="w-full py-1 rounded bg-[#b45309] hover:bg-[#d97706] text-white text-[11px] font-bold shadow transition"
                            >
                              {isBActive ? 'Buna Değiştir' : 'Perk Seç'}
                            </button>
                          )}
                        </div>

                        {/* Option B */}
                        <div
                          className={`p-2.5 rounded-lg border flex flex-col justify-between gap-2 transition ${
                            isBActive
                              ? 'border-[#34d399] bg-[#14301d] ring-1 ring-[#34d399]'
                              : isEligible
                              ? 'border-[#c6a15b]/30 bg-[#221a13] hover:border-[#fbbf24]'
                              : 'border-[#3a3024]/40 bg-[#16120e]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#fef08a]">{perkB.name}</span>
                              {isBActive && <Check size={14} className="text-[#34d399]" />}
                            </div>
                            <p className="text-[11px] text-[#d4c7b2] mt-1 leading-snug">
                              {perkB.description}
                            </p>
                          </div>

                          {isEligible && !isBActive && (
                            <button
                              type="button"
                              onClick={() => handleUnlockPerk(perkB.id)}
                              className="w-full py-1 rounded bg-[#b45309] hover:bg-[#d97706] text-white text-[11px] font-bold shadow transition"
                            >
                              {isAActive ? 'Buna Değiştir' : 'Perk Seç'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Footer Hint */}
            <div className="mt-4 pt-3 border-t border-[#c6a15b]/20 text-center text-[11px] text-[#8b8072]">
              Kısayol: [C] veya [Esc] ile kapatabilirsiniz.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
