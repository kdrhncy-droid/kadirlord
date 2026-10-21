/**
 * probe-face-cover.ts — Faz 9c: zırh/miğfer karakterin YÜZÜNÜ kapatıyor mu?
 *
 *   npx tsx scripts/probe-face-cover.ts
 *
 * Kullanıcı bulgusu: "zırhlar karakterin yüzünü biraz kaplıyor olabilir".
 *
 * Ölçütler:
 *   1. Zırh gövde kabuğu **çenenin altında** bitmeli (üst ≤ çene − 20 mm) ve
 *      köprücük kemiğini örtmeli (üst ≥ 1.60).
 *   2. Yüz hacmine (çene üstü, ön yarım küre) hiçbir zırh parçası girmemeli.
 *      Kafa alt ağacı (saç, sakal, yüz) ölçüme katılmaz.
 *   3. Miğfer: kafayı tepeden örtmeli; açık yüzlü miğferlerde göz hizasının
 *      önünde **geniş** bir kapama olmamalı (burun demiri serbest, vizör değil);
 *      tam yüz vizöründe göz yarığı göz hizasında olmalı.
 */
import * as THREE from 'three';
import { setArmoryVisualsEnabled } from '../src/game/armoryBridge.ts';
import {
  createCharacterRig,
  type ArmorTier,
  type CharacterVisualOptions,
  type HelmetType,
} from '../src/game/characterRig.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const base = {
  skinTone: '#e8be99',
  hairColor: '#2b1b10',
  beardColor: '#2b1b10',
  factionColor: '#7f1d1d',
  hasBeard: true,
  weaponType: 'ONE_HANDED_SWORD',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CHAINMAIL',
  factionId: 'vlandia',
} as unknown as CharacterVisualOptions;

const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
const r3 = (v: number) => v.toFixed(3);

const bare = createCharacterRig({ ...base, armorTier: 'CIVILIAN' } as CharacterVisualOptions);
bare.root.updateMatrixWorld(true);
const skull = box(bare.head.getObjectByName('Skull') ?? bare.head);
const eyeY = 1.892;
const chinY = skull.min.y;
console.log(
  `kafa: y ${r3(skull.min.y)}..${r3(skull.max.y)} · x ±${r3(skull.max.x)} · ` +
    `z ${r3(skull.min.z)}..${r3(skull.max.z)} · göz ${r3(eyeY)} · çene ${r3(chinY)}`,
);

/** Kafa alt ağacındaki mesh'ler (saç/sakal/yüz) — zırh sayılmaz. */
function headMeshes(rig: ReturnType<typeof createCharacterRig>): Set<THREE.Object3D> {
  const set = new Set<THREE.Object3D>();
  rig.head.traverse((o) => set.add(o));
  // Boyun ten/kas dokusudur, zırh değil — ölçüme katılmaz.
  (rig.neck as THREE.Object3D | undefined)?.traverse((o) => set.add(o));
  return set;
}

/** Gövde zırhı parçaları (kafa hariç). */
function torsoArmor(rig: ReturnType<typeof createCharacterRig>) {
  const skip = headMeshes(rig);
  const out: THREE.Mesh[] = [];
  rig.torso.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip.has(m)) return;
    const b = box(m);
    if (b.max.y < 1.2) return; // yalnız göğüs/yaka bölgesi
    out.push(m);
  });
  return out;
}

console.log('\n── Zırh yüzü kapatıyor mu? ──');
const TIERS: ArmorTier[] = ['LEATHER', 'CHAINMAIL', 'PLATE'];
for (const armory of [true, false]) {
  setArmoryVisualsEnabled(armory);
  for (const tier of TIERS) {
    const rig = createCharacterRig({ ...base, armorTier: tier, helmetType: 'NONE' } as CharacterVisualOptions);
    rig.root.updateMatrixWorld(true);
    const pieces = torsoArmor(rig);
    const top = Math.max(...pieces.map((m) => box(m).max.y));
    ok(top <= chinY - 0.02, `${tier}: zırh çenenin altında bitiyor`, `üst ${r3(top)} ≤ ${r3(chinY - 0.02)}`);
    ok(top >= 1.6, `${tier}: köprücük kemiğini örtüyor`, `üst ${r3(top)}`);

    // Yüz hacmi: çene üstü, ön yarı küre.
    const face = new THREE.Box3(
      new THREE.Vector3(-0.1, chinY + 0.02, 0.06),
      new THREE.Vector3(0.1, skull.max.y, 0.2),
    );
    const hits = pieces
      .map((m) => ({ m, b: box(m) }))
      .filter(({ b }) => b.intersectsBox(face))
      .map(({ m }) => (m.geometry as THREE.BufferGeometry).type);
    ok(hits.length === 0, `${tier}: yüz hacmine giren zırh yok`, hits.join(', ') || 'temiz');
  }
}

console.log('\n── Miğferler ──');
setArmoryVisualsEnabled(true);
const HELMETS: HelmetType[] = ['KETTLE_HAT', 'SPANGENHELM', 'IMPERIAL_VISOR'];
for (const helmetType of HELMETS) {
  const rig = createCharacterRig({ ...base, armorTier: 'CHAINMAIL', helmetType } as CharacterVisualOptions);
  rig.root.updateMatrixWorld(true);
  const hm: THREE.Mesh[] = [];
  rig.helmetSocket.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) hm.push(m);
  });
  ok(hm.length > 0, `${helmetType}: miğfer var`, `${hm.length} parça`);
  const hb = box(rig.helmetSocket);
  ok(hb.max.y > skull.max.y - 0.03, `${helmetType}: tepeden kafayı örtüyor`, `tepe ${r3(hb.max.y)}`);
  ok(hb.max.y < skull.max.y + 0.16, `${helmetType}: tepe fazla yükselmiyor`, `+${r3(hb.max.y - skull.max.y)} m`);

  // Göz hizası: gözlerin önünde geniş kapama var mı?
  const bandTop = eyeY + 0.025;
  const bandBottom = eyeY - 0.02;
  const blockers = hm
    .map((m) => box(m))
    .filter((b) => b.max.y > bandBottom && b.min.y < bandTop && b.max.z > skull.max.z - 0.035);
  const spanX = blockers.length ? Math.max(...blockers.map((b) => b.max.x)) - Math.min(...blockers.map((b) => b.min.x)) : 0;
  if (helmetType === 'IMPERIAL_VISOR') {
    const slit = rig.helmetSocket.getObjectByName('visorEyeSlit');
    ok(!!slit, 'IMPERIAL_VISOR: göz yarığı var');
    if (slit) {
      const sb = box(slit);
      ok(
        Math.abs((sb.min.y + sb.max.y) / 2 - eyeY) < 0.03,
        'IMPERIAL_VISOR: göz yarığı göz hizasında',
        `Δ ${r3((sb.min.y + sb.max.y) / 2 - eyeY)} m`,
      );
    }
    ok(spanX > 0.12, 'IMPERIAL_VISOR: yüzü tam kapatıyor (tasarım gereği)', `kaplama ${r3(spanX)} m`);
  } else {
    ok(
      spanX < 0.12,
      `${helmetType}: gözler açık (burun demiri dışında kapama yok)`,
      `kaplama ${r3(spanX)} m`,
    );
  }
}

console.log(fails === 0 ? '\n✅ YÜZ AÇIK — ZIRH/MİĞFER YÜZÜ KAPATMIYOR' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
