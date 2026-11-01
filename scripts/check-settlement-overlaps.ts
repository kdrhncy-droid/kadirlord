import { createInitialCampaignState } from '../src/game/rules.ts';

const state = createInitialCampaignState();
const settlements = state.settlements;

console.log(`[CHECK-SETTLEMENTS] Toplam yerleşim sayısı: ${settlements.length}`);

interface OverlapPair {
  s1: typeof settlements[0];
  s2: typeof settlements[0];
  dist: number;
}

const pairs: OverlapPair[] = [];

for (let i = 0; i < settlements.length; i++) {
  const s1 = settlements[i];
  for (let j = i + 1; j < settlements.length; j++) {
    const s2 = settlements[j];
    const dist = Math.hypot(s1.x - s2.x, s1.z - s2.z);
    if (dist < 15.0) {
      pairs.push({ s1, s2, dist });
    }
  }
}

pairs.sort((a, b) => a.dist - b.dist);

console.log(`[CHECK-SETTLEMENTS] 15 metreden yakın toplam ${pairs.length} çift bulundu:`);
pairs.slice(0, 40).forEach(({ s1, s2, dist }) => {
  console.log(
    `  - [${dist.toFixed(1)}m] ${s1.name} (${s1.type}, ${s1.faction}) [${s1.x}, ${s1.z}] <-> ${s2.name} (${s2.type}, ${s2.faction}) [${s2.x}, ${s2.z}]`,
  );
});
