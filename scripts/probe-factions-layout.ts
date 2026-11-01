import { createInitialCampaignState } from '../src/game/rules';

const s = createInitialCampaignState();
const factions: Record<string, any[]> = {};
for (const item of s.settlements) {
  factions[item.faction] = factions[item.faction] || [];
  factions[item.faction].push(item);
}
for (const [f, list] of Object.entries(factions)) {
  const xs = list.map(x => x.x);
  const zs = list.map(x => x.z);
  console.log(f + ' (' + list.length + ' settlements): X[' + Math.min(...xs) + '..' + Math.max(...xs) + '], Z[' + Math.min(...zs) + '..' + Math.max(...zs) + ']');
}
