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
import { FACTION_INFO, createInitialCampaignState } from '../src/game/rules.ts';
import { GameHud } from '../src/components/GameHud.tsx';
import { WorldWarPanel } from '../src/components/WorldWarPanel.tsx';

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

/* 1. Altı çekirdek Bannerlord sol alt menü ikonu (C, I, P, J, L, K) */
for (const testId of [
  'hud-open-character',
  'hud-open-inventory',
  'hud-open-party',
  'hud-open-quests',
  'hud-open-clan',
  'hud-open-kingdom',
]) {
  ok(html.includes(`data-testid="${testId}"`), `menüde "${testId}" var`);
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

/* 6. Sağ alt durum şeridi korunuyor (altın, asker, erzak) ve 0 askerde oyuncu + ağabey (2) sayılıyor */
ok(text.includes('Dinar'), 'sağ alt şeritte altın var');
ok(text.includes('Asker'), 'sağ alt şeritte asker sayısı var');

const realisticCampaign = createInitialCampaignState('Komutan Demirhan', 'noble', {
  realisticBannerlordStart: true,
});
const realisticHtml = render({ campaign: realisticCampaign });
const realisticText = realisticHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok(
  realisticText.includes('Sancak Birliği: 2 /'),
  'yeni oyunda (0 asker) sağ alt Sancak Birliği oyuncuyu ve ağabeyini sayarak 2 gösteriyor',
);
ok(
  realisticText.includes('2 Kişi') && realisticText.includes('0 Asker'),
  'Sancak Birliği ipucunda 2 Kahraman (Sen & Aile/Yoldaş) ve 0 Asker ayrımı var',
);

/* 7. Zaman kontrolü korunuyor */
ok(html.includes('▶▶▶') && html.includes('||'), 'zaman ölçeği düğmeleri duruyor');

/* 8. Faz 11: canlı dünya panosu (WorldWarPanel) */
const warHtml = renderToStaticMarkup(React.createElement(WorldWarPanel, { campaign }));
ok(campaign.world!.wars.length === 2, 'başlangıçta iki aktif savaş var', `${campaign.world!.wars.length}`);
ok(warHtml.includes('Aktif Savaşlar (2)'), 'savaş panosu aktif savaş sayısını yazıyor');
ok(
  warHtml.includes(FACTION_INFO.vlandia.name) && warHtml.includes(FACTION_INFO.battania.name),
  'savaş etiketinde iki tarafın adı geçiyor',
);
ok(/·\s\d+ gün/.test(warHtml), 'savaşın kaç gündür sürdüğü yazılı');
ok(warHtml.includes('data-testid="active-wars"'), 'savaş panosu işaretli');
ok(!warHtml.includes('data-testid="world-stats"'), 'olay yokken sayaç şeridi gizleniyor');

const withEvents = {
  ...campaign,
  world: {
    ...campaign.world!,
    stats: { ...campaign.world!.stats, events: 12, fiefsChangedHands: 3, warsDeclared: 2, warsEnded: 1, siegesWon: 2, reinforcements: 5 },
  },
};
const statsHtml = renderToStaticMarkup(React.createElement(WorldWarPanel, { campaign: withEvents }));
ok(statsHtml.includes('data-testid="world-stats"'), 'olay birikince sayaç şeridi görünüyor');
ok(statsHtml.includes('FETİH 3') && statsHtml.includes('OLAY 12'), 'sayaçlar doğru değerleri yazıyor');
ok(statsHtml.includes('KUŞATMA 2') && statsHtml.includes('BARIŞ 1'), 'kuşatma ve barış sayaçları yazılı');

const noWars = { ...campaign, world: { ...campaign.world!, wars: [], stats: { ...campaign.world!.stats, events: 0 } } };
ok(renderToStaticMarkup(React.createElement(WorldWarPanel, { campaign: noWars })) === '', 'savaş ve olay yokken panel boş');

console.log(fails === 0 ? '\n✅ HUD SADELEŞTİRME DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
