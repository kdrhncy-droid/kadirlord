/**
 * probe-hud.tsx — Faz 4: HUD sadeleştirmesinin sözleşme testi
 *
 *   npx tsx scripts/probe-hud.tsx
 *
 * GameHud sunucu tarafında HTML'e çevrilir; menü şeridindeki düğme sayısı,
 * kaldırılan mükerrer düğmeler ve pazar kuralı **yapısal** olarak doğrulanır.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { GameHud } from '../src/components/GameHud.tsx';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(GameHud, {
      subMode: 'overworld',
      campaignTimeScale: 1,
      campaign,
      nearSettlement: null,
      nearLord: null,
      mapTelemetry: {
        focusX: 0,
        focusZ: 0,
        zoomDist: 120,
        yawDeg: 0,
        isFollowingPlayer: true,
        biomeLabel: 'Ova',
        partySpeed: 5.2,
        followingLordName: null,
        targetSettlementName: null,
        onRoad: false,
        isMoving: true,
        labels: [],
      },
      cameraActionsRef: { current: null },
      activeOrder: 'FOLLOW',
      battleTelemetry: { playerHp: 100, playerMaxHp: 100 } as never,
      muted: false,
      onSetTimeScale: () => {},
      onToggleMute: () => {},
      onPause: () => {},
      onRestart: () => {},
      onSetTacticalOrder: () => {},
      onOpenSettlement: () => {},
      onOpenDiplomacy: () => {},
      onStartQuickBattle: () => {},
      onRetreatBattle: () => {},
      onAdvanceDay: () => {},
      onOpenMarketModal: () => {},
      onOpenCharacterArena: () => {},
      onOpenKingdomModal: () => {},
      onOpenCharacterCreator: () => {},
      onOpenEncyclopedia: () => {},
      ...over,
    } as never),
  );

const html = render();
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* 1. Beş çekirdek düğme */
for (const label of ['Karakter [C]', 'Envanter [I]', 'Ordum (', 'Harita &amp; Günlük', 'Divan [K]', 'Ansiklopedi [N]']) {
  ok(html.includes(label), `menüde "${label.replace('&amp;', '&')}" var`);
}

/* 2. Kaldırılan mükerrer öğeler */
ok(!text.includes('Berber & Suret [B]'), 'Berber düğmesi menüden kalktı');
ok(!text.includes('Karakter & Savaş Arenası'), 'Arena düğmesi HUD menüsünden kalktı');
ok(!text.includes('Kıta Atlası ('), 'Atlas ayrı düğme değil (Harita & Günlük içinde)');
ok(!text.includes('Vakanüvis') || !text.includes('Vakanüvis '),
   'Vakanüvis ayrı düğme değil',
   'panel kapalıyken görünmemeli');
ok(!text.includes('Tam Kıta [V]'), 'üst kamera şeridi kaldırıldı');
ok(!text.includes('Sancak [C]'), 'üstteki "Sancak [C]" kamera düğmesi kaldırıldı');

/* 3. Menü şeridindeki düğme sayısı 9 → 6 (5 çekirdek + Harita & Günlük) */
const dockStart = html.indexOf('data-testid="hud-dock"');
const dockEnd = html.indexOf('data-testid="hud-time-dial"', dockStart) > 0
  ? html.indexOf('data-testid="hud-time-dial"', dockStart)
  : html.length;
const dockHtml = dockStart >= 0 && dockEnd > dockStart ? html.slice(dockStart, dockEnd) : '';
const dockCount = (dockHtml.match(/<button/g) ?? []).length;
ok(dockCount === 6, 'menü şeridinde 6 düğme var (eskiden 9)', `${dockCount}`);

/* 4. Pazar kuralı: yerleşim yokken pazar düğmesi pasif */
const noSettlement = render({ canTrade: false });
ok(
  noSettlement.includes('Pazaryeri (yerleşimde)') || !noSettlement.includes('Pazaryeri'),
  'yerleşim dışında pazar düğmesi pasif/etiketli',
);

/* 5. Envanter sekmesi pazar açmıyor (I tuşu etiketi) */
ok(!text.includes('Envanter & Pazar'), '"Envanter & Pazar" etiketi kalmadı');

/* 6. Sağ alt durum şeridi korunuyor (altın, asker, erzak) */
ok(text.includes('Dinar'), 'sağ alt şeritte altın var');
ok(text.includes('Asker'), 'sağ alt şeritte asker sayısı var');

/* 7. Zaman kontrolü korunuyor */
ok(html.includes('▶▶▶') && html.includes('||'), 'zaman ölçeği düğmeleri duruyor');

console.log(fails === 0 ? '\n✅ HUD SADELEŞTİRME DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
