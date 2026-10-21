/**
 * portraitRenderer.ts — "Baked" kahraman portreleri (Faz 1c)
 *
 * Kullanıcı kararı: portreler **tek kare** olarak üretilip önbelleğe alınacak
 * (canlı 3B değil). Böylece 40 kahramanlık listede 40 WebGL bağlamı açılmaz.
 *
 * Tasarım:
 *  - **Tek** offscreen `WebGLRenderer` (256×320) yeniden kullanılır.
 *  - Her portre sıraya girer; kare başına **1** portre üretilir (ana iş parçacığını kilitlemez).
 *  - Sonuç `data:image/png` olarak LRU önbelleğe yazılır (64 kayıt).
 *  - WebGL yoksa (Node/test/SSR) sessizce `null` döner; arayüz baş harf rozetine düşer.
 */
import * as THREE from 'three';
import {
  createCharacterRig,
  type ArmorTier,
  type CharacterRig,
} from './characterRig';
import { applyMorphDNAToRig, getLordDNA } from './characterMorph';
import type { HeroRecord, Occupation } from './heroes';

export const PORTRAIT_W = 256;
export const PORTRAIT_H = 320;
const MAX_CACHE = 64;

let renderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const queue: { hero: HeroRecord; resolve: (url: string | null) => void }[] = [];
let pumping = false;

/* ─────────────────────────── yardımcılar ─────────────────────────── */

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const SKIN_TONES = ['#f2d3b3', '#e8be99', '#d9a273', '#c68642', '#a86b3c', '#8d5524'];
const HAIR_COLORS = ['#2b1b10', '#3d2a17', '#5a3a1b', '#8a5a2b', '#b08d57', '#1a1a1a', '#6b3f22'];

const ARMOR_BY_OCCUPATION: Record<Occupation, ArmorTier> = {
  RULER: 'PLATE',
  LORD: 'CHAINMAIL',
  LADY: 'LEATHER',
  CLAN_LEADER: 'CHAINMAIL',
  WANDERER: 'LEATHER',
  NOTABLE: 'LEATHER',
  MERCHANT: 'CIVILIAN',
  GANG_LEADER: 'LEATHER',
  HEADMAN: 'CIVILIAN',
};

export function portraitCacheKey(hero: Pick<HeroRecord, 'id' | 'bannerColor' | 'occupation'>): string {
  return `${hero.id}:${hero.bannerColor}:${hero.occupation}`;
}

function canRender(): boolean {
  return (
    !rendererFailed &&
    typeof document !== 'undefined' &&
    typeof window !== 'undefined'
  );
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  if (!canRender()) return null;
  try {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(1);
    r.setSize(PORTRAIT_W, PORTRAIT_H, false);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    renderer = r;
    return r;
  } catch (error) {
    console.warn('[portrait] WebGL başlatılamadı, baş harf rozetine düşülüyor:', error);
    rendererFailed = true;
    return null;
  }
}

/** Rig'i sahneden çıkarıp GPU kaynaklarını bırakır. */
export function disposeRig(rig: CharacterRig) {
  rig.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
}

/* ─────────────────────────── üretim ─────────────────────────── */

/**
 * Portre için karakter rig'i üretir (aynı görünüm hem WebGL hem CPU render'da kullanılır).
 * Çağıran taraf işi bitince `disposeRig()` çağırmalıdır.
 */
export function createHeroPortraitRig(hero: HeroRecord): CharacterRig {
  const seed = hash(hero.id);
  const rig = createCharacterRig({
    skinTone: SKIN_TONES[seed % SKIN_TONES.length],
    hairColor: HAIR_COLORS[(seed >> 3) % HAIR_COLORS.length],
    beardColor: HAIR_COLORS[(seed >> 3) % HAIR_COLORS.length],
    factionColor: hero.bannerColor,
    hasBeard: hero.occupation !== 'LADY' && seed % 3 !== 0,
    weaponType: 'UNARMED',
    shieldType: 'NONE',
    helmetType: 'NONE',
    armorTier: ARMOR_BY_OCCUPATION[hero.occupation],
    factionId: hero.culture,
  });
  applyMorphDNAToRig(rig, getLordDNA(hero.id, hero.culture));
  rig.root.updateMatrixWorld(true);
  return rig;
}

/**
 * Baş + omuz kadrajı (Bannerlord ansiklopedi portresi gibi).
 *
 * Kahramanların kafa kutusu (DNA + saç + sakal) 2.5 kata kadar değişebildiği için
 * kadraj **sayısal olarak çözülür**:
 *  - Ölçek, **kafatası** kutusuna göre hesaplanır → 40 portrede yüzler aynı boyutta,
 *  - saç/sakal kadrajı taşarsa kamera biraz uzaklaşır,
 *  - tepe noktası hedeflenen hizaya gelene kadar bakış noktası kaydırılır.
 * 8 iterasyonda yakınsar; her kahraman için deterministik ve taşmasız.
 */
export function createPortraitCamera(rig: CharacterRig): THREE.PerspectiveCamera {
  const groupBox = new THREE.Box3().setFromObject(rig.head);
  const coreMesh = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as
    | THREE.Mesh
    | undefined;
  const coreBox = coreMesh ? new THREE.Box3().setFromObject(coreMesh) : groupBox.clone();
  const center = coreBox.getCenter(new THREE.Vector3());

  const corners = (box: THREE.Box3) => {
    const out: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
    return out;
  };
  const coreCorners = corners(coreBox);
  const groupCorners = corners(groupBox);

  // Omuz hattı: portre "baş + omuz" olsun (Bannerlord gibi). Çene ile omuz
  // arasındaki mesafe boydan bağımsız sabitlendiği için kadraj da tutarlı.
  const shoulderY = new THREE.Vector3();
  rig.leftShoulder.getWorldPosition(shoulderY);

  const angle = 0.35; // ≈20° → yüzün 3/4'ü görünür
  let dist = 1.0;
  let targetY = center.y - 0.05;

  const camera = new THREE.PerspectiveCamera(30, PORTRAIT_W / PORTRAIT_H, 0.05, 20);
  const place = (d: number, ty: number) => {
    camera.position.set(
      center.x + Math.sin(angle) * d,
      ty + 0.02 * d,
      center.z + Math.cos(angle) * d,
    );
    camera.lookAt(center.x, ty, center.z);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
  };

  const TOP_NDC = 0.80; // saçın tepesinde nefes payı, altta omuzlar

  for (let i = 0; i < 8; i++) {
    place(dist, targetY);
    const project = (pts: THREE.Vector3[]) => pts.map((p) => p.clone().project(camera));
    const c = project(coreCorners);
    const g = project(groupCorners);
    const coreH = Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y));
    const coreW = Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x));
    const grpTop = Math.max(...g.map((p) => p.y));
    // Alt sınır: çene (kafatası) — sakal sarkması kadrajı kaydırmasın.
    const grpBottom = Math.min(...c.map((p) => p.y));
    const grpW = Math.max(...g.map((p) => p.x)) - Math.min(...g.map((p) => p.x));
    const shoulderNdc = shoulderY.clone().project(camera).y;

    // Ölçek: kadraj hem saç/sakalı hem omuz hattını içine alsın.
    const shoulderSpan = Math.max(grpTop - Math.min(shoulderNdc - 0.06, grpBottom), 0.1);
    const overflow = Math.max(coreH / 1.0, coreW / 1.0, grpW / 1.7, shoulderSpan / 1.92, 1);
    dist *= overflow;

    // Hizalama: saçın tepesi TOP_NDC'de.
    const viewHalf = dist * Math.tan((camera.fov * Math.PI) / 360);
    targetY += (grpTop - TOP_NDC) * viewHalf;

    if (Math.abs(overflow - 1) < 0.01 && Math.abs(grpTop - TOP_NDC) < 0.01) break;
  }

  place(dist, targetY);
  return camera;
}

function renderPortrait(hero: HeroRecord): string | null {
  const r = getRenderer();
  if (!r) return null;

  let rig: CharacterRig | null = null;
  try {
    rig = createHeroPortraitRig(hero);

    const scene = new THREE.Scene();
    scene.add(rig.root);

    const key = new THREE.DirectionalLight(0xfff2d8, 2.1);
    key.position.set(0.9, 2.1, 2.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb4d8, 0.75);
    fill.position.set(-1.4, 0.9, 1.2);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const camera = createPortraitCamera(rig);

    r.render(scene, camera);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(rig.root);
    return url;
  } catch (error) {
    console.warn('[portrait] portre üretilemedi:', hero.id, error);
    return null;
  } finally {
    if (rig) disposeRig(rig);
  }
}

function store(key: string, url: string) {
  cache.set(key, url);
  // FIFO tahliye (en eski girer, en yeni kalır)
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    const key = portraitCacheKey(job.hero);
    const existing = cache.get(key);
    if (existing) {
      job.resolve(existing);
    } else {
      const url = renderPortrait(job.hero);
      if (url) store(key, url);
      job.resolve(url);
    }
    if (queue.length > 0) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
      else setTimeout(step, 16);
    } else {
      pumping = false;
    }
  };
  step();
}

/** Önbellekte varsa hemen döner. */
export function getCachedPortrait(hero: HeroRecord): string | null {
  return cache.get(portraitCacheKey(hero)) ?? null;
}

/** Portre ister; yoksa kuyruğa girer ve hazır olunca çözülür. */
export function requestPortrait(hero: HeroRecord): Promise<string | null> {
  const key = portraitCacheKey(hero);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  if (!canRender()) return Promise.resolve(null);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const promise = new Promise<string | null>((resolve) => {
    queue.push({ hero, resolve });
    pump();
  }).finally(() => {
    pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}

/** Testler için: önbelleği ve kuyruğu temizler. */
export function resetPortraitCache(): void {
  cache.clear();
  queue.length = 0;
  pending.clear();
}
