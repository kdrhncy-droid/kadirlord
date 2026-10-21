import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CharacterRig,
  createCharacterRig,
  applyEquipmentToRig,
  HelmetType,
  ArmorTier,
} from '../game/characterRig.ts';
import { CharacterAnimator } from '../game/characterAnimator.ts';
import {
  CharacterMorphDNA,
  applyMorphDNAToRig,
  getLordDNA,
} from '../game/characterMorph.ts';
import { FACTION_INFO, LordAgent } from '../game/rules.ts';

interface LordPortraitCanvasProps {
  lord: LordAgent;
  className?: string;
}

export const LordPortraitCanvas: React.FC<LordPortraitCanvasProps> = ({
  lord,
  className = 'w-full h-44',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 176;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14100c');

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 10);
    camera.position.set(0, 1.48, 1.42);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Warm portrait lighting
    const ambient = new THREE.AmbientLight('#fed7aa', 0.85);
    scene.add(ambient);

    const key = new THREE.DirectionalLight('#fff7ed', 1.8);
    key.position.set(1.5, 2.8, 2.2);
    scene.add(key);

    const rim = new THREE.DirectionalLight(
      FACTION_INFO[lord.faction]?.color || '#f59e0b',
      1.2,
    );
    rim.position.set(-1.8, 2.2, -1.8);
    scene.add(rim);

    // Determine Lord's DNA and authentic regalia
    const lordDNA: CharacterMorphDNA = lord.morphDNA || getLordDNA(lord.id, lord.faction);

    let helmetType: HelmetType = 'NONE';
    let armorTier: ArmorTier = 'CHAINMAIL';

    if (lord.id === 'lord-rhagaea') {
      helmetType = 'NONE'; // Shows royal braid crown
      armorTier = 'PLATE';
    } else if (lord.id === 'lord-derthert') {
      helmetType = 'NONE'; // Regal hair & crown
      armorTier = 'PLATE';
    } else if (lord.id === 'lord-garios') {
      helmetType = 'SPANGENHELM';
      armorTier = 'PLATE';
    } else if (lord.id === 'lord-caladog') {
      helmetType = 'NONE'; // Untamed braids & woad paint
      armorTier = 'LEATHER';
    } else if (lord.id === 'lord-kargi') {
      helmetType = 'KETTLE_HAT';
      armorTier = 'LEATHER';
    } else {
      armorTier = 'CHAINMAIL';
    }

    const rig = createCharacterRig({
      skinTone: lordDNA.skinTone,
      hairColor: lordDNA.hairColor,
      beardColor: lordDNA.beardColor,
      factionColor: FACTION_INFO[lord.faction]?.color || '#991b1b',
      hasBeard: lordDNA.beardStyle !== 'clean_shaven' && lordDNA.gender === 'male',
      weaponType: 'UNARMED',
      shieldType: 'NONE',
      helmetType,
      armorTier,
    });

    applyMorphDNAToRig(rig, lordDNA);
    scene.add(rig.root);

    const animator = new CharacterAnimator(rig);

    // Camera targets center of the lord's face
    const lookTarget = new THREE.Vector3(0, 1.44 * (lordDNA.height || 1.0), 0);
    camera.lookAt(lookTarget);

    let animId: number;
    let lastTime = performance.now();
    let breatheTimer = 0;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      breatheTimer += dt;

      animator.update(dt);

      // Subtle living portrait head turn and idle gaze
      if (rig.head) {
        rig.head.rotation.y = Math.sin(breatheTimer * 0.8) * 0.05;
        rig.head.rotation.x = Math.sin(breatheTimer * 1.2) * 0.03;
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [lord]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded border border-[#c6a15b]/40 shadow-inner bg-[#14100c] ${className}`}
    >
      <div className="absolute top-1.5 left-2 z-10 pointer-events-none">
        <span className="text-[9px] uppercase tracking-wider font-mono text-[#c6a15b] bg-[#14100c]/80 px-1.5 py-0.5 rounded border border-[#c6a15b]/30">
          3B Lord Sureti
        </span>
      </div>
    </div>
  );
};
