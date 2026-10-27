import assert from 'node:assert/strict';
import {
  advanceDailyEconomyAndWorld,
  createInitialCampaignState,
} from '../src/game/rules';
import {
  advanceDailyCaptivityAndEscape,
  advanceDailyPartyHealthAndPrisoners,
  calculateLordRansomValue,
  captureDefeatedLord,
  computePlayerDailyEscapeChance,
  donateCaptiveLordToDungeon,
  donatePrisonersToDungeon,
  executeCaptiveLord,
  getDungeonCaptiveLords,
  getPlayerCaptiveLords,
  payPlayerCaptivityRansom,
  recruitPrisonerStack,
  releaseCaptiveLord,
  ransomCaptiveLord,
  resolvePlayerCaptivityDilemma,
  triggerPlayerCapturedSequence,
} from '../src/game/partySystem';
import { commitBattleLoot, prepareBattleLoot } from '../src/game/lootTransaction';
import { checkHostileMapInterception } from '../src/game/encounter';

function runPrisonerSystemProbe() {
  const base = createInitialCampaignState('Komutan Demirhan', 'noble', {
    realisticBannerlordStart: false,
  });

  const targetLord = base.lords.find((l) => l.faction !== 'bandits')!;
  assert.ok(targetLord, 'Hedef soylu lord bulunmalı');

  // 1. Savaş Sonu: Komutanı Esir Alma vs Serbest Bırakma (Post-Battle Capture vs Release)
  const pendingCapture = prepareBattleLoot(base, {
    enemyLordId: targetLord.id,
    enemiesDefeated: 25,
    losses: {},
  });
  const capturedCommit = commitBattleLoot(base, pendingCapture, {
    finalInventoryItems: base.inventoryItems ?? [],
    leftoverLootItems: pendingCapture.lootItems,
    enemyLordFate: 'CAPTURE',
  });
  const capturedLord = capturedCommit.nextState.lords.find((l) => l.id === targetLord.id)!;
  assert.equal(capturedLord.characterState, 'CAPTIVE', 'Lord esir alınmış olmalı');
  assert.equal(capturedLord.captorId, 'player', 'Esir alan taraf oyuncu olmalı');
  assert.equal(getPlayerCaptiveLords(capturedCommit.nextState).length, 1);

  const releasedCommit = commitBattleLoot(base, pendingCapture, {
    finalInventoryItems: base.inventoryItems ?? [],
    leftoverLootItems: pendingCapture.lootItems,
    enemyLordFate: 'RELEASE',
  });
  const releasedAfterBattle = releasedCommit.nextState.lords.find((l) => l.id === targetLord.id)!;
  assert.equal(releasedAfterBattle.characterState ?? 'FREE', 'FREE');
  assert.equal(
    releasedAfterBattle.relation,
    Math.min(100, targetLord.relation + 10),
    'Savaş sonu serbest bırakma +10 ilişki kazandırmalı',
  );
  assert.equal(
    releasedCommit.nextState.honor ?? 0,
    (base.honor ?? 0) + 10,
    'Savaş sonu serbest bırakma +10 Onur kazandırmalı',
  );

  // 2. Fidye ile Sat (Ransom), Zindana At (Donate), Serbest Bırak (Release) ve İdam Et (Execute)
  const stateWithCaptive = captureDefeatedLord(base, targetLord.id);
  const expectedRansom = calculateLordRansomValue(targetLord);
  const ransomRes = ransomCaptiveLord(stateWithCaptive, targetLord.id);
  assert.equal(ransomRes.success, true);
  assert.equal(ransomRes.goldEarned, expectedRansom);
  assert.equal(ransomRes.nextState.gold, stateWithCaptive.gold + expectedRansom);
  assert.equal(getPlayerCaptiveLords(ransomRes.nextState).length, 0);

  const releaseRes = releaseCaptiveLord(stateWithCaptive, targetLord.id);
  assert.equal(releaseRes.success, true);
  assert.equal(releaseRes.relationGain, 10);
  assert.equal(
    releaseRes.nextState.lords.find((l) => l.id === targetLord.id)?.characterState,
    'FREE',
  );

  const townOrCastle = stateWithCaptive.settlements.find(
    (s) => s.type === 'TOWN' || s.type === 'CASTLE',
  )!;
  const donateRes = donateCaptiveLordToDungeon(
    stateWithCaptive,
    townOrCastle.id,
    targetLord.id,
  );
  assert.equal(donateRes.success, true);
  assert.ok(donateRes.influenceGained > 0, 'Zindana lord bağışlamak nüfuz kazandırmalı');
  assert.equal(
    getDungeonCaptiveLords(donateRes.nextState, townOrCastle.id).length,
    1,
    'Zindana atılan lord yerleşimin zindan listesinde görünmeli',
  );

  // Sıradan esirleri zindana bağışlama
  const stateWithTroopPrisoners = {
    ...base,
    prisoners: 5,
    prisonerStacks: [{ troopId: 'imp_recruit', count: 5, ready: 0, readinessProgress: 0 }],
  };
  const donateTroopsRes = donatePrisonersToDungeon(stateWithTroopPrisoners, townOrCastle.id);
  assert.equal(donateTroopsRes.success, true);
  assert.equal(donateTroopsRes.donatedCount, 5);
  assert.equal(donateTroopsRes.nextState.prisoners, 0);
  assert.ok(donateTroopsRes.influenceGained > 0);

  // İdam Et (Execute)
  const sameFactionOtherLord = stateWithCaptive.lords.find(
    (l) => l.id !== targetLord.id && l.faction === targetLord.faction,
  )!;
  const execRes = executeCaptiveLord(stateWithCaptive, targetLord.id);
  assert.equal(execRes.success, true);
  const deadLord = execRes.nextState.lords.find((l) => l.id === targetLord.id)!;
  assert.equal(deadLord.characterState, 'DEAD', 'İdam edilen lord DEAD durumuna geçmeli');
  assert.equal(deadLord.armySize, 0, 'İdam edilen lordun ordusu dağılmalı');
  const updatedSameFactionLord = execRes.nextState.lords.find(
    (l) => l.id === sameFactionOtherLord.id,
  )!;
  assert.equal(
    updatedSameFactionLord.relation,
    Math.max(-100, sameFactionOtherLord.relation - 50),
    'Aynı krallık lordlarıyla ilişki -50 düşmeli',
  );
  assert.equal(
    execRes.nextState.honor,
    (stateWithCaptive.honor ?? 0) - 30,
    'İdam onuru -30 düşürmeli',
  );

  // 3. Sıradan Askerler İçin Uyum Sağlama (Conformity) ve Sancağa Katma
  let conformityState: typeof base = {
    ...base,
    prisoners: 4,
    prisonerStacks: [{ troopId: 'imp_recruit', count: 4, ready: 0, readinessProgress: 0.85 }],
  };
  conformityState = advanceDailyPartyHealthAndPrisoners(conformityState).nextState;
  assert.ok(
    (conformityState.prisonerStacks?.[0]?.ready ?? 0) >= 1,
    'Günlük uyum ilerlemesi dolunca esir sancağa katılmaya hazır (ready >= 1) olmalı',
  );
  const recruitPrisonerRes = recruitPrisonerStack(conformityState, 'imp_recruit', 1);
  assert.equal(recruitPrisonerRes.success, true);
  assert.equal(recruitPrisonerRes.nextState.prisoners, 3);

  // 4. Oyuncunun Esir Düşmesi (Player Captured Sequence), Harita Kilidi ve Günlük Kaçış / İkilem
  const captor = base.lords.find((l) => l.faction === 'bandits')!;
  const playerCaptiveState = triggerPlayerCapturedSequence(
    base,
    captor,
    { infantry: 3 },
    2,
  );
  assert.equal(
    playerCaptiveState.playerCaptureState?.isCaptive,
    true,
    'Mağlubiyet sonrası oyuncu esaret moduna girmeli',
  );
  assert.equal(playerCaptiveState.playerCaptureState?.captorLordId, captor.id);

  // Esirken başka düşman partileri oyuncuyu yakalayamamalı
  const interceptWhileCaptive = checkHostileMapInterception({
    campaign: playerCaptiveState,
    playerX: playerCaptiveState.playerX,
    playerZ: playerCaptiveState.playerZ,
    lordPositions: new Map([[captor.id, { x: playerCaptiveState.playerX, z: playerCaptiveState.playerZ }]]),
    cooldowns: new Map(),
    nowSec: 100,
  });
  assert.equal(
    interceptWhileCaptive,
    null,
    'Oyuncu esirken haritada yeni zorunlu karşılaşma tetiklenmemeli',
  );

  const escapeChance = computePlayerDailyEscapeChance(playerCaptiveState, 0);
  assert.ok(escapeChance >= 5 && escapeChance <= 95);

  // Günlük tik ile esaret günü artışı ve rastgele ikilem / kaçış
  const afterDay1 = advanceDailyCaptivityAndEscape({
    ...playerCaptiveState,
    day: playerCaptiveState.day + 1,
  });
  if (afterDay1.playerCaptureState?.isCaptive) {
    assert.equal(afterDay1.playerCaptureState.daysCaptive, 1);
    assert.ok(
      afterDay1.playerCaptureState.activeEvent !== null,
      'Esaret altında rastgele metin ikilemi (dilemma) üretilmeli',
    );
    const dilemmaRes = resolvePlayerCaptivityDilemma(afterDay1, 'ENDURE');
    assert.ok(dilemmaRes.outcomeText.length > 0);
  } else {
    assert.ok(afterDay1.escapedCaptivityNotice !== null);
  }

  // Fidye ödeyerek esaretten kurtulma
  const richCaptiveState = {
    ...playerCaptiveState,
    gold: 5000,
  };
  const selfRansom = payPlayerCaptivityRansom(richCaptiveState);
  assert.equal(selfRansom.success, true);
  assert.equal(selfRansom.nextState.playerCaptureState, null);
  assert.ok(
    selfRansom.nextState.escapedCaptivityNotice !== null,
    'Esaretten kurtulunca bildirim penceresi tetiklenmeli',
  );

  // advanceDailyEconomyAndWorld entegrasyonu
  const worldAdvanced = advanceDailyEconomyAndWorld(playerCaptiveState);
  assert.ok(worldAdvanced.day === playerCaptiveState.day + 1);

  console.log('PASS probe-prisoner-system: Tüm esir ve esaret mekanikleri doğrulandı.');
}

runPrisonerSystemProbe();
