/**
 * probe-battlefield.ts — 10.2/B1: karşılaşma noktasından arazi profili
 *
 *   npx tsx scripts/probe-battlefield.ts
 *
 * Bannerlord Battle Terrain System davranışını doğrular:
 *  1. Köprü başında savaş → sahnede köprü + nehir olur.
 *  2. Açık ovada nehir/köprü uydurulmaz.
 *  3. Doğuş kenarları yaklaşma vektörünü izler (düşman, dünya haritasında
 *     olduğu tarafta doğar) ve iki doğuş arası mesafe ~360 metredir.
 *  4. Aynı bölge deterministik olarak aynı sahneyi verir.
 *  5. Ormanlık bölgede ağaç yoğunluğu bozkırdan belirgin yüksektir; serpme
 *     konuşlanma bölgelerine ve nehir yatağına girmez.
 *  6. Köye yakın karşılaşmada köy evleri sahneye girer.
 */
import {
  buildBattlefieldProfile,
  battleToWorld,
  sampleBattleHeight,
  BATTLEFIELD_HALF_EXTENT,
} from '../src/game/battlefield.ts';
import { CONTINENTAL_BRIDGES } from '../src/game/mapGen.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* ── 1. Köprü başı ── */
const lycaron = CONTINENTAL_BRIDGES.find((b) => b.id === 'bridge_lycaron')!;
const bridgeProfile = buildBattlefieldProfile({
  worldX: lycaron.x,
  worldZ: lycaron.z,
  dirX: 1,
  dirZ: 0.3,
});
ok(bridgeProfile.hasRiver, 'köprü başında nehir var');
ok(bridgeProfile.bridge !== null, 'köprü başında sahnede köprü var', bridgeProfile.bridge?.name ?? '');
ok(bridgeProfile.waterY !== null, 'nehir sahnesinde su düzlemi var');
if (bridgeProfile.bridge) {
  const bw = battleToWorld(bridgeProfile, bridgeProfile.bridge.x, bridgeProfile.bridge.z);
  ok(
    Math.hypot(bw.x - lycaron.x, bw.z - lycaron.z) < 2,
    'köprü sahne konumu dünya köprüsüyle eşleşiyor',
    `sapma ${Math.hypot(bw.x - lycaron.x, bw.z - lycaron.z).toFixed(2)}`,
  );
}

/* ── 2. Açık ova: uydurma nehir/köprü yok ── */
// İmparatorluk ovalarında, nehir ağından uzak bir nokta bulmak için merkez seçimi:
// (10, 150) güney-orta ova; köprüler de yakın değil.
const plainProfile = buildBattlefieldProfile({ worldX: -30, worldZ: 40, dirX: 0, dirZ: -1 });
ok(plainProfile.bridge === null, 'köprüsüz bölgede köprü uydurulmaz');

/* ── 3. Doğuş kenarları yaklaşma vektörünü izler ── */
for (const [dx, dz, label] of [
  [1, 0, 'doğu'],
  [-0.5, 1, 'güneybatı'],
  [0.2, -1, 'kuzey'],
] as const) {
  const p = buildBattlefieldProfile({ worldX: 40, worldZ: -20, dirX: dx, dirZ: dz });
  const allyW = battleToWorld(p, p.allySpawn.x, p.allySpawn.z);
  const enemyW = battleToWorld(p, p.enemySpawn.x, p.enemySpawn.z);
  const vx = enemyW.x - allyW.x;
  const vz = enemyW.z - allyW.z;
  const dot = (vx * dx + vz * dz) / (Math.hypot(vx, vz) * Math.hypot(dx, dz));
  ok(dot > 0.98, `${label} yaklaşımında düşman dünya yönünde doğar`, `cos=${dot.toFixed(3)}`);
  const dist = Math.hypot(p.enemySpawn.x - p.allySpawn.x, p.enemySpawn.z - p.allySpawn.z);
  ok(dist > 340 && dist < 390, 'iki doğuş arası ~360 m', `${dist.toFixed(0)} m`);
}

/* ── 4. Determinizm: aynı bölge, aynı sahne ── */
const a = buildBattlefieldProfile({ worldX: -280, worldZ: -105, dirX: 1, dirZ: 0 });
const b = buildBattlefieldProfile({ worldX: -280, worldZ: -105, dirX: 1, dirZ: 0 });
ok(
  a.trees.length === b.trees.length &&
    a.trees.every((t, i) => t.x === b.trees[i].x && t.z === b.trees[i].z),
  'aynı merkez aynı serpme (deterministik)',
  `${a.trees.length} ağaç`,
);
ok(a.seed === b.seed, 'tohum merkezden türer');

/* ── 5. Orman yoğunluğu + serpme kuralları ── */
const steppe = buildBattlefieldProfile({ worldX: 300, worldZ: 60, dirX: -1, dirZ: 0 });
ok(
  a.trees.length > steppe.trees.length + 40,
  'Batanya ormanı bozkırdan yoğun ağaçlı',
  `orman ${a.trees.length}, bozkır ${steppe.trees.length}`,
);
const inZone = (p: typeof a, x: number, z: number) =>
  (x > p.allyDeploy.minX - 14 && x < p.allyDeploy.maxX + 14 && z > p.allyDeploy.minZ - 14 && z < p.allyDeploy.maxZ + 14) ||
  (x > p.enemyDeploy.minX - 14 && x < p.enemyDeploy.maxX + 14 && z > p.enemyDeploy.minZ - 14 && z < p.enemyDeploy.maxZ + 14);
ok(
  a.trees.every((t) => !inZone(a, t.x, t.z)) && a.rocks.every((r) => !inZone(a, r.x, r.z)),
  'serpme konuşlanma bölgelerine girmez',
);

/* ── 6. Köy yakınlığı ── */
const villageProfile = buildBattlefieldProfile({
  worldX: 100,
  worldZ: 100,
  dirX: 0,
  dirZ: 1,
  settlements: [{ name: 'Test Köyü', type: 'VILLAGE', x: 112, z: 104 }],
});
ok(
  villageProfile.village !== null && villageProfile.village.houses.length >= 5,
  'köye yakın savaşta köy evleri sahnede',
  `${villageProfile.village?.houses.length ?? 0} ev`,
);
const farProfile = buildBattlefieldProfile({
  worldX: 100,
  worldZ: 100,
  dirX: 0,
  dirZ: 1,
  settlements: [{ name: 'Uzak Köy', type: 'VILLAGE', x: 260, z: 240 }],
});
ok(farProfile.village === null, 'uzaktaki köy sahneye girmez');

/* ── 7. Yükseklik bütünlüğü ── */
for (const [label, p] of [
  ['köprü', bridgeProfile],
  ['orman', a],
  ['bozkır', steppe],
] as const) {
  let finite = true;
  let min = Infinity;
  let max = -Infinity;
  for (const h of p.heights) {
    if (!Number.isFinite(h)) finite = false;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  ok(finite, `${label}: tüm köşe yükseklikleri sonlu`, `aralık ${min.toFixed(1)}..${max.toFixed(1)}`);
  const centerH = sampleBattleHeight(p, 0, 0);
  ok(Number.isFinite(centerH), `${label}: merkez örneklemesi çalışıyor`);
  ok(
    Math.abs(p.allySpawn.z) < BATTLEFIELD_HALF_EXTENT && Math.abs(p.enemySpawn.z) < BATTLEFIELD_HALF_EXTENT,
    `${label}: doğuşlar alan içinde`,
  );
}

console.log(fails === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${fails} KONTROL BAŞARISIZ`);
process.exit(fails === 0 ? 0 : 1);
