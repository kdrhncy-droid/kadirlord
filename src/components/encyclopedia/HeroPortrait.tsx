import React, { useEffect, useState } from 'react';
import type { HeroRecord } from '../../game/heroes';
import { getCachedPortrait, requestPortrait } from '../../game/portraitRenderer';
import { initials } from './parts';

interface HeroPortraitProps {
  hero: HeroRecord;
  /** Görüntü genişliği (px). Yükseklik 4:5 oranından hesaplanır. */
  width: number;
  /** Yuvarlak köşe (liste rozetleri için). */
  square?: boolean;
  className?: string;
}

/**
 * Kahraman portresi.
 *  - Önbellekte varsa anında gösterilir.
 *  - Yoksa tek WebGL kuyruğuna girer; hazır olana kadar **baş harf rozeti** görünür.
 *  - WebGL yoksa (test/SSR) kalıcı olarak baş harf rozeti kalır.
 */
export const HeroPortrait: React.FC<HeroPortraitProps> = ({
  hero,
  width,
  square = false,
  className = '',
}) => {
  const [url, setUrl] = useState<string | null>(() => getCachedPortrait(hero));

  useEffect(() => {
    let alive = true;
    const cached = getCachedPortrait(hero);
    if (cached) {
      setUrl(cached);
      return () => {
        alive = false;
      };
    }
    setUrl(null);
    requestPortrait(hero).then((result) => {
      if (alive && result) setUrl(result);
    });
    return () => {
      alive = false;
    };
    // hero.id yeterli: portre anahtarı id + sancak + meslekten oluşur.
  }, [hero]);

  const height = Math.round(width * (square ? 1 : 1.25));

  if (url) {
    return (
      <span
        className={`relative block shrink-0 overflow-hidden rounded-sm border border-[#c6a15b]/40 ${className}`}
        style={{
          width,
          height,
          background: `radial-gradient(120% 90% at 50% 35%, ${hero.bannerColor}55, #100d09 78%)`,
        }}
      >
        <img
          src={url}
          alt={hero.name}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 rounded-sm border border-[#c6a15b]/40 flex items-center justify-center font-bold text-[#f8f0df] ${className}`}
      style={{
        width,
        height,
        fontSize: Math.max(9, Math.round(width * 0.32)),
        background: `linear-gradient(160deg, ${hero.bannerColor}, #120f0b)`,
      }}
      title={hero.name}
    >
      {initials(hero.name)}
    </span>
  );
};
