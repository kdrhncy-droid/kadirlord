import React from 'react';
import type { Occupation } from '../../game/heroes';

/** İsimden 1-2 harflik baş harf rozeti. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr') ?? '')
    .join('');
}

export const occupationColor: Record<Occupation, string> = {
  RULER: 'text-[#fbbf24] border-[#fbbf24]/50 bg-[#fbbf24]/10',
  LORD: 'text-[#e2d6c1] border-[#c6a15b]/40 bg-[#c6a15b]/10',
  LADY: 'text-[#f9a8d4] border-[#f9a8d4]/40 bg-[#f9a8d4]/10',
  CLAN_LEADER: 'text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10',
  WANDERER: 'text-[#a89b84] border-[#a89b84]/40 bg-[#a89b84]/10',
  NOTABLE: 'text-[#93c5fd] border-[#93c5fd]/40 bg-[#93c5fd]/10',
  MERCHANT: 'text-[#fcd34d] border-[#fcd34d]/40 bg-[#fcd34d]/10',
  GANG_LEADER: 'text-[#fca5a5] border-[#fca5a5]/40 bg-[#fca5a5]/10',
  HEADMAN: 'text-[#bef264] border-[#bef264]/40 bg-[#bef264]/10',
};

export const InfoCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-[#0d0b08] rounded px-2 py-1">
    <div className="text-[9px] uppercase tracking-wider text-[#8b8072]">{label}</div>
    <div className="text-[11px] text-[#e2d6c1]">{value}</div>
  </div>
);

export const LinkCard: React.FC<{
  label: string;
  value: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, value, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded border border-[#c6a15b]/30 px-2 py-1.5 text-left ${
      disabled ? 'opacity-40 cursor-default' : 'hover:border-[#fbbf24]/60 hover:bg-[#c6a15b]/10'
    }`}
  >
    <div className="text-[9px] uppercase tracking-wider text-[#8b8072]">{label}</div>
    <div className="text-[11px] text-[#e2d6c1] truncate">{value}</div>
  </button>
);

/** Küçük renkli etiket (durum, savaş, meslek...). */
export const Chip: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = 'text-[#a89b84] border-[#a89b84]/40 bg-[#a89b84]/10',
}) => (
  <span className={`text-[9px] px-1 rounded border whitespace-nowrap ${className}`}>{children}</span>
);

/** Bölüm başlığı (küçük-caps). */
export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">{children}</div>
);

/** Sancak renkli kare rozet. */
export const BannerBadge: React.FC<{ color: string; text: string; size?: number }> = ({
  color,
  text,
  size = 36,
}) => (
  <span
    className="shrink-0 rounded-sm border border-[#c6a15b]/40 flex items-center justify-center text-[11px] font-bold text-[#f8f0df]"
    style={{
      width: size,
      height: size,
      background: `linear-gradient(160deg, ${color}, #120f0b)`,
    }}
  >
    {text}
  </span>
);
