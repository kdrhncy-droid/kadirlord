import * as THREE from 'three';
import type { SiegeEngineType } from './rules';

const wood = new THREE.MeshStandardMaterial({ color: 0x805631, roughness: 1 });
const woodLight = new THREE.MeshStandardMaterial({ color: 0xb48754, roughness: 1 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x49321f, roughness: 1 });
const iron = new THREE.MeshStandardMaterial({ color: 0x373632, roughness: 0.82, metalness: 0.15 });
const rope = new THREE.MeshStandardMaterial({ color: 0xc3a16a, roughness: 1 });

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: THREE.Vector3,
  rotation?: THREE.Euler,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.copy(rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function box(
  group: THREE.Group,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material = wood,
  rotation: [number, number, number] = [0, 0, 0],
) {
  return addMesh(
    group,
    new THREE.BoxGeometry(...size),
    material,
    new THREE.Vector3(...position),
    new THREE.Euler(...rotation),
  );
}

function beam(
  group: THREE.Group,
  from: [number, number, number],
  to: [number, number, number],
  width: number,
  material: THREE.Material = wood,
) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = addMesh(
    group,
    new THREE.BoxGeometry(width, direction.length(), width),
    material,
    start.add(end).multiplyScalar(0.5),
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function wheel(group: THREE.Group, x: number, z: number, radius = 0.29) {
  addMesh(
    group,
    new THREE.CylinderGeometry(radius, radius, 0.15, 8),
    woodDark,
    new THREE.Vector3(x, radius, z),
    new THREE.Euler(0, 0, Math.PI / 2),
  );
  addMesh(
    group,
    new THREE.CylinderGeometry(0.065, 0.065, 0.19, 6),
    iron,
    new THREE.Vector3(x, radius, z),
    new THREE.Euler(0, 0, Math.PI / 2),
  );
}

function buildTrebuchet(group: THREE.Group) {
  beam(group, [-0.78, 0.12, -0.28], [0, 1.55, -0.28], 0.17, woodLight);
  beam(group, [0.78, 0.12, -0.28], [0, 1.55, -0.28], 0.17, wood);
  beam(group, [-0.72, 0.28, -0.2], [0.72, 0.28, -0.2], 0.12, woodDark);
  beam(group, [-0.5, 0.62, -0.28], [0.5, 0.62, -0.28], 0.1, woodLight);
  box(group, [0, 0.52, -0.36], [0.72, 0.58, 0.52], woodDark);
  beam(group, [0, 1.45, -0.28], [-0.1, 3.15, 0.18], 0.18, woodLight);
  beam(group, [0, 1.56, -0.26], [0, 1.56, 0.4], 0.12, iron);
  beam(group, [-0.09, 3.12, 0.17], [-0.06, 2.58, 0.78], 0.035, rope);
  beam(group, [0.04, 3.12, 0.17], [0.12, 2.5, 0.82], 0.035, rope);
  addMesh(
    group,
    new THREE.SphereGeometry(0.16, 6, 4),
    woodDark,
    new THREE.Vector3(0.03, 2.43, 0.83),
  );
  wheel(group, -0.72, -0.25, 0.24);
  wheel(group, 0.72, -0.25, 0.24);
}

function buildMangonel(group: THREE.Group) {
  box(group, [0, 0.46, 0], [1.65, 0.2, 0.92], woodDark);
  beam(group, [-0.72, 0.48, -0.34], [-0.25, 1.08, -0.34], 0.12, woodLight);
  beam(group, [0.72, 0.48, -0.34], [0.25, 1.08, -0.34], 0.12, woodLight);
  beam(group, [-0.72, 0.48, 0.34], [-0.25, 1.08, 0.34], 0.12, wood);
  beam(group, [0.72, 0.48, 0.34], [0.25, 1.08, 0.34], 0.12, wood);
  beam(group, [0, 0.92, 0], [0, 2.25, 0.26], 0.16, woodLight);
  beam(group, [-0.08, 2.06, 0.22], [0.08, 2.06, 0.22], 0.04, rope);
  addMesh(
    group,
    new THREE.CylinderGeometry(0.15, 0.2, 0.16, 6),
    woodDark,
    new THREE.Vector3(0.08, 1.92, 0.45),
  );
  for (const x of [-0.64, 0.64]) {
    wheel(group, x, -0.38, 0.25);
    wheel(group, x, 0.38, 0.25);
  }
}

function buildBallista(group: THREE.Group) {
  beam(group, [0, 0.08, 0.34], [-0.68, 1.12, -0.16], 0.15, woodLight);
  beam(group, [0, 0.08, 0.34], [0.68, 1.12, -0.16], 0.15, wood);
  beam(group, [0, 0.08, 0.34], [0, 1.22, -0.42], 0.15, woodDark);
  box(group, [0, 1.16, 0], [0.42, 0.18, 1.25], woodDark);
  beam(group, [-1.18, 1.3, -0.08], [1.18, 1.3, -0.08], 0.14, woodLight);
  beam(group, [-1.18, 1.3, -0.08], [-0.82, 1.55, -0.08], 0.09, wood);
  beam(group, [1.18, 1.3, -0.08], [0.82, 1.55, -0.08], 0.09, wood);
  beam(group, [-0.82, 1.55, -0.08], [0.82, 1.55, -0.08], 0.035, rope);
  beam(group, [0, 1.16, -0.52], [0, 1.16, 0.52], 0.055, iron);
}

function buildRam(group: THREE.Group) {
  for (const x of [-0.88, 0.88]) {
    for (const z of [-0.75, 0.75]) {
      box(group, [x, 1.15, z], [0.14, 2.15, 0.14], woodLight);
      wheel(group, x, z, 0.3);
    }
  }
  box(group, [0, 2.16, 0], [2.05, 0.18, 1.8], woodDark);
  for (const x of [-0.84, 0, 0.84]) {
    beam(group, [x, 2.18, -0.86], [x * 0.7, 2.82, 0], 0.13, woodLight);
    beam(group, [x, 2.18, 0.86], [x * 0.7, 2.82, 0], 0.13, wood);
  }
  box(group, [0, 2.86, 0], [1.35, 0.16, 1.52], woodDark);
  for (const z of [-0.74, -0.38, 0, 0.38, 0.74]) {
    box(group, [0, 1.25, z], [1.55, 1.32, 0.07], z % 0.7 === 0 ? wood : woodLight);
  }
  beam(group, [0, 1.18, -0.38], [0, 0.92, 2.1], 0.34, woodDark);
  addMesh(
    group,
    new THREE.ConeGeometry(0.22, 0.44, 6),
    woodDark,
    new THREE.Vector3(0, 0.84, 2.18),
    new THREE.Euler(Math.PI / 2, 0, 0),
  );
}

function buildTower(group: THREE.Group) {
  const baseX = 1.02;
  const topX = 0.68;
  const baseZ = 0.88;
  const topZ = 0.62;
  for (const side of [-1, 1]) {
    beam(group, [side * baseX, 0.28, -baseZ], [side * topX, 3.62, -topZ], 0.19, woodLight);
    beam(group, [side * baseX, 0.28, baseZ], [side * topX, 3.62, topZ], 0.19, wood);
    for (const y of [0.85, 1.48, 2.1, 2.72, 3.34]) {
      const t = (y - 0.28) / (3.62 - 0.28);
      const x = baseX + (topX - baseX) * t;
      const z = baseZ + (topZ - baseZ) * t;
      box(group, [side * x, y, 0], [0.11, 0.12, z * 2], woodDark);
      box(group, [0, y, side * z], [x * 2, 0.12, 0.11], woodLight);
    }
  }
  box(group, [0, 3.72, 0], [1.6, 0.22, 1.44], woodDark);
  box(group, [0, 3.9, 0], [1.8, 0.16, 1.62], woodLight);
  for (const x of [-0.65, 0, 0.65]) {
    box(group, [x, 4.0, 0.66], [0.16, 0.28, 0.18], woodDark);
  }
  for (const x of [-0.7, 0.7]) {
    wheel(group, x, -0.62, 0.32);
    wheel(group, x, 0.62, 0.32);
  }
}

export function createSiegeEngineModel(engine: SiegeEngineType): THREE.Group {
  const group = new THREE.Group();
  group.name = `siege-engine-${engine.toLowerCase()}`;
  switch (engine) {
    case 'TREBUCHET':
      buildTrebuchet(group);
      break;
    case 'MANGONEL':
      buildMangonel(group);
      break;
    case 'BALLISTA':
      buildBallista(group);
      break;
    case 'BATTERING_RAM':
      buildRam(group);
      break;
    case 'SIEGE_TOWER':
      buildTower(group);
      break;
  }
  group.traverse((object) => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  return group;
}

export function disposeSiegeEngineModel(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}

const vignetteCache = new Map<string, string | null>();

function addVignetteBanner(
  group: THREE.Object3D,
  x: number,
  z: number,
  factionColor: THREE.ColorRepresentation,
) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 1.45, 6),
    woodDark,
  );
  pole.position.set(x, 4.25, z);
  group.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.54),
    new THREE.MeshStandardMaterial({
      color: factionColor,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
  );
  cloth.position.set(x + 0.34, 4.5, z + 0.02);
  cloth.rotation.y = 0.18;
  group.add(cloth);
}

function addVignetteTent(
  scene: THREE.Scene,
  x: number,
  z: number,
  factionColor: THREE.ColorRepresentation,
) {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.68, 0.92, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d1c4, roughness: 1 }),
  );
  body.position.set(x, 0.46, z);
  scene.add(body);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 1.28, 8),
    new THREE.MeshStandardMaterial({ color: factionColor, roughness: 1 }),
  );
  roof.position.set(x, 1.45, z);
  scene.add(roof);
}

export function getCachedSiegeVignette(factionColor: string): string | null | undefined {
  return vignetteCache.get(factionColor);
}

export function renderSiegeVignette(factionColor: string): string | null {
  if (vignetteCache.has(factionColor)) return vignetteCache.get(factionColor) ?? null;
  if (typeof document === 'undefined') {
    vignetteCache.set(factionColor, null);
    return null;
  }

  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(720, 480, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const camera = new THREE.OrthographicCamera(-8.3, 8.3, 5.55, -5.55, 0.1, 80);
    camera.position.set(10, 8.3, 15);
    camera.lookAt(0, 2.1, 0);
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 32),
      new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          void main() {
            vec3 night = vec3(0.055, 0.085, 0.15);
            vec3 dusk = vec3(0.31, 0.23, 0.31);
            vec3 ember = vec3(0.76, 0.40, 0.24);
            float horizon = smoothstep(0.02, 0.72, vUv.y);
            vec3 color = mix(ember, dusk, horizon);
            color = mix(color, night, smoothstep(0.52, 1.0, vUv.y));
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    );
    sky.position.set(0, 0, -24);
    camera.add(sky);
    scene.add(camera);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 32),
      new THREE.MeshStandardMaterial({ color: 0x342b25, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    scene.add(ground);

    const stone = new THREE.MeshStandardMaterial({ color: 0x827565, roughness: 1 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x51483f, roughness: 1 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(9.4, 3.2, 0.72), stone);
    wall.position.set(0, 1.56, -3.9);
    scene.add(wall);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.25, 0.8), stoneDark);
    gate.position.set(0, 1.12, -3.42);
    scene.add(gate);
    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.32, 5.1, 8),
        stone,
      );
      tower.position.set(side * 5.2, 2.45, -3.55);
      scene.add(tower);
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(1.34, 1.34, 0.3, 8),
        stoneDark,
      );
      crown.position.set(side * 5.2, 5.08, -3.55);
      scene.add(crown);
      for (let merlon = 0; merlon < 6; merlon++) {
        const angle = (merlon / 6) * Math.PI * 2;
        const crenel = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.38, 0.28),
          stone,
        );
        crenel.position.set(
          side * 5.2 + Math.cos(angle) * 1.12,
          5.35,
          -3.55 + Math.sin(angle) * 1.12,
        );
        scene.add(crenel);
      }
      addVignetteBanner(scene, side * 5.2, -2.4, factionColor);
    }
    for (let index = 0; index < 9; index++) {
      const crenel = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.42, 0.76),
        index % 2 ? stone : stoneDark,
      );
      crenel.position.set(-4.25 + index * 1.06, 3.43, -3.9);
      scene.add(crenel);
    }
    for (const side of [-1, 1]) {
      const buttress = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 2.3, 1.0),
        stoneDark,
      );
      buttress.position.set(side * 2.65, 1.05, -3.25);
      scene.add(buttress);
    }

    const towerModel = createSiegeEngineModel('SIEGE_TOWER');
    towerModel.position.set(3.35, 0, 0.05);
    towerModel.rotation.y = Math.PI;
    towerModel.scale.setScalar(0.8);
    scene.add(towerModel);
    const trebuchetModel = createSiegeEngineModel('TREBUCHET');
    trebuchetModel.position.set(-3.45, 0, 0.4);
    trebuchetModel.rotation.y = Math.PI;
    trebuchetModel.scale.setScalar(0.88);
    scene.add(trebuchetModel);
    addVignetteTent(scene, -5.2, 3.4, factionColor);
    addVignetteTent(scene, -1.0, 4.5, factionColor);
    addVignetteTent(scene, 1.0, 4.4, factionColor);
    addVignetteTent(scene, 5.15, 3.35, factionColor);

    scene.add(new THREE.HemisphereLight(0xb9cce7, 0x34251c, 1.2));
    const warmKey = new THREE.DirectionalLight(0xffc58b, 2.1);
    warmKey.position.set(-5, 9, 8);
    scene.add(warmKey);
    const rim = new THREE.DirectionalLight(0xff7848, 2.5);
    rim.position.set(4, 7, -7);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xa7c5e8, 0.75);
    fill.position.set(6, 4, 8);
    scene.add(fill);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    vignetteCache.set(factionColor, url);
    return url;
  } catch {
    vignetteCache.set(factionColor, null);
    return null;
  } finally {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}
