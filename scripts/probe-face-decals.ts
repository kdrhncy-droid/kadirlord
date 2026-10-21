/**
 * probe-face-decals.ts — Yara izi / savaş boyası decal'lerinin yüzeye oturması
 *
 *   npx tsx scripts/probe-face-decals.ts
 *
 * Eski decal'ler düz kutuydı ve `z` sabit olduğu için kafa ölçeği değişince
 * yüzeyden kopuyor, ön planda kalın bir "X" gibi duruyordu. Yeni decal'ler
 * kafatası elipsoidine projekte edilen şeritler. Bu probe her decal köşesinin
 * yüzeye uzaklığını ve göz bölgesine girmemesini ölçer.
 */
import * as THREE from 'three';
import { HEAD } from '../src/game/characterRig.ts';
import {
  createScarAndWarPaintMesh,
  type ScarType,
  type WarPaintType,
} from '../src/game/characterMorph.ts';

const SKULL = { rx: HEAD.r, ry: HEAD.r * HEAD.sy, rz: HEAD.r * HEAD.sz, cy: HEAD.cy };

/** Noktanın kafatası elipsoidine göre **normalize** uzaklığı (1 = tam yüzeyde). */
function ellipsoidRadius(p: THREE.Vector3): number {
  const nx = p.x / SKULL.rx;
  const ny = (p.y - SKULL.cy) / SKULL.ry;
  const nz = p.z / SKULL.rz;
  return Math.sqrt(nx * nx + ny * ny + nz * nz);
}

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const SCARS: ScarType[] = ['eye_slash', 'cheek_cross', 'jaw_gash', 'battle_brow'];
const PAINTS: WarPaintType[] = ['woad_lines', 'steppe_chevrons', 'imperial_mark', 'ash_smear'];

interface Measurement {
  label: string;
  meshes: number;
  minR: number;
  maxR: number;
  maxLiftMm: number;
  eyeHits: number;
  maxHalfWidth: number;
  hasTaper: boolean;
}

/** Göz bölgesi (yerel kafa uzayı): gözler x ±0.04, y ≈ cy+0.01, r ≈ 0.03. */
const EYES = [
  { x: 0.04, y: HEAD.cy + 0.01, r: 0.032 },
  { x: -0.04, y: HEAD.cy + 0.01, r: 0.032 },
];

function inEyeRegion(p: THREE.Vector3): boolean {
  return EYES.some((e) => Math.hypot(p.x - e.x, p.y - e.y) < e.r);
}

function measure(label: string, group: THREE.Group): Measurement {
  let minR = Infinity;
  let maxR = -Infinity;
  let eyeHits = 0;
  let maxHalfWidth = 0;
  let hasTaper = false;
  let meshCount = 0;

  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    meshCount++;
    const pos = m.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    // Şeritler çift sıralı: her iki köşe bir enine kesit → genişlik ölçülebilir.
    for (let i = 0; i < pos.count; i += 2) {
      const a = v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).clone();
      const b = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
      for (const p of [a, b]) {
        const r = ellipsoidRadius(p);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        if (inEyeRegion(p)) eyeHits++;
      }
      maxHalfWidth = Math.max(maxHalfWidth, a.distanceTo(b) / 2);
    }

    // Uçlar sivri mi: ilk kesit ortadakinden belirgin dar olmalı.
    const widthAt = (i: number) => {
      const a = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const b = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
      return a.distanceTo(b);
    };
    if (pos.count >= 6) {
      const first = widthAt(0);
      const mid = widthAt(Math.floor(pos.count / 4) * 2);
      if (first < mid * 0.7) hasTaper = true;
    }
  });

  return {
    label,
    meshes: meshCount,
    minR,
    maxR,
    maxLiftMm: (maxR - 1) * SKULL.rx * 1000,
    eyeHits,
    maxHalfWidth,
    hasTaper,
  };
}

const results: Measurement[] = [];

for (const scar of SCARS) {
  const g = createScarAndWarPaintMesh(scar, 'none', '#0284c7');
  results.push(measure(scar, g));
}
for (const paint of PAINTS) {
  const g = createScarAndWarPaintMesh('none', paint, '#0284c7');
  results.push(measure(paint, g));
}

console.log('etiket              şerit  r (min..max)          dışa pay (mm)  göz  yarı-genişlik  sivri');
for (const r of results) {
  console.log(
    r.label.padEnd(18),
    String(r.meshes).padStart(5),
    `${r.minR.toFixed(4)}..${r.maxR.toFixed(4)}`.padStart(20),
    r.maxLiftMm.toFixed(2).padStart(14),
    String(r.eyeHits).padStart(4),
    r.maxHalfWidth.toFixed(4).padStart(13),
    String(r.hasTaper).padStart(6),
  );
}

console.log('');
for (const r of results) {
  ok(r.meshes > 0, `${r.label}: decal üretildi`, `${r.meshes} şerit`);
  ok(r.minR > 0.995, `${r.label}: yüzeye gömülmüyor`, `min r ${r.minR.toFixed(4)}`);
  ok(r.maxLiftMm < 4, `${r.label}: yüzeyden kopmuyor`, `${r.maxLiftMm.toFixed(2)} mm`);
  ok(r.eyeHits === 0, `${r.label}: göz bölgesine girmiyor`, `${r.eyeHits} köşe`);
  ok(r.hasTaper, `${r.label}: uçlar sivri (şerit görünümü)`);
}

// Deneyim: tüm izler/gövdeler birlikte de çalışmalı.
const combined = createScarAndWarPaintMesh('eye_slash', 'imperial_mark', '#7c2d12');
ok(combined.children.length === 2, 'yara + boya birlikte', `${combined.children.length} şerit`);

console.log(fails === 0 ? '\n✅ YÜZ İZLERİ YÜZEYE OTURUYOR' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
