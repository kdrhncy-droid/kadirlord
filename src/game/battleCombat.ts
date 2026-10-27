/**
 * battleCombat.ts — 10.2/B6 & B7: Bannerlord Meydan Savaşı Çekirdek Mekanikleri
 *
 * Saf, deterministik ve birim testli (scripts/probe-battle-combat.ts) modül:
 *   1. Oyuncu ve birim savaş donanımı türetimi (EquipmentSet + Skill → yakın dövüş,
 *      yay/ok sadağı, kalkan dayanıklılığı, binek at HP/hücum, zırh savunması).
 *   2. 4 yönlü yakın dövüş (UP / DOWN / LEFT / RIGHT), yönlü kalkan/silah bloklama,
 *      bağıl hız (momentum) bonusu ve koltuklanmış kargı (Couch Lance).
 *   3. Balistik ok uçuş fiziği (yerçekimi 9.81 m/s², hareketli hedef önleme,
 *      sonlu sadak — mermi bitince otomatik kılıç/kalkan yakın dövüşe geçiş).
 *   4. Bölük (formasyon) morali, kayıp şoku, komutan düşmesi şoku ve harita
 *      kenarına bozgun/kaçış (Routing).
 *   5. Savaş sonu Yaralı / Ölü ayrımı (Hekimlik / Medicine etkisi) ve mağlubiyette
 *      esaret/kurtulma akışı (oyun bitmez, sandbox devam eder).
 */

import {
  getPlayerHero,
  getRoleHero,
  resolveItemDefinition,
} from './bannerlordFoundation';
import type { AttackDirection as LowerAttackDirection } from './characterAnimator';
import type { CampaignState, TroopRoster, UnitTierId } from './rules';
import { evaluateDirectionalParry } from './tacticalFormation';

export type AttackDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type BattleAttackPhase = 'IDLE' | 'WINDUP' | 'READY' | 'ACTIVE' | 'RECOVERY';

// ============================================================================
// 1.B BASILI TUT-BIRAK (HOLD-TO-CHAMBER & RELEASE-TO-SWING) SALDIRI MAKİNESİ
// ============================================================================

export interface PlayerAttackStateInput {
  phase: BattleAttackPhase;
  attackTimer: number;
  cooldownTimer: number;
  windupDuration: number;
  activeDuration?: number;
  recoveryDuration?: number;
  meleeCooldown: number;
  rangedCooldown: number;
  isRanged: boolean;
  ammo: number;
  mouseLeftHeld: boolean;
  mouseLeftJustPressed: boolean;
  mouseRightHeld: boolean;
  dt: number;
}

export interface PlayerAttackStateOutput {
  phase: BattleAttackPhase;
  attackTimer: number;
  cooldownTimer: number;
  isRanged: boolean;
  /** 0..1 arası animasyon ilerlemesi (READY aşamasında 1.0 sabit kalır) */
  attackProgress: number;
  /** Sol tık bırakılıp savurma/atış tam bu karede mi tetiklendi? */
  triggeredRelease: boolean;
  /** Sağ tık ile hazırlanan saldırı iptal mi edildi (Feint)? */
  feinted: boolean;
  /** Saldırı yeni mi başlatıldı (WINDUP başlangıcı)? */
  startedWindup: boolean;
}

/**
 * Gerçek Bannerlord Basılı Tut-Bırak (Hold LMB = Hazır Beklet, Release LMB = Savur)
 * yakın dövüş ve yay germe durum makinesi:
 *
 *  - Oyuncu Sol Tık (LMB) bastığında `WINDUP` başlar; silah seçili yöne doğru kaldırılır.
 *  - Oyuncu Sol Tıkı basılı tutmaya devam ederse (`mouseLeftHeld === true`),
 *    `WINDUP` tamamlandığında silah **SAVRULMAZ**, `'READY'` (Chambered)
 *    aşamasında savurmaya hazır bekletilir.
 *  - Oyuncu Sol Tıktan elini çektiği anda (`mouseLeftHeld === false`), `'READY'`
 *    aşamasından `'ACTIVE'` aşamasına geçilir ve `triggeredRelease = true` döner.
 *  - Oyuncu `'WINDUP'` veya `'READY'` aşamasındayken Sağ Tık (`mouseRightHeld`)
 *    basarsa saldırı iptal edilir (`feinted = true`) ve anında savunmaya geçilir.
 */
export function stepPlayerAttackState(input: PlayerAttackStateInput): PlayerAttackStateOutput {
  const activeDur = input.activeDuration ?? 0.14;
  const recoveryDur = input.recoveryDuration ?? 0.22;
  const windupDur = Math.max(0.06, input.windupDuration);
  let phase = input.phase;
  let attackTimer = input.attackTimer;
  let cooldownTimer = Math.max(0, input.cooldownTimer - input.dt);
  let isRanged = input.isRanged;
  let triggeredRelease = false;
  let feinted = false;
  let startedWindup = false;

  // Sağ tık (RMB) basılıysa yakın dövüşte hazırlık/bekleme/toparlanma anında kesilip bloğa geçilir
  if (
    input.mouseRightHeld &&
    !isRanged &&
    (phase === 'WINDUP' || phase === 'READY' || phase === 'RECOVERY')
  ) {
    return {
      phase: 'IDLE',
      attackTimer: 0,
      cooldownTimer: 0.04,
      isRanged,
      attackProgress: 0,
      triggeredRelease: false,
      feinted: phase === 'WINDUP' || phase === 'READY',
      startedWindup: false,
    };
  }

  if (phase === 'IDLE') {
    if (
      (input.mouseLeftJustPressed || input.mouseLeftHeld) &&
      !input.mouseRightHeld &&
      cooldownTimer <= 0
    ) {
      if (isRanged && input.ammo <= 0) {
        isRanged = false;
      }
      phase = 'WINDUP';
      attackTimer = windupDur;
      startedWindup = true;
    }
  } else if (phase === 'WINDUP') {
    attackTimer -= input.dt;
    if (attackTimer <= 0) {
      if (input.mouseLeftHeld) {
        // Sol tık hâlâ basılı: savurma! Silahı/yayı hazır beklet (READY / Chambered)
        phase = 'READY';
        attackTimer = 0;
      } else {
        // Hızlı tıklandı ve bırakıldı: hazırlık biter bitmez savur!
        phase = 'ACTIVE';
        attackTimer = activeDur;
        triggeredRelease = true;
      }
    }
  } else if (phase === 'READY') {
    // Sol tık basılı tutulduğu sürece READY pozunda bekler; bırakıldığı an savurur!
    if (!input.mouseLeftHeld) {
      phase = 'ACTIVE';
      attackTimer = activeDur;
      triggeredRelease = true;
    }
  } else if (phase === 'ACTIVE') {
    attackTimer -= input.dt;
    if (attackTimer <= 0) {
      phase = 'RECOVERY';
      attackTimer = recoveryDur;
    }
  } else if (phase === 'RECOVERY') {
    attackTimer -= input.dt;
    if (attackTimer <= 0) {
      phase = 'IDLE';
      attackTimer = 0;
      cooldownTimer = isRanged ? input.rangedCooldown : input.meleeCooldown;
    }
  }

  let attackProgress = 0;
  if (phase === 'WINDUP') {
    attackProgress = Math.max(0, Math.min(1, 1 - attackTimer / windupDur));
  } else if (phase === 'READY') {
    attackProgress = 1;
  } else if (phase === 'ACTIVE') {
    attackProgress = Math.max(0, Math.min(1, 1 - attackTimer / activeDur));
  } else if (phase === 'RECOVERY') {
    attackProgress = Math.max(0, Math.min(1, 1 - attackTimer / recoveryDur));
  }

  return {
    phase,
    attackTimer,
    cooldownTimer,
    isRanged,
    attackProgress,
    triggeredRelease,
    feinted,
    startedWindup,
  };
}

// ============================================================================
// 1.C BANNERLORD SALDIRI / SAVUNMA YÖN OKLARI GÖSTERGESİ HESABI
// ============================================================================

export interface DirectionalArrowVisual {
  active: boolean;
  opacity: number;
  scale: number;
  variant: 'attack' | 'block' | 'idle';
}

export interface DirectionalReticleState {
  visible: boolean;
  mode: 'ATTACK_CHAMBER' | 'ATTACK_SWING' | 'BLOCK' | 'DIRECTION_CUE' | 'HIDDEN';
  activeDirection: AttackDirection;
  statusLabel: string;
  arrows: Record<AttackDirection, DirectionalArrowVisual>;
}

/**
 * Oyuncu saldırı hazırlarken (`WINDUP` / `READY`), savururken (`ACTIVE`),
 * sağ tıkla savunma yaparken (`isBlocking`) veya fareyle yön seçtiğinde
 * hangi yön okunun nasıl parlayacağını hesaplar.
 */
export function computeDirectionalReticleState(params: {
  attackDir: AttackDirection;
  blockDir: AttackDirection;
  attackPhase: BattleAttackPhase;
  isBlocking: boolean;
  hasShield?: boolean;
  mouseLeftHeld: boolean;
  usingBow: boolean;
  dirCueTimer?: number;
}): DirectionalReticleState {
  const dirs: AttackDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  const dirLabels: Record<AttackDirection, string> = {
    UP: 'Üst Darbe',
    DOWN: 'Saplama',
    LEFT: 'Sol Savurma',
    RIGHT: 'Sağ Savurma',
  };

  if (params.usingBow) {
    const hiddenArrows = {
      UP: { active: false, opacity: 0, scale: 1, variant: 'idle' as const },
      DOWN: { active: false, opacity: 0, scale: 1, variant: 'idle' as const },
      LEFT: { active: false, opacity: 0, scale: 1, variant: 'idle' as const },
      RIGHT: { active: false, opacity: 0, scale: 1, variant: 'idle' as const },
    };
    return {
      visible: false,
      mode: 'HIDDEN',
      activeDirection: params.attackDir,
      statusLabel: '',
      arrows: hiddenArrows,
    };
  }

  const isChambering =
    params.attackPhase === 'WINDUP' ||
    params.attackPhase === 'READY' ||
    (params.mouseLeftHeld && !params.isBlocking);
  const isSwinging = params.attackPhase === 'ACTIVE';
  const hasCue = (params.dirCueTimer ?? 0) > 0;
  const shieldBlock = params.isBlocking && Boolean(params.hasShield);

  let mode: DirectionalReticleState['mode'] = 'DIRECTION_CUE';
  let activeDirection: AttackDirection = params.attackDir;
  let statusLabel = '';

  if (params.isBlocking) {
    mode = 'BLOCK';
    activeDirection = params.blockDir;
    statusLabel = shieldBlock
      ? 'Kalkan Savunması (Tüm Yönler)'
      : `Blok: ${dirLabels[activeDirection]}`;
  } else if (isSwinging) {
    mode = 'ATTACK_SWING';
    activeDirection = params.attackDir;
    statusLabel = `Savurma: ${dirLabels[activeDirection]}`;
  } else if (isChambering) {
    mode = 'ATTACK_CHAMBER';
    activeDirection = params.attackDir;
    statusLabel =
      params.attackPhase === 'READY'
        ? `Hazır (${dirLabels[activeDirection]}) — Bırak: Vur`
        : `Hazırlanıyor: ${dirLabels[activeDirection]}`;
  } else if (hasCue) {
    mode = 'DIRECTION_CUE';
    activeDirection = params.attackDir;
    statusLabel = dirLabels[activeDirection];
  } else {
    mode = 'DIRECTION_CUE';
    activeDirection = params.attackDir;
  }

  const arrows = {} as Record<AttackDirection, DirectionalArrowVisual>;
  for (const d of dirs) {
    const isTarget = d === activeDirection;
    if (mode === 'BLOCK') {
      if (shieldBlock) {
        // Kalkan ile savunmada 4 yönlü ok çıkmaz — kalkan her yönü savunur
        arrows[d] = {
          active: false,
          opacity: 0,
          scale: 0.9,
          variant: 'idle',
        };
      } else {
        // Sadece kalkansız (tek elli veya çift elli silah) blokta 4 yönlü savunma oku çıkar
        arrows[d] = {
          active: isTarget,
          opacity: isTarget ? 1.0 : 0.18,
          scale: isTarget ? 1.28 : 0.92,
          variant: isTarget ? 'block' : 'idle',
        };
      }
    } else if (mode === 'ATTACK_SWING') {
      arrows[d] = {
        active: isTarget,
        opacity: isTarget ? 1.0 : 0.15,
        scale: isTarget ? 1.35 : 0.9,
        variant: isTarget ? 'attack' : 'idle',
      };
    } else if (mode === 'ATTACK_CHAMBER') {
      const readyBoost = params.attackPhase === 'READY';
      arrows[d] = {
        active: isTarget,
        opacity: isTarget ? (readyBoost ? 1.0 : 0.88) : 0.18,
        scale: isTarget ? (readyBoost ? 1.26 : 1.14) : 0.92,
        variant: isTarget ? 'attack' : 'idle',
      };
    } else {
      arrows[d] = {
        active: isTarget,
        opacity: isTarget ? (hasCue ? 0.82 : 0.48) : 0.14,
        scale: isTarget ? (hasCue ? 1.12 : 1.0) : 0.9,
        variant: isTarget ? 'attack' : 'idle',
      };
    }
  }

  return {
    visible: true,
    mode,
    activeDirection,
    statusLabel,
    arrows,
  };
}

// ============================================================================
// 1.D KALKAN HATTI VE BİRİM ÇARPIŞMA ÇÖZÜCÜSÜ (NON-PENETRATING COLLISION)
// ============================================================================

export interface CollidableBattleActor {
  id: string;
  numericId: number;
  team: 'ally' | 'enemy';
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  gone: boolean;
  isMounted: boolean;
  isBlocking: boolean;
  inShieldWall?: boolean;
}

export interface CavalryTrampleEvent {
  chargerId: number;
  victimId: number;
  damage: number;
  knockX: number;
  knockZ: number;
}

/**
 * Birimlerin birbirinin içinden geçmesini (blobbing / tunneling) önleyen
 * çok geçişli fiziksel çarpışma ve omuz omuza kalkan hattı çözücüsü:
 *
 *  1. Karşı takımdan iki asker temas ettiğinde (`a.team !== b.team`) sert cephe
 *     engeli (`hard contact`) uygulanır: birbirlerinin içinden geçemezler ve
 *     birbirlerine doğru olan hız bileşenleri (`inwardNormalVel`) sıfırlanır.
 *  2. Aynı takımdaki askerler (`a.team === b.team`) omuz omuza kalkan duvarı
 *     mesafesini korur; komutan (`player-commander`) dost safların arasından
 *     geçerken dost askerler hafifçe yana açılır.
 *  3. Dörtnala (`hız >= 8.0 m/s`) gelen atlı birim yaya düşmana çarptığında
 *     momentumla onu geriye savurur ve `CavalryTrampleEvent` üretir.
 */
export function resolveBattleActorCollisions<T extends CollidableBattleActor>(
  actors: T[],
  options?: {
    iterations?: number;
    clampPosition?: (x: number, z: number) => { x: number; z: number };
    trampleCooldownByPair?: Set<string>;
  },
): CavalryTrampleEvent[] {
  const iterations = options?.iterations ?? 3;
  const trampleEvents: CavalryTrampleEvent[] = [];
  const pairTrampled = options?.trampleCooldownByPair ?? new Set<string>();

  const getMass = (a: CollidableBattleActor): number => {
    if (a.isMounted) return 3.4;
    if (a.inShieldWall || a.isBlocking) return 1.65;
    if (a.id === 'player-commander' || a.id === 'enemy-commander') return 1.45;
    return 1.0;
  };

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.hp <= 0 || a.gone) continue;

      for (let j = i + 1; j < actors.length; j++) {
        const b = actors[j];
        if (b.hp <= 0 || b.gone) continue;

        const sameTeam = a.team === b.team;
        const anyMounted = a.isMounted || b.isMounted;
        const bothMounted = a.isMounted && b.isMounted;

        // Minimum merkez-merkez ayrım mesafesi (metre)
        let minSep: number;
        if (bothMounted) {
          minSep = sameTeam ? 1.88 : 2.05;
        } else if (anyMounted) {
          minSep = sameTeam ? 1.55 : 1.72;
        } else if (sameTeam) {
          // Kalkan duvarında omuz omuza sıkı saf (1.08m), normal düzende 1.22m
          minSep = a.inShieldWall && b.inShieldWall ? 1.08 : 1.22;
        } else {
          // Düşman piyadeler göğüs göğüse geldiğinde 1.38m sert cephe sınırı!
          minSep = 1.38;
        }

        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);

        if (dist >= minSep) continue;

        // Tam üst üste binmişse deterministik açı ile ayır
        if (dist < 0.001) {
          const fallbackAngle = ((a.numericId * 17 + b.numericId * 31) % 360) * (Math.PI / 180);
          dx = Math.sin(fallbackAngle);
          dz = Math.cos(fallbackAngle);
          dist = 0.001;
        }

        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minSep - dist;

        let massA = getMass(a);
        let massB = getMass(b);

        // Dost askerler oyuncu komutana yol verir
        if (sameTeam) {
          if (a.id === 'player-commander') massA *= 4.0;
          if (b.id === 'player-commander') massB *= 4.0;
        }

        const invMassA = 1 / massA;
        const invMassB = 1 / massB;
        const invMassSum = invMassA + invMassB;

        // Düşman temasında %100 sert ayrıştırma, dost temasında %75 yumuşak omuz ayrıştırması
        const stiffness = sameTeam ? 0.72 : 1.0;
        const pushA = overlap * (invMassA / invMassSum) * stiffness;
        const pushB = overlap * (invMassB / invMassSum) * stiffness;

        a.x -= nx * pushA;
        a.z -= nz * pushA;
        b.x += nx * pushB;
        b.z += nz * pushB;

        if (options?.clampPosition) {
          const ca = options.clampPosition(a.x, a.z);
          a.x = ca.x;
          a.z = ca.z;
          const cb = options.clampPosition(b.x, b.z);
          b.x = cb.x;
          b.z = cb.z;
        }

        // İlk iterasyonda hız vektörü düzeltmesi ve süvari ezme (trample) kontrolü
        if (iter === 0) {
          const relVx = b.vx - a.vx;
          const relVz = b.vz - a.vz;
          const normalVel = relVx * nx + relVz * nz;

          if (!sameTeam && normalVel < 0) {
            // Dörtnala süvari yaya düşmana çarparsa ezme (Charge / Trample) uygular
            const speedA = Math.hypot(a.vx, a.vz);
            const speedB = Math.hypot(b.vx, b.vz);
            const pairKey =
              a.numericId < b.numericId
                ? `${a.numericId}:${b.numericId}`
                : `${b.numericId}:${a.numericId}`;

            if (a.isMounted && !b.isMounted && speedA >= 7.8 && !pairTrampled.has(pairKey)) {
              pairTrampled.add(pairKey);
              const dmg = Math.max(6, Math.round((speedA - 5.5) * 3.2 * (b.isBlocking ? 0.55 : 1)));
              b.vx += nx * 5.8;
              b.vz += nz * 5.8;
              a.vx *= 0.82;
              a.vz *= 0.82;
              trampleEvents.push({
                chargerId: a.numericId,
                victimId: b.numericId,
                damage: dmg,
                knockX: nx * 5.8,
                knockZ: nz * 5.8,
              });
            } else if (b.isMounted && !a.isMounted && speedB >= 7.8 && !pairTrampled.has(pairKey)) {
              pairTrampled.add(pairKey);
              const dmg = Math.max(6, Math.round((speedB - 5.5) * 3.2 * (a.isBlocking ? 0.55 : 1)));
              a.vx -= nx * 5.8;
              a.vz -= nz * 5.8;
              b.vx *= 0.82;
              b.vz *= 0.82;
              trampleEvents.push({
                chargerId: b.numericId,
                victimId: a.numericId,
                damage: dmg,
                knockX: -nx * 5.8,
                knockZ: -nz * 5.8,
              });
            } else {
              // Karşı cephe çarpışması: birbirinin içine doğru olan hız bileşenini sıfırla!
              const shareA = invMassA / invMassSum;
              const shareB = invMassB / invMassSum;
              a.vx += nx * normalVel * shareA;
              a.vz += nz * normalVel * shareA;
              b.vx -= nx * normalVel * shareB;
              b.vz -= nz * normalVel * shareB;
            }
          } else if (sameTeam && normalVel < -1.2) {
            // Dost saflarda hafif sönümlü omuz teması
            const damp = 0.35;
            a.vx += nx * normalVel * 0.5 * damp;
            a.vz += nz * normalVel * 0.5 * damp;
            b.vx -= nx * normalVel * 0.5 * damp;
            b.vz -= nz * normalVel * 0.5 * damp;
          }
        }
      }
    }
  }

  return trampleEvents;
}

// ============================================================================
// 1. OYUNCU VE BİRİM SAVAŞ DONANIMI TÜRETİMİ
// ============================================================================

export interface PlayerBattleLoadout {
  /** Yakın dövüş silah adı */
  meleeWeaponName: string;
  /** Yakın dövüş silah sınıfı */
  meleeCategory: 'ONE_HANDED' | 'TWO_HANDED' | 'POLEARM';
  /** Yakın dövüş taban hasarı (silah + yetenek) */
  meleeAttack: number;
  /** Yakın dövüş hasar eş anlamlısı */
  meleeDamage: number;
  /** Yakın dövüş erişim mesafesi (m) */
  meleeReach: number;
  /** Saldırı bekleme süresi (sn) */
  meleeCooldown: number;
  /** Koltuklanmış kargı (Couch Lance) yapılabilir mi? */
  canCouchLance: boolean;

  /** Menzilli silah var mı? */
  hasRanged: boolean;
  /** Menzilli silah adı */
  rangedWeaponName: string;
  /** Menzilli taban hasar */
  rangedDamage: number;
  /** Ok çıkış hızı (m/s) */
  projectileSpeed: number;
  /** Atış dolum süresi (sn) */
  rangedCooldown: number;
  /** Sadak kapasitesi (toplam ok sayısı) */
  maxAmmo: number;

  /** Kalkan var mı? */
  hasShield: boolean;
  /** Kalkan adı */
  shieldName: string;
  /** Kalkan maksimum dayanıklılığı */
  maxShieldHp: number;

  /** Oyuncu atlı mı? */
  isMounted: boolean;
  /** Binek at var mı eş anlamlısı */
  hasHorse: boolean;
  /** Binek adı */
  horseName: string;
  /** Binek maksimum canı */
  maxHorseHp: number;
  /** Binek azami hızı (m/s) */
  horseSpeed: number;
  /** Yaya azami hızı (m/s) */
  footSpeed: number;
  /** At çarpması (Charge) taban hasarı */
  horseChargeDamage: number;

  /** Zırh savunması (baş + gövde + el + bacak toplamı) */
  armorDefense: number;
  /** Oyuncu azami canı */
  maxPlayerHp: number;
  /** Başlangıç oyuncu canı */
  initialPlayerHp: number;
  /** Liderlik yeteneği (bölük morali için) */
  leadershipSkill: number;
  /** Taktik yeteneği */
  tacticsSkill: number;
  /** Cerrah hekimlik yeteneği (yaralı/ölü oranı için) */
  surgeonMedicineSkill: number;
}

/**
 * Oyuncunun seferdeki gerçek ekipmanlarından (`equipment.BATTLE`) ve
 * karakter yeteneklerinden meydan savaşı donanımını türetir.
 */
export function derivePlayerBattleLoadout(campaign: CampaignState): PlayerBattleLoadout {
  const hero = getPlayerHero(campaign);
  const surgeon = getRoleHero(campaign, 'SURGEON') ?? hero;
  const eq = hero?.equipment?.BATTLE ?? {};
  const skills = hero?.skills ?? campaign.skills;

  const oneHanded = skills?.oneHanded?.level ?? 35;
  const twoHanded = skills?.twoHanded?.level ?? 25;
  const polearm = skills?.polearm?.level ?? 35;
  const bowSkill = skills?.bow?.level ?? 30;
  const riding = skills?.riding?.level ?? 35;
  const athletics = skills?.athletics?.level ?? 35;
  const leadership = skills?.leadership?.level ?? 35;
  const tactics = skills?.tactics?.level ?? 30;
  const medicine = surgeon?.skills?.medicine?.level ?? skills?.medicine?.level ?? 35;

  const weaponSlots = [eq.WEAPON1, eq.WEAPON2, eq.WEAPON3, eq.WEAPON4]
    .map((id) => resolveItemDefinition(campaign, id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  // Yakın dövüş silahı: kargı/mızrak, çift el veya tek el kılıç
  const polearmItem = weaponSlots.find(
    (w) => w.category === 'WEAPON' && /kargı|mızrak|gönder|tırpan|teber|lance|spear/i.test(w.name),
  );
  const twoHandedItem = weaponSlots.find(
    (w) => w.category === 'WEAPON' && /çift el|büyük balta|battal|falx|two/i.test(w.name),
  );
  const oneHandedItem = weaponSlots.find(
    (w) =>
      w.category === 'WEAPON' &&
      w !== polearmItem &&
      w !== twoHandedItem &&
      !/yay|ok|arbalet|cirit|bow|arrow/i.test(w.name),
  );
  const primaryMelee = oneHandedItem ?? polearmItem ?? twoHandedItem;

  let meleeWeaponName = primaryMelee?.name ?? 'İmparatorluk Spathası';
  let meleeCategory: 'ONE_HANDED' | 'TWO_HANDED' | 'POLEARM' = 'ONE_HANDED';
  let baseWeaponDmg = primaryMelee?.stats?.damage ?? 34;
  let meleeReach = 2.15;
  let meleeCooldown = 0.44;

  if (polearmItem && (!oneHandedItem || Boolean(eq.MOUNT))) {
    meleeWeaponName = polearmItem.name;
    meleeCategory = 'POLEARM';
    baseWeaponDmg = polearmItem.stats?.damage ?? 38;
    meleeReach = 2.85;
    meleeCooldown = 0.52;
  } else if (twoHandedItem && !oneHandedItem) {
    meleeWeaponName = twoHandedItem.name;
    meleeCategory = 'TWO_HANDED';
    baseWeaponDmg = twoHandedItem.stats?.damage ?? 44;
    meleeReach = 2.45;
    meleeCooldown = 0.50;
  }

  const relevantMeleeSkill =
    meleeCategory === 'POLEARM'
      ? polearm
      : meleeCategory === 'TWO_HANDED'
        ? twoHanded
        : oneHanded;
  const meleeAttack = Math.round(baseWeaponDmg * (1 + relevantMeleeSkill * 0.0022));

  // Menzilli silah: yay/arbalet/cirit
  const rangedItem = weaponSlots.find(
    (w) => w.category === 'WEAPON' && /yay|arbalet|cirit|bow|crossbow|javelin/i.test(w.name),
  );
  const hasRanged = true;
  const rangedWeaponName = rangedItem?.name ?? 'Kalradya Avcı Yayı';
  const baseRangedDmg = rangedItem?.stats?.damage ?? 28;
  const rangedDamage = Math.round(baseRangedDmg * (1 + bowSkill * 0.0025));
  const projectileSpeed = Math.min(68, 48 + Math.round(bowSkill * 0.12));
  const rangedCooldown = Math.max(0.55, 0.92 - bowSkill * 0.002);
  const maxAmmo = 28 + Math.floor(bowSkill / 25) * 2;

  // Kalkan
  const shieldItem = weaponSlots.find((w) => w.category === 'SHIELD');
  const hasShield = meleeCategory !== 'TWO_HANDED';
  const shieldName = shieldItem?.name ?? 'Sancak Süvari Kalkanı';
  const maxShieldHp = Math.round(
    (shieldItem?.stats?.shieldDurability ?? 185) * (1 + oneHanded * 0.0015),
  );

  // Binek at
  const horseItem = resolveItemDefinition(campaign, eq.MOUNT);
  const harnessItem = resolveItemDefinition(campaign, eq.HARNESS);
  const isMounted = Boolean(horseItem) || riding >= 15;
  const horseName = horseItem?.name ?? 'Kalradya Savaş Atı';
  const harnessArmor = harnessItem?.stats?.armorMount ?? 10;
  const maxHorseHp = Math.round(165 + harnessArmor * 3.2 + riding * 0.45);
  const rawMountSpeed = horseItem?.stats?.mountSpeed ?? 42;
  const normalizedMountSpeed = rawMountSpeed > 20 ? 9.5 + (rawMountSpeed - 35) * 0.08 : rawMountSpeed;
  const horseSpeed = Number(
    Math.min(13.8, Math.max(9.6, normalizedMountSpeed) + riding * 0.012).toFixed(2),
  );
  const footSpeed = Number(Math.min(7.6, 5.9 + athletics * 0.011).toFixed(2));
  const horseChargeDamage = Math.round(
    (horseItem?.stats?.mountCharge ?? 14) + harnessArmor * 0.35 + riding * 0.08,
  );

  // Zırh savunması
  const headDef = resolveItemDefinition(campaign, eq.HEAD);
  const shoulderDef = resolveItemDefinition(campaign, eq.SHOULDER);
  const bodyDef = resolveItemDefinition(campaign, eq.BODY);
  const gloveDef = resolveItemDefinition(campaign, eq.GLOVES);
  const legDef = resolveItemDefinition(campaign, eq.LEG);

  const headArmor = headDef?.stats?.armorHead ?? 8;
  const capeArmor = (shoulderDef?.stats?.armorBody ?? 0) + (shoulderDef?.stats?.armorArm ?? 4);
  const bodyArmor = bodyDef?.stats?.armorBody ?? 16;
  const gloveArmor = gloveDef?.stats?.armorArm ?? 5;
  const legArmor = legDef?.stats?.armorLeg ?? 7;
  const armorDefense = Math.round(
    headArmor * 0.25 + (bodyArmor + capeArmor) * 0.48 + (gloveArmor + legArmor) * 0.27,
  );

  const maxPlayerHp = Math.max(100, campaign.playerMaxHp || 100);
  const initialPlayerHp = Math.max(35, Math.min(maxPlayerHp, campaign.playerHp || maxPlayerHp));

  const canCouchLance = isMounted;

  return {
    meleeWeaponName,
    meleeCategory,
    meleeAttack,
    meleeDamage: meleeAttack,
    meleeReach,
    meleeCooldown,
    canCouchLance,
    hasRanged,
    rangedWeaponName,
    rangedDamage,
    projectileSpeed,
    rangedCooldown,
    maxAmmo,
    hasShield,
    shieldName,
    maxShieldHp,
    isMounted,
    hasHorse: isMounted,
    horseName,
    maxHorseHp,
    horseSpeed,
    footSpeed,
    horseChargeDamage,
    armorDefense,
    maxPlayerHp,
    initialPlayerHp,
    leadershipSkill: leadership,
    tacticsSkill: tactics,
    surgeonMedicineSkill: medicine,
  };
}

/** Birim sınıfına göre varsayılan sadak (ok) sayısı ve kalkan dayanıklılığı */
export function getUnitClassCombatSpec(unitClass: UnitTierId): {
  maxAmmo: number;
  maxShieldHp: number;
  hasLance: boolean;
  maxHorseHp: number;
} {
  switch (unitClass) {
    case 'archer':
      return { maxAmmo: 30, maxShieldHp: 0, hasLance: false, maxHorseHp: 0 };
    case 'horseArcher':
      return { maxAmmo: 48, maxShieldHp: 85, hasLance: false, maxHorseHp: 140 };
    case 'cavalry':
      return { maxAmmo: 0, maxShieldHp: 170, hasLance: true, maxHorseHp: 175 };
    case 'infantry':
    default:
      return { maxAmmo: 0, maxShieldHp: 155, hasLance: false, maxHorseHp: 0 };
  }
}

/**
 * Bir menzilli askerin bu karede yay mı yoksa yakın dövüş silahı mı
 * kullanacağını belirler (Bannerlord kuralı: sadak bittiğinde, "Ateş Kes"
 * emri verildiğinde veya düşman çok yakına girdiğinde kılıca geçer).
 */
export function shouldUnitUseRanged(
  unitClass: UnitTierId,
  ammo: number,
  holdFire: boolean,
  distanceToTarget: number,
): boolean {
  if (unitClass !== 'archer' && unitClass !== 'horseArcher') return false;
  if (holdFire) return false;
  if (ammo <= 0) return false;
  // Düşman 3.4 metreden yakına girdiyse okçu kılıcını çeker
  if (distanceToTarget < 3.4) return false;
  return true;
}

// ============================================================================
// 2. 4 YÖNLÜ YAKIN DÖVÜŞ, KALKAN KIRILMASI VE KOLTUKLANMIŞ KARGI
// ============================================================================

export interface DirectionalMeleeInput {
  baseAttack: number;
  targetDefense: number;
  attackDirection: AttackDirection;
  isTargetBlocking: boolean;
  targetBlockDirection: AttackDirection;
  targetShieldHp: number;
  /** Saldıran ve hedefin birbirine yaklaşma hızı (m/s, pozitif = çarpışma) */
  relativeClosingSpeed?: number;
  /** Koltuklanmış kargı vuruşu mu? */
  isCouchedLance?: boolean;
  /** Ağır/basılı vuruş mu? */
  isHeavyStrike?: boolean;
}

export interface DirectionalMeleeResult {
  hpDamage: number;
  shieldDamage: number;
  nextShieldHp: number;
  shieldBlocked: boolean;
  weaponParried: boolean;
  shieldBroken: boolean;
  speedBonusMultiplier: number;
  isHeadshot: boolean;
}

/**
 * Bannerlord bağıl hız (momentum) çarpanı:
 * At sırtında dörtnala giderken veya koşarak vurulduğunda hız farkı hasarı katlar.
 */
export function computeRelativeSpeedBonus(relativeClosingSpeed: number): number {
  const clampedSpeed = Math.max(-6, Math.min(18, relativeClosingSpeed));
  return Number(Math.max(0.75, Math.min(2.25, 1 + clampedSpeed * 0.068)).toFixed(2));
}

/**
 * Koltuklanmış kargı (Couch Lance) durumunun aktif kalıp kalamayacağını denetler.
 * Bannerlord'da atlı belirli bir hızın (≥ 7.2 m/s) üstündeyken X tuşuyla kargıyı
 * koltuk altına indirir; hız düşerse veya vuruş yapılırsa kargı kalkar.
 */
export function canMaintainCouchLance(
  isMounted: boolean,
  currentSpeed: number,
  couchCooldown: number,
): boolean {
  if (!isMounted) return false;
  if (couchCooldown > 0) return false;
  return currentSpeed >= 7.2;
}

/**
 * 4 yönlü yakın dövüş vuruşunu çözer:
 *   - UP (Üstten darbe): +%22 baş/omuz darbesi çarpanı.
 *   - DOWN (Saplama / Thrust): zırhın %30'unu deler.
 *   - LEFT / RIGHT (Yatay savurma): standart geniş kavisli kesiş.
 *   - Kalkan bloğu: doğru veya komşu yönde %100 hasarı kalkana emer; ters yönde bile
 *     kalkan alanı sayesinde %70'ini kalkana alır. Kalkan HP 0'a inerse kırılır!
 *   - Silah siperi (kalkansız blok): yalnızca doğru blok yönü (`evaluateDirectionalParry`)
 *     tutarsa hasarın %82'sini savuşturur.
 *   - Koltuklanmış kargı (`isCouchedLance`): hız çarpanıyla 2.65x yıkıcı darbe vurur.
 */
export function resolveDirectionalMeleeHit(
  input: DirectionalMeleeInput,
): DirectionalMeleeResult {
  const speedBonusMultiplier = computeRelativeSpeedBonus(input.relativeClosingSpeed ?? 0);

  let dirMultiplier = 1.0;
  let effectiveDefense = input.targetDefense;
  const isHeadshot = input.attackDirection === 'UP';

  if (input.attackDirection === 'UP') {
    dirMultiplier = 1.22;
  } else if (input.attackDirection === 'DOWN') {
    dirMultiplier = 1.08;
    effectiveDefense = input.targetDefense * 0.7; // Saplama zırh delici
  }

  const heavyMul = input.isHeavyStrike ? 1.35 : 1.0;
  const couchMul = input.isCouchedLance ? 2.65 : 1.0;

  const rawDamage =
    input.baseAttack * dirMultiplier * heavyMul * couchMul * speedBonusMultiplier;
  const mitigated = Math.max(4, rawDamage - effectiveDefense * 0.45);

  const parryEval = evaluateDirectionalParry({
    attackDir: input.attackDirection.toLowerCase() as LowerAttackDirection,
    defenderBlockDir: input.targetBlockDirection.toLowerCase() as LowerAttackDirection,
    hasShield: input.targetShieldHp > 0,
    isBlocking: input.isTargetBlocking,
    isFacingAttacker: true,
  });

  // Durum A: Hedef kalkanla blok yapıyor
  if (input.isTargetBlocking && input.targetShieldHp > 0) {
    const fullBlock = parryEval.blocked && !input.isCouchedLance;
    const shieldDamage = Math.max(
      6,
      Math.round(rawDamage * (input.isCouchedLance ? 1.35 : 0.85)),
    );
    const nextShieldHp = Math.max(0, input.targetShieldHp - shieldDamage);
    const shieldBroken = nextShieldHp === 0;

    const bleedThrough = fullBlock
      ? 0
      : Math.max(3, Math.round(mitigated * (input.isCouchedLance ? 0.45 : 0.28)));

    return {
      hpDamage: shieldBroken ? Math.max(bleedThrough, Math.round(mitigated * 0.35)) : bleedThrough,
      shieldDamage,
      nextShieldHp,
      shieldBlocked: true,
      weaponParried: false,
      shieldBroken,
      speedBonusMultiplier,
      isHeadshot: false,
    };
  }

  // Durum B: Hedef kalkansız (yalnız silahla) blok yapıyor
  if (input.isTargetBlocking && input.targetShieldHp <= 0) {
    if (parryEval.blocked && !input.isCouchedLance) {
      return {
        hpDamage: Math.max(2, Math.round(mitigated * 0.18)),
        shieldDamage: 0,
        nextShieldHp: 0,
        shieldBlocked: false,
        weaponParried: true,
        shieldBroken: false,
        speedBonusMultiplier,
        isHeadshot: false,
      };
    }
  }

  // Durum C: Açık hedef veya yanlış yöne silah bloğu
  return {
    hpDamage: Math.max(3, Math.round(mitigated)),
    shieldDamage: 0,
    nextShieldHp: Math.max(0, input.targetShieldHp),
    shieldBlocked: false,
    weaponParried: false,
    shieldBroken: false,
    speedBonusMultiplier,
    isHeadshot,
  };
}

// ============================================================================
// 3. BALİSTİK OK FİZİĞİ VE HAREKETLİ HEDEF ÖNLEME
// ============================================================================

export const GRAVITY_MPS2 = 9.81;

export interface BallisticArrow {
  id: number;
  shooterId: number;
  team: 'ally' | 'enemy';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseDamage: number;
  age: number;
  stuck: boolean;
  stuckTimer: number;
  active: boolean;
}

export interface ArrowTargetCandidate {
  id: number;
  team: 'ally' | 'enemy';
  x: number;
  y: number;
  z: number;
  isMounted: boolean;
  isBlocking: boolean;
  shieldHp: number;
  defense: number;
  hp: number;
}

export interface ArrowStepHitResult {
  hitActorId: number;
  hpDamage: number;
  shieldDamage: number;
  shieldBlocked: boolean;
  shieldBroken: boolean;
  isHeadshot: boolean;
}

/**
 * Okçunun hareketli bir hedefi vurmak için gereken 3B başlangıç hız vektörünü
 * (yerçekimi telafisi + hedef hızı önlemesi / lead target) hesaplar.
 */
export function computeArcherAimVelocity(
  shooter: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number; vx?: number; vz?: number },
  projectileSpeed: number,
  spreadRadians = 0,
  rng: () => number = Math.random,
): { vx: number; vy: number; vz: number; flightTime: number } {
  const speed = Math.max(24, projectileSpeed);
  const dx0 = target.x - shooter.x;
  const dz0 = target.z - shooter.z;
  const horizontalDist0 = Math.hypot(dx0, dz0);
  const flightTime = Math.max(0.08, horizontalDist0 / speed);

  // Hedefin uçuş süresince gideceği tahmini nokta (Lead aiming)
  const leadX = target.x + (target.vx ?? 0) * flightTime * 0.85;
  const leadZ = target.z + (target.vz ?? 0) * flightTime * 0.85;
  const dx = leadX - shooter.x;
  const dz = leadZ - shooter.z;
  const dy = target.y - shooter.y;
  const horizontalDist = Math.max(0.5, Math.hypot(dx, dz));
  const actualFlightTime = horizontalDist / speed;

  // Yatay yön + saçılma
  const baseYaw = Math.atan2(dx, dz);
  const yawOffset = spreadRadians > 0 ? (rng() - 0.5) * 2 * spreadRadians : 0;
  const pitchOffset = spreadRadians > 0 ? (rng() - 0.5) * spreadRadians * 0.6 : 0;
  const finalYaw = baseYaw + yawOffset;

  // Balistik dikey hız: vy0 = (dy / t) + 0.5 * g * t
  const vyBase = dy / actualFlightTime + 0.5 * GRAVITY_MPS2 * actualFlightTime;
  const vy = vyBase + pitchOffset * speed;

  const horizontalSpeed = Math.sqrt(Math.max(16, speed * speed - Math.min(speed * speed * 0.65, vy * vy)));
  const vx = Math.sin(finalYaw) * horizontalSpeed;
  const vz = Math.cos(finalYaw) * horizontalSpeed;

  return { vx, vy, vz, flightTime: actualFlightTime };
}

/**
 * Balistik oku bir zaman adımı (`dt`) ilerletir; zemin veya düşman çarpışmasını çözer.
 */
export function stepBallisticArrow(
  arrow: BallisticArrow,
  dt: number,
  groundHeightAt: (x: number, z: number) => number,
  targets: ArrowTargetCandidate[],
): ArrowStepHitResult | null {
  if (!arrow.active) return null;

  if (arrow.stuck) {
    arrow.stuckTimer += dt;
    if (arrow.stuckTimer >= 6.0) {
      arrow.active = false;
    }
    return null;
  }

  arrow.age += dt;
  if (arrow.age > 5.5) {
    arrow.active = false;
    return null;
  }

  const prevX = arrow.x;
  const prevY = arrow.y;
  const prevZ = arrow.z;

  arrow.vy -= GRAVITY_MPS2 * dt;
  arrow.x += arrow.vx * dt;
  arrow.y += arrow.vy * dt;
  arrow.z += arrow.vz * dt;

  // Segment üzerinde düşman çarpışma kontrolü
  const midX = (prevX + arrow.x) * 0.5;
  const midY = (prevY + arrow.y) * 0.5;
  const midZ = (prevZ + arrow.z) * 0.5;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.team === arrow.team || t.hp <= 0) continue;

    const hitRadius = t.isMounted ? 0.95 : 0.62;
    const minHeight = t.y - 0.1;
    const maxHeight = t.y + (t.isMounted ? 2.55 : 1.95);

    if (
      (arrow.y < minHeight && prevY < minHeight) ||
      (arrow.y > maxHeight && prevY > maxHeight)
    ) {
      continue;
    }

    const distEnd = Math.hypot(arrow.x - t.x, arrow.z - t.z);
    const distMid = Math.hypot(midX - t.x, midZ - t.z);
    if (distEnd <= hitRadius || distMid <= hitRadius) {
      arrow.active = false;
      const relHeight = (distEnd <= hitRadius ? arrow.y : midY) - t.y;
      const headThreshold = t.isMounted ? 2.05 : 1.48;
      const isHeadshot = relHeight >= headThreshold;

      // Kalkan kontrolü (kalkanlı hedef blok halindeyse veya kalkan taşıyorsa ön cepheden okları tutar)
      if (t.shieldHp > 0 && (t.isBlocking || !isHeadshot)) {
        const shieldAbsorbs = t.isBlocking || relHeight < (t.isMounted ? 1.85 : 1.32);
        if (shieldAbsorbs) {
          const shieldDamage = Math.max(5, Math.round(arrow.baseDamage * 0.75));
          const shieldBroken = t.shieldHp - shieldDamage <= 0;
          return {
            hitActorId: t.id,
            hpDamage: 0,
            shieldDamage,
            shieldBlocked: true,
            shieldBroken,
            isHeadshot: false,
          };
        }
      }

      const raw = arrow.baseDamage * (isHeadshot ? 1.55 : 1.0);
      const hpDamage = Math.max(4, Math.round(raw - t.defense * 0.38));
      return {
        hitActorId: t.id,
        hpDamage,
        shieldDamage: 0,
        shieldBlocked: false,
        shieldBroken: false,
        isHeadshot,
      };
    }
  }

  // Zemin çarpışması: ok toprağa saplanır ve birkaç saniye görünür kalır
  const groundY = groundHeightAt(arrow.x, arrow.z);
  if (arrow.y <= groundY + 0.05) {
    arrow.y = groundY + 0.05;
    arrow.stuck = true;
    arrow.stuckTimer = 0;
  }

  return null;
}

// ============================================================================
// 4. BÖLÜK MORALİ, ŞOK VE BOZGUN / KAÇIŞ (ROUTING)
// ============================================================================

export const MORALE_ROUT_THRESHOLD = 20;

export interface DivisionMoraleState {
  unitClass: UnitTierId;
  baseMorale: number;
  currentMorale: number;
  recentShock: number;
  initialFielded: number;
  casualtiesTaken: number;
  routedCount: number;
  commanderDown: boolean;
  isRouting: boolean;
}

/**
 * Bölük başlangıç moral durumunu oluşturur.
 */
export function createDivisionMoraleState(
  unitClass: UnitTierId,
  initialFielded: number,
  options?: {
    campaignMorale?: number;
    leadershipSkill?: number;
    tierBonus?: number;
  },
): DivisionMoraleState {
  const campaignMorale = options?.campaignMorale ?? 65;
  const leadership = options?.leadershipSkill ?? 30;
  const tierBonus = options?.tierBonus ?? 8;

  const baseMorale = Math.max(
    48,
    Math.min(
      100,
      Math.round(58 + (campaignMorale - 50) * 0.35 + leadership * 0.16 + tierBonus),
    ),
  );

  return {
    unitClass,
    baseMorale,
    currentMorale: baseMorale,
    recentShock: 0,
    initialFielded: Math.max(1, initialFielded),
    casualtiesTaken: 0,
    routedCount: 0,
    commanderDown: false,
    isRouting: false,
  };
}

/**
 * Bölükte bir asker düştüğünde (veya arkadan süvari hücumu yediğinde) moral şoku uygular.
 */
export function applyDivisionCasualtyShock(
  state: DivisionMoraleState,
  casualties = 1,
  isCavalryChargeShock = false,
): void {
  state.casualtiesTaken += casualties;
  const denom = Math.max(6, state.initialFielded);
  const shockPerLoss = (95 / denom) * casualties;
  const chargeBonus = isCavalryChargeShock ? 4.5 * casualties : 0;
  state.recentShock = Math.min(65, state.recentShock + shockPerLoss + chargeBonus);
}

/**
 * Takviye dalgası sahaya girdiğinde bölüğün moralini tazeler.
 */
export function applyReinforcementMoraleBoost(
  state: DivisionMoraleState,
  addedTroops: number,
): void {
  if (addedTroops <= 0) return;
  state.initialFielded += addedTroops;
  state.recentShock = Math.max(0, state.recentShock - 14);
  state.isRouting = false;
  state.currentMorale = Math.min(100, state.currentMorale + 14);
}

/**
 * Bölük moralini her karede günceller ve bozgun (`isRouting`) durumunu hesaplar.
 *
 * Önemli Bannerlord + B5 Takviye Kuralı:
 *   - Tarafın henüz sahaya çıkmamış yedek dalgası (`hasReserves === true`) varken
 *     bölük tümden bozguna uğramaz; yedek dalgasının sahaya girmesi beklenir.
 *   - Yedekler tükendikten sonra bölük ağır kayıp almışsa ve moral `MORALE_ROUT_THRESHOLD`
 *     altına düşerse, kalan askerler hattı bırakıp kendi harita kenarına kaçar.
 */
export function stepDivisionMorale(
  state: DivisionMoraleState,
  dt: number,
  context: {
    aliveInDivision: number;
    commanderDown: boolean;
    hasReserves: boolean;
    battleElapsedSec: number;
    allyStrengthRatio: number; // 0..1 (bu tarafın sahadaki güç oranı)
  },
): DivisionMoraleState {
  state.commanderDown = context.commanderDown;

  // Şok zamanla sönümlenir
  state.recentShock = Math.max(0, state.recentShock - dt * 3.6);

  const totalFielded = Math.max(1, state.initialFielded);
  const lossRatio = Math.min(1, state.casualtiesTaken / totalFielded);

  // Kalıcı kayıp cezası + komutan düşmesi cezası + sayıca ezilme cezası
  const casualtyPenalty = lossRatio * 46;
  const commanderPenalty = context.commanderDown ? 22 : 0;
  const outnumberedPenalty =
    context.allyStrengthRatio < 0.28 ? (0.28 - context.allyStrengthRatio) * 55 : 0;

  let targetMorale =
    state.baseMorale -
    casualtyPenalty -
    commanderPenalty -
    outnumberedPenalty -
    state.recentShock;

  // Yedek dalga beklerken moral bozgun eşiğinin üstünde tutunur
  if (context.hasReserves) {
    targetMorale = Math.max(MORALE_ROUT_THRESHOLD + 6, targetMorale);
  }

  state.currentMorale = Math.max(0, Math.min(100, Math.round(targetMorale)));

  // Bozgun tetiklemesi: yedek kalmamış, en az 10 sn çarpışılmış, kayıp oranı >= %45
  // (veya komutan düşmüş) ve moral eşik altında
  if (
    !state.isRouting &&
    !context.hasReserves &&
    context.battleElapsedSec >= 10 &&
    context.aliveInDivision > 0 &&
    state.currentMorale < MORALE_ROUT_THRESHOLD &&
    (lossRatio >= 0.45 || context.commanderDown)
  ) {
    state.isRouting = true;
  }

  return state;
}

// ============================================================================
// 5. YARALI / ÖLÜ AYRIMI (HEKİMLİK) VE ESARET SONRASI KURTULMA
// ============================================================================

export interface CasualtySplitReport {
  killed: Partial<TroopRoster>;
  wounded: Partial<TroopRoster>;
  totalKilled: number;
  totalWounded: number;
  survivalRate: number;
}

/**
 * Savaşta düşen dost askerlerin ne kadarının **Yaralı (Wounded)** olarak kurtulduğunu,
 * ne kadarının **Ölü (Killed)** olarak kadrodan kalıcı silineceğini hesaplar.
 *
 * Bannerlord Hekimlik (Medicine) etkisi:
 *   Taban hayatta kalma %34 + Cerrah Hekimlik * %0.42 (azami %82).
 */
export function splitBattleCasualties(
  totalFallenByClass: Partial<TroopRoster>,
  surgeonMedicineSkill: number,
): CasualtySplitReport {
  const survivalRate = Number(
    Math.max(0.28, Math.min(0.82, 0.34 + surgeonMedicineSkill * 0.0042)).toFixed(3),
  );

  const classes: UnitTierId[] = ['infantry', 'archer', 'cavalry', 'horseArcher'];
  const killed: Partial<TroopRoster> = {};
  const wounded: Partial<TroopRoster> = {};
  let totalKilled = 0;
  let totalWounded = 0;

  for (const cls of classes) {
    const fallen = Math.max(0, Math.round(totalFallenByClass[cls] ?? 0));
    if (fallen <= 0) {
      killed[cls] = 0;
      wounded[cls] = 0;
      continue;
    }
    const survivedCount = Math.min(fallen, Math.floor(fallen * survivalRate));
    const deadCount = fallen - survivedCount;
    killed[cls] = deadCount;
    wounded[cls] = survivedCount;
    totalKilled += deadCount;
    totalWounded += survivedCount;
  }

  return {
    killed,
    wounded,
    totalKilled,
    totalWounded,
    survivalRate,
  };
}
