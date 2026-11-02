import * as THREE from 'three';
import { getFieldElevation } from './arenaTypes';
import { createArcheryTarget } from './characterRig';

export interface ArenaEnvironmentHandles {
  floorMesh: THREE.Mesh;
  arenaPerimeterGroup: THREE.Group;
  sunLight: THREE.DirectionalLight;
  skyFill: THREE.HemisphereLight;
  rimLight: THREE.DirectionalLight;
}

/**
 * Builds the battlefield terrain, procedural trees/rocks/fences,
 * wooden palisade / arena walls, archery targets, and realistic outdoor lighting.
 */
export function setupArenaEnvironment(
  scene: THREE.Scene,
  isFieldOrSiege: boolean,
  effectiveMode: 'ARENA' | 'FIELD' | 'SIEGE' | null
): ArenaEnvironmentHandles {
  // ---- Arena Environment / Battlefield Terrain ----
  const floorGeo = isFieldOrSiege
    ? new THREE.PlaneGeometry(540, 540, 48, 48)
    : new THREE.CylinderGeometry(18, 18, 0.2, 32);

  if (isFieldOrSiege && effectiveMode !== 'SIEGE') {
    const pos = floorGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const elev = getFieldElevation(vx, -vy);
      pos.setZ(i, elev);
    }
    floorGeo.computeVertexNormals();
  }

  const floorMat = new THREE.MeshStandardMaterial({
    color: isFieldOrSiege ? '#425828' : '#453526',
    roughness: 0.94,
    metalness: 0.03,
    flatShading: true,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  if (isFieldOrSiege) {
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = 0;
  } else {
    floor.position.y = -0.1;
  }
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- Procedural Battlefield Scenery (Pine Trees, Boulders, Old Pasture Fences) ----
  const sceneryGroup = new THREE.Group();
  if (isFieldOrSiege && effectiveMode !== 'SIEGE') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#332015', roughness: 0.95 });
    const foliageMat1 = new THREE.MeshStandardMaterial({ color: '#1e3818', roughness: 0.9, flatShading: true });
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: '#27471f', roughness: 0.9, flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.8, 6);
    const coneGeo1 = new THREE.ConeGeometry(2.1, 2.8, 6);
    const coneGeo2 = new THREE.ConeGeometry(1.6, 2.4, 6);

    const treeSeeds = [
      { x: -32, z: 25 }, { x: -44, z: 50 }, { x: -28, z: 75 }, { x: -38, z: 0 },
      { x: -45, z: -35 }, { x: -30, z: -65 }, { x: -50, z: -85 }, { x: -35, z: 95 },
      { x: 34, z: 20 }, { x: 42, z: 45 }, { x: 30, z: 70 }, { x: 40, z: -10 },
      { x: 46, z: -45 }, { x: 32, z: -70 }, { x: 48, z: -90 }, { x: 36, z: 100 },
      { x: -18, z: -115 }, { x: 5, z: -125 }, { x: 22, z: -120 }, { x: -12, z: 125 }, { x: 18, z: 130 },
    ];

    treeSeeds.forEach((seed, i) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.9;
      trunk.castShadow = true;
      tree.add(trunk);

      const f1 = new THREE.Mesh(coneGeo1, i % 2 === 0 ? foliageMat1 : foliageMat2);
      f1.position.y = 3.6;
      f1.castShadow = true;
      tree.add(f1);

      const f2 = new THREE.Mesh(coneGeo2, i % 2 === 0 ? foliageMat2 : foliageMat1);
      f2.position.y = 5.0;
      f2.castShadow = true;
      tree.add(f2);

      const elev = getFieldElevation(seed.x, seed.z);
      tree.position.set(seed.x, elev, seed.z);
      const sc = 0.85 + (i % 5) * 0.12;
      tree.scale.set(sc, sc, sc);
      sceneryGroup.add(tree);
    });

    const rockMat = new THREE.MeshStandardMaterial({ color: '#57554f', roughness: 0.92, flatShading: true });
    const rockSeeds = [
      { x: -22, z: 35, s: 1.4 }, { x: 24, z: 30, s: 1.6 },
      { x: -18, z: -40, s: 1.3 }, { x: 20, z: -48, s: 1.7 },
      { x: -35, z: 5, s: 2.1 }, { x: 36, z: -5, s: 1.9 },
      { x: -10, z: 85, s: 1.5 }, { x: 12, z: -95, s: 1.6 },
    ];
    rockSeeds.forEach((r, i) => {
      const geo = new THREE.DodecahedronGeometry(r.s, 0);
      const mesh = new THREE.Mesh(geo, rockMat);
      const elev = getFieldElevation(r.x, r.z);
      mesh.position.set(r.x, elev + r.s * 0.5, r.z);
      mesh.rotation.set(i * 0.4, i * 0.7, i * 0.3);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneryGroup.add(mesh);
    });

    const fenceMat = new THREE.MeshStandardMaterial({ color: '#4a3525', roughness: 0.9 });
    const fencePostGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.3, 5);
    const railGeo = new THREE.BoxGeometry(3.2, 0.1, 0.12);
    const fenceCoords = [
      { x: -24, z: 12, rot: 0.3 }, { x: -27, z: 15, rot: 0.4 },
      { x: 25, z: -15, rot: -0.2 }, { x: 28, z: -12, rot: -0.1 },
    ];
    fenceCoords.forEach((fc) => {
      const fGroup = new THREE.Group();
      const post1 = new THREE.Mesh(fencePostGeo, fenceMat);
      post1.position.set(-1.4, 0.65, 0);
      const post2 = new THREE.Mesh(fencePostGeo, fenceMat);
      post2.position.set(1.4, 0.65, 0);
      const rail1 = new THREE.Mesh(railGeo, fenceMat);
      rail1.position.set(0, 0.5, 0);
      const rail2 = new THREE.Mesh(railGeo, fenceMat);
      rail2.position.set(0, 0.9, 0);
      fGroup.add(post1, post2, rail1, rail2);
      const elev = getFieldElevation(fc.x, fc.z);
      fGroup.position.set(fc.x, elev, fc.z);
      fGroup.rotation.y = fc.rot;
      sceneryGroup.add(fGroup);
    });
  }
  scene.add(sceneryGroup);

  const arenaPerimeterGroup = new THREE.Group();
  if (isFieldOrSiege) {
    arenaPerimeterGroup.visible = false;
  }
  scene.add(arenaPerimeterGroup);

  // Stone wall
  const wallGeo = new THREE.TorusGeometry(17.8, 0.4, 8, 32);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#2b231a', roughness: 0.9, flatShading: true });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.rotation.x = Math.PI * 0.5;
  wall.position.y = 0.2;
  arenaPerimeterGroup.add(wall);

  // Palisade posts
  const palisadeGroup = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.8, 5);
  const postMat = new THREE.MeshStandardMaterial({ color: '#2d1e13', roughness: 0.9 });
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(Math.cos(angle) * 18.2, 1.4, Math.sin(angle) * 18.2);
    post.castShadow = true;
    palisadeGroup.add(post);
  }
  arenaPerimeterGroup.add(palisadeGroup);

  // ---- Lighting ----
  const sunLight = new THREE.DirectionalLight(isFieldOrSiege ? '#fffdf5' : '#fffbeb', isFieldOrSiege ? 2.6 : 2.2);
  sunLight.position.set(16, 28, 14);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 380;
  sunLight.shadow.camera.left = -110;
  sunLight.shadow.camera.right = 110;
  sunLight.shadow.camera.top = 110;
  sunLight.shadow.camera.bottom = -110;
  scene.add(sunLight);

  const skyFill = new THREE.HemisphereLight(
    isFieldOrSiege ? '#a5d0fa' : '#fef08a',
    isFieldOrSiege ? '#384d20' : '#181410',
    isFieldOrSiege ? 1.15 : 0.85,
  );
  scene.add(skyFill);

  const rimLight = new THREE.DirectionalLight('#93c5fd', 0.7);
  rimLight.position.set(-10, 8, -12);
  scene.add(rimLight);

  // ---- Interactive Archery Target ----
  const archeryTarget = createArcheryTarget();
  archeryTarget.position.set(-5.5, 0, -8);
  archeryTarget.rotation.y = 0.5;
  arenaPerimeterGroup.add(archeryTarget);

  return {
    floorMesh: floor,
    arenaPerimeterGroup,
    sunLight,
    skyFill,
    rimLight,
  };
}
