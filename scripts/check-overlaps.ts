import { calculateBannerlordPartySpeed, getLordDetailedIntel } from '../src/game/campaignSystem';
import { createInitialCampaignState } from '../src/game/rules';

const state = createInitialCampaignState();

for (const lord of state.lords) {
  const intel = getLordDetailedIntel(lord, lord.x, lord.z, state.settlements);
  console.log(`${lord.name} (${intel.totalHealthy} troops): speed = ${intel.speedInfo.finalSpeed}`);
}
