/**
 * probe-portrait-frame.ts — Baked portre **kadrajı** (geometrik) doğrulaması
 *
 *   npx tsx scripts/probe-portrait-frame.ts
 *
 * WebGL olmadığı için piksel üretilemez; bunun yerine portre kamerası kurulur ve
 * baş + omuz bölgesinin NDC (ekran) uzayındaki sınırları ölçülür:
 *  - kafa yatayda ortada, üstte nefes payı var, çene altında omuzlar görünüyor,
 *  - hiçbir kahramanda kafa kadrajdan taşmıyor.
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createHeroPortraitRig, disposeRig, createPortraitCamera } from '../src/game/portraitRenderer.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const heroes = Object.values(buildHeroRegistry(campaign, factionNames).heroes);

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

interface Frame {
  id: string;
  name: string;
  headMinX: number;
  headMaxX: number;
  headMinY: number;
  headMaxY: number;
  neckY: number;
  chestTopY: number;
  shoulderSpan: number;
}

function measure(hero: (typeof heroes)[number]): Frame {
  const rig = createHeroPortraitRig(hero);
  try {
    const camera = createPortraitCamera(rig);
    const project = (box: THREE.Box3) => {
      const pts: THREE.Vector3[] = [];
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).project(camera));
      return {
        minX: Math.min(...pts.map((p) => p.x)),
        maxX: Math.max(...pts.map((p) => p.x)),
        minY: Math.min(...pts.map((p) => p.y)),
        maxY: Math.max(...pts.map((p) => p.y)),
      };
    };

    // Kadraj ölçütü **kafatası** üzerinden: sakal/saç grubun kutusunu
    // büyütüp "çene kadraj dışında" yanlış pozitifi üretiyordu (Faz 9f).
    const coreMesh = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as
      | THREE.Mesh
      | undefined;
    const headBox = coreMesh ? new THREE.Box3().setFromObject(coreMesh) : new THREE.Box3().setFromObject(rig.head);
    const head = project(headBox);

    // Boyun: portrenin alt kısmında görünmeli (baş-göğüs geçişi).
    const neck = new THREE.Vector3();
    rig.neck.getWorldPosition(neck);
    const neckP = neck.clone().project(camera);
    const shoulderL = new THREE.Vector3();
    const shoulderR = new THREE.Vector3();
    rig.leftUpperArm.getWorldPosition(shoulderL);
    rig.rightUpperArm.getWorldPosition(shoulderR);
    const slP = shoulderL.clone().project(camera);
    const srP = shoulderR.clone().project(camera);

    return {
      id: hero.id,
      name: hero.name,
      headMinX: head.minX,
      headMaxX: head.maxX,
      headMinY: head.minY,
      headMaxY: head.maxY,
      neckY: neckP.y,
      chestTopY: Math.max(slP.y, srP.y),
      shoulderSpan: Math.abs(srP.x - slP.x),
    };
  } finally {
    disposeRig(rig);
  }
}

const frames = heroes.map(measure);
const f0 = frames[0];

/* 1. Kafa görünür ve kadraj içinde */
const headTops = frames.map((f) => f.headMaxY);
const headBottoms = frames.map((f) => f.headMinY);
const headLefts = frames.map((f) => f.headMinX);
const headRights = frames.map((f) => f.headMaxX);

ok(
  headTops.every((v) => v < 1) && headBottoms.every((v) => v > -1),
  'kafa dikeyde kadraj içinde',
  `tepe ${Math.max(...headTops).toFixed(2)} … çene ${Math.min(...headBottoms).toFixed(2)} NDC`,
);
ok(
  headLefts.every((v) => v > -1) && headRights.every((v) => v < 1),
  'kafa yatayda kadraj içinde',
  `${Math.min(...headLefts).toFixed(2)} … ${Math.max(...headRights).toFixed(2)} NDC`,
);

/* 2. Kompozisyon: üstte nefes payı, yüz belirgin büyüklükte */
ok(f0.headMaxY < 0.92, 'tepede nefes payı var', `${f0.headMaxY.toFixed(2)} < 0.92`);
ok(f0.headMaxY > 0.2, 'kafa yeterince büyük (kadrajı dolduruyor)', `tepe ${f0.headMaxY.toFixed(2)}`);
ok(f0.headMinY > -0.6, 'çene altında omuz/göğüs görünüyor', `çene ${f0.headMinY.toFixed(2)}`);

/* 3. Yatay ortalama: 3/4 açı → hafif sağa kayma kabul, merkezden uzaklaşmasın */
const centers = frames.map((f) => (f.headMinX + f.headMaxX) / 2);
ok(
  centers.every((c) => Math.abs(c) < 0.35),
  'kafa yatayda ortada (hafif 3/4 açı)',
  `merkez ${Math.min(...centers).toFixed(2)} … ${Math.max(...centers).toFixed(2)}`,
);
ok(
  frames.every((f) => f.headMaxX - f.headMinX > 0.3),
  'kafa genişliği portre için yeterli',
  `${(f0.headMaxX - f0.headMinX).toFixed(2)} NDC`,
);

/* 4. Boyun/göğüs: portre "baş + boyun + göğüs üstü" okunuyor */
ok(
  frames.every((f) => f.neckY > -1),
  'boyun kadraj içinde (baş-göğüs geçişi görünüyor)',
  `boyun ${Math.min(...frames.map((f) => f.neckY)).toFixed(2)} NDC`,
);
ok(
  frames.every((f) => f.chestTopY < 0.1 && f.chestTopY > -1.05),
  'omuz hattı kadrajın alt yarısında görünüyor',
  `omuz ${Math.max(...frames.map((f) => f.chestTopY)).toFixed(2)} … ${Math.min(...frames.map((f) => f.chestTopY)).toFixed(2)} NDC`,
);
ok(
  frames.every((f) => f.shoulderSpan > 0.8),
  'omuzlar kadraj genişliğini dolduruyor',
  `${f0.shoulderSpan.toFixed(2)} NDC`,
);
ok(
  frames.every((f) => f.headMinY > -0.85),
  'çene kadraj içinde (alt kesim çenenin altında kalıyor)',
  `çene ${Math.min(...frames.map((f) => f.headMinY)).toFixed(2)} NDC`,
);

/* 5. Tutarlılık: 40 portre de aynı kadraj ailesinde */
const spread = Math.max(...headTops) - Math.min(...headTops);
ok(spread < 0.25, 'tüm kahramanlarda kadraj tutarlı', `tepe farkı ${spread.toFixed(2)}`);

console.log(fails === 0 ? '\n✅ PORTRE KADRAJI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
