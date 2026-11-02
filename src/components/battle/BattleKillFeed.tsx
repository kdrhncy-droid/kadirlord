import React from 'react';
import type { KillFeedItem } from '../../game/arenaTypes';

export interface BattleKillFeedProps {
  killFeed: KillFeedItem[];
  orderShout: string | null;
}

export const BattleKillFeed: React.FC<BattleKillFeedProps> = ({ killFeed, orderShout }) => {
  return (
    <>
      {/* BANNERLORD AUTHENTIC KILL FEED (Top Right) */}
      {killFeed.length > 0 && (
        <aside
          aria-label="Savaş Bildirimleri"
          className="absolute top-20 right-4 z-30 flex flex-col gap-1.5 pointer-events-none select-none max-w-xs"
        >
          {killFeed.map((item) => (
            <div
              key={item.id}
              className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wide flex items-center justify-between gap-2 border shadow-lg backdrop-blur-sm transition-all duration-300 ${
                item.killerTeam === 'ALLY'
                  ? 'bg-emerald-950/85 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/85 border-rose-500/40 text-rose-200'
              }`}
            >
              <span className="truncate max-w-[110px]">{item.killer}</span>
              <span className="text-amber-400">{item.icon}</span>
              <span className="truncate max-w-[110px] opacity-90">{item.victim}</span>
            </div>
          ))}
        </aside>
      )}

      {/* TACTICAL ORDER SHOUT BANNER */}
      {orderShout && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-35 pointer-events-none animate-bounce">
          <div className="px-6 py-2 rounded bg-black/90 border-2 border-[#c6a15b] shadow-[0_0_25px_rgba(198,161,91,0.6)] text-center">
            <div className="text-sm font-black tracking-widest text-[#fde68a] uppercase drop-shadow">
              {orderShout}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
