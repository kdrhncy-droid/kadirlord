// Authentic 1200x900 Calradia Continental Topographic Heightmap, Fjords, Inland Lakes, Rivers & Bannerlord Camera Math

export type BiomeType =
  | 'IMPERIAL_PLAINS'
  | 'WEST_HIGHLANDS'
  | 'NORTH_SNOW_PEAKS'
  | 'EAST_STEPPE'
  | 'SOUTH_DESERT'
  | 'INLAND_SEA'
  | 'RIVER_VALLEY';

export interface BiomeMetadata {
  id: BiomeType;
  name: string;
  speedMultiplier: number;
  description: string;
}

export const BIOME_DEFINITIONS: Record<BiomeType, BiomeMetadata> = {
  IMPERIAL_PLAINS: {
    id: 'IMPERIAL_PLAINS',
    name: 'İmparatorluk Ovaları',
    speedMultiplier: 1.0,
    description: 'Orta Kalradya vadileri, bereketli otlaklar ve taş döşeli imparatorluk ticaret yolları.',
  },
  RIVER_VALLEY: {
    id: 'RIVER_VALLEY',
    name: 'Nehir Havzası ve Geçitler',
    speedMultiplier: 0.95,
    description: 'Sulak nehir kıyıları, taş köprü geçitleri ve deltalar.',
  },
  WEST_HIGHLANDS: {
    id: 'WEST_HIGHLANDS',
    name: 'Vlandiya ve Battaniya Yaylaları',
    speedMultiplier: 0.85,
    description: 'Sarp dağ gölü havzası, sık meşe/çam ormanları ve batı okyanus kıyıları.',
  },
  NORTH_SNOW_PEAKS: {
    id: 'NORTH_SNOW_PEAKS',
    name: 'Sturgia Karlı Yarımadası ve Fiyortlar',
    speedMultiplier: 0.76,
    description: 'Kuzey denizi fiyortları, karlı tayga ormanları ve buzul sıradağları.',
  },
  EAST_STEPPE: {
    id: 'EAST_STEPPE',
    name: 'Khuzait İç Gölü ve Bozkır Platosu',
    speedMultiplier: 1.08,
    description: 'Doğu iç gölü kıyıları ve atlı okçu ordularına uygun uçsuz bucaksız bozkırlar.',
  },
  SOUTH_DESERT: {
    id: 'SOUTH_DESERT',
    name: 'Aserai Nahasa Çölü ve Vahaları',
    speedMultiplier: 0.82,
    description: 'Perassic İç Denizi güneyindeki kızıl kanyonlar, kumullar, nehir deltası ve vaha şehirleri.',
  },
  INLAND_SEA: {
    id: 'INLAND_SEA',
    name: 'Perassic Denizi ve Kuzey Körfezi',
    speedMultiplier: 0.45,
    description: 'Derin iç deniz suları, fiyortlar ve boğaz geçitleri.',
  },
};

// Massive 1200x900 Continental World Dimensions (nearly 7.5x larger area than before!)
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 900;
export const MAP_HALF_WIDTH = 600;
export const MAP_HALF_HEIGHT = 450;
export const MAP_HALF_EXTENT = 600;

function hash2(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// Multi-octave Ridged Multifractal Noise for sharp eroded Calradian mountain chains & gullies
export function ridgedMountainNoise(x: number, z: number): number {
  let sum = 0;
  let amp = 0.58;
  let freq = 0.015;
  let weight = 1.0;

  for (let i = 0; i < 5; i++) {
    const n = valueNoise2D(x * freq + i * 19.7, z * freq + i * 37.3) * 2 - 1;
    let signal = 1.0 - Math.abs(n);
    signal = signal * signal * weight;
    weight = Math.max(0.12, Math.min(1.0, signal * 1.95));
    sum += signal * amp;
    freq *= 2.12;
    amp *= 0.49;
  }
  return sum;
}

export function fbmNoise(x: number, z: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 0.018;
  for (let i = 0; i < 4; i++) {
    v += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
    freq *= 2.06;
    amp *= 0.5;
  }
  return v;
}

// Distance to 2D polyline segment
export function distanceToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const projX = ax + t * dx;
  const projZ = az + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

// Authentic Calradian River Segments (Empire rivers, Battanian streams, Khuzait lake tributaries, Aserai southern delta)
export const CALRADIA_RIVERS: Array<[{ x: number; z: number }, { x: number; z: number }]> = [
  // 1. Western Vlandian rivers
  [{ x: -450, z: -135 }, { x: -340, z: -120 }],
  [{ x: -340, z: -120 }, { x: -245, z: -105 }],
  [{ x: -435, z: 35 }, { x: -310, z: 10 }],
  // 2. Northern Gulf to Central Empire river (near Epicrotea, Rhotae, Lageta -> Ortysia)
  [{ x: -165, z: -185 }, { x: -135, z: -95 }],
  [{ x: -135, z: -95 }, { x: -145, z: 5 }],
  [{ x: -145, z: 5 }, { x: -165, z: 115 }],
  // 3. Central Imperial river (Diathma -> Saneopa -> Amitatys -> Zeonica -> Perassic Sea)
  [{ x: -55, z: -175 }, { x: -25, z: -85 }],
  [{ x: -25, z: -85 }, { x: -45, z: 25 }],
  [{ x: -45, z: 25 }, { x: -65, z: 125 }],
  // 4. Eastern Imperial & Lycaron-Poros-Vostrum river network (like Image 1 & 4!)
  [{ x: 65, z: -155 }, { x: 45, z: -55 }],
  [{ x: 45, z: -55 }, { x: 35, z: 35 }],
  [{ x: 35, z: 35 }, { x: 85, z: 145 }],
  // 5. Onira - Danustica river flowing from Southern Khuzait Lake to Perassic Sea
  [{ x: 235, z: 45 }, { x: 185, z: 115 }],
  [{ x: 185, z: 115 }, { x: 135, z: 175 }],
  // 6. Aserai Southeastern Oasis & Meandering Delta (bottom-right of Image 1 & 4!)
  [{ x: 215, z: 205 }, { x: 275, z: 275 }],
  [{ x: 275, z: 275 }, { x: 345, z: 335 }],
  [{ x: 345, z: 335 }, { x: 425, z: 390 }],
  [{ x: 275, z: 275 }, { x: 245, z: 365 }],
  // 7. Sturgian Northern rivers (Omor -> Balgard -> Northern Fjord)
  [{ x: 15, z: -195 }, { x: -25, z: -275 }],
  [{ x: 155, z: -185 }, { x: 125, z: -285 }],
];

export function riverCenterZ(x: number): number {
  return Math.sin(x * 0.012) * 28 + Math.cos(x * 0.028) * 10 - 35;
}

export function distanceToRiverNetwork(x: number, z: number): number {
  let minD = Infinity;
  const wobble = Math.sin(x * 0.08 + z * 0.07) * 2.2;
  for (let i = 0; i < CALRADIA_RIVERS.length; i++) {
    const [a, b] = CALRADIA_RIVERS[i];
    const d = distanceToSegment2D(x, z, a.x, a.z, b.x, b.z) + wobble;
    if (d < minD) minD = d;
  }
  return Math.max(0, minD);
}

// Forest grove density mask across the 1200x900 continent (matching Image 1, 2, 3, 4!)
export function getForestMaskAt(x: number, z: number): number {
  const n = fbmNoise(x * 0.85, z * 0.85);
  // 1. Battania & Vlandia dense woodlands (Northwest-West)
  const battaniaWoods = Math.max(0, 1 - Math.hypot((x + 235) / 145, (z + 95) / 115)) * 0.85;
  // 2. Sturgia northern snowy pine taiga (Sibir, Tyal, Varcheg, Omor — like Image 2!)
  const sturgiaTaiga = z < -165 ? Math.max(0, 0.72 + Math.sin(x * 0.025) * 0.25) : 0;
  // 3. Central Empire & Lycaron/Myzea/Syronea woodland groves (like Image 3!)
  const centralWoods = Math.max(0, 1 - Math.hypot((x - 55) / 155, (z + 45) / 135)) * 0.72;
  // 4. Khuzait Lake shore woods (Makeb, Chaikand, Ortongard — like Image 3!)
  const khuzaitLakeWoods = Math.max(0, 1 - Math.hypot((x - 275) / 95, (z + 65) / 155)) * 0.75;

  return n + Math.max(battaniaWoods, sturgiaTaiga, centralWoods, khuzaitLakeWoods);
}

// Major Imperial & Continental Caravan Roads connecting the 36 Calradian settlements
export const IMPERIAL_ROADS: Array<[{ x: number; z: number }, { x: number; z: number }]> = [
  // Vlandia West Coast Road
  [{ x: -435, z: -245 }, { x: -380, z: -155 }],
  [{ x: -380, z: -155 }, { x: -415, z: -95 }],
  [{ x: -415, z: -95 }, { x: -395, z: 25 }],
  [{ x: -395, z: 25 }, { x: -335, z: 55 }],
  [{ x: -335, z: 55 }, { x: -355, z: 125 }],
  // Vlandia -> Battania -> Central Empire Highway
  [{ x: -380, z: -155 }, { x: -285, z: -115 }],
  [{ x: -285, z: -115 }, { x: -225, z: -75 }],
  [{ x: -225, z: -75 }, { x: -185, z: -15 }],
  [{ x: -185, z: -15 }, { x: -110, z: -5 }],
  [{ x: -110, z: -5 }, { x: -35, z: 25 }],
  [{ x: -35, z: 25 }, { x: -18, z: 12 }],
  [{ x: -18, z: 12 }, { x: -6, z: -12 }],
  [{ x: -6, z: -12 }, { x: 35, z: 35 }],
  [{ x: -35, z: 25 }, { x: 35, z: 35 }],
  [{ x: 35, z: 35 }, { x: 105, z: 25 }],
  [{ x: 105, z: 25 }, { x: 185, z: 45 }],
  // Southern Imperial Road (Ortysia -> Jalmarys -> Zeonica -> Poros -> Vostrum -> Danustica)
  [{ x: -335, z: 55 }, { x: -195, z: 85 }],
  [{ x: -195, z: 85 }, { x: -125, z: 60 }],
  [{ x: -125, z: 60 }, { x: -75, z: 95 }],
  [{ x: -75, z: 95 }, { x: -10, z: 112 }],
  [{ x: -10, z: 112 }, { x: 92, z: 148 }],
  [{ x: 92, z: 148 }, { x: 205, z: 112 }],
  // Northern Imperial & Sturgian Road (Epicrotea -> Diathma -> Saneopa -> Myzea -> Amprela -> Makeb)
  [{ x: -215, z: -125 }, { x: -135, z: -145 }],
  [{ x: -135, z: -145 }, { x: -75, z: -150 }],
  [{ x: -75, z: -150 }, { x: 28, z: -75 }],
  [{ x: 28, z: -75 }, { x: 128, z: -92 }],
  [{ x: 128, z: -92 }, { x: 155, z: -165 }],
  [{ x: 155, z: -165 }, { x: 245, z: -168 }],
  // Sturgia Snow Peninsula Road (Varcheg -> Omor -> Balgard -> Sibir -> Tyal)
  [{ x: -175, z: -245 }, { x: -45, z: -215 }],
  [{ x: -45, z: -215 }, { x: -15, z: -295 }],
  [{ x: -15, z: -295 }, { x: 95, z: -325 }],
  [{ x: 95, z: -325 }, { x: 205, z: -295 }],
  // Khuzait Steppe Eastern Road (Baltakhand -> Makeb -> Ortongard -> Chaikand -> Akkalat -> Odokh)
  [{ x: 315, z: -245 }, { x: 245, z: -168 }],
  [{ x: 245, z: -168 }, { x: 325, z: -115 }],
  [{ x: 325, z: -115 }, { x: 248, z: -65 }],
  [{ x: 248, z: -65 }, { x: 305, z: 18 }],
  [{ x: 305, z: 18 }, { x: 340, z: 82 }],
  // Aserai Southern Coast & Oasis Road (Quyaz -> Sanala -> Qasira -> Razih -> Husn Fulq)
  [{ x: -195, z: 85 }, { x: -205, z: 182 }],
  [{ x: -205, z: 182 }, { x: -95, z: 245 }],
  [{ x: -95, z: 245 }, { x: 8, z: 295 }],
  [{ x: 8, z: 295 }, { x: 145, z: 278 }],
  [{ x: 145, z: 278 }, { x: 235, z: 195 }],
  [{ x: 205, z: 112 }, { x: 235, z: 195 }],
];

export const CONTINENTAL_BRIDGES = [
  { id: 'bridge_vlandia', name: 'Pravend Kemer Köprüsü', x: -340, z: -120, rotationY: 0.15, length: 9.0 },
  { id: 'bridge_rhotae', name: 'Rhotae İmparatorluk Köprüsü', x: -140, z: -35, rotationY: 1.45, length: 9.0 },
  { id: 'bridge_zeonica', name: 'Zeonica Nehri Köprüsü', x: -45, z: 35, rotationY: 1.35, length: 9.0 },
  { id: 'bridge_lycaron', name: 'Lycaron Taş Köprüsü', x: 40, z: 15, rotationY: 1.5, length: 9.0 },
  { id: 'bridge_danustica', name: 'Danustica Boğaz Köprüsü', x: 185, z: 115, rotationY: 0.85, length: 9.5 },
  { id: 'bridge_makeb', name: 'Makeb Kuzey Geçidi Köprüsü', x: 245, z: -195, rotationY: 0.1, length: 9.5 },
];

export interface RegionalLandmark {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
}

export const CONTINENTAL_LANDMARKS: RegionalLandmark[] = [
  { id: 'lm_sturgia', name: 'STURGIA KARLI YARIMADASI', region: 'Kuzey Fiyortları', x: 85, z: -285 },
  { id: 'lm_battania', name: 'BATTANİYA DAĞ GÖLÜ HAVZASI', region: 'Ulu Orman Yaylası', x: -245, z: -95 },
  { id: 'lm_vlandia', name: 'VLANDİYA BATI KIYILARI', region: 'Batı Krallığı', x: -395, z: -45 },
  { id: 'lm_empire', name: 'KALRADYA İMPARATORLUK MERKEZİ', region: 'Orta Vadiler', x: 15, z: -15 },
  { id: 'lm_khuzait', name: 'KHUZAİT İÇ GÖLÜ VE BOZKIRI', region: 'Doğu Hanlığı', x: 295, z: -45 },
  { id: 'lm_sea', name: 'PERASSIC İÇ DENİZİ', region: 'Güney Boğazları', x: -35, z: 185 },
  { id: 'lm_aserai', name: 'ASERAİ NAHASA ÇÖLÜ VE DELTASI', region: 'Güney Sultanlığı', x: 95, z: 265 },
];

export function distanceToNearestRoad(x: number, z: number): number {
  let minDist = Infinity;
  for (let i = 0; i < IMPERIAL_ROADS.length; i++) {
    const [a, b] = IMPERIAL_ROADS[i];
    const d = distanceToSegment2D(x, z, a.x, a.z, b.x, b.z);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Water Mask Helper: Returns < 0 if point is in Ocean, Fjord, Perassic Sea, Khuzait Lake, or Battania Lake
export function getMacroWaterDepthAt(x: number, z: number, noiseFine: number): number {
  const coastWobble = noiseFine * 18 + Math.sin(x * 0.025 + z * 0.03) * 12;

  // 1. Western Great Ocean (left of Vlandia coast, x < -455)
  const westCoastX = -458 + Math.sin(z * 0.015) * 32 + Math.cos(z * 0.04) * 14 + coastWobble;
  if (x < westCoastX) {
    return -Math.min(4.2, (westCoastX - x) * 0.09);
  }

  // 2. Southwestern Bay below Charas (x < -275, z > 145)
  const swBayDist = Math.hypot((x + 365) / 115, (z - 255) / 125) - 1.0 + noiseFine * 0.14;
  if (swBayDist < 0) {
    return -Math.min(4.0, -swBayDist * 3.8);
  }

  // 3. Northern Sea & Deep Sturgian Gulf (between Revyl/Varcheg on left and Balgard/Sibir peninsula on right, like Image 1, 2 & 4!)
  const northEdgeZ = -355 + Math.sin(x * 0.012) * 28 + coastWobble;
  if (z < northEdgeZ) {
    return -Math.min(4.2, (northEdgeZ - z) * 0.09);
  }
  // Gulf of Varcheg & Omor (carving south between x: -245..-55, z: -360..-185)
  const varchegGulf =
    Math.hypot((x + 145) / 88, (z + 275) / 92) - 1.0 + noiseFine * 0.16 + Math.sin(z * 0.04) * 0.08;
  if (varchegGulf < 0) {
    return -Math.min(3.8, -varchegGulf * 3.6);
  }
  // Gulf East of Tyal (top-right of Image 2: x > 235, z < -255)
  const tyalBay = Math.hypot((x - 325) / 95, (z + 325) / 82) - 1.0 + noiseFine * 0.14;
  if (tyalBay < 0) {
    return -Math.min(3.8, -tyalBay * 3.5);
  }

  // 4. Battanian Highland Lake (Lochana Lake surrounded by Marunath, Seonon, Dunglanys, Pen Cannoc!)
  const battaniaLake = Math.hypot((x + 252) / 30, (z + 92) / 22) - 1.0 + noiseFine * 0.15;
  if (battaniaLake < 0) {
    return -Math.min(2.6, -battaniaLake * 2.8);
  }

  // 5. Khuzait Elongated North-South Inland Lake / Sea (between Myzea/Syronea and Makeb/Chaikand — Image 3 & 4!)
  const lakeCurveX = 205 + Math.sin(z * 0.018) * 14;
  const khuzaitLake =
    Math.hypot((x - lakeCurveX) / 28, (z + 72) / 112) - 1.0 + noiseFine * 0.16;
  if (khuzaitLake < 0) {
    return -Math.min(3.4, -khuzaitLake * 3.4);
  }

  // 6. Southern Perassic Sea (between Empire north shore and Aserai south shore, with Western Strait at Ortysia/Quyaz and Eastern Isthmus at Danustica/Husn Fulq — Image 1 & 4!)
  const seaCenterZ = 182 + Math.sin(x * 0.014) * 22;
  const perassicSea =
    Math.hypot((x + 28) / 188, (z - seaCenterZ) / 62) - 1.0 + noiseFine * 0.14;
  if (perassicSea < 0) {
    // Two Mediterranean islands inside the Perassic Sea (like Image 1 & 4!)
    const westIsland = Math.hypot((x + 115) / 24, (z - 195) / 15) + noiseFine * 0.15;
    const eastIsland = Math.hypot((x - 42) / 20, (z - 205) / 14) + noiseFine * 0.15;
    if (westIsland < 0.85) return (0.85 - westIsland) * 3.8;
    if (eastIsland < 0.85) return (0.85 - eastIsland) * 3.5;
    return -Math.min(4.2, -perassicSea * 4.0);
  }

  return 1.0; // Dry land
}

// Deterministic 1200x900 Calradia Heightmap with Mountain Chains, Passes, Valleys, Lakes & Seas
export function groundHeightAt(x: number, z: number): number {
  const noiseFine = fbmNoise(x * 1.15, z * 1.15);
  const ridges = ridgedMountainNoise(x, z);

  // Check macro water bodies first
  const waterCheck = getMacroWaterDepthAt(x, z, noiseFine);
  if (waterCheck < 0) {
    return waterCheck;
  }

  // Base rolling continental elevation
  let h = 1.25 + noiseFine * 1.05 + ridges * 1.65;

  // Major Calradian Mountain Ranges & Massifs (leaving open valleys & strategic passes for settlements and roads!)
  // A. Central-West Lycaron / Poros / Zeonica Mountain Ridge (right beside the player's starting valley!)
  const lycaronRidge = Math.max(0, 1 - Math.hypot((x - 2) / 42, (z - 8) / 48));
  // B. Battanian Ring Mountains around the Highland Lake
  const battaniaRing = Math.max(
    0,
    1 - Math.abs(Math.hypot((x + 250) / 72, (z + 92) / 58) - 0.95) * 2.2,
  );
  // C. Spine of the Empire (between Rhotae/Lageta and Epicrotea/Diathma)
  const empireSpine = Math.max(0, 1 - Math.hypot((x + 95) / 68, (z + 78) / 48));
  // D. Myzea - Phycaon - Lycaron Highland Massif (snow-capped central-east mountains from Image 3 & 4!)
  const myzeaMassif = Math.max(0, 1 - Math.hypot((x - 88) / 64, (z + 42) / 62));
  // E. Sturgian Northern Alpine Peaks (Sibir & Tyal mountains from Image 2!)
  const sturgiaPeaks = Math.max(0, 1 - Math.hypot((x - 145) / 125, (z + 275) / 68));
  const revylPeaks = Math.max(0, 1 - Math.hypot((x + 285) / 75, (z + 255) / 52));
  // F. Aserai Southern Badland Escarpments & Canyons (Image 1 bottom!)
  const aseraiCliffs = Math.max(0, 1 - Math.hypot((x - 55) / 145, (z - 335) / 58));

  const massifMask = Math.max(
    lycaronRidge * 1.15,
    battaniaRing * 1.05,
    empireSpine * 1.08,
    myzeaMassif * 1.25,
    sturgiaPeaks * 1.3,
    revylPeaks * 1.1,
    aseraiCliffs * 0.95,
  );

  if (massifMask > 0.01) {
    const gullyWave = Math.abs(
      Math.sin(x * 0.14 + z * 0.11 + fbmNoise(x * 1.8, z * 1.8) * 2.5),
    );
    const spur = Math.pow(gullyWave, 0.78);
    h += Math.pow(massifMask, 1.18) * (ridges * 21.0 + spur * 8.2);
  }

  // Far-North Sturgian elevation boost
  if (z < -190) {
    const nf = Math.min(1.2, (-190 - z) / 140);
    h += nf * (ridges * 14.0 + 2.2);
  }

  // Far-East Khuzait Steppe Escarpment (right edge of Image 3 & 4!)
  if (x > 330) {
    const ef = Math.min(1.25, (x - 330) / 160);
    h += ef * (ridges * 16.5 + 3.5);
  }

  // Carve smooth passes along major Imperial roads so roads pass through mountain valleys naturally
  const roadDist = distanceToNearestRoad(x, z);
  if (roadDist < 16.0) {
    const rt = roadDist / 16.0;
    const smoothRoad = rt * rt * (3 - 2 * rt);
    const passFloor = Math.min(h, 2.2 + ridges * 1.2);
    h = passFloor * (1 - smoothRoad) + h * smoothRoad;
  }

  h = Math.max(0.42, h);

  // Smooth River Valley & Channel Carving
  const rDist = distanceToRiverNetwork(x, z);
  if (rDist < 14.0) {
    const valleyT = Math.max(0, Math.min(1, (rDist - 2.8) / 11.2));
    const smoothValley = valleyT * valleyT * (3 - 2 * valleyT);
    h = 0.52 * (1 - smoothValley) + h * smoothValley;
  }
  if (rDist < 3.0) {
    const norm = rDist / 3.0;
    const riverCut = (1 - norm * norm) * 2.05;
    h -= riverCut;
  }

  return h;
}

// Compute High-Contrast Bannerlord sRGB Topographic Pixel Color (matching Image 1, 2, 3, 4!)
export function getTerrainSlopeAndColorAt(x: number, z: number): {
  height: number;
  slope: number;
  r: number;
  g: number;
  b: number;
} {
  const eps = 1.4;
  const h = groundHeightAt(x, z);
  const hx = groundHeightAt(x + eps, z);
  const hz = groundHeightAt(x, z + eps);
  const dx = (hx - h) / eps;
  const dz = (hz - h) / eps;
  const slope = Math.hypot(dx, dz);

  const invLen = 1 / Math.hypot(dx, 1.0, dz);
  const nx = -dx * invLen;
  const ny = 1.0 * invLen;
  const nz = -dz * invLen;

  // Directional low-angle sun relief shading + crevice ambient occlusion
  const sunDot = Math.max(0.12, nx * -0.66 + ny * 0.54 + nz * 0.52);
  const reliefShade = 0.40 + Math.pow(sunDot, 1.15) * 0.88;

  const roadDist = distanceToNearestRoad(x, z);
  const rDist = distanceToRiverNetwork(x, z);
  const forestMask = getForestMaskAt(x, z);
  const fineVar = fbmNoise(x * 2.4, z * 2.4) * 0.045;

  let r = 0.50;
  let g = 0.45;
  let b = 0.25;

  // 1. Deep Sea, Fjords, Inland Lakes & Rivers (rich navy-teal water like Image 1, 2, 3, 4!)
  if (h < -0.1) {
    const depth = Math.min(1, (-0.1 - h) / 2.8);
    r = 0.15 * (1 - depth) + 0.05 * depth;
    g = 0.33 * (1 - depth) + 0.16 * depth;
    b = 0.41 * (1 - depth) + 0.25 * depth;
    return { height: h, slope, r, g, b };
  }

  // 2. Coastal Sand / Riverbank Shore
  if (h < 0.26 || rDist < 3.6) {
    r = (0.54 + fineVar) * reliefShade;
    g = (0.46 + fineVar) * reliefShade;
    b = (0.33 + fineVar) * reliefShade;
    return { height: h, slope, r, g, b };
  }

  // 3. Worn Dusty Caravan Trail along Imperial Roads
  if (roadDist < 1.8 && slope < 0.55) {
    const t = 1 - roadDist / 1.8;
    r = (0.59 * t + 0.51 * (1 - t) + fineVar) * reliefShade;
    g = (0.49 * t + 0.44 * (1 - t) + fineVar) * reliefShade;
    b = (0.35 * t + 0.27 * (1 - t) + fineVar) * reliefShade;
    return { height: h, slope, r, g, b };
  }

  // 4. Regional Biome Ground Splatting (Sturgia/Highland Snow, Aserai Desert, Khuzait Steppe, Vlandia/Empire Plains)
  // Notice in Image 2, 3, and 4: snow covers Sturgia (z < -175) AND the high central-eastern mountains (Myzea/Amprela/Makeb ridge)!
  const snowLineLat = z < -165 ? (-165 - z) / 55 : 0;
  const highAltSnow =
    h > 5.2 && z < 45 && x > -120 && x < 260 ? (h - 5.2) / 4.2 : h > 8.5 ? (h - 8.5) / 4.5 : 0;
  const snowFactor = Math.max(0, Math.min(1, snowLineLat + highAltSnow + fineVar * 2));

  if (snowFactor > 0.15) {
    // Crisp Bannerlord snowfields with exposed dark-grey slate cliffs on steep slopes (Image 2 & 3!)
    const exposedSlate = Math.max(0, Math.min(1, (slope - 0.32) * 2.4));
    const snowR = 0.86 * (1 - exposedSlate) + 0.36 * exposedSlate;
    const snowG = 0.89 * (1 - exposedSlate) + 0.34 * exposedSlate;
    const snowB = 0.94 * (1 - exposedSlate) + 0.33 * exposedSlate;

    const baseR = 0.35;
    const baseG = 0.40;
    const baseB = 0.24;
    r = baseR * (1 - snowFactor) + snowR * snowFactor;
    g = baseG * (1 - snowFactor) + snowG * snowFactor;
    b = baseB * (1 - snowFactor) + snowB * snowFactor;
    return {
      height: h,
      slope,
      r: Math.max(0.06, Math.min(0.97, (r + fineVar * 0.5) * (0.55 + sunDot * 0.52))),
      g: Math.max(0.06, Math.min(0.97, (g + fineVar * 0.5) * (0.55 + sunDot * 0.52))),
      b: Math.max(0.06, Math.min(0.98, (b + fineVar * 0.5) * (0.56 + sunDot * 0.52))),
    };
  }

  // Southern Aserai Desert & Reddish Sandstone Badlands (z > 135 — bottom of Image 1 & 4!)
  if (z > 135) {
    const desertBlend = Math.min(1, (z - 135) / 75);
    const duneTone = 0.5 + Math.sin(x * 0.04 + z * 0.05) * 0.5;
    const desR = 0.66 * (1 - duneTone * 0.22);
    const desG = 0.50 * (1 - duneTone * 0.24);
    const desB = 0.35 * (1 - duneTone * 0.25);

    r = 0.48 * (1 - desertBlend) + desR * desertBlend;
    g = 0.43 * (1 - desertBlend) + desG * desertBlend;
    b = 0.24 * (1 - desertBlend) + desB * desertBlend;
  } else if (x > 215) {
    // Eastern Khuzait Steppe & Dry Plateau (right side of Image 3 & 4!)
    const steppeBlend = Math.min(1, (x - 215) / 95);
    const stepR = 0.53;
    const stepG = 0.46;
    const stepB = 0.34;
    r = 0.38 * (1 - steppeBlend) + stepR * steppeBlend;
    g = 0.43 * (1 - steppeBlend) + stepG * steppeBlend;
    b = 0.22 * (1 - steppeBlend) + stepB * steppeBlend;
  } else {
    // Vlandia, Battania & Imperial Heartland (Lush Olive Grass + Sun-Baked Golden Ochre Meadows)
    const dryGrassFactor = Math.max(
      0,
      Math.min(1, 0.52 + fbmNoise(x * 0.45, z * 0.45) * 1.35 + (z > 15 ? 0.18 : -0.08)),
    );
    r = 0.30 * (1 - dryGrassFactor) + 0.58 * dryGrassFactor;
    g = 0.39 * (1 - dryGrassFactor) + 0.49 * dryGrassFactor;
    b = 0.17 * (1 - dryGrassFactor) + 0.27 * dryGrassFactor;

    if (forestMask > 0.15 && slope < 0.45) {
      const fBlend = Math.min(0.80, (forestMask - 0.15) * 1.4);
      r = r * (1 - fBlend) + 0.21 * fBlend;
      g = g * (1 - fBlend) + 0.31 * fBlend;
      b = b * (1 - fBlend) + 0.12 * fBlend;
    }
  }

  // 5. Steep Craggy Mountain Cliffs & Gullies
  const rockFactor = Math.max(
    0,
    Math.min(1, (slope - 0.23) * 2.1 + Math.max(0, (h - 3.6) * 0.15)),
  );
  if (rockFactor > 0) {
    const gullyCrevice = Math.sin(x * 0.32 + z * 0.27 + h * 1.8);
    const rockR = gullyCrevice < -0.18 ? 0.26 : 0.48 + gullyCrevice * 0.06;
    const rockG = gullyCrevice < -0.18 ? 0.22 : 0.42 + gullyCrevice * 0.05;
    const rockB = gullyCrevice < -0.18 ? 0.19 : 0.37 + gullyCrevice * 0.05;
    r = r * (1 - rockFactor) + rockR * rockFactor;
    g = g * (1 - rockFactor) + rockG * rockFactor;
    b = b * (1 - rockFactor) + rockB * rockFactor;
  }

  return {
    height: h,
    slope,
    r: Math.max(0.04, Math.min(0.95, (r + fineVar) * reliefShade)),
    g: Math.max(0.04, Math.min(0.95, (g + fineVar) * reliefShade)),
    b: Math.max(0.04, Math.min(0.95, (b + fineVar) * reliefShade)),
  };
}

export function getBiomeAt(x: number, z: number): BiomeType {
  const h = groundHeightAt(x, z);
  if (h < -0.1) {
    const rDist = distanceToRiverNetwork(x, z);
    return rDist < 4.5 ? 'RIVER_VALLEY' : 'INLAND_SEA';
  }
  if (distanceToRiverNetwork(x, z) < 9.5) return 'RIVER_VALLEY';
  if (z < -165 || h > 9.5) return 'NORTH_SNOW_PEAKS';
  if (z > 135) return 'SOUTH_DESERT';
  if (x > 195) return 'EAST_STEPPE';
  if (x < -185) return 'WEST_HIGHLANDS';
  return 'IMPERIAL_PLAINS';
}

export function getPartySpeedInfo(
  x: number,
  z: number,
  cavalryRatio: number,
): {
  biome: BiomeMetadata;
  onRoad: boolean;
  multiplier: number;
  statusLabel: string;
} {
  const biomeType = getBiomeAt(x, z);
  const biome = BIOME_DEFINITIONS[biomeType];
  const roadDist = distanceToNearestRoad(x, z);
  const onRoad = roadDist < 4.5;

  let mult = biome.speedMultiplier;
  if (onRoad) {
    mult = Math.max(mult, 1.0) * 1.25;
  }
  mult += cavalryRatio * 0.18;

  const statusLabel = onRoad ? `${biome.name} (Taş Yol +25%)` : biome.name;
  return {
    biome,
    onRoad,
    multiplier: Number(mult.toFixed(2)),
    statusLabel,
  };
}

// Pure Bannerlord Camera Transform Calculator (supports close valley 16m up to full 1200x900 continent 520m!)
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
} {
  const clampedZoom = Math.max(16, Math.min(520, zoomDist));
  const zoomNorm = (clampedZoom - 16) / (520 - 16);
  // Low tactical angle (33 deg) when close, rising to high continental atlas angle (74 deg) when zoomed out
  const pitchRad = 0.58 + Math.pow(zoomNorm, 0.78) * 0.72;

  const horizDist = Math.cos(pitchRad) * clampedZoom;
  const vertDist = Math.sin(pitchRad) * clampedZoom;

  const camX = focusX + Math.sin(yawRad) * horizDist;
  const camZ = focusZ + Math.cos(yawRad) * horizDist;
  const camY = Math.max(focusY + 5.5, focusY + vertDist);

  const forwardLookShift = (1 - zoomNorm) * 4.5;
  const lookX = focusX - Math.sin(yawRad) * forwardLookShift;
  const lookZ = focusZ - Math.cos(yawRad) * forwardLookShift;
  const lookY = focusY + (1 - zoomNorm) * 1.2;

  return {
    camX,
    camY,
    camZ,
    lookX,
    lookY,
    lookZ,
    pitchRad,
  };
}
