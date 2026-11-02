import * as THREE from 'three';
import type {
  CharacterRig,
  WarHorseRig,
  WeaponType,
} from './characterRig';
import type {
  CharacterAnimator,
  AttackDirection,
} from './characterAnimator';

export type { AttackDirection };
import type {
  CampaignState,
  LordAgent,
  Settlement,
  TroopRoster,
} from './rules';
import type { BattleTelemetry } from './types';

export type ArenaBattleMode = 'TRAINING' | 'DUEL' | 'SKIRMISH' | 'MASS_BATTLE';

export function createLordBannerBadge(titleAndName: string, factionColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(18, 14, 10, 0.94)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 108, 20);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = factionColor;
    ctx.fillRect(24, 22, 18, 84);

    ctx.font = 'bold 34px serif';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`👑 ${titleAndName}`, 268, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.2, 1.05, 1);
  sprite.position.set(0, 3.45, 0);
  return sprite;
}

export interface FlyingArrow {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  inFlight: boolean;
  spawnTime: number;
  despawnAt?: number;
  team: 'ALLY' | 'ENEMY';
  /** Çekiş gücü 0..1 — hız ve hasarı bu belirler. */
  power: number;
}

export interface FloatingText {
  id: string;
  text: string;
  color: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  createdAt: number;
}

export interface SkirmishFighter {
  id: string;
  name: string;
  team: 'ALLY' | 'ENEMY';
  division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS';
  /** Bannerlord Asker Rütbesi (Tier 1-6): 1=Acemi, 3=Eğitimli, 5=Elit Şövalye, 6=Lord */
  tier: number;
  rig: CharacterRig;
  animator: CharacterAnimator;
  horse?: WarHorseRig;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  hasShield: boolean;
  weaponType: WeaponType;
  attackDir: AttackDirection;
  blockDir: AttackDirection;
  aiTimer: number;
  strafeSign: number;
  respawnTimer: number;
  isLord?: boolean;
  badge?: THREE.Sprite;
  isRouting?: boolean;
  routed?: boolean;
  isRiderlessHorse?: boolean;
  panicVelocity?: number;
  panicDir?: number;
  panicTimer?: number;
  /** At üstünde vurulup düşme fiziği ve yuvarlanma animasyonu */
  fallingFromHorse?: boolean;
  fallY?: number;
  fallVy?: number;
  fallRoll?: number;
  fallRollSpeed?: number;
  /** Süvari Vur-Kaç Durum Makinesi (Bannerlord Cycle-Charge) */
  cavalryChargeState?: 'CHARGE' | 'PASS_THROUGH' | 'PULL_AWAY';
  cavalryTimer?: number;
  cavalryHeadingX?: number;
  cavalryHeadingZ?: number;
  /** Piyade Taktik Duruşu (Geri adım kalkanla nefes alma, kalkan yanı dolanma) */
  tacticalStance?: 'ATTACK' | 'BACKPEDAL' | 'FLANK';
  tacticalTimer?: number;
  /** LOD & Performans İyileştiricileri (50v50 ve 500v500 için) */
  animTickCounter?: number;
  currentShadowState?: boolean;
}

/** Kalradya Meydan Muharebesi Prosedürel Arazi Yükselti Fonksiyonu */
export function getFieldElevation(x: number, z: number): number {
  const h1 = Math.sin(x * 0.02) * Math.cos(z * 0.025) * 2.8;
  const h2 = Math.sin(x * 0.045 + 1.2) * 1.2;
  const ridge = Math.cos(z * 0.03) * 1.6;
  return h1 + h2 + ridge;
}

export interface KillFeedItem {
  id: string;
  killer: string;
  victim: string;
  killerTeam: 'ALLY' | 'ENEMY';
  icon: string;
  createdAt: number;
}

export interface CharacterArenaViewProps {
  campaign?: CampaignState;
  onReturnToMap: () => void;
  onOpenMarket?: () => void;
  // Meydan & Kuşatma Birleşik Muharebe Modu
  mode?: 'ARENA' | 'FIELD' | 'SIEGE';
  targetLord?: LordAgent | null;
  targetSettlement?: Settlement | null;
  onBattleTelemetry?: (telemetry: BattleTelemetry) => void;
  onBattleComplete?: (
    victory: boolean,
    losses: Partial<TroopRoster>,
    enemiesDefeated: number,
  ) => void;
  paused?: boolean;
}

/* ─── Constants ─── */

export const ARENA_RADIUS = 17;
export const MASS_BATTLE_RADIUS = 46;
export const MOVE_SPEED = 3.4;
export const SPRINT_SPEED = 5.8;
export const HORSE_WALK_SPEED = 5.6;
export const HORSE_GALLOP_SPEED = 8.8;
export const CAM_LOOK_HEIGHT = 1.3;
export const CAM_LERP = 0.12;
export const MOUSE_SENSITIVITY = 0.002;
export const ARROW_SPEED = 34;
export const ARROW_LIFETIME = 4000; // ms
export const DMG_TEXT_LIFETIME = 2400; // ms
export const ALL_DIRS: AttackDirection[] = ['up', 'down', 'left', 'right'];
