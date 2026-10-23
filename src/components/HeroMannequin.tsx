import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  createCharacterRig,
  createWarHorseRig,
  deriveRigVisualOptionsFromEquipment,
  updateRigAnimation,
  updateWarHorseAnimation,
} from '../game/characterRig.ts';

export type HeroMannequinVisualOptions = ReturnType<typeof deriveRigVisualOptionsFromEquipment>;

interface HeroMannequinProps {
  visualOptions: HeroMannequinVisualOptions;
  /** Kuşanılmış binek varsa aynı sahnede, kahramanın yanında gösterilir. */
  showMount?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Pazar ve saha envanterinin ortak 3B kahraman sahnesi.
 * Fareyle yatay sürükleme sahneyi döndürür; boşta yavaş vitrin dönüşü sürer.
 */
export const HeroMannequin: React.FC<HeroMannequinProps> = ({
  visualOptions,
  showMount = false,
  className = 'absolute inset-0 cursor-grab active:cursor-grabbing',
  testId,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0.35);
  const draggingRef = useRef(false);
  const lastMouseXRef = useRef(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14100c');

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 1.25, showMount ? 4.15 : 3.2);
    camera.lookAt(0, 0.95, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const resize = () => {
      const width = Math.max(1, container.clientWidth || 320);
      const height = Math.max(1, container.clientHeight || 460);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(container);

    const keyLight = new THREE.DirectionalLight('#fffbeb', 1.8);
    keyLight.position.set(3, 4, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#93c5fd', 0.8);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);
    scene.add(new THREE.HemisphereLight('#fef08a', '#1e1b18', 0.6));

    const stage = new THREE.Group();
    scene.add(stage);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(showMount ? 1.55 : 1.2, showMount ? 1.65 : 1.3, 0.1, 28),
      new THREE.MeshStandardMaterial({ color: '#262018', roughness: 0.85 }),
    );
    disc.position.y = -0.05;
    disc.receiveShadow = true;
    stage.add(disc);

    const heroRig = createCharacterRig(visualOptions);
    heroRig.root.position.x = showMount ? -0.68 : 0;
    stage.add(heroRig.root);

    const horseRig = showMount
      ? createWarHorseRig({
          factionColor: visualOptions.factionColor,
          armoredBarding: true,
        })
      : null;
    if (horseRig) {
      horseRig.root.position.set(0.68, 0, -0.22);
      horseRig.root.rotation.y = -0.72;
      horseRig.root.scale.setScalar(0.72);
      stage.add(horseRig.root);
    }

    let animationFrameId = 0;
    const clock = new THREE.Clock();
    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      if (!draggingRef.current) rotationRef.current += delta * 0.25;
      stage.rotation.y = rotationRef.current;
      updateRigAnimation(heroRig, 'IDLE', elapsed, delta);
      if (horseRig) updateWarHorseAnimation(horseRig, 0, elapsed);
      renderer.render(scene, camera);
    };
    renderLoop();

    const onMouseDown = (event: MouseEvent) => {
      draggingRef.current = true;
      lastMouseXRef.current = event.clientX;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const deltaX = event.clientX - lastMouseXRef.current;
      lastMouseXRef.current = event.clientX;
      rotationRef.current += deltaX * 0.015;
    };
    const onMouseUp = () => {
      draggingRef.current = false;
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [showMount, visualOptions]);

  return <div ref={mountRef} className={className} data-testid={testId} aria-hidden="true" />;
};
