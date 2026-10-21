/**
 * probe-encounter.ts — Bannerlord Harita Kovalama, Kaçma ve Zorunlu Karşılaşma Testi
 *
 *   npx tsx scripts/probe-encounter.ts
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueModal } from '../src/components/DialogueModal.tsx';
import { DiplomacyModal } from '../src/components/DiplomacyModal.tsx';
import {
  type LordLiveRouteState,
  applyTacticalPlayerReactionToRoute,
  stepLordCampaignRoute,
} from '../src/game/campaignSystem.ts';
import {
  applyOption,
  buildDialogue,
  canExit,
  numberedOptions,
  stripSpeakerPrefix,
  validateDialogue,
} from '../src/game/dialogue.ts';
import {
  INTERCEPT_RADIUS,
  applyPlayerSurrender,
  applySacrificeEscape,
  checkHostileMapInterception,
  classifyEncounterScenario,
  evaluateHostileReaction,
  getLordPartyStrength,
  getPlayerPartyStrength,
  resolveCorneredBanditSurrender,
  simulateSendTroopsBattle,
} from '../src/game/encounter.ts';
import { createInitialCampaignState, getTotalTroops } from '../src/game/rules.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const baseCampaign = createInitialCampaignState('Komutan Demirhan', 'noble');

/* ── 1. Güçlü Haydut ve Güçlü Düşman Lordu Oyuncuyu Kovalayıp Yakalıyor mu? ── */
{
  // Zayıf oyuncu birliği (6 milis)
  const weakPlayerCampaign = {
    ...baseCampaign,
    playerX: 10,
    playerZ: 10,
    roster: { militia: 6, archer: 0, cavalry: 0, guard: 0 },
  };
  const playerStrength = getPlayerPartyStrength(weakPlayerCampaign);

  const bandit = {
    ...weakPlayerCampaign.lords.find((l) => l.faction === 'bandits')!,
    x: 24,
    z: 10,
    armySize: 32,
    roster: { militia: 16, archer: 8, cavalry: 6, guard: 2 },
  };

  const reaction = evaluateHostileReaction({
    lord: bandit,
    lordX: bandit.x,
    lordZ: bandit.z,
    playerX: weakPlayerCampaign.playerX,
    playerZ: weakPlayerCampaign.playerZ,
    playerStrength,
  });

  ok(
    reaction.kind === 'PURSUE_PLAYER',
    'güçlü haydut zayıf oyuncuyu görünce PURSUE_PLAYER moduna geçiyor',
    `oran=${reaction.strengthRatio}x`,
  );

  // Harita üzerinde yürüterek oyuncuyu 3.2m yarıçap içinde yakaladığını doğrula (16m ızgaraya takılmamalı!)
  const route: LordLiveRouteState = {
    x: bandit.x,
    z: bandit.z,
    rotY: 0,
    targetSettlementId: null,
    waypoints: [],
    currentAction: bandit.currentAction,
  };

  let intercepted = false;
  const cooldowns = new Map<string, number>();
  for (let step = 0; step < 120; step++) {
    applyTacticalPlayerReactionToRoute({
      lord: bandit,
      route,
      settlements: weakPlayerCampaign.settlements,
      playerX: weakPlayerCampaign.playerX,
      playerZ: weakPlayerCampaign.playerZ,
      playerStrength,
    });
    stepLordCampaignRoute(bandit, route, 0.1, 1, weakPlayerCampaign.settlements);

    const posMap = new Map([[bandit.id, { x: route.x, z: route.z }]]);
    const hit = checkHostileMapInterception({
      campaign: { ...weakPlayerCampaign, lords: [bandit] },
      playerX: weakPlayerCampaign.playerX,
      playerZ: weakPlayerCampaign.playerZ,
      lordPositions: posMap,
      cooldowns,
      nowSec: step * 0.1,
    });
    if (hit) {
      intercepted = true;
      ok(
        hit.scenario === 'BANDIT_CAUGHT_PLAYER' && hit.forced,
        'güçlü haydut oyuncunun dibine girip zorunlu karşılaşmayı tetikliyor',
        `mesafe=${hit.distance.toFixed(2)}m <= ${INTERCEPT_RADIUS}m`,
      );
      break;
    }
  }
  ok(intercepted, 'kovalayan güçlü parti 16m ızgaraya takılmadan oyuncuyu yakaladı');
}

/* ── 2. Zayıf Haydut ve Zayıf Düşman Lordu Güçlü Oyuncudan Kaçıyor mu? ── */
{
  const strongPlayerCampaign = {
    ...baseCampaign,
    playerX: 10,
    playerZ: 10,
    roster: { militia: 18, archer: 16, cavalry: 14, guard: 12 },
  };
  const playerStrength = getPlayerPartyStrength(strongPlayerCampaign);

  const weakBandit = {
    ...strongPlayerCampaign.lords.find((l) => l.faction === 'bandits')!,
    x: 22,
    z: 10,
    armySize: 7,
    roster: { militia: 5, archer: 2, cavalry: 0, guard: 0 },
  };

  const reaction = evaluateHostileReaction({
    lord: weakBandit,
    lordX: weakBandit.x,
    lordZ: weakBandit.z,
    playerX: strongPlayerCampaign.playerX,
    playerZ: strongPlayerCampaign.playerZ,
    playerStrength,
  });

  ok(
    reaction.kind === 'FLEE_FROM_PLAYER',
    'zayıf haydut güçlü oyuncuyu görünce FLEE_FROM_PLAYER moduna geçiyor',
    `oran=${reaction.strengthRatio}x`,
  );

  const route: LordLiveRouteState = {
    x: weakBandit.x,
    z: weakBandit.z,
    rotY: 0,
    targetSettlementId: null,
    waypoints: [],
    currentAction: weakBandit.currentAction,
  };
  const startDist = Math.hypot(
    route.x - strongPlayerCampaign.playerX,
    route.z - strongPlayerCampaign.playerZ,
  );
  for (let step = 0; step < 30; step++) {
    applyTacticalPlayerReactionToRoute({
      lord: weakBandit,
      route,
      settlements: strongPlayerCampaign.settlements,
      playerX: strongPlayerCampaign.playerX,
      playerZ: strongPlayerCampaign.playerZ,
      playerStrength,
    });
    stepLordCampaignRoute(weakBandit, route, 0.1, 1, strongPlayerCampaign.settlements);
  }
  const endDist = Math.hypot(
    route.x - strongPlayerCampaign.playerX,
    route.z - strongPlayerCampaign.playerZ,
  );
  ok(
    endDist > startDist + 2.0,
    'kaçan zayıf haydut oyuncudan uzaklaşıyor',
    `${startDist.toFixed(1)}m → ${endDist.toFixed(1)}m`,
  );
}

/* ── 3. Zorunlu Karşılaşma Diyalog Senaryoları ve Savaş Öncesi Karar Menüsü ── */
{
  const warLord = {
    ...baseCampaign.lords.find((l) => l.faction !== 'bandits')!,
    isAtWarWithPlayer: true,
    armySize: 48,
    roster: { militia: 16, archer: 14, cavalry: 10, guard: 8 },
  };
  const bandit = {
    ...baseCampaign.lords.find((l) => l.faction === 'bandits')!,
    armySize: 30,
    roster: { militia: 18, archer: 8, cavalry: 4, guard: 0 },
  };

  for (const scenario of [
    'BANDIT_CAUGHT_PLAYER',
    'PLAYER_CAUGHT_BANDIT',
    'LORD_CAUGHT_PLAYER',
    'PLAYER_CAUGHT_LORD',
  ] as const) {
    const targetLord = scenario.includes('BANDIT') ? bandit : warLord;
    const g = buildDialogue({
      lord: targetLord,
      campaign: baseCampaign,
      relation: -25,
      atWar: true,
      forcedEncounter: true,
      scenario,
    });
    const problems = validateDialogue(g);
    ok(problems.length === 0, `${scenario} grafiği geçerli`, problems.join(' | '));
    ok(canExit(g), `${scenario} grafiğinden çıkış/aksiyon yolu var`);
  }

  // Kıstırılan oyuncunun "Vedalaş" diyerek kaçamadığını doğrula
  const caughtGraph = buildDialogue({
    lord: warLord,
    campaign: baseCampaign,
    relation: -30,
    atWar: true,
    forcedEncounter: true,
    scenario: 'LORD_CAUGHT_PLAYER',
  });
  const rootOpts = numberedOptions(caughtGraph.nodes.root);
  ok(
    !rootOpts.some((o) => o.id === 'war-leave'),
    'zorunlu karşılaşmada serbest "Vedalaş" seçeneği yok',
  );

  // "Savaşa hazırlan" seçeneği encounter-menu düğümüne götürüyor mu?
  const step1 = applyOption(caughtGraph, 'root', 'war-attack', { relation: -30, gold: 500 });
  ok(step1.nextId === 'encounter-menu', 'savaş seçeneği savaş öncesi karşılaşma menüsünü açıyor');

  const step2 = applyOption(caughtGraph, 'encounter-menu', 'enc-attack', {
    relation: -30,
    gold: 500,
  });
  ok(
    step2.encounterAction?.kind === 'START_BATTLE' && step2.closed,
    'Saldır seçeneği 3B meydan savaşını başlatıyor',
  );

  const stepAuto = applyOption(caughtGraph, 'encounter-menu', 'enc-autoresolve', {
    relation: -30,
    gold: 500,
  });
  ok(
    stepAuto.encounterAction?.kind === 'AUTO_RESOLVE',
    'Askerleri Gönder seçeneği otomatik muharebeyi tetikliyor',
  );

  const stepEsc = applyOption(caughtGraph, 'encounter-menu', 'enc-escape', {
    relation: -30,
    gold: 500,
  });
  ok(
    stepEsc.encounterAction?.kind === 'SACRIFICE_ESCAPE',
    'Artçı Bırakıp Kaç seçeneği kaçış aksiyonunu tetikliyor',
  );
}

/* ── 4. Taktik Karşılaşma Hesapları (Artçı Bırakma, Oto-Çözüm, Haydut Teslimiyeti) ── */
{
  const warLord = baseCampaign.lords.find((l) => l.isAtWarWithPlayer)!;
  const beforeTroops = getTotalTroops(baseCampaign.roster);
  const escRes = applySacrificeEscape(baseCampaign, warLord);
  const afterTroops = getTotalTroops(escRes.nextState.roster);
  ok(
    escRes.sacrificedTotal >= 2 && afterTroops === beforeTroops - escRes.sacrificedTotal,
    'artçı bırakıp kaçma asker sayısını doğru düşürüyor',
    `${beforeTroops} → ${afterTroops} (-${escRes.sacrificedTotal})`,
  );

  const autoRes = simulateSendTroopsBattle(baseCampaign, warLord);
  ok(
    typeof autoRes.victory === 'boolean' && autoRes.enemiesDefeated >= 1,
    'otomatik muharebe simülasyonu geçerli sonuç üretiyor',
  );

  const strongPlayer = {
    ...baseCampaign,
    roster: { militia: 20, archer: 20, cavalry: 15, guard: 15 },
  };
  const weakBandit = {
    ...baseCampaign.lords.find((l) => l.faction === 'bandits')!,
    armySize: 8,
    roster: { militia: 6, archer: 2, cavalry: 0, guard: 0 },
  };
  const surRes = resolveCorneredBanditSurrender(strongPlayer, weakBandit);
  ok(
    surRes.surrendered && surRes.prisonersGained >= 2 && surRes.goldGained >= 35,
    'kıstırılan zayıf haydutlar ezici orduya savaşmadan teslim oluyor',
    `+${surRes.prisonersGained} esir, +${surRes.goldGained} dinar`,
  );

  const playerSur = applyPlayerSurrender(baseCampaign, warLord);
  ok(
    playerSur.goldLost > 0 && playerSur.nextState.gold === baseCampaign.gold - playerSur.goldLost,
    'oyuncu teslimiyeti haraç düşerek uygulanıyor',
  );
}

/* ── 5. Görsel / UI Doğrulaması: Diyalog Ekranında Diğer Lordların İsimleri Çıkmamalı ── */
{
  const targetLord = baseCampaign.lords[0];
  const otherLords = baseCampaign.lords.slice(1);

  const dlgHtml = renderToStaticMarkup(
    React.createElement(DialogueModal, {
      campaign: baseCampaign,
      lord: targetLord,
      forcedEncounter: true,
      encounterScenario: 'LORD_CAUGHT_PLAYER',
      onClose: () => {},
    }),
  );

  ok(
    dlgHtml.includes('data-testid="forced-encounter-badge"'),
    'zorunlu karşılaşmada kapatma tuşu yerine ZORUNLU KARŞILAŞMA rozeti var',
  );
  ok(
    !dlgHtml.includes('aria-label="Diyaloğu kapat"'),
    'zorunlu karşılaşmada X kapatma düğmesi gizli',
  );
  ok(
    otherLords.every((other) => !dlgHtml.includes(other.name)),
    'DialogueModal içinde diğer lordların isimleri görünmüyor',
  );

  const dipHtml = renderToStaticMarkup(
    React.createElement(DiplomacyModal, {
      selectedLord: targetLord,
      campaign: baseCampaign,
      onClose: () => {},
      onSelectLord: () => {},
      onApplyDiplomacyResult: () => {},
      onStartFieldBattle: () => {},
    }),
  );
  ok(
    otherLords.every((other) => !dipHtml.includes(`${other.title} ${other.name}`)),
    'DiplomacyModal içindeki tüm lordların isim şeridi kaldırıldı',
  );

  const stripped = stripSpeakerPrefix(`${targetLord.name}: "Kılıcını çek!"`, targetLord.name);
  ok(
    stripped === 'Kılıcını çek!' && !stripped.includes(targetLord.name),
    'konuşma metnindeki mükerrer lord adı öneki temizleniyor',
    stripped,
  );
}

console.log(fails === 0 ? '\n✅ KARŞILAŞMA & DİYALOG SİSTEMİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
