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
import {
  FACTION_INFO,
  FactionId,
  NewGameStartOptions,
  BannerlordSkillId,
  AttributeId,
} from '../game/rules.ts';
import {
  SKILL_LABELS,
  ATTRIBUTE_LABELS,
} from '../game/characterDevelopment.ts';
import { sound } from '../game/sound.ts';

interface CharacterCreatorModalProps {
  initialDNA?: CharacterMorphDNA;
  characterName?: string;
  confirmLabel?: string;
  onSave: (dna: CharacterMorphDNA, name?: string, startOptions?: NewGameStartOptions) => void;
  onClose: () => void;
}

type TabCategory = 'story' | 'body' | 'face' | 'hair' | 'scars' | 'presets' | 'clan';
type OutfitPreset = 'civilian' | 'leather' | 'chainmail' | 'royal';
type CameraViewPreset = 'face' | 'torso' | 'full';
type DifficultyLevel = 'VERY_EASY' | 'EASY' | 'REALISTIC';

interface StoryChoiceOption {
  id: string;
  title: string;
  desc: string;
  attr: AttributeId;
  skills: [BannerlordSkillId, BannerlordSkillId];
}

const BANNERLORD_LIFE_STAGES: Array<{
  stageId: string;
  stageTitle: string;
  subtitle: string;
  options: StoryChoiceOption[];
}> = [
  {
    stageId: 'family',
    stageTitle: '1. Ailenizin Kökeni',
    subtitle: 'Kalradya topraklarında dünyaya geldiğiniz hanenin geçmişi:',
    options: [
      {
        id: 'retainers',
        title: 'Bey Konağı Muhafızları',
        desc: 'Babanız yerel bir sancakbeyinin maiyetinde kılıç kuşanmış kıdemli bir muhafızdı.',
        attr: 'VIGOR',
        skills: ['oneHanded', 'polearm'],
      },
      {
        id: 'yeomen',
        title: 'Özgür Toprak Sahipleri',
        desc: 'Aileniz kendi tarlasını süren, gerektiğinde milis saflarında köyünü savunan özgür çiftçilerdi.',
        attr: 'ENDURANCE',
        skills: ['polearm', 'athletics'],
      },
      {
        id: 'merchants',
        title: 'Şehirli Kervan Tüccarları',
        desc: 'Aileniz şehir pazarları arasında ipek, tahıl ve demir taşıyan lonca mensuplarıydı.',
        attr: 'SOCIAL',
        skills: ['trade', 'charm'],
      },
      {
        id: 'nomads',
        title: 'Göçebe Bozkır Boyu',
        desc: 'Çadırlar ve yılkı sürüleri arasında, eyer üstünde ok atarak büyüyen bir obanın evladısınız.',
        attr: 'CONTROL',
        skills: ['riding', 'bow'],
      },
    ],
  },
  {
    stageId: 'childhood',
    stageTitle: '2. Erken Çocukluk',
    subtitle: 'Çocukluk yıllarınızda yaşıtlarınız arasında hangi özelliğinizle tanındınız?',
    options: [
      {
        id: 'leadership_kid',
        title: 'Liderlik Yeteneğinizle',
        desc: 'Mahalledeki ve köydeki çocukları örgütler, oyunlarda bile taktik kurardınız.',
        attr: 'SOCIAL',
        skills: ['leadership', 'tactics'],
      },
      {
        id: 'brawn_kid',
        title: 'Gücünüz ve Cesaretle',
        desc: 'Ağır işlerden kaçmaz, tahta kılıçlarla yapılan talimlerde kimseye yenilmezdiniz.',
        attr: 'VIGOR',
        skills: ['oneHanded', 'twoHanded'],
      },
      {
        id: 'attention_kid',
        title: 'Keskin Gözleminizle',
        desc: 'Ormandaki izleri sürer, en küçük ayrıntıyı bile gözden kaçırmazdınız.',
        attr: 'CUNNING',
        skills: ['scouting', 'bow'],
      },
    ],
  },
  {
    stageId: 'adolescence',
    stageTitle: '3. Ergenlik Yılları',
    subtitle: 'Büyüdükçe ailenize hangi günlük görevde omuz verdiniz?',
    options: [
      {
        id: 'herded_horses',
        title: 'At Sürülerini Güttünüz',
        desc: 'Yaban atlarını ehlileştirip otlaklarda gece gündüz nöbet tuttunuz.',
        attr: 'ENDURANCE',
        skills: ['riding', 'scouting'],
      },
      {
        id: 'village_smithy',
        title: 'Demirci Ocağında Çıraklık',
        desc: 'Örs başında pusat onardınız, çeliğin suyunu ve silah dengesini öğrendiniz.',
        attr: 'VIGOR',
        skills: ['smithing', 'oneHanded'],
      },
      {
        id: 'sold_produce',
        title: 'Pazarda Mal Sattınız',
        desc: 'Hasadı kasaba pazarına götürüp tüccarlarla sıkı pazarlıklar yaptınız.',
        attr: 'INTELLIGENCE',
        skills: ['trade', 'steward'],
      },
    ],
  },
  {
    stageId: 'youth',
    stageTitle: '4. Gençlikte Askeri Eğitim',
    subtitle: 'Kalradya savaşlarla çalkalanırken gençliğinizde nasıl tecrübe kazandınız?',
    options: [
      {
        id: 'cavalry_train',
        title: 'Süvari Alayında At Koşturdunuz',
        desc: 'Sınır boylarında atlı devriyelerle birlikte kargı ve kılıç talimi yaptınız.',
        attr: 'ENDURANCE',
        skills: ['riding', 'polearm'],
      },
      {
        id: 'skirmisher_train',
        title: 'Avcılar ve Gözcülerle Gezdiniz',
        desc: 'Yay gerip pusudan ok yağdırmayı, sarp geçitlerde iz sürmeyi öğrendiniz.',
        attr: 'CONTROL',
        skills: ['bow', 'scouting'],
      },
      {
        id: 'infantry_guard',
        title: 'Garnizon Kalkan Duvarında Durdunuz',
        desc: 'Kale muhafızlarıyla omuz omuza kalkan tutup yakın dövüşte piştiniz.',
        attr: 'VIGOR',
        skills: ['oneHanded', 'athletics'],
      },
    ],
  },
  {
    stageId: 'accomplishment',
    stageTitle: '5. Gençlik Başarınız',
    subtitle: 'Yola çıkmadan önce adınızı duyuran en önemli olay neydi?',
    options: [
      {
        id: 'defeated_raider',
        title: 'Bir Haydut Çetesini Püskürttünüz',
        desc: 'Köyünüze saldıran yağmacıların elebaşını teke tek dövüşte alt ettiniz.',
        attr: 'VIGOR',
        skills: ['oneHanded', 'tactics'],
      },
      {
        id: 'saved_caravan',
        title: 'Kuşatılan Kervanı Kurtardınız',
        desc: 'Fırtınada ve pusuda dağılan bir kervanı güvenli yoldan şehre ulaştırdınız.',
        attr: 'CUNNING',
        skills: ['scouting', 'leadership'],
      },
      {
        id: 'treated_plague',
        title: 'Salgın ve Kıtlıkta Halkı Yaşattınız',
        desc: 'Kış kıtlığında erzakları adilce paylaştırıp yaralıları tedavi ettiniz.',
        attr: 'INTELLIGENCE',
        skills: ['medicine', 'steward'],
      },
    ],
  },
  {
    stageId: 'family_fate',
    stageTitle: '6. Aile Baskını & Yola Çıkış',
    subtitle: 'Gece baskınında haneniz yakıldığında ağabeyinizle nasıl kurtuldunuz?',
    options: [
      {
        id: 'subdued_guard',
        title: 'Nöbetçiyi Haklayıp Silahlandınız',
        desc: 'Ağabeyinizle sırt sırta verip baskıncıları yararak atlarınıza ulaştınız.',
        attr: 'VIGOR',
        skills: ['oneHanded', 'athletics'],
      },
      {
        id: 'snuck_out',
        title: 'Oklarla Uzaktan Koruma Sağladınız',
        desc: 'Karanlıkta yayınızı konuşturup ağabeyinizle iz kaybettirdiniz.',
        attr: 'CONTROL',
        skills: ['bow', 'roguery'],
      },
      {
        id: 'rode_fast',
        title: 'Gece Karanlığında At Sürdünüz',
        desc: 'Ahırdaki son binek atlarını çözüp şafak sökmeden Lycaron vadisine ulaştınız.',
        attr: 'ENDURANCE',
        skills: ['riding', 'scouting'],
      },
    ],
  },
];

const HERALDIC_SVG_EMBLEMS: Record<string, React.ReactNode> = {
  '🦅': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
      <path d="M12 3l2.2 3.2L19 4.5l-1.8 4.8L21 12l-4.5 1.5L18 19l-6-3.2L6 19l1.5-5.5L3 12l3.8-2.7L5 4.5l4.8 1.7L12 3z" />
    </svg>
  ),
  '🦁': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
      <path d="M12 2c4.4 0 8 3.6 8 8 0 3.1-1.8 5.8-4.4 7.1L17 22H7l1.4-4.9C5.8 15.8 4 13.1 4 10c0-4.4 3.6-8 8-8zm-2.5 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 13l-2.5 2.5h5L12 13z" />
    </svg>
  ),
  '🦌': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current" strokeWidth="2">
      <path d="M5 4l3 4 4-2 4 2 3-4M4 8l4 1M20 8l-4 1M12 6v14M8 14l4 6 4-6" />
    </svg>
  ),
  '⚔': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current" strokeWidth="2">
      <path d="M4 20L19 5M15 4h5v5M20 20L5 5M9 4H4v5" />
    </svg>
  ),
  '👑': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
      <path d="M3 18h18v2H3v-2zm0-2l2-9 4.5 4L12 5l2.5 6L19 7l2 9H3z" />
    </svg>
  ),
  '🐎': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current" strokeWidth="2">
      <path d="M6 20l2-6 3-3 1-5 5 2 2 5-3 2-2 5H6z" />
    </svg>
  ),
  '☀': (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

const CULTURE_BONUS_CARDS: Array<{
  id: FactionId;
  title: string;
  bonusTitle: string;
  bonusDesc: string;
}> = [
  {
    id: 'vlandia',
    title: 'Vlandiya',
    bonusTitle: 'Feodal Şövalye Geleneği',
    bonusDesc: 'Savaşta askerler +%20 terfi tecrübesi kazanır; paralı asker geliri +%15 artar.',
  },
  {
    id: 'sturgia',
    title: 'Sturgia',
    bonusTitle: 'Kuzey Kar Yürüyüşçüleri',
    bonusDesc: 'Karlı arazilerde hız cezası %20 azalır; kalkan duvarında piyade toplanması güçlenir.',
  },
  {
    id: 'empire',
    title: 'İmparatorluk',
    bonusTitle: 'İmparatorluk Mühendisliği',
    bonusDesc: 'Garnizon ücretleri %20 daha az; kuşatma silahı ve şehir inşası +%25 daha hızlı.',
  },
  {
    id: 'aserai',
    title: 'Aserai',
    bonusTitle: 'Çöl Kervan Sultanlığı',
    bonusDesc: 'Kervan kurma %30 ucuz, ticaret cezası %10 az; çölde hareket hızı cezası yok.',
  },
  {
    id: 'khuzait',
    title: 'Kuzait',
    bonusTitle: 'Bozkır Atlı Göçebeleri',
    bonusDesc: 'Haritada atlı birliklerden +%10 ekstra hız bonusu; bozkırda süvari devşirme ucuz.',
  },
  {
    id: 'battania',
    title: 'Batanya',
    bonusTitle: 'Ulu Orman Pusucuları',
    bonusDesc: 'Ormanlarda hız cezası %10 daha az ve görüş menzili +%15 daha geniş.',
  },
];

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
  const [clanName, setClanName] = useState<string>('Demirhan Hanedanı');
  const [bannerColor, setBannerColor] = useState<string>('#d97706');
  const [bannerEmblem, setBannerEmblem] = useState<string>('🦅');
  const [ironmanMode, setIronmanMode] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<{
    playerDamageTaken: DifficultyLevel;
    friendlyTroopDamage: DifficultyLevel;
    recruitmentDifficulty: DifficultyLevel;
    mapMovementSpeed: DifficultyLevel;
    persuasionSuccess: DifficultyLevel;
  }>({
    playerDamageTaken: 'REALISTIC',
    friendlyTroopDamage: 'REALISTIC',
    recruitmentDifficulty: 'REALISTIC',
    mapMovementSpeed: 'REALISTIC',
    persuasionSuccess: 'REALISTIC',
  });
  const [activeTab, setActiveTab] = useState<TabCategory>('story');
  const [outfit, setOutfit] = useState<OutfitPreset>('civilian');
  const [cameraView, setCameraView] = useState<CameraViewPreset>('full');
  const [isRotating, setIsRotating] = useState<boolean>(true);
  const [brotherName, setBrotherName] = useState<string>('Niasen');
  const [storySelections, setStorySelections] = useState<Record<string, string>>({
    family: 'retainers',
    childhood: 'leadership_kid',
    adolescence: 'herded_horses',
    youth: 'cavalry_train',
    accomplishment: 'defeated_raider',
    family_fate: 'subdued_guard',
  });

  const computedStoryBonuses = useMemo(() => {
    const attrBonuses: Partial<Record<AttributeId, number>> = {};
    const skillBonuses: Partial<Record<BannerlordSkillId, number>> = {};
    const titles: string[] = [];

    for (const stage of BANNERLORD_LIFE_STAGES) {
      const pickedId = storySelections[stage.stageId];
      const opt = stage.options.find((o) => o.id === pickedId) || stage.options[0];
      if (!opt) continue;
      titles.push(opt.title);
      attrBonuses[opt.attr] = (attrBonuses[opt.attr] ?? 0) + 1;
      for (const sk of opt.skills) {
        skillBonuses[sk] = (skillBonuses[sk] ?? 0) + 10;
      }
    }

    return {
      attrBonuses,
      skillBonuses,
      summary: titles.slice(0, 3).join(' · '),
    };
  }, [storySelections]);

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
    sound.playUiClick();
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
    sound.playUiClick();
    const cultureDNA = generateRandomDNA(culture, dna.gender);
    setDna(cultureDNA);
  };

  const handleConfirm = () => {
    sound.playSettlementEnter();
    onSave(dna, name, {
      realisticBannerlordStart: true,
      culture: dna.culture,
      clanName,
      familyBrotherName: brotherName.trim() || 'Niasen',
      storySummary: computedStoryBonuses.summary,
      storyAttrBonuses: computedStoryBonuses.attrBonuses,
      storySkillBonuses: computedStoryBonuses.skillBonuses,
    });
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div
      data-testid="character-creator-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 md:p-6 select-none animate-fadeIn"
    >
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
                Yüz Odak
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
                Gövde
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
                Tam Boy
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
                {isRotating ? 'Otomatik Dönüş: Açık' : 'Dönüş: Sabit'}
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
        <div className="w-full md:w-[490px] h-1/2 md:h-full bg-[#18140f] border-t-2 md:border-t-0 md:border-l-2 border-[#c6a15b]/40 flex flex-col overflow-hidden">
          
          {/* Tab Header Navigation */}
          <div className="flex items-center border-b border-[#c6a15b]/30 bg-[#120f0c] overflow-x-auto no-scrollbar">
            {[
              { id: 'story', label: 'Hikaye & Aile' },
              { id: 'body', label: 'Vücut' },
              { id: 'face', label: 'Yüz' },
              { id: 'hair', label: 'Saç' },
              { id: 'scars', label: 'İzler' },
              { id: 'presets', label: 'Kültür' },
              { id: 'clan', label: 'Klan & Zorluk' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`creator-tab-${tab.id}`}
                onClick={() => {
                  sound.playUiClick();
                  setActiveTab(tab.id as TabCategory);
                }}
                className={`flex-1 py-3 px-2 text-[11px] font-serif font-bold uppercase tracking-wider text-center whitespace-nowrap transition border-b-2 flex items-center justify-center ${
                  activeTab === tab.id
                    ? 'border-[#c6a15b] text-[#fef3c7] bg-[#241c14]'
                    : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-[#1a1510]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Scrollable Customization Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 text-[#fef3c7] scrollbar-thin">
            
            {/* ---------------- TAB 0: BANNERLORD 6-AŞAMALI HİKAYE & BAŞLANGIÇ AİLESİ ---------------- */}
            {activeTab === 'story' && (
              <div className="space-y-4 animate-fadeIn" data-testid="creator-story-panel">
                <div className="p-3 rounded border border-[#c6a15b]/40 bg-[#120f0b]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider">
                      Aile & Başlangıç Durumu (Bannerlord Sefer Başlangıcı)
                    </span>
                    <span className="text-[10px] font-mono text-[#e2c275] bg-[#2a2116] px-2 py-0.5 rounded border border-[#c6a15b]/30">
                      0 Asker · 1 Aile Üyesi
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-300 mt-1.5 leading-relaxed">
                    Gece baskınından ağabeyinizle birlikte sağ kurtuldunuz. Yanınızda hazır bir ordu yok; yalnızca ağabeyiniz, binek atınız, kılıcınız, yayınız, sadağınız ve birkaç günlük erzağınızla Kalradya yollarındasınız.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <label className="text-[11px] text-stone-400 shrink-0">Yanınızdaki Ağabeyinizin Adı:</label>
                    <input
                      type="text"
                      value={brotherName}
                      onChange={(e) => setBrotherName(e.target.value)}
                      className="flex-1 px-2.5 py-1 rounded bg-stone-900 border border-[#c6a15b]/40 text-xs font-bold text-[#fef3c7] outline-none focus:border-[#c6a15b]"
                      placeholder="Niasen"
                    />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10px] text-stone-300">
                    <div className="px-2 py-1 rounded bg-stone-900/80 border border-stone-800">
                      <span className="text-[#c6a15b] font-bold">Silahlar:</span> Piyade Kılıcı, Avcı Yayı, 24 Ok
                    </div>
                    <div className="px-2 py-1 rounded bg-stone-900/80 border border-stone-800">
                      <span className="text-[#c6a15b] font-bold">Binek & Kıyafet:</span> Bozkır Atı, Gezgin Tuniği
                    </div>
                    <div className="px-2 py-1 rounded bg-stone-900/80 border border-stone-800">
                      <span className="text-[#c6a15b] font-bold">Erzak:</span> Tahıl (x2) & Kurutulmuş Et (x1)
                    </div>
                    <div className="px-2 py-1 rounded bg-stone-900/80 border border-stone-800">
                      <span className="text-[#c6a15b] font-bold">Başlangıç:</span> 0 Asker · 0 Nam · 1000 Dinar
                    </div>
                  </div>
                </div>

                {/* 6 Life Story Stages */}
                <div className="space-y-3.5">
                  {BANNERLORD_LIFE_STAGES.map((stage) => {
                    const selectedId = storySelections[stage.stageId] || stage.options[0].id;
                    return (
                      <div
                        key={stage.stageId}
                        className="p-3 rounded border border-stone-800 bg-stone-900/50 space-y-2"
                      >
                        <div>
                          <h5 className="text-xs font-serif font-bold text-[#e6c885]">
                            {stage.stageTitle}
                          </h5>
                          <p className="text-[10px] text-stone-400">{stage.subtitle}</p>
                        </div>
                        <div className="space-y-1.5">
                          {stage.options.map((opt) => {
                            const active = selectedId === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  sound.playUiClick();
                                  setStorySelections((prev) => ({
                                    ...prev,
                                    [stage.stageId]: opt.id,
                                  }));
                                }}
                                className={`w-full p-2 rounded border text-left transition ${
                                  active
                                    ? 'border-[#c6a15b] bg-[#c6a15b]/20 text-[#fef3c7]'
                                    : 'border-stone-800 bg-[#120f0b]/80 text-stone-300 hover:border-stone-600'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold">{opt.title}</span>
                                  <span className="text-[10px] font-mono text-[#c6a15b] text-right">
                                    +1 {ATTRIBUTE_LABELS[opt.attr].name} · +10 {SKILL_LABELS[opt.skills[0]]} / {SKILL_LABELS[opt.skills[1]]}
                                  </span>
                                </div>
                                <p className="text-[10px] text-stone-400 mt-0.5 leading-snug">
                                  {opt.desc}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Toplam Hikaye Nitelik ve Beceri Kazancı Özeti (Türkçe) */}
                <div className="p-3 rounded border border-[#c6a15b]/40 bg-[#120f0b] space-y-2">
                  <div className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider">
                    Seçilen Geçmişten Kazanılan Nitelik &amp; Beceri Bonusları
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(computedStoryBonuses.attrBonuses) as Array<[AttributeId, number]>).map(
                      ([attrId, bonus]) => (
                        <span
                          key={attrId}
                          className="px-2 py-0.5 rounded bg-[#282015] border border-[#c6a15b]/40 text-[10px] font-bold text-[#fde68a]"
                        >
                          +{bonus} {ATTRIBUTE_LABELS[attrId]?.name ?? attrId}
                        </span>
                      ),
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-stone-800">
                    {(Object.entries(computedStoryBonuses.skillBonuses) as Array<[BannerlordSkillId, number]>).map(
                      ([skId, bonus]) => (
                        <span
                          key={skId}
                          className="px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10px] text-[#86efac]"
                        >
                          +{bonus} {SKILL_LABELS[skId] ?? skId} (+1 Odak)
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
            
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
                      <span>Erkek Savaşçı</span>
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
                      <span>Kadın Savaşçı</span>
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
                      { id: 'lord-derthert', title: 'Kral Derthert', fac: 'vlandia', emb: '🦁' },
                      { id: 'lord-rhagaea', title: 'İmparatoriçe Rhagaea', fac: 'empire', emb: '👑' },
                      { id: 'lord-caladog', title: 'Yüksek Kral Caladog', fac: 'battania', emb: '🦌' },
                      { id: 'lord-raganvad', title: 'Büyük Prens Raganvad', fac: 'sturgia', emb: '⚔' },
                      { id: 'lord-monchug', title: 'Monchug Han', fac: 'khuzait', emb: '🐎' },
                      { id: 'lord-unqid', title: 'Sultan Unqid', fac: 'aserai', emb: '☀' },
                      { id: 'lord-garios', title: 'General Garios', fac: 'empire', emb: '🦅' },
                      { id: 'lord-lucon', title: 'Arkon Lucon', fac: 'empire', emb: '👑' },
                      { id: 'lord-kargi', title: 'Reis Kargı', fac: 'bandits', emb: '⚔' },
                    ].map((lord) => (
                      <button
                        key={lord.id}
                        type="button"
                        onClick={() => handleLoadLord(lord.id)}
                        className="p-2 rounded border border-stone-700 bg-stone-900/60 hover:border-[#c6a15b] hover:bg-[#c6a15b]/10 text-left transition flex items-center gap-2 group"
                      >
                        <span className="text-[#c6a15b] shrink-0">
                          {HERALDIC_SVG_EMBLEMS[lord.emb] ?? HERALDIC_SVG_EMBLEMS['🦅']}
                        </span>
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

                {/* Culture Presets with 6 Bannerlord Culture Bonuses */}
                <div className="space-y-2 pt-2 border-t border-stone-800" data-testid="culture-bonus-cards">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    6 Kalradya Kültürü ve Başlangıç Bonusları
                  </span>
                  <div className="space-y-2">
                    {CULTURE_BONUS_CARDS.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        data-testid={`culture-card-${card.id}`}
                        onClick={() => handleApplyCulture(card.id)}
                        className={`w-full p-2.5 rounded border text-left transition flex flex-col gap-1 ${
                          dna.culture === card.id
                            ? 'border-[#c6a15b] bg-[#c6a15b]/20 shadow'
                            : 'border-stone-800 bg-stone-900/50 hover:border-stone-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#fef3c7]">
                            {card.title} — <span className="text-[#fbbf24]">{card.bonusTitle}</span>
                          </span>
                          <span
                            className="w-3 h-3 rounded-full border border-white/40"
                            style={{ backgroundColor: FACTION_INFO[card.id]?.color }}
                          />
                        </div>
                        <p className="text-[11px] text-[#86efac] leading-snug">{card.bonusDesc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- TAB 6: KLAN, SANCAK & ZORLUK ---------------- */}
            {activeTab === 'clan' && (
              <div className="space-y-5 animate-fadeIn" data-testid="creator-clan-difficulty-panel">
                {/* Clan Name & Banner Designer */}
                <div className="space-y-3 border-b border-stone-800 pb-4">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    Klan Adı & Sancak Arması
                  </span>
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        backgroundColor: bannerColor,
                        clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)',
                      }}
                      className="w-12 h-14 border-2 border-[#fcd34d] flex items-center justify-center text-[#fef3c7] shadow-lg shrink-0"
                    >
                      {HERALDIC_SVG_EMBLEMS[bannerEmblem] ?? HERALDIC_SVG_EMBLEMS['🦅']}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[11px] text-stone-400 block">Klan / Hanedan Adı</label>
                      <input
                        type="text"
                        value={clanName}
                        onChange={(e) => setClanName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-stone-900 border border-[#c6a15b]/50 text-xs font-bold text-[#fef3c7] outline-none focus:border-[#fbbf24]"
                        placeholder="Demirhan Hanedanı"
                      />
                    </div>
                  </div>

                  {/* Banner Color Swatches */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-stone-400 block">Sancak Kumaş Rengi</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {['#d97706', '#991b1b', '#1e3a8a', '#166534', '#581c87', '#0f766e', '#1c1917'].map(
                        (col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setBannerColor(col)}
                            style={{ backgroundColor: col }}
                            className={`w-6 h-6 rounded-full border-2 transition ${
                              bannerColor === col ? 'border-[#fef08a] scale-110' : 'border-stone-700'
                            }`}
                          />
                        ),
                      )}
                    </div>
                  </div>

                  {/* Banner Emblem Selector (SVG) */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-stone-400 block">Hanedan Arması (SVG)</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['🦅', '🦁', '🦌', '⚔', '👑', '🐎', '☀'].map((emb) => (
                        <button
                          key={emb}
                          type="button"
                          onClick={() => setBannerEmblem(emb)}
                          className={`w-8 h-8 rounded border flex items-center justify-center text-[#fef3c7] ${
                            bannerEmblem === emb
                              ? 'border-[#c6a15b] bg-[#c6a15b]/25'
                              : 'border-stone-800 bg-stone-900/60'
                          }`}
                        >
                          {HERALDIC_SVG_EMBLEMS[emb]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 5 Bannerlord Campaign Difficulty Settings */}
                <div className="space-y-3">
                  <span className="text-xs font-serif font-bold text-[#c6a15b] uppercase tracking-wider block">
                    5 Bannerlord Sefer Zorluk Ayarı
                  </span>
                  {(
                    [
                      {
                        key: 'playerDamageTaken' as const,
                        label: 'Oyuncunun Aldığı Hasar',
                        labels: { VERY_EASY: 'Çok Kolay (%25)', EASY: 'Kolay (%50)', REALISTIC: 'Gerçekçi (%100)' },
                      },
                      {
                        key: 'friendlyTroopDamage' as const,
                        label: 'Dost Birliklerin Aldığı Hasar',
                        labels: { VERY_EASY: 'Çok Kolay (%50)', EASY: 'Kolay (%75)', REALISTIC: 'Gerçekçi (%100)' },
                      },
                      {
                        key: 'recruitmentDifficulty' as const,
                        label: 'Asker Toplama Zorluğu',
                        labels: { VERY_EASY: 'Çok Kolay (+2 Slot)', EASY: 'Kolay (+1 Slot)', REALISTIC: 'Gerçekçi (Normal)' },
                      },
                      {
                        key: 'mapMovementSpeed' as const,
                        label: 'Harita Hareket Hızı',
                        labels: { VERY_EASY: 'Çok Kolay (+%10)', EASY: 'Kolay (+%5)', REALISTIC: 'Gerçekçi (Normal)' },
                      },
                      {
                        key: 'persuasionSuccess' as const,
                        label: 'İkna Başarısı',
                        labels: { VERY_EASY: 'Çok Kolay (+%10)', EASY: 'Kolay (+%5)', REALISTIC: 'Gerçekçi (Normal)' },
                      },
                    ] as const
                  ).map((row) => (
                    <div key={row.key} className="p-2 rounded bg-stone-900/70 border border-stone-800 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-stone-200">{row.label}</span>
                        <span className="text-[11px] font-mono text-[#fbbf24]">
                          {row.labels[difficulty[row.key]]}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['VERY_EASY', 'EASY', 'REALISTIC'] as DifficultyLevel[]).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() =>
                              setDifficulty((prev) => ({
                                ...prev,
                                [row.key]: lvl,
                              }))
                            }
                            className={`py-1 px-1.5 rounded text-[10px] font-bold transition ${
                              difficulty[row.key] === lvl
                                ? 'bg-[#b45309] text-white border border-[#fbbf24]/60'
                                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            {lvl === 'VERY_EASY' ? 'Çok Kolay' : lvl === 'EASY' ? 'Kolay' : 'Gerçekçi'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Ironman Toggle */}
                  <label className="flex items-center justify-between p-2.5 rounded bg-stone-900/80 border border-[#c6a15b]/30 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-[#fde68a] block">Demir Adam (Ironman) Modu</span>
                      <span className="text-[10px] text-stone-400">
                        Tek kayıt dosyası ile geri dönüşsüz kararlar
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={ironmanMode}
                      onChange={(e) => setIronmanMode(e.target.checked)}
                      className="w-4 h-4 accent-[#c6a15b]"
                    />
                  </label>
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
                <span className="hidden sm:inline">Rastgele</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Sıfırla"
                className="px-3 py-2 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 text-xs transition"
              >
                Sıfırla
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
                data-testid="creator-confirm-btn"
                onClick={handleConfirm}
                className="px-4 py-2 rounded bg-[#c6a15b] hover:bg-[#d4af37] text-[#14100c] font-serif font-bold text-xs md:text-sm tracking-wide shadow-lg hover:shadow-[#c6a15b]/20 transition flex items-center gap-1.5"
              >
                <span>{confirmLabel || 'Karakteri Onayla'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
