// Decoupled Continental Land Navigation, Water-Collision Avoidance & Isthmus/Bridge Pathfinding
// Guarantees that neither the Player nor any AI Lord can EVER walk across oceans, seas, gulfs, or lakes!

import {
  CONTINENTAL_BRIDGES,
  getMacroWaterDepthAt,
  groundHeightAt,
} from './mapGen.ts';

export interface NavPoint {
  x: number;
  z: number;
}

// Check if a world position is on one of the continental stone bridges or the Ortysia-Quyaz stone bridge
export function isPointOnBridge(x: number, z: number): boolean {
  // Ortysia (-232, 102) <-> Quyaz (-232, 202) Western Strait Stone Arch Bridge (x: -232, z: 148, length: 18)
  if (Math.abs(x - -232) <= 3.8 && z >= 137 && z <= 159) {
    return true;
  }
  for (let i = 0; i < CONTINENTAL_BRIDGES.length; i++) {
    const b = CONTINENTAL_BRIDGES[i];
    if (Math.hypot(x - b.x, z - b.z) <= b.length * 0.65) {
      return true;
    }
  }
  return false;
}

// Strict check: returns true ONLY if (x, z) is on mainland dry land or a bridge (NEVER on sea/ocean/gulf/lake or isolated sea islands!)
export function isNavigableLandAt(x: number, z: number): boolean {
  if (x < -515 || x > 445 || z < -325 || z > 345) {
    return false;
  }
  if (isPointOnBridge(x, z)) {
    return true;
  }
  // Reject isolated SW ocean archipelago & Perassic Sea islands (surrounded by water with no bridge)
  if (x < -290 && z > 125) {
    return false;
  }
  if (x > -215 && x < 65 && z > 162 && z < 222) {
    return false;
  }
  // Macro water check: rejects Great Western Ocean, Perassic Sea, Gulf of Varcheg/Omor, Varnovapol Fjord, Battania Lake, Khuzait Lake
  const macroWater = getMacroWaterDepthAt(x, z, 0, false);
  if (macroWater < 0) {
    return false;
  }
  return true;
}

// If a user clicks on an ocean, sea, gulf, or lake, spiral-search outward to snap to the nearest dry coastline point
export function snapToNearestLand(x: number, z: number): NavPoint {
  const clampedX = Math.max(-495, Math.min(365, x));
  const clampedZ = Math.max(-305, Math.min(295, z));
  if (isNavigableLandAt(clampedX, clampedZ)) {
    return { x: clampedX, z: clampedZ };
  }

  for (let radius = 4; radius <= 180; radius += 4) {
    const steps = Math.max(12, Math.round(radius * 0.8));
    for (let s = 0; s < steps; s++) {
      const ang = (s / steps) * Math.PI * 2;
      const cx = clampedX + Math.cos(ang) * radius;
      const cz = clampedZ + Math.sin(ang) * radius;
      if (isNavigableLandAt(cx, cz)) {
        return { x: Number(cx.toFixed(1)), z: Number(cz.toFixed(1)) };
      }
    }
  }

  return { x: 4, z: 98 }; // Fallback to Sancaktepe
}

// Check if a straight line between A and B stays 100% on navigable land (no sea/lake/gulf crossings!)
export function isLandSegmentClear(ax: number, az: number, bx: number, bz: number): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  if (dist < 1e-3) return true;
  const steps = Math.max(2, Math.ceil(dist / 3.5));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sx = ax + (bx - ax) * t;
    const sz = az + (bz - az) * t;
    if (!isNavigableLandAt(sx, sz)) {
      return false;
    }
  }
  return true;
}

// Strategic Continental Land Corridor & Bridge Waypoints around all seas, gulfs, fjords, and lakes
const LAND_NAV_NODES: NavPoint[] = [
  // Vlandia & Battania West corridors
  { x: -458, z: -242 }, // 0: Ostican
  { x: -398, z: -238 }, // 1: Rovalt
  { x: -378, z: -162 }, // 2: Ocs Hall
  { x: -412, z: -148 }, // 3: Pravend Bridge
  { x: -438, z: -122 }, // 4: Pravend
  { x: -395, z: -32 },  // 5: Jaculan Bridge
  { x: -425, z: 12 },   // 6: Jaculan
  { x: -358, z: 28 },   // 7: Sargot
  { x: -388, z: 92 },   // 8: Charas
  { x: -315, z: -192 }, // 9: Car Banseth
  { x: -298, z: -142 }, // 10: Dunglanys (North of Battania Lake)
  { x: -298, z: -85 },  // 11: Pen Cannoc (South of Battania Lake)
  { x: -225, z: -132 }, // 12: Seonon
  { x: -258, z: -68 },  // 13: Marunath
  // Sturgia Peninsula & Gulf of Omor / Varnovapol Fjord corridors
  { x: -262, z: -278 }, // 14: Revyl
  { x: -175, z: -245 }, // 15: Varcheg Neck
  { x: -178, z: -158 }, // 16: Southwest of Gulf of Varcheg
  { x: -125, z: -125 }, // 17: Epicrotea (South of Gulf of Omor)
  { x: -55, z: -128 },  // 18: Diathma (Southeast of Gulf of Omor)
  { x: -58, z: -192 },  // 19: Omor (East shore of Gulf of Omor)
  { x: -42, z: -262 },  // 20: Balgard (West of Varnovapol Fjord)
  { x: -8, z: -175 },   // 21: South of Varnovapol Fjord
  { x: 38, z: -158 },   // 22: Argoron
  { x: 48, z: -228 },   // 23: Varnovapol (East of Fjord)
  { x: 68, z: -285 },   // 24: Sibir
  { x: 188, z: -265 },  // 25: Tyal
  // Central Empire & Bridges
  { x: -218, z: -5 },   // 26: Lageta
  { x: -176, z: 2 },    // 27: Rhotae Bridge
  { x: -132, z: 2 },    // 28: Rhotae
  { x: -145, z: 86 },   // 29: Jalmarys
  { x: -68, z: 56 },    // 30: Amitatys
  { x: 18, z: -58 },    // 31: Saneopa
  { x: 128, z: -52 },   // 32: Myzea
  { x: 148, z: -128 },  // 33: Amprela (West of Khuzait Lake)
  { x: 175, z: -4 },    // 34: Syronea (Southwest of Khuzait Lake)
  { x: 24, z: 78 },     // 35: Lycaron
  { x: 92, z: 62 },     // 36: Phycaon
  { x: 178, z: 88 },    // 37: Onira (South of Khuzait Lake)
  // Khuzait Lake North & South Land Passes
  { x: 175, z: -185 },  // 38: Northwest of Khuzait Lake
  { x: 228, z: -242 },  // 39: North tip of Khuzait Lake (Makeb North Pass)
  { x: 248, z: -125 },  // 40: Makeb (East of Khuzait Lake)
  { x: 292, z: -225 },  // 41: Baltakhand
  { x: 318, z: -78 },   // 42: Ortongard
  { x: 252, z: -48 },   // 43: Chaikand (East of Khuzait Lake)
  { x: 245, z: 32 },    // 44: Southeast of Khuzait Lake (South Lake Pass)
  { x: 292, z: 25 },    // 45: Akkalat
  { x: 322, z: 88 },    // 46: Odokh
  // Perassic Sea North Shore, Western Ortysia-Quyaz Strait Bridge & Eastern Danustica-Husn Fulq Isthmus
  { x: -232, z: 102 },  // 47: Ortysia (North entrance of Western Strait)
  { x: -232, z: 152 },  // 48: Ortysia-Quyaz Strait Causeway Center
  { x: -232, z: 202 },  // 49: Quyaz (South entrance of Western Strait)
  { x: -105, z: 138 },  // 50: Zeonica (North shore of Perassic Sea)
  { x: -18, z: 142 },   // 51: Poros (North shore of Perassic Sea)
  { x: 51, z: 152 },    // 52: Vostrum Bridge
  { x: 88, z: 162 },    // 53: Vostrum (North shore of Perassic Sea)
  { x: 205, z: 158 },   // 54: Danustica (North of Eastern Isthmus)
  { x: 215, z: 188 },   // 55: Danustica-Husn Fulq Eastern Isthmus Pass
  { x: 225, z: 218 },   // 56: Husn Fulq (South of Eastern Isthmus)
  // Aserai Southern Coast (South of Perassic Sea)
  { x: -108, z: 248 },  // 57: Sanala
  { x: 2, z: 268 },     // 58: Qasira
  { x: 122, z: 262 },   // 59: Razih
];

// Precompute adjacency list between LAND_NAV_NODES that have clear land segments
const NAV_ADJACENCY: number[][] = LAND_NAV_NODES.map(() => []);
for (let i = 0; i < LAND_NAV_NODES.length; i++) {
  for (let j = i + 1; j < LAND_NAV_NODES.length; j++) {
    const a = LAND_NAV_NODES[i];
    const b = LAND_NAV_NODES[j];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= 165 && isLandSegmentClear(a.x, a.z, b.x, b.z)) {
      NAV_ADJACENCY[i].push(j);
      NAV_ADJACENCY[j].push(i);
    }
  }
}

// Compute a multi-waypoint dry-land path from (startX, startZ) to (destX, destZ)
// Never crosses seas, oceans, gulfs, or lakes!
export function computeLandPath(
  startX: number,
  startZ: number,
  rawDestX: number,
  rawDestZ: number,
): NavPoint[] {
  const start = snapToNearestLand(startX, startZ);
  const dest = snapToNearestLand(rawDestX, rawDestZ);

  // Fast path: if direct line stays 100% on navigable land, return direct destination
  if (isLandSegmentClear(start.x, start.z, dest.x, dest.z)) {
    return [dest];
  }

  // Otherwise run A* over LAND_NAV_NODES + start (index N) + dest (index N+1)
  const N = LAND_NAV_NODES.length;
  const startIdx = N;
  const destIdx = N + 1;
  const allNodes: NavPoint[] = [...LAND_NAV_NODES, start, dest];

  const findVisibleNodes = (pt: NavPoint): number[] => {
    const visible: Array<{ idx: number; dist: number }> = [];
    for (let i = 0; i < N; i++) {
      const n = LAND_NAV_NODES[i];
      const d = Math.hypot(n.x - pt.x, n.z - pt.z);
      if (d <= 190 && isLandSegmentClear(pt.x, pt.z, n.x, n.z)) {
        visible.push({ idx: i, dist: d });
      }
    }
    if (visible.length > 0) {
      return visible.map((v) => v.idx);
    }
    // Fallback to closest 3 nodes by Euclidean distance
    return LAND_NAV_NODES.map((n, idx) => ({
      idx,
      dist: Math.hypot(n.x - pt.x, n.z - pt.z),
    }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
      .map((v) => v.idx);
  };

  const startNeighbors = findVisibleNodes(start);
  const destNeighbors = new Set(findVisibleNodes(dest));

  const gScore = new Float64Array(N + 2).fill(Infinity);
  const fScore = new Float64Array(N + 2).fill(Infinity);
  const cameFrom = new Int32Array(N + 2).fill(-1);
  const openSet = new Set<number>([startIdx]);
  const closedSet = new Set<number>();

  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(dest.x - start.x, dest.z - start.z);

  while (openSet.size > 0) {
    let current = -1;
    let bestF = Infinity;
    openSet.forEach((idx) => {
      if (fScore[idx] < bestF) {
        bestF = fScore[idx];
        current = idx;
      }
    });

    if (current === -1 || current === destIdx) {
      break;
    }

    openSet.delete(current);
    closedSet.add(current);

    const neighbors: number[] = [];
    if (current === startIdx) {
      neighbors.push(...startNeighbors);
    } else if (current < N) {
      neighbors.push(...NAV_ADJACENCY[current]);
      if (destNeighbors.has(current)) {
        neighbors.push(destIdx);
      }
    }

    const curPt = allNodes[current];
    for (let i = 0; i < neighbors.length; i++) {
      const nb = neighbors[i];
      if (closedSet.has(nb)) continue;
      const nbPt = allNodes[nb];
      const tentativeG = gScore[current] + Math.hypot(nbPt.x - curPt.x, nbPt.z - curPt.z);
      if (tentativeG < gScore[nb]) {
        cameFrom[nb] = current;
        gScore[nb] = tentativeG;
        fScore[nb] = tentativeG + Math.hypot(dest.x - nbPt.x, dest.z - nbPt.z);
        openSet.add(nb);
      }
    }
  }

  // Reconstruct waypoint list
  if (cameFrom[destIdx] !== -1) {
    const rawPath: NavPoint[] = [];
    let cur = destIdx;
    while (cur !== -1 && cur !== startIdx) {
      rawPath.push(allNodes[cur]);
      cur = cameFrom[cur];
    }
    rawPath.reverse();

    // String-pull / smooth redundant intermediate waypoints where direct land line is clear
    const smoothed: NavPoint[] = [];
    let anchor = start;
    let i = 0;
    while (i < rawPath.length) {
      let furthest = i;
      for (let j = rawPath.length - 1; j > i; j--) {
        if (isLandSegmentClear(anchor.x, anchor.z, rawPath[j].x, rawPath[j].z)) {
          furthest = j;
          break;
        }
      }
      smoothed.push(rawPath[furthest]);
      anchor = rawPath[furthest];
      i = furthest + 1;
    }
    return smoothed;
  }

  return [dest];
}

// Advance an agent (Player or Lord) toward (targetX, targetZ) by up to maxStep while strictly preventing water entry
export function stepAlongLandOnly(
  curX: number,
  curZ: number,
  targetX: number,
  targetZ: number,
  maxStep: number,
): { x: number; z: number; facing: number; blocked: boolean } {
  const dx = targetX - curX;
  const dz = targetZ - curZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) {
    return { x: curX, z: curZ, facing: 0, blocked: false };
  }

  const step = Math.min(dist, maxStep);
  const nx = curX + (dx / dist) * step;
  const nz = curZ + (dz / dist) * step;

  if (isNavigableLandAt(nx, nz)) {
    return { x: nx, z: nz, facing: Math.atan2(dx, dz), blocked: false };
  }

  // Try sliding along coastal tangent angles if the direct step touches a shoreline
  const baseAngle = Math.atan2(dz, dx);
  const angleOffsets = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4];
  for (let i = 0; i < angleOffsets.length; i++) {
    const ang = baseAngle + angleOffsets[i];
    const tx = curX + Math.cos(ang) * step * 0.85;
    const tz = curZ + Math.sin(ang) * step * 0.85;
    if (isNavigableLandAt(tx, tz)) {
      return {
        x: tx,
        z: tz,
        facing: Math.atan2(tx - curX, tz - curZ),
        blocked: false,
      };
    }
  }

  // Blocked by water
  const safe = snapToNearestLand(curX, curZ);
  return { x: safe.x, z: safe.z, facing: Math.atan2(dx, dz), blocked: true };
}

export const stepAlongLand = stepAlongLandOnly;

// Compute a guaranteed dry-land patrol position around a Lord's home coordinate
export function computeLordPatrolPos(
  homeX: number,
  homeZ: number,
  patrolAngle: number,
  radius = 7.2,
): NavPoint {
  const candidateRadii = [radius, radius * 0.65, radius * 0.35];
  for (let rIdx = 0; rIdx < candidateRadii.length; rIdx++) {
    const r = candidateRadii[rIdx];
    for (let a = 0; a < 8; a++) {
      const ang = patrolAngle + (a * Math.PI) / 4;
      const cx = homeX + Math.cos(ang) * r;
      const cz = homeZ + Math.sin(ang) * r;
      if (isNavigableLandAt(cx, cz) && groundHeightAt(cx, cz) >= 0.35) {
        return { x: cx, z: cz };
      }
    }
  }
  return snapToNearestLand(homeX, homeZ);
}

// Helper for getting visual ground elevation of a party on land or on a bridge deck
export function getNavigableSurfaceHeightAt(x: number, z: number): number {
  for (let i = 0; i < CONTINENTAL_BRIDGES.length; i++) {
    const b = CONTINENTAL_BRIDGES[i];
    const d = Math.hypot(x - b.x, z - b.z);
    if (d <= b.length * 0.55) {
      return Math.max(1.85, groundHeightAt(x, z));
    }
  }
  return Math.max(0.15, groundHeightAt(x, z));
}
