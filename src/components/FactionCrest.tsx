import React from 'react';
import {
  Bird,
  Crown,
  Shield,
  Skull,
  Sun,
  Swords,
  TreePine,
  Wind,
} from 'lucide-react';
import { FACTION_INFO, FactionId } from '../game/rules';

/**
 * Sancak arması — Bannerlord'da her krallık ve klan, renkli bir sancak üzerinde
 * tek renkli bir arma taşır (kartal, kalkan, kurt...). Emoji yerine SVG.
 */
const CRESTS: Record<FactionId, React.ReactNode> = {
  player: <Bird size={15} strokeWidth={1.7} />,
  empire: <Crown size={15} strokeWidth={1.7} />,
  vlandia: <Swords size={15} strokeWidth={1.7} />,
  battania: <TreePine size={15} strokeWidth={1.7} />,
  sturgia: <Shield size={15} strokeWidth={1.7} />,
  khuzait: <Wind size={15} strokeWidth={1.7} />,
  aserai: <Sun size={15} strokeWidth={1.7} />,
  bandits: <Skull size={15} strokeWidth={1.7} />,
};

interface FactionCrestProps {
  faction: FactionId;
  /** Bayrak kutusunun kenar uzunluğu (px). */
  size?: number;
  className?: string;
}

export const FactionCrest: React.FC<FactionCrestProps> = ({ faction, size = 28, className = '' }) => {
  const info = FACTION_INFO[faction];
  return (
    <span
      title={info.emblemName}
      aria-label={`${info.name} arması`}
      className={`inline-flex items-center justify-center shrink-0 border-2 border-[#fcd34d]/70 shadow-lg ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: info.color,
        color: '#fde68a',
      }}
    >
      {CRESTS[faction]}
    </span>
  );
};

export default FactionCrest;
