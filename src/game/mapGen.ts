// Authentic Calradia Continental Topographic Heightmap (2400x1800 Extended World Skirt, Zero Void Borders)
// Matching the official Mount & Blade II: Bannerlord Continental Map (Images 1, 2, 3, 4):
// - West & Southwest: Great Western Ocean + Bay of Ostican + Gulf of Charas + Southwest Archipelago
// - Northwest: Northern Ocean + Bay of Varcheg + Gulf of Omor + Lake Laconis / Varnovapol Fjord
// - North-Center & Northeast (Sibir, Tyal, Baltakhand): Continuous Snow Mountains & Tundra to Top Border (No Ocean!)
// - East (Baltakhand, Ortongard, Akkalat, Odokh): Continuous Steppe & Eastern Mountain Ranges to Right Border (No Ocean!)
// - South (Quyaz, Sanala, Qasira, Razih, Husn Fulq): Continuous Nahasa Desert & Southern Mountains to Bottom Border (No Ocean!)

export type BiomeType =
  | 'IMPERIAL_PLAINS'
  | 'WEST_HIGHLANDS'
  | 'NORTH_SNOW_PEAKS'
  | 'EAST_STEPPE'
  | 'SOUTH_DESERT'
  | 'RIVER_VALLEY';

export interface BiomeMetadata {
  id: BiomeType;
  label: string;
  speedMultiplier: number;
  baseColorHex: string;
}

// Extended 2400x1800 physical terrain & horizon canvas so zooming out or panning NEVER exposes black void
export const MAP_WIDTH = 2400;
export const MAP_HEIGHT = 1800;
export const MAP_HALF_EXTENT = 540;
export const WATER_LEVEL = -0.35;

export const BIOME_METADATA: Record<BiomeType, BiomeMetadata> = {
  IMPERIAL_PLAINS: {
    id: 'IMPERIAL_PLAINS',
    label: 'İmparatorluk Ovaları',
    speedMultiplier: 1.0,
    baseColorHex: '#6c8043',
  },
  WEST_HIGHLANDS: {
    id: 'WEST_HIGHLANDS',
    label: 'Battaniya ve Vlandiya Yaylaları',
    speedMultiplier: 0.86,
    baseColorHex: '#4a6630',
  },
  NORTH_SNOW_PEAKS: {
    id: 'NORTH_SNOW_PEAKS',
    label: 'Sturgia Karlı Sıradağları ve Fiyortları',
    speedMultiplier: 0.72,
    baseColorHex: '#e2e9f0',
  },
  EAST_STEPPE: {
    id: 'EAST_STEPPE',
    label: 'Khuzait Bozkırı ve İç Göl Havzası',
    speedMultiplier: 1.12,
    baseColorHex: '#848e4c',
  },
  SOUTH_DESERT: {
    id: 'SOUTH_DESERT',
    label: 'Aserai Nahasa Çölü ve Kıyı Vahaları',
    speedMultiplier: 0.82,
    baseColorHex: '#cba268',
  },
  RIVER_VALLEY: {
    id: 'RIVER_VALLEY',
    label: 'Nehir Havzası ve Geçitler',
    speedMultiplier: 0.96,
    baseColorHex: '#58753e',
  },
};

// Fast deterministic 2D value noise & FBM
function hash2D(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const u = fx * fx * (3.0 - 2.0 * fx);
  const v = fz * fz * (3.0 - 2.0 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (valueNoise2D(x * frequency, z * frequency) * 2 - 1);
    frequency *= 2.04;
    amplitude *= 0.5;
  }
  return value;
}

// Sharp tectonic mountain ridge noise (Ridged Multifractal) for eroded Bannerlord mountain spines
export function ridgedNoise2D(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.58;
  let freq = 1.0;
  let prev = 1.0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * freq, z * freq) * 2 - 1;
    let r = 1.0 - Math.abs(n);
    r = r * r;
    sum += r * amp * prev;
    prev = Math.max(0.35, r);
    freq *= 2.15;
    amp *= 0.5;
  }
  return sum;
}

export function distanceToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return Math.hypot(px - ax, pz - az);
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) return Math.hypot(px - bx, pz - bz);
  const b = c1 / c2;
  const pbx = ax + b * vx;
  const pbz = az + b * vz;
  return Math.hypot(px - pbx, pz - pbz);
}

// Meandering Continental River Segments matching Bannerlord's Calradia hydrography (Images 1, 2, 4)
export interface RiverSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
}

export const RIVER_PATHS: RiverSegment[] = [
  // 1. Vlandia Northern River (Battania Lake / Ocs Hall -> north of Pravend -> Bay of Ostican, Image 1)
  { ax: -332, az: -128, bx: -395, bz: -145, width: 1.6 },
  { ax: -395, az: -145, bx: -468, bz: -158, width: 1.85 },
  // 2. Vlandia Great Meandering River (Sargot / Pen Cannoc hills -> between Jaculan/Galend & Pravend -> Western Ocean, Image 1!)
  { ax: -305, az: 12, bx: -368, bz: -12, width: 1.7 },
  { ax: -368, az: -12, bx: -418, bz: -48, width: 1.85 },
  { ax: -418, az: -48, bx: -475, bz: -78, width: 2.0 },
  // 3. Battania Highland Lake Southern Outlet -> between Lageta & Rhotae -> between Ortysia & Jalmarys -> Perassic Sea
  { ax: -265, az: -82, bx: -182, bz: -35, width: 1.7 },
  { ax: -182, az: -35, bx: -176, bz: 35, width: 1.8 },
  { ax: -176, az: 35, bx: -188, bz: 128, width: 1.95 },
  // 4. Epicrotea & Diathma Northern Rivers into Gulf of Omor
  { ax: -142, az: -65, bx: -138, bz: -168, width: 1.65 },
  { ax: -38, az: -75, bx: -38, bz: -168, width: 1.65 },
  // 5. Argoron / Saneopa / Amitatys / Zeonica Central River
  { ax: 22, az: -145, bx: 2, bz: -65, width: 1.65 },
  { ax: 2, az: -65, bx: -42, bz: 22, width: 1.8 },
  { ax: -42, az: 22, bx: -78, bz: 152, width: 1.95 },
  // 6. Lycaron / Phycaon / Vostrum Great Imperial River & Estuary (Image 2!)
  { ax: 66, az: -25, bx: 58, bz: 52, width: 1.75 },
  { ax: 58, az: 52, bx: 55, bz: 125, width: 2.0 },
  { ax: 55, az: 125, bx: 48, bz: 175, width: 2.4 },
  // 7. Khuzait Northern River (Tyal / Baltakhand Mountains -> Makeb -> Khuzait Great Lake)
  { ax: 232, az: -248, bx: 224, bz: -165, width: 1.7 },
  // 8. Khuzait Lake Southern Outlet -> east of Onira -> Danustica Bay (Image 2!)
  { ax: 206, az: 18, bx: 198, bz: 88, width: 1.8 },
  { ax: 198, az: 88, bx: 182, bz: 162, width: 2.0 },
  // 9. Southeastern Braided River System (Odokh / Husn Fulq / Southeastern Desert Mountains, Image 4 bottom-right!)
  { ax: 195, az: 205, bx: 285, bz: 275, width: 1.75 },
  { ax: 285, az: 275, bx: 385, bz: 365, width: 1.6 },
  { ax: 242, az: 228, bx: 345, bz: 262, width: 1.55 },
  { ax: 345, az: 262, bx: 445, bz: 325, width: 1.45 },
  { ax: 268, az: 252, bx: 325, bz: 355, width: 1.5 },
  // 10. Aserai Southern Oasis River (Nahasa -> Qasira / Razih Coast)
  { ax: 85, az: 365, bx: 52, bz: 245, width: 1.65 },
];

export function distanceToRiverNetwork(x: number, z: number): { dist: number; width: number } {
  if (x < -510 || x > 480 || z < -280 || z > 395) {
    return { dist: 999, width: 1.6 };
  }
  const warpX =
    Math.sin(z * 0.042 + x * 0.018) * 5.2 +
    Math.cos(z * 0.09 - x * 0.045) * 2.1;
  const warpZ =
    Math.cos(x * 0.04 - z * 0.02) * 5.2 +
    Math.sin(x * 0.085 + z * 0.05) * 2.1;
  const wx = x + warpX;
  const wz = z + warpZ;

  let minDist = Infinity;
  let riverWidth = 1.7;
  for (let i = 0; i < RIVER_PATHS.length; i++) {
    const seg = RIVER_PATHS[i];
    const minX = Math.min(seg.ax, seg.bx) - 22;
    const maxX = Math.max(seg.ax, seg.bx) + 22;
    if (wx < minX || wx > maxX) continue;
    const minZ = Math.min(seg.az, seg.bz) - 22;
    const maxZ = Math.max(seg.az, seg.bz) + 22;
    if (wz < minZ || wz > maxZ) continue;

    const d = distanceToSegment2D(wx, wz, seg.ax, seg.az, seg.bx, seg.bz);
    if (d < minDist) {
      minDist = d;
      riverWidth = seg.width;
    }
  }
  return { dist: minDist, width: riverWidth };
}

// Forest grove density mask across Calradia
export function getForestMaskAt(x: number, z: number): number {
  const n = fbm2D(x * 0.025 + 7.4, z * 0.025 - 3.1, 3);
  const battaniaWoods = Math.max(0, 1 - Math.hypot((x + 280) / 190, (z + 105) / 145)) * 0.94;
  const sturgiaTaiga = z < -150 && x > -280 ? Math.max(0, 1 - Math.abs(z + 235) / 135) * 0.88 : 0;
  const centralWoods = Math.max(0, 1 - Math.hypot((x - 35) / 180, (z + 25) / 145)) * 0.78;
  const khuzaitLakeWoods = Math.max(0, 1 - Math.hypot((x - 250) / 110, (z + 65) / 155)) * 0.76;

  return n + Math.max(battaniaWoods, sturgiaTaiga, centralWoods, khuzaitLakeWoods);
}

// Major Imperial & Continental Caravan Roads connecting Calradian settlements
export const IMPERIAL_ROADS: Array<[{ x: number; z: number }, { x: number; z: number }]> = [
  // Vlandia West Coast Road
  [{ x: -458, z: -242 }, { x: -398, z: -238 }],
  [{ x: -398, z: -238 }, { x: -378, z: -162 }],
  [{ x: -378, z: -162 }, { x: -438, z: -122 }],
  [{ x: -438, z: -122 }, { x: -472, z: -32 }],
  [{ x: -472, z: -32 }, { x: -425, z: 12 }],
  [{ x: -425, z: 12 }, { x: -358, z: 28 }],
  [{ x: -358, z: 28 }, { x: -388, z: 92 }],
  // Vlandia -> Battania -> Central Empire Highway
  [{ x: -378, z: -162 }, { x: -315, z: -192 }],
  [{ x: -378, z: -162 }, { x: -298, z: -142 }],
  [{ x: -298, z: -142 }, { x: -225, z: -132 }],
  [{ x: -225, z: -132 }, { x: -258, z: -68 }],
  [{ x: -258, z: -68 }, { x: -218, z: -5 }],
  [{ x: -218, z: -5 }, { x: -132, z: 2 }],
  [{ x: -132, z: 2 }, { x: -68, z: 56 }],
  [{ x: -68, z: 56 }, { x: 4, z: 98 }],
  [{ x: 4, z: 98 }, { x: 24, z: 78 }],
  [{ x: 24, z: 78 }, { x: 92, z: 62 }],
  [{ x: 92, z: 62 }, { x: 182, z: 88 }],
  // Southern Imperial Road
  [{ x: -358, z: 28 }, { x: -232, z: 102 }],
  [{ x: -232, z: 102 }, { x: -145, z: 86 }],
  [{ x: -145, z: 86 }, { x: -105, z: 138 }],
  [{ x: -105, z: 138 }, { x: -18, z: 142 }],
  [{ x: -18, z: 142 }, { x: 88, z: 162 }],
  [{ x: 88, z: 162 }, { x: 205, z: 158 }],
  // Northern Imperial Road
  [{ x: -225, z: -132 }, { x: -125, z: -125 }],
  [{ x: -125, z: -125 }, { x: -55, z: -128 }],
  [{ x: -55, z: -128 }, { x: 38, z: -158 }],
  [{ x: -55, z: -128 }, { x: 18, z: -58 }],
  [{ x: 18, z: -58 }, { x: 128, z: -52 }],
  [{ x: 128, z: -52 }, { x: 148, z: -128 }],
  [{ x: 148, z: -128 }, { x: 248, z: -125 }],
  // Sturgia Snow Road
  [{ x: -262, z: -278 }, { x: -175, z: -245 }],
  [{ x: -175, z: -245 }, { x: -58, z: -192 }],
  [{ x: -58, z: -192 }, { x: -42, z: -262 }],
  [{ x: -42, z: -262 }, { x: 48, z: -228 }],
  [{ x: 48, z: -228 }, { x: 68, z: -285 }],
  [{ x: 68, z: -285 }, { x: 188, z: -265 }],
  // Khuzait Steppe Road
  [{ x: 292, z: -225 }, { x: 248, z: -125 }],
  [{ x: 248, z: -125 }, { x: 318, z: -78 }],
  [{ x: 318, z: -78 }, { x: 252, z: -48 }],
  [{ x: 252, z: -48 }, { x: 292, z: 25 }],
  [{ x: 292, z: 25 }, { x: 322, z: 88 }],
  // Aserai Southern Coast & Oasis Road
  [{ x: -232, z: 102 }, { x: -232, z: 202 }],
  [{ x: -232, z: 202 }, { x: -108, z: 248 }],
  [{ x: -108, z: 248 }, { x: 2, z: 268 }],
  [{ x: 2, z: 268 }, { x: 122, z: 262 }],
  [{ x: 122, z: 262 }, { x: 225, z: 218 }],
  [{ x: 205, z: 158 }, { x: 225, z: 218 }],
];

export interface ContinentalBridgeSpec {
  id: string;
  name: string;
  approxX: number;
  approxZ: number;
  riverSegIndex: number;
  length: number;
}

// Authentic Stone Arch Bridges snapped to exact river channels (Images 1 & 2!)
export const CONTINENTAL_BRIDGE_SPECS: ContinentalBridgeSpec[] = [
  { id: 'bridge_pravend', name: 'Pravend Kuzey Köprüsü', approxX: -412, approxZ: -148, riverSegIndex: 1, length: 9.5 },
  { id: 'bridge_jaculan', name: 'Jaculan Vadisi Köprüsü', approxX: -395, approxZ: -32, riverSegIndex: 3, length: 10.0 },
  { id: 'bridge_rhotae', name: 'Rhotae İmparatorluk Köprüsü', approxX: -176, approxZ: 2, riverSegIndex: 5, length: 9.5 },
  { id: 'bridge_zeonica', name: 'Amitatys-Zeonica Köprüsü', approxX: -62, approxZ: 92, riverSegIndex: 9, length: 10.0 },
  { id: 'bridge_lycaron', name: 'Lycaron-Phycaon Köprüsü', approxX: 57, approxZ: 68, riverSegIndex: 11, length: 10.0 },
  { id: 'bridge_vostrum', name: 'Vostrum Deltası Köprüsü', approxX: 51, approxZ: 152, riverSegIndex: 12, length: 11.0 },
  { id: 'bridge_danustica', name: 'Danustica Boğaz Köprüsü', approxX: 191, approxZ: 122, riverSegIndex: 15, length: 10.5 },
  { id: 'bridge_makeb', name: 'Makeb Kuzey Geçidi Köprüsü', approxX: 228, approxZ: -202, riverSegIndex: 13, length: 9.5 },
  { id: 'bridge_quyaz_strait', name: 'Quyaz Boğazı Taş Köprüsü', approxX: -232, approxZ: 148, riverSegIndex: -1, length: 18.0 },
];

export interface ResolvedBridge {
  id: string;
  name: string;
  x: number;
  z: number;
  rotationY: number;
  length: number;
}

// Automatically compute exact river-centered position and bank-to-bank perpendicular orientation for every bridge!
export const CONTINENTAL_BRIDGES: ResolvedBridge[] = CONTINENTAL_BRIDGE_SPECS.map((spec) => {
  if (spec.riverSegIndex === -1) {
    return {
      id: spec.id,
      name: spec.name,
      x: spec.approxX,
      z: spec.approxZ,
      rotationY: 0,
      length: spec.length,
    };
  }
  const seg = RIVER_PATHS[spec.riverSegIndex];
  const riverDx = seg.bx - seg.ax;
  const riverDz = seg.bz - seg.az;
  // Bridge deck local Z axis spans across the river (perpendicular to river vector)
  const riverAngle = Math.atan2(riverDx, riverDz);
  const rotationY = riverAngle + Math.PI / 2;

  // Search along the perpendicular axis around (approxX, approxZ) to find the exact warped river centerline (min dist)
  const perpX = Math.sin(rotationY);
  const perpZ = Math.cos(rotationY);
  let bestX = spec.approxX;
  let bestZ = spec.approxZ;
  let bestDist = Infinity;

  for (let offset = -12; offset <= 12; offset += 0.25) {
    const cx = spec.approxX + perpX * offset;
    const cz = spec.approxZ + perpZ * offset;
    const { dist } = distanceToRiverNetwork(cx, cz);
    if (dist < bestDist) {
      bestDist = dist;
      bestX = cx;
      bestZ = cz;
    }
  }

  return {
    id: spec.id,
    name: spec.name,
    x: Number(bestX.toFixed(2)),
    z: Number(bestZ.toFixed(2)),
    rotationY,
    length: spec.length,
  };
});

export interface RegionalLandmark {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
}

export const CONTINENTAL_LANDMARKS: RegionalLandmark[] = [
  { id: 'lm_sturgia', name: 'STURGIA KARLI YARIMADASI', region: 'Kuzey Fiyortları', x: 55, z: -255 },
  { id: 'lm_battania', name: 'BATTANİYA DAĞ GÖLÜ HAVZASI', region: 'Ulu Orman Yaylası', x: -322, z: -115 },
  { id: 'lm_vlandia', name: 'VLANDİYA BATI KIYILARI', region: 'Batı Krallığı', x: -420, z: -60 },
  { id: 'lm_empire', name: 'KALRADYA İMPARATORLUK MERKEZİ', region: 'Orta Vadiler', x: -15, z: 15 },
  { id: 'lm_khuzait', name: 'KHUZAİT İÇ GÖLÜ VE BOZKIRI', region: 'Doğu Hanlığı', x: 280, z: -40 },
  { id: 'lm_sea', name: 'PERASSIC İÇ DENİZİ', region: 'Güney Boğazları', x: -25, z: 198 },
  { id: 'lm_aserai', name: 'ASERAİ NAHASA ÇÖLÜ VE DELTASI', region: 'Güney Sultanlığı', x: 65, z: 285 },
];

export function distanceToNearestRoad(x: number, z: number): number {
  if (x < -490 || x > 345 || z < -305 || z > 290) return 999;
  let minDist = Infinity;
  for (let i = 0; i < IMPERIAL_ROADS.length; i++) {
    const [a, b] = IMPERIAL_ROADS[i];
    const minX = Math.min(a.x, b.x) - 12;
    const maxX = Math.max(a.x, b.x) + 12;
    if (x < minX || x > maxX) continue;
    const minZ = Math.min(a.z, b.z) - 12;
    const maxZ = Math.max(a.z, b.z) + 12;
    if (z < minZ || z > maxZ) continue;
    const d = distanceToSegment2D(x, z, a.x, a.z, b.x, b.z);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function getMacroWaterDepthAt(
  x: number,
  z: number,
  noiseFine: number,
  skipTerraceCheck = false,
): number {
  if (!skipTerraceCheck && x > -495 && x < 345 && z > -305 && z < 290) {
    for (let i = 0; i < SETTLEMENT_TERRACES.length; i++) {
      const st = SETTLEMENT_TERRACES[i];
      const dx = x - st.x;
      if (dx > 12 || dx < -12) continue;
      const dz = z - st.z;
      if (dz > 12 || dz < -12) continue;
      const r = st.radius + 1.2;
      if (dx * dx + dz * dz < r * r) {
        return 1.0;
      }
    }
  }

  const coastWobble = noiseFine * 12 + Math.sin(x * 0.025 + z * 0.03) * 8;

  // 1. Western Great Ocean (Left side of Vlandia, Bay of Ostican, Gulf of Charas & Southwest of Aserai)
  let westCoastProfile = -472 + Math.sin(z * 0.024) * 22 + Math.cos(z * 0.048) * 11;
  // Bay of Ostican indentation between Ostican (-458, -242) and Pravend (-438, -122) matching Image 1!
  if (z > -225 && z < -145) {
    const bayT = Math.sin(((z + 225) / 80) * Math.PI);
    westCoastProfile += bayT * 34;
  }
  // Authentic Western Ocean coastline curving past Jaculan & Charas toward Ortysia & Quyaz
  if (z > 105) {
    if (z < 140) {
      // North cape leading to Ortysia (-232, 102)
      const t = (z - 105) / 35;
      westCoastProfile = -435 * (1 - t) + -248 * t;
    } else if (z <= 156) {
      // The ocean enters the Strait of Quyaz channel between z = 138 and z = 156 (water channel open all the way across!)
      westCoastProfile = -205;
    } else if (z < 210) {
      // South cape leading to Quyaz (-232, 202)
      const t = (z - 156) / 54;
      westCoastProfile = -248 * (1 - t) + -255 * t;
    } else {
      // Aserai southwest ocean curving away
      const t = Math.min(1, (z - 210) / 340);
      westCoastProfile = -255 * (1 - t) + -495 * t;
    }
  }
  const westCoastX = westCoastProfile + coastWobble;

  if (x < westCoastX) {
    const swIslandMain = Math.hypot((x + 332) / 28, (z - 165) / 17) - 1.0 + noiseFine * 0.12;
    const swIslandWest1 = Math.hypot((x + 442) / 18, (z - 142) / 12) - 1.0 + noiseFine * 0.12;
    const swIslandWest2 = Math.hypot((x + 478) / 16, (z - 185) / 11) - 1.0 + noiseFine * 0.12;
    const swIslandSouth = Math.hypot((x + 405) / 15, (z - 215) / 11) - 1.0 + noiseFine * 0.12;
    const onSwArchipelago =
      swIslandMain < 0 || swIslandWest1 < 0 || swIslandWest2 < 0 || swIslandSouth < 0;
    if (!onSwArchipelago) {
      return -Math.min(4.2, (westCoastX - x) * 0.09);
    }
  }

  // 2. North-Western Sea & Sturgian Gulfs (ONLY on the Northwest / Left-Top! East of x = -55 is solid snowy land & mountains!)
  if (x < -115 && z < -215) {
    const nwCoastZ = -268 + (x < -330 ? 8 : 18) + Math.sin(x * 0.025) * 14 + coastWobble * 0.7;
    // Long Revyl Peninsula jutting west-northwest from Varcheg (-175, -245) to Revyl (-262, -278)
    const revylPeninsula =
      distanceToSegment2D(x, z, -168, -240, -268, -280) - 22 + noiseFine * 3.0;
    if (z < nwCoastZ && revylPeninsula > 0) {
      return -Math.min(4.2, (nwCoastZ - z) * 0.1);
    }
  }

  // Gulf of Varcheg & Omor (cleanly between Varcheg at -175,-245 and Omor at -58,-192 without touching town terraces!)
  if (x > -205 && x < -68 && z < -145 && z > -340) {
    const varchegGulfUpper =
      Math.hypot((x + 132) / 46, (z + 258) / 46) - 1.0 + noiseFine * 0.1;
    const omorGulfLower =
      Math.hypot((x + 112) / 42, (z + 188) / 28) - 1.0 + noiseFine * 0.1;
    if (varchegGulfUpper < 0 || omorGulfLower < 0) {
      const d = Math.min(varchegGulfUpper, omorGulfLower);
      return -Math.min(3.8, -d * 3.8);
    }
  }

  // Narrow Varnovapol Northern Fjord / Lake Laconis (west of Varnovapol at 48,-228)
  if (x > -25 && x < 34 && z < -195 && z > -315) {
    const varnovapolFjord =
      Math.hypot((x - 2) / 18, (z + 252) / 42) - 1.0 + noiseFine * 0.1;
    if (varnovapolFjord < 0) {
      return -Math.min(3.4, -varnovapolFjord * 3.6);
    }
  }

  // 3. Battanian Highland Lake (Matching Image 1: between Ocs Hall/Pravend, Dunglanys, and Pen Cannoc!)
  if (x > -365 && x < -305 && z > -148 && z < -98) {
    const battaniaLake = Math.hypot((x + 335) / 19, (z + 122) / 15) - 1.0 + noiseFine * 0.1;
    if (battaniaLake < 0) {
      return -Math.min(2.8, -battaniaLake * 3.4);
    }
  }

  // 4. Khuzait Great Inland Lake (Lake Tanaesis - unbroken vertical lake between Amprela/Myzea/Syronea and Makeb/Chaikand!)
  if (x > 175 && x < 240 && z > -235 && z < 26) {
    const lakeCurveX = 210 + Math.sin((z + 55) * 0.024) * 8;
    const khuzaitMainLake =
      Math.hypot((x - lakeCurveX) / 18, (z + 55) / 72) - 1.0 + noiseFine * 0.09;
    const khuzaitNorthArm =
      Math.hypot((x - 218) / 12, (z + 165) / 52) - 1.0 + noiseFine * 0.09;
    if (khuzaitMainLake < 0 || khuzaitNorthArm < 0) {
      const d = Math.min(khuzaitMainLake, khuzaitNorthArm);
      return -Math.min(3.6, -d * 3.6);
    }
  }

  // 5. Continuous Perassic Inner Sea (Separating the Empire north shore from the Aserai south shore!)
  if (x > -295 && x < 198 && z > 112 && z < 265) {
    // Continuous natural Strait of Quyaz channel between Ortysia north cape (z <= 138) and Quyaz south cape (z >= 158)
    // Connecting Western Great Ocean directly to Perassic Sea!
    const perassicStrait =
      Math.hypot((x + 232) / 45, (z - 148) / 9.5) - 1.0 + noiseFine * 0.06;
    const perassicWestBasin = Math.hypot((x + 138) / 84, (z - 188) / 36) - 1.0 + noiseFine * 0.1;
    const perassicMidBasin = Math.hypot((x + 28) / 86, (z - 204) / 36) - 1.0 + noiseFine * 0.1;
    const perassicEastBasin = Math.hypot((x - 88) / 74, (z - 214) / 32) - 1.0 + noiseFine * 0.1;
    const danusticaBay = Math.hypot((x - 155) / 36, (z - 195) / 26) - 1.0 + noiseFine * 0.1;

    const seaVal = Math.min(
      perassicStrait,
      perassicWestBasin,
      perassicMidBasin,
      perassicEastBasin,
      danusticaBay,
    );
    if (seaVal < 0) {
      // Iconic Perassic Sea Islands (matching Image 4's central-west islands)
      const perassicIsland1 = Math.hypot((x + 172) / 17, (z - 178) / 10);
      const perassicIsland2 = Math.hypot((x + 118) / 16, (z - 196) / 10);
      const perassicIsland3 = Math.hypot((x + 32) / 15, (z - 206) / 9);
      if (perassicIsland1 > 1.0 && perassicIsland2 > 1.0 && perassicIsland3 > 1.0) {
        return -Math.min(4.0, -seaVal * 4.0);
      }
    }
  }

  return 1.0;
}

// Settlement flat terraces so all Calradia Towns, Castles, and Villages sit cleanly on flat ground above water
export const SETTLEMENT_TERRACES: Array<{ x: number; z: number; radius: number }> = [
  // Vlandia Towns (8) & Castles (4)
  { x: -458, z: -242, radius: 9 }, // Ostican
  { x: -398, z: -238, radius: 9 }, // Rovalt
  { x: -378, z: -162, radius: 9 }, // Ocs Hall
  { x: -438, z: -122, radius: 9 }, // Pravend
  { x: -472, z: -32, radius: 9 },  // Galend
  { x: -425, z: 12, radius: 9 },   // Jaculan
  { x: -358, z: 28, radius: 9 },   // Sargot
  { x: -388, z: 92, radius: 9 },   // Charas
  { x: -412, z: -195, radius: 7 }, // Caleus Castle
  { x: -395, z: 48, radius: 7 },   // Hongard Castle
  { x: -352, z: -222, radius: 7 }, // Tirby Castle
  { x: -445, z: -78, radius: 7 },  // Ormanfard Castle
  // Battania Towns (5) & Castles (4)
  { x: -315, z: -192, radius: 9 }, // Car Banseth
  { x: -298, z: -142, radius: 9 }, // Dunglanys
  { x: -225, z: -132, radius: 9 }, // Seonon
  { x: -298, z: -85, radius: 9 },  // Pen Cannoc
  { x: -258, z: -68, radius: 9 },  // Marunath
  { x: -268, z: -162, radius: 7 }, // Llanoc Hen Castle
  { x: -195, z: -85, radius: 7 },  // Garontor Castle
  { x: -342, z: -55, radius: 7 },  // Ab Comer Castle
  { x: -188, z: -158, radius: 7 }, // Pendraic Castle
  // Sturgia Towns (7) & Castles (4)
  { x: -262, z: -278, radius: 9 }, // Revyl
  { x: -175, z: -245, radius: 9 }, // Varcheg
  { x: -42, z: -262, radius: 9 },  // Balgard
  { x: -58, z: -192, radius: 9 },  // Omor
  { x: 68, z: -285, radius: 9 },   // Sibir
  { x: 48, z: -228, radius: 9 },   // Varnovapol
  { x: 188, z: -265, radius: 9 },  // Tyal
  { x: -85, z: -235, radius: 7 },  // Ov Castle
  { x: 92, z: -238, radius: 7 },   // Urikskala Castle
  { x: 134, z: -268, radius: 7 },  // Vladiv Castle
  { x: -152, z: -198, radius: 7 }, // Mazolm Castle
  // Empire Towns (19) & Castles (9)
  { x: -125, z: -125, radius: 9 }, // Epicrotea
  { x: -55, z: -128, radius: 9 },  // Diathma
  { x: 38, z: -158, radius: 9 },   // Argoron
  { x: 105, z: -165, radius: 8 },  // Lochana Castle
  { x: 148, z: -128, radius: 9 },  // Amprela
  { x: 18, z: -58, radius: 9 },    // Saneopa
  { x: 128, z: -52, radius: 9 },   // Myzea
  { x: -218, z: -5, radius: 9 },   // Lageta
  { x: -132, z: 2, radius: 9 },    // Rhotae
  { x: -232, z: 102, radius: 9 },  // Ortysia
  { x: -145, z: 86, radius: 9 },   // Jalmarys
  { x: -68, z: 56, radius: 9 },    // Amitatys
  { x: -105, z: 138, radius: 9 },  // Zeonica
  { x: -18, z: 142, radius: 9 },   // Poros
  { x: 24, z: 78, radius: 10 },    // Lycaron
  { x: 4, z: 98, radius: 8 },      // Sancaktepe
  { x: 92, z: 62, radius: 9 },     // Phycaon
  { x: 175, z: -4, radius: 9 },    // Syronea
  { x: 178, z: 88, radius: 9 },    // Onira
  { x: 205, z: 158, radius: 9 },   // Danustica
  { x: 88, z: 162, radius: 9 },    // Vostrum
  { x: -95, z: 18, radius: 7 },    // Hertogea Castle
  { x: -32, z: 112, radius: 7 },   // Veron Castle
  { x: 142, z: 122, radius: 7 },   // Lavenia Castle
  { x: -162, z: -52, radius: 7 },  // Gersegos Castle
  { x: -18, z: -98, radius: 7 },   // Gaos Castle
  { x: 152, z: -28, radius: 7 },   // Melion Castle
  { x: 68, z: 22, radius: 7 },     // Morenia Castle
  { x: -178, z: 112, radius: 7 },  // Onica Castle
  // Khuzait Towns (6) & Castles (4)
  { x: 292, z: -225, radius: 9 },  // Baltakhand
  { x: 248, z: -125, radius: 9 },  // Makeb
  { x: 318, z: -78, radius: 9 },   // Ortongard
  { x: 252, z: -48, radius: 9 },   // Chaikand
  { x: 292, z: 25, radius: 9 },    // Akkalat
  { x: 322, z: 88, radius: 9 },    // Odokh
  { x: 278, z: -162, radius: 7 },  // Simira Castle
  { x: 282, z: 62, radius: 7 },    // Kaysar Castle
  { x: 288, z: -102, radius: 7 },  // Tepes Castle
  { x: 268, z: -8, radius: 7 },    // Khimli Castle
  // Aserai Towns (6) & Castles (4 including Bandit Fort)
  { x: -232, z: 202, radius: 9 },  // Quyaz
  { x: -168, z: 238, radius: 9 },  // Askar
  { x: -108, z: 248, radius: 9 },  // Sanala
  { x: 2, z: 268, radius: 9 },     // Qasira
  { x: 122, z: 262, radius: 9 },   // Razih
  { x: 225, z: 218, radius: 9 },   // Husn Fulq
  { x: -62, z: 102, radius: 8 },   // Karageçit Hisarı
  { x: -198, z: 218, radius: 7 },  // Tubilis Castle
  { x: -48, z: 262, radius: 7 },   // Barihal Castle
  { x: 58, z: 265, radius: 7 },    // Medeni Castle
  // Anchor Villages
  { x: -458, z: -155, radius: 6 }, // Valanby
  { x: -435, z: -62, radius: 6 },  // Cantrec
  { x: -268, z: -112, radius: 6 }, // Glenlithrig
  { x: -212, z: -258, radius: 6 }, // Forin
  { x: 145, z: -255, radius: 6 },  // Kranirag
  { x: 48, z: 118, radius: 6 },    // Canterion
  { x: 275, z: -18, radius: 6 },   // Ulaan
  { x: -62, z: 255, radius: 6 },   // Abou Khih
];

export function registerSettlementTerrace(x: number, z: number, radius: number): void {
  for (let i = 0; i < SETTLEMENT_TERRACES.length; i++) {
    const st = SETTLEMENT_TERRACES[i];
    if (Math.abs(st.x - x) < 1.5 && Math.abs(st.z - z) < 1.5) {
      if (radius > st.radius) st.radius = radius;
      return;
    }
  }
  SETTLEMENT_TERRACES.push({ x, z, radius });
}

interface MountainChainSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
  height: number;
}

const MOUNTAIN_CHAINS: MountainChainSegment[] = [
  // 1. Battania & Vlandia Ring Mountains
  { ax: -355, az: -205, bx: -268, bz: -165, width: 34, height: 15.5 },
  { ax: -355, az: -95, bx: -318, bz: -22, width: 32, height: 14.5 },
  { ax: -318, az: -22, bx: -252, bz: 42, width: 34, height: 14.5 },
  { ax: -212, az: -105, bx: -192, bz: -42, width: 30, height: 15.0 },
  // 2. Diathma, Epicrotea & Saneopa Northern Ridge
  { ax: -112, az: -102, bx: -52, bz: -85, width: 34, height: 15.5 },
  { ax: -52, az: -85, bx: -92, bz: -22, width: 32, height: 14.5 },
  // 3. Central Empire Great Spine
  { ax: 52, az: -115, bx: 92, bz: -48, width: 40, height: 16.5 },
  { ax: 92, az: -48, bx: 152, bz: -22, width: 38, height: 16.0 },
  { ax: 42, az: -12, bx: 122, bz: 22, width: 36, height: 15.0 },
  // 4. Sturgia & Northern Border Mountain Ranges
  { ax: -32, az: -315, bx: 125, bz: -335, width: 62, height: 22.0 },
  { ax: 125, az: -335, bx: 325, bz: -305, width: 68, height: 23.0 },
  { ax: 325, az: -305, bx: 680, bz: -345, width: 82, height: 24.0 },
  { ax: 112, az: -235, bx: 212, bz: -205, width: 42, height: 18.5 },
  // 5. Eastern Border Escarpment & Khuzait Frontier Ranges
  { ax: 355, az: -255, bx: 385, bz: -105, width: 60, height: 19.5 },
  { ax: 385, az: -105, bx: 405, bz: 62, width: 62, height: 19.0 },
  { ax: 405, az: 62, bx: 375, bz: 215, width: 64, height: 19.5 },
  { ax: 375, az: 215, bx: 455, bz: 415, width: 70, height: 20.5 },
  // 6. Southern Imperial Coastal Ridge (West of Zeonica)
  { ax: -132, az: 112, bx: -92, bz: 122, width: 24, height: 11.5 },
  // 7. Aserai Nahasa Desert Rim & Southern Border Mountains
  { ax: -215, az: 268, bx: -65, bz: 325, width: 56, height: 17.5 },
  { ax: -65, az: 325, bx: 125, bz: 345, width: 62, height: 18.0 },
  { ax: 125, az: 345, bx: 315, bz: 305, width: 60, height: 18.5 },
];

// Master Continental Elevation Function (2400x1800 seamless world, single-pass terrace & valley basin lookup)
export function groundHeightAt(x: number, z: number): number {
  let minBlendFactor = 1.0; // 0.0 inside settlement plateau, smoothly 0..1 across valley basin apron
  let nearAnyTerrace = false;

  if (x > -540 && x < 420 && z > -365 && z < 355) {
    for (let i = 0; i < SETTLEMENT_TERRACES.length; i++) {
      const st = SETTLEMENT_TERRACES[i];
      const outerR = st.radius * 2.55;
      const dx = x - st.x;
      if (dx > outerR || dx < -outerR) continue;
      const dz = z - st.z;
      if (dz > outerR || dz < -outerR) continue;
      const d = Math.hypot(dx, dz);
      if (d < st.radius + 3.5) {
        nearAnyTerrace = true;
      }
      if (d <= st.radius) {
        minBlendFactor = 0.0;
      } else if (d < outerR) {
        const t = (d - st.radius) / (outerR - st.radius);
        const sBlend = t * t * (3.0 - 2.0 * t);
        if (sBlend < minBlendFactor) {
          minBlendFactor = sBlend;
        }
      }
    }
  }

  // Fast flat plateau return inside any settlement core so mountains/rivers never bury walls or buildings
  if (minBlendFactor === 0.0) {
    return 2.05;
  }

  const nDetail = fbm2D(x * 0.032 + 5.2, z * 0.032 - 3.8, 3);

  if (!nearAnyTerrace) {
    const waterCheck = getMacroWaterDepthAt(x, z, nDetail, true);
    if (waterCheck < 0) {
      return waterCheck;
    }
  }

  const nMacro = fbm2D(x * 0.008, z * 0.008, 4);
  const ridge = ridgedNoise2D(x * 0.024 + nMacro * 0.45, z * 0.024 - nMacro * 0.45, 4);

  // Base rolling plains height guaranteed >= 0.85m so dry plains NEVER dip below water level!
  let h = Math.max(0.85, 1.85 + nMacro * 1.35 + nDetail * 0.45);

  // Evaluate connected sinuous mountain chains with domain warping and fast AABB pre-check
  const mwX = x + Math.sin(z * 0.028) * 14 + nMacro * 16;
  const mwZ = z + Math.cos(x * 0.028) * 14 - nMacro * 16;

  let maxMountainH = 0;
  for (let i = 0; i < MOUNTAIN_CHAINS.length; i++) {
    const seg = MOUNTAIN_CHAINS[i];
    const minX = Math.min(seg.ax, seg.bx) - seg.width;
    const maxX = Math.max(seg.ax, seg.bx) + seg.width;
    if (mwX < minX || mwX > maxX) continue;
    const minZ = Math.min(seg.az, seg.bz) - seg.width;
    const maxZ = Math.max(seg.az, seg.bz) + seg.width;
    if (mwZ < minZ || mwZ > maxZ) continue;

    const d = distanceToSegment2D(mwX, mwZ, seg.ax, seg.az, seg.bx, seg.bz);
    if (d < seg.width) {
      const t = 1.0 - d / seg.width;
      const smooth = t * t * (3.0 - 2.0 * t);
      const gully = Math.pow(Math.abs(Math.sin(x * 0.09 + z * 0.08 + nDetail * 2.4)), 0.65);
      const mh = smooth * seg.height * (0.48 + 0.68 * ridge) * (0.68 + 0.32 * gully);
      if (mh > maxMountainH) {
        maxMountainH = mh;
      }
    }
  }
  h += maxMountainH * minBlendFactor;

  // Continuous outer continental relief on North, East, and South borders
  if (z < -205 && x > -115) {
    const northFactor = Math.min(1.6, (-205 - z) / 150);
    h += northFactor * 7.8 * (0.42 + 0.68 * ridge) * minBlendFactor;
  }
  if (x > 320) {
    const eastFactor = Math.min(1.6, (x - 320) / 170);
    h += eastFactor * 7.4 * (0.38 + 0.65 * ridge) * minBlendFactor;
  }
  if (z > 235 && x > -260) {
    const southFactor = Math.min(1.5, (z - 235) / 175);
    const southDunes = Math.abs(Math.sin(x * 0.028 + z * 0.02 + nMacro * 2.0)) * 3.2;
    h += (southDunes + southFactor * 6.0 * (0.35 + 0.65 * ridge)) * minBlendFactor;
  }

  // Carve crisp, slender meandering river channels across the continent
  const { dist: rDist, width: rWidth } = distanceToRiverNetwork(x, z);
  const valleyWidth = rWidth * 1.45;
  if (rDist < valleyWidth) {
    const t = Math.max(0, Math.min(1, rDist / valleyWidth));
    const smoothT = t * t * (3 - 2 * t);
    const riverBed = -0.95;
    h = riverBed * (1 - smoothT) + h * smoothT;
  }

  // Smoothly blend settlement valley apron into surrounding terrain
  if (minBlendFactor < 1.0) {
    const targetFlat = 2.05;
    h = targetFlat * (1 - minBlendFactor) + h * minBlendFactor;
  }

  return h;
}

export function getBiomeAt(x: number, z: number): BiomeType {
  if (z < -155) return 'NORTH_SNOW_PEAKS';
  if (z > 175) return 'SOUTH_DESERT';
  const { dist: rDist, width: rWidth } = distanceToRiverNetwork(x, z);
  if (rDist < rWidth * 2.5) return 'RIVER_VALLEY';

  if (x > 165) return 'EAST_STEPPE';
  if (x < -175) return 'WEST_HIGHLANDS';
  return 'IMPERIAL_PLAINS';
}

// Compute Terrain Slope, Directional Sun-Relief Shading, and Rich Topographic Albedo Color
export function getTerrainSlopeAndColorAt(x: number, z: number): {
  height: number;
  slope: number;
  r: number;
  g: number;
  b: number;
} {
  const h = groundHeightAt(x, z);

  // Fast path for deep ocean & lakes (no slope gradient sampling needed underwater!)
  if (h < WATER_LEVEL) {
    const depth = Math.max(0, Math.min(1, (WATER_LEVEL - h) / 3.5));
    return {
      height: h,
      slope: 0.05,
      r: Math.round(32 - depth * 12),
      g: Math.round(72 - depth * 20),
      b: Math.round(104 - depth * 18),
    };
  }

  const eps = 1.6;
  const rawHx = groundHeightAt(x + eps, z);
  const rawHz = groundHeightAt(x, z + eps);
  // Clamp neighbor heights to WATER_LEVEL when computing land slope so shorelines don't produce artificial cliff spikes!
  const hx = Math.max(WATER_LEVEL, rawHx);
  const hz = Math.max(WATER_LEVEL, rawHz);

  const dx = (hx - h) / eps;
  const dz = (hz - h) / eps;
  const slope = Math.hypot(dx, dz);

  // Directional Sun-Relief Shading (Northwest sun angle like Bannerlord's map!)
  const invLen = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
  const nx = -dx * invLen;
  const ny = 1 * invLen;
  const nz = -dz * invLen;
  const sunShade = Math.max(0.46, Math.min(1.26, nx * 0.56 + ny * 0.66 + nz * 0.5));

  const nFine = fbm2D(x * 0.08, z * 0.08, 2);
  const roadDist = distanceToNearestRoad(x, z);
  const { dist: rDist, width: rWidth } = distanceToRiverNetwork(x, z);
  const forestMask = getForestMaskAt(x, z);

  // 1. River channel water (unless directly under a stone bridge deck!)
  if (rDist < rWidth * 0.85 && h < 0.28) {
    for (let i = 0; i < CONTINENTAL_BRIDGES.length; i++) {
      const b = CONTINENTAL_BRIDGES[i];
      if (Math.hypot(x - b.x, z - b.z) < 2.6) {
        return {
          height: 1.85,
          slope: 0.05,
          r: Math.round(156 * sunShade),
          g: Math.round(148 * sunShade),
          b: Math.round(134 * sunShade),
        };
      }
    }
    return {
      height: h,
      slope,
      r: 34,
      g: 76,
      b: 108,
    };
  }

  // 2. Smooth Coastal & Riverbank Sand / Shallow Shore
  const nearMacroShore = rawHx < WATER_LEVEL || rawHz < WATER_LEVEL;
  if (h < WATER_LEVEL + 0.22 || (nearMacroShore && h < 0.95) || (rDist < rWidth * 1.15 && h < 0.72)) {
    return {
      height: h,
      slope,
      r: Math.round(154 * sunShade),
      g: Math.round(138 * sunShade),
      b: Math.round(98 * sunShade),
    };
  }

  // 3. Regional Base Palette (Matching the official Bannerlord map image!)
  let r = 108 + nFine * 12;
  let g = 130 + nFine * 14;
  let b = 68 + nFine * 8;

  // Battania & Vlandia West: Lush deep emerald-olive woodland
  if (x < -160 && z > -220 && z < 140) {
    const westBlend = Math.min(1, (-160 - x) / 140);
    r = r * (1 - westBlend) + (78 + nFine * 10) * westBlend;
    g = g * (1 - westBlend) + (112 + nFine * 12) * westBlend;
    b = b * (1 - westBlend) + (54 + nFine * 8) * westBlend;
  }

  // Khuzait East Steppe: Warm olive-ochre steppe & eastern desert-steppe hills
  if (x > 140 && z > -195 && z < 195) {
    const eastBlend = Math.min(1, (x - 140) / 150);
    const aridBlend = Math.max(0, Math.min(1, (x - 255) / 130 + (z - 10) / 190));
    const stepR = (132 + nFine * 14) * (1 - aridBlend * 0.65) + 188 * (aridBlend * 0.65);
    const stepG = (136 + nFine * 12) * (1 - aridBlend * 0.65) + 158 * (aridBlend * 0.65);
    const stepB = (74 + nFine * 8) * (1 - aridBlend * 0.65) + 112 * (aridBlend * 0.65);
    r = r * (1 - eastBlend) + stepR * eastBlend;
    g = g * (1 - eastBlend) + stepG * eastBlend;
    b = b * (1 - eastBlend) + stepB * eastBlend;
  }

  // Aserai South & Southeast Desert (Golden-terracotta sand, arid dunes & sandstone capes)
  // Restrict to x > -295 so Western Ocean islands remain lush green while Aserai (Quyaz/Askar/Sanala) is desert!
  if (x > -295 && (z > 146 || (x < -185 && z > 152))) {
    const southBlend = Math.min(1, Math.max((z - 146) / 20, x < -185 ? (z - 152) / 16 : 0));
    // Subtle oasis greenery strictly around Sanala's irrigated date-palm depression
    const sanalaOasis = Math.max(0, 1 - Math.hypot((x + 85) / 22, (z - 250) / 16)) * 0.42;
    const desertR = (222 + nFine * 16) * (1 - sanalaOasis) + 120 * sanalaOasis;
    const desertG = (178 + nFine * 14) * (1 - sanalaOasis) + 138 * sanalaOasis;
    const desertB = (108 + nFine * 10) * (1 - sanalaOasis) + 68 * sanalaOasis;
    r = r * (1 - southBlend) + desertR * southBlend;
    g = g * (1 - southBlend) + desertG * southBlend;
    b = b * (1 - southBlend) + desertB * southBlend;
  }

  // Forest Grove Floor Darkening (Deep moss green under tree canopies)
  if (forestMask > 0.14 && h < 5.2 && slope < 0.72 && z > -165 && z < 145 && x < 280) {
    const fBlend = Math.min(0.62, (forestMask - 0.14) * 1.05);
    r = r * (1 - fBlend) + 56 * fBlend;
    g = g * (1 - fBlend) + 88 * fBlend;
    b = b * (1 - fBlend) + 42 * fBlend;
  }

  // 4. Sturgia Northern Snow Peninsula & High Northern Border Ranges (ONLY in the North!)
  const snowLatitude = -178 + Math.sin(x * 0.016) * 22 + nFine * 12;
  if (z < snowLatitude) {
    const snowBlend = Math.min(1, (snowLatitude - z) / 50);
    if (slope > 0.78) {
      const cliffBlend = Math.min(1, (slope - 0.78) * 1.4);
      const snowR = 230 * (1 - cliffBlend) + 122 * cliffBlend;
      const snowG = 236 * (1 - cliffBlend) + 120 * cliffBlend;
      const snowB = 244 * (1 - cliffBlend) + 118 * cliffBlend;
      r = r * (1 - snowBlend) + snowR * snowBlend;
      g = g * (1 - snowBlend) + snowG * snowBlend;
      b = b * (1 - snowBlend) + snowB * snowBlend;
    } else {
      r = r * (1 - snowBlend) + (234 + nFine * 8) * snowBlend;
      g = g * (1 - snowBlend) + (239 + nFine * 8) * snowBlend;
      b = b * (1 - snowBlend) + (246 + nFine * 6) * snowBlend;
    }
  }

  // 5. Subtle Organic Dirt Caravan Tracks
  const roadWarp = Math.sin(x * 0.07 + z * 0.06) * 2.2 + nFine * 1.8;
  const warpedRoadDist = Math.abs(roadDist + roadWarp);
  if (warpedRoadDist < 1.35 && h > WATER_LEVEL + 0.4 && h < 5.2 && z > snowLatitude + 10) {
    const roadBlend = Math.max(0, 1 - warpedRoadDist / 1.35) * 0.42;
    r = r * (1 - roadBlend) + (148 + nFine * 8) * roadBlend;
    g = g * (1 - roadBlend) + (130 + nFine * 6) * roadBlend;
    b = b * (1 - roadBlend) + (94 + nFine * 6) * roadBlend;
  }

  // 6. Craggy Exposed Limestone / Warm Sandstone / Slate Mountain Rock
  if (slope > 0.55 || h > 4.2) {
    const rockFactor = Math.min(1, Math.max((slope - 0.55) / 0.72, (h - 4.2) / 4.2));
    const strata = Math.sin(h * 3.8 + nFine * 3.5) * 11;
    const isArid = z > 125 || x > 245;
    const rockR = (isArid ? 174 : 134) + strata;
    const rockG = (isArid ? 146 : 126) + strata;
    const rockB = (isArid ? 112 : 116) + strata;
    r = r * (1 - rockFactor) + rockR * rockFactor;
    g = g * (1 - rockFactor) + rockG * rockFactor;
    b = b * (1 - rockFactor) + rockB * rockFactor;
  }

  // High mountain snow caps ONLY on northern & central-north alpine peaks (NOT in the eastern steppe or southern desert!)
  if (h > 9.2 && z < -30 && x < 260) {
    const peakSnow = Math.min(1, (h - 9.2) / 3.5) * (slope > 1.25 ? 0.48 : 0.92);
    r = r * (1 - peakSnow) + 236 * peakSnow;
    g = g * (1 - peakSnow) + 240 * peakSnow;
    b = b * (1 - peakSnow) + 246 * peakSnow;
  }

  return {
    height: h,
    slope,
    r: Math.max(0, Math.min(255, Math.round(r * sunShade))),
    g: Math.max(0, Math.min(255, Math.round(g * sunShade))),
    b: Math.max(0, Math.min(255, Math.round(b * sunShade))),
  };
}

// Overworld 1x campaign march & patrol speed constants (tuned for realistic Bannerlord 1x map pace)
export const OVERWORLD_BASE_MARCH_SPEED = 5.2;
export const OVERWORLD_LORD_PATROL_SPEED = 0.085;

// Party movement speed calculation based on terrain biome, slope, road proximity, and cavalry ratio
export function getPartySpeedInfo(
  x: number,
  z: number,
  cavalryRatio = 0.25,
): {
  biome: BiomeType;
  label: string;
  statusLabel: string;
  onRoad: boolean;
  multiplier: number;
  effectiveSpeed: number;
  worldUnitsPerSecAt1x: number;
} {
  const biome = getBiomeAt(x, z);
  const meta = BIOME_METADATA[biome];
  const roadDist = distanceToNearestRoad(x, z);
  const onRoad = roadDist < 4.5;

  const { slope } = getTerrainSlopeAndColorAt(x, z);
  const slopePenalty = Math.max(0.55, 1.0 - slope * 0.2);
  const roadBonus = onRoad ? 1.25 : 1.0;
  const cavBonus = 1.0 + Math.min(0.4, Math.max(0, cavalryRatio)) * 0.35;

  const multiplier = Number((meta.speedMultiplier * slopePenalty * roadBonus * cavBonus).toFixed(2));
  const baseSpeed = 3.8;
  const textLabel = onRoad ? `${meta.label} (Kervan Yolu +25%)` : meta.label;

  return {
    biome,
    label: textLabel,
    statusLabel: textLabel,
    onRoad,
    multiplier,
    effectiveSpeed: Number((baseSpeed * multiplier).toFixed(1)),
    worldUnitsPerSecAt1x: Number((OVERWORLD_BASE_MARCH_SPEED * multiplier).toFixed(2)),
  };
}

// Frustum-Aware Dynamic Camera Focus Clamping:
// Allows full panning over all settlements while guaranteeing the camera frustum NEVER exceeds the 2400x1800 terrain!
export function clampCameraFocus(
  focusX: number,
  focusZ: number,
  zoomDist: number,
): { x: number; z: number } {
  const clampedZoom = Math.max(16, Math.min(940, zoomDist));
  const t = Math.max(0, Math.min(1, (clampedZoom - 60) / (940 - 60)));

  const minX = -495 * (1 - t) + -340 * t;
  const maxX = 365 * (1 - t) + 290 * t;
  const minZ = -335 * (1 - t) + -295 * t;
  const maxZ = 325 * (1 - t) + 285 * t;

  return {
    x: Math.max(minX, Math.min(maxX, focusX)),
    z: Math.max(minZ, Math.min(maxZ, focusZ)),
  };
}

// Bannerlord-style Strategic Campaign Camera Transform (Zoom 16m valley to 940m full continental overview!)
export function computeBannerlordCameraTransform(
  focusX: number,
  focusY: number,
  focusZ: number,
  yawRad: number,
  zoomDist: number,
): {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  pitchRad: number;
  clampedZoom: number;
} {
  const clampedZoom = Math.max(16, Math.min(940, zoomDist));
  const t = (clampedZoom - 16) / (940 - 16);
  // Smooth S-curve pitch: Low ground-level angle (26-32 deg) when close for epic scale and horizon, tilting up to 82 deg on full continent overview
  const smoothT = t < 0.25 ? Math.pow(t / 0.25, 1.4) * 0.25 : t;
  const pitchDeg = 28 + smoothT * 54;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  const horizDist = Math.cos(pitchRad) * clampedZoom;
  const vertDist = Math.sin(pitchRad) * clampedZoom;

  const safeFocus = clampCameraFocus(focusX, focusZ, clampedZoom);

  const camX = safeFocus.x + Math.sin(yawRad) * horizDist;
  const camZ = safeFocus.z + Math.cos(yawRad) * horizDist;
  const camY = Math.max(focusY + 3.8, focusY + vertDist);

  return {
    camX,
    camY,
    camZ,
    lookX: safeFocus.x,
    lookY: focusY,
    lookZ: safeFocus.z,
    pitchRad,
    clampedZoom,
  };
}

// Settlement label LOD visibility by camera zoom distance:
// - Close zoom (<= 190m): Towns, Castles, and Villages are all visible
// - Mid zoom (190m - 380m): Towns and Castles are visible (Villages hidden)
// - Far / Maximum zoom (> 380m up to 940m max): ONLY Towns (cities) are visible; Castles and Villages are hidden
export function isSettlementLabelVisible(
  type: 'TOWN' | 'CASTLE' | 'VILLAGE',
  zoomDist: number,
): boolean {
  if (type === 'VILLAGE') {
    return zoomDist <= 190;
  }
  if (type === 'CASTLE') {
    return zoomDist <= 380;
  }
  return true;
}

