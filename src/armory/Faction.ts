/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Faction.ts
 *  Fraksiyon renk sistemi + prosedürel heraldik (arma, sancak, sorguç).
 *
 *  Bölüm 1 / madde 4 gereği: "Fraksiyon/Sancak renkleri modüler olarak
 *  değiştirilebilir dinamik `color` parametresi almalıdır."
 *
 *  Bu modül iki iş yapar:
 *   1) FactionPalette   → primary / secondary / trim / steel / leather renkleri
 *                         MaterialLibrary'ye bağlanır, factionTint işaretli
 *                         materyaller otomatik yeniden renklenir.
 *   2) Heraldry         → tamamen prosedürel, düşük üçgenli arma (charge)
 *                         geometrileri: haç, çapraz haç, şevron, bend, pale,
 *                         yıldız, rondel, kurt dişi, kartal pençesi, zambak.
 *                         Kalkan yüzüne, sancağa ve göğüs zırhına basılır.
 *
 *  Arma başına üçgen maliyeti: 12 – 48 (bütçe içinde).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import {
  DEG,
  Piece,
  TAU,
  clothGeometry,
  extrudeOpts,
  profile2,
  shapeFrom,
  starPoints,
  sweep,
  v2,
  v3,
  Vec2Tuple,
} from './Core.ts';

/* ─────────────────────────── fraksiyon paleti ─────────────────────────── */

export interface FactionColors {
  primary: number;
  secondary: number;
  trim: number;
  /** Kumaş/deri tabanı (surcoat, pelerin, kabza sargısı). */
  cloth: number;
  /** Metal tonu: kültürler arası çelik/bronz farkı. */
  steel: number;
  steelDark: number;
  gold: number;
  wood: number;
  leather: number;
}

export interface FactionDef extends FactionColors {
  id: string;
  name: string;
  culture: string;
  /** Varsayılan arma. */
  charge: ChargeType;
  motto: string;
}

/** Bannerlord kültürlerinden esinlenen 8 hazır fraksiyon + custom desteği. */
export const FACTIONS: FactionDef[] = [
  {
    id: 'vlandia',
    name: 'Vlandiya Krallığı',
    culture: 'Frank-Norman',
    primary: 0x2f5fb3,
    secondary: 0xf2e3c2,
    trim: 0xd9a441,
    cloth: 0x35425c,
    steel: 0x8e97a3,
    steelDark: 0x4d545e,
    gold: 0xd9a441,
    wood: 0x6b4a2c,
    leather: 0x5a3f27,
    charge: 'crossPattée',
    motto: 'Çelik ve Yemin',
  },
  {
    id: 'empire',
    name: 'İmparatorluk (Calradia)',
    culture: 'Geç Roma / Bizans',
    primary: 0x8d1f2d,
    secondary: 0xf3e2b6,
    trim: 0xe0b558,
    cloth: 0x5b2430,
    steel: 0x9aa3ae,
    steelDark: 0x565d67,
    gold: 0xe0b558,
    wood: 0x77522f,
    leather: 0x614028,
    charge: 'eagle',
    motto: 'Aquila Aeterna',
  },
  {
    id: 'sturgia',
    name: 'Sturgiya',
    culture: 'Nord / Rus',
    primary: 0x2c6e49,
    secondary: 0xd9d2c2,
    trim: 0xa9b2bb,
    cloth: 0x33413a,
    steel: 0x8b939d,
    steelDark: 0x464d55,
    gold: 0xc7a45c,
    wood: 0x5f4326,
    leather: 0x4e3620,
    charge: 'axeHead',
    motto: 'Kuzeyin Balta Yemini',
  },
  {
    id: 'khuzait',
    name: 'Kuzait Hanlığı',
    culture: 'Bozkır / Moğol',
    primary: 0xd08a1e,
    secondary: 0x2c3a52,
    trim: 0xe5c46a,
    cloth: 0x6d4a24,
    steel: 0x93989f,
    steelDark: 0x4f545a,
    gold: 0xe5c46a,
    wood: 0x7d5a30,
    leather: 0x6b4526,
    charge: 'crescent',
    motto: 'Rüzgârın Çocukları',
  },
  {
    id: 'aserai',
    name: 'Aseray Sultanlığı',
    culture: 'Çöl / Arap',
    primary: 0x1d7a72,
    secondary: 0xf0e0b8,
    trim: 0xd9b45f,
    cloth: 0x8a7350,
    steel: 0xa0a4a6,
    steelDark: 0x5c5f60,
    gold: 0xd9b45f,
    wood: 0x8a6234,
    leather: 0x77502c,
    charge: 'star8',
    motto: 'Kumun Altın Kılıcı',
  },
  {
    id: 'battania',
    name: 'Battanya',
    culture: 'Kelt / Galler',
    primary: 0x3f6b32,
    secondary: 0xe6dfc9,
    trim: 0xb9863c,
    cloth: 0x2f4430,
    steel: 0x878f96,
    steelDark: 0x43494f,
    gold: 0xb9863c,
    wood: 0x59401f,
    leather: 0x463219,
    charge: 'knot',
    motto: 'Ormanın Fısıltısı',
  },
  {
    id: 'bandit',
    name: 'Haydut Çetesi',
    culture: 'Yağmacı',
    primary: 0x6a5a44,
    secondary: 0x3a3128,
    trim: 0x8f7a52,
    cloth: 0x4a4238,
    steel: 0x6e6a66,
    steelDark: 0x39383a,
    gold: 0x9d8a54,
    wood: 0x4f3a20,
    leather: 0x3f2d1a,
    charge: 'skull',
    motto: 'Ne Sancak Ne Yasa',
  },
  {
    id: 'custom',
    name: 'Özel Fraksiyon',
    culture: 'Serbest',
    primary: 0x9e2b2b,
    secondary: 0xf2ede2,
    trim: 0xd8b45e,
    cloth: 0x4c4438,
    steel: 0x8e97a3,
    steelDark: 0x4d545e,
    gold: 0xd8b45e,
    wood: 0x6b4a2c,
    leather: 0x5a3f27,
    charge: 'chevron',
    motto: 'Kendi Sancağın',
  },
];

export class FactionPalette {
  readonly id: string;
  readonly name: string;
  readonly culture: string;
  readonly motto: string;
  readonly charge: ChargeType;
  colors: FactionColors;

  constructor(def: FactionDef | (Partial<FactionDef> & { id: string; name: string })) {
    const base = def.id && FACTIONS.find((f) => f.id === def.id) ? FACTIONS.find((f) => f.id === def.id)! : FACTIONS[7];
    this.id = def.id;
    this.name = def.name ?? base.name;
    this.culture = def.culture ?? base.culture;
    this.motto = def.motto ?? base.motto;
    this.charge = def.charge ?? base.charge;
    this.colors = {
      primary: def.primary ?? base.primary,
      secondary: def.secondary ?? base.secondary,
      trim: def.trim ?? base.trim,
      cloth: def.cloth ?? base.cloth,
      steel: def.steel ?? base.steel,
      steelDark: def.steelDark ?? base.steelDark,
      gold: def.gold ?? base.gold,
      wood: def.wood ?? base.wood,
      leather: def.leather ?? base.leather,
    };
  }

  colorFor(slot: 'primary' | 'secondary' | 'trim'): number {
    return this.colors[slot];
  }

  /** Kullanıcı arayüzünden canlı renk değiştirme. */
  setColor(slot: keyof FactionColors, hex: number | string): this {
    this.colors[slot] = typeof hex === 'string' ? new THREE.Color(hex).getHex() : hex;
    return this;
  }

  /** Bir rengi fraksiyonla uyumlu hale getirir (karışım oranı 0..1). */
  blend(slot: keyof FactionColors, target: number, amount: number): number {
    const a = new THREE.Color(this.colors[slot]);
    const b = new THREE.Color(target);
    return a.lerp(b, amount).getHex();
  }

  static byId(id: string): FactionPalette {
    const def = FACTIONS.find((f) => f.id === id) ?? FACTIONS[7];
    return new FactionPalette(def);
  }
}

/* ─────────────────────────── heraldik armalar ─────────────────────────── */

export type ChargeType =
  | 'cross'
  | 'crossPattée'
  | 'saltire'
  | 'chevron'
  | 'bend'
  | 'pale'
  | 'star8'
  | 'roundel'
  | 'crescent'
  | 'eagle'
  | 'wolf'
  | 'knot'
  | 'axeHead'
  | 'skull'
  | 'fleur';

/**
 * Arma üretici: `scale` birim yarıçaplı bir daireye sığacak şekilde,
 * z = 0 düzleminde (yüzeye +Z yönde kabartma) parça listesi döndürür.
 * Tüm armalar 12–48 üçgen arasında kalır.
 */
export function buildCharge(
  type: ChargeType,
  color: number,
  scale = 0.12,
  accent: number | null = null,
): Piece[] {
  const pieces: Piece[] = [];
  const add = (geometry: THREE.BufferGeometry, position: Vec2Tuple | null = null, rotationZ = 0, c: number = color) => {
    pieces.push({
      geometry,
      material: { key: 'charge', color: c, metalness: 0.35, roughness: 0.55, flatShading: true },
      position: position ? [position[0], position[1], 0] : [0, 0, 0],
      rotation: [0, 0, rotationZ],
    });
  };

  const bar = (w: number, h: number, depth = 0.022): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, depth);
    g.translate(0, 0, depth / 2);
    return g;
  };

  switch (type) {
    case 'cross': {
      add(bar(scale * 0.42, scale * 2.0));
      add(bar(scale * 2.0, scale * 0.42));
      break;
    }
    case 'crossPattée': {
      // Kolları dışa doğru genişleyen gotik haç: 4 adet kesik koni + merkez disk
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.CylinderGeometry(scale * 0.42, scale * 0.16, scale * 0.95, 4, 1);
        arm.rotateX(90 * DEG);
        arm.rotateZ(i * 90 * DEG);
        const dir = new THREE.Vector3(Math.cos((i * 90 + 90) * DEG), Math.sin((i * 90 + 90) * DEG), 0);
        arm.translate(dir.x * scale * 0.55, dir.y * scale * 0.55, 0.012);
        add(arm);
      }
      const hub = new THREE.CylinderGeometry(scale * 0.3, scale * 0.3, 0.03, 6);
      hub.rotateX(90 * DEG);
      hub.translate(0, 0, 0.014);
      add(hub, null, 0, accent ?? color);
      break;
    }
    case 'saltire': {
      add(bar(scale * 0.38, scale * 2.1), null, 45 * DEG);
      add(bar(scale * 0.38, scale * 2.1), null, -45 * DEG);
      break;
    }
    case 'chevron': {
      const shape = shapeFrom([
        [-scale * 1.05, -scale * 0.55],
        [0, scale * 0.55],
        [scale * 1.05, -scale * 0.55],
        [scale * 1.05, -scale * 0.05],
        [0, scale * 1.0],
        [-scale * 1.05, -scale * 0.05],
      ]);
      const g = new THREE.ExtrudeGeometry(shape, extrudeOpts(0.024, 0.004, 1));
      g.center();
      g.translate(0, 0, 0.012);
      add(g);
      break;
    }
    case 'bend': {
      add(bar(scale * 0.5, scale * 2.4), null, -38 * DEG);
      break;
    }
    case 'pale': {
      add(bar(scale * 0.46, scale * 2.2));
      break;
    }
    case 'star8': {
      const pts = starPoints(8, scale * 1.0, scale * 0.42, Math.PI / 8);
      const g = new THREE.ExtrudeGeometry(shapeFrom(pts), extrudeOpts(0.02, 0.004, 1));
      g.center();
      g.translate(0, 0, 0.01);
      add(g);
      break;
    }
    case 'roundel': {
      const g = new THREE.CylinderGeometry(scale * 0.78, scale * 0.78, 0.024, 8);
      g.rotateX(90 * DEG);
      g.translate(0, 0, 0.012);
      add(g);
      const inner = new THREE.CylinderGeometry(scale * 0.42, scale * 0.42, 0.03, 6);
      inner.rotateX(90 * DEG);
      inner.translate(0, 0, 0.016);
      add(inner, null, 0, accent ?? 0x2a2a2e);
      break;
    }
    case 'crescent': {
      const outer = new THREE.TorusGeometry(scale * 0.7, scale * 0.2, 3, 7, 250 * DEG);
      outer.rotateZ(55 * DEG);
      outer.translate(0, 0, 0.014);
      add(outer);
      const star = new THREE.OctahedronGeometry(scale * 0.26, 0);
      star.scale(1, 1, 0.35);
      star.translate(scale * 0.5, scale * 0.24, 0.02);
      add(star, null, 0, accent ?? color);
      break;
    }
    case 'eagle': {
      // Stilize çift başlı kartal: gövde + 2 kanat + 2 baş + kuyruk
      const body = new THREE.CylinderGeometry(scale * 0.2, scale * 0.3, scale * 1.05, 5);
      body.rotateX(90 * DEG);
      body.translate(0, 0, 0.014);
      add(body);
      for (const s of [-1, 1]) {
        const wing = shapeFrom([
          [0, scale * 0.4],
          [s * scale * 1.05, scale * 0.62],
          [s * scale * 0.85, scale * 0.05],
          [s * scale * 0.3, -scale * 0.12],
        ]);
        const g = new THREE.ExtrudeGeometry(wing, extrudeOpts(0.018, 0.003, 1));
        g.center();
        g.translate(s * scale * 0.42, scale * 0.16, 0.012);
        add(g);
        const head = new THREE.ConeGeometry(scale * 0.19, scale * 0.4, 4);
        head.rotateX(90 * DEG);
        head.rotateZ(s * 28 * DEG);
        head.translate(s * scale * 0.24, scale * 0.62, 0.016);
        add(head);
      }
      const tail = shapeFrom([
        [-scale * 0.34, 0],
        [scale * 0.34, 0],
        [0, -scale * 0.8],
      ]);
      const tg = new THREE.ExtrudeGeometry(tail, extrudeOpts(0.018, 0.003, 1));
      tg.center();
      tg.translate(0, -scale * 0.52, 0.012);
      add(tg);
      break;
    }
    case 'wolf': {
      // Kurt başı silüeti: burun + kulaklar + boyun
      const head = shapeFrom([
        [0, scale * 0.95],
        [scale * 0.42, scale * 0.28],
        [scale * 0.78, scale * 0.7],
        [scale * 0.66, -scale * 0.1],
        [scale * 0.2, -scale * 0.85],
        [-scale * 0.2, -scale * 0.85],
        [-scale * 0.66, -scale * 0.1],
        [-scale * 0.78, scale * 0.7],
        [-scale * 0.42, scale * 0.28],
      ]);
      const g = new THREE.ExtrudeGeometry(head, extrudeOpts(0.02, 0.004, 1));
      g.center();
      g.translate(0, 0, 0.012);
      add(g);
      const eye = new THREE.OctahedronGeometry(scale * 0.13, 0);
      eye.scale(1, 1, 0.4);
      eye.translate(0, scale * 0.1, 0.026);
      add(eye, null, 0, accent ?? 0x1c1a18);
      break;
    }
    case 'knot': {
      // Battanya düğümü: 3 iç içe halka
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + Math.PI / 2;
        const torus = new THREE.TorusGeometry(scale * 0.4, scale * 0.12, 3, 6);
        torus.translate(Math.cos(a) * scale * 0.42, Math.sin(a) * scale * 0.42, 0.014);
        add(torus, null, 0, i === 1 ? (accent ?? color) : color);
      }
      break;
    }
    case 'axeHead': {
      const head = shapeFrom([
        [-scale * 0.16, scale * 0.9],
        [scale * 0.62, scale * 0.78],
        [scale * 0.86, scale * 0.16],
        [scale * 0.44, -scale * 0.1],
        [scale * 0.5, -scale * 0.66],
        [scale * 0.06, -scale * 0.3],
        [-scale * 0.16, -scale * 0.86],
      ]);
      const g = new THREE.ExtrudeGeometry(head, extrudeOpts(0.022, 0.004, 1));
      g.center();
      g.translate(0, 0, 0.012);
      add(g);
      add(bar(scale * 0.14, scale * 2.0, 0.018), null, 0, accent ?? 0x5a4026);
      break;
    }
    case 'skull': {
      const cranium = new THREE.SphereGeometry(scale * 0.6, 5, 4);
      cranium.scale(1, 1, 0.55);
      cranium.translate(0, scale * 0.22, 0.016);
      add(cranium, null, 0, accent ?? 0xd8d2c2);
      const jaw = new THREE.BoxGeometry(scale * 0.62, scale * 0.4, scale * 0.34);
      jaw.translate(0, -scale * 0.34, 0.014);
      add(jaw, null, 0, accent ?? 0xd8d2c2);
      for (const s of [-1, 1]) {
        const eye = new THREE.OctahedronGeometry(scale * 0.19, 0);
        eye.scale(1, 1, 0.4);
        eye.translate(s * scale * 0.25, scale * 0.24, 0.03);
        add(eye, null, 0, 0x1a1714);
      }
      break;
    }
    case 'fleur': {
      const petal = new THREE.ConeGeometry(scale * 0.26, scale * 0.95, 4);
      petal.translate(0, scale * 0.42, 0.016);
      add(petal);
      for (const s of [-1, 1]) {
        const side = new THREE.ConeGeometry(scale * 0.22, scale * 0.68, 4);
        side.rotateZ(s * 42 * DEG);
        side.translate(s * scale * 0.44, scale * 0.05, 0.016);
        add(side);
      }
      add(bar(scale * 1.1, scale * 0.16, 0.02), [0, -scale * 0.34]);
      const stem = new THREE.ConeGeometry(scale * 0.2, scale * 0.5, 4);
      stem.rotateX(180 * DEG);
      stem.translate(0, -scale * 0.62, 0.016);
      add(stem);
      break;
    }
  }
  return pieces;
}

/* ─────────────────────────── sancak / bayrak ─────────────────────────── */

export interface BannerOptions {
  /** Yatay direk uzunluğu (m). */
  width: number;
  /** Sarkan kumaş uzunluğu (m). */
  height: number;
  faction: FactionPalette;
  charge?: ChargeType | null;
  chargeScale?: number;
  /** Kumaş dalga genliği. */
  wave?: number;
  /** Dikey direk (gönder) ekle. */
  pole?: boolean;
  poleHeight?: number;
  /** Alt kenar şekli: 'flat' | 'pointed' | 'swallow' */
  edge?: 'flat' | 'pointed' | 'swallow';
  /** Çözünürlük (crowd LOD'da düşürülür). */
  segments?: [number, number];
}

/**
 * Prosedürel sancak: gönder + dalgalı kumaş + arma + kenar saçakları.
 * Kumaş çift taraflıdır; dalga fonksiyonu zamandan bağımsızdır (animasyon
 * için `wavePhase` parametresini yeniden çağırarak üret).
 */
export function buildBanner(opts: BannerOptions): { group: THREE.Group; pieces: Piece[]; triangles: number } {
  const {
    width,
    height,
    faction,
    charge = faction.charge,
    chargeScale = Math.min(width, height) * 0.3,
    wave = height * 0.09,
    pole = true,
    poleHeight = height + 0.9,
    edge = 'flat',
    segments = [6, 5],
  } = opts;

  const group = new THREE.Group();
  const pieces: Piece[] = [];

  // ── kumaş ──
  const widthFn = (v: number): number => {
    if (edge === 'pointed') return width * (1 - smoothFaction(v));
    if (edge === 'swallow') return width;
    return width;
  };
  const cloth = clothGeometry(widthFn, height, segments[0], segments[1], (u, v) => Math.sin(u * 5.2 + v * 2.1) * wave * v);
  // swallow-tail: alt orta vertex'leri yukarı çek
  if (edge === 'swallow') {
    const pos = cloth.attributes.position as THREE.BufferAttribute;
    const rows = segments[1] + 1;
    const cols = segments[0] + 1;
    for (let j = rows - 2; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = i / (cols - 1) - 0.5;
        const lift = height * 0.34 * (1 - Math.abs(u) * 2);
        if (lift > 0) pos.setY(j * cols + i, pos.getY(j * cols + i) + Math.max(0, lift));
      }
    }
    pos.needsUpdate = true;
    cloth.computeVertexNormals();
  }
  const clothMat: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
    color: faction.colors.primary,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const clothMesh = new THREE.Mesh(cloth, clothMat);
  clothMesh.position.set(0, pole ? poleHeight - 0.12 : 0, 0);
  clothMesh.castShadow = true;
  group.add(clothMesh);
  pieces.push({
    geometry: cloth,
    material: {
      key: 'bannerCloth',
      color: faction.colors.primary,
      metalness: 0.05,
      roughness: 0.92,
      flatShading: true,
      side: THREE.DoubleSide,
    },
    position: [0, clothMesh.position.y, 0],
  });

  // ── kenar şeridi (secondary) ──
  const border = clothGeometry(
    (v) => widthFn(v) * 1.005,
    height * 1.002,
    segments[0],
    1,
    (u, v) => Math.sin(u * 5.2 + v * 2.1) * wave * v,
  );
  const borderMat = new THREE.MeshStandardMaterial({
    color: faction.colors.secondary,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const borderMesh = new THREE.Mesh(border, borderMat);
  borderMesh.position.copy(clothMesh.position);
  borderMesh.scale.set(1, 1, 1);
  // sadece alt kenar şeridi gibi görünmesi için kumaşı hafif öne alıyoruz
  clothMesh.position.z += 0.004;
  group.add(borderMesh);
  pieces.push({
    geometry: border,
    material: {
      key: 'bannerBorder',
      color: faction.colors.secondary,
      metalness: 0.05,
      roughness: 0.9,
      flatShading: true,
      side: THREE.DoubleSide,
    },
    position: [0, borderMesh.position.y, 0],
  });

  // ── arma ──
  if (charge) {
    const chargePieces = buildCharge(charge, faction.colors.secondary, chargeScale, faction.colors.trim);
    const cy = clothMesh.position.y - height * 0.44;
    for (const cp of chargePieces) {
      const mesh = new THREE.Mesh(cp.geometry, new THREE.MeshStandardMaterial({
        color: (cp.material as { color?: number })?.color ?? faction.colors.secondary,
        roughness: 0.55,
        metalness: 0.35,
        flatShading: true,
      }));
      mesh.position.set(
        (cp.position?.[0] ?? 0),
        cy + (cp.position?.[1] ?? 0),
        0.026,
      );
      mesh.rotation.z = cp.rotation?.[2] ?? 0;
      group.add(mesh);
      pieces.push({ ...cp, position: [mesh.position.x, mesh.position.y, mesh.position.z] });
    }
  }

  // ── gönder + finial ──
  if (pole) {
    const poleGeo = new THREE.CylinderGeometry(0.028, 0.036, poleHeight, 5);
    poleGeo.translate(0, poleHeight / 2, 0);
    const poleMesh = new THREE.Mesh(
      poleGeo,
      new THREE.MeshStandardMaterial({ color: faction.colors.wood, roughness: 0.88, metalness: 0.1, flatShading: true }),
    );
    poleMesh.castShadow = true;
    group.add(poleMesh);
    pieces.push({
      geometry: poleGeo,
      material: { key: 'bannerPole', color: faction.colors.wood, metalness: 0.1, roughness: 0.88 },
    });

    const finial = new THREE.ConeGeometry(0.055, 0.19, 5);
    finial.translate(0, poleHeight + 0.09, 0);
    const finialMesh = new THREE.Mesh(
      finial,
      new THREE.MeshStandardMaterial({ color: faction.colors.gold, roughness: 0.35, metalness: 0.85, flatShading: true }),
    );
    group.add(finialMesh);
    pieces.push({
      geometry: finial,
      material: { key: 'bannerFinial', color: faction.colors.gold, metalness: 0.85, roughness: 0.35 },
    });

    const crossBar = new THREE.BoxGeometry(width + 0.06, 0.035, 0.035);
    crossBar.translate(0, poleHeight - 0.1, 0);
    const barMesh = new THREE.Mesh(
      crossBar,
      new THREE.MeshStandardMaterial({ color: faction.colors.steelDark, roughness: 0.7, metalness: 0.5, flatShading: true }),
    );
    group.add(barMesh);
    pieces.push({
      geometry: crossBar,
      material: { key: 'bannerBar', color: faction.colors.steelDark, metalness: 0.5, roughness: 0.7 },
    });
  }

  let triangles = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) triangles += (m.geometry.index ? m.geometry.index.count : (m.geometry.attributes.position as THREE.BufferAttribute).count) / 3;
  });
  return { group, pieces, triangles: Math.round(triangles) };
}

function smoothFaction(v: number): number {
  return v * v * (3 - 2 * v);
}

/* ─────────────────────────── sorguç / yele ─────────────────────────── */

export interface PlumeOptions {
  count: number;
  length: number;
  width: number;
  color: number;
  accent?: number;
  /** Sorguç eğrisi: t boyunca açı (radyan). */
  curl?: (t: number) => number;
  seed?: number;
}

/** Miğfer sorgucu veya at yele/kuyruğu için düşük poligon tüy demeti. */
export function buildPlume(opts: PlumeOptions): THREE.BufferGeometry {
  const { count, length, width, color, accent, curl = (t) => t * t * 60 * DEG, seed = 4242 } = opts;
  const rng = (i: number) => Math.abs(Math.sin(i * 12.9898 + seed * 0.017) * 43758.5453) % 1;
  const geoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const steps = 4;
    const spinePts: THREE.Vector3[] = [];
    const spread = (t - 0.5) * width * 1.6;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const a = curl(u) + spread * 0.9 * u;
      spinePts.push(v3(Math.sin(a) * length * u * 0.9, Math.cos(a) * length * u, spread * u * 0.35));
    }
    const prof = profile2([
      [-width * 0.16, -0.004],
      [width * 0.16, -0.004],
      [width * 0.12, 0.006],
      [-width * 0.12, 0.006],
      [-width * 0.16, -0.004],
    ]);
    const g = sweep(prof, spinePts, {
      scale: (u) => Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.6 * (0.8 + rng(i) * 0.4),
      seedNormal: v3(1, 0, 0),
      jitter: 0.0015,
    });
    const c = i % 3 === 1 && accent !== undefined ? accent : color;
    const n = (g.attributes.position as THREE.BufferAttribute).count;
    const arr = new Float32Array(n * 3);
    const col = new THREE.Color(c);
    for (let k = 0; k < n; k++) {
      arr[k * 3] = col.r;
      arr[k * 3 + 1] = col.g;
      arr[k * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geoms.push(g.index ? g.toNonIndexed() : g);
  }
  const merged = mergeAll(geoms);
  geoms.forEach((g) => g.dispose());
  return merged;
}

/** Yerel merge yardımcısı (position+normal+color normalizasyonu ile). */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (list.length === 0) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];
  // mergeGeometries attribute setlerini eşit ister → hepsini aynı şemaya indir
  const norm = list.map((g) => {
    const src = g.index ? g.toNonIndexed() : g;
    const pos = src.attributes.position as THREE.BufferAttribute;
    const nrm = src.attributes.normal as THREE.BufferAttribute;
    const col = src.attributes.color as THREE.BufferAttribute | undefined;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos.clone());
    out.setAttribute('normal', nrm ? nrm.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(0), 3));
    out.setAttribute(
      'color',
      col ? col.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3),
    );
    return out;
  });
  const merged = new THREE.BufferGeometry();
  let total = 0;
  norm.forEach((g) => (total += (g.attributes.position as THREE.BufferAttribute).count));
  const P = new Float32Array(total * 3);
  const N = new Float32Array(total * 3);
  const C = new Float32Array(total * 3);
  let off = 0;
  norm.forEach((g) => {
    const c = (g.attributes.position as THREE.BufferAttribute).count;
    P.set((g.attributes.position as THREE.BufferAttribute).array as Float32Array, off * 3);
    N.set((g.attributes.normal as THREE.BufferAttribute).array as Float32Array, off * 3);
    C.set((g.attributes.color as THREE.BufferAttribute).array as Float32Array, off * 3);
    off += c;
  });
  merged.setAttribute('position', new THREE.BufferAttribute(P, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(C, 3));
  merged.computeBoundingSphere();
  return merged;
}

export const HERALDRY_CATALOG: { id: ChargeType; label: string }[] = [
  { id: 'cross', label: 'Haç' },
  { id: 'crossPattée', label: 'Pattée Haç' },
  { id: 'saltire', label: 'Çapraz Haç' },
  { id: 'chevron', label: 'Şevron' },
  { id: 'bend', label: 'Bend' },
  { id: 'pale', label: 'Pale' },
  { id: 'star8', label: 'Sekiz Köşe Yıldız' },
  { id: 'roundel', label: 'Rondel' },
  { id: 'crescent', label: 'Hilal' },
  { id: 'eagle', label: 'Çift Başlı Kartal' },
  { id: 'wolf', label: 'Kurt Başı' },
  { id: 'knot', label: 'Üçlü Düğüm' },
  { id: 'axeHead', label: 'Balta Başı' },
  { id: 'skull', label: 'Kurukafa' },
  { id: 'fleur', label: 'Zambak' },
];
