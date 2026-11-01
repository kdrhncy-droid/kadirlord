import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CharacterRig,
  WarHorseRig,
  applyEquipmentToRig,
  createCharacterRig,
  createWarHorseRig,
  deriveRigVisualOptionsFromEquipment,
  updateRigAnimation,
  updateWarHorseAnimation,
} from '../game/characterRig.ts';
import {
  buildFactionWarHorseRig,
  getArsenalHorseById,
} from '../armory/FactionArsenal.ts';

export type HeroMannequinVisualOptions = ReturnType<typeof deriveRigVisualOptionsFromEquipment>;

interface HeroMannequinProps {
  visualOptions: HeroMannequinVisualOptions;
  /** Kuşanılmış binek varsa aynı sahnede, kahramanın yanında gösterilir. */
  showMount?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Pazar ve saha envanterinin ortak 3B kahraman vitrini.
 *
 * MİMARİ İYİLEŞTİRME (Zero WebGL Context Leak):
 * WebGLRenderer, Sahne, Kamera ve Işıklar yalnız mount anında BİR KEZ kurulur.
 * Eşya alışverişi veya kuşanmada context yıkılıp baştan yapılmaz; yalnızca
 * `applyEquipmentToRig` ile mevcut iskelet üzerindeki donanım güncellenir.
 * Bu sayede onlarca kez eşya alınıp satılsa bile tarayıcının WebGL context
 * havuzu asla tükenmez ve beyaz ekran çökmesi oluşmaz.
 */
function makeMannequinHorse(visualOptions: HeroMannequinVisualOptions): WarHorseRig {
  if (visualOptions.factionHorseId) {
    const def = getArsenalHorseById(visualOptions.factionHorseId);
    if (def) return buildFactionWarHorseRig(def, 'STANDARD');
  }
  return createWarHorseRig({
    factionColor: visualOptions.factionColor,
    armoredBarding: true,
  });
}

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

  const heroRigRef = useRef<CharacterRig | null>(null);
  const horseRigRef = useRef<WarHorseRig | null>(null);
  const stageRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // 1. Mount Effect: WebGL Scene ve Renderer yalnız 1 kez oluşturulur
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14100c');

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 1.25, showMount ? 4.15 : 3.2);
    camera.lookAt(0, 0.95, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // WebGL Context Lost koruması
    let isContextLost = false;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      isContextLost = true;
      console.warn('[HeroMannequin] WebGL context geçici olarak kaybedildi.');
    };
    const handleContextRestored = () => {
      isContextLost = false;
      console.info('[HeroMannequin] WebGL context geri yüklendi.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

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
    stageRef.current = stage;

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
    heroRigRef.current = heroRig;

    const horseRig = showMount ? makeMannequinHorse(visualOptions) : null;
    if (horseRig) {
      horseRig.root.position.set(0.68, 0, -0.22);
      horseRig.root.rotation.y = -0.72;
      horseRig.root.scale.setScalar(0.72);
      stage.add(horseRig.root);
      horseRigRef.current = horseRig;
    }

    let animationFrameId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      if (isContextLost) return;
      const now = performance.now();
      const delta = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += delta;
      if (!draggingRef.current) rotationRef.current += delta * 0.25;
      stage.rotation.y = rotationRef.current;
      if (heroRigRef.current) {
        updateRigAnimation(heroRigRef.current, 'IDLE', elapsed, delta);
      }
      if (horseRigRef.current) {
        updateWarHorseAnimation(horseRigRef.current, 0, elapsed);
      }
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
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      });

      // Context ve bellek temizliği
      try {
        renderer.forceContextLoss();
      } catch {
        // yoksay
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);

      heroRigRef.current = null;
      horseRigRef.current = null;
      stageRef.current = null;
      cameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Yalnız mount/unmount sırasında çalışır

  // 2. Ekipman Güncelleme Effect'i: WebGL context'i bozmadan mevcut rig'i giydirir
  useEffect(() => {
    const heroRig = heroRigRef.current;
    if (heroRig) {
      applyEquipmentToRig(heroRig, visualOptions);
    }
  }, [visualOptions]);

  // 3. Binek Güncelleme Effect'i: At varlığını dinamik ekler/çıkarır
  useEffect(() => {
    const stage = stageRef.current;
    const heroRig = heroRigRef.current;
    const camera = cameraRef.current;
    if (!stage || !heroRig) return;

    if (camera) {
      camera.position.set(0, 1.25, showMount ? 4.15 : 3.2);
    }
    heroRig.root.position.x = showMount ? -0.68 : 0;

    if (showMount && !horseRigRef.current) {
      const horseRig = makeMannequinHorse(visualOptions);
      horseRig.root.position.set(0.68, 0, -0.22);
      horseRig.root.rotation.y = -0.72;
      horseRig.root.scale.setScalar(0.72);
      stage.add(horseRig.root);
      horseRigRef.current = horseRig;
    } else if (!showMount && horseRigRef.current) {
      stage.remove(horseRigRef.current.root);
      horseRigRef.current = null;
    }
  }, [showMount, visualOptions.factionColor, visualOptions.factionHorseId]);

  return <div ref={mountRef} className={className} data-testid={testId} aria-hidden="true" />;
};
