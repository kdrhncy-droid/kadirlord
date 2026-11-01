/**
 * MapBattleInterventionModal.tsx — Bannerlord Tarzı Harita Meydan Muharebesi Müdahale Ekranı
 *
 * Haritada iki lord/ordu savaşa girdiğinde oyuncu yanlarına gidip savaşa müdahale edebilir:
 *  - Müttefikine katılarak omuz omuza savaşabilir,
 *  - Düşman ordusuna saldırabilir,
 *  - Veya çatışmaya bulaşmadan güvenli mesafeye çekilebilir.
 */
import React from 'react';
import { Shield, Swords, AlertTriangle, ArrowRight, UserCheck, Flag } from 'lucide-react';
import type { MapBattleEvent } from '../game/mapBattle.ts';
import { getMapBattleInterventionInfo } from '../game/mapBattle.ts';
import { type CampaignState, type LordAgent, getPlayerPartyHeadcount } from '../game/rules.ts';
import { sound } from '../game/sound.ts';

interface MapBattleInterventionModalProps {
  battle: MapBattleEvent;
  campaign: CampaignState;
  onJoinBattle: (battle: MapBattleEvent, sideToSupport: 'ATTACKER' | 'DEFENDER') => void;
  onLeaveBattle: () => void;
}

export const MapBattleInterventionModal: React.FC<MapBattleInterventionModalProps> = ({
  battle,
  campaign,
  onJoinBattle,
  onLeaveBattle,
}) => {
  const intervention = getMapBattleInterventionInfo(battle, campaign);

  const attackerLord = campaign.lords.find((l) => l.id === battle.attackerId);
  const defenderLord = campaign.lords.find((l) => l.id === battle.defenderId);

  const totalArmy = Math.max(1, battle.attackerArmy + battle.defenderArmy);
  const attackerRatio = Math.round((battle.attackerArmy / totalArmy) * 100);
  const defenderRatio = 100 - attackerRatio;

  const playerArmySize = getPlayerPartyHeadcount(campaign).totalMembers;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-battle-intervention-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-amber-500/40 shadow-2xl flex flex-col"
        style={{
          background: 'radial-gradient(ellipse at top, #241c14 0%, #15110d 60%, #0d0a08 100%)',
          boxShadow: '0 0 50px rgba(0, 0, 0, 0.9), inset 0 0 30px rgba(217, 119, 6, 0.1)',
        }}
      >
        {/* Başlık Çubuğu */}
        <div className="relative border-b border-amber-500/30 bg-gradient-to-r from-amber-950/60 via-stone-900/80 to-amber-950/60 px-6 py-4 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-400">
            <Swords className="w-6 h-6 animate-pulse text-amber-400" />
            <h2
              id="map-battle-intervention-title"
              className="text-xl font-bold tracking-wider uppercase font-serif text-amber-200"
            >
              Meydan Muharebesi Müdahalesi
            </h2>
            <Swords className="w-6 h-6 animate-pulse text-amber-400" />
          </div>
          <p className="mt-1 text-xs text-stone-400">
            Kalradya topraklarında iki kuvvet kıyasıya çarpışıyor. Kararınız savaşın kaderini belirleyecek!
          </p>
        </div>

        {/* Muharebe Karşılaşma Alanı (İki Taraf) */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 relative">
            {/* Saldıran Taraf */}
            <div
              className={`rounded-lg p-4 border flex flex-col items-center text-center transition-all ${
                intervention.isAttackerFriendly
                  ? 'border-emerald-500/50 bg-emerald-950/20'
                  : 'border-red-500/40 bg-red-950/20'
              }`}
            >
              <div className="w-12 h-12 rounded-full border border-amber-400/40 flex items-center justify-center mb-2 bg-stone-900 shadow">
                <Flag className="w-6 h-6 text-amber-400" />
              </div>
              <span className="text-xs uppercase font-semibold tracking-wider text-amber-400/80">
                Saldıran Ordu
              </span>
              <h3 className="text-base font-bold text-stone-100 mt-0.5">
                {battle.attackerName}
              </h3>
              <span className="text-xs text-stone-400 capitalize">
                {battle.attackerFaction} Krallığı
              </span>

              <div className="mt-3 w-full bg-stone-950/60 rounded px-3 py-1.5 border border-stone-800 flex justify-between items-center text-xs">
                <span className="text-stone-400">Kalan Asker:</span>
                <span className="font-bold text-amber-300 text-sm">
                  {battle.attackerArmy} / {battle.attackerInitialArmy}
                </span>
              </div>

              {intervention.isAttackerFriendly ? (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  <UserCheck className="w-3 h-3" /> Müttefik / Barışta
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-500/30">
                  <AlertTriangle className="w-3 h-3" /> Düşman Kuvvet
                </span>
              )}
            </div>

            {/* VS Rozeti */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-amber-600/30 border border-amber-500/60 backdrop-blur-md flex items-center justify-center shadow-lg pointer-events-none">
              <span className="font-serif font-black text-xs text-amber-300">VS</span>
            </div>

            {/* Savunan Taraf */}
            <div
              className={`rounded-lg p-4 border flex flex-col items-center text-center transition-all ${
                intervention.isDefenderFriendly
                  ? 'border-emerald-500/50 bg-emerald-950/20'
                  : 'border-red-500/40 bg-red-950/20'
              }`}
            >
              <div className="w-12 h-12 rounded-full border border-amber-400/40 flex items-center justify-center mb-2 bg-stone-900 shadow">
                <Shield className="w-6 h-6 text-amber-400" />
              </div>
              <span className="text-xs uppercase font-semibold tracking-wider text-amber-400/80">
                Savunan Ordu
              </span>
              <h3 className="text-base font-bold text-stone-100 mt-0.5">
                {battle.defenderName}
              </h3>
              <span className="text-xs text-stone-400 capitalize">
                {battle.defenderFaction} Krallığı
              </span>

              <div className="mt-3 w-full bg-stone-950/60 rounded px-3 py-1.5 border border-stone-800 flex justify-between items-center text-xs">
                <span className="text-stone-400">Kalan Asker:</span>
                <span className="font-bold text-amber-300 text-sm">
                  {battle.defenderArmy} / {battle.defenderInitialArmy}
                </span>
              </div>

              {intervention.isDefenderFriendly ? (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  <UserCheck className="w-3 h-3" /> Müttefik / Barışta
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-500/30">
                  <AlertTriangle className="w-3 h-3" /> Düşman Kuvvet
                </span>
              )}
            </div>
          </div>

          {/* Bannerlord Güç Denge Çubuğu (Strength Bar) */}
          <div className="space-y-1.5 bg-stone-950/50 p-3 rounded-lg border border-stone-800">
            <div className="flex justify-between text-xs text-stone-300 font-medium">
              <span>{battle.attackerName} (%{attackerRatio})</span>
              <span className="text-stone-400 font-normal">Kuvvet Dengesi</span>
              <span>{battle.defenderName} (%{defenderRatio})</span>
            </div>
            <div className="h-3 w-full bg-stone-900 rounded-full overflow-hidden flex border border-stone-700/60">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-amber-600 transition-all duration-300"
                style={{ width: `${attackerRatio}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-blue-600 transition-all duration-300"
                style={{ width: `${defenderRatio}%` }}
              />
            </div>
          </div>

          {/* Oyuncu Kuvvet Durumu */}
          <div className="flex items-center justify-between text-xs px-3 py-2 bg-amber-950/20 border border-amber-500/30 rounded-lg text-amber-200">
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Sizin Birliğiniz: <strong>{playerArmySize} Asker</strong></span>
            </span>
            <span className="text-stone-400 italic">
              {intervention.recommendation === 'HELP_ATTACKER' && `Tavsiye: ${battle.attackerName}'e destek verin!`}
              {intervention.recommendation === 'HELP_DEFENDER' && `Tavsiye: ${battle.defenderName}'e destek verin!`}
              {intervention.recommendation === 'ATTACK_BOTH' && 'İki düşman ordu birbirini yıpratıyor.'}
              {intervention.recommendation === 'WATCH' && 'İki taraf da sizinle barışta.'}
            </span>
          </div>
        </div>

        {/* Eylem Düğmeleri */}
        <div className="border-t border-amber-500/30 bg-stone-950/80 p-4 flex flex-col sm:flex-row gap-3 justify-end">
          <button
            type="button"
            onClick={() => {
              sound.playUiClick();
              onLeaveBattle();
            }}
            className="px-4 py-2.5 rounded-lg border border-stone-700 hover:border-stone-500 bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-semibold tracking-wide transition flex items-center justify-center gap-1.5"
          >
            Müdahale Etmeden Uzaklaş
          </button>

          {/* Müttefike Yardım Seçenekleri */}
          {intervention.isAttackerFriendly && (
            <button
              type="button"
              onClick={() => {
                sound.playUiClick();
                onJoinBattle(battle, 'ATTACKER');
              }}
              className="px-5 py-2.5 rounded-lg border border-emerald-500/60 hover:border-emerald-400 bg-gradient-to-r from-emerald-800 to-emerald-700 hover:from-emerald-700 hover:to-emerald-600 text-stone-100 text-xs font-bold tracking-wide shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4" />
              {battle.attackerName}'e Yardım Et (Savaşa Katıl)
            </button>
          )}

          {intervention.isDefenderFriendly && (
            <button
              type="button"
              onClick={() => {
                sound.playUiClick();
                onJoinBattle(battle, 'DEFENDER');
              }}
              className="px-5 py-2.5 rounded-lg border border-emerald-500/60 hover:border-emerald-400 bg-gradient-to-r from-emerald-800 to-emerald-700 hover:from-emerald-700 hover:to-emerald-600 text-stone-100 text-xs font-bold tracking-wide shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4" />
              {battle.defenderName}'e Yardım Et (Savaşa Katıl)
            </button>
          )}

          {/* Düşmana Saldır Seçeneği */}
          {!intervention.isAttackerFriendly && !intervention.isDefenderFriendly && (
            <button
              type="button"
              onClick={() => {
                sound.playUiClick();
                onJoinBattle(battle, 'DEFENDER'); // Varsayılan olarak saldıranı püskürtmeye yardım
              }}
              className="px-5 py-2.5 rounded-lg border border-amber-600/70 hover:border-amber-500 bg-gradient-to-r from-amber-800 to-amber-700 hover:from-amber-700 hover:to-amber-600 text-stone-100 text-xs font-bold tracking-wide shadow-lg transition flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4" />
              Savaşa Dahil Ol
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
