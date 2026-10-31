import * as THREE from 'three';
import {
  BattleMemoryPool,
  MAX_CORPSE_POOL,
  MAX_PROJECTILE_POOL,
  MAX_SOLDIER_POOL,
} from './battleEnginePool';

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _lookDir = new THREE.Vector3();
const _upZ = new THREE.Vector3(0, 0, 1);
const _colAlly = new THREE.Color('#991b1b');
const _colEnemy = new THREE.Color('#581c87');
const _colAllyCorpse = new THREE.Color('#5c1414');
const _colEnemyCorpse = new THREE.Color('#341152');

export interface InstancedBattleSceneHandles {
  root: THREE.Group;
  torsoInstanced: THREE.InstancedMesh;
  helmetInstanced: THREE.InstancedMesh;
  shieldInstanced: THREE.InstancedMesh;
  weaponInstanced: THREE.InstancedMesh;
  horseInstanced: THREE.InstancedMesh;
  corpseInstanced: THREE.InstancedMesh;
  arrowInstanced: THREE.InstancedMesh;
  boulderInstanced: THREE.InstancedMesh;
  siegeGroup: THREE.Group;
  ramGroup: THREE.Group;
  ramLogMesh: THREE.Mesh;
  towerLeftGroup: THREE.Group;
  towerRightGroup: THREE.Group;
  gateLeftDoor: THREE.Group;
  gateRightDoor: THREE.Group;
  catapultArmLeft: THREE.Group;
  catapultArmRight: THREE.Group;
  syncFromPool: (pool: BattleMemoryPool) => void;
}

function buildBatteringRamGroup(): { root: THREE.Group; ramLogMesh: THREE.Mesh } {
  const root = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#4a321f', roughness: 0.9, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#362314', roughness: 0.85, flatShading: true });
  const ironMat = new THREE.MeshStandardMaterial({ color: '#52525b', roughness: 0.4, metalness: 0.65, flatShading: true });

  // Heavy Timber Frame Base
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 4.6), woodMat);
  frame.position.y = 0.55;
  frame.castShadow = true;
  root.add(frame);

  // Sloped Protective Shed Roof (Penthouse)
  const roofGeo = new THREE.ConeGeometry(2.3, 1.5, 4);
  roofGeo.rotateY(Math.PI * 0.25);
  roofGeo.scale(0.85, 1.0, 1.65);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 2.15, 0);
  roof.castShadow = true;
  root.add(roof);

  // 4 Corner Support Posts
  const postGeo = new THREE.BoxGeometry(0.22, 1.3, 0.22);
  for (const sx of [-1.1, 1.1]) {
    for (const sz of [-1.9, 1.9]) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(sx, 1.2, sz);
      root.add(post);
    }
  }

  // 6 Heavy Iron-Rimmed Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.22, 12);
  wheelGeo.rotateZ(Math.PI * 0.5);
  for (const sx of [-1.35, 1.35]) {
    for (const sz of [-1.6, 0, 1.6]) {
      const w = new THREE.Mesh(wheelGeo, ironMat);
      w.position.set(sx, 0.48, sz);
      root.add(w);
    }
  }

  // Swinging Iron-Headed Battering Log
  const logGeo = new THREE.CylinderGeometry(0.26, 0.28, 4.8, 8);
  logGeo.rotateX(Math.PI * 0.5);
  const ramLogMesh = new THREE.Mesh(logGeo, woodMat);
  ramLogMesh.position.set(0, 1.15, -0.35);

  const ramHead = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.75), ironMat);
  ramHead.position.set(0, 0, -2.45);
  ramLogMesh.add(ramHead);
  root.add(ramLogMesh);

  return { root, ramLogMesh };
}

function buildSiegeTowerGroup(): THREE.Group {
  const root = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#452e1c', roughness: 0.9, flatShading: true });
  const hideMat = new THREE.MeshStandardMaterial({ color: '#5c4028', roughness: 0.95, flatShading: true });
  const ironMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.45, metalness: 0.55 });

  // 3-Tier Timber Tower Structure
  const baseTier = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.8), woodMat);
  baseTier.position.y = 1.4;
  baseTier.castShadow = true;
  root.add(baseTier);

  const midTier = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.0, 2.5), hideMat);
  midTier.position.y = 3.5;
  midTier.castShadow = true;
  root.add(midTier);

  const topTier = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.6, 2.35), woodMat);
  topTier.position.y = 5.2;
  topTier.castShadow = true;
  root.add(topTier);

  // Assault Drawbridge Ramp at Front Top
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.7, 0.18), ironMat);
  ramp.position.set(0, 5.1, -1.28);
  ramp.rotation.x = -0.25;
  root.add(ramp);

  // 4 Heavy Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.25, 12);
  wheelGeo.rotateZ(Math.PI * 0.5);
  for (const sx of [-1.48, 1.48]) {
    for (const sz of [-1.1, 1.1]) {
      const w = new THREE.Mesh(wheelGeo, ironMat);
      w.position.set(sx, 0.52, sz);
      root.add(w);
    }
  }

  return root;
}

function buildCatapultGroup(): { root: THREE.Group; armPivot: THREE.Group } {
  const root = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#4a321f', roughness: 0.9, flatShading: true });
  const ironMat = new THREE.MeshStandardMaterial({ color: '#52525b', roughness: 0.4, metalness: 0.6 });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#f97316' });

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 3.0), woodMat);
  base.position.y = 0.35;
  root.add(base);

  const uprightL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.8, 0.35), woodMat);
  uprightL.position.set(-0.85, 1.2, -0.3);
  const uprightR = uprightL.clone();
  uprightR.position.x = 0.85;
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 0.32), ironMat);
  crossbar.position.set(0, 1.95, -0.3);
  root.add(uprightL, uprightR, crossbar);

  const armPivot = new THREE.Group();
  armPivot.position.set(0, 0.95, 0.4);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.7), woodMat);
  beam.position.set(0, 0, 0.9);
  const bucket = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), fireMat);
  bucket.position.set(0, 0.2, 2.15);
  armPivot.add(beam, bucket);
  root.add(armPivot);

  return { root, armPivot };
}

/**
 * Creates the GPU-accelerated InstancedMesh Army Renderer + 10,000-Arrow & 10,000-Corpse Pool + 3D Siege Fortifications.
 */
export function createInstancedBattleScene(): InstancedBattleSceneHandles {
  const root = new THREE.Group();

  // 1. Live Soldier Instanced Meshes (capacity: MAX_SOLDIER_POOL = 1,024)
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.82, 0.34);
  torsoGeo.translate(0, 0.92, 0);
  const torsoMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.72,
    metalness: 0.22,
    flatShading: true,
  });
  const torsoInstanced = new THREE.InstancedMesh(torsoGeo, torsoMat, MAX_SOLDIER_POOL);
  torsoInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  torsoInstanced.castShadow = true;
  torsoInstanced.frustumCulled = false;

  const helmetGeo = new THREE.ConeGeometry(0.24, 0.38, 6);
  helmetGeo.translate(0, 1.54, 0);
  const helmetMat = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
  });
  const helmetInstanced = new THREE.InstancedMesh(helmetGeo, helmetMat, MAX_SOLDIER_POOL);
  helmetInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  helmetInstanced.frustumCulled = false;

  const shieldGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8);
  shieldGeo.rotateX(Math.PI * 0.5);
  shieldGeo.translate(-0.36, 0.98, 0.24);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.68,
    metalness: 0.18,
    flatShading: true,
  });
  const shieldInstanced = new THREE.InstancedMesh(shieldGeo, shieldMat, MAX_SOLDIER_POOL);
  shieldInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shieldInstanced.frustumCulled = false;

  const weaponGeo = new THREE.BoxGeometry(0.07, 1.15, 0.09);
  weaponGeo.translate(0.36, 1.18, 0.28);
  const weaponMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.3,
    metalness: 0.78,
    flatShading: true,
  });
  const weaponInstanced = new THREE.InstancedMesh(weaponGeo, weaponMat, MAX_SOLDIER_POOL);
  weaponInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  weaponInstanced.frustumCulled = false;

  const horseGeo = new THREE.BoxGeometry(0.72, 0.78, 1.65);
  horseGeo.translate(0, 0.56, 0);
  const horseMat = new THREE.MeshStandardMaterial({
    color: '#4a3222',
    roughness: 0.85,
    flatShading: true,
  });
  const horseInstanced = new THREE.InstancedMesh(horseGeo, horseMat, MAX_SOLDIER_POOL);
  horseInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  horseInstanced.frustumCulled = false;

  // 2. 10,000 Fallen Corpse InstancedMesh Pool (1 Single Draw Call!)
  const corpseGeo = new THREE.BoxGeometry(0.58, 0.24, 1.48);
  const corpseMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.92,
    flatShading: true,
  });
  const corpseInstanced = new THREE.InstancedMesh(corpseGeo, corpseMat, MAX_CORPSE_POOL);
  corpseInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  corpseInstanced.frustumCulled = false;
  corpseInstanced.count = 0;

  // 3. 10,000 Arrow & Siege Boulder InstancedMesh Pool (2 Draw Calls for 10,000 Projectiles!)
  const arrowGeo = new THREE.ConeGeometry(0.055, 0.92, 4);
  arrowGeo.rotateX(Math.PI * 0.5);
  const arrowMat = new THREE.MeshBasicMaterial({ color: '#fde68a' });
  const arrowInstanced = new THREE.InstancedMesh(arrowGeo, arrowMat, MAX_PROJECTILE_POOL);
  arrowInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrowInstanced.frustumCulled = false;
  arrowInstanced.count = 0;

  const boulderGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const boulderMat = new THREE.MeshBasicMaterial({ color: '#f97316' });
  const boulderInstanced = new THREE.InstancedMesh(boulderGeo, boulderMat, 512);
  boulderInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boulderInstanced.frustumCulled = false;
  boulderInstanced.count = 0;

  // Pre-populate instance colors so GPU buffers are allocated during loading screen
  for (let i = 0; i < MAX_SOLDIER_POOL; i++) {
    torsoInstanced.setColorAt(i, _colAlly);
    shieldInstanced.setColorAt(i, _colAlly);
  }
  for (let i = 0; i < MAX_CORPSE_POOL; i++) {
    corpseInstanced.setColorAt(i, _colAllyCorpse);
  }
  if (torsoInstanced.instanceColor) torsoInstanced.instanceColor.needsUpdate = true;
  if (shieldInstanced.instanceColor) shieldInstanced.instanceColor.needsUpdate = true;
  if (corpseInstanced.instanceColor) corpseInstanced.instanceColor.needsUpdate = true;

  root.add(
    torsoInstanced,
    helmetInstanced,
    shieldInstanced,
    weaponInstanced,
    horseInstanced,
    corpseInstanced,
    arrowInstanced,
    boulderInstanced,
  );

  // 4. 3D Siege Fortifications & Engines Group (Castle Gatehouse, Curtain Walls, Battering Ram, Siege Towers, Catapults)
  const siegeGroup = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.9, flatShading: true });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: '#44403c', roughness: 0.95, flatShading: true });
  const oakDoorMat = new THREE.MeshStandardMaterial({ color: '#3b2514', roughness: 0.88, flatShading: true });

  // Left & Right Curtain Walls (z = -21.5, leaving central 5.6m gate opening)
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(20, 5.4, 2.2), stoneMat);
  wallLeft.position.set(-12.8, 2.7, -21.5);
  wallLeft.castShadow = true;
  wallLeft.receiveShadow = true;

  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(20, 5.4, 2.2), stoneMat);
  wallRight.position.set(12.8, 2.7, -21.5);
  wallRight.castShadow = true;
  wallRight.receiveShadow = true;

  // Twin Gatehouse Bastion Towers flanking the Main Gate
  const bastionLeft = new THREE.Mesh(new THREE.BoxGeometry(3.8, 7.6, 3.8), darkStoneMat);
  bastionLeft.position.set(-4.4, 3.8, -21.5);
  bastionLeft.castShadow = true;

  const bastionRight = new THREE.Mesh(new THREE.BoxGeometry(3.8, 7.6, 3.8), darkStoneMat);
  bastionRight.position.set(4.4, 3.8, -21.5);
  bastionRight.castShadow = true;

  const gateLintels = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 2.4), darkStoneMat);
  gateLintels.position.set(0, 5.5, -21.5);
  siegeGroup.add(wallLeft, wallRight, bastionLeft, bastionRight, gateLintels);

  // Merlon Crenellations along Curtain Walls
  const merlonGeo = new THREE.BoxGeometry(1.1, 0.9, 0.65);
  for (let mx = -21; mx <= 21; mx += 2.2) {
    if (Math.abs(mx) < 5.5) continue;
    const m = new THREE.Mesh(merlonGeo, darkStoneMat);
    m.position.set(mx, 5.85, -20.7);
    siegeGroup.add(m);
  }

  // Swingable Double Oak Castle Gates
  const gateLeftDoor = new THREE.Group();
  gateLeftDoor.position.set(-2.5, 0, -21.5);
  const doorLeafL = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.4, 0.38), oakDoorMat);
  doorLeafL.position.set(1.25, 2.2, 0);
  gateLeftDoor.add(doorLeafL);

  const gateRightDoor = new THREE.Group();
  gateRightDoor.position.set(2.5, 0, -21.5);
  const doorLeafR = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.4, 0.38), oakDoorMat);
  doorLeafR.position.set(-1.25, 2.2, 0);
  gateRightDoor.add(doorLeafR);

  siegeGroup.add(gateLeftDoor, gateRightDoor);

  // Wheeled Battering Ram, 2 Siege Towers, and 2 Allied Catapults
  const { root: ramGroup, ramLogMesh } = buildBatteringRamGroup();
  const towerLeftGroup = buildSiegeTowerGroup();
  const towerRightGroup = buildSiegeTowerGroup();
  const catLeft = buildCatapultGroup();
  const catRight = buildCatapultGroup();
  catLeft.root.position.set(-8.5, 0, 22.0);
  catLeft.root.rotation.y = Math.PI;
  catRight.root.position.set(8.5, 0, 22.0);
  catRight.root.rotation.y = Math.PI;

  siegeGroup.add(ramGroup, towerLeftGroup, towerRightGroup, catLeft.root, catRight.root);
  root.add(siegeGroup);

  function syncFromPool(pool: BattleMemoryPool) {
    // 1. Sync Live Soldiers -> InstancedMesh buffers
    const total = pool.soldierActiveCount;
    let liveIdx = 0;
    let horseIdx = 0;

    for (let i = 0; i < total; i++) {
      if (pool.soldierAlive[i] === 0) continue;

      const x = pool.soldierX[i];
      const z = pool.soldierZ[i];
      const yaw = pool.soldierYaw[i];
      const team = pool.soldierTeam[i];
      const div = pool.soldierDivision[i];
      const isMounted = div === 2;
      const phase = pool.soldierAnimPhase[i];
      const swing = pool.soldierAttackSwing[i];

      const yBase = pool.soldierY ? pool.soldierY[i] : 0;
      const bobY = yBase + Math.abs(Math.sin(phase)) * 0.08 + (isMounted ? 0.55 : 0);
      _pos.set(x, bobY, z);
      _euler.set(0, yaw, 0);
      _quat.setFromEuler(_euler);
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);

      torsoInstanced.setMatrixAt(liveIdx, _mat4);
      helmetInstanced.setMatrixAt(liveIdx, _mat4);
      shieldInstanced.setMatrixAt(liveIdx, _mat4);

      // Weapon matrix tilts forward during swing
      if (swing > 0.01) {
        _euler.set(swing * 0.85, yaw, 0);
        _quat.setFromEuler(_euler);
        _mat4.compose(_pos, _quat, _scale);
      }
      weaponInstanced.setMatrixAt(liveIdx, _mat4);

      const teamCol = team === 1 ? _colAlly : _colEnemy;
      torsoInstanced.setColorAt(liveIdx, teamCol);
      shieldInstanced.setColorAt(liveIdx, teamCol);

      if (isMounted) {
        _pos.set(x, Math.abs(Math.cos(phase)) * 0.07, z);
        _euler.set(0, yaw, 0);
        _quat.setFromEuler(_euler);
        _mat4.compose(_pos, _quat, _scale);
        horseInstanced.setMatrixAt(horseIdx++, _mat4);
      }

      liveIdx++;
    }

    torsoInstanced.count = liveIdx;
    helmetInstanced.count = liveIdx;
    shieldInstanced.count = liveIdx;
    weaponInstanced.count = liveIdx;
    horseInstanced.count = horseIdx;

    torsoInstanced.instanceMatrix.needsUpdate = true;
    helmetInstanced.instanceMatrix.needsUpdate = true;
    shieldInstanced.instanceMatrix.needsUpdate = true;
    weaponInstanced.instanceMatrix.needsUpdate = true;
    horseInstanced.instanceMatrix.needsUpdate = true;
    if (torsoInstanced.instanceColor) torsoInstanced.instanceColor.needsUpdate = true;
    if (shieldInstanced.instanceColor) shieldInstanced.instanceColor.needsUpdate = true;

    // 2. Sync Fallen Corpse Pool -> corpseInstanced
    const cCount = pool.corpseCount;
    for (let c = 0; c < cCount; c++) {
      _pos.set(pool.corpseX[c], pool.corpseY[c], pool.corpseZ[c]);
      _euler.set(0, pool.corpseYaw[c], 0);
      _quat.setFromEuler(_euler);
      _mat4.compose(_pos, _quat, _scale);
      corpseInstanced.setMatrixAt(c, _mat4);
      corpseInstanced.setColorAt(
        c,
        pool.corpseActive[c] === 1 ? _colAllyCorpse : _colEnemyCorpse,
      );
    }
    corpseInstanced.count = cCount;
    if (cCount > 0) {
      corpseInstanced.instanceMatrix.needsUpdate = true;
      if (corpseInstanced.instanceColor) corpseInstanced.instanceColor.needsUpdate = true;
    }

    // 3. Sync Projectile Pool (10,000 Arrows + Boulders)
    const pTotal = pool.projActiveTotal;
    let arrowIdx = 0;
    let boulderIdx = 0;

    for (let p = 0; p < pTotal; p++) {
      const st = pool.projState[p];
      if (st === 0) continue;

      const px = pool.projX[p];
      const py = pool.projY[p];
      const pz = pool.projZ[p];
      const vx = pool.projVx[p];
      const vy = pool.projVy[p];
      const vz = pool.projVz[p];

      _pos.set(px, py, pz);
      _lookDir.set(vx, vy, vz);
      if (_lookDir.lengthSq() > 0.0001) {
        _lookDir.normalize();
        _quat.setFromUnitVectors(_upZ, _lookDir);
      } else {
        _quat.identity();
      }
      _mat4.compose(_pos, _quat, _scale);

      if (pool.projKind[p] === 1 && boulderIdx < 512) {
        boulderInstanced.setMatrixAt(boulderIdx++, _mat4);
      } else {
        arrowInstanced.setMatrixAt(arrowIdx++, _mat4);
      }
    }

    arrowInstanced.count = arrowIdx;
    boulderInstanced.count = boulderIdx;
    if (arrowIdx > 0) arrowInstanced.instanceMatrix.needsUpdate = true;
    if (boulderIdx > 0) boulderInstanced.instanceMatrix.needsUpdate = true;

    // 4. Sync 3D Siege Engines & Castle Gate
    siegeGroup.visible = pool.siege.enabled;
    if (pool.siege.enabled) {
      const s = pool.siege;
      ramGroup.position.set(s.ramX, 0, s.ramZ);
      ramLogMesh.position.z = -0.35 - Math.sin(s.ramSwingPhase) * 0.42;

      towerLeftGroup.position.set(s.towerLeftX, 0, s.towerLeftZ);
      towerRightGroup.position.set(s.towerRightX, 0, s.towerRightZ);

      gateLeftDoor.rotation.y = s.gateOpenAngle;
      gateRightDoor.rotation.y = -s.gateOpenAngle;

      catLeft.armPivot.rotation.x = -s.catapultArmAngle;
      catRight.armPivot.rotation.x = -s.catapultArmAngle;
    }
  }

  return {
    root,
    torsoInstanced,
    helmetInstanced,
    shieldInstanced,
    weaponInstanced,
    horseInstanced,
    corpseInstanced,
    arrowInstanced,
    boulderInstanced,
    siegeGroup,
    ramGroup,
    ramLogMesh,
    towerLeftGroup,
    towerRightGroup,
    gateLeftDoor,
    gateRightDoor,
    catapultArmLeft: catLeft.armPivot,
    catapultArmRight: catRight.armPivot,
    syncFromPool,
  };
}
