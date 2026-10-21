import * as THREE from 'three';
import { CharacterAnimator } from './characterAnimator.ts';
import type { CharacterAnimState } from './characterAnimator.ts';

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

  const noseMesh = mesh(new THREE.BoxGeometry(0.035, 0.06, 0.05), mats.skin, false);
  noseMesh.position.set(0, HEAD.cy - 0.01, HEAD.r * HEAD.sz + 0.005);
  head.add(noseMesh);

  const eyeMat = new THREE.MeshBasicMaterial({ color: '#1c1917' });
  const eyeGeo = new THREE.BoxGeometry(0.03, 0.018, 0.03);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(0.05, HEAD.cy + 0.02, HEAD.r * HEAD.sz - 0.012);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(-0.05, HEAD.cy + 0.02, HEAD.r * HEAD.sz - 0.012);
  head.add(leftEye, rightEye);

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

  const beardMesh = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), mats.hair, false);
  beardMesh.position.set(0, HEAD.cy - 0.1, 0.085);
  beardMesh.visible = options.hasBeard !== false;
  head.add(beardMesh);

  // Helmet socket sits at the CENTER of the head ellipsoid.
  const helmetSocket = new THREE.Group();
  helmetSocket.position.y = HEAD.cy;
  head.add(helmetSocket);

  // --- Arms ---
  const upperArmGeo = new THREE.CylinderGeometry(0.07, 0.06, RIG_DIMENSIONS.upperArm, 6);
  const forearmGeo = new THREE.CylinderGeometry(0.06, 0.05, RIG_DIMENSIONS.forearm, 6);
  const handGeo = new THREE.BoxGeometry(0.07, 0.09, 0.08);

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
    const hm = mesh(handGeo, mats.skin, false);
    hm.position.y = -0.04;
    hand.add(hm);

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

    // Sloping brim
    const brim = mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.018, 10), metal);
    brim.position.y = 0.015;

    // Rim reinforcement
    const rim = mesh(new THREE.TorusGeometry(0.29, 0.007, 4, 10), gold, false);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.012;

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
    const mailCoif = mesh(new THREE.CylinderGeometry(HEAD.r + 0.018, HEAD.r + 0.045, 0.18, 8, 1, true), metal);
    mailCoif.scale.set(1, 1, HEAD.sz);
    mailCoif.position.set(0, -0.08, -0.015);

    g.add(cone, band, nasal, mailCoif);
    return g;
  }

  if (type === 'IMPERIAL_VISOR') {
    // Heavy Cataphract enclosed visor with horsehair crest
    const g = new THREE.Group();

    // Rounded iron skull bowl
    const bowl = mesh(new THREE.SphereGeometry(HEAD.r + 0.02, 8, 6), metal);
    bowl.scale.set(1, HEAD.sy, HEAD.sz);
    bowl.position.y = 0.01;

    // Brass face mask with eye slits
    const mask = mesh(new THREE.BoxGeometry(0.165, 0.17, 0.04), gold, false);
    mask.position.set(0, -0.04, (HEAD.r + 0.015) * HEAD.sz + 0.005);

    // Eye slits
    const slitMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.05), slitMat);
    slit.position.set(0, -0.015, (HEAD.r + 0.015) * HEAD.sz + 0.008);

    // Mail aventail covering neck
    const aventail = mesh(new THREE.CylinderGeometry(HEAD.r + 0.02, HEAD.r + 0.05, 0.2, 8, 1, true), metal);
    aventail.scale.set(1, 1, HEAD.sz);
    aventail.position.set(0, -0.09, -0.01);

    // Red horsehair crest
    const plumeMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.8, flatShading: true });
    const plume = mesh(new THREE.BoxGeometry(0.035, 0.14, 0.26), plumeMat);
    plume.position.set(0, 0.18, 0);

    g.add(bowl, mask, slit, aventail, plume);
    return g;
  }

  return null;
}

function buildArmor(rig: CharacterRig, tier: ArmorTier) {
  const { metal, gold, leather } = rig.materials;
  const dScale = TORSO_DEPTH_SCALE + 0.02; // matches torso depth so armors don't bulge into arms

  if (tier === 'LEATHER') {
    const c = mesh(new THREE.CylinderGeometry(0.245, 0.19, 0.44, 6), leather);
    c.position.y = -0.02;
    c.scale.z = dScale;
    rig.chestArmorSocket.add(c);

    // Pauldrons positioned cleanly over the shoulder top without penetrating upper arm
    const pGeo = new THREE.BoxGeometry(0.13, 0.055, 0.15);
    const lp = mesh(pGeo, leather);
    lp.position.set(0.03, 0.02, 0);
    rig.leftPauldronSocket.add(lp);

    const rp = mesh(pGeo.clone(), leather);
    rp.position.set(-0.03, 0.02, 0);
    rig.rightPauldronSocket.add(rp);
  } else if (tier === 'CHAINMAIL') {
    const mail = mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.47, 6), metal);
    mail.position.y = -0.04;
    mail.scale.z = dScale;

    const coif = mesh(new THREE.CylinderGeometry(0.14, 0.21, 0.12, 6), metal);
    coif.position.y = 0.2;
    coif.scale.z = dScale;
    rig.chestArmorSocket.add(mail, coif);

    const pGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.09, 6);
    const lp = mesh(pGeo, metal);
    lp.position.set(0.03, 0.015, 0);
    rig.leftPauldronSocket.add(lp);

    const rp = mesh(pGeo.clone(), metal);
    rp.position.set(-0.03, 0.015, 0);
    rig.rightPauldronSocket.add(rp);
  } else if (tier === 'PLATE') {
    const plate = mesh(new THREE.CylinderGeometry(0.255, 0.21, 0.46, 6), metal);
    plate.position.y = -0.02;
    plate.scale.z = dScale;
    rig.chestArmorSocket.add(plate);

    const crest = mesh(new THREE.BoxGeometry(0.11, 0.11, 0.03), gold, false);
    crest.position.set(0, 0.04, 0.21 * dScale);
    rig.chestArmorSocket.add(crest);

    // Layered plate spaulders
    for (const [sock, side] of [[rig.leftPauldronSocket, 1], [rig.rightPauldronSocket, -1]] as const) {
      const p = mesh(new THREE.BoxGeometry(0.15, 0.09, 0.16), metal);
      p.position.set(side * 0.035, 0.025, 0);
      const t = mesh(new THREE.BoxGeometry(0.16, 0.02, 0.17), gold, false);
      t.position.set(side * 0.035, 0.07, 0);
      sock.add(p, t);
    }
  }
}

/**
 * Shields are authored face-normal +Z, top +Y, then rotated so the top points along hand -X.
 * (With the left forearm held horizontally across the chest, hand -X is world-up.)
 */
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
    const stripe = mesh(new THREE.BoxGeometry(0.16, 0.9, 0.01), faction, false);
    stripe.position.z = 0.025;
    const r1 = mesh(new THREE.BoxGeometry(0.48, 0.04, 0.05), metal, false);
    r1.position.y = 0.34;
    const r2 = r1.clone();
    r2.position.y = -0.34;
    body.add(board, stripe, r1, r2);
    body.position.y = 0.06;
  }

  const holder = new THREE.Group();
  holder.name = 'Shield';
  holder.add(body);
  holder.rotation.z = Math.PI / 2; // shield top (+Y) -> hand -X
  holder.position.set(0, 0.08, 0.07); // forearm sits behind the shield, slightly toward the elbow
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
  if (options.helmetType === 'NONE' || options.helmetType === 'KETTLE_HAT') {
    rig.hairGroup.visible = true;
    rig.beardMesh.visible = options.hasBeard !== false;
  } else if (options.helmetType === 'SPANGENHELM') {
    rig.hairGroup.visible = false;
    rig.beardMesh.visible = options.hasBeard !== false;
  } else if (options.helmetType === 'IMPERIAL_VISOR') {
    rig.hairGroup.visible = false;
    rig.beardMesh.visible = false;
  }

  const helmet = buildHelmet(options.helmetType, m);
  if (helmet) rig.helmetSocket.add(helmet);

  buildArmor(rig, options.armorTier);

  if (options.weaponType === 'BOW') {
    const bow = buildBow(m);
    rig.bow = bow;
    rig.offHandItem = bow.group;
    rig.nockedArrowMesh = bow.nockedArrow;
    rig.leftShieldSocket.add(bow.group);
    rig.backSocket.add(buildQuiver(m));
  } else {
    const weapon = buildMainWeapon(options.weaponType, m);
    if (weapon) {
      rig.mainHandItem = weapon;
      rig.rightWeaponSocket.add(weapon);
    }
    // Two-handed weapons and spears need the left hand -> no shield.
    const twoHanded = options.weaponType === 'TWO_HANDED_SWORD' || options.weaponType === 'SPEAR';
    if (!twoHanded) {
      const shield = buildShield(options.shieldType, m);
      if (shield) {
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
        off.position.set(0, 0.08, 0.07);
        off.rotation.set(0, 0, Math.PI / 2);
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


