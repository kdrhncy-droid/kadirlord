import React from 'react';
import type { ItemIconKey } from '../game/itemIcons';

/**
 * ItemIcon — Faz B3: eşya siluetleri (emoji yerine).
 *
 * Hepsi 24×24 kutu içinde, `currentColor` ile çizilir; böylece pazar, envanter ve
 * ganimet ekranları aynı dili konuşur ve renk teması tek yerden değişir.
 * Çizimler bilinçli olarak basit: Bannerlord'un envanter ikonları da küçük
 * boyutta okunacak kadar yalın siluetlerdir.
 */
const PATHS: Record<ItemIconKey, React.ReactNode> = {
  sword: (
    <>
      <path d="M14.5 3.5l6 6-9 9H7v-3.5l7.5-11.5z" />
      <path d="M4 20l3-3M6.5 15.5l2 2" />
    </>
  ),
  axe: (
    <>
      <path d="M6 3v18" />
      <path d="M6 4c4 0 7 2 7 5s-3 4-7 4" />
      <path d="M6 8c3 .5 5 1.5 5 3" />
    </>
  ),
  mace: (
    <>
      <path d="M9 15l-4 6" />
      <circle cx="13" cy="9" r="4.5" />
      <path d="M13 2v3M13 13v3M8 9H5M21 9h-3M9.5 5.5L7.5 3.5M16.5 5.5l2-2M9.5 12.5l-2 2M16.5 12.5l2 2" />
    </>
  ),
  spear: (
    <>
      <path d="M4 20L17 7" />
      <path d="M17 7l4-4-1 5.5-4.5 3.5" />
      <path d="M12 12l3 3" />
    </>
  ),
  bow: (
    <>
      <path d="M6 3c7 3 7 15 0 18" />
      <path d="M6 3l0 18" />
      <path d="M6 12h13" />
      <path d="M16 9l3 3-3 3" />
    </>
  ),
  crossbow: (
    <>
      <path d="M3 12h18" />
      <path d="M12 4v8" />
      <path d="M6 8c3-4 9-4 12 0" />
      <path d="M9 17l3 4 3-4" />
    </>
  ),
  arrows: (
    <>
      <path d="M5 21L17 5" />
      <path d="M14 3h5v5" />
      <path d="M8 21l-3 0 0-3" />
      <path d="M10 17l-3 0 0-3" />
      <path d="M13 13l-3 0 0-3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
      <path d="M12 7v10" />
    </>
  ),
  helmet: (
    <>
      <path d="M4 14a8 8 0 0116 0v2H4v-2z" />
      <path d="M4 16h16v2c0 2-3 3-8 3s-8-1-8-3v-2z" />
      <path d="M9 13h6" />
    </>
  ),
  armor: (
    <>
      <path d="M8 4l4 2 4-2 4 3-2 4v9l-6 2-6-2V9L4 5l4-1z" />
      <path d="M12 6v14" />
    </>
  ),
  cloth: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="M4 10h16M4 14h16" />
      <path d="M9 6v12" />
    </>
  ),
  shoulder: (
    <>
      <path d="M4 16c0-6 3-9 8-9s8 3 8 9" />
      <path d="M4 16h5v4H5l-1-4zM20 16h-5v4h4l1-4z" />
    </>
  ),
  gloves: (
    <>
      <path d="M7 21V9a2 2 0 014 0v3" />
      <path d="M11 12V7a2 2 0 014 0v5" />
      <path d="M15 12V9a2 2 0 014 0v7c0 3-2 5-5 5H9l-2-4" />
    </>
  ),
  boots: (
    <>
      <path d="M8 3v10l-3 5v3h7l1-3 5-3c1-1 1-2 1-3h-9V3H8z" />
      <path d="M5 21h11" />
    </>
  ),
  horse: (
    <>
      <path d="M5 20l2-6 3-3 1-5 4 2 3 5 3 7" />
      <path d="M8 11l-3 1" />
      <path d="M15 8l2-1" />
    </>
  ),
  harness: (
    <>
      <path d="M4 8c4 4 12 4 16 0" />
      <path d="M4 16c4-4 12-4 16 0" />
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  grain: (
    <>
      {/* Tek parça buğday başağı: gövde + kesişmeyen dane çiftleri */}
      <path d="M12 22V9" />
      <path d="M12 4.2c1 1.2 1 2.8 0 4.3-1-1.5-1-3.1 0-4.3z" />
      <path d="M11.6 12.4c-2.4-.2-3.9-1.6-4.2-4 2.3.3 3.8 1.6 4.2 4z" />
      <path d="M12.4 12.4c2.4-.2 3.9-1.6 4.2-4-2.3.3-3.8 1.6-4.2 4z" />
      <path d="M11.6 16.8c-2.4-.2-3.9-1.6-4.2-4 2.3.3 3.8 1.6 4.2 4z" />
      <path d="M12.4 16.8c2.4-.2 3.9-1.6 4.2-4-2.3.3-3.8 1.6-4.2 4z" />
    </>
  ),
  meat: (
    <>
      <path d="M4 17c0-6 5-11 11-11 2 0 4 2 4 4 0 6-5 11-11 11-2 0-4-2-4-4z" />
      <circle cx="15" cy="9" r="2" />
      <path d="M7 20l-2 2" />
    </>
  ),
  fish: (
    <>
      <path d="M3 12c4-5 10-5 14 0-4 5-10 5-14 0z" />
      <path d="M17 12l4-4v8l-4-4z" />
      <circle cx="7" cy="11" r=".8" />
    </>
  ),
  cheese: (
    <>
      <path d="M3 16L13 6l8 4v6l-9 3-9-3z" />
      <path d="M13 6v10M3 16l9-4 9 4" />
      <circle cx="16" cy="14" r="1" />
    </>
  ),
  oil: (
    <>
      <path d="M9 3h6v3l2 4v10H7V10l2-4V3z" />
      <path d="M9 3h6" />
      <path d="M9 13h6" />
    </>
  ),
  iron: (
    <>
      <path d="M5 16l2-6h10l2 6H5z" />
      <path d="M8 10l1-3h6l1 3" />
      <path d="M4 20h16" />
    </>
  ),
  salt: (
    <>
      <path d="M5 9h14l-1 11H6L5 9z" />
      <path d="M8 9l1-4h6l1 4" />
      <path d="M9 14h2M13 14h2M11 17h2" />
    </>
  ),
  wool: (
    <>
      <circle cx="9" cy="12" r="4" />
      <circle cx="15" cy="12" r="4" />
      <circle cx="12" cy="8" r="4" />
      <path d="M4 18h16" />
    </>
  ),
  wine: (
    <>
      <path d="M9 3h6v4c0 3-6 3-6 0V3z" />
      <path d="M12 10v8" />
      <path d="M8 21h8" />
      <path d="M8 14h8" />
    </>
  ),
  honey: (
    <>
      <path d="M6 10h12v8a3 3 0 01-3 3H9a3 3 0 01-3-3v-8z" />
      <path d="M6 10c0-2 2-3 6-3s6 1 6 3" />
      <path d="M10 3v4M14 3v4" />
    </>
  ),
  fur: (
    <>
      <path d="M6 4c4 1 8 1 12 0v6c0 6-4 10-6 10S6 16 6 10V4z" />
      <path d="M9 8l2 2M15 8l-2 2M12 13v3" />
    </>
  ),
  tools: (
    <>
      <path d="M4 20l7-7" />
      <path d="M11 13l4-9 3 2-4 9" />
      <path d="M15 21l4-6" />
      <path d="M18 3l3 3-5 4-3-3 5-4z" />
    </>
  ),
  pottery: (
    <>
      <path d="M9 3h6v3c3 2 3 6 3 8 0 4-2 7-6 7s-6-3-6-7c0-2 0-6 3-8V3z" />
      <path d="M9 3h6M8 12h8" />
    </>
  ),
  fruit: (
    <>
      <circle cx="12" cy="14" r="6" />
      <path d="M12 8V5" />
      <path d="M12 6c2-3 5-3 6-2-1 3-4 3-6 2z" />
    </>
  ),
  crate: (
    <>
      <path d="M3 8h18v12H3z" />
      <path d="M3 8l3-4h12l3 4" />
      <path d="M3 14h18M12 8v12" />
    </>
  ),
};

export function ItemIcon({
  iconKey,
  size = 24,
  className,
}: {
  iconKey: ItemIconKey;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[iconKey] ?? PATHS.crate}
    </svg>
  );
}
