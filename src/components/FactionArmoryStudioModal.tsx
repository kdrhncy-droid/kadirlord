import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  FACTION_ANIMATION_META,
  FactionAnimationId,
  ensureFactionIKClipsRegistered,
} from '../armory/FactionAnimations.ts';
import {
  ARSENAL_FACTIONS,
  ArsenalFactionId,
  FACTION_ARMORS,
  FACTION_HORSES,
  FACTION_WEAPONS,
  FactionArmorDef,
  FactionHorseDef,
  FactionWeaponDef,
  ITEM_QUALITY_MODIFIERS,
  ItemQualityId,
  QUALITY_ORDER,
  buildFactionWarHorseRig,
  buildFactionWeapon3D,
  computeArmorStatsWithQuality,
  computeHorseStatsWithQuality,
  computeWeaponStatsWithQuality,
  getArmorsByFaction,
  getHorsesByFaction,
  getWeaponsByFaction,
} from '../armory/FactionArsenal.ts';
import {
  EquippedUnitSceneResult,
  FACTION_TROOP_LOADOUTS,
  FactionTroopRankLoadout,
  buildEquippedTroopOrLordScene,
  getTroopLoadoutsByFaction,
} from '../game/factionTroopLoadouts.ts';
import { updateWarHorseAnimation } from '../game/characterRig.ts';
import { FactionCrest } from './FactionCrest.tsx';
import { sound } from '../game/sound.ts';

export type ArmoryStudioTab =
  | 'TROOP_PROGRESSION'
  | 'WEAPONS'
  | 'ARMORS'
  | 'HORSES';

export interface FactionArmoryStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Oyuncu isterse seçili silah/zırh/atı kendi envanterine veya karakterine ücretsiz test olarak ekleyebilir */
  onGrantItemToPlayer?: (itemSummary: {
    id: string;
    name: string;
    category: 'WEAPON' | 'SHIELD' | 'ARMOR' | 'HORSE';
    value: number;
    weight: number;
    statBonus: string;
    tier: number;
  }) => void;
}

export const FactionArmoryStudioModal: React.FC<FactionArmoryStudioModalProps> = ({
  isOpen,
  onClose,
  onGrantItemToPlayer,
}) => {
  const [selectedFaction, setSelectedFaction] = useState<ArsenalFactionId>('empire');
  const [activeTab, setActiveTab] = useState<ArmoryStudioTab>('TROOP_PROGRESSION');
  const [selectedQuality, setSelectedQuality] = useState<ItemQualityId>('MASTERWORK');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [lineupMode, setLineupMode] = useState<boolean>(false);
  const [weaponDisplayMode, setWeaponDisplayMode] = useState<'PEDESTAL' | 'WIELDED'>('PEDESTAL');
  const [horseWithRider, setHorseWithRider] = useState<boolean>(true);
  const [showFilesGuide, setShowFilesGuide] = useState<boolean>(false);
  const [triangleReadout, setTriangleReadout] = useState<number>(0);

  // Seçili öğeler
  const factionLoadouts = useMemo(
    () => getTroopLoadoutsByFaction(selectedFaction),
    [selectedFaction],
  );
  const factionWeapons = useMemo(
    () => getWeaponsByFaction(selectedFaction),
    [selectedFaction],
  );
  const factionArmors = useMemo(
    () => getArmorsByFaction(selectedFaction),
    [selectedFaction],
  );
  const factionHorses = useMemo(
    () => getHorsesByFaction(selectedFaction),
    [selectedFaction],
  );

  const [selectedLoadoutId, setSelectedLoadoutId] = useState<string>('emp_rank_t6');
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>('emp_thamaskene_spatha_t6');
  const [selectedArmorId, setSelectedArmorId] = useState<string>('emp_armor_cataphract_t6');
  const [selectedHorseId, setSelectedHorseId] = useState<string>('emp_horse_cataphract_t6');
  const [activeAnimation, setActiveAnimation] = useState<FactionAnimationId>('attackCouchedLance');

  // Krallık değiştiğinde o krallığın varsayılan elit öğelerini seç
  useEffect(() => {
    const loads = getTroopLoadoutsByFaction(selectedFaction);
    const weps = getWeaponsByFaction(selectedFaction);
    const arms = getArmorsByFaction(selectedFaction);
    const hrs = getHorsesByFaction(selectedFaction);

    const defaultLoad =
      loads.find((l) => l.rankStage === 'T6_CHAMPION') ?? loads[0];
    if (defaultLoad) {
      setSelectedLoadoutId(defaultLoad.id);
      setActiveAnimation(defaultLoad.defaultAnimation);
      setSelectedQuality(defaultLoad.defaultQuality);
    }
    if (weps.length > 0) {
      const topWep = weps.find((w) => w.tier >= 6) ?? weps[0];
      setSelectedWeaponId(topWep.id);
    }
    if (arms.length > 0) {
      const topArm = arms[arms.length - 1];
      setSelectedArmorId(topArm.id);
    }
    if (hrs.length > 0) {
      const topHorse = hrs[hrs.length - 1];
      setSelectedHorseId(topHorse.id);
    }
  }, [selectedFaction]);

  const currentLoadout: FactionTroopRankLoadout = useMemo(
    () =>
      factionLoadouts.find((l) => l.id === selectedLoadoutId) ??
      factionLoadouts[0] ??
      FACTION_TROOP_LOADOUTS[0],
    [factionLoadouts, selectedLoadoutId],
  );

  const currentWeapon: FactionWeaponDef = useMemo(
    () =>
      factionWeapons.find((w) => w.id === selectedWeaponId) ??
      factionWeapons[0] ??
      FACTION_WEAPONS[0],
    [factionWeapons, selectedWeaponId],
  );

  const currentArmor: FactionArmorDef = useMemo(
    () =>
      factionArmors.find((a) => a.id === selectedArmorId) ??
      factionArmors[0] ??
      FACTION_ARMORS[0],
    [factionArmors, selectedArmorId],
  );

  const currentHorse: FactionHorseDef = useMemo(
    () =>
      factionHorses.find((h) => h.id === selectedHorseId) ??
      factionHorses[0] ??
      FACTION_HORSES[0],
    [factionHorses, selectedHorseId],
  );

  const currentFactionMeta = useMemo(
    () =>
      ARSENAL_FACTIONS.find((f) => f.id === selectedFaction) ?? ARSENAL_FACTIONS[0],
    [selectedFaction],
  );

  // Hesaplanmış canlı istatistikler ve fiyatlar
  const computedWeapon = useMemo(
    () => computeWeaponStatsWithQuality(currentWeapon, selectedQuality),
    [currentWeapon, selectedQuality],
  );
  const computedArmor = useMemo(
    () => computeArmorStatsWithQuality(currentArmor, selectedQuality),
    [currentArmor, selectedQuality],
  );
  const computedHorse = useMemo(
    () => computeHorseStatsWithQuality(currentHorse, selectedQuality),
    [currentHorse, selectedQuality],
  );

  const loadoutPrimaryWeapon = useMemo(
    () =>
      FACTION_WEAPONS.find((w) => w.id === currentLoadout.primaryWeaponId) ??
      currentWeapon,
    [currentLoadout, currentWeapon],
  );
  const loadoutArmor = useMemo(
    () =>
      FACTION_ARMORS.find((a) => a.id === currentLoadout.armorId) ??
      currentArmor,
    [currentLoadout, currentArmor],
  );
  const loadoutHorse = useMemo(
    () =>
      currentLoadout.horseId
        ? (FACTION_HORSES.find((h) => h.id === currentLoadout.horseId) ?? null)
        : null,
    [currentLoadout],
  );

  const loadoutPrimaryStats = useMemo(
    () => computeWeaponStatsWithQuality(loadoutPrimaryWeapon, selectedQuality),
    [loadoutPrimaryWeapon, selectedQuality],
  );
  const loadoutArmorStats = useMemo(
    () => computeArmorStatsWithQuality(loadoutArmor, selectedQuality),
    [loadoutArmor, selectedQuality],
  );
  const loadoutHorseStats = useMemo(
    () =>
      loadoutHorse
        ? computeHorseStatsWithQuality(loadoutHorse, selectedQuality)
        : null,
    [loadoutHorse, selectedQuality],
  );

  /* ═══════════════════════════════════════════════════════════════════
     THREE.JS STÜDYO SAHNESİ (Tek Kalıcı WebGLRenderer + Dinamik İçerik)
     ═══════════════════════════════════════════════════════════════════ */

  const mountRef = useRef<HTMLDivElement | null>(null);
  const stageRootRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const activeUpdatersRef = useRef<((dt: number) => void)[]>([]);
  const activeDisposersRef = useRef<(() => void)[]>([]);
  const autoRotateRef = useRef<boolean>(autoRotate);
  autoRotateRef.current = autoRotate;

  useEffect(() => {
    if (!isOpen) return;
    const container = mountRef.current;
    if (!container) return;

    ensureFactionIKClipsRegistered();

    const width = Math.max(320, container.clientWidth || 720);
    const height = Math.max(300, container.clientHeight || 520);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x110e0b);
    scene.fog = new THREE.FogExp2(0x110e0b, 0.065);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);
    camera.position.set(0, 1.65, 3.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });

    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software/i.test(rendererStr);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Metalik çelik, altın ve bronz yüzeylerin karanlık görünmemesi için RoomEnvironment PMREM
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    // Işıklandırma (Sıcak demirhane ana ışığı + soğuk çelik kontur ışığı)
    const hemi = new THREE.HemisphereLight(0xfde68a, 0x1f1914, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff2d6, 2.2);
    keyLight.position.set(3.2, 5.4, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.15);
    rimLight.position.set(-3.5, 3.0, -2.8);
    scene.add(rimLight);

    const forgeGlow = new THREE.PointLight(0xf59e0b, 1.1, 8);
    forgeGlow.position.set(0, 0.35, -1.4);
    scene.add(forgeGlow);

    // Taş / Bronz Sergi Podyumu (Turntable Pedestal)
    const pedestalGroup = new THREE.Group();
    const baseDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 0.12, 32),
      new THREE.MeshStandardMaterial({
        color: 0x1d1813,
        roughness: 0.82,
        metalness: 0.2,
      }),
    );
    baseDisc.position.y = -0.06;
    baseDisc.receiveShadow = true;
    pedestalGroup.add(baseDisc);

    const goldRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.62, 0.025, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0xc6a15b,
        roughness: 0.32,
        metalness: 0.88,
      }),
    );
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = 0.005;
    pedestalGroup.add(goldRing);
    scene.add(pedestalGroup);

    const stageRoot = new THREE.Group();
    stageRoot.name = 'armoryStageRoot';
    scene.add(stageRoot);
    stageRootRef.current = stageRoot;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.0, 0);
    controls.minDistance = 0.9;
    controls.maxDistance = 9.5;
    controls.maxPolarAngle = Math.PI * 0.49;
    controlsRef.current = controls;

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const renderStep = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (autoRotateRef.current && stageRootRef.current) {
        stageRootRef.current.rotation.y += dt * 0.38;
      }

      for (const fn of activeUpdatersRef.current) {
        fn(dt);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        gl.flush();
        setTimeout(() => {
          if (!disposed) rafId = requestAnimationFrame(renderStep);
        }, 16);
      } else {
        rafId = requestAnimationFrame(renderStep);
      }
    };

    rafId = requestAnimationFrame(renderStep);

    const onResize = () => {
      if (!container || disposed) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(300, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      for (const fn of activeDisposersRef.current) fn();
      activeDisposersRef.current = [];
      activeUpdatersRef.current = [];
      controls.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [isOpen]);

  /* ═══════════════════════════════════════════════════════════════════
     AKTİF SEKME VE SEÇİMLERE GÖRE 3B SAHNEYİ YENİDEN KUR
     ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const stageRoot = stageRootRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!isOpen || !stageRoot || !camera || !controls) return;

    // Önceki nesneleri temizle
    for (const fn of activeDisposersRef.current) fn();
    activeDisposersRef.current = [];
    activeUpdatersRef.current = [];
    stageRoot.clear();

    const lod = lineupMode ? 'battle' : 'hero';

    // ── MOD 1: ASKER TERFİ AĞACI (T1→T6) & LORDLAR ──
    if (activeTab === 'TROOP_PROGRESSION') {
      if (lineupMode) {
        // T1..T6 arasındaki 6 terfi rütbesini yan yana diz (Alay Görünümü)
        const ranks = factionLoadouts.slice(0, 6);
        const spacing = 0.88;
        const startX = -((ranks.length - 1) * spacing) * 0.5;
        let totalTris = 0;

        ranks.forEach((rk, idx) => {
          const built: EquippedUnitSceneResult = buildEquippedTroopOrLordScene(
            rk,
            selectedQuality,
            'battle',
          );
          built.rootGroup.position.set(startX + idx * spacing, 0, 0);
          built.setAnimation(activeAnimation);
          stageRoot.add(built.rootGroup);
          activeUpdatersRef.current.push(built.updateAnimation);
          activeDisposersRef.current.push(built.dispose);
          totalTris += built.totalTriangles;
        });

        setTriangleReadout(totalTris);
        controls.target.set(0, 1.0, 0);
        camera.position.set(0, 1.85, 8.35);
        controls.update();
      } else {
        const built = buildEquippedTroopOrLordScene(
          currentLoadout,
          selectedQuality,
          lod,
        );
        built.setAnimation(activeAnimation);
        stageRoot.add(built.rootGroup);
        activeUpdatersRef.current.push(built.updateAnimation);
        activeDisposersRef.current.push(built.dispose);
        setTriangleReadout(built.totalTriangles);

        const isMounted = Boolean(built.horseRig);
        controls.target.set(0, isMounted ? 1.42 : 1.05, 0);
        camera.position.set(0, isMounted ? 1.95 : 1.48, isMounted ? 6.15 : 3.25);
        controls.update();
      }
      return;
    }

    // ── MOD 2: KILIÇLAR & SİLAHLAR VİTRİNİ ──
    if (activeTab === 'WEAPONS') {
      if (weaponDisplayMode === 'PEDESTAL') {
        const builtWep = buildFactionWeapon3D(currentWeapon, selectedQuality, 'hero');
        const holder = new THREE.Group();

        // Silahı merkeze hizala ve vitrinde rahat incelenecek ölçeğe getir
        const box = new THREE.Box3().setFromObject(builtWep.group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(0.3, size.x, size.y, size.z);
        const normScale = 1.55 / maxDim;

        builtWep.group.position.set(
          -center.x * normScale,
          -center.y * normScale + 1.05,
          -center.z * normScale,
        );
        builtWep.group.scale.setScalar(normScale);
        holder.add(builtWep.group);

        // Kadife / Çelik Silah Sergi Standı
        const stand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.26, 0.18, 16),
          new THREE.MeshStandardMaterial({
            color: 0x292118,
            roughness: 0.6,
            metalness: 0.4,
          }),
        );
        stand.position.y = 0.09;
        holder.add(stand);

        stageRoot.add(holder);
        setTriangleReadout(builtWep.triangles);
        controls.target.set(0, 1.05, 0);
        camera.position.set(0, 1.25, 2.35);
        controls.update();
      } else {
        // Silahı seçili krallığın elit askerinin elinde gerçek 2-Bone IK ile göster
        const customLoadout: FactionTroopRankLoadout = {
          ...currentLoadout,
          horseId:
            currentWeapon.kind === 'cavalry_lance'
              ? (factionHorses[factionHorses.length - 1]?.id ?? null)
              : null,
          primaryWeaponId: currentWeapon.id,
          shieldId:
            currentWeapon.twoHanded ||
            currentWeapon.kind === 'shield' ||
            currentWeapon.kind === 'bow' ||
            currentWeapon.kind === 'crossbow'
              ? null
              : (factionWeapons.find((w) => w.kind === 'shield')?.id ?? null),
        };
        if (currentWeapon.kind === 'shield') {
          customLoadout.primaryWeaponId =
            factionWeapons.find(
              (w) => w.kind === 'one_handed_sword' || w.kind === 'curved_sabre',
            )?.id ?? factionWeapons[0].id;
          customLoadout.shieldId = currentWeapon.id;
        }
        const built = buildEquippedTroopOrLordScene(
          customLoadout,
          selectedQuality,
          'hero',
        );
        built.setAnimation(activeAnimation);
        stageRoot.add(built.rootGroup);
        activeUpdatersRef.current.push(built.updateAnimation);
        activeDisposersRef.current.push(built.dispose);
        setTriangleReadout(built.totalTriangles);

        const isMounted = Boolean(built.horseRig);
        controls.target.set(0, isMounted ? 1.42 : 1.05, 0);
        camera.position.set(0, isMounted ? 1.95 : 1.48, isMounted ? 6.15 : 3.25);
        controls.update();
      }
      return;
    }

    // ── MOD 3: ZIRHLAR & MİĞFERLER VİTRİNİ (Kalibre CharacterRig Manken) ──
    if (activeTab === 'ARMORS') {
      const sigSword =
        factionWeapons.find(
          (w) =>
            (w.kind === 'one_handed_sword' || w.kind === 'curved_sabre') &&
            w.tier >= 5,
        ) ?? factionWeapons[0];
      const sigShield =
        factionWeapons.find((w) => w.kind === 'shield') ?? null;

      const armorLoadout: FactionTroopRankLoadout = {
        ...currentLoadout,
        armorId: currentArmor.id,
        primaryWeaponId: sigSword?.id ?? currentLoadout.primaryWeaponId,
        secondaryWeaponId: null,
        shieldId: sigShield?.id ?? null,
        horseId: null,
      };

      const built = buildEquippedTroopOrLordScene(
        armorLoadout,
        selectedQuality,
        'hero',
      );
      built.setAnimation(
        activeAnimation === 'cavalryGallop' ||
          activeAnimation === 'horseChargeGallop' ||
          activeAnimation === 'horseRear' ||
          activeAnimation === 'attackCouchedLance'
          ? 'idle'
          : activeAnimation,
      );

      stageRoot.add(built.rootGroup);
      activeUpdatersRef.current.push(built.updateAnimation);
      activeDisposersRef.current.push(built.dispose);
      setTriangleReadout(built.totalTriangles);

      controls.target.set(0, 1.02, 0);
      camera.position.set(0, 1.42, 2.85);
      controls.update();
      return;
    }

    // ── MOD 4: SAVAŞ ATLARI & KOŞUMLAR VİTRİNİ (Kalibre WarHorseRig) ──
    if (activeTab === 'HORSES') {
      if (horseWithRider) {
        const eliteArmor =
          factionArmors[factionArmors.length - 1] ?? FACTION_ARMORS[0];
        const lanceDef =
          factionWeapons.find((w) => w.kind === 'cavalry_lance') ??
          factionWeapons[0];
        const shieldDef =
          factionWeapons.find((w) => w.kind === 'shield') ?? null;

        const mountedLoadout: FactionTroopRankLoadout = {
          ...currentLoadout,
          armorId: eliteArmor.id,
          primaryWeaponId: lanceDef?.id ?? currentLoadout.primaryWeaponId,
          shieldId: shieldDef?.id ?? null,
          horseId: currentHorse.id,
        };

        const built = buildEquippedTroopOrLordScene(
          mountedLoadout,
          selectedQuality,
          'hero',
        );
        const isCavalryAnim =
          activeAnimation === 'cavalryGallop' ||
          activeAnimation === 'cavalryTrot' ||
          activeAnimation === 'mountedIdle' ||
          activeAnimation === 'attackCouchedLance' ||
          activeAnimation === 'horseChargeGallop' ||
          activeAnimation === 'horseRear';
        built.setAnimation(isCavalryAnim ? activeAnimation : 'cavalryGallop');

        stageRoot.add(built.rootGroup);
        activeUpdatersRef.current.push(built.updateAnimation);
        activeDisposersRef.current.push(built.dispose);
        setTriangleReadout(built.totalTriangles);
      } else {
        const horseRig = buildFactionWarHorseRig(currentHorse, selectedQuality);
        horseRig.root.rotation.y = -1.01;
        stageRoot.add(horseRig.root);

        let elapsed = 0;
        const speed =
          activeAnimation === 'idle' || activeAnimation === 'ready'
            ? 0.0
            : 5.5;
        updateWarHorseAnimation(horseRig, speed, 0);
        activeUpdatersRef.current.push((dt) => {
          elapsed += dt;
          updateWarHorseAnimation(horseRig, speed, elapsed);
        });
        setTriangleReadout(520);
      }

      controls.target.set(0, 1.26, 0);
      camera.position.set(0, 1.78, 5.45);
      controls.update();
    }
  }, [
    isOpen,
    activeTab,
    selectedFaction,
    selectedQuality,
    currentLoadout,
    currentWeapon,
    currentArmor,
    currentHorse,
    activeAnimation,
    lineupMode,
    weaponDisplayMode,
    horseWithRider,
    factionLoadouts,
    factionWeapons,
    factionArmors,
    factionHorses,
  ]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="faction-armory-studio-modal"
      className="fixed inset-0 z-[95] flex flex-col bg-[#0c0a08] text-[#f3ead8] select-none pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Kalradya 6 Krallık Cephanelik ve Birlik Terfi Stüdyosu"
    >
      {/* 1. ÜST BAŞLIK + 6 KRALLIK SEÇİCİ ŞERİDİ */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[#15110c] border-b border-[#c6a15b]/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xs bg-[#241c13] border border-[#c6a15b]/60 flex items-center justify-center">
            <FactionCrest faction={selectedFaction} size={24} />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#c6a15b]">
              BANNERFORGE 3B CEPHANELİK &amp; ASKER TERFİ ATÖLYESİ
            </div>
            <h1 className="font-display text-base sm:text-lg font-bold tracking-wider text-[#fde68a]">
              {currentFactionMeta.nameTr} · Kılıçlar, Zırhlar, Savaş Atları &amp; Rütbeler
            </h1>
          </div>
        </div>

        {/* 6 Krallık Sekmeleri */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Krallıklar"
        >
          {ARSENAL_FACTIONS.map((fac) => {
            const active = fac.id === selectedFaction;
            return (
              <button
                key={fac.id}
                type="button"
                data-testid={`armory-faction-${fac.id}`}
                onClick={() => {
                  sound.playUiClick();
                  setSelectedFaction(fac.id);
                }}
                className={`px-3 py-1.5 rounded-xs text-xs font-display font-bold tracking-wider border transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#2c2115] border-[#fde68a] text-[#fde68a] shadow-md'
                    : 'bg-[#18130e] border-[#c6a15b]/30 text-[#bfb299] hover:border-[#c6a15b]/70 hover:text-white'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: fac.accentHex }}
                />
                {fac.shortTr}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="armory-files-guide-btn"
            onClick={() => setShowFilesGuide((v) => !v)}
            className="px-3 py-1.5 rounded-xs bg-[#1e2923] hover:bg-[#27382f] border border-[#34d399]/50 text-[11px] font-mono font-bold text-[#a7f3d0]"
          >
            {showFilesGuide ? 'Dosya Haritasını Gizle' : 'Yeni Dosyalar & Kod Bağlantısı'}
          </button>
          <button
            type="button"
            data-testid="armory-studio-close-btn"
            onClick={() => {
              sound.playUiClick();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xs bg-[#2a1614] hover:bg-[#3d1e1b] border border-[#f87171]/50 text-xs font-bold text-[#fecaca]"
          >
            Kapat [ESC]
          </button>
        </div>
      </header>

      {/* OPSİYONEL: MODÜLER DOSYA REHBERİ ŞERİDİ */}
      {showFilesGuide && (
        <div
          data-testid="armory-files-guide-panel"
          className="px-5 py-2.5 bg-[#121c17] border-b border-[#34d399]/40 text-xs text-[#d1fae5] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <div className="font-bold text-[#6ee7b7]">
              Dış Projeye Kopyalanabilir Yeni Modüler Dosyalar (Bağımsız Mimari):
            </div>
            <div className="font-mono text-[11px] text-[#a7f3d0] flex flex-wrap gap-x-4 gap-y-1">
              <span>1) src/armory/FactionArsenal.ts (38 Silah, 18 Zırh, 12 At, Kalite &amp; Fiyat Motoru + 3B Modeller)</span>
              <span>2) src/armory/FactionAnimations.ts (11 Yeni Savaş, Kargı, Yay &amp; At Animasyonu)</span>
              <span>3) src/game/factionTroopLoadouts.ts (T1→T6 Asker Terfi &amp; Lord Kuşanma + Market Köprüsü)</span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-[#6ee7b7]">
            Pazaryeri: CALRADIA_MARKETPLACE_ITEMS içine otomatik bağlandı
          </span>
        </div>
      )}

      {/* 2. ANA İÇERİK: SOL KATEGORİ & LİSTE · ORTA 3B STÜDYO SAHNESİ · SAĞ İSTATİSTİK & KALİTE PANELİ */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
        {/* SOL PANEL (3 Sütun): İnceleme Modu Sekmeleri + Öğe Listesi */}
        <aside className="lg:col-span-3 bg-[#14100c] border-r border-[#c6a15b]/30 flex flex-col min-h-0">
          {/* 4 Ana İnceleme Sekmesi */}
          <div className="grid grid-cols-2 gap-1 p-2.5 bg-[#1b150f] border-b border-[#c6a15b]/25">
            {(
              [
                { id: 'TROOP_PROGRESSION', label: 'Asker Terfi (T1-T6) & Lord' },
                { id: 'WEAPONS', label: 'Kılıçlar & Silahlar' },
                { id: 'ARMORS', label: 'Zırhlar & Miğferler' },
                { id: 'HORSES', label: 'Savaş Atları' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`armory-tab-${tab.id}`}
                  onClick={() => {
                    sound.playUiClick();
                    setActiveTab(tab.id);
                  }}
                  className={`px-2.5 py-2 rounded-xs text-[11px] font-bold tracking-wide border text-center transition-colors ${
                    active
                      ? 'bg-[#b45309] border-[#fde68a] text-white'
                      : 'bg-[#14100b] border-[#c6a15b]/25 text-[#c7b99e] hover:border-[#c6a15b]/60'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Sekmeye Göre Seçim Listesi */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab === 'TROOP_PROGRESSION' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#c6a15b]">
                    {currentFactionMeta.shortTr} Terfi Zinciri
                  </span>
                  <button
                    type="button"
                    data-testid="armory-toggle-lineup-btn"
                    onClick={() => setLineupMode((v) => !v)}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold border ${
                      lineupMode
                        ? 'bg-[#b45309] border-[#fde68a] text-white'
                        : 'bg-[#1c1610] border-[#c6a15b]/40 text-[#fde68a]'
                    }`}
                  >
                    {lineupMode ? 'Tekli İncelemeye Dön' : 'T1–T6 Yan Yana Diz'}
                  </button>
                </div>

                {factionLoadouts.map((load) => {
                  const selected = load.id === currentLoadout.id && !lineupMode;
                  return (
                    <button
                      key={load.id}
                      type="button"
                      data-testid={`armory-loadout-${load.rankStage}`}
                      onClick={() => {
                        sound.playUiClick();
                        setLineupMode(false);
                        setSelectedLoadoutId(load.id);
                        setActiveAnimation(load.defaultAnimation);
                        setSelectedQuality(load.defaultQuality);
                      }}
                      className={`w-full text-left p-2.5 rounded-xs border transition-colors ${
                        selected
                          ? 'bg-[#291f14] border-[#fde68a] shadow'
                          : 'bg-[#18130e] border-[#c6a15b]/25 hover:border-[#c6a15b]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#f59e0b]">
                          {load.rankBadgeTr}
                        </span>
                        <span className="text-[10px] font-mono text-[#a89b84]">
                          {load.horseId ? 'Süvari' : 'Yaya'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#f8f0df] mt-0.5">
                        {load.unitNameTr}
                      </div>
                      <div className="text-[11px] text-[#a89b84] mt-0.5">
                        {load.roleTr}
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {activeTab === 'WEAPONS' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#c6a15b]">
                    Krallık Cephaneliği ({factionWeapons.length})
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid="armory-weapon-mode-pedestal"
                      onClick={() => setWeaponDisplayMode('PEDESTAL')}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        weaponDisplayMode === 'PEDESTAL'
                          ? 'bg-[#b45309] border-[#fde68a] text-white'
                          : 'bg-[#1a140e] border-[#c6a15b]/30 text-[#bfb299]'
                      }`}
                    >
                      Yakın Çekim
                    </button>
                    <button
                      type="button"
                      data-testid="armory-weapon-mode-wielded"
                      onClick={() => setWeaponDisplayMode('WIELDED')}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        weaponDisplayMode === 'WIELDED'
                          ? 'bg-[#b45309] border-[#fde68a] text-white'
                          : 'bg-[#1a140e] border-[#c6a15b]/30 text-[#bfb299]'
                      }`}
                    >
                      Asker Elinde
                    </button>
                  </div>
                </div>

                {factionWeapons.map((wep) => {
                  const st = computeWeaponStatsWithQuality(wep, selectedQuality);
                  const selected = wep.id === currentWeapon.id;
                  return (
                    <button
                      key={wep.id}
                      type="button"
                      data-testid={`armory-weapon-${wep.id}`}
                      onClick={() => {
                        sound.playUiClick();
                        setSelectedWeaponId(wep.id);
                        setActiveAnimation(wep.defaultAnimation);
                      }}
                      className={`w-full text-left p-2.5 rounded-xs border transition-colors ${
                        selected
                          ? 'bg-[#291f14] border-[#fde68a] shadow'
                          : 'bg-[#18130e] border-[#c6a15b]/25 hover:border-[#c6a15b]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-[#c6a15b]">
                          Kademe T{wep.tier} · {wep.twoHanded ? 'Çift Elli' : 'Tek Elli'}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#fbbf24]">
                          {st.priceDinar} Dinar
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#f8f0df] mt-0.5">
                        {wep.nameTr}
                      </div>
                      <div className="text-[11px] text-[#b8aa91] mt-0.5">
                        {st.statSummaryTr}
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {activeTab === 'ARMORS' && (
              <>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#c6a15b] mb-2">
                  Krallık Zırh Setleri ({factionArmors.length})
                </div>
                {factionArmors.map((arm) => {
                  const st = computeArmorStatsWithQuality(arm, selectedQuality);
                  const selected = arm.id === currentArmor.id;
                  return (
                    <button
                      key={arm.id}
                      type="button"
                      data-testid={`armory-armor-${arm.id}`}
                      onClick={() => {
                        sound.playUiClick();
                        setSelectedArmorId(arm.id);
                      }}
                      className={`w-full text-left p-2.5 rounded-xs border transition-colors ${
                        selected
                          ? 'bg-[#291f14] border-[#fde68a] shadow'
                          : 'bg-[#18130e] border-[#c6a15b]/25 hover:border-[#c6a15b]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-[#c6a15b]">
                          Kademe T{arm.tier} · {arm.armorClass.toUpperCase()}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#fbbf24]">
                          {st.priceDinar} Dinar
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#f8f0df] mt-0.5">
                        {arm.nameTr}
                      </div>
                      <div className="text-[11px] text-[#b8aa91] mt-0.5">
                        {st.statSummaryTr}
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {activeTab === 'HORSES' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#c6a15b]">
                    Krallık Savaş Atları ({factionHorses.length})
                  </span>
                  <button
                    type="button"
                    data-testid="armory-horse-toggle-rider"
                    onClick={() => setHorseWithRider((v) => !v)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono border bg-[#1c1610] border-[#c6a15b]/40 text-[#fde68a]"
                  >
                    {horseWithRider ? 'Binicili Gösterim' : 'Sadece At'}
                  </button>
                </div>
                {factionHorses.map((hrs) => {
                  const st = computeHorseStatsWithQuality(hrs, selectedQuality);
                  const selected = hrs.id === currentHorse.id;
                  return (
                    <button
                      key={hrs.id}
                      type="button"
                      data-testid={`armory-horse-${hrs.id}`}
                      onClick={() => {
                        sound.playUiClick();
                        setSelectedHorseId(hrs.id);
                      }}
                      className={`w-full text-left p-2.5 rounded-xs border transition-colors ${
                        selected
                          ? 'bg-[#291f14] border-[#fde68a] shadow'
                          : 'bg-[#18130e] border-[#c6a15b]/25 hover:border-[#c6a15b]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-[#c6a15b]">
                          Kademe T{hrs.tier} · {hrs.barding ? 'Zırhlı Küheylan' : 'Süvari Atı'}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#fbbf24]">
                          {st.priceDinar} Dinar
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#f8f0df] mt-0.5">
                        {hrs.nameTr}
                      </div>
                      <div className="text-[11px] text-[#b8aa91] mt-0.5">
                        {st.statSummaryTr}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* ORTA PANEL (5 Sütun): 3B CANLI WEBGL VİTRİN + ANİMASYON OYNATICI */}
        <section className="lg:col-span-5 relative flex flex-col bg-[#0e0b08] min-h-[340px]">
          {/* Üst Bilgi Rozeti */}
          <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="px-3 py-1.5 rounded bg-[#14100c]/90 border border-[#c6a15b]/40">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#c6a15b]">
                {currentFactionMeta.cultureTr}
              </div>
              <div className="text-xs font-bold text-[#fde68a]">
                {activeTab === 'TROOP_PROGRESSION'
                  ? lineupMode
                    ? `${currentFactionMeta.shortTr} T1 → T6 Terfi Alayı`
                    : `${currentLoadout.rankBadgeTr} · ${currentLoadout.unitNameTr}`
                  : activeTab === 'WEAPONS'
                    ? computedWeapon.fullNameTr
                    : activeTab === 'ARMORS'
                      ? computedArmor.fullNameTr
                      : computedHorse.fullNameTr}
              </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                data-testid="armory-toggle-autorotate"
                onClick={() => setAutoRotate((v) => !v)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border ${
                  autoRotate
                    ? 'bg-[#2a2015] border-[#fde68a] text-[#fde68a]'
                    : 'bg-[#14100c] border-[#c6a15b]/30 text-[#a89b84]'
                }`}
              >
                {autoRotate ? 'Dönüş: Açık' : 'Dönüş: Durdu'}
              </button>
              <span className="px-2.5 py-1 rounded bg-[#14100c]/90 border border-[#c6a15b]/30 text-[11px] font-mono text-[#bfb299]">
                {triangleReadout} Üçgen
              </span>
            </div>
          </div>

          {/* 3B WebGL Canvas Konteyneri */}
          <div
            ref={mountRef}
            data-testid="armory-3d-viewport"
            className="flex-1 w-full h-full min-h-[320px] cursor-grab active:cursor-grabbing"
          />

          {/* Alt Animasyon Kontrol Şeridi */}
          <div className="p-3 bg-[#15110c] border-t border-[#c6a15b]/35 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono uppercase tracking-wider text-[#c6a15b]">
                Canlı Savaş &amp; Binek Animasyonu Seçici:
              </span>
              <span className="text-[#bfb299] font-mono">
                Sol Tık: Döndür · Tekerlek: Yakınlaştır
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {FACTION_ANIMATION_META.map((anim) => {
                const active = activeAnimation === anim.id;
                return (
                  <button
                    key={anim.id}
                    type="button"
                    data-testid={`armory-anim-${anim.id}`}
                    onClick={() => {
                      sound.playUiClick();
                      if (activeTab === 'WEAPONS' && weaponDisplayMode === 'PEDESTAL') {
                        setWeaponDisplayMode('WIELDED');
                      }
                      setActiveAnimation(anim.id);
                    }}
                    className={`px-2.5 py-1 rounded-xs text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'bg-[#b45309] border-[#fde68a] text-white'
                        : 'bg-[#1b150f] border-[#c6a15b]/30 text-[#d6cbb5] hover:border-[#c6a15b]/70'
                    }`}
                  >
                    {anim.nameTr}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SAĞ PANEL (4 Sütun): KALİTE (MODIFIER) SEÇİCİ + HASAR/HIZ/DAYANIKLILIK/ZIRH/FİYAT TABLOSU */}
        <aside className="lg:col-span-4 bg-[#14100c] border-l border-[#c6a15b]/30 p-4 overflow-y-auto space-y-4">
          {/* 1. Kalite (Item Quality Modifier) Seçici */}
          <div className="rounded-xs bg-[#1b150f] border border-[#c6a15b]/35 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#c6a15b]">
                Demirci İşçilik Kalitesi (Item Modifier)
              </span>
              <span
                className="text-xs font-bold"
                style={{ color: ITEM_QUALITY_MODIFIERS[selectedQuality].badgeColor }}
              >
                {ITEM_QUALITY_MODIFIERS[selectedQuality].prefixTr} (×
                {ITEM_QUALITY_MODIFIERS[selectedQuality].priceMultiplier} Fiyat)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {QUALITY_ORDER.map((qId) => {
                const mod = ITEM_QUALITY_MODIFIERS[qId];
                const active = selectedQuality === qId;
                return (
                  <button
                    key={qId}
                    type="button"
                    data-testid={`armory-quality-${qId}`}
                    onClick={() => {
                      sound.playUiClick();
                      setSelectedQuality(qId);
                    }}
                    className={`px-2 py-1.5 rounded-xs text-[11px] font-bold border text-center transition-colors ${
                      active
                        ? 'bg-[#2c2115] border-[#fde68a] text-[#fde68a]'
                        : 'bg-[#120e0a] border-[#c6a15b]/25 text-[#b8aa91] hover:border-[#c6a15b]/60'
                    }`}
                  >
                    {mod.prefixTr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Seçili Modun Detaylı İstatistik ve Pazar Fiyatı Kartı */}
          {activeTab === 'TROOP_PROGRESSION' && (
            <div className="space-y-3" data-testid="armory-troop-stats-card">
              <div className="rounded-xs bg-[#1b150f] border border-[#c6a15b]/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-2">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#f59e0b]">
                      {currentLoadout.rankBadgeTr}
                    </div>
                    <h2 className="font-display text-base font-bold text-[#fde68a]">
                      {currentLoadout.unitNameTr}
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-[#a89b84]">
                      Toplam Donanım Değeri
                    </div>
                    <div
                      data-testid="armory-price-readout"
                      className="text-sm font-mono font-bold text-[#fbbf24]"
                    >
                      {loadoutPrimaryStats.priceDinar +
                        loadoutArmorStats.priceDinar +
                        (loadoutHorseStats?.priceDinar ?? 0)}{' '}
                      Dinar
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#d6cbb5] leading-relaxed">
                  {currentLoadout.promotionNoteTr}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                    <div className="text-[10px] text-[#a89b84]">Günlük Maaş</div>
                    <div className="font-mono font-bold text-[#fde68a]">
                      {currentLoadout.dailyWageDinar > 0
                        ? `${currentLoadout.dailyWageDinar} Dinar / Gün`
                        : 'Soylu Lord / Hazine'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                    <div className="text-[10px] text-[#a89b84]">Terfi Gereksinimi</div>
                    <div className="font-mono font-bold text-[#fde68a]">
                      {currentLoadout.upgradeXpRequired > 0
                        ? `${currentLoadout.upgradeXpRequired} TP`
                        : 'En Üst Kademe'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kuşanılan Silah Özeti */}
              <div className="rounded-xs bg-[#18130e] border border-[#c6a15b]/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#c6a15b]">
                    Ana Silah ({loadoutPrimaryStats.quality.prefixTr})
                  </span>
                  <span className="text-xs font-mono font-bold text-[#fbbf24]">
                    {loadoutPrimaryStats.priceDinar} Dinar
                  </span>
                </div>
                <div className="text-xs font-bold text-[#f8f0df]">
                  {loadoutPrimaryStats.fullNameTr}
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono">
                  <div className="bg-[#120e0a] p-1.5 rounded">
                    Hasar:{' '}
                    <span className="text-[#fca5a5] font-bold">
                      {loadoutPrimaryStats.swingDamage > 0
                        ? loadoutPrimaryStats.swingDamage
                        : loadoutPrimaryStats.thrustDamage}
                    </span>
                  </div>
                  <div className="bg-[#120e0a] p-1.5 rounded">
                    Hız: <span className="text-[#fde68a] font-bold">{loadoutPrimaryStats.speed}</span>
                  </div>
                  <div className="bg-[#120e0a] p-1.5 rounded">
                    Dayanım:{' '}
                    <span className="text-[#6ee7b7] font-bold">
                      {loadoutPrimaryStats.durability}
                    </span>
                  </div>
                </div>
              </div>

              {/* Kuşanılan Zırh Özeti */}
              <div className="rounded-xs bg-[#18130e] border border-[#c6a15b]/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#c6a15b]">
                    Zırh Seti ({loadoutArmor.armorClass.toUpperCase()})
                  </span>
                  <span className="text-xs font-mono font-bold text-[#fbbf24]">
                    {loadoutArmorStats.priceDinar} Dinar
                  </span>
                </div>
                <div className="text-xs font-bold text-[#f8f0df]">
                  {loadoutArmorStats.fullNameTr}
                </div>
                <div className="grid grid-cols-4 gap-1 pt-1 text-[11px] font-mono">
                  <div className="bg-[#120e0a] p-1.5 rounded text-center">
                    Baş: <span className="text-[#fde68a] font-bold">+{loadoutArmorStats.headArmor}</span>
                  </div>
                  <div className="bg-[#120e0a] p-1.5 rounded text-center">
                    Gövde: <span className="text-[#fde68a] font-bold">+{loadoutArmorStats.bodyArmor}</span>
                  </div>
                  <div className="bg-[#120e0a] p-1.5 rounded text-center">
                    Kol: <span className="text-[#fde68a] font-bold">+{loadoutArmorStats.armArmor}</span>
                  </div>
                  <div className="bg-[#120e0a] p-1.5 rounded text-center">
                    Bacak: <span className="text-[#fde68a] font-bold">+{loadoutArmorStats.legArmor}</span>
                  </div>
                </div>
              </div>

              {/* Savaş Atı Özeti */}
              {loadoutHorse && loadoutHorseStats && (
                <div className="rounded-xs bg-[#18130e] border border-[#c6a15b]/30 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-[#c6a15b]">
                      Savaş Atı &amp; Koşum
                    </span>
                    <span className="text-xs font-mono font-bold text-[#fbbf24]">
                      {loadoutHorseStats.priceDinar} Dinar
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#f8f0df]">
                    {loadoutHorseStats.fullNameTr}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono">
                    <div className="bg-[#120e0a] p-1.5 rounded">
                      Hız: <span className="text-[#fde68a] font-bold">{loadoutHorseStats.speed}</span>
                    </div>
                    <div className="bg-[#120e0a] p-1.5 rounded">
                      Hücum: <span className="text-[#fca5a5] font-bold">+{loadoutHorseStats.chargeDamage}</span>
                    </div>
                    <div className="bg-[#120e0a] p-1.5 rounded">
                      Zırh: <span className="text-[#6ee7b7] font-bold">+{loadoutHorseStats.bardingArmor}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'WEAPONS' && (
            <div className="rounded-xs bg-[#1b150f] border border-[#c6a15b]/40 p-4 space-y-3" data-testid="armory-weapon-stats-card">
              <div className="flex items-start justify-between gap-2 border-b border-[#c6a15b]/25 pb-2.5">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#c6a15b]">
                    Kademe T{currentWeapon.tier} · {currentFactionMeta.shortTr} Yapımı
                  </span>
                  <h2 className="font-display text-base font-bold text-[#fde68a] mt-0.5">
                    {computedWeapon.fullNameTr}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#a89b84]">Pazar Fiyatı</div>
                  <div
                    data-testid="armory-price-readout"
                    className="text-base font-mono font-bold text-[#fbbf24]"
                  >
                    {computedWeapon.priceDinar} Dinar
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#d6cbb5] leading-relaxed">
                {currentWeapon.loreTr}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Savurma Hasarı</div>
                  <div className="text-sm font-bold text-[#fca5a5]">
                    {computedWeapon.swingDamage > 0
                      ? `${computedWeapon.swingDamage} (${currentWeapon.swingDamageType})`
                      : 'Yok'}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Saplama / Ok Hasarı</div>
                  <div className="text-sm font-bold text-[#fca5a5]">
                    {computedWeapon.thrustDamage > 0
                      ? `${computedWeapon.thrustDamage} (${currentWeapon.thrustDamageType})`
                      : 'Yok'}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Savurma Hızı</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    {computedWeapon.speed}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Hakimiyet (Handling)</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    {computedWeapon.handling}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Dayanıklılık (HP)</div>
                  <div className="text-sm font-bold text-[#6ee7b7]">
                    {computedWeapon.durability} HP
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Erişim &amp; Ağırlık</div>
                  <div className="text-sm font-bold text-[#e2d6c1]">
                    {computedWeapon.reachCm}cm · {computedWeapon.weightKg}kg
                  </div>
                </div>
              </div>

              {onGrantItemToPlayer && (
                <button
                  type="button"
                  data-testid="armory-grant-weapon-btn"
                  onClick={() => {
                    sound.playCoinChime();
                    onGrantItemToPlayer({
                      id: `mkt_${currentWeapon.id}`,
                      name: computedWeapon.fullNameTr,
                      category: currentWeapon.kind === 'shield' ? 'SHIELD' : 'WEAPON',
                      value: computedWeapon.priceDinar,
                      weight: computedWeapon.weightKg,
                      statBonus: computedWeapon.statSummaryTr,
                      tier: currentWeapon.tier,
                    });
                  }}
                  className="w-full py-2.5 rounded-xs bg-[#1b3124] hover:bg-[#234230] border border-[#34d399]/60 text-xs font-bold text-[#a7f3d0] uppercase tracking-wider"
                >
                  Bu Silahı Oyuncu Envanterine Ekle
                </button>
              )}
            </div>
          )}

          {activeTab === 'ARMORS' && (
            <div className="rounded-xs bg-[#1b150f] border border-[#c6a15b]/40 p-4 space-y-3" data-testid="armory-armor-stats-card">
              <div className="flex items-start justify-between gap-2 border-b border-[#c6a15b]/25 pb-2.5">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#c6a15b]">
                    Kademe T{currentArmor.tier} · {currentArmor.armorClass.toUpperCase()} Zırh
                  </span>
                  <h2 className="font-display text-base font-bold text-[#fde68a] mt-0.5">
                    {computedArmor.fullNameTr}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#a89b84]">Pazar Fiyatı</div>
                  <div
                    data-testid="armory-price-readout"
                    className="text-base font-mono font-bold text-[#fbbf24]"
                  >
                    {computedArmor.priceDinar} Dinar
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#d6cbb5] leading-relaxed">
                {currentArmor.loreTr}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Baş Zırhı (Miğfer)</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    +{computedArmor.headArmor} Zırh
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Gövde Zırhı</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    +{computedArmor.bodyArmor} Zırh
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Omuz &amp; Kol Zırhı</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    +{computedArmor.armArmor} Zırh
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Bacak Zırhı</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    +{computedArmor.legArmor} Zırh
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Dayanıklılık</div>
                  <div className="text-sm font-bold text-[#6ee7b7]">
                    {computedArmor.durability} HP
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Toplam Ağırlık</div>
                  <div className="text-sm font-bold text-[#e2d6c1]">
                    {computedArmor.weightKg} kg
                  </div>
                </div>
              </div>

              {onGrantItemToPlayer && (
                <button
                  type="button"
                  data-testid="armory-grant-armor-btn"
                  onClick={() => {
                    sound.playCoinChime();
                    onGrantItemToPlayer({
                      id: `mkt_${currentArmor.id}`,
                      name: computedArmor.fullNameTr,
                      category: 'ARMOR',
                      value: computedArmor.priceDinar,
                      weight: computedArmor.weightKg,
                      statBonus: computedArmor.statSummaryTr,
                      tier: currentArmor.tier,
                    });
                  }}
                  className="w-full py-2.5 rounded-xs bg-[#1b3124] hover:bg-[#234230] border border-[#34d399]/60 text-xs font-bold text-[#a7f3d0] uppercase tracking-wider"
                >
                  Bu Zırh Setini Oyuncu Envanterine Ekle
                </button>
              )}
            </div>
          )}

          {activeTab === 'HORSES' && (
            <div className="rounded-xs bg-[#1b150f] border border-[#c6a15b]/40 p-4 space-y-3" data-testid="armory-horse-stats-card">
              <div className="flex items-start justify-between gap-2 border-b border-[#c6a15b]/25 pb-2.5">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#c6a15b]">
                    Kademe T{currentHorse.tier} · {currentHorse.breed.toUpperCase()} Cinsi
                  </span>
                  <h2 className="font-display text-base font-bold text-[#fde68a] mt-0.5">
                    {computedHorse.fullNameTr}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#a89b84]">Pazar Fiyatı</div>
                  <div
                    data-testid="armory-price-readout"
                    className="text-base font-mono font-bold text-[#fbbf24]"
                  >
                    {computedHorse.priceDinar} Dinar
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#d6cbb5] leading-relaxed">
                {currentHorse.loreTr}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Dörtnala Hız</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    {computedHorse.speed}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Manevra Kabiliyeti</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    {computedHorse.maneuver}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Hücum Çarpma Hasarı</div>
                  <div className="text-sm font-bold text-[#fca5a5]">
                    +{computedHorse.chargeDamage} Ezici
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Can / Dayanıklılık</div>
                  <div className="text-sm font-bold text-[#6ee7b7]">
                    {computedHorse.hitPoints} HP
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">At Zırhı (Barding)</div>
                  <div className="text-sm font-bold text-[#fde68a]">
                    +{computedHorse.bardingArmor} Zırh
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#120e0a] border border-[#c6a15b]/20">
                  <div className="text-[10px] text-[#a89b84]">Koşum Ağırlığı</div>
                  <div className="text-sm font-bold text-[#e2d6c1]">
                    {computedHorse.harnessWeightKg} kg
                  </div>
                </div>
              </div>

              {onGrantItemToPlayer && (
                <button
                  type="button"
                  data-testid="armory-grant-horse-btn"
                  onClick={() => {
                    sound.playCoinChime();
                    onGrantItemToPlayer({
                      id: `mkt_${currentHorse.id}`,
                      name: computedHorse.fullNameTr,
                      category: 'HORSE',
                      value: computedHorse.priceDinar,
                      weight: 0,
                      statBonus: computedHorse.statSummaryTr,
                      tier: currentHorse.tier,
                    });
                  }}
                  className="w-full py-2.5 rounded-xs bg-[#1b3124] hover:bg-[#234230] border border-[#34d399]/60 text-xs font-bold text-[#a7f3d0] uppercase tracking-wider"
                >
                  Bu Savaş Atını Oyuncu Envanterine Ekle
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
