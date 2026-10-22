import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  CharacterRig,
  CharacterVisualOptions,
  HelmetType,
  ShieldType,
  ArmorTier,
  WeaponType,
  applyEquipmentToRig,
  createCharacterRig,
} from '../game/characterRig.ts';
import { CharacterAnimator } from '../game/characterAnimator.ts';
import {
  CharacterMorphDNA,
  GenderType,
  FaceShape,
  HairStyleId,
  BeardStyleId,
  ScarType,
  WarPaintType,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  HAIR_STYLE_LABELS,
  BEARD_STYLE_LABELS,
  SCAR_LABELS,
  WAR_PAINT_LABELS,
  LORD_DNA_PRESETS,
  PLAYER_DEFAULT_DNA,
  applyMorphDNAToRig,
  cloneDNA,
  generateRandomDNA,
} from '../game/characterMorph.ts';
import { FACTION_INFO, FactionId } from '../game/rules.ts';
import { sound } from '../game/sound.ts';

interface CharacterCreatorModalProps {
  initialDNA?: CharacterMorphDNA;
  characterName?: string;
  confirmLabel?: string;
  onSave: (dna: CharacterMorphDNA, name?: string) => void;
  onClose: () => void;
}

type TabCategory = 'body' | 'face' | 'hair' | 'scars' | 'presets';
type OutfitPreset = 'civilian' | 'leather' | 'chainmail' | 'royal';
type CameraViewPreset = 'face' | 'torso' | 'full';

export const CharacterCreatorModal: React.FC<CharacterCreatorModalProps> = ({
  initialDNA,
  characterName: defaultName = 'Komutan Demirhan',
  confirmLabel,
  onSave,
  onClose,
}) => {
  const [dna, setDna] = useState<CharacterMorphDNA>(() =>
    initialDNA ? cloneDNA(initialDNA) : cloneDNA(PLAYER_DEFAULT_DNA),
  );
  const [name, setName] = useState<string>(defaultName);
  const [activeTab, setActiveTab] = useState<TabCategory>('body');
  const [outfit, setOutfit] = useState<OutfitPreset>('civilian');
  const [cameraView, setCameraView] = useState<CameraViewPreset>('full');
  const [isRotating, setIsRotating] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    rig: CharacterRig;
    animator: CharacterAnimator;
    camTarget: THREE.Vector3;
    camPos: THREE.Vector3;
    rotAngle: number;
    userYaw: number;
    userPitch: number;
    userDist: number;
    isDragging: boolean;
    lastMouseX: number;
    lastMouseY: number;
  } | null>(null);

  // Setup Three.js 3D viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#100d0a');
    scene.fog = new THREE.FogExp2('#100d0a', 0.12);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.appendChild(renderer.domElement);

    // Warm Medieval Lighting (Key, Fill, Rim & Ground Bounce)
    const ambientLight = new THREE.AmbientLight('#fed7aa', 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#fff7ed', 1.8);
    keyLight.position.set(2.5, 4.0, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#93c5fd', 0.65);
    fillLight.position.set(-3.0, 2.5, -2.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#f59e0b', 0.9);
    rimLight.position.set(0, 3.0, -3.5);
    scene.add(rimLight);

    // Pedestal & Ground Plane with stone ring
    const groundGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.14, 16);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#1c1917',
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
    const pedestal = new THREE.Mesh(groundGeo, groundMat);
    pedestal.position.y = -0.07;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    const trimGeo = new THREE.TorusGeometry(1.62, 0.025, 4, 16);
    const trimMat = new THREE.MeshStandardMaterial({ color: '#c6a15b', roughness: 0.4, metalness: 0.8 });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.0;
    scene.add(trim);

    // Build Articulated Low-Poly Humanoid Rig
    const initialVisuals: CharacterVisualOptions = {
      skinTone: dna.skinTone,
      hairColor: dna.hairColor,
      beardColor: dna.beardColor,
      factionColor: FACTION_INFO[dna.culture]?.color || '#991b1b',
      hasBeard: dna.beardStyle !== 'clean_shaven' && dna.gender === 'male',
      weaponType: 'UNARMED',
      shieldType: 'NONE',
      helmetType: 'NONE',
      armorTier: 'CIVILIAN',
    };

    const rig = createCharacterRig(initialVisuals);
    applyMorphDNAToRig(rig, dna);
    scene.add(rig.root);

    const animator = new CharacterAnimator(rig);

    const handles = {
      scene,
      camera,
      renderer,
      rig,
      animator,
      camTarget: new THREE.Vector3(0, 1.0, 0),
      camPos: new THREE.Vector3(0, 1.15, 2.8),
      rotAngle: 0,
      userYaw: 0,
      userPitch: 0.08,
      userDist: 2.7,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
    };
    sceneRef.current = handles;

    // Mouse Drag & Touch Orbit Listeners
    const onMouseDown = (e: MouseEvent) => {
      handles.isDragging = true;
      handles.lastMouseX = e.clientX;
      handles.lastMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!handles.isDragging) return;
      const dx = e.clientX - handles.lastMouseX;
      const dy = e.clientY - handles.lastMouseY;
      handles.lastMouseX = e.clientX;
      handles.lastMouseY = e.clientY;

      handles.userYaw += dx * 0.008;
      handles.userPitch = Math.max(-0.35, Math.min(0.65, handles.userPitch - dy * 0.006));
    };

    const onMouseUp = () => {
      handles.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handles.userDist = Math.max(1.1, Math.min(4.2, handles.userDist + e.deltaY * 0.002));
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Touch Support
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        handles.userYaw += dx * 0.01;
        handles.userPitch = Math.max(-0.35, Math.min(0.65, handles.userPitch - dy * 0.008));
      }
    };
    dom.addEventListener('touchstart', onTouchStart);
    dom.addEventListener('touchmove', onTouchMove);

    // Animation Render Loop
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      animId = requestAnimationFrame(loop);
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // Subtle breathing & idle stance animation
      animator.update(dt);

      // Auto rotation if enabled and not user-dragging
      if (isRotating && !handles.isDragging) {
        handles.userYaw += dt * 0.22;
      }

      // Smooth camera orbit
      const cy = handles.camTarget.y + Math.sin(handles.userPitch) * handles.userDist;
      const radius = Math.cos(handles.userPitch) * handles.userDist;
      const cx = handles.camTarget.x + Math.sin(handles.userYaw) * radius;
      const cz = handles.camTarget.z + Math.cos(handles.userYaw) * radius;

      camera.position.set(cx, cy, cz);
      camera.lookAt(handles.camTarget);

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(loop);

    // Resize Observer
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
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchmove', onTouchMove);
      if (dom.parentNode) dom.parentNode.removeChild(dom);
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Update Morph DNA onto the 3D rig whenever DNA changes
  useEffect(() => {
    if (!sceneRef.current) return;
    const { rig } = sceneRef.current;
    applyMorphDNAToRig(rig, dna);
  }, [dna]);

  // Update Camera Target based on Preset (Face close-up, Torso, Full body)
  useEffect(() => {
    if (!sceneRef.current) return;
    const h = sceneRef.current;
    // Kafa merkezi ≈ 1.90 m (kafatası 1.77–2.08). Yüz kadrajı buraya bakmalı.
    if (cameraView === 'face') {
      h.camTarget.set(0, 1.88 * (dna.height || 1.0), 0);
      h.userDist = 0.72;
      h.userPitch = 0.02;
    } else if (cameraView === 'torso') {
      h.camTarget.set(0, 1.45 * (dna.height || 1.0), 0);
      h.userDist = 1.7;
      h.userPitch = 0.05;
    } else {
      h.camTarget.set(0, 1.0 * (dna.height || 1.0), 0);
      h.userDist = 3.0;
      h.userPitch = 0.05;
    }
  }, [cameraView, dna.height]);

  // Update Outfit Equipment on the 3D Rig
  useEffect(() => {
    if (!sceneRef.current) return;
    const { rig } = sceneRef.current;
    let weaponType: WeaponType = 'ONE_HANDED_SWORD';
    let shieldType: ShieldType = 'ROUND_SHIELD';
    let helmetType: HelmetType = 'NONE';
    let armorTier: ArmorTier = 'CHAINMAIL';

    if (outfit === 'civilian') {
      weaponType = 'UNARMED';
      shieldType = 'NONE';
      helmetType = 'NONE';
      armorTier = 'CIVILIAN';
    } else if (outfit === 'leather') {
      weaponType = 'ONE_HANDED_SWORD';
      shieldType = 'NONE';
      helmetType = 'KETTLE_HAT';
      armorTier = 'LEATHER';
    } else if (outfit === 'chainmail') {
      weaponType = 'ONE_HANDED_SWORD';
      shieldType = 'ROUND_SHIELD';
      helmetType = 'SPANGENHELM';
      armorTier = 'CHAINMAIL';
    } else if (outfit === 'royal') {
      weaponType = 'ONE_HANDED_SWORD';
      shieldType = 'KITE_SHIELD';
      helmetType = 'IMPERIAL_VISOR';
      armorTier = 'PLATE';
    }

    applyEquipmentToRig(rig, {
      weaponType,
      shieldType,
      helmetType,
      armorTier,
      factionColor: FACTION_INFO[dna.culture]?.color || '#991b1b',
      skinTone: dna.skinTone,
      hairColor: dna.hairColor,
      hasBeard: dna.beardStyle !== 'clean_shaven' && dna.gender === 'male',
    });

    // Reapply morph DNA so sockets align properly
    applyMorphDNAToRig(rig, dna);
  }, [outfit, dna.culture]);

  // Handlers for morph updates
  const updateDNA = (changes: Partial<CharacterMorphDNA>) => {
    setDna((prev) => ({ ...prev, ...changes }));
  };

  const handleRandomize = () => {
    sound.playCoin();
    const randomized = generateRandomDNA(dna.culture, dna.gender);
    setDna(randomized);
  };

  const handleReset = () => {
    sound.playShieldHit();
    setDna(cloneDNA(PLAYER_DEFAULT_DNA));
  };

  const handleLoadLord = (lordKey: string) => {
    sound.playWarhorn();
    if (LORD_DNA_PRESETS[lordKey]) {
      const preset = cloneDNA(LORD_DNA_PRESETS[lordKey]);
      setDna(preset);
      if (lordKey === 'lord-rhagaea') setName('İmparatoriçe Rhagaea');
      else if (lordKey === 'lord-derthert') setName('Kral Derthert');
      else if (lordKey === 'lord-caladog') setName('Yüksek Kral Caladog');
      else if (lordKey === 'lord-raganvad') setName('Büyük Prens Raganvad');
      else if (lordKey === 'lord-monchug') setName('Monchug Han');
      else if (lordKey === 'lord-unqid') setName('Sultan Unqid');
      else if (lordKey === 'lord-garios') setName('General Garios');
      else if (lordKey === 'lord-lucon') setName('Arkon Lucon');
      else if (lordKey === 'lord-kargi') setName('Reis Kargı');
    }
  };

  const handleApplyCulture = (culture: FactionId) => {
    sound.playSwordSwoosh();
    const cultureDNA = generateRandomDNA(culture, dna.gender);
    setDna(cultureDNA);
  };

  const handleConfirm = () => {
    sound.playWarhorn();
    onSave(dna, name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 md:p-6 select-none animate-fadeIn">
      {/* Outer Bannerlord Parchment / Iron Frame */}
      <div className="relative w-full max-w-7xl h-[94vh] bg-[#14100c] border-2 border-[#c6a15b]/60 rounded-xl shadow-2xl flex flex-col md:flex-row overflow-hidden font-sans">
        
        {/* ========================================================= */}
        {/* LEFT / CENTER: 3D THREE.JS CHARACTER VIEWPORT */}
        {/* ========================================================= */}
        <div className="relative flex-1 h-1/2 md:h-full bg-radial from-[#231b14] to-[#100d0a] overflow-hidden flex flex-col">
          {/* Top Overlay Header */}
          <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between pointer-events-none gap-2">
            <div className="bg-[#18140f]/90 border border-[#c6a15b]/40 px-3.5 py-1.5 rounded pointer-events-auto backdrop-blur-sm shadow-md">
              <span className="text-[10px] tracking-widest text-[#c6a15b] uppercase font-bold block">
                Kalradya Yüz & Vücut Atölyesi
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-transparent text-sm md:text-base font-bold text-[#fef3c7] outline-none border-b border-transparent hover:border-[#c6a15b]/50 focus:border-[#c6a15b] w-48 md:w-64"
                placeholder="Karakter İsmi..."
              />
            </div>

            {/* Quick Camera Focus Buttons */}
            <div className="flex items-center gap-1.5 bg-[#18140f]/90 border border-[#c6a15b]/40 p-1 rounded pointer-events-auto shadow-md">
              <button
                type="button"
                onClick={() => setCameraView('face')}
                className={`px-2.5 py-1 text-xs rounded transition ${
                  cameraView === 'face'
                    ? 'bg-[#c6a15b] text-[#14100c] font-bold shadow'
                    : 'text-[#e2e8f0]/80 hover:text-white hover:bg-white/10'
                }`}
              >
                👤 Yüz Odak
              </button>
              <button
                type="button"
                onClick={() => setCameraView('torso')}
                className={`px-2.5 py-1 text-xs rounded transition ${
                  cameraView === 'torso'
                    ? 'bg-[#c6a15b] text-[#14100c] font-bold shadow'
                    : 'text-[#e2e8f0]/80 hover:text-white hover:bg-white/10'
                }`}
              >
                🛡️ Gövde
              </button>
              <button
                type="button"
                onClick={() => setCameraView('full')}
                className={`px-2.5 py-1 text-xs rounded transition ${
                  cameraView === 'full'
                    ? 'bg-[#c6a15b] text-[#14100c] font-bold shadow'
                    : 'text-[#e2e8f0]/80 hover:text-white hover:bg-white/10'
                }`}
              >
                ⚔️ Tam Boy
              </button>
            </div>
          </div>

          {/* Three.js Canvas Container */}
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Bottom Controls Overlay on Canvas */}
          <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Outfit Switcher */}
            <div className="flex items-center gap-1 bg-[#18140f]/90 border border-[#c6a15b]/40 p-1 rounded pointer-events-auto shadow-lg backdrop-blur-sm">
              <span className="text-[10px] text-[#c6a15b] px-2 font-mono uppercase">Kıyafet:</span>
              {(['civilian', 'leather', 'chainmail', 'royal'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    sound.playShieldHit();
                    setOutfit(o);
                  }}
                  className={`px-2 py-1 text-xs rounded transition uppercase tracking-wider ${
                    outfit === o
                      ? 'bg-[#991b1b] text-amber-100 font-bold shadow'
                      : 'text-[#e2e8f0]/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {o === 'civilian'
                    ? 'Sade'
                    : o === 'leather'
                      ? 'Deri'
                      : o === 'chainmail'
                        ? 'Zırh'
                        : 'Kraliyet'}
                </button>
              ))}
            </div>

            {/* Orbit / Rotation Controls */}
            <div className="flex items-center gap-2 bg-[#18140f]/90 border border-[#c6a15b]/40 px-3 py-1.5 rounded pointer-events-auto shadow-lg backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setIsRotating(!isRotating)}
                className={`text-xs px-2 py-0.5 rounded transition ${
                  isRotating ? 'bg-[#c6a15b]/30 text-[#fef3c7]' : 'text-stone-400 hover:text-white'
                }`}
              >
                {isRotating ? '🔄 Otomatik Dönüş: Açık' : '⏸️ Dönüş: Sabit'}
              </button>
              <span className="text-[10px] text-stone-400 hidden sm:inline">
                (Fareyle sürükleyip çevirebilirsiniz)
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT PANEL: BANNERLORD CUSTOMIZATION CONTROLS */}
        {/* ========================================================= */}
        <div className="w-full md:w-[460px] h-1/2 md:h-full bg-[#18140f] border-t-2 md:border-t-0 md:border-l-2 border-[#c6a15b]/40 flex flex-col overflow-hidden">
          
          {/* Tab Header Navigation */}
          <div className="flex items-center border-b border-[#c6a15b]/30 bg-[#120f0c] overflow-x-auto no-scrollbar">
            {[
              { id: 'body', label: 'Vücut', icon: '🧍' },
              { id: 'face', label: 'Yüz & Ten', icon: '👤' },
              { id: 'hair', label: 'Saç & Sakal', icon: '✂️' },
              { id: 'scars', label: 'İzler & Boya', icon: '⚔️' },
              { id: 'presets', label: 'Lordlar & Kültür', icon: '👑' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  sound.playCoin();
                  setActiveTab(tab.id as TabCategory);
                }}
                className={`flex-1 py-3 px-2 text-xs md:text-sm font-serif font-bold uppercase tracking-wider text-center whitespace-nowrap transition border-b-2 flex items-center justify-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-[#c6a15b] text-[#fef3c7] bg-[#241c14]'
                    : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-[#1a1510]'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Scrollable Customization Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 text-[#fef3c7] scrollbar-thin">
            
            {/* ---------------- TAB 1: VÜCUT ---------------- */}
            {activeTab === 'body' && (
              <div className="space-y-5 animate-fadeIn">
                <div className="border-b border-[#c6a15b]/20 pb-3">
                  <h4 className="font-serif text-sm font-bold text-[#c6a15b] uppercase tracking-wider">
                    Cinsiyet & Duruş
                  </h4>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => updateDNA({ gender: 'male' })}
                      className={`py-2 px-3 rounded border text-xs font-bold transition flex items-center justify-center gap-2 ${
                        dna.gender === 'male'
                          ? 'border-[#c6a15b] bg-[#c6a15b]/20 text-[#fef3c7]'
                          : 'border-stone-700 bg-stone-900/60 text-stone-400 hover:border-stone-500'
                      }`}
                    >
                      <span>⚔️ Erkek</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDNA({ gender: 'female', beardStyle: 'clean_shaven' })}
                      className={`py-2 px-3 rounded border text-xs font-bold transition flex items-center justify-center gap-2 ${
                        dna.gender === 'female'
                          ? 'border-[#c6a15b] bg-[#c6a15b]/20 text-[#fef3c7]'
                          : 'border-stone-700 bg-stone-900/60 text-stone-400 hover:border-stone-500'
                      }`}
                    >
                      <span>🛡️ Kadın</span>
                    </button>
                  </div>
                </div>

                {/* Height Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300 font-medium">Boy Uzunluğu</span>
                    <span className="font-mono text-[#c6a15b]">
                      {Math.round(dna.height * 180)} cm ({Math.round(dna.height * 100)}%)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.88"
                    max="1.18"
                    step="0.01"
                    value={dna.height}
                    onChange={(e) => updateDNA({ height: parseFloat(e.target.value) })}
                    className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-500">
                    <span>Kısa / Çevik (160 cm)</span>
                    <span>Standart</span>
                    <span>Heybetli / Dev (212 cm)</span>
                  </div>
                </div>

                {/* Build (Muscles / Shoulders) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300 font-medium">Kas Yapısı & Omuz Genişliği</span>
                    <span className="font-mono text-[#c6a15b]">{Math.round(dna.build * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.80"
                    max="1.35"
                    step="0.01"
                    value={dna.build}
                    onChange={(e) => updateDNA({ build: parseFloat(e.target.value) })}
                    className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-500">
                    <span>Narin / İnce</span>
                    <span>Atletik</span>
                    <span>Geniş Omuzlu Gladyatör</span>
                  </div>
                </div>

                {/* Weight (Girth / Fullness) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300 font-medium">Kilo & Gövde Dolgunluğu</span>
                    <span className="font-mono text-[#c6a15b]">{Math.round(dna.weight * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.85"
                    max="1.30"
                    step="0.01"
                    value={dna.weight}
                    onChange={(e) => updateDNA({ weight: parseFloat(e.target.value) })}
                    className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-500">
                    <span>Kuru / Zayıf</span>
                    <span>Dengeli</span>
                    <span>İri Kıyım / Kalıplı</span>
                  </div>
                </div>

                {/* Leg & Arm Proportions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <span className="text-xs text-stone-300 block">Bacak Oranı</span>
                    <input
                      type="range"
                      min="0.90"
                      max="1.12"
                      step="0.01"
                      value={dna.legLength}
                      onChange={(e) => updateDNA({ legLength: parseFloat(e.target.value) })}
                      className="w-full accent-[#c6a15b] bg-stone-800 h-1 rounded cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-stone-300 block">Kol Uzunluğu</span>
                    <input
                      type="range"
                      min="0.92"
                      max="1.10"
                      step="0.01"
                      value={dna.armLength}
                      onChange={(e) => updateDNA({ armLength: parseFloat(e.target.value) })}
                      className="w-full accent-[#c6a15b] bg-stone-800 h-1 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- TAB 2: YÜZ & TEN ---------------- */}
            {activeTab === 'face' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Skin Tone Selector */}
                <div className="space-y-2">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Ten Rengi
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {SKIN_TONES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => updateDNA({ skinTone: st.color })}
                        className={`p-2 rounded border text-left transition flex items-center gap-2.5 ${
                          dna.skinTone === st.color
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20 shadow'
                            : 'border-stone-800 bg-stone-900/60 hover:border-stone-600'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-black/50 shrink-0"
                          style={{ backgroundColor: st.color }}
                        />
                        <span className="text-[11px] truncate text-stone-200">{st.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Face Shape */}
                <div className="space-y-2">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Yüz Kemik Yapısı
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['oval', 'square', 'round', 'angular', 'chiseled'] as FaceShape[]).map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => updateDNA({ faceShape: shape })}
                        className={`py-1.5 px-2 rounded border text-xs capitalize transition ${
                          dna.faceShape === shape
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20 text-[#fef3c7] font-bold'
                            : 'border-stone-800 bg-stone-900/50 text-stone-400 hover:border-stone-600'
                        }`}
                      >
                        {shape === 'square'
                          ? 'Köşeli'
                          : shape === 'chiseled'
                            ? 'Heykelsi'
                            : shape === 'angular'
                              ? 'Keskin'
                              : shape === 'round'
                                ? 'Yuvarlak'
                                : 'Oval'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Jaw & Chin Sliders */}
                <div className="space-y-3 pt-1 border-t border-stone-800">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-stone-300">Çene Genişliği</span>
                      <span className="font-mono text-[#c6a15b]">{Math.round(dna.jawWidth * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.80"
                      max="1.30"
                      step="0.01"
                      value={dna.jawWidth}
                      onChange={(e) => updateDNA({ jawWidth: parseFloat(e.target.value) })}
                      className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-stone-300">Çene Uzunluğu</span>
                      <span className="font-mono text-[#c6a15b]">{Math.round(dna.chinLength * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.80"
                      max="1.30"
                      step="0.01"
                      value={dna.chinLength}
                      onChange={(e) => updateDNA({ chinLength: parseFloat(e.target.value) })}
                      className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Nose Sliders */}
                <div className="space-y-3 pt-1 border-t border-stone-800">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-stone-300">Burun Büyüklüğü & Kemer</span>
                      <span className="font-mono text-[#c6a15b]">{Math.round(dna.noseLength * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.70"
                      max="1.40"
                      step="0.01"
                      value={dna.noseLength}
                      onChange={(e) => updateDNA({ noseLength: parseFloat(e.target.value) })}
                      className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Eye Color */}
                <div className="space-y-2 pt-1 border-t border-stone-800">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Göz Rengi
                  </span>
                  <div className="flex items-center gap-2">
                    {EYE_COLORS.map((ec) => (
                      <button
                        key={ec.id}
                        type="button"
                        onClick={() => updateDNA({ eyeColor: ec.color })}
                        title={ec.name}
                        className={`w-8 h-8 rounded-full border-2 transition ${
                          dna.eyeColor === ec.color
                            ? 'border-[#c6a15b] scale-110 shadow-lg'
                            : 'border-stone-700 opacity-75 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: ec.color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Skin Age */}
                <div className="space-y-1 pt-1 border-t border-stone-800">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300">Yaş & Tecrübe Kırışıklıkları</span>
                    <span className="font-mono text-[#c6a15b]">{Math.round(18 + dna.skinAge * 52)} Yaş</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.0"
                    step="0.02"
                    value={dna.skinAge}
                    onChange={(e) => updateDNA({ skinAge: parseFloat(e.target.value) })}
                    className="w-full accent-[#c6a15b] bg-stone-800 h-1.5 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* ---------------- TAB 3: SAÇ & SAKAL ---------------- */}
            {activeTab === 'hair' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Hair Style */}
                <div className="space-y-2">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Saç Modeli
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(HAIR_STYLE_LABELS) as HairStyleId[]).map((hs) => (
                      <button
                        key={hs}
                        type="button"
                        onClick={() => {
                          sound.playSwordSwoosh();
                          updateDNA({ hairStyle: hs });
                        }}
                        className={`p-2.5 rounded border text-left transition flex flex-col ${
                          dna.hairStyle === hs
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20 shadow'
                            : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                        }`}
                      >
                        <span className="text-xs font-bold text-[#fef3c7]">{HAIR_STYLE_LABELS[hs].name}</span>
                        <span className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">
                          {HAIR_STYLE_LABELS[hs].desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hair & Beard Color */}
                <div className="space-y-2 pt-2 border-t border-stone-800">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Saç ve Sakal Rengi
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {HAIR_COLORS.map((hc) => (
                      <button
                        key={hc.id}
                        type="button"
                        onClick={() => updateDNA({ hairColor: hc.color, beardColor: hc.color })}
                        className={`p-1.5 rounded border text-center transition flex flex-col items-center gap-1 ${
                          dna.hairColor === hc.color
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20'
                            : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full border border-black/60 shadow"
                          style={{ backgroundColor: hc.color }}
                        />
                        <span className="text-[10px] truncate w-full text-stone-300">{hc.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Beard Style (Male only) */}
                {dna.gender === 'male' && (
                  <div className="space-y-2 pt-2 border-t border-stone-800">
                    <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                      Sakal & Bıyık Modeli
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(BEARD_STYLE_LABELS) as BeardStyleId[]).map((bs) => (
                        <button
                          key={bs}
                          type="button"
                          onClick={() => {
                            sound.playSwordSwoosh();
                            updateDNA({ beardStyle: bs });
                          }}
                          className={`p-2.5 rounded border text-left transition flex flex-col ${
                            dna.beardStyle === bs
                              ? 'border-[#c6a15b] bg-[#c6a15b]/20 shadow'
                              : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                          }`}
                        >
                          <span className="text-xs font-bold text-[#fef3c7]">{BEARD_STYLE_LABELS[bs].name}</span>
                          <span className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">
                            {BEARD_STYLE_LABELS[bs].desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---------------- TAB 4: İZLER & BOYA ---------------- */}
            {activeTab === 'scars' && (
              <div className="space-y-5 animate-fadeIn">
                {/* Scars */}
                <div className="space-y-2">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Muharebe Yara İzi
                  </span>
                  <div className="space-y-1.5">
                    {(Object.keys(SCAR_LABELS) as ScarType[]).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => {
                          sound.playSwordSwoosh();
                          updateDNA({ scar: sc });
                        }}
                        className={`w-full p-2.5 rounded border text-left transition flex justify-between items-center ${
                          dna.scar === sc
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20'
                            : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-bold text-[#fef3c7]">{SCAR_LABELS[sc].name}</span>
                          <p className="text-[10px] text-stone-400 mt-0.5">{SCAR_LABELS[sc].desc}</p>
                        </div>
                        {dna.scar === sc && <span className="text-[#c6a15b] font-bold text-sm">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* War Paint */}
                <div className="space-y-2 pt-2 border-t border-stone-800">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Savaş Boyası & Damgalar
                  </span>
                  <div className="space-y-1.5">
                    {(Object.keys(WAR_PAINT_LABELS) as WarPaintType[]).map((wp) => (
                      <button
                        key={wp}
                        type="button"
                        onClick={() => {
                          sound.playSwordSwoosh();
                          updateDNA({ warPaint: wp });
                        }}
                        className={`w-full p-2.5 rounded border text-left transition flex justify-between items-center ${
                          dna.warPaint === wp
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20'
                            : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-bold text-[#fef3c7]">{WAR_PAINT_LABELS[wp].name}</span>
                          <p className="text-[10px] text-stone-400 mt-0.5">{WAR_PAINT_LABELS[wp].desc}</p>
                        </div>
                        {dna.warPaint === wp && <span className="text-[#c6a15b] font-bold text-sm">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- TAB 5: LORDLAR & KÜLTÜR ---------------- */}
            {activeTab === 'presets' && (
              <div className="space-y-5 animate-fadeIn">
                {/* 9 Historical Calradia Lords */}
                <div className="space-y-2">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Tarihi Krallar & Hükümdarlar (Canlı Yükle)
                  </span>
                  <p className="text-[11px] text-stone-400">
                    Kalradya tahtının hakiki hükümdarlarının yüz ve vücut genetiğini karakterinize aktarın:
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { id: 'lord-derthert', title: 'Kral Derthert', fac: 'vlandia', icon: '🦁' },
                      { id: 'lord-rhagaea', title: 'İmparatoriçe Rhagaea', fac: 'empire', icon: '👑' },
                      { id: 'lord-caladog', title: 'Yüksek Kral Caladog', fac: 'battania', icon: '🦌' },
                      { id: 'lord-raganvad', title: 'Büyük Prens Raganvad', fac: 'sturgia', icon: '⚔️' },
                      { id: 'lord-monchug', title: 'Monchug Han', fac: 'khuzait', icon: '🐎' },
                      { id: 'lord-unqid', title: 'Sultan Unqid', fac: 'aserai', icon: '☀️' },
                      { id: 'lord-garios', title: 'General Garios', fac: 'empire', icon: '🦅' },
                      { id: 'lord-lucon', title: 'Arkon Lucon', fac: 'empire', icon: '🏛️' },
                      { id: 'lord-kargi', title: 'Reis Kargı', fac: 'bandits', icon: '☠️' },
                    ].map((lord) => (
                      <button
                        key={lord.id}
                        type="button"
                        onClick={() => handleLoadLord(lord.id)}
                        className="p-2 rounded border border-stone-700 bg-stone-900/60 hover:border-[#c6a15b] hover:bg-[#c6a15b]/10 text-left transition flex items-center gap-2 group"
                      >
                        <span className="text-base group-hover:scale-110 transition">{lord.icon}</span>
                        <div className="overflow-hidden">
                          <span className="text-xs font-bold text-stone-200 block truncate group-hover:text-[#fef3c7]">
                            {lord.title}
                          </span>
                          <span className="text-[10px] text-stone-400 capitalize">
                            {FACTION_INFO[lord.fac as FactionId]?.name || lord.fac}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Culture Presets */}
                <div className="space-y-2 pt-2 border-t border-stone-800">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Kültürel Genetik Başlatıcı
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['vlandia', 'battania', 'sturgia', 'empire', 'khuzait', 'aserai'] as FactionId[]).map(
                      (c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleApplyCulture(c)}
                          className={`p-2 rounded border text-left transition flex items-center justify-between ${
                            dna.culture === c
                              ? 'border-[#c6a15b] bg-[#c6a15b]/20 font-bold'
                              : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                          }`}
                        >
                          <span className="text-xs text-stone-200">{FACTION_INFO[c]?.name}</span>
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: FACTION_INFO[c]?.color }}
                          />
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="p-4 border-t border-[#c6a15b]/30 bg-[#120f0c] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRandomize}
                title="Rastgele Yarat"
                className="px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 text-[#fef3c7] border border-stone-600 text-xs font-bold transition flex items-center gap-1"
              >
                <span>🎲</span>
                <span className="hidden sm:inline">Rastgele</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Sıfırla"
                className="px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 text-xs transition"
              >
                ↺
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded bg-stone-900/80 hover:bg-stone-800 text-stone-400 hover:text-white border border-stone-700 text-xs font-medium transition"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-4 py-2 rounded bg-[#c6a15b] hover:bg-[#d4af37] text-[#14100c] font-serif font-bold text-xs md:text-sm tracking-wide shadow-lg hover:shadow-[#c6a15b]/20 transition flex items-center gap-1.5"
              >
                <span>⚔️</span>
                <span>{confirmLabel || 'Karakteri Onayla'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
