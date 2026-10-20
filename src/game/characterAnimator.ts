import * as THREE from 'three';
import type { CharacterRig } from './characterRig';
import { orientHand, solveTwoBoneIK, type TwoBoneChain } from './ik';

/**
 * ============================================================================
 *  CHARACTER ANIMATOR — layered procedural animation for the low-poly rig
 * ============================================================================
 *
 *  Layers (evaluated every frame, bottom -> top):
 *   1. Locomotion  : idle / walk / run / strafe, speed-driven, foot phase locked to distance.
 *   2. Stance      : weapon-specific hand targets (IK) or relaxed arm swing (FK, when sheathed).
 *   3. Action      : one-shot clips (attacks, blocks, bow, fall). Upper-body clips only touch
 *                    the joints they key, so legs keep walking while you swing.
 *                    Clips can HOLD at a frame (charged attacks, raised shield, full bow draw).
 *                    Switching clips cross-fades the previous one out.
 *   4. Additive    : hit reactions layered on top of whatever is playing.
 *   5. IK          : two-bone arm IK + hand orientation; off-hand follows the main weapon grip
 *                    (two-handed swords / spears), bow arm aims, draw hand anchors to the chin.
 *
 *  Space conventions: "root space" = character local space (feet at origin, +Z forward,
 *  +X = character's LEFT, +Y up). See characterRig.ts for joint rotation conventions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Legacy discrete states (kept for older callers / UI buttons). */
export type CharacterAnimState =
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'ATTACK_1H_SLASH'
  | 'ATTACK_1H_OVERHEAD'
  | 'ATTACK_2H_CLEAVE'
  | 'ATTACK_SPEAR_THRUST'
  | 'BLOCK_SHIELD'
  | 'BLOCK_PARRY'
  | 'BOW_DRAW'
  | 'BOW_RELEASE'
  | 'HIT_STAGGER'
  | 'FALL_DEFEAT';

export type V3 = [number, number, number];
export type AttackDirection = 'up' | 'down' | 'left' | 'right';
export type WeaponClass = '1H' | '1H_SHIELD' | '2H' | 'SPEAR' | 'BOW' | 'UNARMED';

export type BodyJoint =
  | 'pelvis'
  | 'torso'
  | 'neck'
  | 'head'
  | 'lShoulder'
  | 'lForearm'
  | 'lHand'
  | 'rShoulder'
  | 'rForearm'
  | 'rHand'
  | 'lThigh'
  | 'lShin'
  | 'lFoot'
  | 'rThigh'
  | 'rShin'
  | 'rFoot';

const BODY_JOINTS: BodyJoint[] = [
  'pelvis',
  'torso',
  'neck',
  'head',
  'lShoulder',
  'lForearm',
  'lHand',
  'rShoulder',
  'rForearm',
  'rHand',
  'lThigh',
  'lShin',
  'lFoot',
  'rThigh',
  'rShin',
  'rFoot',
];

/** IK target for a hand, in root space. */
export interface HandTarget {
  /** Hand origin (wrist) position. */
  p: V3;
  /** Direction of the hand's +Z axis (= blade / shaft / bow limbs / shield face). */
  z: V3;
  /** Optional hint for the secondary axis (see `axis`). Default: toward the elbow. */
  hint?: V3;
  axis?: 'x' | 'y';
  /** Elbow pole direction (root space). */
  pole?: V3;
}

export interface ClipKey {
  t: number;
  body?: Partial<Record<BodyJoint, V3>>;
  pelvisPos?: V3;
  r?: HandTarget;
  l?: HandTarget;
  rw?: number;
  lw?: number;
}

export type ClipKind = 'attack' | 'block' | 'bow_draw' | 'bow_release' | 'react' | 'fall' | 'misc';

export interface ClipDef {
  name: string;
  label: string;
  kind: ClipKind;
  duration: number;
  keys: ClipKey[];
  events?: { t: number; name: string }[];
  /** Clip pauses here while the input is held. */
  holdAt?: number;
  /** Time of the damage frame (also emitted as 'hit' event). */
  hitTime?: number;
  fadeIn?: number;
  fadeOut?: number;
  additive?: boolean;
  /** Freeze on the last frame instead of fading out (e.g. death). */
  endHold?: boolean;
  bowAim?: [number, number][];
  bowDraw?: [number, number][];
  /** If true the arrow is no longer on the string during this clip. */
  stringReleased?: boolean;
  lookForward?: number;
}

interface Sample<T> {
  t: number;
  v: T;
}

interface CompiledClip {
  def: ClipDef;
  body: Partial<Record<BodyJoint, Sample<V3>[]>>;
  pelvisPos: Sample<V3>[];
  r: Sample<HandTarget>[];
  l: Sample<HandTarget>[];
  rw: Sample<number>[];
  lw: Sample<number>[];
}

class HandState {
  w = 0;
  p = new THREE.Vector3();
  z = new THREE.Vector3(0, 0, 1);
  hint = new THREE.Vector3(); // zero = use default (toward elbow)
  axis: 'x' | 'y' = 'y';
  pole = new THREE.Vector3();
  /** If set, this hand follows the right-hand weapon grip at this offset along the weapon axis. */
  grip: number | null = null;

  copy(o: HandState) {
    this.w = o.w;
    this.p.copy(o.p);
    this.z.copy(o.z);
    this.hint.copy(o.hint);
    this.axis = o.axis;
    this.pole.copy(o.pole);
    this.grip = o.grip;
    return this;
  }

  setTarget(t: HandTarget, w: number, defaultPole: THREE.Vector3) {
    this.w = w;
    this.p.set(t.p[0], t.p[1], t.p[2]);
    this.z.set(t.z[0], t.z[1], t.z[2]).normalize();
    if (t.hint) this.hint.set(t.hint[0], t.hint[1], t.hint[2]).normalize();
    else this.hint.set(0, 0, 0);
    this.axis = t.axis ?? 'y';
    if (t.pole) this.pole.set(t.pole[0], t.pole[1], t.pole[2]).normalize();
    else this.pole.copy(defaultPole);
    this.grip = null;
  }

  /** Blend `src` on top of this hand by weight `w`. */
  blend(src: HandState, w: number) {
    if (w <= 0) return;
    if (this.w < 1e-3 || this.grip !== null || src.grip !== null) {
      // Our own target is meaningless (FK or grip) -> take the source's spatial data.
      if (src.grip !== null) {
        this.grip = w > 0.5 || this.grip !== null ? src.grip : this.grip;
      } else {
        this.p.copy(src.p);
        this.z.copy(src.z);
        this.hint.copy(src.hint);
        this.axis = src.axis;
        this.pole.copy(src.pole);
        if (w > 0.5) this.grip = null;
      }
    } else {
      this.p.lerp(src.p, w);
      this.z.lerp(src.z, w).normalize();
      if (src.hint.lengthSq() > 0) {
        if (this.hint.lengthSq() > 0) this.hint.lerp(src.hint, w).normalize();
        else if (w > 0.5) this.hint.copy(src.hint);
      } else if (w > 0.5) this.hint.set(0, 0, 0);
      if (w > 0.5) this.axis = src.axis;
      this.pole.lerp(src.pole, w).normalize();
    }
    this.w = THREE.MathUtils.lerp(this.w, src.w, w);
  }
}

class Frame {
  body = {} as Record<BodyJoint, THREE.Vector3>;
  pelvisPos = new THREE.Vector3();
  r = new HandState();
  l = new HandState();
  lookForward = 0.85;
  bowAim = 0;
  bowDraw = 0;
  nocked = false;

  constructor() {
    for (const j of BODY_JOINTS) this.body[j] = new THREE.Vector3();
  }

  reset() {
    for (const j of BODY_JOINTS) this.body[j].set(0, 0, 0);
    this.pelvisPos.set(0, 0, 0);
    this.r.w = 0;
    this.r.grip = null;
    this.l.w = 0;
    this.l.grip = null;
    this.lookForward = 0.85;
    this.bowAim = 0;
    this.bowDraw = 0;
    this.nocked = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function findSegment<T>(arr: Sample<T>[], t: number): [Sample<T>, Sample<T>, number] {
  if (t <= arr[0].t) return [arr[0], arr[0], 0];
  const last = arr[arr.length - 1];
  if (t >= last.t) return [last, last, 0];
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i];
    const b = arr[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      return [a, b, span > 0 ? smooth((t - a.t) / span) : 1];
    }
  }
  return [last, last, 0];
}

function sampleV3(arr: Sample<V3>[], t: number, out: THREE.Vector3): boolean {
  if (arr.length === 0) return false;
  const [a, b, s] = findSegment(arr, t);
  out.set(
    a.v[0] + (b.v[0] - a.v[0]) * s,
    a.v[1] + (b.v[1] - a.v[1]) * s,
    a.v[2] + (b.v[2] - a.v[2]) * s,
  );
  return true;
}

function sampleNum(arr: Sample<number>[], t: number): number | null {
  if (arr.length === 0) return null;
  const [a, b, s] = findSegment(arr, t);
  return a.v + (b.v - a.v) * s;
}

function samplePiecewise(arr: [number, number][] | undefined, t: number): number | null {
  if (!arr || arr.length === 0) return null;
  if (t <= arr[0][0]) return arr[0][1];
  for (let i = 0; i < arr.length - 1; i++) {
    const [t0, v0] = arr[i];
    const [t1, v1] = arr[i + 1];
    if (t >= t0 && t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / Math.max(1e-6, t1 - t0));
  }
  return arr[arr.length - 1][1];
}

const _ha = new HandState();
const _hb = new HandState();
function sampleHand(arr: Sample<HandTarget>[], t: number, out: HandState, defaultPole: THREE.Vector3): boolean {
  if (arr.length === 0) return false;
  const [a, b, s] = findSegment(arr, t);
  _ha.setTarget(a.v, 1, defaultPole);
  if (a === b || s <= 0) {
    out.copy(_ha);
    return true;
  }
  _hb.setTarget(b.v, 1, defaultPole);
  out.copy(_ha);
  out.p.lerp(_hb.p, s);
  out.z.lerp(_hb.z, s).normalize();
  if (_ha.hint.lengthSq() > 0 && _hb.hint.lengthSq() > 0) out.hint.lerp(_hb.hint, s).normalize();
  else if (s > 0.5) out.hint.copy(_hb.hint);
  out.pole.lerp(_hb.pole, s).normalize();
  if (s > 0.5) out.axis = _hb.axis;
  return true;
}

function compileClip(def: ClipDef): CompiledClip {
  const c: CompiledClip = { def, body: {}, pelvisPos: [], r: [], l: [], rw: [], lw: [] };
  const keys = [...def.keys].sort((a, b) => a.t - b.t);
  for (const k of keys) {
    if (k.body) {
      for (const j of Object.keys(k.body) as BodyJoint[]) {
        (c.body[j] ??= []).push({ t: k.t, v: k.body[j]! });
      }
    }
    if (k.pelvisPos) c.pelvisPos.push({ t: k.t, v: k.pelvisPos });
    if (k.r) c.r.push({ t: k.t, v: k.r });
    if (k.l) c.l.push({ t: k.t, v: k.l });
    if (k.rw !== undefined) c.rw.push({ t: k.t, v: k.rw });
    if (k.lw !== undefined) c.lw.push({ t: k.t, v: k.lw });
  }
  return c;
}

/** Mirrors a right-hand attack to the opposite side (e.g. right slash -> backhand left slash). */
function mirrorClip(def: ClipDef, name: string, label: string, xScale = 0.75): ClipDef {
  const mv = (v: V3, s = 1): V3 => [-v[0] * s, v[1], v[2]];
  const mh = (h: HandTarget): HandTarget => ({
    ...h,
    p: mv(h.p, xScale),
    z: mv(h.z),
    hint: h.hint ? mv(h.hint) : undefined,
    pole: h.pole ? h.pole : undefined,
  });
  return {
    ...def,
    name,
    label,
    keys: def.keys.map((k) => {
      const body: Partial<Record<BodyJoint, V3>> = {};
      if (k.body) {
        for (const j of Object.keys(k.body) as BodyJoint[]) {
          const v = k.body[j]!;
          // yaw and roll flip for the spine; limbs are untouched
          body[j] = j === 'pelvis' || j === 'torso' || j === 'neck' || j === 'head' ? [v[0], -v[1], -v[2]] : v;
        }
      }
      return {
        ...k,
        body: k.body ? body : undefined,
        pelvisPos: k.pelvisPos ? mv(k.pelvisPos) : undefined,
        r: k.r ? mh(k.r) : undefined,
        l: k.l ? mh(k.l) : undefined,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Stances (combat-ready hand placement per weapon class)
// ---------------------------------------------------------------------------

interface StanceDef {
  r?: HandTarget;
  l?: HandTarget;
  /** Left hand follows the right-hand weapon grip at this offset (2H / spear). */
  lGrip?: number;
  body?: Partial<Record<BodyJoint, V3>>;
}

const SHIELD_CARRY: HandTarget = {
  p: [0.22, 1.2, 0.3],
  z: [0.3, 0.0, 1],
  hint: [0, -1, 0],
  axis: 'x',
  pole: [0.9, -0.4, -0.3],
};

const STANCES: Record<WeaponClass, StanceDef> = {
  '1H': {
    r: { p: [-0.24, 1.17, 0.26], z: [0.08, 0.8, 0.6] },
    body: { lShoulder: [-0.25, 0, 0.18], lForearm: [-0.9, 0, 0] },
  },
  '1H_SHIELD': {
    r: { p: [-0.25, 1.17, 0.24], z: [0.08, 0.8, 0.6] },
    l: SHIELD_CARRY,
  },
  '2H': {
    r: { p: [-0.1, 1.12, 0.33], z: [0.12, 0.85, 0.5] },
    lGrip: -0.11,
  },
  SPEAR: {
    r: { p: [-0.22, 1.12, -0.04], z: [0.22, 0.12, 1] },
    lGrip: 0.42,
    body: { torso: [0, -0.2, 0] },
  },
  BOW: {
    l: { p: [0.3, 1.0, 0.22], z: [0.25, 0.75, 0.6], hint: [0, 0, -1], axis: 'y' },
    body: { rShoulder: [0.05, 0, -0.12], rForearm: [-0.4, 0, 0] },
  },
  UNARMED: {
    r: { p: [-0.13, 1.47, 0.27], z: [0, 0.35, 1], pole: [-0.6, -0.7, -0.2] },
    l: { p: [0.13, 1.5, 0.32], z: [0, 0.35, 1], pole: [0.6, -0.7, -0.2] },
  },
};

// ---------------------------------------------------------------------------
// Clip library
// ---------------------------------------------------------------------------

const ONE_H_OVERHEAD: ClipDef = {
  name: 'atk_overhead',
  label: '⚔️ Tepeden Kes',
  kind: 'attack',
  duration: 0.95,
  holdAt: 0.28,
  hitTime: 0.5,
  fadeOut: 0.28,
  keys: [
    {
      t: 0.28,
      body: { torso: [-0.12, -0.25, 0], pelvis: [0, -0.1, 0] },
      r: { p: [-0.2, 1.98, -0.02], z: [0, -0.35, -1], pole: [-0.7, 0.4, -0.5] },
    },
    { t: 0.4, body: { torso: [0.05, -0.1, 0] }, r: { p: [-0.14, 1.86, 0.34], z: [0, 0.85, 0.5] } },
    {
      t: 0.5,
      body: { torso: [0.3, 0.08, 0], pelvis: [0.06, 0.05, 0] },
      r: { p: [-0.1, 1.32, 0.46], z: [0, -0.45, 0.9] },
    },
    { t: 0.66, body: { torso: [0.22, 0.05, 0] }, r: { p: [-0.14, 1.12, 0.36], z: [0, -0.75, 0.65] } },
  ],
};

const ONE_H_SLASH_R: ClipDef = {
  name: 'atk_slash_r',
  label: '⚔️ Sağdan Yatay Savur',
  kind: 'attack',
  duration: 0.9,
  holdAt: 0.28,
  hitTime: 0.47,
  fadeOut: 0.3,
  keys: [
    {
      t: 0.28,
      body: { torso: [0, -0.65, 0], pelvis: [0, -0.2, 0] },
      r: { p: [-0.52, 1.6, -0.08], z: [-0.55, 0.45, -0.7], pole: [-0.4, -0.5, -0.8] },
    },
    { t: 0.4, body: { torso: [0.05, -0.25, 0] }, r: { p: [-0.42, 1.48, 0.36], z: [-0.6, 0.2, 0.75] } },
    {
      t: 0.47,
      body: { torso: [0.12, 0.1, 0], pelvis: [0, 0.08, 0] },
      r: { p: [-0.12, 1.42, 0.52], z: [0.15, 0.05, 1] },
    },
    {
      t: 0.6,
      body: { torso: [0.1, 0.45, 0], pelvis: [0, 0.15, 0] },
      r: { p: [0.2, 1.32, 0.4], z: [0.9, -0.1, 0.4] },
    },
  ],
};

const ONE_H_THRUST: ClipDef = {
  name: 'atk_thrust',
  label: '🗡️ Dürtme Hamlesi',
  kind: 'attack',
  duration: 0.85,
  holdAt: 0.25,
  hitTime: 0.42,
  fadeOut: 0.28,
  keys: [
    {
      t: 0.25,
      body: { torso: [0, -0.35, 0], pelvis: [0, -0.1, 0] },
      r: { p: [-0.3, 1.3, -0.18], z: [0.1, 0.05, 1] },
    },
    {
      t: 0.42,
      body: { torso: [0.18, 0.15, 0], pelvis: [0.05, 0.05, 0] },
      pelvisPos: [0, -0.03, 0.06],
      r: { p: [-0.12, 1.4, 0.55], z: [0.1, 0.02, 1] },
    },
    { t: 0.56, r: { p: [-0.13, 1.39, 0.52], z: [0.1, 0.02, 1] } },
  ],
};

const TWO_H_OVERHEAD: ClipDef = {
  name: 'atk_overhead',
  label: '🗡️ Çift El Tepeden',
  kind: 'attack',
  duration: 1.15,
  holdAt: 0.34,
  hitTime: 0.6,
  fadeOut: 0.32,
  keys: [
    {
      t: 0.34,
      body: { torso: [-0.15, -0.15, 0], pelvis: [0, -0.1, 0] },
      r: { p: [-0.12, 1.95, -0.1], z: [0, -0.4, -1], pole: [-0.7, 0.4, -0.5] },
    },
    { t: 0.5, body: { torso: [0.05, 0, 0] }, r: { p: [-0.08, 1.82, 0.32], z: [0, 0.9, 0.4] } },
    {
      t: 0.6,
      body: { torso: [0.35, 0.05, 0], pelvis: [0.08, 0, 0] },
      pelvisPos: [0, -0.04, 0.04],
      r: { p: [-0.05, 1.28, 0.48], z: [0, -0.4, 0.92] },
    },
    { t: 0.78, body: { torso: [0.28, 0, 0] }, r: { p: [-0.06, 1.1, 0.4], z: [0, -0.7, 0.7] } },
  ],
};

const TWO_H_SLASH_R: ClipDef = {
  name: 'atk_slash_r',
  label: '🗡️ Çift El Yatay Savurma',
  kind: 'attack',
  duration: 1.1,
  holdAt: 0.34,
  hitTime: 0.56,
  fadeOut: 0.32,
  keys: [
    {
      t: 0.34,
      body: { torso: [0, -0.85, 0], pelvis: [0, -0.3, 0] },
      r: { p: [-0.48, 1.62, -0.12], z: [-0.5, 0.5, -0.7], pole: [-0.4, -0.5, -0.8] },
    },
    { t: 0.48, body: { torso: [0.05, -0.35, 0] }, r: { p: [-0.36, 1.45, 0.38], z: [-0.5, 0.15, 0.85] } },
    {
      t: 0.56,
      body: { torso: [0.12, 0.1, 0], pelvis: [0, 0.05, 0] },
      r: { p: [-0.05, 1.38, 0.5], z: [0.2, 0, 1] },
    },
    {
      t: 0.74,
      body: { torso: [0.1, 0.6, 0], pelvis: [0, 0.2, 0] },
      r: { p: [0.28, 1.25, 0.32], z: [0.9, -0.15, 0.3] },
    },
  ],
};

const TWO_H_THRUST: ClipDef = {
  name: 'atk_thrust',
  label: '🗡️ Çift El Dürtme',
  kind: 'attack',
  duration: 0.95,
  holdAt: 0.3,
  hitTime: 0.48,
  fadeOut: 0.3,
  keys: [
    { t: 0.3, body: { torso: [0, -0.3, 0] }, r: { p: [-0.26, 1.24, -0.18], z: [0.1, 0.1, 1] } },
    {
      t: 0.48,
      body: { torso: [0.2, 0.1, 0] },
      pelvisPos: [0, -0.03, 0.08],
      r: { p: [-0.1, 1.34, 0.5], z: [0.05, 0.03, 1] },
    },
    { t: 0.62, r: { p: [-0.1, 1.33, 0.48], z: [0.05, 0.03, 1] } },
  ],
};

const SPEAR_THRUST: ClipDef = {
  name: 'atk_thrust',
  label: '🔱 Mızrak Hamlesi',
  kind: 'attack',
  duration: 0.9,
  holdAt: 0.28,
  hitTime: 0.44,
  fadeOut: 0.3,
  keys: [
    {
      t: 0.28,
      body: { torso: [0, -0.45, 0], pelvis: [0, -0.15, 0] },
      r: { p: [-0.24, 1.15, -0.3], z: [0.2, 0.1, 1] },
    },
    {
      t: 0.44,
      body: { torso: [0.15, 0.12, 0], pelvis: [0.05, 0.05, 0] },
      pelvisPos: [0, -0.04, 0.1],
      r: { p: [-0.12, 1.25, 0.35], z: [0.12, 0.05, 1] },
    },
    { t: 0.6, r: { p: [-0.13, 1.24, 0.32], z: [0.12, 0.05, 1] } },
  ],
};

const SPEAR_OVERHAND: ClipDef = {
  name: 'atk_overhead',
  label: '🔱 Omuzdan Saplama',
  kind: 'attack',
  duration: 0.95,
  holdAt: 0.3,
  hitTime: 0.48,
  fadeOut: 0.3,
  keys: [
    {
      t: 0.3,
      body: { torso: [-0.05, -0.35, 0] },
      r: { p: [-0.3, 1.82, -0.18], z: [0.15, -0.2, 1], pole: [-0.8, 0.2, -0.5] },
    },
    {
      t: 0.48,
      body: { torso: [0.2, 0.1, 0] },
      pelvisPos: [0, -0.03, 0.08],
      r: { p: [-0.18, 1.7, 0.32], z: [0.12, -0.3, 1], pole: [-0.8, 0.2, -0.5] },
    },
    { t: 0.62, r: { p: [-0.18, 1.68, 0.3], z: [0.12, -0.3, 1], pole: [-0.8, 0.2, -0.5] } },
  ],
};

const UNARMED_JAB_R: ClipDef = {
  name: 'atk_jab_r',
  label: '🥊 Sağ Direkt',
  kind: 'attack',
  duration: 0.5,
  holdAt: 0.12,
  hitTime: 0.22,
  fadeOut: 0.2,
  keys: [
    { t: 0.12, body: { torso: [0, -0.3, 0] }, r: { p: [-0.16, 1.45, 0.12], z: [0, 0.3, 1] } },
    {
      t: 0.22,
      body: { torso: [0.12, 0.25, 0] },
      r: { p: [-0.05, 1.52, 0.62], z: [0, 0, 1], pole: [-0.9, -0.3, 0] },
    },
  ],
};

const UNARMED_JAB_L: ClipDef = {
  name: 'atk_jab_l',
  label: '🥊 Sol Direkt',
  kind: 'attack',
  duration: 0.45,
  holdAt: 0.1,
  hitTime: 0.2,
  fadeOut: 0.2,
  keys: [
    { t: 0.1, body: { torso: [0, 0.25, 0] }, l: { p: [0.15, 1.48, 0.15], z: [0, 0.3, 1] } },
    {
      t: 0.2,
      body: { torso: [0.1, -0.25, 0] },
      l: { p: [0.05, 1.52, 0.62], z: [0, 0, 1], pole: [0.9, -0.3, 0] },
    },
  ],
};

// ---------------------------------------------------------------------------
// 4-Way Directional Parry Blocks & Shield Blocks (Bannerlord / Warband Combat)
// ---------------------------------------------------------------------------

// 1. Kalkan Blok (Omni-directional shield defense)
const BLOCK_SHIELD: ClipDef = {
  name: 'block_shield',
  label: '🛡️ Kalkan Blok',
  kind: 'block',
  duration: 0.32,
  holdAt: 0.14,
  fadeOut: 0.16,
  keys: [
    {
      t: 0.14,
      body: { torso: [0.08, 0.15, 0] },
      pelvisPos: [0, -0.04, 0],
      l: { p: [0.06, 1.42, 0.4], z: [0, 0.08, 1], hint: [0, -1, 0], axis: 'x', pole: [0.85, -0.45, -0.2] },
      r: { p: [-0.3, 1.22, 0.05], z: [0, 0.9, 0.4] },
    },
  ],
};
const BLOCK_SHIELD_ALIAS: ClipDef = { ...BLOCK_SHIELD, name: 'block' };

// 2. 1H Kılıç Karşılama (4 Yön)
const BLOCK_1H_UP: ClipDef = {
  name: 'block_up',
  label: '⚔️ Üst Blok (Tepeden)',
  kind: 'block',
  duration: 0.32,
  holdAt: 0.14,
  fadeOut: 0.16,
  keys: [
    {
      t: 0.14,
      body: { torso: [-0.08, 0, 0] },
      r: { p: [-0.06, 1.84, 0.28], z: [0.95, 0.06, 0.1], hint: [0, 1, 0], pole: [-0.85, -0.3, -0.2] },
    },
  ],
};
const BLOCK_1H_DOWN: ClipDef = {
  name: 'block_down',
  label: '⚔️ Alt Blok (Dürtme Karşıla)',
  kind: 'block',
  duration: 0.32,
  holdAt: 0.14,
  fadeOut: 0.16,
  keys: [
    {
      t: 0.14,
      body: { torso: [0.12, 0, 0] },
      r: { p: [-0.14, 1.14, 0.38], z: [0.12, -0.85, 0.5], pole: [-0.75, -0.5, -0.3] },
    },
  ],
};
const BLOCK_1H_LEFT: ClipDef = {
  name: 'block_left',
  label: '⚔️ Sol Blok',
  kind: 'block',
  duration: 0.32,
  holdAt: 0.14,
  fadeOut: 0.16,
  keys: [
    {
      t: 0.14,
      body: { torso: [0.06, 0.26, 0] },
      r: { p: [0.18, 1.48, 0.34], z: [0.35, 0.9, 0.15], pole: [-0.5, -0.7, 0.2] },
    },
  ],
};
const BLOCK_1H_RIGHT: ClipDef = {
  name: 'block_right',
  label: '⚔️ Sağ Blok',
  kind: 'block',
  duration: 0.32,
  holdAt: 0.14,
  fadeOut: 0.16,
  keys: [
    {
      t: 0.14,
      body: { torso: [0.06, -0.26, 0] },
      r: { p: [-0.38, 1.48, 0.3], z: [-0.35, 0.9, 0.15], pole: [-0.85, -0.4, -0.3] },
    },
  ],
};
const BLOCK_PARRY_1H: ClipDef = { ...BLOCK_1H_UP, name: 'block' };

// 3. 2H Çift El Kılıç Karşılama (4 Yön)
const BLOCK_2H_UP: ClipDef = {
  name: 'block_2h_up',
  label: '🗡️ Çift El Üst Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [
    {
      t: 0.15,
      body: { torso: [-0.06, 0, 0] },
      r: { p: [-0.08, 1.86, 0.28], z: [0.95, 0.05, 0.1], hint: [0, 1, 0], pole: [-0.85, -0.3, -0.2] },
    },
  ],
};
const BLOCK_2H_DOWN: ClipDef = {
  name: 'block_2h_down',
  label: '🗡️ Çift El Alt Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [
    {
      t: 0.15,
      body: { torso: [0.1, 0, 0] },
      r: { p: [-0.12, 1.16, 0.38], z: [0.15, -0.85, 0.5], pole: [-0.75, -0.5, -0.3] },
    },
  ],
};
const BLOCK_2H_LEFT: ClipDef = {
  name: 'block_2h_left',
  label: '🗡️ Çift El Sol Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [
    {
      t: 0.15,
      body: { torso: [0.06, 0.24, 0] },
      r: { p: [0.14, 1.52, 0.34], z: [0.35, 0.9, 0.15], pole: [-0.5, -0.7, 0.2] },
    },
  ],
};
const BLOCK_2H_RIGHT: ClipDef = {
  name: 'block_2h_right',
  label: '🗡️ Çift El Sağ Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [
    {
      t: 0.15,
      body: { torso: [0.06, -0.24, 0] },
      r: { p: [-0.34, 1.52, 0.3], z: [-0.35, 0.9, 0.15], pole: [-0.85, -0.4, -0.3] },
    },
  ],
};
const BLOCK_PARRY_2H: ClipDef = { ...BLOCK_2H_UP, name: 'block' };

// 4. Mızrak Karşılama (4 Yön)
const BLOCK_SPEAR_UP: ClipDef = {
  name: 'block_spear_up',
  label: '🔱 Mızrak Üst Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [{ t: 0.15, r: { p: [-0.15, 1.85, 0.2], z: [0.95, 0.05, 0.1], pole: [-0.8, -0.3, -0.3] } }],
};
const BLOCK_SPEAR_DOWN: ClipDef = {
  name: 'block_spear_down',
  label: '🔱 Mızrak Alt Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [{ t: 0.15, r: { p: [-0.18, 1.15, 0.28], z: [0.2, -0.85, 0.45], pole: [-0.7, -0.5, -0.3] } }],
};
const BLOCK_SPEAR_LEFT: ClipDef = {
  name: 'block_spear_left',
  label: '🔱 Mızrak Sol Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [{ t: 0.15, r: { p: [0.12, 1.45, 0.28], z: [0.35, 0.9, 0.15] } }],
};
const BLOCK_SPEAR_RIGHT: ClipDef = {
  name: 'block_spear_right',
  label: '🔱 Mızrak Sağ Blok',
  kind: 'block',
  duration: 0.34,
  holdAt: 0.15,
  fadeOut: 0.17,
  keys: [{ t: 0.15, r: { p: [-0.28, 1.45, 0.25], z: [-0.35, 0.9, 0.15] } }],
};
const BLOCK_SPEAR: ClipDef = { ...BLOCK_SPEAR_UP, name: 'block' };

const SPEAR_SWEEP_R: ClipDef = {
  name: 'atk_slash_r',
  label: '🔱 Sağdan Savurma',
  kind: 'attack',
  duration: 0.9,
  holdAt: 0.28,
  hitTime: 0.46,
  fadeOut: 0.3,
  keys: [
    { t: 0.28, body: { torso: [0, -0.55, 0] }, r: { p: [-0.38, 1.35, -0.1], z: [-0.5, 0.2, 0.8] } },
    { t: 0.46, body: { torso: [0.1, 0.15, 0] }, r: { p: [-0.08, 1.3, 0.45], z: [0.3, 0, 0.9] } },
    { t: 0.62, r: { p: [-0.08, 1.28, 0.42], z: [0.3, 0, 0.9] } },
  ],
};

// 5. Silahsız Gard
const BLOCK_UNARMED: ClipDef = {
  name: 'block_unarmed',
  label: '🥊 Gard Al',
  kind: 'block',
  duration: 0.3,
  holdAt: 0.12,
  fadeOut: 0.15,
  keys: [
    {
      t: 0.12,
      body: { torso: [0.15, 0, 0] },
      r: { p: [-0.09, 1.66, 0.24], z: [0, 1, 0.2], pole: [-0.6, -0.7, 0] },
      l: { p: [0.09, 1.66, 0.24], z: [0, 1, 0.2], pole: [0.6, -0.7, 0] },
    },
  ],
};
const BLOCK_UNARMED_ALIAS: ClipDef = { ...BLOCK_UNARMED, name: 'block' };

const BOW_DRAW: ClipDef = {
  name: 'bow_draw',
  label: '🏹 Yay Çek',
  kind: 'bow_draw',
  duration: 0.7,
  holdAt: 0.7,
  fadeIn: 0.2,
  keys: [{ t: 0.25, body: { torso: [0, -1.1, 0], pelvis: [0, -0.3, 0] } }],
  bowAim: [
    [0, 0],
    [0.25, 1],
  ],
  bowDraw: [
    [0.15, 0],
    [0.7, 1],
  ],
  lookForward: 1,
};

const BOW_RELEASE: ClipDef = {
  name: 'bow_release',
  label: '🎯 Oku Bırak',
  kind: 'bow_release',
  duration: 0.55,
  fadeIn: 0.01,
  fadeOut: 0.25,
  stringReleased: true,
  events: [{ t: 0, name: 'release' }],
  keys: [{ t: 0, body: { torso: [0, -1.1, 0], pelvis: [0, -0.3, 0] } }],
  bowAim: [
    [0, 1],
    [0.3, 1],
    [0.55, 0],
  ],
  bowDraw: [
    [0, 1],
    [0.1, 1.08],
    [0.3, 1.0],
  ],
  lookForward: 1,
};

const HIT_REACT: ClipDef = {
  name: 'hit',
  label: '💥 Darbe Al',
  kind: 'react',
  duration: 0.45,
  additive: true,
  fadeIn: 0.001,
  fadeOut: 0.001,
  keys: [
    { t: 0, body: { torso: [0, 0, 0], head: [0, 0, 0] }, pelvisPos: [0, 0, 0] },
    { t: 0.09, body: { torso: [-0.32, 0.15, 0.05], head: [-0.25, 0.1, 0] }, pelvisPos: [0, -0.02, -0.05] },
    { t: 0.45, body: { torso: [0, 0, 0], head: [0, 0, 0] }, pelvisPos: [0, 0, 0] },
  ],
};

const FALL: ClipDef = {
  name: 'fall',
  label: '☠️ Yere Düş',
  kind: 'fall',
  duration: 1.1,
  endHold: true,
  fadeIn: 0.15,
  lookForward: 0,
  keys: [
    {
      t: 0.25,
      body: {
        pelvis: [-0.3, 0, 0],
        torso: [-0.2, 0, 0],
        head: [0, 0, 0],
        lThigh: [-0.4, 0, 0.1],
        rThigh: [-0.2, 0, -0.1],
        lShin: [0.6, 0, 0],
        rShin: [0.5, 0, 0],
        lShoulder: [-0.6, 0, 0.5],
        rShoulder: [-0.6, 0, -0.5],
        lForearm: [-0.4, 0, 0],
        rForearm: [-0.4, 0, 0],
      },
      pelvisPos: [0, -0.15, -0.05],
      rw: 0,
      lw: 0,
    },
    {
      t: 0.8,
      body: {
        pelvis: [-1.5, 0.2, 0],
        torso: [0.05, 0, 0],
        head: [0.2, 0.4, 0],
        lThigh: [-0.25, 0, 0.25],
        rThigh: [-0.05, 0, -0.2],
        lShin: [0.2, 0, 0],
        rShin: [0.35, 0, 0],
        lFoot: [0.4, 0, 0],
        rFoot: [0.4, 0, 0],
        lShoulder: [-0.3, 0, 1.3],
        rShoulder: [0.1, 0, -1.1],
        lForearm: [-0.3, 0, 0],
        rForearm: [-0.6, 0, 0],
      },
      pelvisPos: [0, -0.8, -0.5],
      rw: 0,
      lw: 0,
    },
  ],
};

const COMMON_CLIPS: ClipDef[] = [HIT_REACT, FALL];

const CLASS_CLIPS: Record<WeaponClass, ClipDef[]> = {
  '1H': [
    ONE_H_OVERHEAD,
    ONE_H_SLASH_R,
    mirrorClip(ONE_H_SLASH_R, 'atk_slash_l', '⚔️ Soldan Ters Savur'),
    ONE_H_THRUST,
    BLOCK_1H_UP,
    BLOCK_1H_DOWN,
    BLOCK_1H_LEFT,
    BLOCK_1H_RIGHT,
    BLOCK_PARRY_1H,
  ],
  '1H_SHIELD': [
    ONE_H_OVERHEAD,
    ONE_H_SLASH_R,
    mirrorClip(ONE_H_SLASH_R, 'atk_slash_l', '⚔️ Soldan Ters Savur', 0.6),
    ONE_H_THRUST,
    BLOCK_SHIELD,
    BLOCK_SHIELD_ALIAS,
  ],
  '2H': [
    TWO_H_OVERHEAD,
    TWO_H_SLASH_R,
    mirrorClip(TWO_H_SLASH_R, 'atk_slash_l', '🗡️ Çift El Soldan Savurma'),
    TWO_H_THRUST,
    BLOCK_2H_UP,
    BLOCK_2H_DOWN,
    BLOCK_2H_LEFT,
    BLOCK_2H_RIGHT,
    BLOCK_PARRY_2H,
  ],
  SPEAR: [
    SPEAR_OVERHAND,
    SPEAR_THRUST,
    SPEAR_SWEEP_R,
    mirrorClip(SPEAR_SWEEP_R, 'atk_slash_l', '🔱 Soldan Savurma'),
    BLOCK_SPEAR_UP,
    BLOCK_SPEAR_DOWN,
    BLOCK_SPEAR_LEFT,
    BLOCK_SPEAR_RIGHT,
    BLOCK_SPEAR,
  ],
  BOW: [BOW_DRAW, BOW_RELEASE, BLOCK_UNARMED, BLOCK_UNARMED_ALIAS],
  UNARMED: [UNARMED_JAB_R, UNARMED_JAB_L, BLOCK_UNARMED, BLOCK_UNARMED_ALIAS],
};

const COMPILED: Record<WeaponClass, Map<string, CompiledClip>> = (() => {
  const out = {} as Record<WeaponClass, Map<string, CompiledClip>>;
  for (const cls of Object.keys(CLASS_CLIPS) as WeaponClass[]) {
    const m = new Map<string, CompiledClip>();
    for (const d of [...COMMON_CLIPS, ...CLASS_CLIPS[cls]]) m.set(d.name, compileClip(d));
    out[cls] = m;
  }
  return out;
})();

export const DIRECTION_TO_CLIP: Record<WeaponClass, Record<AttackDirection, string>> = {
  '1H': { up: 'atk_overhead', down: 'atk_thrust', left: 'atk_slash_l', right: 'atk_slash_r' },
  '1H_SHIELD': { up: 'atk_overhead', down: 'atk_thrust', left: 'atk_slash_l', right: 'atk_slash_r' },
  '2H': { up: 'atk_overhead', down: 'atk_thrust', left: 'atk_slash_l', right: 'atk_slash_r' },
  SPEAR: { up: 'atk_overhead', down: 'atk_thrust', left: 'atk_slash_l', right: 'atk_slash_r' },
  BOW: { up: 'bow_draw', down: 'bow_draw', left: 'bow_draw', right: 'bow_draw' },
  UNARMED: { up: 'atk_jab_r', down: 'atk_jab_r', left: 'atk_jab_l', right: 'atk_jab_r' },
};

export const DIRECTION_TO_BLOCK: Record<WeaponClass, Record<AttackDirection, string>> = {
  '1H': { up: 'block_up', down: 'block_down', left: 'block_left', right: 'block_right' },
  '1H_SHIELD': { up: 'block_shield', down: 'block_shield', left: 'block_shield', right: 'block_shield' },
  '2H': { up: 'block_2h_up', down: 'block_2h_down', left: 'block_2h_left', right: 'block_2h_right' },
  SPEAR: { up: 'block_spear_up', down: 'block_spear_down', left: 'block_spear_left', right: 'block_spear_right' },
  BOW: { up: 'block_unarmed', down: 'block_unarmed', left: 'block_unarmed', right: 'block_unarmed' },
  UNARMED: { up: 'block_unarmed', down: 'block_unarmed', left: 'block_unarmed', right: 'block_unarmed' },
};

/** Lists the clips available for a weapon class (for debug UIs / timeline scrubbers). */
export function listClips(cls: WeaponClass): { name: string; label: string; duration: number; kind: ClipKind }[] {
  return [...COMPILED[cls].values()].map((c) => ({
    name: c.def.name,
    label: c.def.label,
    duration: c.def.duration,
    kind: c.def.kind,
  }));
}

export function weaponClassOf(rig: CharacterRig): WeaponClass {
  switch (rig.currentOptions.weaponType) {
    case 'TWO_HANDED_SWORD':
      return '2H';
    case 'SPEAR':
      return 'SPEAR';
    case 'BOW':
      return 'BOW';
    case 'UNARMED':
      return 'UNARMED';
    default:
      return rig.offHandItem?.name === 'Shield' ? '1H_SHIELD' : '1H';
  }
}

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

interface ActionInstance {
  clip: CompiledClip;
  t: number;
  speed: number;
  /** Input still held -> clip pauses at holdAt. */
  held: boolean;
  holdTime: number;
  fade: number; // 1 while active, ramps down when superseded
  fadingOut: boolean;
  nextEvent: number;
  hitFired: boolean;
}

export interface ActionInfo {
  name: string;
  kind: ClipKind;
  t: number;
  duration: number;
  hitTime: number | null;
  holding: boolean;
  holdTime: number;
}

const DEFAULT_POLE_R = new THREE.Vector3(-0.6, -0.45, -0.55).normalize();
const DEFAULT_POLE_L = new THREE.Vector3(0.6, -0.45, -0.55).normalize();

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _tmpHand = new HandState();
const _tmpHand2 = new HandState();

export class CharacterAnimator {
  readonly rig: CharacterRig;
  /** Called for clip events: 'hit', 'release', 'hold', 'end'. */
  onEvent: ((event: string, clipName: string) => void) | null = null;

  private target = new Frame();
  private current = new Frame();
  private initialized = false;

  // locomotion
  private moveTarget = new THREE.Vector2();
  private move = new THREE.Vector2(); // smoothed local velocity (x, z)
  private phase = 0;
  private time = 0;

  // stance
  private combatBlend = 1;
  private aimPitch = 0;

  // actions
  private action: ActionInstance | null = null;
  private fading: ActionInstance[] = [];
  private additive: ActionInstance | null = null;

  // preview
  private previewClip: string | null = null;
  private previewTime = 0;
  private previewing = false;

  private chains: { r: TwoBoneChain; l: TwoBoneChain };
  private jointMap: Record<BodyJoint, THREE.Object3D>;
  private legacyState: CharacterAnimState = 'IDLE';

  constructor(rig: CharacterRig) {
    this.rig = rig;
    this.jointMap = {
      pelvis: rig.pelvis,
      torso: rig.torso,
      neck: rig.neck,
      head: rig.head,
      lShoulder: rig.leftShoulder,
      lForearm: rig.leftForearm,
      lHand: rig.leftHand,
      rShoulder: rig.rightShoulder,
      rForearm: rig.rightForearm,
      rHand: rig.rightHand,
      lThigh: rig.leftThigh,
      lShin: rig.leftShin,
      lFoot: rig.leftFoot,
      rThigh: rig.rightThigh,
      rShin: rig.rightShin,
      rFoot: rig.rightFoot,
    };
    const l1 = Math.abs(rig.rightForearm.position.y);
    const l2 = Math.abs(rig.rightHand.position.y);
    this.chains = {
      r: { shoulder: rig.rightShoulder, upperArm: rig.rightUpperArm, forearm: rig.rightForearm, hand: rig.rightHand, l1, l2 },
      l: { shoulder: rig.leftShoulder, upperArm: rig.leftUpperArm, forearm: rig.leftForearm, hand: rig.leftHand, l1, l2 },
    };
    this.combatBlend = rig.sheathed ? 0 : 1;
  }

  // ----------------------------------------------------------------- input API

  /** Local-space velocity in m/s (x = left, z = forward). */
  setMove(localX: number, localZ: number) {
    this.moveTarget.set(localX, localZ);
  }

  /** Vertical aim angle in radians (positive = up). Used by the bow. */
  setAimPitch(pitch: number) {
    this.aimPitch = THREE.MathUtils.clamp(pitch, -0.9, 0.9);
  }

  get weaponClass(): WeaponClass {
    return weaponClassOf(this.rig);
  }

  get currentAction(): ActionInfo | null {
    const a = this.action;
    if (!a) return null;
    return {
      name: a.clip.def.name,
      kind: a.clip.def.kind,
      t: a.t,
      duration: a.clip.def.duration,
      hitTime: a.clip.def.hitTime ?? null,
      holding: a.held && a.clip.def.holdAt !== undefined && a.t >= a.clip.def.holdAt - 1e-4,
      holdTime: a.holdTime,
    };
  }

  isBlocking(): boolean {
    const a = this.action;
    return !!a && a.clip.def.kind === 'block' && a.held && a.t >= (a.clip.def.holdAt ?? 0) * 0.6;
  }

  isAttacking(): boolean {
    return !!this.action && this.action.clip.def.kind === 'attack';
  }

  /** True while an attack has not reached its damage frame yet (useful for AI reactions). */
  isWindingUp(): boolean {
    const a = this.action;
    return !!a && a.clip.def.kind === 'attack' && a.t < (a.clip.def.hitTime ?? 0);
  }

  isDown(): boolean {
    return this.action?.clip.def.kind === 'fall';
  }

  get bowDraw(): number {
    return this.current.bowDraw;
  }

  get bowNocked(): boolean {
    return this.current.nocked && this.current.bowAim > 0.5;
  }

  /** Can a new attack / block start right now? */
  canAct(): boolean {
    const a = this.action;
    if (!a) return true;
    const d = a.clip.def;
    if (d.kind === 'fall') return false;
    if (d.kind === 'attack') return d.hitTime !== undefined && a.t > d.hitTime + 0.12;
    if (d.kind === 'bow_release') return a.t > 0.3;
    if (d.kind === 'block') return !a.held;
    return true;
  }

  hasClip(name: string): boolean {
    return COMPILED[this.weaponClass].has(name);
  }

  /**
   * Plays a clip by name. `hold` = the input is still pressed (clip pauses at holdAt until release()).
   * Returns false if the clip doesn't exist for the current weapon or the character can't act.
   */
  play(name: string, opts: { hold?: boolean; force?: boolean; speed?: number } = {}): boolean {
    const clip = COMPILED[this.weaponClass].get(name);
    if (!clip) return false;
    if (clip.def.additive) {
      this.additive = this.makeInstance(clip, false, opts.speed);
      return true;
    }
    if (!opts.force && !this.canAct()) return false;
    if (this.action) {
      this.action.fadingOut = true;
      this.fading.push(this.action);
    }
    this.action = this.makeInstance(clip, !!opts.hold, opts.speed);
    return true;
  }

  attack(dir: AttackDirection = 'up', hold = true): boolean {
    const clipName = DIRECTION_TO_CLIP[this.weaponClass][dir] || 'atk_overhead';
    return this.play(clipName, { hold });
  }

  block(dir: AttackDirection = 'up'): boolean {
    const clipName = DIRECTION_TO_BLOCK[this.weaponClass][dir] || 'block';
    return this.play(clipName, { hold: true });
  }

  /** Releases the currently held action (charged attack, block, bow draw). */
  release() {
    const a = this.action;
    if (!a) return;
    a.held = false;
    if (a.clip.def.kind === 'bow_draw') {
      // Only shoot if the bow is meaningfully drawn; otherwise lower it.
      if (this.current.bowDraw > 0.55) this.play('bow_release', { force: true });
      else this.cancelAction();
    }
  }

  /** Interrupts the current action (e.g. when staggered). */
  cancelAction() {
    if (this.action) {
      this.action.fadingOut = true;
      this.fading.push(this.action);
      this.action = null;
    }
  }

  /** Hit reaction: interrupts attacks and plays the additive flinch. */
  hitReact(interrupt = true) {
    this.play('hit');
    if (interrupt && this.action && this.action.clip.def.kind !== 'fall') this.cancelAction();
  }

  fall() {
    this.play('fall', { force: true });
  }

  /** Clears everything (e.g. respawn). */
  reset() {
    this.action = null;
    this.fading = [];
    this.additive = null;
    this.initialized = false;
  }

  setCombatReady(ready: boolean) {
    this.combatTarget = ready ? 1 : 0;
  }
  private combatTarget = 1;

  /** Freezes the character in a given clip at time t (for the timeline scrubber). Pass null to stop. */
  preview(clipName: string | null, t = 0) {
    this.previewClip = clipName;
    this.previewTime = t;
    this.previewing = clipName !== null;
  }

  /** Legacy single-state driver. */
  applyLegacyState(state: CharacterAnimState) {
    if (state === 'IDLE') this.setMove(0, 0);
    else if (state === 'WALK') this.setMove(0, 1.6);
    else if (state === 'RUN') this.setMove(0, 5.2);
    if (state === this.legacyState) return;
    this.legacyState = state;
    const map: Partial<Record<CharacterAnimState, () => void>> = {
      ATTACK_1H_SLASH: () => this.attack('right', false),
      ATTACK_1H_OVERHEAD: () => this.attack('up', false),
      ATTACK_2H_CLEAVE: () => this.attack('right', false),
      ATTACK_SPEAR_THRUST: () => this.attack('down', false),
      BLOCK_SHIELD: () => this.block(),
      BLOCK_PARRY: () => this.block(),
      BOW_DRAW: () => this.play('bow_draw', { hold: true }),
      BOW_RELEASE: () => this.release(),
      HIT_STAGGER: () => this.hitReact(),
      FALL_DEFEAT: () => this.fall(),
    };
    map[state]?.();
  }

  // ----------------------------------------------------------------- update

  update(dt: number) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;

    const cls = this.weaponClass;
    const t = this.target;
    t.reset();

    if (this.previewing) {
      this.move.set(0, 0);
      this.combatBlend = this.rig.sheathed ? 0 : 1;
    } else {
      this.move.x = THREE.MathUtils.damp(this.move.x, this.moveTarget.x, 9, dt);
      this.move.y = THREE.MathUtils.damp(this.move.y, this.moveTarget.y, 9, dt);
      const ct = this.rig.sheathed ? 0 : this.combatTarget;
      this.combatBlend = THREE.MathUtils.damp(this.combatBlend, ct, 7, dt);
    }

    this.evalLocomotion(t, dt);
    this.evalStance(t, cls);

    if (this.previewing) {
      const clip = this.previewClip ? COMPILED[cls].get(this.previewClip) : undefined;
      if (clip) {
        const inst = this.makeInstance(clip, false);
        inst.t = THREE.MathUtils.clamp(this.previewTime, 0, clip.def.duration);
        this.applyClip(t, inst, clip.def.additive ? 1 : this.envelope(inst, true));
      }
    } else {
      // Fading (superseded) actions
      for (const f of this.fading) {
        f.fade -= dt / 0.12;
        this.applyClip(t, f, this.envelope(f) * Math.max(0, f.fade));
      }
      this.fading = this.fading.filter((f) => f.fade > 0);

      if (this.action) {
        this.advance(this.action, dt);
        if (this.action) this.applyClip(t, this.action, this.envelope(this.action));
      }
      if (this.additive) {
        this.advance(this.additive, dt);
        if (this.additive) this.applyClip(t, this.additive, 1);
      }
    }

    // Look-forward: keep the head facing the move/aim direction despite torso twist.
    const lf = t.lookForward;
    t.body.head.y -= (t.body.pelvis.y + t.body.torso.y) * lf;
    t.body.head.x -= t.body.torso.x * 0.5 * lf;

    // Bow aiming tilts the upper body with the pitch.
    if (t.bowAim > 0) t.body.torso.x -= this.aimPitch * 0.55 * t.bowAim;

    this.smoothFrame(dt);
    this.applyToRig();
  }

  // ----------------------------------------------------------------- internals

  private makeInstance(clip: CompiledClip, held: boolean, speed = 1): ActionInstance {
    return { clip, t: 0, speed, held, holdTime: 0, fade: 1, fadingOut: false, nextEvent: 0, hitFired: false };
  }

  private envelope(a: ActionInstance, ignoreFadeOut = false): number {
    const d = a.clip.def;
    const firstKey = a.clip.def.keys.length ? Math.min(...a.clip.def.keys.map((k) => k.t)) : 0.1;
    const fi = d.fadeIn ?? Math.max(0.06, firstKey);
    const fo = d.fadeOut ?? 0.2;
    let w = smooth(clamp01(a.t / fi));
    if (!d.endHold && !ignoreFadeOut) w *= smooth(clamp01((d.duration - a.t) / fo));
    return w;
  }

  private advance(a: ActionInstance, dt: number) {
    const d = a.clip.def;
    const prevT = a.t;
    let nt = a.t + dt * a.speed;
    if (a.held && d.holdAt !== undefined && nt >= d.holdAt) {
      if (prevT < d.holdAt) this.emit('hold', d.name);
      nt = d.holdAt;
      a.holdTime += dt;
    }
    a.t = nt;

    // events
    if (d.hitTime !== undefined && !a.hitFired && a.t >= d.hitTime) {
      a.hitFired = true;
      if (a === this.action) this.emit('hit', d.name);
    }
    if (d.events) {
      while (a.nextEvent < d.events.length && a.t >= d.events[a.nextEvent].t) {
        if (a === this.action) this.emit(d.events[a.nextEvent].name, d.name);
        a.nextEvent++;
      }
    }

    if (a.t >= d.duration && !d.endHold) {
      if (a === this.action) {
        this.action = null;
        this.emit('end', d.name);
      } else if (a === this.additive) {
        this.additive = null;
      }
    } else if (a.t >= d.duration) {
      a.t = d.duration;
    }
  }

  private emit(name: string, clip: string) {
    this.onEvent?.(name, clip);
  }

  private evalLocomotion(f: Frame, dt: number) {
    const vx = this.move.x;
    const vz = this.move.y;
    const speed = Math.hypot(vx, vz);
    const walkW = clamp01(speed / 1.4);
    const runW = clamp01((speed - 3.0) / 2.6);
    const stride = THREE.MathUtils.lerp(1.3, 2.4, runW);
    const dirSign = vz < -0.25 * speed ? -1 : 1;
    if (speed > 0.05) this.phase += (speed / stride) * Math.PI * 2 * dt * dirSign;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    const thighA = THREE.MathUtils.lerp(0.42, 0.78, runW) * walkW;
    const kneeA = THREE.MathUtils.lerp(0.75, 1.35, runW) * walkW;
    const kneeBase = 0.06 + 0.22 * runW * walkW;

    // Idle breathing + combat stance (blended out as we start moving)
    const idleW = 1 - walkW;
    const breath = Math.sin(this.time * 2.1) * 0.018;
    const stanceW = this.combatBlend * idleW;

    const b = f.body;
    b.lThigh.set(-thighA * s - 0.04 * idleW - 0.2 * stanceW, 0, 0.05 * idleW + 0.04 * stanceW);
    b.rThigh.set(thighA * s - 0.04 * idleW + 0.12 * stanceW, 0, -0.05 * idleW - 0.04 * stanceW);
    b.lShin.set(kneeBase + kneeA * Math.max(0, c) + 0.06 * idleW + 0.28 * stanceW, 0, 0);
    b.rShin.set(kneeBase + kneeA * Math.max(0, -c) + 0.06 * idleW + 0.2 * stanceW, 0, 0);
    b.lFoot.set(-(b.lThigh.x + b.lShin.x) * 0.7, 0, 0);
    b.rFoot.set(-(b.rThigh.x + b.rShin.x) * 0.7, 0, 0);

    const bobAmp = walkW * (0.025 + 0.045 * runW);
    f.pelvisPos.set(0, -bobAmp * Math.abs(s) + bobAmp * 0.5 - 0.06 * runW - 0.05 * stanceW + breath * 0.5, 0);

    // Strafe: turn hips toward the travel direction, keep the chest forward.
    const strafeYaw = speed > 0.3 ? THREE.MathUtils.clamp(Math.atan2(vx * dirSign, Math.abs(vz) + 0.001), -1.1, 1.1) * 0.6 : 0;
    b.pelvis.set(0.04 * runW, -0.1 * s * walkW + strafeYaw + 0.18 * stanceW, 0);
    b.torso.set(
      0.04 * walkW + 0.16 * runW * (dirSign > 0 ? 1 : -0.4) + breath,
      0.14 * s * walkW - strafeYaw,
      0,
    );
    b.torso.y -= 0.18 * stanceW; // chest stays square while the hips open up
    b.head.set(-breath * 0.5, 0, 0);

    // Relaxed (FK) arm swing — used when no IK target owns the arm.
    const armA = THREE.MathUtils.lerp(0.35, 0.75, runW) * walkW;
    b.lShoulder.set(armA * s, 0, 0.1 + 0.04 * idleW);
    b.rShoulder.set(-armA * s, 0, -0.1 - 0.04 * idleW);
    b.lForearm.set(-0.25 - 0.9 * runW * walkW - Math.max(0, -s) * 0.25 * walkW, 0, 0);
    b.rForearm.set(-0.25 - 0.9 * runW * walkW - Math.max(0, s) * 0.25 * walkW, 0, 0);
  }

  private evalStance(f: Frame, cls: WeaponClass) {
    const st = STANCES[cls];
    const w = this.combatBlend;
    if (w <= 0.001) return;

    if (st.body) {
      for (const j of Object.keys(st.body) as BodyJoint[]) {
        const v = st.body[j]!;
        _v1.set(v[0], v[1], v[2]);
        f.body[j].lerp(_v1, w);
      }
    }
    // Weapon bob while walking keeps held weapons alive without FK swing.
    const speed = Math.hypot(this.move.x, this.move.y);
    const walkW = clamp01(speed / 1.4);
    const bob = Math.sin(this.phase) * 0.035 * walkW;
    const bobY = Math.abs(Math.cos(this.phase)) * 0.02 * walkW;

    if (st.r) {
      f.r.setTarget(st.r, w, DEFAULT_POLE_R);
      f.r.p.z -= bob;
      f.r.p.y += bobY;
    }
    if (st.l) {
      f.l.setTarget(st.l, w, DEFAULT_POLE_L);
      f.l.p.z += bob;
      f.l.p.y += bobY;
    }
    if (st.lGrip !== undefined) {
      f.l.w = w;
      f.l.grip = st.lGrip;
      f.l.pole.copy(DEFAULT_POLE_L);
    }
  }

  private applyClip(f: Frame, a: ActionInstance, w: number) {
    if (w <= 0.0001) return;
    const c = a.clip;
    const t = a.t;
    const additive = !!c.def.additive;

    for (const j of Object.keys(c.body) as BodyJoint[]) {
      if (!sampleV3(c.body[j]!, t, _v1)) continue;
      if (additive) f.body[j].addScaledVector(_v1, w);
      else f.body[j].lerp(_v1, w);
    }
    if (sampleV3(c.pelvisPos, t, _v1)) {
      if (additive) f.pelvisPos.addScaledVector(_v1, w);
      else f.pelvisPos.lerp(_v1.add(_v2.set(0, 0, 0)), w);
    }

    const rw = sampleNum(c.rw, t);
    if (sampleHand(c.r, t, _tmpHand, DEFAULT_POLE_R)) {
      _tmpHand.w = rw ?? 1;
      f.r.blend(_tmpHand, w);
    } else if (rw !== null) {
      f.r.w = THREE.MathUtils.lerp(f.r.w, rw, w);
    }

    const lw = sampleNum(c.lw, t);
    if (sampleHand(c.l, t, _tmpHand2, DEFAULT_POLE_L)) {
      _tmpHand2.w = lw ?? 1;
      f.l.blend(_tmpHand2, w);
    } else if (lw !== null) {
      f.l.w = THREE.MathUtils.lerp(f.l.w, lw, w);
    }

    const aim = samplePiecewise(c.def.bowAim, t);
    if (aim !== null) f.bowAim = THREE.MathUtils.lerp(f.bowAim, aim, w);
    const draw = samplePiecewise(c.def.bowDraw, t);
    if (draw !== null) f.bowDraw = THREE.MathUtils.lerp(f.bowDraw, draw, w);
    if (c.def.kind === 'bow_draw' && w > 0.5) f.nocked = true;
    if (c.def.stringReleased && w > 0.01) f.nocked = false;
    if (c.def.lookForward !== undefined) f.lookForward = THREE.MathUtils.lerp(f.lookForward, c.def.lookForward, w);
  }

  private smoothFrame(dt: number) {
    const t = this.target;
    const c = this.current;
    const snap = !this.initialized || this.previewing;
    this.initialized = true;
    const rateBody = 20;
    const rateHand = 28;
    const kb = snap ? 1 : 1 - Math.exp(-rateBody * dt);
    const kh = snap ? 1 : 1 - Math.exp(-rateHand * dt);

    for (const j of BODY_JOINTS) c.body[j].lerp(t.body[j], kb);
    c.pelvisPos.lerp(t.pelvisPos, kb);
    c.lookForward = t.lookForward;
    c.bowAim = t.bowAim;
    c.bowDraw = t.bowDraw;
    c.nocked = t.nocked;

    for (const side of ['r', 'l'] as const) {
      const th = t[side];
      const ch = c[side];
      const wasOff = ch.w < 0.01 || (ch.grip === null) !== (th.grip === null);
      ch.grip = th.grip;
      ch.axis = th.axis;
      if (snap || wasOff) {
        ch.p.copy(th.p);
        ch.z.copy(th.z);
        ch.hint.copy(th.hint);
        ch.pole.copy(th.pole);
      } else {
        ch.p.lerp(th.p, kh);
        ch.z.lerp(th.z, kh).normalize();
        if (th.hint.lengthSq() === 0 || ch.hint.lengthSq() === 0) ch.hint.copy(th.hint);
        else ch.hint.lerp(th.hint, kh).normalize();
        ch.pole.lerp(th.pole, kh).normalize();
      }
      ch.w = snap ? th.w : THREE.MathUtils.lerp(ch.w, th.w, 1 - Math.exp(-16 * dt));
    }
  }

  private applyToRig() {
    const rig = this.rig;
    const c = this.current;
    for (const j of BODY_JOINTS) {
      const v = c.body[j];
      this.jointMap[j].rotation.set(v.x, v.y, v.z);
    }
    rig.leftUpperArm.rotation.set(0, 0, 0);
    rig.rightUpperArm.rotation.set(0, 0, 0);
    rig.pelvis.position.set(c.pelvisPos.x, 0.98 + c.pelvisPos.y, c.pelvisPos.z);

    rig.root.updateMatrixWorld(true);
    const rootQ = rig.root.getWorldQuaternion(_q1);

    const bow = rig.bow;
    const aim = bow ? c.bowAim : 0;

    // ---- Left hand first when aiming a bow (the draw hand depends on the bow position)
    if (bow && aim > 0.001) {
      this.solveBowArm(aim, rootQ);
      this.solveHand('r', rootQ, aim);
    } else {
      this.solveHand('r', rootQ, 0);
      this.solveHand('l', rootQ, 0);
    }

    if (bow) this.updateBowString(bow, aim);
  }

  /** Solves one arm from the smoothed frame. `drawOverride` is only used by the bow draw hand. */
  private solveHand(side: 'r' | 'l', rootQ: THREE.Quaternion, drawOverride: number) {
    const rig = this.rig;
    const c = this.current;
    const hs = c[side];
    const chain = this.chains[side];

    let w = hs.w;
    const target = _v1;
    const zDir = _v2;
    const hint = _v3;
    let axis: 'x' | 'y' = hs.axis;
    const pole = _v4.copy(hs.pole).applyQuaternion(rootQ);

    if (side === 'l' && hs.grip !== null && rig.mainHandItem && !rig.sheathed) {
      // Off-hand follows the main weapon grip.
      rig.rightHand.updateWorldMatrix(true, false);
      target.set(0, 0, hs.grip);
      rig.rightHand.localToWorld(target);
      zDir.set(0, 0, 1).transformDirection(rig.rightHand.matrixWorld);
      hint.set(0, 1, 0).transformDirection(rig.rightHand.matrixWorld);
      axis = 'y';
    } else if (side === 'l' && hs.grip !== null) {
      w = 0; // nothing to grip
    } else {
      target.copy(hs.p);
      rig.root.localToWorld(target);
      zDir.copy(hs.z).applyQuaternion(rootQ);
      if (hs.hint.lengthSq() > 0) hint.copy(hs.hint).applyQuaternion(rootQ);
      else hint.set(0, 0, 0);
    }

    // Bow draw hand: anchor between the string rest and the chin.
    if (side === 'r' && drawOverride > 0 && rig.bow) {
      const bow = rig.bow;
      const nockRest = _vb1.copy(bow.restNock);
      bow.group.localToWorld(nockRest);
      const anchor = _vb2.set(-0.07, 0.07, 0.08);
      rig.head.localToWorld(anchor);
      const d = c.bowDraw;
      // hand origin sits a bit behind the fist center
      _vb3.lerpVectors(nockRest, anchor, Math.min(1.1, d));
      target.lerp(_vb3, drawOverride);
      zDir.lerp(this.aimDirWorld(rootQ, _vb4), drawOverride).normalize();
      pole.lerp(_vb4.set(-1, -0.1, -0.3).applyQuaternion(rootQ), drawOverride).normalize();
      if (hs.w < drawOverride) hint.set(0, 0, 0);
      w = Math.max(w, drawOverride);
    }

    if (w <= 0.001) return;
    if (hint.lengthSq() === 0) {
      // default: hand +Y points back toward the elbow
      chain.shoulder.updateWorldMatrix(true, false);
      chain.shoulder.getWorldPosition(hint);
      hint.subVectors(hint, target).normalize();
      axis = 'y';
    }

    solveTwoBoneIK(chain, target, pole, w);
    chain.shoulder.updateMatrixWorld(true);
    orientHand(chain.hand, zDir, hint, axis, w);
    chain.hand.updateMatrixWorld(true);
  }

  private aimDirWorld(rootQ: THREE.Quaternion, out: THREE.Vector3) {
    return out.set(0, Math.sin(this.aimPitch), Math.cos(this.aimPitch)).applyQuaternion(rootQ).normalize();
  }

  private solveBowArm(aim: number, rootQ: THREE.Quaternion) {
    const rig = this.rig;
    const c = this.current;
    const chain = this.chains.l;
    const hs = c.l;

    // Blend from the stance target to the aim target.
    const shoulderW = _vb1;
    rig.leftShoulder.getWorldPosition(shoulderW);
    const aimDir = this.aimDirWorld(rootQ, _vb2);
    const aimTarget = _vb3.copy(shoulderW).addScaledVector(aimDir, 0.5);
    const upW = _vb4.set(0, 1, 0).applyQuaternion(rootQ);
    // limbs (+Z) perpendicular to the aim, canted a little like a horse archer
    const limbs = _vb5.copy(upW).addScaledVector(aimDir, -upW.dot(aimDir)).normalize();
    _vb6.crossVectors(aimDir, limbs).normalize();
    limbs.addScaledVector(_vb6, -0.18).normalize();

    const target = _v1.copy(hs.p);
    rig.root.localToWorld(target);
    target.lerp(aimTarget, aim);
    const zDir = _v2.copy(hs.z).applyQuaternion(rootQ).lerp(limbs, aim).normalize();
    const hint = _v3.copy(hs.hint.lengthSq() > 0 ? hs.hint : _vb7.set(0, 0, -1)).applyQuaternion(rootQ);
    hint.lerp(_vb7.copy(aimDir).negate(), aim).normalize();
    const pole = _v4.set(0.6, -0.8, -0.1).applyQuaternion(rootQ);
    const w = Math.max(hs.w, aim);

    solveTwoBoneIK(chain, target, pole, w);
    chain.shoulder.updateMatrixWorld(true);
    orientHand(chain.hand, zDir, hint, 'y', w);
    chain.hand.updateMatrixWorld(true);
  }

  private updateBowString(bow: NonNullable<CharacterRig['bow']>, aim: number) {
    const c = this.current;
    const pos = bow.stringGeo.attributes.position as THREE.BufferAttribute;
    const nocked = c.nocked && aim > 0.3;
    const drawn = aim > 0.3 && c.bowDraw > 0.02 && c.nocked;

    if (drawn) {
      // String follows the draw hand's fist.
      this.rig.rightHand.updateWorldMatrix(true, false);
      _vb1.set(0, -0.05, 0.0);
      this.rig.rightHand.localToWorld(_vb1);
      bow.group.updateWorldMatrix(true, false);
      bow.group.worldToLocal(_vb1);
      _vb1.x = 0;
      _vb1.z = THREE.MathUtils.clamp(_vb1.z, -0.1, 0.1);
      _vb1.y = Math.max(_vb1.y, bow.restNock.y);
      pos.setXYZ(1, _vb1.x, _vb1.y, _vb1.z);
    } else {
      pos.setXYZ(1, bow.restNock.x, bow.restNock.y, bow.restNock.z);
      _vb1.copy(bow.restNock);
    }
    pos.needsUpdate = true;

    const arrow = bow.nockedArrow;
    arrow.visible = nocked;
    if (nocked) {
      const nock = _vb1;
      const dir = _vb2.subVectors(bow.arrowRest, nock).normalize();
      arrow.position.copy(nock).addScaledVector(dir, 0.37);
      arrow.quaternion.setFromUnitVectors(_vb3.set(0, 0, 1), dir);
    }
  }

  /** World-space launch point and direction of the nocked arrow. */
  getArrowLaunch(outPos: THREE.Vector3, outDir: THREE.Vector3): boolean {
    const bow = this.rig.bow;
    if (!bow) return false;
    bow.nockedArrow.updateWorldMatrix(true, false);
    bow.nockedArrow.getWorldPosition(outPos);
    outDir.set(0, 0, 1).transformDirection(bow.nockedArrow.matrixWorld);
    return true;
  }
}

const _vb1 = new THREE.Vector3();
const _vb2 = new THREE.Vector3();
const _vb3 = new THREE.Vector3();
const _vb4 = new THREE.Vector3();
const _vb5 = new THREE.Vector3();
const _vb6 = new THREE.Vector3();
const _vb7 = new THREE.Vector3();
