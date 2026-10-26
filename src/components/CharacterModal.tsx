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
  QUARTERMASTER: 'İaşeci',
  SCOUT: 'İzci',
  SURGEON: 'Cerrah',
  ENGINEER: 'Mühendis',
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

  // Selected skill perks (Bannerlord düzeni: kademe çiftleri ikon düğmeleridir;
  // açıklama yalnızca odaktaki tek perk için altta gösterilir — kalabalık kart
  // listesi yerine.)
  const [focusedPerkId, setFocusedPerkId] = useState<string>('');
  const perkPairs = getPerksForSkill(selectedSkillId);
  const focusedPerk =
    PERK_CATALOG.find((p) => p.id === focusedPerkId && p.skillId === selectedSkillId) ??
    (Object.values(perkPairs)[0] ? Object.values(perkPairs)[0][0] : undefined);
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
      className="fixed inset-0 modal-anim-in z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-none pointer-events-auto select-none animate-fadeIn"
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
                  {currentHero.kind === 'PLAYER' ? 'Klan Lideri' : currentHero.kind === 'FAMILY' ? 'Aile Üyesi' : 'Yoldaş'}
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
                  <option value="QUARTERMASTER">İaşeci (İdarecilik)</option>
                  <option value="SCOUT">İzci (İzcilik)</option>
                  <option value="SURGEON">Cerrah (Hekimlik)</option>
                  <option value="ENGINEER">Mühendis (Mühendislik)</option>
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
                <span>Nitelik Puanı:</span>
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
                <span>Odak Puanı:</span>
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
                  className="border-b border-[#c6a15b]/15 pb-2.5"
                >
                  {/* Nitelik başlığı: Bannerlord'daki gibi tek satır — isim, değer,
                      (puan varsa) küçük +. Açıklama ipucunda. */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[11px] font-bold tracking-[0.14em] text-[#c6a15b] uppercase"
                      title={attrInfo.desc}
                    >
                      {attrInfo.name}
                    </span>
                    <span className="text-lg font-mono font-bold leading-none text-[#fef08a]">
                      {attrVal}
                    </span>
                    {freeAttrs > 0 && attrVal < 10 && (
                      <button
                        type="button"
                        onClick={() => handleAllocateAttribute(attrId)}
                        className="w-5 h-5 rounded-sm bg-[#b45309] hover:bg-[#d97706] text-white text-sm leading-none font-bold transition"
                        title="Nitelik puanı ver (+1)"
                      >
                        +
                      </button>
                    )}
                    <span className="flex-1 h-px bg-[#c6a15b]/15" />
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
                            setFocusedPerkId('');
                          }}
                          title={`Öğrenme hızı ${rate}x · sınır ${limit}`}
                          className={`cursor-pointer px-2 py-1.5 border transition-all flex flex-col gap-1 ${
                            isSelected
                              ? 'border-[#fbbf24] bg-[#292015]'
                              : 'border-[#c6a15b]/15 bg-[#171310] hover:bg-[#221a13] hover:border-[#c6a15b]/45'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[11px] font-bold truncate text-[#f4ecd8]">
                              {SKILL_LABELS[sId]}
                            </span>
                            <span className="text-sm font-mono font-bold leading-none text-[#fbbf24]">
                              {skillState.level}
                            </span>
                          </div>
                          {/* Bannerlord odak çentikleri: 5 ince dikey çubuk. */}
                          <div className="flex items-end justify-between">
                            <div className="flex items-end gap-[3px]">
                              {[0, 1, 2, 3, 4].map((idx) => (
                                <div
                                  key={idx}
                                  className={`w-[5px] h-[9px] ${
                                    idx < skillState.focus ? 'bg-[#fbbf24]' : 'bg-[#3a3226]'
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
                                className="w-4 h-4 rounded-sm bg-[#b45309] hover:bg-[#d97706] text-white text-[11px] leading-none font-bold"
                                title="Odak puanı ver (+1)"
                              >
                                +
                              </button>
                            )}
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
          <div className="w-full lg:w-5/12 h-1/2 lg:h-full overflow-y-auto p-4 sm:p-5 bg-[#16120d] flex flex-col">

            {/* Seçili beceri başlığı: Bannerlord'daki gibi tek satır özet */}
            <div className="pb-2.5 mb-3 border-b border-[#c6a15b]/30 flex items-end justify-between">
              <div>
                <h3 className="text-base font-display font-bold text-[#fef08a]">
                  {SKILL_LABELS[selectedSkillId]}
                </h3>
                <p className="text-[11px] text-[#b5a890] mt-0.5">
                  {ATTRIBUTE_LABELS[selectedAttrId].name} {selectedAttrVal} · Öğrenme hızı{' '}
                  <strong className="text-[#34d399]">{selectedRate}x</strong> · Sınır {selectedLimit}
                </p>
              </div>
              <div className="text-2xl font-mono font-bold leading-none text-[#fbbf24]">
                {selectedSkillState.level}
              </div>
            </div>

            {/* Perk kademeleri: her kademede iki seçenek = iki kompakt düğme; detay
                alttaki tek panelde (Bannerlord'da perk detayları seçim üzerine açılır). */}
            <div className="space-y-2">

              {Object.keys(perkPairs).length === 0 ? (
                <div className="text-xs text-[#8b8072] italic p-4 text-center">
                  Bu beceri için henüz yetenek düğümü tanımlanmadı.
                </div>
              ) : (
                Object.entries(perkPairs).map(([reqLevelStr, [perkA, perkB]]) => {
                  const reqLevel = Number(reqLevelStr);
                  const isEligible = selectedSkillState.level >= reqLevel;
                  const heroPerks = currentHero.perks ?? [];
                  const isAActive = heroPerks.includes(perkA.id);
                  const isBActive = heroPerks.includes(perkB.id);

                  const renderOption = (
                    perk: typeof perkA,
                    isActive: boolean,
                  ) => (
                    <button
                      type="button"
                      key={perk.id}
                      onMouseEnter={() => setFocusedPerkId(perk.id)}
                      onClick={() => {
                        setFocusedPerkId(perk.id);
                        if (isEligible && !isActive) handleUnlockPerk(perk.id);
                      }}
                      className={`flex-1 text-left px-2 py-1.5 border text-[11px] font-bold truncate transition ${
                        isActive
                          ? 'border-[#34d399] bg-[#14301d] text-[#a7f3d0]'
                          : focusedPerk?.id === perk.id
                            ? 'border-[#fbbf24] bg-[#292015] text-[#fef08a]'
                            : isEligible
                              ? 'border-[#c6a15b]/30 bg-[#1e1812] text-[#e8dcc3] hover:border-[#fbbf24]'
                              : 'border-[#3a3024]/40 bg-[#14100c] text-[#8b8072]'
                      }`}
                    >
                      {isActive ? '✓ ' : ''}{perk.name}
                    </button>
                  );

                  return (
                    <div key={reqLevel} className={isEligible ? '' : 'opacity-60'}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold font-mono text-[#c6a15b]">
                          {reqLevel}
                        </span>
                        <span className="flex-1 h-px bg-[#c6a15b]/15" />
                        {!isEligible && (
                          <span className="text-[9px] text-[#8b8072] flex items-center gap-0.5">
                            <Lock size={9} /> {reqLevel - selectedSkillState.level} seviye
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {renderOption(perkA, isAActive)}
                        {renderOption(perkB, isBActive)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Odaktaki perk detayı (Bannerlord'da detay, perk seçilince/gezinince görünür) */}
            <div className="flex-1" />
            {focusedPerk && (
              <div className="sticky bottom-0 mt-3 border border-[#c6a15b]/30 bg-[#1c1712] px-3 py-2.5">
                <div className="text-xs font-bold text-[#fef08a]">{focusedPerk.name}</div>
                <p className="text-[11px] text-[#d4c7b2] mt-0.5 leading-snug">
                  {focusedPerk.description}
                </p>
                <div className="text-[10px] text-[#8b8072] mt-1">
                  {(currentHero.perks ?? []).includes(focusedPerk.id)
                    ? 'Seçili yetenek'
                    : selectedSkillState.level >= focusedPerk.requiredLevel
                      ? 'Seçmek için perk adına tıklayın (aynı kademedeki diğer yetenek bırakılır)'
                      : `Seviye ${focusedPerk.requiredLevel} gerekli`}
                </div>
              </div>
            )}

            {/* Bottom Footer Hint */}
            <div className="mt-3 pt-2 border-t border-[#c6a15b]/20 text-center text-[11px] text-[#8b8072]">
              Kısayol: [C] veya [Esc] ile kapatabilirsiniz.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
