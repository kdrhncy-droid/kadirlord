import React from 'react';
import { FACTION_INFO, type CampaignState } from '../game/rules';
import { summarizeWars } from '../game/worldSim';

/**
 * Faz 11 — canlı dünya panosu.
 *
 * Vakanüvis (Divan) sekmesinde, günlük satırlarının üstünde durur. Oyuncunun
 * kendi krallığının savaşları en üstte olacak şekilde sıralanır (summarizeWars
 * zaten bu sırayla döner), her savaş için kaç gündür sürdüğü ve sayısal üstünlük
 * yazılır. Sayaçlar yalnızca dünyada bir olay biriktiğinde görünür — yeni seferin
 * ilk gününde boş bir "0" şeridi göstermemek için.
 */
export function WorldWarPanel({ campaign }: { campaign: CampaignState }) {
  const wars = summarizeWars(campaign);
  const stats = campaign.world?.stats;
  const showStats = Boolean(stats && stats.events > 0);

  if (wars.length === 0 && !showStats) return null;

  return (
    <div className="mb-3" data-testid="active-wars">
      {wars.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#c6a15b] mb-1">
            Aktif Savaşlar ({wars.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wars.map((war) => (
              <span
                key={`${war.a}-${war.b}`}
                className="px-2 py-0.5 rounded border border-[#f59e0b]/40 bg-[#241a10] text-[11px] text-[#fde68a]"
              >
                {war.label} · {war.days} gün
                {war.leader ? ` · üstün: ${FACTION_INFO[war.leader].name}` : ''}
              </span>
            ))}
          </div>
        </>
      )}
      {showStats && stats && (
        <div
          className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono-tabular text-[#b9a684]"
          data-testid="world-stats"
        >
          <span>FETİH {stats.fiefsChangedHands}</span>
          <span>SAVAŞ {stats.warsDeclared}</span>
          <span>BARIŞ {stats.warsEnded}</span>
          <span>KUŞATMA {stats.siegesWon}</span>
          <span>TAKVİYE {stats.reinforcements}</span>
          <span>OLAY {stats.events}</span>
        </div>
      )}
    </div>
  );
}
