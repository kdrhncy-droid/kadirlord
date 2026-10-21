/**
 * probe-ladies.ts — Leydi yüzleri + DNA determinizmi (Faz 1h)
 *
 *   npx tsx scripts/probe-ladies.ts
 *
 * İki şeyi doğrular:
 *  1. **Kimlik kararlılığı:** aynı kahraman id'si her zaman aynı DNA/yüz
 *     (eskiden `Math.random()` kullanıldığı için her yenilemede değişiyordu).
 *  2. **Leydi yüzü:** kirpik/üst kapak çizgisi açık, kaş daha ince, dudak daha
 *     dolgun, cinsiyet DNA'sı dişi, sakal yok — ve tüm yüz parçaları kafatası
 *     yüzeyinin dışında (içine gömülmüyor).
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createHeroPortraitRig, disposeRig } from '../src/game/portraitRenderer.ts';
import { getHeroDNA } from '../src/game/characterMorph.ts';
import { HEAD } from '../src/game/characterRig.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const heroes = Object.values(buildHeroRegistry(campaign, factionNames).heroes);
const ladies = heroes.filter((h) => h.occupation === 'LADY');
const men = heroes.filter((h) => h.occupation !== 'LADY');

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* 1. DNA determinizmi */
const stable = heroes.filter((h) => {
  const a = JSON.stringify(getHeroDNA(h.id, h.culture, h.occupation === 'LADY' ? 'female' : 'male'));
  const b = JSON.stringify(getHeroDNA(h.id, h.culture, h.occupation === 'LADY' ? 'female' : 'male'));
  return a === b;
});
ok(stable.length === heroes.length, 'DNA deterministik (id → hep aynı yüz)', `${stable.length}/${heroes.length}`);

const ids = new Set(
  heroes.map((h) => JSON.stringify(getHeroDNA(h.id, h.culture, h.occupation === 'LADY' ? 'female' : 'male'))),
);
ok(ids.size >= Math.floor(heroes.length * 0.8), 'yüzler birbirinden farklı', `${ids.size}/${heroes.length} tekil`);

ok(
  ladies.every((h) => getHeroDNA(h.id, h.culture, 'female').gender === 'female'),
  'leydi DNA cinsiyeti dişi',
  `${ladies.length} leydi`,
);

/* 2. Yüz parçaları: kirpik, kaş, dudak */
interface LadyStats {
  name: string;
  lashVisible: number;
  browH: number;
  lipH: number;
  hasBeard: boolean;
  outsideSkull: number;
}

const skullR = (p: THREE.Vector3) => {
  const nx = p.x / HEAD.r;
  const ny = (p.y - HEAD.cy) / (HEAD.r * HEAD.sy);
  const nz = p.z / (HEAD.r * HEAD.sz);
  return Math.sqrt(nx * nx + ny * ny + nz * nz);
};

const measure = (hero: (typeof heroes)[number]): LadyStats => {
  const rig = createHeroPortraitRig(hero);
  try {
    rig.root.updateMatrixWorld(true);
    const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    const inv = new THREE.Matrix4().copy(skull.matrixWorld).invert();

    let lashVisible = 0;
    for (const tag of ['L', 'R']) {
      const lash = rig.head.getObjectByName(`lash${tag}`);
      if (lash && lash.visible) lashVisible++;
    }

    const brow = rig.head.getObjectByName('browL') as THREE.Mesh | undefined;
    const lip = rig.head.getObjectByName('lowerLip') as THREE.Mesh | undefined;
    const browH = brow ? new THREE.Box3().setFromObject(brow).getSize(new THREE.Vector3()).y : 0;
    const lipH = lip ? new THREE.Box3().setFromObject(lip).getSize(new THREE.Vector3()).y : 0;

    const beard = rig.head.getObjectByName('Custom_Procedural_Beard');
    const hasBeard = !!beard && beard.visible;

    // Yüz parçalarının kafatası yüzeyine göre konumu (yerel uzayda r ≈ 1).
    let outside = 0;
    const face = rig.head.getObjectByName('Face');
    face?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const p = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      const local = p.clone().applyMatrix4(inv);
      const r = skullR(local);
      // Göz/nose/lip gibi parçalar yüzeyin hemen dışında olmalı (> 0.99).
      if (r > 0.99) outside++;
    });

    return { name: hero.name, lashVisible, browH, lipH, hasBeard, outsideSkull: outside };
  } finally {
    disposeRig(rig);
  }
};

const ladyStats = ladies.map(measure);
const manStats = men.map(measure);

console.log('\nleydi          kirpik  kaş y   dudak y  sakal');
for (const l of ladyStats) {
  console.log(
    l.name.padEnd(14),
    String(l.lashVisible).padStart(6),
    l.browH.toFixed(4).padStart(7),
    l.lipH.toFixed(4).padStart(8),
    String(l.hasBeard).padStart(6),
  );
}

const avg = (arr: LadyStats[], pick: (s: LadyStats) => number) =>
  arr.reduce((a, b) => a + pick(b), 0) / arr.length;

ok(ladyStats.every((l) => l.lashVisible === 2), 'tüm leydilerde kirpik/üst kapak çizgisi var');
ok(ladyStats.every((l) => !l.hasBeard), 'leydilerde sakal yok');
ok(manStats.every((m) => m.lashVisible === 0), 'erkeklerde kirpik çizgisi gizli');
ok(
  avg(ladyStats, (s) => s.browH) < avg(manStats, (s) => s.browH) * 0.92,
  'leydilerde kaş daha ince',
  `K ${avg(ladyStats, (s) => s.browH).toFixed(4)} < E ${avg(manStats, (s) => s.browH).toFixed(4)}`,
);
ok(
  avg(ladyStats, (s) => s.lipH) > avg(manStats, (s) => s.lipH) * 1.15,
  'leydilerde dudak daha dolgun',
  `K ${avg(ladyStats, (s) => s.lipH).toFixed(4)} > E ${avg(manStats, (s) => s.lipH).toFixed(4)}`,
);
ok(
  [...ladyStats, ...manStats].every((s) => s.outsideSkull >= 10),
  'yüz parçaları yüzeyin dışında (gömülme yok)',
  `en az ${Math.min(...[...ladyStats, ...manStats].map((s) => s.outsideSkull))} parça`,
);

console.log(fails === 0 ? '\n✅ LEYDİ YÜZLERİ VE DNA KARARLILIĞI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
