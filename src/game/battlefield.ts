/**
 * battlefield.ts — 10.2/B1: karşılaşma noktasından savaş arazisi profili.
 *
 * Bannerlord'un Battle Terrain System davranışı (TaleWorlds e1.7.0 duyurusu):
 * dünya haritası bölgelere ayrılıdır, her bölgenin sahnesi dünya arazisini
 * modeller; savaş başlayınca partilerin dünya haritasındaki **konum ve
 * yönleri** sahnedeki doğuş noktalarını belirler. Köprü/nehir geçidinde
 * savaşılırsa köprü sahnesi gelir, köye yakınsa köy sahnesi gelir. Sahne
 * kırmızı "yumuşak sınır" (soft border) ile çevrilidir.
 *
 * Bu modül aynı davranışı prosedürel üretir: sefer haritasındaki karşılaşma
 * noktası çevresinden `mapGen` sorgularıyla (yükseklik, nehir ağı, yol,
 * orman maskesi, biyom) ~460×460 metrelik bir arazi yaması çıkarır. Aynı
 * bölge her seferinde aynı sahneyi verir (tohum merkezden türer). Doğuş
 * kenarları, oyuncunun düşmana **yaklaşma vektöründen** türetilir: düşman,
 * dünya haritasında hangi yöndeyse sahnede de o kenardadır.
 *
 * Saf mantık modülüdür (three.js içermez); sahne kurulumu
 * `battleTerrain.ts`, doğrulama `probe-battlefield.ts` içindedir.
 */
import {
  CONTINENTAL_BRIDGES,
  WATER_LEVEL,
  distanceToNearestRoad,
  distanceToRiverNetwork,
  getBiomeAt,
  getForestMaskAt,
  getTerrainSlopeAndColorAt,
  groundHeightAt,
  type BiomeType,
} from './mapGen.ts';

/** Savaş alanı yarı genişliği (metre). Alan 460×460. */
export const BATTLEFIELD_HALF_EXTENT = 230;
/** Yükseklik ızgarası çözünürlüğü (köşe sayısı, kenar başına). */
export const BATTLEFIELD_GRID_N = 65;
/** Dünya haritasından örneklenen yamanın yarı genişliği (dünya birimi). */
const WORLD_SAMPLE_HALF = 55;
/** Sefer yüksekliklerinin sahneye taşınırken abartı katsayısı. */
const HEIGHT_EXAGGERATION = 2.4;

export interface BattlefieldSpawn {
  x: number;
  z: number;
  /** Aktör `facing` açısı (atan2(dx, dz) uzlaşımı: 0 → +Z, π → −Z). */
  facing: number;
}

export interface BattlefieldDeployZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BattlefieldScatterItem {
  x: number;
  z: number;
  scale: number;
  rot: number;
}

export interface BattlefieldHouse {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  h: number;
}

export interface BattlefieldProfile {
  halfExtent: number;
  gridN: number;
  /** Köşe yükseklikleri (sahne Y), satır-major [z][x]. */
  heights: Float32Array;
  /** Köşe renkleri (0..1 RGB üçlüleri), heights ile aynı sıra. */
  colors: Float32Array;
  /** Su düzlemi Y'si; su yoksa null. */
  waterY: number | null;
  biome: BiomeType;
  hasRiver: boolean;
  /** Köprü varsa sahne koordinatında merkezi, açısı (radyan, güverte yönü) ve uzunluğu. */
  bridge: { x: number; z: number; angle: number; length: number; name: string } | null;
  roadCrosses: boolean;
  village: { name: string; houses: BattlefieldHouse[] } | null;
  trees: BattlefieldScatterItem[];
  rocks: BattlefieldScatterItem[];
  allySpawn: BattlefieldSpawn;
  enemySpawn: BattlefieldSpawn;
  allyDeploy: BattlefieldDeployZone;
  enemyDeploy: BattlefieldDeployZone;
  seed: number;
  centerWorld: { x: number; z: number };
  /** Sahne→dünya dönüşümü için saklanan eksenler. */
  axes: { rightX: number; rightZ: number; fwdX: number; fwdZ: number; scale: number };
}

export interface BattlefieldInput {
  /** Karşılaşma noktası (dünya koordinatı; genelde oyuncu partisi). */
  worldX: number;
  worldZ: number;
  /** Oyuncudan düşmana yaklaşma vektörü (normalize edilmemiş olabilir). */
  dirX: number;
  dirZ: number;
  /** Köy sahnesi tespiti için yerleşimler (yalnız gerekli alanlar). */
  settlements?: ReadonlyArray<{ name: string; type: string; x: number; z: number }>;
}

/** Küçük deterministik RNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(x: number, z: number): number {
  let h = 2166136261;
  h = Math.imul(h ^ (x * 374761393), 668265263);
  h = Math.imul(h ^ (z * 2246822519), 3266489917);
  return (h ^ (h >>> 13)) >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/**
 * Karşılaşma noktasından arazi profili üretir. Sahne koordinatında müttefik
 * +Z kenarında, düşman −Z kenarında doğar; dünya örneklemesi yaklaşma
 * vektörüyle döndürülür, böylece düşman kenarı dünya haritasında düşmanın
 * olduğu tarafa bakar.
 */
export function buildBattlefieldProfile(input: BattlefieldInput): BattlefieldProfile {
  const half = BATTLEFIELD_HALF_EXTENT;
  const n = BATTLEFIELD_GRID_N;
  const scale = WORLD_SAMPLE_HALF / half;

  let fwdX = input.dirX;
  let fwdZ = input.dirZ;
  const len = Math.hypot(fwdX, fwdZ);
  if (len < 1e-6) {
    fwdX = 0;
    fwdZ = -1;
  } else {
    fwdX /= len;
    fwdZ /= len;
  }
  // Sahne +X'i (sağ) dünya üzerinde ileri yönün saat yönü dikidir.
  const rightX = fwdZ;
  const rightZ = -fwdX;

  const toWorld = (bx: number, bz: number) => ({
    x: input.worldX + (rightX * bx - fwdX * bz) * scale,
    z: input.worldZ + (rightZ * bx - fwdZ * bz) * scale,
  });

  // 1) Ham yükseklikler + nehir/yol bilgisi (dünya koordinatında örnekle).
  const raw = new Float32Array(n * n);
  const riverDist = new Float32Array(n * n);
  const riverWidth = new Float32Array(n * n);
  let rawMin = Infinity;
  let hasRiver = false;
  let roadCrosses = false;
  for (let iz = 0; iz < n; iz++) {
    const bz = -half + (iz / (n - 1)) * half * 2;
    for (let ix = 0; ix < n; ix++) {
      const bx = -half + (ix / (n - 1)) * half * 2;
      const w = toWorld(bx, bz);
      const idx = iz * n + ix;
      const h = groundHeightAt(w.x, w.z);
      raw[idx] = h;
      if (h < rawMin) rawMin = h;
      const river = distanceToRiverNetwork(w.x, w.z);
      riverDist[idx] = river.dist;
      riverWidth[idx] = river.width;
      if (river.dist < river.width * 0.9) hasRiver = true;
    }
  }
  if (distanceToNearestRoad(input.worldX, input.worldZ) < WORLD_SAMPLE_HALF * 0.9) {
    // Yol yamanın içinden geçiyor mu: merkez hattı boyunca kabaca yokla.
    outer: for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const w = toWorld(i * 45, j * 45);
        if (distanceToNearestRoad(w.x, w.z) < 2.2) {
          roadCrosses = true;
          break outer;
        }
      }
    }
  }

  // 2) Sahne yüksekliklerine çevir, nehir yatağını oy, iki geçiş yumuşat.
  const heights = new Float32Array(n * n);
  const waterRawY = (WATER_LEVEL - rawMin) * HEIGHT_EXAGGERATION;
  for (let i = 0; i < n * n; i++) {
    let h = (raw[i] - rawMin) * HEIGHT_EXAGGERATION;
    const rd = riverDist[i];
    const rw = Math.max(0.8, riverWidth[i]);
    if (rd < rw * 2.2) {
      const t = smoothstep(rd / (rw * 2.2));
      const channelY = waterRawY - 0.7;
      h = channelY + (h - channelY) * t;
    }
    heights[i] = h;
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(heights);
    for (let iz = 1; iz < n - 1; iz++) {
      for (let ix = 1; ix < n - 1; ix++) {
        const idx = iz * n + ix;
        heights[idx] =
          (src[idx] * 4 + src[idx - 1] + src[idx + 1] + src[idx - n] + src[idx + n]) / 8;
      }
    }
  }

  // Su: nehir geçiyorsa ya da ham yükseklik su seviyesinin altına iniyorsa.
  const hasWater = hasRiver || rawMin < WATER_LEVEL + 0.02;
  const waterY = hasWater ? waterRawY + 0.12 : null;

  // 3) Köşe renkleri (dünya arazi renklendirmesiyle aynı kaynak) + iki ölçekli
  // deterministik detay gürültüsü: düz renk zemini "plastik" gösterir; çim
  // benekleri ve toprak lekeleri yakın çekimde doku hissi verir (Bannerlord
  // sahnelerindeki yer dokusu katmanlamasının karşılığı — değerler çıkarım).
  // Zemin tonu: koyu yeşil "çorba" yerine açık, kırmızımsı kuru kum/bozkır
  // tonu (kullanıcı geri bildirimi). Dünya rengi taban alınır ama kuru tona
  // çekilip hafifçe açılır; kar biyomu olduğu gibi kalır.
  const groundBiome = getBiomeAt(input.worldX, input.worldZ);
  const dryMix =
    groundBiome === 'NORTH_SNOW_PEAKS' ? 0 : groundBiome === 'SOUTH_DESERT' ? 0.5 : 0.34;
  const colors = new Float32Array(n * n * 3);
  const detailHash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  for (let iz = 0; iz < n; iz++) {
    const bz = -half + (iz / (n - 1)) * half * 2;
    for (let ix = 0; ix < n; ix++) {
      const bx = -half + (ix / (n - 1)) * half * 2;
      const w = toWorld(bx, bz);
      const c = getTerrainSlopeAndColorAt(w.x, w.z);
      const idx = (iz * n + ix) * 3;
      const fine = detailHash(Math.round(w.x * 8), Math.round(w.z * 8)); // çim tanesi
      const coarse = detailHash(Math.round(w.x * 0.9), Math.round(w.z * 0.9)); // leke
      const shade = 0.86 + fine * 0.22 + (coarse - 0.5) * 0.18;
      let r = (c.r / 255) * shade;
      let g = (c.g / 255) * (0.9 + coarse * 0.1 + fine * 0.08);
      let b = (c.b / 255) * shade;
      if (dryMix > 0) {
        r += (0.67 - r) * dryMix;
        g += (0.52 - g) * dryMix;
        b += (0.33 - b) * dryMix;
        const lift = 0.09;
        r += (1 - r) * lift;
        g += (1 - g) * lift;
        b += (1 - b) * lift;
      }
      colors[idx] = Math.min(1, r);
      colors[idx + 1] = Math.min(1, g);
      colors[idx + 2] = Math.min(1, b);
    }
  }

  const biome = getBiomeAt(input.worldX, input.worldZ);
  const seed = hashSeed(Math.round(input.worldX * 2), Math.round(input.worldZ * 2));
  const rng = mulberry32(seed);

  // 4) Köprü: çözülmüş köprülerden yama içine düşen var mı?
  let bridge: BattlefieldProfile['bridge'] = null;
  for (const b of CONTINENTAL_BRIDGES) {
    const dx = b.x - input.worldX;
    const dz = b.z - input.worldZ;
    if (Math.hypot(dx, dz) > WORLD_SAMPLE_HALF) continue;
    // Dünya→sahne: bx = offset·right / s, bz = −offset·fwd / s
    const bx = (dx * rightX + dz * rightZ) / scale;
    const bz = -(dx * fwdX + dz * fwdZ) / scale;
    if (Math.abs(bx) > half - 15 || Math.abs(bz) > half - 15) continue;
    // Güverte yönü: köprünün dünya dönüşünden sahne açısına.
    const deckWorldX = Math.sin(b.rotationY);
    const deckWorldZ = Math.cos(b.rotationY);
    const deckBx = deckWorldX * rightX + deckWorldZ * rightZ;
    const deckBz = -(deckWorldX * fwdX + deckWorldZ * fwdZ);
    bridge = {
      x: bx,
      z: bz,
      angle: Math.atan2(deckBx, deckBz),
      length: Math.max(14, b.length / scale),
      name: b.name,
    };
    break;
  }

  // 5) Köy: en yakın köy yama menzilindeyse evler o yöne kümelenir.
  let village: BattlefieldProfile['village'] = null;
  let nearestVillage: { name: string; x: number; z: number; d: number } | null = null;
  for (const s of input.settlements ?? []) {
    if (s.type !== 'VILLAGE') continue;
    const d = Math.hypot(s.x - input.worldX, s.z - input.worldZ);
    if (!nearestVillage || d < nearestVillage.d) nearestVillage = { name: s.name, x: s.x, z: s.z, d };
  }
  if (nearestVillage && nearestVillage.d < WORLD_SAMPLE_HALF * 1.15) {
    const dx = nearestVillage.x - input.worldX;
    const dz = nearestVillage.z - input.worldZ;
    const cx = clamp((dx * rightX + dz * rightZ) / scale, -150, 150);
    const cz = clamp(-(dx * fwdX + dz * fwdZ) / scale, -150, 150);
    const houses: BattlefieldHouse[] = [];
    const houseCount = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < houseCount; i++) {
      houses.push({
        x: cx + (rng() - 0.5) * 70,
        z: cz + (rng() - 0.5) * 55,
        rot: rng() * Math.PI,
        w: 5 + rng() * 3,
        d: 4 + rng() * 2.5,
        h: 3 + rng() * 1.6,
      });
    }
    village = { name: nearestVillage.name, houses };
  }

  // 6) Doğuş kenarları ve konuşlanma bölgeleri.
  const allySpawn: BattlefieldSpawn = { x: 0, z: half - 48, facing: Math.PI };
  const enemySpawn: BattlefieldSpawn = { x: 0, z: -half + 48, facing: 0 };
  const allyDeploy: BattlefieldDeployZone = { minX: -125, maxX: 125, minZ: half - 115, maxZ: half - 12 };
  const enemyDeploy: BattlefieldDeployZone = { minX: -125, maxX: 125, minZ: -half + 12, maxZ: -half + 115 };

  const inDeploy = (x: number, z: number, zone: BattlefieldDeployZone, pad: number) =>
    x > zone.minX - pad && x < zone.maxX + pad && z > zone.minZ - pad && z < zone.maxZ + pad;

  // 7) Serpme: ağaç orman maskesini, kaya eğimi izler; nehir/yol/doğuş şeritleri boş kalır.
  const trees: BattlefieldScatterItem[] = [];
  const rocks: BattlefieldScatterItem[] = [];
  const heightAtScene = (x: number, z: number) => sampleHeights(heights, n, half, x, z);
  const attempts = 900;
  for (let i = 0; i < attempts; i++) {
    const bx = (rng() * 2 - 1) * (half - 12);
    const bz = (rng() * 2 - 1) * (half - 12);
    if (inDeploy(bx, bz, allyDeploy, 14) || inDeploy(bx, bz, enemyDeploy, 14)) continue;
    const w = toWorld(bx, bz);
    const river = distanceToRiverNetwork(w.x, w.z);
    if (river.dist < river.width * 1.7) continue;
    if (roadCrosses && distanceToNearestRoad(w.x, w.z) < 2.6) continue;
    if (bridge && Math.hypot(bx - bridge.x, bz - bridge.z) < bridge.length * 0.75) continue;
    const y = heightAtScene(bx, bz);
    if (waterY !== null && y < waterY + 0.25) continue;
    const slope =
      Math.abs(heightAtScene(bx + 3, bz) - y) + Math.abs(heightAtScene(bx, bz + 3) - y);
    const forest = getForestMaskAt(w.x, w.z);
    // Çölde ağaç seyrek ve cılızdır; orman maskesi yüksekse yoğun.
    const treeChance = biome === 'SOUTH_DESERT' ? forest * 0.16 : forest * 0.62;
    if (slope < 1.4 && rng() < treeChance && trees.length < 260) {
      trees.push({ x: bx, z: bz, scale: 0.8 + rng() * 0.7, rot: rng() * Math.PI * 2 });
      continue;
    }
    if (rng() < 0.05 + slope * 0.05 && rocks.length < 110) {
      rocks.push({ x: bx, z: bz, scale: 0.6 + rng() * 1.5, rot: rng() * Math.PI * 2 });
    }
  }

  return {
    halfExtent: half,
    gridN: n,
    heights,
    colors,
    waterY,
    biome,
    hasRiver,
    bridge,
    roadCrosses,
    village,
    trees,
    rocks,
    allySpawn,
    enemySpawn,
    allyDeploy,
    enemyDeploy,
    seed,
    centerWorld: { x: input.worldX, z: input.worldZ },
    axes: { rightX, rightZ, fwdX, fwdZ, scale },
  };
}

function sampleHeights(
  heights: Float32Array,
  n: number,
  half: number,
  x: number,
  z: number,
): number {
  const fx = clamp(((x + half) / (half * 2)) * (n - 1), 0, n - 1.001);
  const fz = clamp(((z + half) / (half * 2)) * (n - 1), 0, n - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i00 = iz * n + ix;
  const h00 = heights[i00];
  const h10 = heights[i00 + 1];
  const h01 = heights[i00 + n];
  const h11 = heights[i00 + n + 1];
  return (
    h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz
  );
}

/** Sahne noktasının arazi yüksekliği (çift-doğrusal). */
export function sampleBattleHeight(profile: BattlefieldProfile, x: number, z: number): number {
  return sampleHeights(profile.heights, profile.gridN, profile.halfExtent, x, z);
}

/**
 * Nokta köprü güvertesi üzerindeyse güverte Y'sini, değilse null verir.
 * Güverte iki kıyı yüksekliğinin büyüğü + 0.55'tir (battleTerrain ile aynı).
 */
export function bridgeDeckYAt(profile: BattlefieldProfile, x: number, z: number): number | null {
  const b = profile.bridge;
  if (!b) return null;
  const dirX = Math.sin(b.angle);
  const dirZ = Math.cos(b.angle);
  const relX = x - b.x;
  const relZ = z - b.z;
  const along = relX * dirX + relZ * dirZ;
  const across = relX * dirZ - relZ * dirX;
  if (Math.abs(along) > b.length / 2 || Math.abs(across) > 2.1) return null;
  const bank1 = sampleBattleHeight(profile, b.x - dirX * b.length * 0.5, b.z - dirZ * b.length * 0.5);
  const bank2 = sampleBattleHeight(profile, b.x + dirX * b.length * 0.5, b.z + dirZ * b.length * 0.5);
  return Math.max(bank1, bank2) + 0.55;
}

/** Aktörün duracağı zemin: arazi ile (varsa) köprü güvertesinin yükseği. */
export function battleGroundY(profile: BattlefieldProfile, x: number, z: number): number {
  const terrain = sampleBattleHeight(profile, x, z);
  const deck = bridgeDeckYAt(profile, x, z);
  return deck !== null ? Math.max(terrain, deck) : terrain;
}

/** Sahne koordinatını dünya koordinatına çevirir (doğrulama/ayıklama için). */
export function battleToWorld(
  profile: BattlefieldProfile,
  x: number,
  z: number,
): { x: number; z: number } {
  const { rightX, rightZ, fwdX, fwdZ, scale } = profile.axes;
  return {
    x: profile.centerWorld.x + (rightX * x - fwdX * z) * scale,
    z: profile.centerWorld.z + (rightZ * x - fwdZ * z) * scale,
  };
}

/** Nokta kırmızı yumuşak sınırın dışında mı? */
export function isOutsideBattlefield(profile: BattlefieldProfile, x: number, z: number): boolean {
  return Math.abs(x) > profile.halfExtent || Math.abs(z) > profile.halfExtent;
}

/** Noktayı alan içine kırpar (B1: AI aktörleri ve oyuncu sınırı aşamaz). */
export function clampToBattlefield(
  profile: BattlefieldProfile,
  x: number,
  z: number,
  margin = 2,
): { x: number; z: number } {
  const lim = profile.halfExtent - margin;
  return { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) };
}
