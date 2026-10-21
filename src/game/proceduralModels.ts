import * as THREE from 'three';
import {
  CONTINENTAL_BRIDGES,
  MAP_HEIGHT,
  MAP_WIDTH,
  SETTLEMENT_TERRACES,
  distanceToNearestRoad,
  distanceToRiverNetwork,
  fbm2D,
  getForestMaskAt,
  getTerrainSlopeAndColorAt,
  groundHeightAt,
  valueNoise2D,
} from './mapGen';

export { groundHeightAt };

// High-detail procedural tileable textures (Macro Topographic Albedo + Micro-Detail Splat Texture + Bump Map)
export function createTerrainTextures(maxAnisotropy: number) {
  const isHeadless =
    typeof navigator !== 'undefined' &&
    (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
  const texW = isHeadless ? 768 : 1440;
  const texH = isHeadless ? 576 : 1080;
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

      // Clean, smooth macro topographic color (NO coarse texel XOR grain that looks pixelated up close!)
      const idx = (py * texW + px) * 4;
      data[idx] = Math.max(8, Math.min(255, Math.round(info.r)));
      data[idx + 1] = Math.max(8, Math.min(255, Math.round(info.g)));
      data[idx + 2] = Math.max(8, Math.min(255, Math.round(info.b)));
      data[idx + 3] = 255;
    }
  }
  actx.putImageData(imgData, 0, 0);

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.anisotropy = maxAnisotropy;
  albedoTex.minFilter = THREE.LinearMipmapLinearFilter;
  albedoTex.magFilter = THREE.LinearFilter;
  albedoTex.generateMipmaps = true;

  // High-frequency seamless Micro-Detail & Bump Canvas (512x512):
  // - R channel: Organic grass blades & soil clumps
  // - G channel: Sharp mountain rock strata & cliff fissures
  // - B channel: Fine pebbles, sand ripples & micro-relief
  const detailSize = 512;
  const detailCanvas = document.createElement('canvas');
  detailCanvas.width = detailSize;
  detailCanvas.height = detailSize;
  const dctx = detailCanvas.getContext('2d')!;
  const dImg = dctx.createImageData(detailSize, detailSize);
  const dData = dImg.data;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = detailSize;
  bumpCanvas.height = detailSize;
  const bctx = bumpCanvas.getContext('2d')!;
  const bImg = bctx.createImageData(detailSize, detailSize);
  const bData = bImg.data;

  const twoPi = Math.PI * 2;
  for (let y = 0; y < detailSize; y++) {
    const ny = y / detailSize;
    const radY = ny * twoPi;
    for (let x = 0; x < detailSize; x++) {
      const nx = x / detailSize;
      const radX = nx * twoPi;

      // Seamless tileable periodic coordinates
      const sx = Math.cos(radX) * 6.0 + Math.sin(radX) * 6.0;
      const sy = Math.cos(radY) * 6.0 + Math.sin(radY) * 6.0;

      // 1. Grass & soil turf multi-octave pattern (R) - Full [8..248] dynamic range for crisp close-up contrast
      const turf1 = Math.sin(radX * 5 + Math.cos(radY * 4) * 1.9) * Math.cos(radY * 5 - Math.sin(radX * 5) * 1.9);
      const turf2 = Math.sin(radX * 13 + radY * 11 + turf1 * 2.4) * 0.55 + Math.cos(radX * 23 - radY * 19) * 0.45;
      const turf3 = Math.sin(radX * 37 - radY * 29 + turf2 * 1.8);
      const fineHash = (((x * 131 + y * 197) ^ (x * 73 - y * 89)) & 127) / 127.0 - 0.5;
      const grassSoilVal = Math.max(
        6,
        Math.min(250, Math.round(128 + turf1 * 56 + turf2 * 48 + turf3 * 28 + fineHash * 42)),
      );

      // 2. Sharp ridged rock strata & cliff fractures (G) - Crisp chiseled ridge creases
      const strataWave = Math.sin(radY * 9 + Math.sin(radX * 4) * 2.6 + turf1 * 1.5);
      const ridgeCrease1 = 1.0 - Math.abs(Math.sin(radX * 11 - radY * 8 + strataWave * 1.8)) * 2.0;
      const ridgeCrease2 = 1.0 - Math.abs(Math.cos(radX * 23 + radY * 17 - strataWave * 1.4)) * 2.0;
      const rockVal = Math.max(
        4,
        Math.min(
          252,
          Math.round(128 + strataWave * 52 + ridgeCrease1 * 54 + ridgeCrease2 * 36 + fineHash * 30),
        ),
      );

      // 3. Fine micro-pebbles, blades & sand grain (B)
      const pebble = Math.sin(radX * 29 + sx) * Math.cos(radY * 29 + sy);
      const grain = Math.cos(radX * 53 - radY * 47 + pebble * 2.0);
      const pebbleVal = Math.max(
        6,
        Math.min(250, Math.round(128 + pebble * 58 + grain * 44 + fineHash * 52)),
      );

      const idx = (y * detailSize + x) * 4;
      dData[idx] = grassSoilVal;
      dData[idx + 1] = rockVal;
      dData[idx + 2] = pebbleVal;
      dData[idx + 3] = 255;

      const bumpVal = Math.max(
        8,
        Math.min(248, Math.round(grassSoilVal * 0.42 + rockVal * 0.38 + pebbleVal * 0.2)),
      );
      bData[idx] = bumpVal;
      bData[idx + 1] = bumpVal;
      bData[idx + 2] = bumpVal;
      bData[idx + 3] = 255;
    }
  }
  dctx.putImageData(dImg, 0, 0);
  bctx.putImageData(bImg, 0, 0);

  const detailTex = new THREE.CanvasTexture(detailCanvas);
  detailTex.colorSpace = THREE.NoColorSpace;
  detailTex.wrapS = THREE.RepeatWrapping;
  detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.anisotropy = maxAnisotropy;
  detailTex.minFilter = THREE.LinearMipmapLinearFilter;
  detailTex.magFilter = THREE.LinearFilter;
  detailTex.generateMipmaps = true;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.colorSpace = THREE.NoColorSpace;
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(280, 210);
  bumpTex.anisotropy = maxAnisotropy;
  bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
  bumpTex.magFilter = THREE.LinearFilter;
  bumpTex.generateMipmaps = true;

  return { albedoTex, bumpTex, detailTex };
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

// Non-uniform coordinate warp so 78% of terrain triangles are packed into the playable Calradia continent!
function warpPlayableAxis(norm: number, halfSpan: number, coreLimit: number): number {
  const s = norm < 0 ? -1 : 1;
  const a = Math.abs(norm);
  const split = 0.78;
  if (a <= split) {
    return s * (a / split) * coreLimit;
  }
  const outerT = (a - split) / (1 - split);
  return s * (coreLimit + outerT * outerT * (halfSpan - coreLimit));
}

// High-Resolution Continental Terrain Mesh with Multi-Scale Close-Up Directional Relief Shader
export function createContinentalTerrainMesh(
  albedoTex: THREE.CanvasTexture,
  bumpTex: THREE.CanvasTexture,
  detailTex?: THREE.CanvasTexture,
): THREE.Mesh {
  const isHeadless =
    typeof navigator !== 'undefined' &&
    (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
  const segX = isHeadless ? 300 : 460;
  const segZ = isHeadless ? 225 : 345;
  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const halfW = MAP_WIDTH / 2;
  const halfH = MAP_HEIGHT / 2;
  const posAttr = geo.attributes.position;
  const uvAttr = geo.attributes.uv;

  for (let i = 0; i < posAttr.count; i++) {
    const rawX = posAttr.getX(i);
    const rawZ = posAttr.getZ(i);
    const vx = warpPlayableAxis(rawX / halfW, halfW, 510);
    const vz = warpPlayableAxis(rawZ / halfH, halfH, 350);

    posAttr.setX(i, vx);
    posAttr.setZ(i, vz);
    // Keep exact UV mapping aligned with world coordinates so macro albedoTex matches vertex positions 1:1
    uvAttr.setXY(i, (vx + halfW) / MAP_WIDTH, 1.0 - (vz + halfH) / MAP_HEIGHT);

    // Clamp underwater mesh vertices to a flat water plane (-0.25) so coastlines & rivers never slice triangles
    posAttr.setY(i, Math.max(-0.25, groundHeightAt(vx, vz)));
  }

  posAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedoTex,
    bumpMap: bumpTex,
    bumpScale: 1.15,
    roughness: 0.87,
    metalness: 0.02,
  });

  if (detailTex) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetailMap = { value: detailTex };
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
        uniform sampler2D uDetailMap;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #ifdef USE_MAP
          // Reconstruct exact world XZ in meters from continental UV
          vec2 worldXZ = (vMapUv - 0.5) * vec2(2400.0, 1800.0);

          // 4 rotated multi-scale world-space frequencies (22m patches -> 6m turf -> 1.8m clumps -> 0.55m close-up grain)
          vec2 uvPatch = worldXZ * 0.045;
          vec2 uvMeso = vec2(
            worldXZ.x * 0.15 - worldXZ.y * 0.09,
            worldXZ.x * 0.09 + worldXZ.y * 0.15
          );
          vec2 uvMicro = vec2(
            worldXZ.x * 0.48 + worldXZ.y * 0.31,
            -worldXZ.x * 0.31 + worldXZ.y * 0.48
          );
          vec2 uvUltra = worldXZ * 1.55;

          vec3 dPatch = texture2D(uDetailMap, uvPatch).rgb;
          vec3 dMeso = texture2D(uDetailMap, uvMeso).rgb;
          vec3 dMicro = texture2D(uDetailMap, uvMicro).rgb;
          vec3 dUltra = texture2D(uDetailMap, uvUltra).rgb;

          // Directional micro-relief self-shadowing sample along NW sun vector
          vec3 dMesoSun = texture2D(uDetailMap, uvMeso + vec2(-0.045, -0.045)).rgb;
          vec3 dMicroSun = texture2D(uDetailMap, uvMicro + vec2(-0.055, -0.055)).rgb;

          // Detect water vs land from macro albedo (water has strong blue dominance over red)
          float isWater = step(diffuseColor.r * 1.16, diffuseColor.b) * step(diffuseColor.g * 1.03, diffuseColor.b);

          // Grass/soil micro-relief and color splatting on plains & valleys
          float turfRelief = (dMesoSun.r - dMeso.r) * 0.42 + (dMicroSun.r - dMicro.r) * 0.48;
          float turfPattern = (dPatch.r - 0.5) * 0.24 + (dMeso.r - 0.5) * 0.34 + (dMicro.b - 0.5) * 0.28 + (dUltra.b - 0.5) * 0.22;
          vec3 landTint = mix(
            vec3(0.76, 0.82, 0.68),
            vec3(1.18, 1.15, 0.94),
            clamp(0.5 + turfPattern + turfRelief * 0.65, 0.0, 1.0)
          );

          // Craggy rock strata & cliff fissure sharpness on mountain slopes and rocky highlands
          float isRockOrMountain = clamp(1.0 - abs(diffuseColor.r - diffuseColor.g) * 5.5, 0.0, 1.0);
          float rockRelief = (dMesoSun.g - dMeso.g) * 0.58 + (dMicroSun.g - dMicro.g) * 0.62;
          float rockPattern = (dPatch.g - 0.5) * 0.32 + (dMeso.g - 0.5) * 0.42 + (dMicro.g - 0.5) * 0.38 + (dUltra.b - 0.5) * 0.24;
          vec3 rockTint = mix(
            vec3(0.62, 0.60, 0.57),
            vec3(1.28, 1.25, 1.18),
            clamp(0.5 + rockPattern + rockRelief * 0.75, 0.0, 1.0)
          );

          vec3 finalLandMod = mix(landTint, rockTint, isRockOrMountain * 0.72);
          vec3 waterMod = vec3(1.0 + (dMicro.b - 0.5) * 0.06);

          diffuseColor.rgb = clamp(diffuseColor.rgb * mix(finalLandMod, waterMod, isWater), 0.02, 1.0);
        #endif`,
      );
    };
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Dense Organic Multi-Canopy Forest Groves, Tall Pines & Craggy Mountain Outcrop Boulders
export function createContinentalForestsAndRocksGroup(): THREE.Group {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const treeCoords: Array<{ x: number; y: number; z: number; scale: number; isPine: boolean; isSnowy: boolean }> = [];
  const rockCoords: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; isSnowy: boolean; isDesert: boolean }> = [];

  for (let i = 0; i < 15500; i++) {
    let tx: number;
    let tz: number;
    if (i < 4000) {
      // High-density groves around Central Empire (Saneopa/Myzea/Lycaron/Phycaon) & Battania/Vlandia woodlands
      if (i % 2 === 0) {
        tx = -60 + ((i * 43 + ((i * 17) % 23)) % 240);
        tz = -120 + ((i * 59 + ((i * 29) % 31)) % 210);
      } else {
        tx = -450 + ((i * 47 + ((i * 19) % 29)) % 270);
        tz = -240 + ((i * 67 + ((i * 31) % 37)) % 250);
      }
    } else if (i < 7200) {
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
    if (rDist < rWidth * 1.45 || roadDist < 3.1) continue;

    // Never spawn tall trees inside settlement terraces
    let insideSettlement = false;
    if (tx > -505 && tx < 365 && tz > -325 && tz < 305) {
      for (let sIdx = 0; sIdx < SETTLEMENT_TERRACES.length; sIdx++) {
        const st = SETTLEMENT_TERRACES[sIdx];
        const clearR = st.radius + 2.2;
        const dx = tx - st.x;
        if (dx > clearR || dx < -clearR) continue;
        const dz = tz - st.z;
        if (dz > clearR || dz < -clearR) continue;
        if (dx * dx + dz * dz < clearR * clearR) {
          insideSettlement = true;
          break;
        }
      }
    }
    if (insideSettlement) continue;

    const info = getTerrainSlopeAndColorAt(tx, tz);
    if (info.height < 0.45 || info.height > 9.0 || info.slope > 0.56) continue;
    if (tz > 145 && i % 7 !== 0) continue; // Sparse oasis palms in southern desert

    // Significantly taller, majestic tree scale (1.28x to 2.24x, ~2.6x larger than before!)
    const scale = 1.28 + (i % 7) * 0.16;
    const isSnowy = tz < -170 || (info.height > 5.0 && tz < 35 && tx > -120 && tx < 320);
    const isPine = isSnowy || tz < -55 || info.height > 3.4 || (tx < -180 && i % 2 === 0);
    treeCoords.push({ x: tx, y: info.height, z: tz, scale, isPine, isSnowy });
  }

  // Generate angular flat-shaded mountain crag outcrops strictly on high mountain ridges away from settlements
  for (let r = 0; r < 4000 && rockCoords.length < 1100; r++) {
    const rx = ((r * 173 + ((r * 31) % 59)) % 1120) - 560;
    const rz = ((r * 211 + ((r * 41) % 67)) % 840) - 420;
    const info = getTerrainSlopeAndColorAt(rx, rz);
    if (info.height < 6.2 || info.slope < 0.38 || info.height > 19.5) continue;

    let nearSettlement = false;
    for (let sIdx = 0; sIdx < SETTLEMENT_TERRACES.length; sIdx++) {
      const st = SETTLEMENT_TERRACES[sIdx];
      if (Math.abs(rx - st.x) < 22 && Math.abs(rz - st.z) < 22) {
        nearSettlement = true;
        break;
      }
    }
    if (nearSettlement) continue;

    const baseS = 0.55 + (r % 5) * 0.18;
    rockCoords.push({
      x: rx,
      y: info.height - 0.15,
      z: rz,
      sx: baseS * (1.1 + (r % 3) * 0.25),
      sy: baseS * (0.85 + (r % 4) * 0.35),
      sz: baseS * (1.0 + ((r + 1) % 3) * 0.22),
      rotY: (r * 1.17) % (Math.PI * 2),
      isSnowy: rz < -175 || (info.height > 8.2 && rz < -25),
      isDesert: rz > 130 || rx > 240,
    });
  }

  const count = treeCoords.length;

  // Taller, sturdy tree trunks
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.21, 1.35, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x362314,
    roughness: 0.95,
  });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);

  const lowerCrownGeo = new THREE.ConeGeometry(0.98, 1.85, 7);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
  });
  const lowerCrownInst = new THREE.InstancedMesh(lowerCrownGeo, crownMat, count);
  lowerCrownInst.castShadow = true;
  lowerCrownInst.receiveShadow = true;

  const upperCrownGeo = new THREE.ConeGeometry(0.74, 1.65, 7);
  const upperCrownInst = new THREE.InstancedMesh(upperCrownGeo, crownMat, count);
  upperCrownInst.castShadow = true;

  const deepWoodlandPalette = [
    0x273814, // deep olive forest
    0x33471a, // warm sun-lit moss green
    0x1e2e0f, // dark woodland pine
    0x3e5420, // golden-olive leaf
    0x2b3d16, // rich cypress green
    0x495e25, // dry autumn-olive
  ];

  const snowyPinePalette = [
    0x4a6158, // frosted slate pine
    0x5c736b, // snow-dusted spruce
    0x3b5249, // deep nordic fir
    0x6e857e, // heavy snow-frosted pine tip
  ];

  for (let i = 0; i < count; i++) {
    const t = treeCoords[i];
    dummy.position.set(t.x, t.y + 0.58 * t.scale, t.z);
    dummy.rotation.set(0, (i * 1.3) % Math.PI, 0);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    // Tall lower canopy tier
    dummy.position.set(t.x, t.y + 1.48 * t.scale, t.z);
    dummy.rotation.set((i % 3) * 0.05, (i * 2.1) % Math.PI, 0);
    dummy.scale.set(
      t.scale * (t.isPine ? 0.88 : 1.18),
      t.scale * (t.isPine ? 1.38 : 1.05),
      t.scale * (t.isPine ? 0.88 : 1.18),
    );
    dummy.updateMatrix();
    lowerCrownInst.setMatrixAt(i, dummy.matrix);

    // Tall upper peak canopy tier
    dummy.position.set(
      t.x + Math.sin(i) * 0.08 * t.scale,
      t.y + 2.38 * t.scale,
      t.z + Math.cos(i) * 0.08 * t.scale,
    );
    dummy.scale.set(
      t.scale * (t.isPine ? 0.72 : 0.96),
      t.scale * (t.isPine ? 1.32 : 0.95),
      t.scale * (t.isPine ? 0.72 : 0.96),
    );
    dummy.updateMatrix();
    upperCrownInst.setMatrixAt(i, dummy.matrix);

    if (t.isSnowy) {
      color.setHex(snowyPinePalette[i % snowyPinePalette.length]);
      lowerCrownInst.setColorAt(i, color);
      color.setHex(0x9ab0aa);
      upperCrownInst.setColorAt(i, color);
    } else {
      color.setHex(deepWoodlandPalette[i % deepWoodlandPalette.length]);
      lowerCrownInst.setColorAt(i, color);
      color.offsetHSL(0, 0.02, 0.045);
      upperCrownInst.setColorAt(i, color);
    }
  }

  trunkInst.instanceMatrix.needsUpdate = true;
  lowerCrownInst.instanceMatrix.needsUpdate = true;
  upperCrownInst.instanceMatrix.needsUpdate = true;
  if (lowerCrownInst.instanceColor) lowerCrownInst.instanceColor.needsUpdate = true;
  if (upperCrownInst.instanceColor) upperCrownInst.instanceColor.needsUpdate = true;

  trunkInst.matrixAutoUpdate = false;
  lowerCrownInst.matrixAutoUpdate = false;
  upperCrownInst.matrixAutoUpdate = false;

  group.add(trunkInst);
  group.add(lowerCrownInst);
  group.add(upperCrownInst);

  // Chiseled Flat-Shaded Mountain Crag Outcrops (strictly on high ridges)
  if (rockCoords.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(0.95, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.04,
      flatShading: true,
    });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCoords.length);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;

    for (let r = 0; r < rockCoords.length; r++) {
      const rc = rockCoords[r];
      dummy.position.set(rc.x, rc.y, rc.z);
      dummy.rotation.set((r % 5) * 0.24, rc.rotY, ((r + 2) % 5) * 0.22);
      dummy.scale.set(rc.sx, rc.sy, rc.sz);
      dummy.updateMatrix();
      rockInst.setMatrixAt(r, dummy.matrix);

      if (rc.isSnowy) {
        color.setHex(r % 2 === 0 ? 0x8d97a1 : 0xaab4be);
      } else if (rc.isDesert) {
        color.setHex(r % 2 === 0 ? 0x997c5b : 0x82684a);
      } else {
        color.setHex(r % 2 === 0 ? 0x666058 : 0x524d46);
      }
      rockInst.setColorAt(r, color);
    }
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.matrixAutoUpdate = false;
    group.add(rockInst);
  }

  group.matrixAutoUpdate = false;
  return group;
}

// Fast, zero-dependency static BufferGeometry merger so each Settlement renders in 5-7 batched draw calls instead of 53!
function mergeStaticGeometries(
  parts: Array<{
    geo: THREE.BufferGeometry;
    x?: number;
    y?: number;
    z?: number;
    rx?: number;
    ry?: number;
    rz?: number;
    sx?: number;
    sy?: number;
    sz?: number;
  }>,
): THREE.BufferGeometry {
  const mat4 = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  const transformedGeos: THREE.BufferGeometry[] = [];
  let totalVerts = 0;

  for (const p of parts) {
    const nonIndexed = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    pos.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    euler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    quat.setFromEuler(euler);
    scl.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    mat4.compose(pos, quat, scl);
    nonIndexed.applyMatrix4(mat4);
    transformedGeos.push(nonIndexed);
    totalVerts += nonIndexed.attributes.position.count;
  }

  const merged = new THREE.BufferGeometry();
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let vOffset = 0;
  for (const g of transformedGeos) {
    const pAttr = g.attributes.position as THREE.BufferAttribute;
    const nAttr = g.attributes.normal as THREE.BufferAttribute | undefined;
    const uvAttr = g.attributes.uv as THREE.BufferAttribute | undefined;

    positions.set(pAttr.array as Float32Array, vOffset * 3);
    if (nAttr) {
      normals.set(nAttr.array as Float32Array, vOffset * 3);
    }
    if (uvAttr) {
      uvs.set(uvAttr.array as Float32Array, vOffset * 2);
    }
    vOffset += pAttr.count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
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

  const deckBaseGeo = new THREE.BoxGeometry(3.2, 0.42, 1);
  const rampBaseGeo = new THREE.BoxGeometry(3.2, 0.38, 1);
  const wallBaseGeo = new THREE.BoxGeometry(0.32, 0.58, 1);
  const pierGeo = new THREE.CylinderGeometry(0.62, 0.85, 3.2, 8);

  CONTINENTAL_BRIDGES.forEach((b) => {
    const dirX = Math.sin(b.rotationY);
    const dirZ = Math.cos(b.rotationY);
    const halfLen = b.length * 0.5;

    // Sample bank elevations at both ends of the bridge so the deck connects seamlessly to both riverbanks
    const bankH1 = Math.max(1.35, groundHeightAt(b.x - dirX * halfLen, b.z - dirZ * halfLen));
    const bankH2 = Math.max(1.35, groundHeightAt(b.x + dirX * halfLen, b.z + dirZ * halfLen));
    const bridgeDeckY = Math.max(bankH1, bankH2) + 0.15;

    const rampLen = b.length * 0.22;
    const bridgeMergedGeo = mergeStaticGeometries([
      { geo: deckBaseGeo, y: 0, sz: b.length * 0.76 },
      { geo: rampBaseGeo, y: -0.18, z: -b.length * 0.42, rx: 0.16, sz: rampLen },
      { geo: rampBaseGeo, y: -0.18, z: b.length * 0.42, rx: -0.16, sz: rampLen },
      { geo: wallBaseGeo, x: -1.44, y: 0.42, sz: b.length * 0.78 },
      { geo: wallBaseGeo, x: 1.44, y: 0.42, sz: b.length * 0.78 },
      { geo: pierGeo, y: -1.6, z: -b.length * 0.24 },
      { geo: pierGeo, y: -1.6, z: 0 },
      { geo: pierGeo, y: -1.6, z: b.length * 0.24 },
    ]);

    const bMesh = new THREE.Mesh(bridgeMergedGeo, stoneMat);
    bMesh.position.set(b.x, bridgeDeckY, b.z);
    bMesh.rotation.y = b.rotationY;
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    bMesh.updateMatrix();
    bMesh.matrixAutoUpdate = false;
    group.add(bMesh);
  });

  group.matrixAutoUpdate = false;
  return group;
}

// Subtle Cobblestone Mileposts along Imperial Roads
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
  disc.updateMatrix();
  disc.matrixAutoUpdate = false;
  return disc;
}

// Shared & Pre-Merged Settlement Geometry & Material Cache so 211 Towns, Castles, and Villages render in ~6 draw calls each!
let cachedSettlementAssets: {
  stoneMat: THREE.MeshStandardMaterial;
  darkStoneMat: THREE.MeshStandardMaterial;
  terracottaRoofMat: THREE.MeshStandardMaterial;
  slateRoofMat: THREE.MeshStandardMaterial;
  timberMat: THREE.MeshStandardMaterial;
  plasterMat: THREE.MeshStandardMaterial;
  wheatMat: THREE.MeshStandardMaterial;
  bannerMats: Map<number, THREE.MeshStandardMaterial>;
  flagGeo: THREE.ExtrudeGeometry;
  // Pre-merged Town static geometries (reduces 53 meshes -> 6 static batched meshes!)
  townStoneGeo: THREE.BufferGeometry;
  townDarkStoneGeo: THREE.BufferGeometry;
  townTerracottaGeo: THREE.BufferGeometry;
  townSlateGeo: THREE.BufferGeometry;
  townPlasterGeo: THREE.BufferGeometry;
  townTimberGeo: THREE.BufferGeometry;
  // Pre-merged Castle static geometries (reduces 19 meshes -> 4 static batched meshes!)
  castleStoneGeo: THREE.BufferGeometry;
  castleDarkStoneGeo: THREE.BufferGeometry;
  castleSlateGeo: THREE.BufferGeometry;
  castleTimberGeo: THREE.BufferGeometry;
  // Pre-merged Village static geometries (reduces 15 meshes -> 5 static batched meshes!)
  villageDarkStoneGeo: THREE.BufferGeometry;
  villageStoneGeo: THREE.BufferGeometry;
  villageTimberGeo: THREE.BufferGeometry;
  villageTerracottaGeo: THREE.BufferGeometry;
  villageWheatGeo: THREE.BufferGeometry;
} | null = null;

function getSettlementAssets(stoneTex: THREE.CanvasTexture) {
  if (cachedSettlementAssets) return cachedSettlementAssets;

  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(1.25, 0.14);
  flagShape.lineTo(0.95, -0.32);
  flagShape.lineTo(1.25, -0.75);
  flagShape.lineTo(0, -0.65);
  flagShape.closePath();

  const plinthTownGeo = new THREE.CylinderGeometry(5.1, 5.8, 0.65, 10);
  const plinthCastleGeo = new THREE.CylinderGeometry(3.2, 3.8, 0.85, 8);
  const plinthVillageGeo = new THREE.CylinderGeometry(2.5, 3.0, 0.45, 8);
  const acropolisGeo = new THREE.CylinderGeometry(2.1, 2.5, 0.75, 8);
  const keepTownGeo = new THREE.BoxGeometry(2.2, 3.0, 2.0);
  const keepCastleGeo = new THREE.BoxGeometry(2.1, 3.6, 2.1);
  const keepRoofGeo = new THREE.ConeGeometry(1.65, 1.15, 4);
  const domeGeo = new THREE.SphereGeometry(0.95, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const wallTownGeo = new THREE.BoxGeometry(3.35, 1.85, 0.48);
  const wallCastleGeo = new THREE.BoxGeometry(4.6, 2.15, 0.54);
  const gatehouseGeo = new THREE.BoxGeometry(1.75, 2.45, 1.15);
  const towerTownGeo = new THREE.CylinderGeometry(0.58, 0.68, 2.75, 10);
  const towerCastleGeo = new THREE.CylinderGeometry(0.68, 0.78, 3.15, 10);
  const battlementGeo = new THREE.CylinderGeometry(0.76, 0.7, 0.38, 8);
  const houseGeo = new THREE.BoxGeometry(1.05, 1.22, 0.92);
  const houseRoofGeo = new THREE.ConeGeometry(0.82, 0.62, 4);
  const cottageGeo = new THREE.BoxGeometry(1.12, 0.95, 0.9);
  const cottageRoofGeo = new THREE.ConeGeometry(0.88, 0.64, 4);
  const wheatFieldGeo = new THREE.BoxGeometry(1.85, 0.14, 1.35);
  const watchTowerGeo = new THREE.CylinderGeometry(0.44, 0.52, 2.25, 8);
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.055, 2.3, 6);

  // 1. Pre-merge TOWN geometries by material
  const townWallRadius = 4.05;
  const townStoneParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: keepTownGeo, x: 0, y: 2.2, z: -0.85 },
  ];
  const townDarkStoneParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: plinthTownGeo, x: 0, y: 0.22, z: 0 },
    { geo: acropolisGeo, x: 0, y: 0.68, z: -0.85 },
    { geo: gatehouseGeo, x: 0, y: 1.55, z: townWallRadius + 0.22 },
  ];
  for (let side = 0; side < 8; side++) {
    const angle = (side * Math.PI) / 4;
    const wx = Math.sin(angle) * townWallRadius;
    const wz = Math.cos(angle) * townWallRadius;
    townStoneParts.push({ geo: wallTownGeo, x: wx, y: 1.32, z: wz, ry: angle });

    const cornerAngle = angle + Math.PI / 8;
    const tx = Math.sin(cornerAngle) * (townWallRadius + 0.25);
    const tz = Math.cos(cornerAngle) * (townWallRadius + 0.25);
    townStoneParts.push({ geo: towerTownGeo, x: tx, y: 1.75, z: tz });
    townDarkStoneParts.push({ geo: battlementGeo, x: tx, y: 3.18, z: tz });
  }

  const townTerracottaParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: keepRoofGeo, x: 0, y: 4.15, z: -0.85, ry: Math.PI / 4 },
    { geo: domeGeo, x: 1.25, y: 1.92, z: 0.55 },
  ];
  const townSlateParts: Parameters<typeof mergeStaticGeometries>[0] = [];
  const townPlasterParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: houseGeo, x: 1.25, y: 1.2, z: 0.55, sx: 1.45, sy: 1.35, sz: 1.45 },
  ];
  const townTimberParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: poleGeo, x: 0, y: 4.85, z: -0.85 },
  ];

  const houseLayout: Array<[number, number, number, number, boolean]> = [
    [-2.1, 0.9, 0.2, 1.15, false],
    [-1.9, -0.7, -0.15, 1.05, true],
    [-0.8, 1.85, 0.4, 1.0, false],
    [0.4, 2.05, -0.1, 1.1, true],
    [2.15, -0.85, 0.3, 1.18, false],
    [1.85, 1.85, -0.35, 0.95, false],
    [-1.25, -2.15, 0.12, 1.08, true],
    [1.35, -2.15, -0.22, 1.04, false],
    [-2.45, 0.1, 0.5, 0.92, true],
    [2.45, 0.35, -0.4, 0.98, false],
  ];
  houseLayout.forEach(([hx, hz, rot, hScale, useSlate]) => {
    const housePart = {
      geo: houseGeo,
      x: hx,
      y: 0.55 + 0.55 * hScale,
      z: hz,
      ry: rot,
      sy: hScale,
    };
    const roofPart = {
      geo: houseRoofGeo,
      x: hx,
      y: 0.55 + 1.15 * hScale + 0.22,
      z: hz,
      ry: rot + Math.PI / 4,
    };
    if (useSlate) {
      townPlasterParts.push(housePart);
      townSlateParts.push(roofPart);
    } else {
      townTimberParts.push(housePart);
      townTerracottaParts.push(roofPart);
    }
  });

  // 2. Pre-merge CASTLE geometries by material
  const castleR = 2.35;
  const castleStoneParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: keepCastleGeo, x: 0, y: 2.35, z: -0.2 },
    { geo: wallCastleGeo, x: 0, y: 1.55, z: castleR, ry: 0 },
    { geo: wallCastleGeo, x: 0, y: 1.55, z: -castleR, ry: 0 },
    { geo: wallCastleGeo, x: castleR, y: 1.55, z: 0, ry: Math.PI / 2 },
    { geo: wallCastleGeo, x: -castleR, y: 1.55, z: 0, ry: Math.PI / 2 },
    { geo: towerCastleGeo, x: -castleR, y: 1.95, z: -castleR },
    { geo: towerCastleGeo, x: castleR, y: 1.95, z: -castleR },
    { geo: towerCastleGeo, x: -castleR, y: 1.95, z: castleR },
    { geo: towerCastleGeo, x: castleR, y: 1.95, z: castleR },
  ];
  const castleDarkStoneParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: plinthCastleGeo, x: 0, y: 0.35, z: 0 },
    { geo: gatehouseGeo, x: 0, y: 1.65, z: castleR + 0.25 },
    { geo: battlementGeo, x: -castleR, y: 3.6, z: -castleR },
    { geo: battlementGeo, x: castleR, y: 3.6, z: -castleR },
    { geo: battlementGeo, x: -castleR, y: 3.6, z: castleR },
    { geo: battlementGeo, x: castleR, y: 3.6, z: castleR },
  ];
  const castleSlateGeo = mergeStaticGeometries([
    { geo: keepRoofGeo, x: 0, y: 4.55, z: -0.2, ry: Math.PI / 4 },
  ]);
  const castleTimberGeo = mergeStaticGeometries([
    { geo: poleGeo, x: 0, y: 5.15, z: -0.2 },
  ]);

  // 3. Pre-merge VILLAGE geometries by material
  const cottages: Array<[number, number, number]> = [
    [-0.95, 0.45, 0.25],
    [0.85, -0.55, -0.35],
    [-0.25, -0.95, 0.55],
    [0.95, 0.75, 0.15],
  ];
  const villageTimberParts: Parameters<typeof mergeStaticGeometries>[0] = [
    { geo: poleGeo, x: -0.95, y: 2.65, z: -0.75 },
  ];
  const villageTerracottaParts: Parameters<typeof mergeStaticGeometries>[0] = [];
  cottages.forEach(([vx, vz, rot]) => {
    villageTimberParts.push({ geo: cottageGeo, x: vx, y: 0.85, z: vz, ry: rot });
    villageTerracottaParts.push({
      geo: cottageRoofGeo,
      x: vx,
      y: 1.58,
      z: vz,
      ry: rot + Math.PI / 4,
    });
  });

  cachedSettlementAssets = {
    stoneMat: new THREE.MeshStandardMaterial({
      color: 0x948b7e,
      map: stoneTex,
      roughness: 0.85,
      metalness: 0.05,
    }),
    darkStoneMat: new THREE.MeshStandardMaterial({
      color: 0x5c554c,
      map: stoneTex,
      roughness: 0.9,
      metalness: 0.05,
    }),
    terracottaRoofMat: new THREE.MeshStandardMaterial({
      color: 0x7c4734,
      roughness: 0.76,
      metalness: 0.06,
    }),
    slateRoofMat: new THREE.MeshStandardMaterial({
      color: 0x47525e,
      roughness: 0.8,
      metalness: 0.08,
    }),
    timberMat: new THREE.MeshStandardMaterial({
      color: 0x543b26,
      roughness: 0.9,
      metalness: 0.04,
    }),
    plasterMat: new THREE.MeshStandardMaterial({
      color: 0xb8ab96,
      roughness: 0.88,
      metalness: 0.02,
    }),
    wheatMat: new THREE.MeshStandardMaterial({
      color: 0xa68b3c,
      roughness: 0.92,
      metalness: 0.01,
    }),
    bannerMats: new Map(),
    flagGeo: new THREE.ExtrudeGeometry(flagShape, {
      depth: 0.04,
      bevelEnabled: false,
    }),
    townStoneGeo: mergeStaticGeometries(townStoneParts),
    townDarkStoneGeo: mergeStaticGeometries(townDarkStoneParts),
    townTerracottaGeo: mergeStaticGeometries(townTerracottaParts),
    townSlateGeo: mergeStaticGeometries(townSlateParts),
    townPlasterGeo: mergeStaticGeometries(townPlasterParts),
    townTimberGeo: mergeStaticGeometries(townTimberParts),
    castleStoneGeo: mergeStaticGeometries(castleStoneParts),
    castleDarkStoneGeo: mergeStaticGeometries(castleDarkStoneParts),
    castleSlateGeo,
    castleTimberGeo,
    villageDarkStoneGeo: mergeStaticGeometries([{ geo: plinthVillageGeo, x: 0, y: 0.22, z: 0 }]),
    villageStoneGeo: mergeStaticGeometries([{ geo: watchTowerGeo, x: -0.95, y: 1.35, z: -0.75 }]),
    villageTimberGeo: mergeStaticGeometries(villageTimberParts),
    villageTerracottaGeo: mergeStaticGeometries(villageTerracottaParts),
    villageWheatGeo: mergeStaticGeometries([
      { geo: wheatFieldGeo, x: -1.55, y: 0.42, z: 1.35, ry: 0.2 },
      { geo: wheatFieldGeo, x: 1.45, y: 0.42, z: -1.45, ry: -0.15 },
    ]),
  };
  return cachedSettlementAssets;
}

function addStaticMesh(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  castShadow: boolean,
  receiveShadow: boolean,
) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  m.matrixAutoUpdate = false;
  group.add(m);
}

// Authentic Bannerlord Grand Fortified Town, Concentric Castle & Rural Village 3D Miniature Models
export function createSettlementModel(
  type: 'CASTLE' | 'TOWN' | 'VILLAGE',
  factionHex: number,
  stoneTex: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  const assets = getSettlementAssets(stoneTex);

  let factionBannerMat = assets.bannerMats.get(factionHex);
  if (!factionBannerMat) {
    factionBannerMat = new THREE.MeshStandardMaterial({
      color: factionHex,
      roughness: 0.5,
      metalness: 0.15,
    });
    assets.bannerMats.set(factionHex, factionBannerMat);
  }

  group.add(createContactShadowDisc(type === 'TOWN' ? 6.2 : type === 'CASTLE' ? 4.2 : 3.4));

  if (type === 'TOWN') {
    addStaticMesh(group, assets.townDarkStoneGeo, assets.darkStoneMat, true, true);
    addStaticMesh(group, assets.townStoneGeo, assets.stoneMat, true, true);
    addStaticMesh(group, assets.townTerracottaGeo, assets.terracottaRoofMat, false, false);
    addStaticMesh(group, assets.townSlateGeo, assets.slateRoofMat, false, false);
    addStaticMesh(group, assets.townPlasterGeo, assets.plasterMat, true, false);
    addStaticMesh(group, assets.townTimberGeo, assets.timberMat, true, false);
  } else if (type === 'CASTLE') {
    addStaticMesh(group, assets.castleDarkStoneGeo, assets.darkStoneMat, true, true);
    addStaticMesh(group, assets.castleStoneGeo, assets.stoneMat, true, true);
    addStaticMesh(group, assets.castleSlateGeo, assets.slateRoofMat, false, false);
    addStaticMesh(group, assets.castleTimberGeo, assets.timberMat, false, false);
  } else {
    addStaticMesh(group, assets.villageDarkStoneGeo, assets.darkStoneMat, false, true);
    addStaticMesh(group, assets.villageStoneGeo, assets.stoneMat, true, false);
    addStaticMesh(group, assets.villageTimberGeo, assets.timberMat, true, false);
    addStaticMesh(group, assets.villageTerracottaGeo, assets.terracottaRoofMat, false, false);
    addStaticMesh(group, assets.villageWheatGeo, assets.wheatMat, false, true);
  }

  // Heraldic Flagpole Banner flying the Faction Banner above the Settlement
  const poleY = type === 'TOWN' ? 4.85 : type === 'CASTLE' ? 5.15 : 2.65;
  const poleZ = type === 'TOWN' ? -0.85 : type === 'CASTLE' ? -0.2 : -0.75;
  const poleX = type === 'VILLAGE' ? -0.95 : 0;

  const flag = new THREE.Mesh(assets.flagGeo, factionBannerMat);
  flag.position.set(poleX + 0.04, poleY + 0.85, poleZ);
  flag.name = 'bannerFlag';
  group.add(flag);

  // Scale settlements so Towns are grand walled cities, Castles are imposing fortresses, and Villages are clear rural estates
  const modelScale = type === 'TOWN' ? 1.38 : type === 'CASTLE' ? 1.26 : 1.16;
  group.scale.setScalar(modelScale);

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
