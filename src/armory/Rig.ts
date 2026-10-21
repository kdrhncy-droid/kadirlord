/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Rig.ts
 *  Prosedürel eklem (joint) hiyerarşisi + animasyon sistemi.
 *
 *  YAKLAŞIM: SkinnedMesh / vertex weights yerine PIVOT HİYERARŞİSİ.
 *  Her geometri parçası ait olduğu eklemin Object3D düğümüne bağlanır;
 *  pivot tam olarak dönme merkezinde durur (Bölüm 1 / madde 2).
 *
 *  Neden?
 *   · Düşük poligonda skinning'in yumuşatma kazancı ihmal edilebilir,
 *     fasetli (flat-shaded) estetik zaten keskin kırılım ister.
 *   · CPU maliyeti yok: bone matrisleri + skin attribute'ları taşınmaz.
 *   · InstancedMesh ile %100 uyumlu: poz "bake" edilip merged geometri
 *     olarak çoğaltılabilir (Army.ts bu yolu kullanır → 500v500).
 *   · Aynı hiyerarşiden istenirse gerçek THREE.Skeleton da export edilir
 *     (toSkeleton()) → React Three Fiber / glTF export senaryoları için.
 *
 *  ÖLÇEK: İnsan 1.80 m, zemin y = 0, tüm ofsetler metre.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { DEG, TAU, clamp, lerp } from './Core.ts';

/* ─────────────────────────── tipler ─────────────────────────── */

/** Eklem adı → derece cinsinden Euler rotasyonu (XYZ sırası). */
export type Pose = Record<string, [number, number, number]>;

export interface JointDef {
  name: string;
  parent: string | null;
  /** Eklemin üst (parent) uzayındaki konumu — tam dönme merkezi. */
  offset: [number, number, number];
  /** Dinlenme pozundaki sabit rotasyon (derece). */
  rest?: [number, number, number];
}

export interface RigContext {
  /** Yürüyüş hızı çarpanı (0 = duruyor, 1 = yürüme, 2 = koşu). */
  speed: number;
  /** Birim fazı (0..1) — kalabalıkta senkronizasyonu kırmak için. */
  phase: number;
  /** Rastgele varyasyon tohumu. */
  seed: number;
  /** Saldırı şiddeti (0..1). */
  power: number;
  /** Sağ/sol el tercihi. */
  handedness: 1 | -1;
  /** Binekli mi? (at üstü poz farklıdır) */
  mounted: boolean;
}

export type ClipFn = (t: number, ctx: RigContext) => Pose;

/* ─────────────────────────── insan oranları (1.80 m) ─────────────────────────── */

export const HUMANOID: Record<string, number> = {
  height: 1.8,
  pelvisY: 0.94,
  spineLen: 0.19,
  chestLen: 0.22,
  neckY: 1.47,
  headY: 1.63,
  shoulderX: 0.185,
  shoulderY: 1.435,
  upperArm: 0.285,
  forearm: 0.265,
  hand: 0.1,
  hipX: 0.105,
  thigh: 0.42,
  shin: 0.41,
  footLen: 0.24,
  ankleY: 0.085,
};

/** Standart insan iskeleti — 19 eklem, hepsi doğru pivot noktalarında. */
export function humanoidJoints(scale = 1): JointDef[] {
  const H = (k: keyof typeof HUMANOID): number => HUMANOID[k] * scale;
  return [
    { name: 'root', parent: null, offset: [0, 0, 0] },
    { name: 'pelvis', parent: 'root', offset: [0, H('pelvisY'), 0] },
    { name: 'spine', parent: 'pelvis', offset: [0, H('spineLen') * 0.55, 0] },
    { name: 'chest', parent: 'spine', offset: [0, H('spineLen') * 0.45 + H('chestLen') * 0.5, 0] },
    { name: 'neck', parent: 'chest', offset: [0, H('chestLen') * 0.5 + 0.06, 0] },
    { name: 'head', parent: 'neck', offset: [0, 0.1, 0] },

    { name: 'shoulderL', parent: 'chest', offset: [-H('shoulderX'), H('chestLen') * 0.32, 0] },
    { name: 'upperArmL', parent: 'shoulderL', offset: [-0.055, -0.02, 0] },
    { name: 'forearmL', parent: 'upperArmL', offset: [0, -H('upperArm'), 0] },
    { name: 'handL', parent: 'forearmL', offset: [0, -H('forearm'), 0] },
    { name: 'weaponL', parent: 'handL', offset: [0, -0.035, 0.01] },

    { name: 'shoulderR', parent: 'chest', offset: [H('shoulderX'), H('chestLen') * 0.32, 0] },
    { name: 'upperArmR', parent: 'shoulderR', offset: [0.055, -0.02, 0] },
    { name: 'forearmR', parent: 'upperArmR', offset: [0, -H('upperArm'), 0] },
    { name: 'handR', parent: 'forearmR', offset: [0, -H('forearm'), 0] },
    { name: 'weaponR', parent: 'handR', offset: [0, -0.035, 0.01] },

    { name: 'thighL', parent: 'pelvis', offset: [-H('hipX'), -0.02, 0] },
    { name: 'shinL', parent: 'thighL', offset: [0, -H('thigh'), 0] },
    { name: 'footL', parent: 'shinL', offset: [0, -H('shin'), 0] },

    { name: 'thighR', parent: 'pelvis', offset: [H('hipX'), -0.02, 0] },
    { name: 'shinR', parent: 'thighR', offset: [0, -H('thigh'), 0] },
    { name: 'footR', parent: 'shinR', offset: [0, -H('shin'), 0] },
  ];
}

/** At iskeleti — 4 bacak × 3 eklem + boyun + kafa + kuyruk. */
export const HORSE_PROPORTIONS: Record<string, number> = {
  bodyY: 1.34,
  bodyLen: 1.62,
  chestX: 0.3,
  neckLen: 0.66,
  headLen: 0.52,
  shoulderY: 1.3,
  hipY: 1.28,
  upperLeg: 0.5,
  cannon: 0.44,
  hoof: 0.14,
  frontLegX: 0.52,
  hindLegX: -0.62,
  legSpread: 0.16,
  tailLen: 0.72,
};

export function horseJoints(scale = 1, props: Record<string, number> = HORSE_PROPORTIONS): JointDef[] {
  const P = (k: keyof typeof HORSE_PROPORTIONS): number => props[k] * scale;
  const legs: JointDef[] = [];
  const legDefs: [string, number, number][] = [
    ['frontL', P('frontLegX'), P('legSpread')],
    ['frontR', P('frontLegX'), -P('legSpread')],
    ['hindL', P('hindLegX'), P('legSpread')],
    ['hindR', P('hindLegX'), -P('legSpread')],
  ];
  for (const [name, x, z] of legDefs) {
    const isHind = name.startsWith('hind');
    legs.push(
      { name: `${name}Thigh`, parent: 'body', offset: [x, isHind ? 0.12 : -0.02, z] },
      { name: `${name}Cannon`, parent: `${name}Thigh`, offset: [0, -P('upperLeg'), 0] },
      { name: `${name}Hoof`, parent: `${name}Cannon`, offset: [0, -P('cannon'), 0] },
    );
  }
  return [
    { name: 'root', parent: null, offset: [0, 0, 0] },
    { name: 'body', parent: 'root', offset: [0, P('bodyY'), 0] },
    { name: 'chest', parent: 'body', offset: [P('bodyLen') * 0.36, 0.1, 0] },
    { name: 'neck', parent: 'chest', offset: [0.16, 0.14, 0], rest: [0, 0, 42] },
    { name: 'head', parent: 'neck', offset: [P('neckLen'), 0, 0], rest: [0, 0, -34] },
    { name: 'jaw', parent: 'head', offset: [P('headLen') * 0.55, -0.07, 0] },
    { name: 'earL', parent: 'head', offset: [P('headLen') * 0.18, 0.1, 0.06] },
    { name: 'earR', parent: 'head', offset: [P('headLen') * 0.18, 0.1, -0.06] },
    { name: 'tail', parent: 'body', offset: [-P('bodyLen') * 0.48, 0.16, 0], rest: [0, 0, 138] },
    ...legs,
  ];
}

/* ─────────────────────────── Rig sınıfı ─────────────────────────── */

export class Rig {
  readonly root = new THREE.Object3D();
  readonly joints = new Map<string, THREE.Object3D>();
  readonly defs: JointDef[];
  private restQuat = new Map<string, THREE.Quaternion>();

  constructor(defs: JointDef[] = humanoidJoints()) {
    this.defs = defs;
    this.root.name = 'rigRoot';
    for (const def of defs) {
      const node = new THREE.Object3D();
      node.name = def.name;
      node.position.set(def.offset[0], def.offset[1], def.offset[2]);
      if (def.rest) node.rotation.set(def.rest[0] * DEG, def.rest[1] * DEG, def.rest[2] * DEG);
      const parent = def.parent ? this.joints.get(def.parent) : undefined;
      if (def.parent && !parent) throw new Error(`[Bannerforge] Rig: "${def.name}" bilinmeyen ebeveyne bağlı: ${def.parent}`);
      (parent ?? this.root).add(node);
      this.joints.set(def.name, node);
      this.restQuat.set(def.name, node.quaternion.clone());
    }
  }

  joint(name: string): THREE.Object3D {
    const j = this.joints.get(name);
    if (!j) throw new Error(`[Bannerforge] Rig: eklem bulunamadı → "${name}"`);
    return j;
  }

  has(name: string): boolean {
    return this.joints.has(name);
  }

  /** Bir geometri/mesh'i ekleme bağlar (eklem uzayında ofsetle). */
  attach(jointName: string, child: THREE.Object3D, offset?: [number, number, number], rotation?: [number, number, number]): THREE.Object3D {
    const j = this.joint(jointName);
    if (offset) child.position.set(offset[0], offset[1], offset[2]);
    if (rotation) child.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG);
    j.add(child);
    return child;
  }

  /** Pozu uygula (derece). Verilmeyen eklemler dinlenme pozuna döner. */
  applyPose(pose: Pose, immediate = true): void {
    for (const def of this.defs) {
      const node = this.joints.get(def.name)!;
      const rest = this.restQuat.get(def.name)!;
      const p = pose[def.name];
      if (!p) {
        if (immediate) node.quaternion.copy(rest);
        continue;
      }
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p[0] * DEG, p[1] * DEG, p[2] * DEG, 'XYZ'));
      q.premultiply(rest);
      if (immediate) node.quaternion.copy(q);
      else node.quaternion.slerp(q, 0.35);
    }
  }

  /** İki poz arasında karışım üretir. */
  static blend(a: Pose, b: Pose, t: number): Pose {
    const out: Pose = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach((k) => {
      const A = a[k] ?? [0, 0, 0];
      const B = b[k] ?? [0, 0, 0];
      out[k] = [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
    });
    return out;
  }

  /** Pozları toplar (ör. yürüyüş + üst gövde saldırısı). */
  static add(base: Pose, layer: Pose, weight = 1): Pose {
    const out: Pose = { ...base };
    for (const k of Object.keys(layer)) {
      const L = layer[k];
      const B = out[k] ?? [0, 0, 0];
      out[k] = [B[0] + L[0] * weight, B[1] + L[1] * weight, B[2] + L[2] * weight];
    }
    return out;
  }

  /** Eklem uzayındaki rotasyonları kök uzayına "bake" eder (instancing için). */
  bakeJointWorldMatrices(): Map<string, THREE.Matrix4> {
    this.root.updateMatrixWorld(true);
    const out = new Map<string, THREE.Matrix4>();
    this.joints.forEach((node, name) => out.set(name, node.matrixWorld.clone()));
    return out;
  }

  /**
   * Gerçek THREE.Skeleton export'u: aynı hiyerarşiden Bone ağacı üretir.
   * SkinnedMesh / glTF export isteyen projeler için opsiyonel yol.
   */
  exportSkeleton(): { bones: THREE.Bone[]; skeleton: THREE.Skeleton; boneByName: Map<string, THREE.Bone> } {
    const boneByName = new Map<string, THREE.Bone>();
    const bones: THREE.Bone[] = [];
    for (const def of this.defs) {
      const bone = new THREE.Bone();
      bone.name = def.name;
      bone.position.set(def.offset[0], def.offset[1], def.offset[2]);
      if (def.rest) bone.rotation.set(def.rest[0] * DEG, def.rest[1] * DEG, def.rest[2] * DEG);
      boneByName.set(def.name, bone);
      bones.push(bone);
    }
    for (const def of this.defs) {
      const bone = boneByName.get(def.name)!;
      const parent = def.parent ? boneByName.get(def.parent) : null;
      if (parent) parent.add(bone);
    }
    return { bones, skeleton: new THREE.Skeleton(bones), boneByName };
  }

  /** Eklem dünya konumları (silah tutturma, IK, nişan alma için). */
  jointWorldPosition(name: string, target = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.joint(name).getWorldPosition(target);
  }

  dispose(): void {
    this.joints.clear();
    this.restQuat.clear();
    this.root.clear();
  }
}

/* ─────────────────────────── prosedürel animasyon klipleri ─────────────────────────── */

/** Kolay okunabilirlik için derece cinsinden pose kaydı. */
function pose(entries: [string, number, number, number][]): Pose {
  const p: Pose = {};
  for (const [k, x, y, z] of entries) p[k] = [x, y, z];
  return p;
}

const sin = Math.sin;
const cos = Math.cos;

export const ANIMATION_CLIPS: Record<string, ClipFn> = {
  /* ── BEKLEME: nefes, ağırlık kayması, silahın hafif salınımı ── */
  idle: (t, ctx) => {
    const b = t * 1.5 + ctx.phase * TAU;
    const sway = sin(t * 0.55 + ctx.phase * TAU) * 2.2;
    return pose([
      ['root', 0, sway * 0.4, 0],
      ['pelvis', 0, sway * 0.3, sway * 0.35],
      ['spine', sin(b) * 1.1, 0, -sway * 0.2],
      ['chest', sin(b) * 1.6 + 1.5, 0, sway * 0.15],
      ['neck', -sin(b) * 0.9, sway * 0.25, 0],
      ['head', sin(b * 0.7) * 2.4, sway * 0.6, 0],
      ['shoulderL', 0, 0, -2],
      ['upperArmL', 6 + sin(b) * 1.4, 0, 9],
      ['forearmL', -16 + sin(b + 0.6) * 2.2, 0, 0],
      ['handL', 0, 0, 0],
      ['shoulderR', 0, 0, 2],
      ['upperArmR', 6 - sin(b) * 1.4, 0, -9],
      ['forearmR', -16 - sin(b + 0.6) * 2.2, 0, 0],
      ['handR', 0, 0, 0],
      ['thighL', 2 + sway * 0.2, 0, 0],
      ['shinL', -3, 0, 0],
      ['footL', 1, 0, 0],
      ['thighR', 2 - sway * 0.2, 0, 0],
      ['shinR', -3, 0, 0],
      ['footR', 1, 0, 0],
    ]);
  },

  /* ── HAZIROL / SANCAK DİKİLİ BEKLEME ── */
  ready: (t, ctx) => {
    const b = t * 1.9 + ctx.phase * TAU;
    return pose([
      ['root', 0, 0, 0],
      ['pelvis', 0, 0, 0],
      ['spine', -2 + sin(b) * 0.7, 0, 0],
      ['chest', -3 + sin(b) * 0.9, 0, 0],
      ['neck', 2, 0, 0],
      ['head', 0, sin(b * 0.4) * 4, 0],
      ['upperArmL', -14, 0, 16],
      ['forearmL', -62, 0, -8],
      ['handL', 0, 0, 10],
      ['upperArmR', -8, 0, -14],
      ['forearmR', -30, 0, 6],
      ['handR', 0, 0, -8],
      ['thighL', 4, 0, 2],
      ['shinL', -6, 0, 0],
      ['footL', 2, 0, 0],
      ['thighR', 4, 0, -2],
      ['shinR', -6, 0, 0],
      ['footR', 2, 0, 0],
    ]);
  },

  /* ── YÜRÜYÜŞ / KOŞU / HÜCUM (speed çarpanı ile tek klip) ── */
  walk: (t, ctx) => {
    const spd = clamp(ctx.speed, 0.15, 3);
    const freq = 1.9 + spd * 1.55;
    const amp = 16 + spd * 12.5;
    const p = t * freq + ctx.phase * TAU;
    const lean = clamp((spd - 1) * 7, 0, 22);
    const lift = clamp((spd - 1) * 0.035, 0, 0.09);
    const bob = sin(p * 2) * (0.012 + spd * 0.012);
    const armAmp = amp * (0.62 - clamp(spd - 1, 0, 1) * 0.3);

    return pose([
      ['root', 0, sin(p) * 2.2, 0],
      ['pelvis', 0, -sin(p) * 3.4, cos(p) * 2.6],
      ['spine', lean * 0.35, sin(p) * 1.6, -cos(p) * 1.8],
      ['chest', lean * 0.5, -sin(p) * 2.6, cos(p) * 2.4],
      ['neck', -lean * 0.4, 0, 0],
      ['head', -lean * 0.25 + sin(p * 2) * 1.2, -sin(p) * 1.6, 0],

      ['shoulderL', 0, 0, -3 - lean * 0.1],
      ['upperArmL', -sin(p) * armAmp - 4 - lean * 0.4, 0, 8 + lean * 0.15],
      ['forearmL', -18 - Math.max(0, sin(p)) * armAmp * 0.9 - lean * 0.5, 0, 0],
      ['handL', 0, 0, 0],
      ['shoulderR', 0, 0, 3 + lean * 0.1],
      ['upperArmR', sin(p) * armAmp - 4 - lean * 0.4, 0, -8 - lean * 0.15],
      ['forearmR', -18 - Math.max(0, -sin(p)) * armAmp * 0.9 - lean * 0.5, 0, 0],
      ['handR', 0, 0, 0],

      ['thighL', sin(p) * amp, 0, 2],
      ['shinL', -Math.max(0, -sin(p - 0.75)) * amp * 1.5 - 4, 0, 0],
      ['footL', -sin(p + 0.5) * amp * 0.35 + lean * 0.15, 0, 0],
      ['thighR', sin(p + Math.PI) * amp, 0, -2],
      ['shinR', -Math.max(0, -sin(p + Math.PI - 0.75)) * amp * 1.5 - 4, 0, 0],
      ['footR', -sin(p + Math.PI + 0.5) * amp * 0.35 + lean * 0.15, 0, 0],
    ]);
  },

  /* ── KILIÇ SALDIRISI: kaldır → savur → toparla ── */
  attackSword: (t, ctx) => {
    const cycle = 1.5;
    const u = (t % cycle) / cycle;
    const pow = clamp(ctx.power, 0.4, 1.4);
    const h = ctx.handedness;
    // 0.00-0.34 windup · 0.34-0.50 vuruş · 0.50-1.00 toparlanma
    let swing: number;
    let wind: number;
    if (u < 0.34) {
      const k = u / 0.34;
      wind = smoothRig(k) * 1;
      swing = 0;
    } else if (u < 0.5) {
      const k = (u - 0.34) / 0.16;
      wind = 1 - smoothRig(k);
      swing = smoothRig(k * 1.08);
    } else {
      const k = (u - 0.5) / 0.5;
      wind = 0;
      swing = 1 - smoothRig(k);
    }
    const W = 118 * pow, S = 168 * pow;
    return pose([
      ['root', 0, lerp(-14, 22, swing) * h * wind + lerp(-14, 22, swing) * h * (1 - wind) * 0.6, 0],
      ['pelvis', 0, lerp(-16 * h, 20 * h, swing), 0],
      ['spine', lerp(6, -12, swing), lerp(-10 * h, 12 * h, swing), 0],
      ['chest', lerp(10, -16, swing) + wind * 6, lerp(-14 * h, 18 * h, swing), lerp(4 * h, -6 * h, swing)],
      ['neck', -4 + wind * 4, lerp(8 * h, -8 * h, swing), 0],
      ['head', 0, lerp(10 * h, -12 * h, swing), 0],
      ['shoulderR', 0, 0, wind * -10 * h],
      ['upperArmR', lerp(-8, -125, wind) + lerp(0, 118, swing), lerp(0, -34 * h, wind) + lerp(0, 26 * h, swing), -14 * h],
      ['forearmR', lerp(-24, -76, wind) + lerp(0, 62, swing), 0, lerp(0, 16 * h, swing)],
      ['handR', 0, lerp(0, -24 * h, swing), lerp(0, 18, wind)],
      ['upperArmL', lerp(8, -34, wind) + lerp(0, 40, swing), 0, lerp(12, 26, wind) * h],
      ['forearmL', lerp(-20, -54, wind) + lerp(0, 34, swing), 0, 0],
      ['thighL', lerp(6, 22, swing), 0, 0],
      ['shinL', lerp(-8, -26, swing), 0, 0],
      ['thighR', lerp(6, -12, swing), 0, 0],
      ['shinR', lerp(-8, -6, swing), 0, 0],
    ]);
  },

  /* ── MIZRAK / KARGI SAPLAMA ── */
  attackThrust: (t, ctx) => {
    const cycle = 1.85;
    const u = (t % cycle) / cycle;
    const pow = clamp(ctx.power, 0.4, 1.4);
    const h = ctx.handedness;
    let pull: number, thrust: number;
    if (u < 0.42) {
      pull = smoothRig(u / 0.42);
      thrust = 0;
    } else if (u < 0.58) {
      const k = (u - 0.42) / 0.16;
      pull = 1 - smoothRig(k);
      thrust = smoothRig(k);
    } else {
      pull = 0;
      thrust = 1 - smoothRig((u - 0.58) / 0.42);
    }
    return pose([
      ['root', 0, lerp(-8, 6, thrust) * h, 0],
      ['pelvis', 0, lerp(-12, 14, thrust) * h, 0],
      ['spine', lerp(4, -10, thrust), lerp(-8, 10, thrust) * h, 0],
      ['chest', lerp(6, -14, thrust) * pow, lerp(-10, 12, thrust) * h, 0],
      ['neck', 2, lerp(6, -6, thrust) * h, 0],
      ['head', 0, lerp(6, -6, thrust) * h, 0],
      ['upperArmR', lerp(-72, -96, thrust), lerp(18 * h, -8 * h, thrust), lerp(-24, -14, thrust) * h],
      ['forearmR', lerp(-34, -12, thrust), 0, 0],
      ['handR', 0, lerp(-20, 0, thrust) * h, 0],
      ['upperArmL', lerp(-62, -88, thrust), lerp(-24 * h, -10 * h, thrust), lerp(18, 10, thrust) * h],
      ['forearmL', lerp(-46, -16, thrust), 0, 0],
      ['handL', 0, lerp(16, 0, thrust) * h, 0],
      ['thighL', lerp(8, 26, thrust), 0, 0],
      ['shinL', lerp(-10, -34, thrust), 0, 0],
      ['thighR', lerp(6, -16, thrust), 0, 0],
      ['shinR', lerp(-8, -4, thrust), 0, 0],
    ]);
  },

  /* ── BALTA SAVURMA (ağır, yavaş, gövde dönüşü yüksek) ── */
  attackAxe: (t, ctx) => {
    const cycle = 2.1;
    const u = (t % cycle) / cycle;
    const pow = clamp(ctx.power, 0.4, 1.4);
    const h = ctx.handedness;
    let wind: number, swing: number;
    if (u < 0.44) {
      wind = smoothRig(u / 0.44);
      swing = 0;
    } else if (u < 0.6) {
      const k = (u - 0.44) / 0.16;
      wind = 1 - smoothRig(k);
      swing = smoothRig(k);
    } else {
      wind = 0;
      swing = 1 - smoothRig((u - 0.6) / 0.4);
    }
    return pose([
      ['root', 0, lerp(-26, 34, swing) * h, 0],
      ['pelvis', 0, lerp(-22, 28, swing) * h, lerp(0, -6, swing)],
      ['spine', lerp(8, -18, swing), lerp(-16, 20, swing) * h, 0],
      ['chest', lerp(14, -24, swing) * pow, lerp(-20, 26, swing) * h, lerp(6 * h, -10 * h, swing)],
      ['neck', -6 + wind * 8, lerp(10, -10, swing) * h, 0],
      ['head', 0, lerp(12, -14, swing) * h, 0],
      ['upperArmR', lerp(-10, -158, wind) + lerp(0, 152, swing), lerp(0, -44 * h, wind), lerp(-16, -30, swing) * h],
      ['forearmR', lerp(-18, -84, wind) + lerp(0, 74, swing), 0, 0],
      ['handR', 0, 0, lerp(0, 24, wind)],
      ['upperArmL', lerp(-14, -142, wind) + lerp(0, 132, swing), lerp(0, -30 * h, wind), lerp(14, 22, swing) * h],
      ['forearmL', lerp(-24, -70, wind) + lerp(0, 60, swing), 0, 0],
      ['handL', 0, 0, 0],
      ['thighL', lerp(10, 30, swing), 0, 0],
      ['shinL', lerp(-12, -40, swing), 0, 0],
      ['footL', lerp(2, 10, swing), 0, 0],
      ['thighR', lerp(8, -20, swing), 0, 0],
      ['shinR', lerp(-10, -8, swing), 0, 0],
    ]);
  },

  /* ── KALKAN BLOK / KALKANLA İTME ── */
  block: (t, ctx) => {
    const b = t * 2.1 + ctx.phase * TAU;
    const brace = 0.5 + 0.5 * sin(t * 1.1);
    return pose([
      ['root', 0, 12 * ctx.handedness, 0],
      ['pelvis', 0, 10 * ctx.handedness, 0],
      ['spine', 8, 6 * ctx.handedness, 0],
      ['chest', 10 + brace * 3, 8 * ctx.handedness, 0],
      ['neck', -6, -6 * ctx.handedness, 0],
      ['head', -2, -8 * ctx.handedness, 0],
      ['upperArmL', -46 - brace * 8, 26 * ctx.handedness, 34 * ctx.handedness],
      ['forearmL', -92 - brace * 10, 0, 12 * ctx.handedness],
      ['handL', 0, 0, -18 * ctx.handedness],
      ['upperArmR', -24 - sin(b) * 4, -14 * ctx.handedness, -22 * ctx.handedness],
      ['forearmR', -48, 0, 0],
      ['handR', 0, 0, 0],
      ['thighL', 18, 0, 4],
      ['shinL', -26, 0, 0],
      ['footL', 8, 0, 0],
      ['thighR', 8, 0, -6],
      ['shinR', -14, 0, 0],
      ['footR', 6, 0, 0],
    ]);
  },

  /* ── YAY ÇEKME: kaldır → çek → bırak → yeniden kur ── */
  shootBow: (t, ctx) => {
    const cycle = 2.6;
    const u = (t % cycle) / cycle;
    const h = ctx.handedness;
    let raise: number, draw: number, loose: number;
    if (u < 0.3) {
      raise = smoothRig(u / 0.3);
      draw = 0;
      loose = 0;
    } else if (u < 0.62) {
      raise = 1;
      draw = smoothRig((u - 0.3) / 0.32);
      loose = 0;
    } else if (u < 0.7) {
      raise = 1;
      draw = 1 - smoothRig((u - 0.62) / 0.08);
      loose = 1;
    } else {
      raise = 1 - smoothRig((u - 0.7) / 0.3);
      draw = 0;
      loose = 0;
    }
    const shake = draw > 0.85 ? sin(t * 34) * 1.1 * (draw - 0.85) * 6 : 0;
    return pose([
      ['root', 0, lerp(0, -18 * h, raise), 0],
      ['pelvis', 0, lerp(0, -14 * h, raise), 0],
      ['spine', lerp(0, -4, raise), lerp(0, 10 * h, raise * (1 - draw * 0.4)), 0],
      ['chest', lerp(0, -6, raise), lerp(0, 14 * h, raise), 0],
      ['neck', 0, lerp(0, -12 * h, raise), 0],
      ['head', 0 + shake, lerp(0, -16 * h, raise) + shake, lerp(0, -12 * h, raise)],
      // yay kolu: öne uzanır
      ['upperArmL', lerp(6, -88, raise), lerp(0, 6 * h, raise), lerp(10, 4, raise) * h],
      ['forearmL', lerp(-16, -6, raise), 0, 0],
      ['handL', 0, lerp(0, -10 * h, raise), 0],
      // kiriş kolu: geriye çeker
      ['upperArmR', lerp(6, -74, raise) + lerp(0, 26, draw), lerp(0, -44 * h, raise) + lerp(0, -22 * h, draw), lerp(-10, -26, raise) * h],
      ['forearmR', lerp(-16, -34, raise) - lerp(0, 74, draw), 0, 0],
      ['handR', 0, 0, lerp(0, 20, draw) * h],
      ['thighL', lerp(4, 16, raise), 0, 2],
      ['shinL', lerp(-6, -20, raise), 0, 0],
      ['thighR', lerp(4, -10, raise), 0, -2],
      ['shinR', lerp(-6, -8, raise), 0, 0],
    ]);
  },

  /* ── ÖLÜM: dizler → gövde → yere yığılma ── */
  death: (t, ctx) => {
    const u = clamp(t / 1.6, 0, 1);
    const k = smoothRig(u);
    const dir = ctx.handedness;
    return pose([
      ['root', 0, 0, lerp(0, 76 * dir, k)],
      ['pelvis', lerp(0, -18, k), 0, lerp(0, -14 * dir, k)],
      ['spine', lerp(0, 22, k), 0, lerp(0, 10 * dir, k)],
      ['chest', lerp(0, 26, k), lerp(0, 16 * dir, k), 0],
      ['neck', lerp(0, -22, k), lerp(0, -18 * dir, k), 0],
      ['head', lerp(0, -16, k), lerp(0, -20 * dir, k), lerp(0, 24 * dir, k)],
      ['upperArmL', lerp(6, -64, k), 0, lerp(9, 58, k)],
      ['forearmL', lerp(-16, -24, k), 0, 0],
      ['upperArmR', lerp(6, -40, k), 0, lerp(-9, -66, k)],
      ['forearmR', lerp(-16, -40, k), 0, 0],
      ['thighL', lerp(2, 42, k), 0, lerp(2, 14, k)],
      ['shinL', lerp(-3, -74, k), 0, 0],
      ['footL', lerp(1, 20, k), 0, 0],
      ['thighR', lerp(2, 22, k), 0, lerp(-2, -8, k)],
      ['shinR', lerp(-3, -34, k), 0, 0],
      ['footR', lerp(1, 12, k), 0, 0],
    ]);
  },

  /* ── SÜVARİ: üzengide duruş + kargı ── */
  mountedIdle: (t, ctx) => {
    const b = t * 2.4 + ctx.phase * TAU;
    return pose([
      ['root', sin(b) * 1.6, 0, 0],
      ['pelvis', -8 + sin(b) * 1.2, 0, 0],
      ['spine', 4, 0, 0],
      ['chest', 3 + sin(b) * 1.1, 0, 0],
      ['neck', -2, 0, 0],
      ['head', sin(b * 0.6) * 2, sin(b * 0.35) * 5, 0],
      ['upperArmL', -18 + sin(b) * 2, 0, 14],
      ['forearmL', -44, 0, 0],
      ['upperArmR', -34 + sin(b + 1) * 2, -8 * ctx.handedness, -18 * ctx.handedness],
      ['forearmR', -52, 0, 0],
      ['thighL', -74, 0, 12],
      ['shinL', 78, 0, 0],
      ['footL', -8, 0, 0],
      ['thighR', -74, 0, -12],
      ['shinR', 78, 0, 0],
      ['footR', -8, 0, 0],
    ]);
  },

  /* ── AT: yürüyüş / dörtnala (speed ile ölçeklenir) ── */
  horseWalk: (t, ctx) => {
    const spd = clamp(ctx.speed, 0.2, 3.2);
    const freq = 1.35 + spd * 1.05;
    const amp = 14 + spd * 10;
    const p = t * freq + ctx.phase * TAU;
    const gallop = clamp(spd - 1.6, 0, 1.6);
    // Dörtnala: ön ve arka çiftler birlikte, diyagonal yürüyüşten farklı
    const fl = p;
    const fr = p + (gallop > 0.1 ? 0.4 : Math.PI);
    const hl = p + (gallop > 0.1 ? 0.9 : Math.PI + 0.6);
    const hr = p + (gallop > 0.1 ? 1.3 : 0.6);
    const bound = gallop > 0.1 ? sin(p * 2) * 0.05 * gallop : 0;

    return pose([
      ['root', 0, 0, 0],
      ['body', gallop * 4 * sin(p), sin(p * 2) * 2.2 * (0.4 + gallop), gallop * 3 * sin(p * 2)],
      ['chest', 0, -sin(p) * 2, 0],
      ['neck', 0, 0, sin(p) * (3 + gallop * 6) - gallop * 4],
      ['head', 0, 0, -sin(p + 0.4) * (4 + gallop * 7) + gallop * 5],
      ['jaw', 0, 0, 0],
      ['earL', 0, 0, sin(t * 3) * 4],
      ['earR', 0, 0, -sin(t * 3 + 1) * 4],
      ['tail', 0, sin(p * 0.5) * 8, sin(p) * (6 + gallop * 12) - gallop * 8],

      ['frontLThigh', sin(fl) * amp, 0, 0],
      ['frontLCannon', -Math.max(0, -sin(fl - 0.7)) * amp * 1.7 - 6, 0, 0],
      ['frontLHoof', sin(fl + 0.5) * amp * 0.4, 0, 0],
      ['frontRThigh', sin(fr) * amp, 0, 0],
      ['frontRCannon', -Math.max(0, -sin(fr - 0.7)) * amp * 1.7 - 6, 0, 0],
      ['frontRHoof', sin(fr + 0.5) * amp * 0.4, 0, 0],
      ['hindLThigh', sin(hl) * amp * 0.92, 0, 0],
      ['hindLCannon', -Math.max(0, -sin(hl - 0.7)) * amp * 1.9 - 8, 0, 0],
      ['hindLHoof', sin(hl + 0.5) * amp * 0.45, 0, 0],
      ['hindRThigh', sin(hr) * amp * 0.92, 0, 0],
      ['hindRCannon', -Math.max(0, -sin(hr - 0.7)) * amp * 1.9 - 8, 0, 0],
      ['hindRHoof', sin(hr + 0.5) * amp * 0.45, 0, 0],
    ]);
  },
};

function smoothRig(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export type ClipName = keyof typeof ANIMATION_CLIPS | string;

/* ─────────────────────────── animator ─────────────────────────── */

export class Animator {
  private clips = new Map<string, ClipFn>();
  ctx: RigContext = {
    speed: 0,
    phase: 0,
    seed: 1,
    power: 1,
    handedness: 1,
    mounted: false,
  };
  current = 'idle';
  private currentPose: Pose = {};
  private blendFrom: Pose | null = null;
  private blendStart = 0;
  private blendDuration = 0.22;
  private clock = 0;

  constructor(extra?: Record<string, ClipFn>) {
    for (const k of Object.keys(ANIMATION_CLIPS)) this.clips.set(k, ANIMATION_CLIPS[k as keyof typeof ANIMATION_CLIPS]);
    if (extra) for (const k of Object.keys(extra)) this.clips.set(k, extra[k]);
  }

  register(name: string, fn: ClipFn): this {
    this.clips.set(name, fn);
    return this;
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  list(): string[] {
    return [...this.clips.keys()];
  }

  /** Klip değiştir — kısa bir karışımla geçer (ani poz sıçraması olmaz). */
  play(name: string, blend = 0.22): void {
    if (!this.clips.has(name)) {
      console.warn(`[Bannerforge] Animator: bilinmeyen klip "${name}" → idle'a düşüldü.`);
      name = 'idle';
    }
    if (name === this.current) return;
    this.blendFrom = this.currentPose;
    this.blendStart = this.clock;
    this.blendDuration = blend;
    this.current = name;
  }

  /** Belirli bir andaki pozu hesaplar (durum makinesinden bağımsız). */
  evaluate(name: string, time: number, ctx?: Partial<RigContext>): Pose {
    const fn = this.clips.get(name) ?? ANIMATION_CLIPS.idle;
    return fn(time, { ...this.ctx, ...(ctx ?? {}) });
  }

  /**
   * Zamanı ilerlet ve pozu rig'e uygula.
   * @returns uygulanan poz (kök hareketi için ekstra bilgi gerekir: rootMotion())
   */
  update(rig: Rig, dt: number): Pose {
    this.clock += dt;
    const target = this.clips.get(this.current)!(this.clock, this.ctx);
    let out = target;
    if (this.blendFrom) {
      const k = clamp((this.clock - this.blendStart) / Math.max(1e-4, this.blendDuration), 0, 1);
      out = Rig.blend(this.blendFrom, target, smoothRig(k));
      if (k >= 1) this.blendFrom = null;
    }
    this.currentPose = out;
    rig.applyPose(out, true);
    return out;
  }

  /**
   * Kök hareketi: yürüyüş/koşu hızından saniyedeki ilerleme (m/s).
   * Karakter controller'ın yatay hızını buna göre ayarla.
   */
  rootMotionSpeed(): number {
    const s = this.ctx.speed;
    if (this.current === 'walk') return s <= 1 ? s * 1.35 : 1.35 + (s - 1) * 3.1;
    if (this.current === 'horseWalk') return s <= 1 ? s * 1.6 : 1.6 + (s - 1) * 6.4;
    return 0;
  }

  /** Saldırı kliplerinde vuruş anı (saniye) — ses/hasar senkronu için. */
  impactTime(clip = this.current): number | null {
    switch (clip) {
      case 'attackSword': return 0.34 * 1.5 + 0.08 * 1.5;
      case 'attackThrust': return 0.42 * 1.85 + 0.08 * 1.85;
      case 'attackAxe': return 0.44 * 2.1 + 0.08 * 2.1;
      case 'shootBow': return 0.62 * 2.6;
      case 'block': return 0;
      default: return null;
    }
  }

  getPose(): Pose {
    return this.currentPose;
  }
}
