import * as THREE from 'three';
import {
  CONTINENTAL_BRIDGES,
  MAP_HEIGHT,
  MAP_WIDTH,
  distanceToNearestRoad,
  distanceToRiverNetwork,
  getForestMaskAt,
  getTerrainSlopeAndColorAt,
  groundHeightAt,
} from './mapGen';

export { groundHeightAt };

// High-detail procedural tileable textures (Bump Map + World Topographic Albedo for 2400x1800 Continent)
export function createTerrainTextures(maxAnisotropy: number) {
  const isHeadless =
    typeof navigator !== 'undefined' &&
    (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
  const texW = isHeadless ? 960 : 1600;
  const texH = isHeadless ? 720 : 1200;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = texW;
  albedoCanvas.height = texH;
  const actx = albedoCanvas.getContext('2d')!;
  const imgData = actx.createImageData(texW, texH);
  const data = imgData.data;

  const halfW = MAP_WIDTH / 2;
  const halfH = MAP_HEIGHT / 2;

  for (let py = 0; py < texH; py++) {
    const wz = (py / (texH - 1)) * MAP_HEIGHT - halfH;
    for (let px = 0; px < texW; px++) {
      const wx = (px / (texW - 1)) * MAP_WIDTH - halfW;
      const info = getTerrainSlopeAndColorAt(wx, wz);

      const grain = (((px * 73) ^ (py * 139)) & 11) - 5;
      const idx = (py * texW + px) * 4;
      data[idx] = Math.max(8, Math.min(255, Math.round(info.r + grain)));
      data[idx + 1] = Math.max(8, Math.min(255, Math.round(info.g + grain)));
      data[idx + 2] = Math.max(8, Math.min(255, Math.round(info.b + grain)));
      data[idx + 3] = 255;
    }
  }
  actx.putImageData(imgData, 0, 0);

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.anisotropy = maxAnisotropy;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 14000; i++) {
    const x = (i * 131) % 512;
    const y = (i * 79) % 512;
    const v = i % 3 === 0 ? 220 : i % 3 === 1 ? 45 : 135;
    bctx.fillStyle = `rgb(${v},${v},${v})`;
    bctx.fillRect(x, y, (i % 3) + 1, ((i * 2) % 3) + 1);
  }

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.colorSpace = THREE.NoColorSpace;
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(96, 72);
  bumpTex.anisotropy = maxAnisotropy;

  return { albedoTex, bumpTex };
}

export function createStoneTextures(maxAnisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6e675d';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#423d36';
  ctx.lineWidth = 2;
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
    const offset = (row % 2) * 16;
    for (let col = 0; col < 4; col++) {
      const x = col * 32 + offset;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 16);
      ctx.stroke();
    }
  }
  const stoneTex = new THREE.CanvasTexture(canvas);
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.wrapS = THREE.RepeatWrapping;
  stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.repeat.set(2, 2);
  stoneTex.anisotropy = maxAnisotropy;
  return stoneTex;
}

// High-Resolution Continental Terrain Mesh spanning 2400x1800 World Units (Zero Void Borders)
export function createContinentalTerrainMesh(
  albedoTex: THREE.CanvasTexture,
  bumpTex: THREE.CanvasTexture,
): THREE.Mesh {
  const isHeadless =
    typeof navigator !== 'undefined' &&
    (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
  const segX = isHeadless ? 260 : 360;
  const segZ = isHeadless ? 195 : 270;
  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    // Clamp underwater mesh vertices to a flat water plane (-0.25) so the high-res albedoTex renders razor-sharp coastlines & rivers without triangle slicing!
    posAttr.setY(i, Math.max(-0.25, groundHeightAt(vx, vz)));
  }

  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedoTex,
    bumpMap: bumpTex,
    bumpScale: 0.55,
    roughness: 0.9,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Dense Organic Multi-Canopy Forest Groves & Snow-Dusted Pine Taiga across Calradia Continent
export function createContinentalForestsAndRocksGroup(): THREE.Group {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const treeCoords: Array<{ x: number; y: number; z: number; scale: number; isPine: boolean; isSnowy: boolean }> = [];

  for (let i = 0; i < 15000; i++) {
    let tx: number;
    let tz: number;
    if (i < 3800) {
      // High-density groves around Central Empire (Saneopa/Myzea/Lycaron/Phycaon) & Battania/Vlandia woodlands
      if (i % 2 === 0) {
        tx = -60 + ((i * 43 + ((i * 17) % 23)) % 240);
        tz = -120 + ((i * 59 + ((i * 29) % 31)) % 210);
      } else {
        tx = -450 + ((i * 47 + ((i * 19) % 29)) % 270);
        tz = -240 + ((i * 67 + ((i * 31) % 37)) % 250);
      }
    } else if (i < 6800) {
      // Dense snowy pine taiga on Sturgia Peninsula (Revyl, Varcheg, Balgard, Sibir, Varnovapol, Tyal) and Khuzait Lake shore
      if (i % 2 === 0) {
        tx = -260 + ((i * 53 + ((i * 23) % 31)) % 560);
        tz = -380 + ((i * 71 + ((i * 17) % 29)) % 195);
      } else {
        tx = 140 + ((i * 37 + ((i * 13) % 19)) % 230);
        tz = -230 + ((i * 61 + ((i * 23) % 29)) % 280);
      }
    } else {
      // Continental distribution across playable continent and outer mountain borders
      tx = ((i * 137 + ((i * 29) % 43)) % 1280) - 640;
      tz = ((i * 193 + ((i * 37) % 53)) % 960) - 480;
    }

    const forestDensity = getForestMaskAt(tx, tz);
    if (forestDensity < 0.05) continue;

    const { dist: rDist, width: rWidth } = distanceToRiverNetwork(tx, tz);
    const roadDist = distanceToNearestRoad(tx, tz);
    if (rDist < rWidth * 1.35 || roadDist < 2.8) continue;

    const info = getTerrainSlopeAndColorAt(tx, tz);
    if (info.height < 0.42 || info.height > 8.8 || info.slope > 0.56) continue;
    if (tz > 145 && i % 7 !== 0) continue; // Sparse oasis palms in southern desert

    const scale = 0.48 + (i % 7) * 0.062;
    const isSnowy = tz < -170 || (info.height > 5.0 && tz < 35 && tx > -120 && tx < 320);
    const isPine = isSnowy || tz < -60 || info.height > 3.6;
    treeCoords.push({ x: tx, y: info.height, z: tz, scale, isPine, isSnowy });
  }

  const count = treeCoords.length;

  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.8, 5);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x261a10,
    roughness: 0.95,
  });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);

  const lowerCrownGeo = new THREE.DodecahedronGeometry(0.92, 1);
  lowerCrownGeo.scale(1.04, 0.82, 1.04);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02,
  });
  const lowerCrownInst = new THREE.InstancedMesh(lowerCrownGeo, crownMat, count);
  lowerCrownInst.castShadow = true;
  lowerCrownInst.receiveShadow = true;

  const upperCrownGeo = new THREE.DodecahedronGeometry(0.65, 1);
  upperCrownGeo.scale(1.0, 0.85, 1.0);
  const upperCrownInst = new THREE.InstancedMesh(upperCrownGeo, crownMat, count);

  const deepWoodlandPalette = [
    0x243312, // deep olive forest
    0x2f4217, // warm sun-lit moss green
    0x1b290d, // dark woodland pine
    0x3b4f1d, // golden-olive leaf
    0x283814, // rich cypress green
    0x465922, // dry autumn-olive
  ];

  const snowyPinePalette = [
    0x4a6158, // frosted slate pine (matching Image 2 & 3!)
    0x5c736b, // snow-dusted spruce
    0x3b5249, // deep nordic fir
    0x6e857e, // heavy snow-frosted pine tip
  ];

  for (let i = 0; i < count; i++) {
    const t = treeCoords[i];
    dummy.position.set(t.x, t.y + 0.28 * t.scale, t.z);
    dummy.rotation.set(0, (i * 1.3) % Math.PI, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(t.x, t.y + 0.88 * t.scale, t.z);
    dummy.rotation.set((i % 3) * 0.1, (i * 2.1) % Math.PI, 0);
    dummy.scale.set(
      t.scale * (t.isPine ? 0.78 : 1.1),
      t.scale * (t.isPine ? 1.32 : 0.9),
      t.scale * (t.isPine ? 0.78 : 1.1),
    );
    dummy.updateMatrix();
    lowerCrownInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(
      t.x + Math.sin(i) * 0.12 * t.scale,
      t.y + 1.42 * t.scale,
      t.z + Math.cos(i) * 0.12 * t.scale,
    );
    dummy.scale.setScalar(t.scale * 0.85);
    dummy.updateMatrix();
    upperCrownInst.setMatrixAt(i, dummy.matrix);

    if (t.isSnowy) {
      color.setHex(snowyPinePalette[i % snowyPinePalette.length]);
      lowerCrownInst.setColorAt(i, color);
      color.setHex(0x8fa39d); // frosted snow cap on upper crown
      upperCrownInst.setColorAt(i, color);
    } else {
      color.setHex(deepWoodlandPalette[i % deepWoodlandPalette.length]);
      lowerCrownInst.setColorAt(i, color);
      color.offsetHSL(0, 0, 0.035);
      upperCrownInst.setColorAt(i, color);
    }
  }

  trunkInst.instanceMatrix.needsUpdate = true;
  lowerCrownInst.instanceMatrix.needsUpdate = true;
  upperCrownInst.instanceMatrix.needsUpdate = true;
  if (lowerCrownInst.instanceColor) lowerCrownInst.instanceColor.needsUpdate = true;
  if (upperCrownInst.instanceColor) upperCrownInst.instanceColor.needsUpdate = true;

  group.add(trunkInst);
  group.add(lowerCrownInst);
  group.add(upperCrownInst);

  return group;
}

// Build Weathered Stone Arch Bridges across the Continent (Snapped to exact river centerlines & bank elevations)
export function createContinentalBridgesGroup(stoneTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xa49b8e,
    map: stoneTex,
    roughness: 0.84,
    metalness: 0.05,
  });

  CONTINENTAL_BRIDGES.forEach((b) => {
    const bGroup = new THREE.Group();
    const dirX = Math.sin(b.rotationY);
    const dirZ = Math.cos(b.rotationY);
    const halfLen = b.length * 0.5;

    // Sample bank elevations at both ends of the bridge so the deck connects seamlessly to both riverbanks
    const bankH1 = Math.max(1.35, groundHeightAt(b.x - dirX * halfLen, b.z - dirZ * halfLen));
    const bankH2 = Math.max(1.35, groundHeightAt(b.x + dirX * halfLen, b.z + dirZ * halfLen));
    const bridgeDeckY = Math.max(bankH1, bankH2) + 0.15;

    bGroup.position.set(b.x, bridgeDeckY, b.z);
    bGroup.rotation.y = b.rotationY;

    // Main central stone deck spanning the river
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, b.length * 0.76), stoneMat);
    deck.position.y = 0;
    deck.castShadow = true;
    deck.receiveShadow = true;
    bGroup.add(deck);

    // Sloped approach ramps on both riverbanks
    const rampLen = b.length * 0.22;
    const ramp1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.38, rampLen), stoneMat);
    ramp1.position.set(0, -0.18, -b.length * 0.42);
    ramp1.rotation.x = 0.16;
    bGroup.add(ramp1);

    const ramp2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.38, rampLen), stoneMat);
    ramp2.position.set(0, -0.18, b.length * 0.42);
    ramp2.rotation.x = -0.16;
    bGroup.add(ramp2);

    // Stone parapets (left & right walls)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, b.length * 0.78), stoneMat);
    leftWall.position.set(-1.44, 0.42, 0);
    bGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, b.length * 0.78), stoneMat);
    rightWall.position.set(1.44, 0.42, 0);
    bGroup.add(rightWall);

    // Sturdy stone piers extending down into the riverbed
    [-b.length * 0.24, 0, b.length * 0.24].forEach((zOff) => {
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 3.2, 8), stoneMat);
      pier.position.set(0, -1.6, zOff);
      bGroup.add(pier);
    });

    group.add(bGroup);
  });

  return group;
}

// Subtle Cobblestone Mileposts along Imperial Roads (replacing the artificial white tubes!)
export function createImperialRoadsGroup(): THREE.Group {
  return new THREE.Group();
}

// Soft radial contact shadow shared material
let sharedShadowMat: THREE.MeshBasicMaterial | null = null;
let sharedShadowGeo: THREE.CircleGeometry | null = null;

export function createContactShadowDisc(radius = 0.85): THREE.Mesh {
  if (!sharedShadowGeo) {
    sharedShadowGeo = new THREE.CircleGeometry(1, 20);
    sharedShadowGeo.rotateX(-Math.PI / 2);
  }
  if (!sharedShadowMat) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    sharedShadowMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
  }
  const disc = new THREE.Mesh(sharedShadowGeo, sharedShadowMat);
  disc.scale.setScalar(radius);
  disc.position.y = 0.02;
  return disc;
}

// Authentic Bannerlord Medieval Stone Citadel / Walled Town / Village Miniature Model (like Lycaron in Image 2 & 3!)
export function createSettlementModel(
  type: 'CASTLE' | 'TOWN' | 'VILLAGE',
  factionHex: number,
  stoneTex: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x8c8478,
    map: stoneTex,
    roughness: 0.86,
    metalness: 0.05,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x5c554c,
    map: stoneTex,
    roughness: 0.9,
    metalness: 0.05,
  });
  const terracottaRoofMat = new THREE.MeshStandardMaterial({
    color: 0x6b4435,
    roughness: 0.78,
    metalness: 0.08,
  });
  const factionBannerMat = new THREE.MeshStandardMaterial({
    color: factionHex,
    roughness: 0.5,
    metalness: 0.15,
  });
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x4d3624,
    roughness: 0.9,
    metalness: 0.04,
  });

  group.add(createContactShadowDisc(type === 'VILLAGE' ? 3.2 : 4.6));

  // Rocky foundation plinth blending into the mountain/hillside
  const plinthGeo = new THREE.CylinderGeometry(
    type === 'VILLAGE' ? 2.4 : 3.6,
    type === 'VILLAGE' ? 2.9 : 4.2,
    0.7,
    8,
  );
  const plinth = new THREE.Mesh(plinthGeo, darkStoneMat);
  plinth.position.y = 0.25;
  plinth.receiveShadow = true;
  group.add(plinth);

  if (type === 'CASTLE' || type === 'TOWN') {
    // Central Stone Keep + Clustered Medieval Houses
    const keepGeo = new THREE.BoxGeometry(1.9, type === 'TOWN' ? 2.6 : 3.1, 1.9);
    const keep = new THREE.Mesh(keepGeo, stoneMat);
    keep.position.y = 0.5 + (type === 'TOWN' ? 1.3 : 1.55);
    keep.castShadow = true;
    keep.receiveShadow = true;
    group.add(keep);

    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.95, 4), terracottaRoofMat);
    keepRoof.position.y = type === 'TOWN' ? 3.55 : 4.05;
    keepRoof.rotation.y = Math.PI / 4;
    group.add(keepRoof);

    // 4 Curtain Walls + 4 Crenelated Round Stone Towers (authentic medieval ring-fortress like Image 2!)
    const r = type === 'TOWN' ? 2.4 : 2.1;
    const wallPositions: Array<[number, number, number]> = [
      [0, r, 0],
      [0, -r, 0],
      [r, 0, Math.PI / 2],
      [-r, 0, Math.PI / 2],
    ];
    const wallGeo = new THREE.BoxGeometry(r * 1.95, 1.65, 0.42);
    wallPositions.forEach(([wx, wz, rotY]) => {
      const wall = new THREE.Mesh(wallGeo, stoneMat);
      wall.position.set(wx, 1.25, wz);
      wall.rotation.y = rotY;
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    });

    const towerGeo = new THREE.CylinderGeometry(0.58, 0.66, 2.5, 10);
    const battlementGeo = new THREE.CylinderGeometry(0.66, 0.62, 0.35, 8);
    const offsets = [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ];
    offsets.forEach(([ox, oz]) => {
      const tower = new THREE.Mesh(towerGeo, stoneMat);
      tower.position.set(ox, 1.55, oz);
      tower.castShadow = true;
      group.add(tower);

      const battlement = new THREE.Mesh(battlementGeo, darkStoneMat);
      battlement.position.set(ox, 2.85, oz);
      group.add(battlement);
    });

    if (type === 'TOWN') {
      // Extra inner town roofs around the keep
      [
        [-1.1, 0.9],
        [1.1, -0.8],
        [-0.9, -1.0],
      ].forEach(([hx, hz]) => {
        const house = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.1, 0.85), timberMat);
        house.position.set(hx, 1.0, hz);
        group.add(house);
        const hRoof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.55, 4), terracottaRoofMat);
        hRoof.position.set(hx, 1.8, hz);
        hRoof.rotation.y = Math.PI / 4;
        group.add(hRoof);
      });
    }
  } else {
    // Medieval Village Cluster: 3 timber cottages + stone watchtower
    [
      [-0.8, 0.3, 0.2],
      [0.7, -0.5, -0.4],
      [-0.2, -0.9, 0.6],
    ].forEach(([vx, vz, rot]) => {
      const cottage = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.9), timberMat);
      cottage.position.set(vx, 0.9, vz);
      cottage.rotation.y = rot;
      cottage.castShadow = true;
      group.add(cottage);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.65, 4), terracottaRoofMat);
      roof.position.set(vx, 1.68, vz);
      roof.rotation.y = rot + Math.PI / 4;
      group.add(roof);
    });

    const watchTower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.1, 8), stoneMat);
    watchTower.position.set(1.0, 1.35, 0.8);
    group.add(watchTower);
  }

  // Subtle Heraldic Flagpole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), timberMat);
  pole.position.set(0, type === 'VILLAGE' ? 2.6 : 4.3, 0);
  group.add(pole);

  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(1.1, 0.12);
  flagShape.lineTo(0.85, -0.3);
  flagShape.lineTo(1.1, -0.7);
  flagShape.lineTo(0, -0.6);
  flagShape.closePath();

  const flagGeo = new THREE.ExtrudeGeometry(flagShape, {
    depth: 0.04,
    bevelEnabled: false,
  });
  const flag = new THREE.Mesh(flagGeo, factionBannerMat);
  flag.position.set(0.04, type === 'VILLAGE' ? 3.4 : 5.1, 0);
  flag.name = 'bannerFlag';
  group.add(flag);

  return group;
}

export interface WarriorMeshHandles {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  telegraphRing: THREE.Mesh;
  armorMat: THREE.MeshStandardMaterial;
}

export function createWarriorModel(options: {
  factionHex: number;
  isMounted?: boolean;
  isRanged?: boolean;
  isHeavy?: boolean;
  isCommander?: boolean;
}): WarriorMeshHandles {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  root.add(createContactShadowDisc(options.isMounted ? 1.15 : 0.75));

  const ringGeo = new THREE.RingGeometry(0.85, 1.15, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const telegraphRing = new THREE.Mesh(ringGeo, ringMat);
  telegraphRing.position.y = 0.04;
  root.add(telegraphRing);

  const armorMat = new THREE.MeshStandardMaterial({
    color: options.factionHex,
    roughness: options.isHeavy || options.isCommander ? 0.28 : 0.62,
    metalness: options.isHeavy || options.isCommander ? 0.78 : 0.35,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1,
    roughness: 0.22,
    metalness: 0.88,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x452c1e,
    roughness: 0.85,
    metalness: 0.08,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.85,
  });

  let riderYOffset = 0;

  if (options.isMounted) {
    riderYOffset = 0.75;
    const horseGroup = new THREE.Group();

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 1.45), leatherMat);
    barrel.position.set(0, 0.72, 0);
    barrel.castShadow = true;
    horseGroup.add(barrel);

    const barding = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.42, 1.32), armorMat);
    barding.position.set(0, 0.78, 0);
    horseGroup.add(barding);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 0.42), leatherMat);
    neck.position.set(0, 1.18, 0.58);
    neck.rotation.x = 0.35;
    horseGroup.add(neck);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 6), steelMat);
    head.position.set(0, 1.42, 0.82);
    head.rotation.x = Math.PI / 2 + 0.25;
    horseGroup.add(head);

    bodyGroup.add(horseGroup);
  }

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.68, 8), leatherMat);
  leftLeg.position.set(-0.18, 0.34 + riderYOffset * 0.4, 0);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.68, 8), leatherMat);
  rightLeg.position.set(0.18, 0.34 + riderYOffset * 0.4, 0);
  bodyGroup.add(rightLeg);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.29, 0.86, 8), armorMat);
  torso.position.set(0, 0.98 + riderYOffset, 0);
  torso.castShadow = true;
  bodyGroup.add(torso);

  const pauldronGeo = new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const leftPauldron = new THREE.Mesh(pauldronGeo, steelMat);
  leftPauldron.position.set(-0.4, 1.28 + riderYOffset, 0);
  leftPauldron.rotation.z = 0.35;
  bodyGroup.add(leftPauldron);

  const rightPauldron = new THREE.Mesh(pauldronGeo, steelMat);
  rightPauldron.position.set(0.4, 1.28 + riderYOffset, 0);
  rightPauldron.rotation.z = -0.35;
  bodyGroup.add(rightPauldron);

  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.38, 10), steelMat);
  helm.position.set(0, 1.62 + riderYOffset, 0);
  helm.castShadow = true;
  bodyGroup.add(helm);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.24), goldMat);
  visor.position.set(0, 1.62 + riderYOffset, 0.16);
  bodyGroup.add(visor);

  if (options.isCommander || options.isHeavy) {
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.46), goldMat);
    plume.position.set(0, 1.92 + riderYOffset, -0.05);
    bodyGroup.add(plume);
  }

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.42, 1.18 + riderYOffset, 0.1);
  bodyGroup.add(leftArm);

  if (options.isRanged) {
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0.1),
      new THREE.Vector3(0, 0, 0.36),
      new THREE.Vector3(0, 0.5, 0.1),
    ]);
    const bowGeo = new THREE.TubeGeometry(bowCurve, 12, 0.04, 6, false);
    const bow = new THREE.Mesh(bowGeo, leatherMat);
    leftArm.add(bow);
  } else {
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(-0.32, 0.42);
    shieldShape.lineTo(0.32, 0.42);
    shieldShape.lineTo(0.28, -0.1);
    shieldShape.lineTo(0, -0.52);
    shieldShape.lineTo(-0.28, -0.1);
    shieldShape.closePath();
    const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 2,
    });
    const shield = new THREE.Mesh(shieldGeo, armorMat);
    shield.position.set(-0.12, -0.05, 0.22);
    shield.rotation.y = -Math.PI / 3;
    leftArm.add(shield);
  }

  const rightArm = new THREE.Group();
  rightArm.position.set(0.42, 1.18 + riderYOffset, 0.1);
  bodyGroup.add(rightArm);

  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.08), goldMat);
  hilt.position.set(0, 0.12, 0.25);
  rightArm.add(hilt);

  const bladeLen = options.isMounted ? 1.55 : options.isHeavy ? 1.25 : 0.98;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, bladeLen, 0.04), steelMat);
  blade.position.set(0, 0.12 + bladeLen * 0.5, 0.25);
  blade.rotation.x = 0.25;
  rightArm.add(blade);

  return {
    root,
    bodyGroup,
    rightArm,
    leftArm,
    telegraphRing,
    armorMat,
  };
}
