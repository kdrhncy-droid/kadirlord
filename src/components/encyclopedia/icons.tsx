import React from 'react';
import { Crown, Shield, Flag, Castle, Building2, House, BookOpen, Users, Swords } from 'lucide-react';

/**
 * Ansiklopedi ikonları.
 *
 * Emoji yerine **SVG** kullanılıyor: emoji fontu olmayan sistemlerde (bazı Linux
 * ve sunucu render'ları) emoji kutucuk (□) olarak çıkıyordu. Lucide ikonları
 * `currentColor` ile çizildiği için altın paletle uyumlu ve keskin.
 */

export type SectionGlyph = 'HEROES' | 'KINGDOMS' | 'CLANS' | 'SETTLEMENTS' | 'CONCEPTS';

type IconProps = { size?: number; className?: string; strokeWidth?: number };

const GLYPHS: Record<SectionGlyph, React.FC<IconProps>> = {
  HEROES: Users,
  KINGDOMS: Crown,
  CLANS: Flag,
  SETTLEMENTS: Castle,
  CONCEPTS: BookOpen,
};

export const SectionIcon: React.FC<{ section: SectionGlyph } & IconProps> = ({
  section,
  size = 40,
  className = '',
}) => {
  const Icon = GLYPHS[section];
  return <Icon size={size} className={className} strokeWidth={1.4} />;
};

/** Yerleşim türü ikonu: şehir / kale / köy. */
export const SettlementIcon: React.FC<{
  type: 'TOWN' | 'CASTLE' | 'VILLAGE' | string;
  size?: number;
  className?: string;
}> = ({ type, size = 16, className = '' }) => {
  const Icon = type === 'TOWN' ? Building2 : type === 'CASTLE' ? Castle : House;
  return <Icon size={size} className={className} strokeWidth={1.6} />;
};

/** Savaş / barış göstergesi. */
export const WarIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className = '',
}) => <Swords size={size} className={className} strokeWidth={1.8} />;

export const ShieldIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 14,
  className = '',
}) => <Shield size={size} className={className} strokeWidth={1.6} />;
