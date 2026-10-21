import * as THREE from 'three';
import { CharacterAnimator } from './characterAnimator.ts';
import { createFace, applyFaceDNA } from './characterFace.ts';
import {
  applyArmoryArmor,
  armoryVisualsEnabled,
  clearArmoryArmor,
  createArmoryArrow,
  createArmoryHelmet,
  createArmoryShield,
  createArmoryWeapon,
  resolveWeaponId,
  type ArmoryContext,
} from './armoryBridge.ts';
import type { CharacterAnimState } from './characterAnimator.ts';
import {
  SHIELD_REST_POSITION,
  SHIELD_REST_ROTATION,
  SHIELD_SCALE,
} from './equipmentPose.ts';

export type { CharacterAnimState } from './characterAnimator.ts';

export type WeaponType = 'ONE_HANDED_SWORD' | 'TWO_HANDED_SWORD' | 'BOW' | 'SPEAR' | 'UNARMED';
export type ShieldType = 'NONE' | 'ROUND_SHIELD' | 'KITE_SHIELD' | 'PAVISE';
export type HelmetType = 'NONE' | 'KETTLE_HAT' | 'SPANGENHELM' | 'IMPERIAL_VISOR';
export type ArmorTier = 'CIVILIAN' | 'LEATHER' | 'CHAINMAIL' | 'PLATE';

export type {
  CharacterMorphDNA,
  GenderType,
  FaceShape,
  HairStyleId,
  BeardStyleId,
  ScarType,
  WarPaintType,
} from './characterMorph.ts';
export {
  applyMorphDNAToRig,
  getLordDNA,
  LORD_DNA_PRESETS,
  PLAYER_DEFAULT_DNA,
  generateRandomDNA,
  createHairMesh,
  createBeardMesh,
} from './characterMorph.ts';

/**
 * RIG CONVENTIONS (keep these in mind when authoring poses):
 *  - Character faces +Z. Character's LEFT side is +X, RIGHT side is -X. Up is +Y.
 *  - Every limb segment points along its local -Y axis.
 *  - Arm raise forward  = shoulder.rotation.x NEGATIVE
 *  - Elbow flex         = forearm.rotation.x NEGATIVE
 *  - Thigh lift forward = thigh.rotation.x NEGATIVE, knee bend = shin.rotation.x POSITIVE
 *  - Torso lean forward = torso.rotation.x POSITIVE, turn left = rotation.y POSITIVE
 *  - Hand-held items: main axis (blade / shaft / bow limbs / shield face) = hand local +Z.
 */
export const RIG_DIMENSIONS = {
  pelvisHeight: 0.98,
  upperArm: 0.28,
  forearm: 0.26,
  shoulderX: 0.32,
};

/** Head ellipsoid (head-local). Hair and helmets are authored against this. */
export const HEAD = { r: 0.125, sy: 1.12, sz: 1.05, cy: 0.14, seg: 8, rings: 8 };
/** Chest depth scale (torso + body armor). */
export const TORSO_DEPTH_SCALE = 0.8;

export interface CharacterVisualOptions {
  skinTone?: string;
  hairColor?: string;
  beardColor?: string;
  factionColor?: string;
  hasBeard?: boolean;
  /** Oyun fraksiyonu (vlandia, khuzait, player ...) — BannerForge paletini seçer. */
  factionId?: string;
  weaponType: WeaponType;
  shieldType: ShieldType;
  helmetType: HelmetType;
  armorTier: ArmorTier;
}

export interface BowParts {
  group: THREE.Group;
  stringGeo: THREE.BufferGeometry;
  /** Bow-local rest position of the string nock point. */
  restNock: THREE.Vector3;
  /** Bow-local riser (arrow rest) point. */
  arrowRest: THREE.Vector3;
  nockedArrow: THREE.Group;
}

export interface CharacterRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;

  leftShoulder: THREE.Group;
  leftUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  leftHand: THREE.Group;

  rightShoulder: THREE.Group;
  rightUpperArm: THREE.Group;
  rightForearm: THREE.Group;
  rightHand: THREE.Group;

  leftThigh: THREE.Group;
  leftShin: THREE.Group;
  leftFoot: THREE.Group;

  rightThigh: THREE.Group;
  rightShin: THREE.Group;
  rightFoot: THREE.Group;

  // Equipment sockets
  helmetSocket: THREE.Group;
  chestArmorSocket: THREE.Group;
  leftPauldronSocket: THREE.Group;
  rightPauldronSocket: THREE.Group;
  rightWeaponSocket: THREE.Group;
  leftShieldSocket: THREE.Group;
  backSocket: THREE.Group;
  hipSocket: THREE.Group;

  /** Item currently held in the right hand (sword / spear) or null. */
  mainHandItem: THREE.Group | null;
  /** Item currently held in the left hand (shield / bow) or null. */
  offHandItem: THREE.Group | null;
  bow: BowParts | null;
  sheathed: boolean;

  /** @deprecated kept for backward compatibility; use rig.bow.nockedArrow */
  nockedArrowMesh: THREE.Group | null;
  /** @deprecated kept for backward compatibility */
  bowStringLine: THREE.Line | null;

  hairGroup: THREE.Group;
  beardMesh: THREE.Mesh;
  currentOptions: CharacterVisualOptions;
  materials: {
    skin: THREE.MeshStandardMaterial;
    hair: THREE.MeshStandardMaterial;
    cloth: THREE.MeshStandardMaterial;
    leather: THREE.MeshStandardMaterial;
    metal: THREE.MeshStandardMaterial;
    gold: THREE.MeshStandardMaterial;
    wood: THREE.MeshStandardMaterial;
    faction: THREE.MeshStandardMaterial;
    /** Kapitone keten (gambeson / dolgun zırh astarı). */
    padded: THREE.MeshStandardMaterial;
  };
}

function createRigMaterials(options: CharacterVisualOptions) {
  const std = (color: string, roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  return {
    skin: std(options.skinTone || '#dfa882', 0.8, 0.05),
    hair: std(options.hairColor || '#382212', 0.9, 0),
    cloth: std(options.factionColor || '#991b1b', 0.75, 0.1),
    leather: std('#4e2f1d', 0.85, 0.15),
    metal: std('#94a3b8', 0.35, 0.85),
    gold: std('#fbbf24', 0.3, 0.9),
    wood: std('#78350f', 0.8, 0.05),
    faction: std(options.factionColor || '#b45309', 0.65, 0.1),
    padded: std('#9c7a52', 0.88, 0.03),
    // Ten gölgesi: burun deliği, ağız çizgisi ve parmak olukları için.
    skinShadow: std('#b8825f', 0.9, 0),
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/**
 * Procedurally constructs an articulated low-poly humanoid rig.
 */
export function createCharacterRig(initialOptions?: Partial<CharacterVisualOptions>): CharacterRig {
  const options: CharacterVisualOptions = {
    skinTone: '#dfa882',
    hairColor: '#382212',
    beardColor: '#382212',
    factionColor: '#b45309',
    hasBeard: true,
    weaponType: 'ONE_HANDED_SWORD',
    shieldType: 'ROUND_SHIELD',
    helmetType: 'SPANGENHELM',
    armorTier: 'CHAINMAIL',
    ...initialOptions,
  };

  const mats = createRigMaterials(options);
  const root = new THREE.Group();
  root.name = 'Humanoid_Root';

  // --- Pelvis ---
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.y = RIG_DIMENSIONS.pelvisHeight;
  root.add(pelvis);
  pelvis.add(mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), mats.leather));

  // Tunic skirt (gives the silhouette a medieval look and hides the hip joints)
  const skirt = mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.3, 6, 1, true), mats.cloth);
  skirt.position.y = -0.14;
  (skirt.material as THREE.Material).side = THREE.FrontSide;
  pelvis.add(skirt);

  // Hip socket (character's left hip, +X) for sheathed one-handed weapons
  const hipSocket = new THREE.Group();
  hipSocket.name = 'hipSocket';
  hipSocket.position.set(0.21, -0.02, 0.04);
  pelvis.add(hipSocket);

  // --- Torso ---
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.16;
  pelvis.add(torso);

  const torsoMesh = mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.46, 6), mats.cloth);
  torsoMesh.position.y = 0.23;
  torsoMesh.scale.z = TORSO_DEPTH_SCALE; // flatter chest -> arms don't sink into the body
  torso.add(torsoMesh);

  const beltMesh = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6), mats.leather, false);
  beltMesh.position.y = 0.04;
  beltMesh.scale.z = TORSO_DEPTH_SCALE + 0.04;
  torso.add(beltMesh);

  const buckleMesh = mesh(new THREE.BoxGeometry(0.08, 0.07, 0.04), mats.gold, false);
  buckleMesh.position.set(0, 0.04, 0.2 * (TORSO_DEPTH_SCALE + 0.04));
  torso.add(buckleMesh);

  const chestArmorSocket = new THREE.Group();
  chestArmorSocket.position.y = 0.24;
  torso.add(chestArmorSocket);

  const backSocket = new THREE.Group();
  backSocket.name = 'backSocket';
  backSocket.position.set(0, 0.26, -0.2);
  torso.add(backSocket);

  // --- Neck & Head ---
  const neck = new THREE.Group();
  neck.position.y = 0.48;
  torso.add(neck);
  const neckMesh = mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 6), mats.skin, false);
  neckMesh.position.y = 0.06;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.12;
  neck.add(head);

  // Head = low-poly ellipsoid. Hair & helmets share the SAME segment layout and are
  // strictly larger, so their faces can never intersect / z-fight with the skull.
  const headMesh = mesh(new THREE.SphereGeometry(HEAD.r, HEAD.seg, HEAD.rings), mats.skin);
  headMesh.scale.set(1, HEAD.sy, HEAD.sz);
  headMesh.position.y = HEAD.cy;
  head.add(headMesh);

  // Yüz katmanı (gözler, kaşlar, burun, ağız, kulak, çene) ayrı bir grup olarak
  // kurulur; DNA kaydırıcıları bu gruba uygulanır (characterFace.ts).
  const face = createFace({ skin: mats.skin, hair: mats.hair }, undefined, HEAD.cy);
  head.add(face);

  // Hair: a cap over the skull (stops above the brow) + a back piece over the nape.
  const hairGroup = new THREE.Group();
  hairGroup.name = 'hair';
  const hairCap = mesh(
    // rings aligned with the head: 3 of 8 rings (stops above the brow)
    new THREE.SphereGeometry(HEAD.r + 0.014, HEAD.seg, 3, 0, Math.PI * 2, 0, (Math.PI * 3) / HEAD.rings),
    mats.hair,
    false,
  );
  hairCap.scale.set(1, HEAD.sy, HEAD.sz);
  hairCap.position.y = HEAD.cy;
  const hairBack = mesh(
    // back half (left side -> back -> right side), from the cap edge down to the nape
    new THREE.SphereGeometry(HEAD.r + 0.011, HEAD.seg / 2, 3, Math.PI, Math.PI, (Math.PI * 3) / HEAD.rings, (Math.PI * 3) / HEAD.rings),
    mats.hair,
    false,
  );
  hairBack.scale.set(1, HEAD.sy, HEAD.sz);
  hairBack.position.y = HEAD.cy;
  hairGroup.add(hairCap, hairBack);
  head.add(hairGroup);

  // Eski kutu sakal kaldırıldı: sakal artık `createBeardMesh` ile prosedürel
  // olarak çeneye oturuyor. `beardMesh` alanı geriye dönük uyumluluk için boş
  // bir taşıyıcı olarak duruyor.
  const beardMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.hair);
  beardMesh.name = 'LegacyBeardPlaceholder';
  beardMesh.visible = false;
  head.add(beardMesh);

  // Helmet socket sits at the CENTER of the head ellipsoid.
  const helmetSocket = new THREE.Group();
  helmetSocket.position.y = HEAD.cy;
  head.add(helmetSocket);

  // --- Arms ---
  const upperArmGeo = new THREE.CylinderGeometry(0.07, 0.06, RIG_DIMENSIONS.upperArm, 6);
  const forearmGeo = new THREE.CylinderGeometry(0.06, 0.05, RIG_DIMENSIONS.forearm, 6);
  /* ── El ──
     Eski el tek bir 0.07 × 0.09 × 0.08 kutu idi: ön planda "tuğla" gibi
     görünüyordu. Yeni el dört parçadan oluşur (toplam ~44 üçgen):
       avuç (hafif daralan prizma) + parmak bloğu (hafif kıvrık) + başparmak + bilek.
     Parmaklar ayrı ayrı modellenmez (low-poly hedef); blok içinde iki sığ oluk
     parmak izlenimini verir. */
  const palmGeo = new THREE.BoxGeometry(0.062, 0.062, 0.034);
  const fingerGeo = new THREE.BoxGeometry(0.058, 0.05, 0.03);
  const thumbGeo = new THREE.BoxGeometry(0.019, 0.036, 0.022);
  const wristGeo = new THREE.CylinderGeometry(0.045, 0.041, 0.022, 6);

  const buildArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * RIG_DIMENSIONS.shoulderX, 0.42, 0);
    torso.add(shoulder);

    const pauldron = new THREE.Group();
    shoulder.add(pauldron);

    const upperArm = new THREE.Group();
    shoulder.add(upperArm);
    const ua = mesh(upperArmGeo, mats.cloth);
    ua.position.y = -RIG_DIMENSIONS.upperArm / 2;
    upperArm.add(ua);

    const forearm = new THREE.Group();
    forearm.position.y = -RIG_DIMENSIONS.upperArm;
    upperArm.add(forearm);
    const fa = mesh(forearmGeo, mats.leather);
    fa.position.y = -RIG_DIMENSIONS.forearm / 2;
    forearm.add(fa);

    const hand = new THREE.Group();
    hand.position.y = -RIG_DIMENSIONS.forearm;
    forearm.add(hand);

    // Bilek: kolun bittiği yeri örter (ten ile deri arası geçiş).
    const wrist = mesh(wristGeo, mats.leather, false);
    wrist.position.y = -0.004;
    hand.add(wrist);

    // Avuç: bileğin hemen altında, hafif daralan.
    const palm = mesh(palmGeo, mats.skin, false);
    palm.position.y = -0.038;
    palm.scale.set(1, 1, 1);
    hand.add(palm);

    // Parmak bloğu: avucun altında, hafif öne kıvrık (gevşek yumruk).
    const fingers = mesh(fingerGeo, mats.skin, false);
    fingers.position.set(0, -0.079, 0.004);
    fingers.rotation.x = -0.28;
    fingers.scale.set(0.98, 1, 1);
    hand.add(fingers);

    // Parmak izlenimi: iki ince oluk (koyu ten gölgesi değil, geometri aralığı).
    for (const dx of [-0.014, 0.014]) {
      const groove = mesh(new THREE.BoxGeometry(0.004, 0.044, 0.031), mats.skinShadow, false);
      groove.position.set(dx, -0.077, 0.005);
      groove.rotation.x = -0.28;
      hand.add(groove);
    }

    // Başparmak: avucun iç yanında, hafif dışa dönük.
    const thumb = mesh(thumbGeo, mats.skin, false);
    thumb.position.set(side * -0.033, -0.034, 0.016);
    thumb.rotation.z = side * 0.42;
    thumb.rotation.x = -0.18;
    hand.add(thumb);

    const socket = new THREE.Group();
    hand.add(socket);
    return { shoulder, pauldron, upperArm, forearm, hand, socket };
  };

  const L = buildArm(1); // character's left  (+X)
  const R = buildArm(-1); // character's right (-X)

  // --- Legs ---
  const thighGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.42, 6);
  const shinGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.42, 6);
  const footGeo = new THREE.BoxGeometry(0.1, 0.08, 0.22);

  const buildLeg = (side: 1 | -1) => {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.12, -0.1, 0);
    pelvis.add(thigh);
    const tm = mesh(thighGeo, mats.cloth);
    tm.position.y = -0.21;
    thigh.add(tm);

    const shin = new THREE.Group();
    shin.position.y = -0.42;
    thigh.add(shin);
    const sm = mesh(shinGeo, mats.leather);
    sm.position.y = -0.21;
    shin.add(sm);

    const foot = new THREE.Group();
    foot.position.set(0, -0.42, 0.0);
    shin.add(foot);
    const fm = mesh(footGeo, mats.leather);
    fm.position.set(0, -0.04, 0.05);
    foot.add(fm);
    return { thigh, shin, foot };
  };

  const LL = buildLeg(1);
  const RL = buildLeg(-1);

  const rig: CharacterRig = {
    root,
    pelvis,
    torso,
    neck,
    head,
    leftShoulder: L.shoulder,
    leftUpperArm: L.upperArm,
    leftForearm: L.forearm,
    leftHand: L.hand,
    rightShoulder: R.shoulder,
    rightUpperArm: R.upperArm,
    rightForearm: R.forearm,
    rightHand: R.hand,
    leftThigh: LL.thigh,
    leftShin: LL.shin,
    leftFoot: LL.foot,
    rightThigh: RL.thigh,
    rightShin: RL.shin,
    rightFoot: RL.foot,
    helmetSocket,
    chestArmorSocket,
    leftPauldronSocket: L.pauldron,
    rightPauldronSocket: R.pauldron,
    rightWeaponSocket: R.socket,
    leftShieldSocket: L.socket,
    backSocket,
    hipSocket,
    mainHandItem: null,
    offHandItem: null,
    bow: null,
    sheathed: false,
    nockedArrowMesh: null,
    bowStringLine: null,
    hairGroup,
    beardMesh,
    currentOptions: options,
    materials: mats,
  };

  applyEquipmentToRig(rig, options);
  return rig;
}

/** Disposes geometries (and non-shared materials) of an equipment subtree. */
function disposeEquipment(obj: THREE.Object3D, rig: CharacterRig) {
  const shared = new Set<THREE.Material>(Object.values(rig.materials));
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) {
      (Array.isArray(mat) ? mat : [mat]).forEach((mm) => {
        if (!shared.has(mm)) mm.dispose();
      });
    }
  });
}

/** Live-updates colors / beard without rebuilding the rig. */
export function applyCosmeticsToRig(
  rig: CharacterRig,
  cosmetics: { factionColor?: string; hasBeard?: boolean; skinTone?: string; hairColor?: string },
) {
  if (cosmetics.factionColor) {
    rig.materials.cloth.color.set(cosmetics.factionColor);
    rig.materials.faction.color.set(cosmetics.factionColor);
    rig.currentOptions.factionColor = cosmetics.factionColor;
  }
  if (cosmetics.skinTone) rig.materials.skin.color.set(cosmetics.skinTone);
  if (cosmetics.hairColor) rig.materials.hair.color.set(cosmetics.hairColor);
  if (cosmetics.hasBeard !== undefined) {
    rig.currentOptions.hasBeard = cosmetics.hasBeard;
    const isEnclosed = rig.currentOptions.helmetType === 'IMPERIAL_VISOR';
    rig.beardMesh.visible = cosmetics.hasBeard && !isEnclosed;
  }
}

/** Toggles wireframe on every material of the rig (including equipment). */
export function setRigWireframe(rig: CharacterRig, wireframe: boolean) {
  rig.root.traverse((child) => {
    const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    (Array.isArray(mat) ? mat : [mat]).forEach((m) => {
      if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
    });
  });
}

// ---------------------------------------------------------------------------
// Equipment builders. All hand items are authored in HAND space:
//   +Z = item main axis, hand origin = grip point.
// ---------------------------------------------------------------------------

function buildHelmet(type: HelmetType, m: CharacterRig['materials']): THREE.Group | null {
  const { metal, gold } = m;
  if (type === 'NONE') return null;

  if (type === 'KETTLE_HAT') {
    // Kettle Hat: Wide-brimmed medieval war hat worn over the skull
    const g = new THREE.Group();
    // Dome sits snugly on the head ellipsoid
    const dome = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.016, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.52),
      metal,
    );
    dome.scale.set(1, HEAD.sy, HEAD.sz);
    dome.position.y = 0.01;

    // Sloping brim — 0.58 m çap göz hizasını kesiyordu; 0.49 m'ye indirildi
    // ve kaşların biraz üstüne alındı.
    const brim = mesh(new THREE.CylinderGeometry(0.196, 0.245, 0.016, 12), metal);
    brim.position.y = 0.052;

    // Rim reinforcement
    const rim = mesh(new THREE.TorusGeometry(0.245, 0.006, 4, 12), gold, false);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.05;

    g.add(dome, brim, rim);
    return g;
  }

  if (type === 'SPANGENHELM') {
    // Spangenhelm: Conical Norman skull cap with nasal bar and mail coif
    const g = new THREE.Group();

    // Conical skull cap
    const cone = mesh(new THREE.ConeGeometry(HEAD.r + 0.02, 0.22, 8), metal);
    cone.scale.set(1, 1, HEAD.sz);
    cone.position.y = 0.12;

    // Decorative brass brow band
    const band = mesh(new THREE.CylinderGeometry(HEAD.r + 0.022, HEAD.r + 0.022, 0.035, 8), gold, false);
    band.scale.set(1, 1, HEAD.sz);
    band.position.y = 0.01;

    // Nasal bar guarding the face
    const nasal = mesh(new THREE.BoxGeometry(0.028, 0.1, 0.02), metal, false);
    nasal.position.set(0, -0.015, (HEAD.r + 0.022) * HEAD.sz + 0.005);

    // Mail aventail / coif covering nape and neck
    const mailCoif = mesh(new THREE.CylinderGeometry(0.146, 0.17, 0.17, 8, 1, true), metal);
    mailCoif.scale.set(1, 1, HEAD.sz);
    mailCoif.position.set(0, -0.075, -0.012);

    g.add(cone, band, nasal, mailCoif);
    return g;
  }

  if (type === 'IMPERIAL_VISOR') {
    /*
     * Katafrakt miğferi — üçüncü (son) sürüm.
     *
     * İlk iki denemede sorun şuydu: yüz plakaları **kutu** olarak tek tek
     * yerleştiriliyordu; arada ten kalıyor, plakalar birbirine değmiyor ve
     * "yüz açıkta" görünüyordu. Artık maske, kafatasını saran **halka**
     * (silindir) parçalarından kurulur:
     *   kubbe → alın halkası → göz yarığı (içe gömük koyu halka) → çene
     *   halkası → boyun zırhı.
     * Halkalar tam tur olduğu için yüz hiçbir açıdan açıkta kalmaz; göz
     * yarığı yalnızca **içe gömük** koyu halka olarak okunur.
     */
    const g = new THREE.Group();

    // 1) Kubbe: alın hizasında biten yarım küre (yüzü kapatmaz).
    const dome = mesh(
      new THREE.SphereGeometry(0.132, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.46),
      metal,
    );
    dome.scale.set(1, 1.12, 1.06);
    dome.position.y = 0.012;

    // 2) Alın halkası — göz yarığının üstü.
    // 12 kenar: 10 kenarda çokgenin iç yarıçapı kafatasına eşitleniyor ve
    // ten, plakaların arasından "sızıyordu" (kulak/göz hizasında bej lekeler).
    const browBand = mesh(new THREE.CylinderGeometry(0.139, 0.141, 0.05, 12), metal, false);
    browBand.scale.z = 1.05;
    browBand.position.y = 0.043;

    // 3) Göz yarığı: 6 mm daha içeride koyu halka → gerçek "yuva" hissi.
    const slitMat = new THREE.MeshBasicMaterial({ color: '#0a0908' });
    const eyeSlit = new THREE.Mesh(new THREE.CylinderGeometry(0.1355, 0.1355, 0.03, 12), slitMat);
    eyeSlit.scale.z = 1.05;
    eyeSlit.position.y = 0.0;
    eyeSlit.name = 'visorEyeSlit';

    // 4) Çene halkası — ağız ve çeneyi tamamen örter, çeneye doğru daralır.
    const jawBand = mesh(new THREE.CylinderGeometry(0.138, 0.104, 0.15, 12), metal, false);
    jawBand.scale.z = 1.05;
    jawBand.position.y = -0.091;

    // 5) Burun sırtı — göz yarığını ortadan ikiye bölen ince altın çubuk.
    const nasal = mesh(new THREE.BoxGeometry(0.022, 0.088, 0.014), gold, false);
    nasal.position.set(0, 0.002, 0.139);

    // 6) Boyun zırhı (aventail) — çene altından omuzlara, hafif daralan.
    const aventail = mesh(new THREE.CylinderGeometry(0.11, 0.148, 0.13, 12, 1, true), metal);
    aventail.scale.z = 1.04;
    aventail.position.set(0, -0.172, -0.008);

    // 7) Tepelik: ince metal sırt + kısa kızıl at kılı yelesi (arkada).
    const ridge = mesh(new THREE.BoxGeometry(0.018, 0.03, 0.16), metal, false);
    ridge.position.set(0, 0.152, -0.01);
    const knob = mesh(new THREE.SphereGeometry(0.018, 6, 4), gold, false);
    knob.position.set(0, 0.168, 0.052);
    const plumeMat = new THREE.MeshStandardMaterial({
      color: '#dc2626',
      roughness: 0.9,
      flatShading: true,
    });
    const plume = mesh(new THREE.BoxGeometry(0.024, 0.045, 0.1), plumeMat, false);
    plume.position.set(0, 0.128, -0.112);
    plume.rotation.x = -0.35;

    g.add(dome, browBand, eyeSlit, jawBand, nasal, aventail, ridge, knob, plume);
    return g;
  }

  return null;
}

/**
 * Göğüs zırhı — Faz 9b.
 *
 * Neden yeniden yazıldı: BannerForge'un gövde parçaları **başka bir iskelet**
 * için yazılmış. Bizim gövdemize takıldığında:
 *   · postacı zırhı belin altına kayıyor (y 0.77–1.34, göğüs 1.38–1.60),
 *   · göğüs levhası 0.57 m genişliğinde **düz bir levha** olarak göğsün
 *     10 cm önünde duruyor (gövde genişliği 0.42),
 *   · surcoat panelleri ön/arka 0.19 m uzakta **karton tabela** gibi kalıyor,
 *   · levhalar kolların içine 33 cm giriyor.
 * Bu yüzden gövde zırhı artık gövdemizin kendi silindirine oturan **lathe
 * kabuğu** olarak üretiliyor (gövde: y 0..0.46, r 0.18→0.24, z ölçeği 0.8).
 */
function buildArmor(rig: CharacterRig, tier: ArmorTier) {
  const { metal, gold, leather, cloth, padded } = rig.materials;
  if (tier === 'CIVILIAN') return;

  /**
   * Gövde profili: (y, gövde yarıçapı). Gövde silindiri y 0..0.46 arasında
   * 0.18 → 0.24 arası açılıyor; zırh kabuğu bu profilin üstüne oturuyor.
   */
  /*
   * Profil **yerel** koordinatta (chestArmorSocket = dünya y 1.38).
   * Gövde dünyada 1.14–1.60, boyun 1.61–1.75, çene 1.74 → zırh en fazla
   * 1.64'e kadar çıkabilir, yoksa çeneyi/ağzı yutuyor (Faz 9c bulgusu:
   * eski profil 1.87'ye çıkıyordu ve levhada göz altına dayanıyordu).
   */
  const PROFILE: Array<[number, number]> = [
    [-0.24, 0.196],
    [-0.16, 0.2],
    [-0.06, 0.208],
    [0.04, 0.214],
    [0.14, 0.222],
    [0.18, 0.216],
    [0.21, 0.196],
    [0.225, 0.17],
  ];
  const radiusAt = (y: number) => {
    if (y <= PROFILE[0][0]) return PROFILE[0][1];
    for (let i = 1; i < PROFILE.length; i++) {
      const [y1, r1] = PROFILE[i];
      if (y <= y1) {
        const [y0, r0] = PROFILE[i - 1];
        const t = (y - y0) / (y1 - y0 || 1);
        return r0 + (r1 - r0) * t;
      }
    }
    return PROFILE[PROFILE.length - 1][1];
  };
  const DEPTH = TORSO_DEPTH_SCALE + 0.02;
  /** Kabuğun ön yüzü (z) — ek parçalar bu mesafeye göre yerleştirilir. */
  const frontZ = (y: number, pad: number, out = 0) => (radiusAt(y) + pad + out) * DEPTH;

  /**
   * Yaka/gorget: tabanı köprücük kemiğinde, boynu saran ince halka.
   * Grubun içinde durur ki `refitArmorToHead` yüksekliğini çeneye göre kısatlsın.
   */
  const COLLAR = { bottom: 0.14, height: 0.17 };
  const makeCollar = (mat: THREE.Material) => {
    const g = new THREE.Group();
    g.name = 'armorCollar';
    g.position.y = COLLAR.bottom; // dünya ≈1.52 — köprücük kemiği
    const ring = mesh(
      new THREE.CylinderGeometry(0.112, 0.15, COLLAR.height, 10, 1, true),
      mat,
      false,
    );
    // Halka grubun TABANINDAN yukarı büyür → ölçek tabanı sabit bırakır.
    ring.position.y = COLLAR.height / 2;
    ring.scale.z = DEPTH;
    ring.userData.chestArmor = true;
    g.add(ring);
    g.userData.collarHeight = COLLAR.height;
    g.userData.chestArmor = true;
    return g;
  };

  const pieces: THREE.Object3D[] = [];

  /** Gövdeye oturan kabuk. */
  const shell = (pad: number, mat: THREE.Material) => {
    const pts = PROFILE.map(([y, r]) => new THREE.Vector2(r + pad, y));
    const geo = new THREE.LatheGeometry(pts, 10);
    geo.computeVertexNormals();
    const m = mesh(geo, mat);
    m.scale.z = DEPTH;
    return m;
  };

  /** Kabuğun üstüne binen kuşak (tek yüzlü şerit). */
  const band = (y: number, pad: number, h: number, mat: THREE.Material) => {
    const r = radiusAt(y) + pad;
    const m = mesh(new THREE.CylinderGeometry(r, r, h, 10, 1, true), mat, false);
    m.position.y = y;
    m.scale.z = DEPTH;
    return m;
  };

  if (tier === 'LEATHER') {
    // Dolgun gambeson: kapitone keten gövde + deri kuşak + kapitone dikişler.
    pieces.push(shell(0.016, padded));
    for (const y of [-0.16, -0.06, 0.04, 0.14]) {
      pieces.push(band(y, 0.022, 0.008, leather));
    }
    // Omuz askıları: ön göğüsten geçen iki deri şerit.
    for (const side of [-1, 1]) {
      // Kısa tutuluyor: uzun askı enseden çeneye kadar çıkıp yüzü örtüyordu.
      const strap = mesh(new THREE.BoxGeometry(0.03, 0.26, 0.012), leather, false);
      strap.position.set(side * 0.062, 0.02, frontZ(0.02, 0.02, 0.004));
      strap.rotation.z = side * 0.1;
      pieces.push(strap);
    }
    pieces.push(band(-0.02, 0.03, 0.042, leather));
    // Sancak işareti: göğsün ortasında küçük bir arma pulu.
    const badge = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 8), cloth, false);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 0.16, frontZ(0.16, 0.02, 0.008));
    pieces.push(badge);
  } else if (tier === 'CHAINMAIL') {
    // Postacı: gövde + etek + boyun zırhı + omuz askısı.
    pieces.push(shell(0.02, metal));
    const skirt = mesh(new THREE.CylinderGeometry(0.214, 0.242, 0.2, 10, 1, true), metal);
    skirt.position.y = -0.16;
    skirt.scale.z = DEPTH;
    pieces.push(skirt);
    pieces.push(makeCollar(metal));
    // Göğüs kayışı: kabuğun önünde, çapraz.
    const strap = mesh(new THREE.BoxGeometry(0.036, 0.28, 0.016), leather, false);
    strap.position.set(0.055, 0.0, frontZ(0.0, 0.02, 0.006));
    strap.rotation.z = 0.3;
    pieces.push(strap);
    pieces.push(band(0.02, 0.026, 0.03, leather));
  } else if (tier === 'PLATE') {
    // Tam levha: kabuk + omurga + iki kuşak + gorget + arma.
    pieces.push(shell(0.028, metal));
    const keel = mesh(new THREE.BoxGeometry(0.032, 0.36, 0.03), metal, false);
    keel.position.set(0, 0.08, frontZ(0.08, 0.028, 0.008));
    pieces.push(keel);
    pieces.push(band(-0.06, 0.034, 0.032, gold));
    pieces.push(band(0.14, 0.034, 0.032, gold));
    // Gorget: boynu saran dar halka. Yüksekliği `refitArmorToHead` ile
    // karakterin çenesine göre ayarlanır (DNA sonrası kafa büyüyebiliyor).
    pieces.push(makeCollar(metal));
    // Sancak arması: öne bakan dört yüzlü piramit.
    const crest = mesh(new THREE.ConeGeometry(0.055, 0.034, 4), gold, false);
    crest.rotation.x = Math.PI / 2;
    crest.position.set(0, 0.09, frontZ(0.09, 0.028, 0.014));
    pieces.push(crest);
  }

  /*
   * Göğüs zırhının tamamı tek grup altında: `refitArmorToHead` bu grubu
   * yalnızca **y** ekseninde kısaltarak çeneyle çakışmayı çözer (taban sabit).
   */
  const chestGroup = new THREE.Group();
  chestGroup.name = 'armorChest';
  chestGroup.userData.chestBottom = -0.24;
  chestGroup.add(...pieces);
  rig.chestArmorSocket.add(chestGroup);
  for (const p of pieces) p.userData.chestArmor = true;

  /* ── Kol zırhları (üst kol + ön kol) ──
     Bunlar da BannerForge'dan alınmıyor: onun kol parçaları bizim kollarımıza
     göre 1 cm kadar küçük kalıyor ve 6 kenarlı kol silindirinin köşeleri zırhın
     içinden geçiyor (görselde kırmızı çizikler). Kendi üreticimizde zırh yarıçapı
     kolun köşe yarıçapından en az 6 mm büyük. */
  const armMat = tier === 'LEATHER' ? padded : metal;
  const upperR = [0.078, 0.07] as const;
  const foreR = [0.072, 0.058] as const;
  for (const [upper, fore, side] of [
    [rig.leftUpperArm, rig.leftForearm, 1],
    [rig.rightUpperArm, rig.rightForearm, -1],
  ] as const) {
    const sleeve = mesh(
      new THREE.CylinderGeometry(upperR[0], upperR[1], RIG_DIMENSIONS.upperArm - 0.012, 8, 1, true),
      armMat,
      false,
    );
    sleeve.position.y = -RIG_DIMENSIONS.upperArm / 2;
    sleeve.userData.armArmor = true;
    upper.add(sleeve);

    const bracer = mesh(
      new THREE.CylinderGeometry(foreR[0], foreR[1], RIG_DIMENSIONS.forearm - 0.01, 8, 1, true),
      tier === 'LEATHER' ? leather : metal,
      false,
    );
    bracer.position.y = -RIG_DIMENSIONS.forearm / 2;
    bracer.userData.armArmor = true;
    fore.add(bracer);

    // Dirsek kapağı (postacı/levha).
    if (tier !== 'LEATHER') {
      const cop = mesh(new THREE.SphereGeometry(0.078, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.62), metal, false);
      cop.scale.set(1, 0.8, 1);
      cop.position.y = 0.005;
      upper.add(cop);
    } else {
      // Deri bileklik.
      const cuff = mesh(new THREE.CylinderGeometry(foreR[1] + 0.008, foreR[1] + 0.006, 0.05, 8, 1, true), leather, false);
      cuff.position.y = -RIG_DIMENSIONS.forearm + 0.03;
      fore.add(cuff);
    }
    if (tier === 'PLATE') {
      const trim = mesh(new THREE.CylinderGeometry(upperR[1] + 0.01, upperR[1] + 0.01, 0.026, 8, 1, true), gold, false);
      trim.position.y = -RIG_DIMENSIONS.upperArm + 0.028;
      upper.add(trim);
      void side;
    }
  }

  /* ── Omuz zırhları (pauldron) ── */
  const pauldronMat = tier === 'LEATHER' ? padded : metal;
  for (const [sock, side] of [
    [rig.leftPauldronSocket, 1],
    [rig.rightPauldronSocket, -1],
  ] as const) {
    if (tier === 'PLATE') {
      for (const [r, dy] of [
        [0.108, 0.012],
        [0.094, 0.052],
      ] as const) {
        const cap = mesh(
          new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.52),
          metal,
          false,
        );
        cap.scale.set(1, 0.82, 1.02);
        cap.position.set(side * 0.018, dy, 0);
        sock.add(cap);
      }
      const trim = mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 10), gold, false);
      trim.rotation.x = Math.PI / 2;
      trim.position.set(side * 0.018, 0.028, 0);
      sock.add(trim);
    } else if (tier === 'CHAINMAIL') {
      const cap = mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.6), metal, false);
      cap.scale.set(1, 0.9, 1.05);
      cap.position.set(side * 0.015, 0.01, 0);
      sock.add(cap);
    } else {
      const pad = mesh(new THREE.SphereGeometry(0.095, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.45), pauldronMat, false);
      pad.scale.set(1, 0.7, 1.05);
      pad.position.set(side * 0.012, 0.008, 0);
      sock.add(pad);
    }
  }
}

/**
 * Zırh yakasını karakterin **çenesine** göre ayarlar (Faz 9c).
 *
 * DNA kafayı 1.16×'e kadar büyütünce çene alçalıyor (en kısa kahramanda 1.611 m);
 * sabit yükseklikteki yaka o zaman çeneyi/ağzı örtüyordu. `applyMorphDNAToRig`
 * sonunda çağrılır; yakayı çenenin 3 cm altında kalacak şekilde kısaltır.
 */
export function refitArmorToHead(rig: CharacterRig): void {
  const group = rig.chestArmorSocket.getObjectByName('armorChest');
  if (!group) return;
  const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (!skull) return;
  rig.root.updateMatrixWorld(true);
  const chin = new THREE.Box3().setFromObject(skull).min.y;

  // 1) Yaka: çenenin 3 cm altına kadar uzar/kısalır. DNA kafayı büyütünce
  //    çene alçalıyor (1.61'e kadar) → sabit yaka ağzı örtüyordu.
  const collar = group.getObjectByName('armorCollar');
  if (collar) {
    const box = new THREE.Box3().setFromObject(collar);
    const height = Math.max(box.max.y - box.min.y, 1e-4);
    const s = Math.min(1.7, Math.max(0.3, (chin - 0.03 - box.min.y) / height));
    collar.scale.y *= s;
  }

  // 2) Emniyet kemeri: gövde kabuğu (yaka dışında) hâlâ çeneye dayanıyorsa
  //    grubu yalnız y ekseninde, tabanı sabit tutarak kısalt.
  const armor = new THREE.Box3().setFromObject(group);
  const height = armor.max.y - armor.min.y;
  if (height > 0.01 && armor.max.y > chin - 0.02) {
    const s = Math.max(0.72, (chin - 0.02 - armor.min.y) / height);
    group.scale.y *= s;
    const bottomLocal = (group.userData.chestBottom as number) ?? -0.24;
    group.position.y = bottomLocal * (1 - group.scale.y);
  }
}

function buildShield(type: ShieldType, m: CharacterRig['materials']): THREE.Group | null {
  if (type === 'NONE') return null;
  const { faction, metal, wood } = m;
  const body = new THREE.Group();

  if (type === 'ROUND_SHIELD') {
    const disc = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 12), faction);
    disc.rotation.x = Math.PI / 2;
    const rim = mesh(new THREE.TorusGeometry(0.36, 0.02, 4, 12), metal, false);
    const boss = mesh(new THREE.SphereGeometry(0.08, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), metal, false);
    boss.rotation.x = Math.PI / 2;
    boss.position.z = 0.015;
    body.add(disc, rim, boss);
  } else if (type === 'KITE_SHIELD') {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.62);
    shape.lineTo(0.25, -0.05);
    shape.quadraticCurveTo(0.27, 0.3, 0, 0.32);
    shape.quadraticCurveTo(-0.27, 0.3, -0.25, -0.05);
    shape.lineTo(0, -0.62);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false, curveSegments: 3 });
    geo.translate(0, 0, -0.015);
    const face = mesh(geo, faction);
    const band = mesh(new THREE.BoxGeometry(0.04, 0.85, 0.02), metal, false);
    band.position.set(0, -0.14, 0.02);
    const cross = mesh(new THREE.BoxGeometry(0.4, 0.04, 0.02), metal, false);
    cross.position.set(0, 0.1, 0.02);
    body.add(face, band, cross);
    body.position.y = 0.08;
  } else if (type === 'PAVISE') {
    const board = mesh(new THREE.BoxGeometry(0.46, 0.92, 0.04), wood);
    // Sancak rengi dikey şerit — eskiden gövdenin içinde kalıyordu (z 0.025,
    // levha 0.04 kalın → yarısı gömülü). Şimdi levhanın önünde duruyor.
    const stripe = mesh(new THREE.BoxGeometry(0.14, 0.88, 0.012), faction, false);
    stripe.position.z = 0.026;
    // Üç çelik kuşak — pavise kalkanının karakteristik çaprazsız takviyesi.
    const bands = [-0.32, 0, 0.32].map((y) => {
      const band = mesh(new THREE.BoxGeometry(0.47, 0.045, 0.052), metal, false);
      band.position.y = y;
      return band;
    });
    // Köşe demirleri (üst ve alt).
    const corner = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), metal, false);
    corner.position.set(0, 0.41, 0);
    body.add(board, stripe, ...bands, corner);
    body.position.y = 0.06;
  }

  /*
   * ESKİ HATA: `holder.rotation.z = π/2` kalkanı kendi yüzey normali etrafında
   * 90° yatırıyordu. Sonuç: uçurtma ve pavise kalkanları **yan yatmış** (uzun
   * ekseni yere paralel) görünüyordu; yuvarlak kalkanda ise sadece gereksiz
   * dönüş vardı. Kalkanın yüzü elin +Z ekseni (ileri) olmalı, üstü de dünya
   * yukarısı. Bu yüzden dönüş kaldırıldı; bunun yerine kalkan gövdeye göre
   * dışa ve öne kaydırılıp ölçeklendi (aksi halde 1.24 m'lik uçurtma kalkan
   * neredeyse yere değiyordu).
   */
  body.scale.setScalar(SHIELD_SCALE[type]);
  const holder = new THREE.Group();
  holder.name = 'Shield';
  holder.add(body);
  holder.position.set(...SHIELD_REST_POSITION);
  return holder;
}

function buildMainWeapon(type: WeaponType, m: CharacterRig['materials']): THREE.Group | null {
  const { metal, gold, leather, wood } = m;
  const author = new THREE.Group(); // authored along +Y, then rotated so +Y -> hand +Z

  if (type === 'ONE_HANDED_SWORD') {
    const grip = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), leather, false);
    grip.position.y = -0.02;
    const pommel = mesh(new THREE.SphereGeometry(0.035, 6, 4), gold, false);
    pommel.position.y = -0.1;
    const guard = mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), metal, false);
    guard.position.y = 0.06;
    const blade = mesh(new THREE.BoxGeometry(0.055, 0.78, 0.015), metal);
    blade.position.y = 0.46;
    const tip = mesh(new THREE.ConeGeometry(0.038, 0.1, 4), metal, false);
    tip.position.y = 0.9;
    author.add(grip, pommel, guard, blade, tip);
  } else if (type === 'TWO_HANDED_SWORD') {
    const hilt = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 6), leather, false);
    hilt.position.y = -0.1;
    const pommel = mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.06, 6), metal, false);
    pommel.position.y = -0.28;
    const guard = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.05), metal, false);
    guard.position.y = 0.07;
    const blade = mesh(new THREE.BoxGeometry(0.08, 1.15, 0.018), metal);
    blade.position.y = 0.66;
    const tip = mesh(new THREE.ConeGeometry(0.055, 0.14, 4), metal, false);
    tip.position.y = 1.3;
    author.add(hilt, pommel, guard, blade, tip);
  } else if (type === 'SPEAR') {
    const shaft = mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.3, 6), wood);
    shaft.position.y = 0.6;
    const head = mesh(new THREE.ConeGeometry(0.055, 0.34, 4), metal, false);
    head.position.y = 1.92;
    const butt = mesh(new THREE.ConeGeometry(0.03, 0.1, 4), metal, false);
    butt.position.y = -0.6;
    butt.rotation.z = Math.PI;
    author.add(shaft, head, butt);
  } else {
    return null;
  }

  author.rotation.x = Math.PI / 2; // +Y -> +Z
  const holder = new THREE.Group();
  holder.name = 'MainWeapon';
  holder.position.set(0, -0.06, 0.0);
  holder.add(author);
  holder.userData.weaponType = type;
  return holder;
}

/**
 * Bow authored directly in LEFT-HAND space:
 *   limbs along ±Z, string on the +Y side (toward the archer / elbow), arrow flies toward -Y.
 */
function buildBow(m: CharacterRig['materials']): BowParts {
  const { wood, leather } = m;
  const group = new THREE.Group();
  group.name = 'Bow';
  group.position.set(0, -0.05, 0);

  const riser = mesh(new THREE.BoxGeometry(0.04, 0.045, 0.16), leather, false);
  group.add(riser);

  const brace = 0.13;
  const tipZ = 0.56;
  // Each limb: two segments curving back toward the string side
  const limbSeg = (z0: number, y0: number, z1: number, y1: number, r0: number, r1: number) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const geo = new THREE.CylinderGeometry(r1, r0, len, 5);
    const seg = mesh(geo, wood, false);
    seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    // Align cylinder +Y with the segment direction in the YZ plane.
    seg.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, y1 - y0, z1 - z0).normalize(),
    );
    return seg;
  };
  for (const s of [1, -1]) {
    group.add(limbSeg(0.08 * s, 0, 0.34 * s, -0.06, 0.02, 0.016));
    group.add(limbSeg(0.34 * s, -0.06, tipZ * s, brace, 0.016, 0.01));
  }

  const restNock = new THREE.Vector3(0, brace, 0);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, brace, tipZ),
    restNock.clone(),
    new THREE.Vector3(0, brace, -tipZ),
  ]);
  const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#f3ead8' }));
  string.frustumCulled = false;
  group.add(string);

  const nockedArrow = createArrowMesh(m);
  nockedArrow.visible = false;
  group.add(nockedArrow);

  return {
    group,
    stringGeo,
    restNock,
    arrowRest: new THREE.Vector3(0, -0.02, 0.0),
    nockedArrow,
  };
}

function buildQuiver(m: CharacterRig['materials']): THREE.Group {
  const q = new THREE.Group();
  q.name = 'Quiver';
  q.position.set(0.12, -0.04, 0);
  q.rotation.z = -0.35;
  q.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.56, 6), m.leather));
  const featherMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', flatShading: true });
  for (let i = 0; i < 5; i++) {
    const a = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), m.wood, false);
    a.position.set((i - 2) * 0.022, 0.36, (i % 2) * 0.02);
    const f = mesh(new THREE.BoxGeometry(0.004, 0.08, 0.03), featherMat, false);
    f.position.set((i - 2) * 0.022, 0.44, (i % 2) * 0.02);
    q.add(a, f);
  }
  return q;
}

/**
 * Builds and attaches modular armor and weapons to the rig sockets.
 */
export function applyEquipmentToRig(rig: CharacterRig, options: CharacterVisualOptions): void {
  rig.currentOptions = { ...rig.currentOptions, ...options };

  const sockets = [
    rig.helmetSocket,
    rig.chestArmorSocket,
    rig.leftPauldronSocket,
    rig.rightPauldronSocket,
    rig.rightWeaponSocket,
    rig.leftShieldSocket,
    rig.backSocket,
    rig.hipSocket,
  ];
  for (const s of sockets) {
    while (s.children.length > 0) {
      const c = s.children[0];
      s.remove(c);
      disposeEquipment(c, rig);
    }
  }
  rig.mainHandItem = null;
  rig.offHandItem = null;
  rig.bow = null;
  rig.nockedArrowMesh = null;
  rig.bowStringLine = null;

  const m = rig.materials;

  // Bannerlord-style hair and beard handling per helmet type:
  // - Open / no helmet: hair visible, beard visible
  // - Kettle hat: hair visible under brim, beard visible
  // - Spangenhelm: mail coif encloses head -> hair hidden, beard visible
  // - Imperial Visor: full enclosed faceplate -> hair and beard hidden inside
  // BannerForge miğferleri kafatası kubbesini tamamen kaplar; saç kubbeden
  // taşıp miğferin içinden "fışkırıyor" görünmesin diye saç gizlenir.
  const armoryHelmets = armoryVisualsEnabled();
  if (options.helmetType === 'NONE') {
    rig.hairGroup.visible = true;
    rig.beardMesh.visible = options.hasBeard !== false;
  } else if (armoryHelmets) {
    rig.hairGroup.visible = false;
    rig.beardMesh.visible =
      options.hasBeard !== false && options.helmetType !== 'IMPERIAL_VISOR';
  } else if (options.helmetType === 'KETTLE_HAT') {
    rig.hairGroup.visible = true;
    rig.beardMesh.visible = options.hasBeard !== false;
  } else if (options.helmetType === 'SPANGENHELM') {
    rig.hairGroup.visible = false;
    rig.beardMesh.visible = options.hasBeard !== false;
  } else if (options.helmetType === 'IMPERIAL_VISOR') {
    rig.hairGroup.visible = false;
    rig.beardMesh.visible = false;
  }

  // ── BannerForge (armory-studio) görsel katmanı ──
  // Oynanış kodu (IK, dövüş, animasyon) hiç değişmez; yalnızca takılan
  // geometriler BannerForge üreticilerinden gelir. Kapatılırsa eski modeller.
  const armoryCtx = { factionId: options.factionId, factionColor: options.factionColor };
  const useArmory = armoryVisualsEnabled();

  const helmet = useArmory
    ? createArmoryHelmet(options.helmetType, armoryCtx) ?? buildHelmet(options.helmetType, m)
    : buildHelmet(options.helmetType, m);

  // Kapalı (tam yüz) miğferde yüz parçaları miğferin içinden taşar → gizle.
  const faceGroup = rig.head.getObjectByName('Face');
  if (faceGroup) faceGroup.visible = !(options.helmetType === 'IMPERIAL_VISOR' && useArmory);
  if (helmet) {
    helmet.userData.helmetType = options.helmetType;
    rig.helmetSocket.add(helmet);
  }

  if (useArmory) {
    try {
      applyArmoryArmor(rig, options.armorTier, armoryCtx);
    } catch (error) {
      console.warn('[characterRig] BannerForge zırhı uygulanamadı, eski zırha dönülüyor:', error);
      clearArmoryArmor(rig);
      buildArmor(rig, options.armorTier);
    }
  }
  /*
   * Gövde zırhı + omuzluklar HER İKİ katmanda da bizim üreticimizden gelir.
   * BannerForge'un gövde/omuz parçaları başka bir iskelet için yazılmış
   * (göğsü kapatmıyor, kolların içine giriyor) → `applyArmoryArmor` bu
   * bölgeleri atlıyor, yerlerini `buildArmor` dolduruyor.
   */
  buildArmor(rig, options.armorTier);

  if (options.weaponType === 'BOW') {
    const bow = buildBow(m);
    rig.bow = bow;
    rig.offHandItem = bow.group;
    rig.nockedArrowMesh = bow.nockedArrow;
    rig.leftShieldSocket.add(bow.group);
    rig.backSocket.add(buildQuiver(m));
  } else {
    const weapon = (useArmory ? createArmoryWeapon(options.weaponType, armoryCtx) : null)
      ?? buildMainWeapon(options.weaponType, m);
    if (weapon) {
      weapon.name = 'MainWeapon';
      weapon.userData.weaponType = options.weaponType;
      rig.mainHandItem = weapon;
      rig.rightWeaponSocket.add(weapon);
    }
    // Two-handed weapons and spears need the left hand -> no shield.
    const twoHanded = options.weaponType === 'TWO_HANDED_SWORD' || options.weaponType === 'SPEAR';
    if (!twoHanded) {
      const shield = (useArmory ? createArmoryShield(options.shieldType, armoryCtx) : null)
        ?? buildShield(options.shieldType, m);
      if (shield) {
        shield.name = 'Shield';
        rig.offHandItem = shield;
        rig.leftShieldSocket.add(shield);
      }
    }
  }

  const wasSheathed = rig.sheathed;
  rig.sheathed = false;
  if (wasSheathed) setRigSheathed(rig, true);
}

/** Effective weapon class used by the animator (accounts for 2H weapons ignoring shields). */
export function rigHasShield(rig: CharacterRig): boolean {
  return !!rig.offHandItem && rig.offHandItem.name === 'Shield';
}

/**
 * Moves hand-held items to their carry sockets (hip / back) or back into the hands.
 */
export function setRigSheathed(rig: CharacterRig, sheathed: boolean): void {
  if (rig.sheathed === sheathed) return;
  rig.sheathed = sheathed;
  const main = rig.mainHandItem;
  const off = rig.offHandItem;
  const type = rig.currentOptions.weaponType;

  if (main) {
    if (sheathed) {
      if (type === 'ONE_HANDED_SWORD') {
        rig.hipSocket.add(main);
        main.position.set(0.02, 0.0, 0.0);
        // blade points down and slightly back
        main.rotation.set(Math.PI * 0.62, 0, 0.12);
      } else {
        rig.backSocket.add(main);
        // diagonal across the back: grip over the right shoulder, tip toward the left hip
        main.position.set(-0.16, 0.22, -0.04);
        main.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0.5, -0.86, 0).normalize(),
        );
      }
    } else {
      rig.rightWeaponSocket.add(main);
      main.position.set(0, -0.06, 0);
      main.rotation.set(0, 0, 0);
    }
  }

  if (off) {
    if (sheathed) {
      rig.backSocket.add(off);
      if (off.name === 'Shield') {
        off.position.set(0, -0.02, -0.05);
        // face backwards, upright
        off.rotation.set(0, Math.PI, 0);
      } else {
        // bow across the back
        off.position.set(-0.04, 0.0, -0.06);
        off.rotation.set(0, 0, 0.9);
      }
    } else {
      rig.leftShieldSocket.add(off);
      if (off.name === 'Shield') {
        // ESKİ HATA: burada rotation.z = π/2 yazıyordu; kalkanı yan yatırıyor
        // ve modelin kendi duruşunu eziyordu (uçurtma/pavise yere paralel).
        off.position.set(...SHIELD_REST_POSITION);
        off.rotation.set(...SHIELD_REST_ROTATION);
      } else {
        off.position.set(0, -0.05, 0);
        off.rotation.set(0, 0, 0);
      }
    }
  }
}

/**
 * Creates a standalone arrow. The arrow points along its local +Z axis and is centered on its shaft.
 */
export function createArrowMesh(materials?: CharacterRig['materials']): THREE.Group {
  // BannerForge oku: uç +Z'ye bakar, merkezi gövde ortasındadır.
  // (Silah yuvasından bağımsız olduğu için animasyonu etkilemez.)
  if (armoryVisualsEnabled()) {
    try {
      const model = createArmoryArrow();
      if (model) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        // Bizim ok uzayı: +Z uca bakar, gövde merkezde (±0.42).
        model.position.z = -(box.min.z + size.z / 2);
        const holder = new THREE.Group();
        holder.name = 'ArrowProjectile';
        holder.add(model);
        return holder;
      }
    } catch (error) {
      console.warn('[characterRig] BannerForge oku üretilemedi, eski oka dönülüyor:', error);
    }
  }

  const arrowGroup = new THREE.Group();
  arrowGroup.name = 'ArrowProjectile';

  const woodMat = materials?.wood || new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.8 });
  const metalMat =
    materials?.metal || new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.85 });
  const featherMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9, flatShading: true });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.78, 5), woodMat);
  shaft.rotation.x = Math.PI * 0.5;
  arrowGroup.add(shaft);

  const point = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.09, 4), metalMat);
  point.position.z = 0.42;
  point.rotation.x = Math.PI * 0.5;
  arrowGroup.add(point);

  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.04, 0.12), featherMat);
    f.position.z = -0.32;
    f.rotation.z = (i * Math.PI * 2) / 3;
    arrowGroup.add(f);
  }
  return arrowGroup;
}

// ---------------------------------------------------------------------------
// Backward compatible simple API (used by e.g. the market preview).
// ---------------------------------------------------------------------------
const legacyAnimators = new WeakMap<CharacterRig, CharacterAnimator>();

/**
 * @deprecated Prefer creating a `CharacterAnimator` and calling `update(dt)`.
 * Kept so existing callers (market preview) keep working.
 */
export function updateRigAnimation(
  rig: CharacterRig,
  state: CharacterAnimState,
  _timeSec: number,
  deltaSec: number,
): void {
  let anim = legacyAnimators.get(rig);
  if (!anim) {
    anim = new CharacterAnimator(rig);
    legacyAnimators.set(rig, anim);
  }
  anim.applyLegacyState(state);
  anim.update(deltaSec);
}

// ---------------------------------------------------------------------------
// Arena props
// ---------------------------------------------------------------------------

export function createPracticeDummy(): { group: THREE.Group; update: (delta: number) => void; hit: () => void } {
  const group = new THREE.Group();
  group.name = 'PracticeDummy';

  const woodMat = new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.85, flatShading: true });
  const strawMat = new THREE.MeshStandardMaterial({ color: '#ca8a04', roughness: 0.9, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.4, metalness: 0.8 });

  const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 8), woodMat);
  post.position.y = 0.9;
  group.add(post);

  const stand = mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), woodMat);
  stand.position.y = 0.04;
  group.add(stand);

  const body = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.6, 7), strawMat);
  body.position.y = 1.2;
  group.add(body);

  const crossbeam = new THREE.Group();
  crossbeam.position.y = 1.35;
  group.add(crossbeam);
  crossbeam.add(mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), woodMat));

  const shield = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8), woodMat);
  shield.position.set(-0.65, 0, 0);
  shield.rotation.z = Math.PI * 0.5;
  crossbeam.add(shield);

  const bag = mesh(new THREE.SphereGeometry(0.14, 6, 6), strawMat);
  bag.position.set(0.65, -0.2, 0);
  crossbeam.add(bag);

  const head = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 6), strawMat);
  head.position.y = 1.7;
  group.add(head);

  const helm = mesh(new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), metalMat);
  helm.position.y = 1.84;
  group.add(helm);

  let spinVelocity = 0;
  let wobble = 0;
  let wobbleT = 0;

  return {
    group,
    hit: () => {
      spinVelocity += (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 6);
      wobble = 0.22;
    },
    update: (delta: number) => {
      wobbleT += delta;
      crossbeam.rotation.y += spinVelocity * delta;
      spinVelocity *= Math.exp(-2.2 * delta);
      group.rotation.z = Math.sin(wobbleT * 14) * wobble;
      wobble *= Math.exp(-3.5 * delta);
    },
  };
}

export function createArcheryTarget(): THREE.Group {
  const targetGroup = new THREE.Group();
  targetGroup.name = 'ArcheryTarget';

  const strawMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.9, flatShading: true });
  const redMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.8 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.7 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.9 });

  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5);
  const leg1 = new THREE.Mesh(legGeo, woodMat);
  leg1.position.set(-0.35, 0.85, -0.1);
  leg1.rotation.z = 0.22;
  const leg2 = new THREE.Mesh(legGeo, woodMat);
  leg2.position.set(0.35, 0.85, -0.1);
  leg2.rotation.z = -0.22;
  const leg3 = new THREE.Mesh(legGeo, woodMat);
  leg3.position.set(0, 0.85, -0.45);
  leg3.rotation.x = 0.28;
  targetGroup.add(leg1, leg2, leg3);

  const rings: [number, THREE.Material, number][] = [
    [0.55, strawMat, 0.12],
    [0.38, redMat, 0.13],
    [0.18, goldMat, 0.14],
  ];
  for (const [r, mat, depth] of rings) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 16), mat);
    ring.position.set(0, 1.25, 0);
    ring.rotation.x = Math.PI * 0.5;
    ring.castShadow = true;
    targetGroup.add(ring);
  }
  return targetGroup;
}

/**
 * Deterministically maps a CampaignState equipment record (HEAD, BODY, WEAPON1..4)
 * into 3D CharacterRig visual options (WeaponType, ShieldType, HelmetType, ArmorTier).
 */
export function deriveRigVisualOptionsFromEquipment(
  equipment?: Partial<Record<string, string>>,
  factionColor = '#b45309',
): {
  weaponType: WeaponType;
  shieldType: ShieldType;
  helmetType: HelmetType;
  armorTier: ArmorTier;
  factionColor: string;
} {
  const eq = equipment || {};
  const headStr = eq.HEAD || '';
  const bodyStr = eq.BODY || '';
  const w1Str = eq.WEAPON1 || '';
  const w2Str = eq.WEAPON2 || '';
  const w3Str = eq.WEAPON3 || '';
  const w4Str = eq.WEAPON4 || '';

  let helmetType: HelmetType = 'SPANGENHELM';
  if (headStr.includes('Başlıksız') || headStr.includes('Yok')) {
    helmetType = 'NONE';
  } else if (headStr.includes('Katafrakt') || headStr.includes('Siper') || headStr.includes('Miğfer')) {
    if (headStr.includes('Katafrakt') || headStr.includes('Siper')) {
      helmetType = 'IMPERIAL_VISOR';
    } else if (headStr.includes('Çanak') || headStr.includes('Kettle')) {
      helmetType = 'KETTLE_HAT';
    }
  } else if (headStr.includes('Çanak') || headStr.includes('Kettle')) {
    helmetType = 'KETTLE_HAT';
  }

  let armorTier: ArmorTier = 'CHAINMAIL';
  if (bodyStr.includes('Sivil') || bodyStr.includes('Tunik') || bodyStr.includes('Kaftan')) {
    armorTier = 'CIVILIAN';
  } else if (bodyStr.includes('Deri') || bodyStr.includes('Gambeson')) {
    armorTier = 'LEATHER';
  } else if (bodyStr.includes('Katafrakt') || bodyStr.includes('Levha') || bodyStr.includes('Pullu')) {
    armorTier = 'PLATE';
  }

  const shieldCandidate = `${w2Str} ${w3Str}`;
  let shieldType: ShieldType = 'ROUND_SHIELD';
  if (shieldCandidate.includes('Damla') || shieldCandidate.includes('Kite') || shieldCandidate.includes('Süvari Kalkan')) {
    shieldType = 'KITE_SHIELD';
  } else if (shieldCandidate.includes('Pavise') || shieldCandidate.includes('Kule Kalkan')) {
    shieldType = 'PAVISE';
  } else if (w2Str.includes('Boş') || !shieldCandidate.includes('Kalkan')) {
    shieldType = 'NONE';
  }

  let weaponType: WeaponType = 'ONE_HANDED_SWORD';
  if (
    w1Str.includes('Falx') ||
    w1Str.includes('İki Elli') ||
    w1Str.includes('Çift Elli') ||
    w1Str.includes('Balta')
  ) {
    weaponType = 'TWO_HANDED_SWORD';
  } else if (w1Str.includes('Yay') || (w4Str.includes('Yay') && w1Str.includes('Boş'))) {
    weaponType = 'BOW';
  } else if (w1Str.includes('Kargı') || w1Str.includes('Mızrak') || w1Str.includes('Kontos')) {
    weaponType = 'SPEAR';
  } else if (w1Str.includes('Silahsız')) {
    weaponType = 'UNARMED';
  }

  return {
    weaponType,
    shieldType,
    helmetType,
    armorTier,
    factionColor,
  };
}

// ============================================================================
//  LOW-POLY ARTICULATED WARHORSE RIG (MOUNTED CAVALRY & CHARGE ENGINE)
// ============================================================================

export interface WarHorseOptions {
  coatColor?: string;
  maneColor?: string;
  factionColor?: string;
  armoredBarding?: boolean;
}

export interface WarHorseRig {
  root: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  riderMount: THREE.Group;
  frontLeftHip: THREE.Group;
  frontLeftKnee: THREE.Group;
  frontRightHip: THREE.Group;
  frontRightKnee: THREE.Group;
  backLeftHip: THREE.Group;
  backLeftKnee: THREE.Group;
  backRightHip: THREE.Group;
  backRightKnee: THREE.Group;
}

export function createWarHorseRig(opts: WarHorseOptions = {}): WarHorseRig {
  const makeMat = (color: string, roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });

  const coatHex = opts.coatColor ?? '#4a3222';
  const maneHex = opts.maneColor ?? '#1c1510';
  const factionHex = opts.factionColor ?? '#991b1b';
  const armored = opts.armoredBarding ?? true;

  const coatMat = makeMat(coatHex, 0.85, 0.05);
  const darkCoatMat = makeMat(maneHex, 0.9, 0.04);
  const leatherMat = makeMat('#2e1c10', 0.78, 0.08);
  const factionMat = makeMat(factionHex, 0.8, 0.08);
  const steelMat = makeMat('#8d959e', 0.35, 0.78);
  const brassMat = makeMat('#c89d42', 0.38, 0.72);
  const hoofMat = makeMat('#181411', 0.88, 0.05);

  const root = new THREE.Group();
  root.name = 'WarHorseRoot';

  const body = new THREE.Group();
  body.position.set(0, 1.05, 0);
  root.add(body);

  // Barrel torso
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 1.38), coatMat);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  body.add(barrel);

  // Chest & Hindquarters muscular bevels
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 0.42), coatMat);
  chest.position.set(0, 0.03, 0.62);
  chest.castShadow = true;
  body.add(chest);

  const croup = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.42), coatMat);
  croup.position.set(0, 0.04, -0.62);
  croup.castShadow = true;
  body.add(croup);

  // Faction caparison / barding cloth + scale armor
  if (armored) {
    const caparison = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 1.46), factionMat);
    caparison.position.set(0, -0.06, 0);
    caparison.castShadow = true;
    body.add(caparison);

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.38, 0.2), steelMat);
    chestPlate.position.set(0, 0.02, 0.76);
    chestPlate.castShadow = true;
    body.add(chestPlate);

    const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 1.48), brassMat);
    goldTrim.position.set(0, -0.29, 0);
    body.add(goldTrim);
  }

  // Saddle & Stirrups
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.56), leatherMat);
  saddle.position.set(0, 0.31, 0.04);
  saddle.castShadow = true;
  body.add(saddle);

  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.1), leatherMat);
  pommel.position.set(0, 0.38, 0.28);
  body.add(pommel);

  const cantle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), leatherMat);
  cantle.position.set(0, 0.39, -0.2);
  body.add(cantle);

  // Rider mount node (where CharacterRig root sits when mounted)
  const riderMount = new THREE.Group();
  riderMount.name = 'RiderMount';
  riderMount.position.set(0, 0.36, 0.04);
  body.add(riderMount);

  // Neck & Head
  const neck = new THREE.Group();
  neck.position.set(0, 0.22, 0.66);
  neck.rotation.x = -0.52; // angled up and forward
  body.add(neck);

  const neckMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.36), coatMat);
  neckMesh.position.set(0, 0.26, 0.08);
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.64, 0.14), darkCoatMat);
  mane.position.set(0, 0.28, -0.12);
  neck.add(mane);

  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.16);
  head.rotation.x = 0.68;
  neck.add(head);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.48), coatMat);
  skull.position.set(0, 0, 0.16);
  skull.castShadow = true;
  head.add(skull);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.32), darkCoatMat);
  muzzle.position.set(0, -0.04, 0.44);
  head.add(muzzle);

  if (armored) {
    // Steel chanfron (horse face plate)
    const chanfron = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.46), steelMat);
    chanfron.position.set(0, 0.12, 0.22);
    head.add(chanfron);
  }

  const earGeo = new THREE.ConeGeometry(0.05, 0.16, 4);
  const leftEar = new THREE.Mesh(earGeo, coatMat);
  leftEar.position.set(0.1, 0.18, -0.02);
  const rightEar = new THREE.Mesh(earGeo, coatMat);
  rightEar.position.set(-0.1, 0.18, -0.02);
  head.add(leftEar, rightEar);

  // Tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.16, -0.78);
  tail.rotation.x = 0.35;
  body.add(tail);

  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.68, 0.14), darkCoatMat);
  tailMesh.position.set(0, -0.32, -0.06);
  tailMesh.castShadow = true;
  tail.add(tailMesh);

  // 4 Articulated 2-bone legs
  const buildHorseLeg = (x: number, z: number): { hip: THREE.Group; knee: THREE.Group } => {
    const hip = new THREE.Group();
    hip.position.set(x, -0.18, z);
    body.add(hip);

    const upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.2), coatMat);
    upperLeg.position.set(0, -0.22, 0);
    upperLeg.castShadow = true;
    hip.add(upperLeg);

    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0);
    hip.add(knee);

    const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.14), coatMat);
    cannon.position.set(0, -0.19, 0);
    cannon.castShadow = true;
    knee.add(cannon);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.18), hoofMat);
    hoof.position.set(0, -0.39, 0.02);
    knee.add(hoof);

    return { hip, knee };
  };

  const fl = buildHorseLeg(0.22, 0.56);
  const fr = buildHorseLeg(-0.22, 0.56);
  const bl = buildHorseLeg(0.22, -0.56);
  const br = buildHorseLeg(-0.22, -0.56);

  return {
    root,
    body,
    neck,
    head,
    tail,
    riderMount,
    frontLeftHip: fl.hip,
    frontLeftKnee: fl.knee,
    frontRightHip: fr.hip,
    frontRightKnee: fr.knee,
    backLeftHip: bl.hip,
    backLeftKnee: bl.knee,
    backRightHip: br.hip,
    backRightKnee: br.knee,
  };
}

/**
 * Animates the WarHorseRig with a natural 4-beat gallop/trot cycle, neck rhythm,
 * and barrel bob based on horizontal travel speed.
 */
export function updateWarHorseAnimation(horse: WarHorseRig, speed: number, time: number): void {
  const moveFactor = THREE.MathUtils.clamp(speed / 6.5, 0, 1.35);
  const freq = speed > 0.2 ? 6.5 + moveFactor * 4.5 : 1.8;
  const phase = time * freq;

  if (speed < 0.15) {
    // Idle breathing + ear/tail twitch
    horse.body.position.y = 1.05 + Math.sin(time * 2.2) * 0.012;
    horse.body.rotation.x = 0;
    horse.neck.rotation.x = -0.52 + Math.sin(time * 1.8) * 0.03;
    horse.tail.rotation.z = Math.sin(time * 1.6) * 0.08;
    horse.tail.rotation.x = 0.32;

    horse.frontLeftHip.rotation.x = 0;
    horse.frontLeftKnee.rotation.x = 0;
    horse.frontRightHip.rotation.x = 0;
    horse.frontRightKnee.rotation.x = 0;
    horse.backLeftHip.rotation.x = 0;
    horse.backLeftKnee.rotation.x = 0;
    horse.backRightHip.rotation.x = 0;
    horse.backRightKnee.rotation.x = 0;
    return;
  }

  // Gallop / Canter 4-beat phase offsets
  const pFL = phase;
  const pFR = phase + 0.65;
  const pBL = phase + Math.PI;
  const pBR = phase + Math.PI + 0.65;

  const swingAmp = 0.58 * moveFactor;
  const kneeAmp = 0.65 * moveFactor;

  horse.frontLeftHip.rotation.x = Math.sin(pFL) * swingAmp;
  horse.frontLeftKnee.rotation.x = Math.max(0, Math.cos(pFL)) * kneeAmp;

  horse.frontRightHip.rotation.x = Math.sin(pFR) * swingAmp;
  horse.frontRightKnee.rotation.x = Math.max(0, Math.cos(pFR)) * kneeAmp;

  horse.backLeftHip.rotation.x = Math.sin(pBL) * swingAmp * 0.92;
  horse.backLeftKnee.rotation.x = -Math.max(0, Math.cos(pBL)) * kneeAmp * 0.75;

  horse.backRightHip.rotation.x = Math.sin(pBR) * swingAmp * 0.92;
  horse.backRightKnee.rotation.x = -Math.max(0, Math.cos(pBR)) * kneeAmp * 0.75;

  // Barrel pitch & vertical suspension
  horse.body.position.y = 1.05 + Math.abs(Math.sin(phase)) * 0.065 * moveFactor;
  horse.body.rotation.x = Math.cos(phase) * 0.055 * moveFactor;

  // Neck counter-bob & streaming tail
  horse.neck.rotation.x = -0.48 + Math.sin(phase - 0.5) * 0.1 * moveFactor;
  horse.tail.rotation.x = 0.35 + 0.45 * moveFactor + Math.sin(phase * 1.5) * 0.08;
}

/**
 * Overrides lower-body joint rotations on a CharacterRig after CharacterAnimator.update()
 * so the rider sits astride a WarHorse saddle with feet in the stirrups while upper-body
 * 2-bone IK and directional attacks continue to function at 100% fidelity.
 */
export function applyRiderMountedPosture(rider: CharacterRig, horseSpeed: number, time: number): void {
  const rhythm = Math.sin(time * 9.0) * THREE.MathUtils.clamp(horseSpeed / 8.0, 0, 1) * 0.03;
  rider.pelvis.position.set(0, 0.14 + rhythm, 0);
  rider.pelvis.rotation.set(0.06, 0, 0);

  // Spread thighs wide around barrel, bend knees into stirrups
  rider.leftThigh.rotation.set(-0.62, 0.25, 0.44);
  rider.rightThigh.rotation.set(-0.62, -0.25, -0.44);
  rider.leftShin.rotation.set(0.88, 0, 0);
  rider.rightShin.rotation.set(0.88, 0, 0);
  rider.leftFoot.rotation.set(-0.22, 0, 0);
  rider.rightFoot.rotation.set(-0.22, 0, 0);
}

/**
 * Creates a 3D Bannerlord tactical command standard/flag marker for "Hold Position" (F1).
 */
export function createTacticalBannerMesh(factionColor = '#b45309'): THREE.Group {
  const makeMat = (color: string, roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });

  const group = new THREE.Group();
  const poleMat = makeMat('#5c3d24', 0.85, 0.08);
  const goldMat = makeMat('#eab308', 0.3, 0.8);
  const clothMat = makeMat(factionColor, 0.75, 0.05);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.8, 8), poleMat);
  pole.position.y = 1.4;
  pole.castShadow = true;
  group.add(pole);

  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), goldMat);
  finial.position.y = 2.88;
  group.add(finial);

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), goldMat);
  crossbar.position.set(0.36, 2.55, 0);
  crossbar.rotation.z = Math.PI * 0.5;
  group.add(crossbar);

  const bannerCloth = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.05, 0.03), clothMat);
  bannerCloth.position.set(0.38, 2.0, 0);
  bannerCloth.castShadow = true;
  group.add(bannerCloth);

  // Ground ring indicator
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 24),
    new THREE.MeshBasicMaterial({ color: '#facc15', side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
  );
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.02;
  group.add(ring);

  return group;
}


