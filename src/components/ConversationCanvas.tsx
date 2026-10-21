/**
 * ConversationCanvas.tsx — Faz 6d: diyalog sahnesi (canlı 3B, omuz üstü kadraj)
 *
 * Bannerlord'da konuşma başladığında kamera muhataba yaklaşır; muhatap başını
 * çevirir, konuşurken ağzı oynar, eliyle jest yapar. Bu bileşen
 * `game/conversation.ts` sahnesini WebGL ile çizer.
 *
 * WebGL yoksa (SSR / test / eski tarayıcı) **sessizce** statik yedeğe düşer;
 * diyalog ekranı bozulmaz.
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  createConversationScene,
  type ConversationHero,
  type ConversationScene,
} from '../game/conversation.ts';

interface ConversationCanvasProps {
  hero: ConversationHero;
  /** Yeni metin geldiğinde true → ağız/jest hareketi. */
  speaking?: boolean;
  /** Her değiştiğinde jest tetiklenir (seçenek seçildi). */
  gestureKey?: number;
  className?: string;
}

export const ConversationCanvas: React.FC<ConversationCanvasProps> = ({
  hero,
  speaking = false,
  gestureKey = 0,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ConversationScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 180;

    let conv: ConversationScene;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      conv = createConversationScene({ hero });
    } catch {
      // WebGL yok → statik yedek (aşağıdaki fallback katmanı görünür kalır)
      return;
    }
    sceneRef.current = conv;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);

    conv.camera.aspect = width / height;
    conv.camera.updateProjectionMatrix();

    let raf = 0;
    let last = performance.now();
    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((time - last) / 1000, 0.1);
      last = time;
      conv.update(dt);
      renderer.render(conv.scene, conv.camera);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          conv.camera.aspect = w / h;
          conv.camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      renderer.dispose();
      conv.dispose();
      sceneRef.current = null;
    };
    // hero kimliği değişince sahne yeniden kurulur.
  }, [hero.id, hero.occupation, hero.culture, hero.bannerColor]);

  // Konuşma durumu: metin değişince kısa süre ağız hareketi.
  useEffect(() => {
    sceneRef.current?.setSpeaking(speaking);
  }, [speaking]);

  // Jest: seçenek seçildiğinde el kalkar.
  useEffect(() => {
    if (gestureKey > 0) sceneRef.current?.gesture();
  }, [gestureKey]);

  return (
    <div
      ref={containerRef}
      data-testid="conversation-canvas"
      className={`relative overflow-hidden bg-[#14100c] ${className}`}
    >
      {/* WebGL yoksa görünen yedek: siluet + isim */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <svg viewBox="0 0 64 64" className="w-12 h-12 opacity-40" aria-hidden="true">
          <circle cx="32" cy="24" r="12" fill="#d7c3a0" />
          <path d="M12 64c2-14 10-20 20-20s18 6 20 20z" fill="#d7c3a0" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
};
