import React from 'react';
import type { CampaignState, LordAgent, Settlement, TroopRoster } from '../game/rules';
import type { BattleTelemetry } from '../game/types';
import { CharacterArenaView } from './CharacterArenaView';

export interface BattlefieldViewProps {
  /** Duraklatma menüsü açıkken simülasyon donar (bileşen sökülmez). */
  paused?: boolean;
  campaign: CampaignState;
  targetLord: LordAgent | null;
  targetSettlement: Settlement | null;
  onBattleTelemetry: (telemetry: BattleTelemetry) => void;
  onBattleComplete: (
    victory: boolean,
    losses: Partial<TroopRoster>,
    enemiesDefeated: number,
  ) => void;
}

/**
 * BattlefieldView: Tek ve Birleşik Kalradya Muharebe Motoru.
 *
 * Kullanıcı direktifi: Eski BattlefieldView'deki bozuk prosedürel modeller
 * (createWarriorModel) ve sert eklem animasyonları (animateWarriorRigPose) yerine,
 * Arena'nın (CharacterArenaView) tam iskeletli rig, IK, animasyon, 4 yönlü vuruş/blok,
 * silah/zırh/kalkan/at sistemleri ve 500v500 ordu/kuşatma havuzu temel alınmıştır.
 * Sefer haritası meydan ve kuşatma muharebeleri bu bileşen üzerinden tam yetkiyle çalışır.
 */
export const BattlefieldView: React.FC<BattlefieldViewProps> = (props) => {
  return (
    <CharacterArenaView
      campaign={props.campaign}
      mode={props.targetSettlement ? 'SIEGE' : 'FIELD'}
      targetLord={props.targetLord}
      targetSettlement={props.targetSettlement}
      onBattleTelemetry={props.onBattleTelemetry}
      onBattleComplete={props.onBattleComplete}
      paused={props.paused}
      onReturnToMap={() => {
        // Geri çekilme / haritaya dönüş durumu
        props.onBattleComplete(false, {}, 0);
      }}
    />
  );
};

export default BattlefieldView;
