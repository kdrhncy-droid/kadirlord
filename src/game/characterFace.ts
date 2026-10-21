/**
 * characterFace.ts — prosedürel low-poly yüz katmanı
 *
 * Sorun: eski kafa modelinde gözler kafatası elipsoidinin İÇİNDE kalıyordu
 * (z = 0.119 < yüzey 0.131) ve sadece fasetli yüzeylerden rastgele taşan siyah
 * kutular olarak görünüyordu. Burun, ağız, kaş ve kulak yoktu; yüz "boş" bir
 * toptan ibaretti.
 *
 * Bu modül yüzü ayrı bir `Group` ('Face') olarak kurar; böylece:
 *   · `characterRig.ts` iskeleti değişmeden kalır,
 *   · `applyMorphDNAToRig` DNA kaydırıcılarını (göz rengi, burun, kaş, çene,
 *     yüz şekli) doğrudan bu gruba uygular,
 *   · saç/sakal/miğfer katmanları yüzün üstüne bağımsız eklenebilir.
 *
 * Ölçek: tüm koordinatlar KAFA EKLEMİ yerel uzayındadır (kafatası merkezi
 * y = HEAD.cy = 0.14). Kafatası yarıçapları: x 0.135, y 0.147, z 0.131.
 */

import * as THREE from 'three';
import type { CharacterMorphDNA, FaceShape } from './characterMorph.ts';

/**
 * Kafatası merkezinin kafa-eklemi yerel Y'si (characterRig.HEAD.cy = 0.14).
 * Döngüsel import olmaması için burada sabit tutulur; `createFace` çağrılırken
 * güncel değer geçilebilir ve grubun userData'sına yazılır.
 */
const DEFAULT_SKULL_Y = 0.14;
let SKULL_Y = DEFAULT_SKULL_Y;

/** Kafatası elipsoidi (kafa-eklemi yerel uzayı). */
const SKULL_R = { x: 0.125, y: 0.147, z: 0.131 };

/**
 * Verilen (x, y) noktasında kafatası yüzeyinin ön z'si.
 * Yüz plakaları (dudak, burun, kaş) bu değerin BİRAZ önüne konur; aksi halde
 * plaka kafatasının içinde kalır ve sadece kenarları "leke" gibi görünür.
 */
function surfaceZ(x: number, y: number, out = 0.004): number {
  const nx = x / SKULL_R.x;
  const ny = (y - SKULL_Y) / SKULL_R.y;
  const k = 1 - nx * nx - ny * ny;
  return SKULL_R.z * Math.sqrt(Math.max(0, k)) + out;
}

export interface FaceMaterials {
  skin: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
}

interface FacePalette {
  eyeWhite: THREE.MeshStandardMaterial;
  iris: THREE.MeshStandardMaterial;
  pupil: THREE.MeshStandardMaterial;
  brow: THREE.MeshStandardMaterial;
  lips: THREE.MeshStandardMaterial;
  skinShadow: THREE.MeshStandardMaterial;
  lash: THREE.MeshStandardMaterial;
}

function makePalette(mats: FaceMaterials, eyeColor: string): FacePalette {
  return {
    eyeWhite: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.45, flatShading: true }),
    iris: new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.35, metalness: 0.05, flatShading: true }),
    pupil: new THREE.MeshBasicMaterial({ color: '#120d0a' }) as unknown as THREE.MeshStandardMaterial,
    brow: mats.hair.clone(),
    lips: new THREE.MeshStandardMaterial({ color: '#a9654f', roughness: 0.82, flatShading: true }),
    skinShadow: new THREE.MeshStandardMaterial({ color: '#b8825f', roughness: 0.9, flatShading: true }),
    lash: new THREE.MeshStandardMaterial({ color: '#231610', roughness: 0.95, flatShading: true }),
  };
}

/* ─────────────────────────── kurulum ─────────────────────────── */

/**
 * Yüz grubunu kurar. Parçalar isimleriyle bulunur:
 * eyeWhiteL/R, irisL/R, pupilL/R, browL/R, nose, noseTip, nostril,
 * mouth, lowerLip, earL/R, chin, jawL/R
 */
export function createFace(
  mats: FaceMaterials,
  dna?: Partial<CharacterMorphDNA>,
  skullY = DEFAULT_SKULL_Y,
): THREE.Group {
  SKULL_Y = skullY;
  const g = new THREE.Group();
  g.name = 'Face';
  g.userData.skullY = skullY;
  const pal = makePalette(mats, dna?.eyeColor ?? '#5b3a20');

  const add = (mesh: THREE.Mesh, name: string): THREE.Mesh => {
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
    return mesh;
  };

  /* ── gözler ──
     Kafatası elipsoidi: rx 0.125, ry 0.147, rz 0.131.
     Göz merkezi x = ±0.045, y = +0.012 → o noktada yüzey z ≈ 0.127.
     Göz akı bu yüzeye oturur, iris ve bebek 1-2 mm dışa taşar. */
  const EYE_Y = SKULL_Y + 0.012;
  const EYE_X = 0.045;
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? 'R' : 'L'; // karakterin sol/sağ (kamera değil)
    const eyeWhite = add(
      new THREE.Mesh(new THREE.SphereGeometry(0.0168, 8, 6), pal.eyeWhite),
      `eyeWhite${tag}`,
    );
    eyeWhite.scale.set(1, 0.72, 0.62);
    eyeWhite.position.set(side * EYE_X, EYE_Y, surfaceZ(EYE_X, EYE_Y, -0.0055));

    const iris = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.0074, 0.0074, 0.004, 8), pal.iris),
      `iris${tag}`,
    );
    iris.rotation.x = Math.PI / 2;
    iris.position.set(side * EYE_X, EYE_Y, surfaceZ(EYE_X, EYE_Y, 0.0055));

    const pupil = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.003, 8), pal.pupil),
      `pupil${tag}`,
    );
    pupil.rotation.x = Math.PI / 2;
    pupil.position.set(side * EYE_X, EYE_Y, surfaceZ(EYE_X, EYE_Y, 0.0072));

    // Kirpik / üst göz kapağı çizgisi: gözün üstüne oturan ince koyu yay.
    // Kadın yüzlerinde görünür (applyFaceDNA açar); erkeklerde gizli.
    const lash = add(
      new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.0042, 0.006), pal.lash),
      `lash${tag}`,
    );
    lash.position.set(side * EYE_X, EYE_Y + 0.0106, surfaceZ(EYE_X, EYE_Y + 0.0106, 0.0042));
    lash.rotation.z = side * 0.17;

    // Kaş: alın kavisine oturan ince, kısa levha (saç rengi)
    const brow = add(new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.011, 0.014), pal.brow), `brow${tag}`);
    brow.position.set(side * 0.048, SKULL_Y + 0.042, surfaceZ(0.048, SKULL_Y + 0.042, 0.0025));
    brow.rotation.z = side * -0.12;
    brow.rotation.y = side * 0.36;

    // Kulak: kafatası yanına gömülü ince levha
    // Kulak: kafatası elipsoidinin yanına TAM oturur (içine girerse faset
    // kesişmesi "tarak" gibi artefakt üretiyordu).
    const ear = add(new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.036, 0.021), mats.skin), `ear${tag}`);
    ear.position.set(side * (SKULL_R.x - 0.002), SKULL_Y - 0.008, -0.006);
    ear.rotation.y = side * 0.22;
    ear.rotation.x = -0.08;
  }

  /* ── burun: ince köprü + uç + burun deliği gölgesi ──
     Yüzey z'si y = -0.01'de ≈ 0.130, y = -0.04'te ≈ 0.126. */
  const nose = add(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.034), mats.skin), 'nose');
  nose.position.set(0, SKULL_Y - 0.008, surfaceZ(0, SKULL_Y - 0.008, -0.006));
  nose.rotation.x = 0.1;

  const noseTip = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.026), mats.skin), 'noseTip');
  noseTip.position.set(0, SKULL_Y - 0.036, surfaceZ(0, SKULL_Y - 0.036, 0.006));
  noseTip.rotation.x = 0.4;

  const nostril = add(new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.006, 0.008), pal.skinShadow), 'nostril');
  nostril.position.set(0, SKULL_Y - 0.0465, surfaceZ(0, SKULL_Y - 0.0465, 0.0005));

  /* ── ağız: tek ince çizgi + hafif dudak dokusu (kırmızı değil) ── */
  const mouth = add(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.006, 0.008), pal.skinShadow), 'mouth');
  mouth.position.set(0, SKULL_Y - 0.074, surfaceZ(0, SKULL_Y - 0.074, 0.0012));

  const upperLip = add(new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.009, 0.008), pal.lips), 'upperLip');
  upperLip.position.set(0, SKULL_Y - 0.0665, surfaceZ(0, SKULL_Y - 0.0665, 0.0018));

  const lowerLip = add(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.009, 0.008), pal.lips), 'lowerLip');
  lowerLip.position.set(0, SKULL_Y - 0.0805, surfaceZ(0, SKULL_Y - 0.0805, 0.0016));

  // Çene için ayrı parça yok: kafatası elipsoidi + `chinLength` ölçeği yeterli.
  const chin = add(new THREE.Mesh(new THREE.BufferGeometry(), mats.skin), 'chin');
  chin.visible = false;

  /* yanak kabartısı yok: 0.05'lik kutular yüzde kare leke gibi duruyordu.
     Elmacık genişliği zaten kafatası ölçeği (jawWidth) ile veriliyor. */

  applyFaceDNA(g, dna, mats);
  return g;
}

/* ─────────────────────────── DNA uygulaması ─────────────────────────── */

const FACE_SHAPE_FACTORS: Record<FaceShape, { x: number; y: number; z: number }> = {
  oval: { x: 0.97, y: 1.03, z: 0.98 },
  square: { x: 1.06, y: 0.98, z: 1.02 },
  round: { x: 1.03, y: 0.96, z: 1.03 },
  angular: { x: 1.0, y: 1.02, z: 0.97 },
  chiseled: { x: 1.02, y: 1.0, z: 0.99 },
};

/** DNA kaydırıcılarını mevcut yüz grubuna uygular (yeniden üretmez). */
export function applyFaceDNA(group: THREE.Object3D | null, dna?: Partial<CharacterMorphDNA>, mats?: FaceMaterials): void {
  if (!group) return;
  SKULL_Y = (group.userData?.skullY as number | undefined) ?? DEFAULT_SKULL_Y;
  const d = dna ?? {};
  const feminine = d.gender === 'female';

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const noseLen = clamp(d.noseLength ?? 1, 0.7, 1.4);
  const noseBridge = clamp(d.noseBridge ?? 1, 0.7, 1.4);
  const brow = clamp(d.browProminence ?? 1, 0.7, 1.35);
  const jaw = clamp(d.jawWidth ?? 1, 0.75, 1.35);
  const chinLen = clamp(d.chinLength ?? 1, 0.75, 1.35);
  const shape = FACE_SHAPE_FACTORS[d.faceShape ?? 'oval'] ?? FACE_SHAPE_FACTORS.oval;

  const nose = group.getObjectByName('nose');
  if (nose) {
    nose.scale.set(0.9 + noseBridge * 0.22, noseLen, 0.8 + noseBridge * 0.35);
    nose.position.y = SKULL_Y - 0.006 - (noseLen - 1) * 0.012;
  }
  const noseTip = group.getObjectByName('noseTip');
  if (noseTip) {
    noseTip.scale.set(0.9 + noseBridge * 0.2, 1 + (noseLen - 1) * 0.6, 0.9 + noseBridge * 0.3);
    noseTip.position.y = SKULL_Y - 0.036 - (noseLen - 1) * 0.03;
  }
  const nostril = group.getObjectByName('nostril');
  if (nostril) nostril.position.y = SKULL_Y - 0.05 - (noseLen - 1) * 0.032;

  for (const tag of ['L', 'R'] as const) {
    const browMesh = group.getObjectByName(`brow${tag}`);
    if (browMesh) {
      browMesh.scale.set(0.85 + brow * 0.22, 0.85 + brow * 0.3, 1);
      if (feminine) {
        // Kadın yüzü: kaş daha ince, biraz daha uzun ve yukarıda (yumuşak hat).
        browMesh.scale.set(browMesh.scale.x * 1.06, browMesh.scale.y * 0.6, browMesh.scale.z);
      }
      browMesh.position.y = SKULL_Y + 0.044 + (brow - 1) * 0.008 + (feminine ? 0.002 : 0);
    }
    const eye = group.getObjectByName(`eyeWhite${tag}`);
    if (eye) eye.scale.x = 0.95 + jaw * 0.12;
    const lash = group.getObjectByName(`lash${tag}`) as THREE.Mesh | undefined;
    if (lash) {
      lash.visible = feminine;
      if (feminine) lash.scale.set(0.94 + jaw * 0.1, 1.18, 1);
    }
    const iris = group.getObjectByName(`iris${tag}`);
    // Kadın yüzünde iris biraz daha büyük (yumuşak bakış), erkeklerde aynı.
    if (iris) iris.scale.setScalar(feminine ? 1.08 : 1);
    const cheek = group.getObjectByName(`cheek${tag}`);
    if (cheek) {
      cheek.position.x = (0.072 + (jaw - 1) * 0.02) * (tag === 'L' ? 1 : -1);
      cheek.scale.set(0.9 + jaw * 0.2, 1, 1);
    }
    const ear = group.getObjectByName(`ear${tag}`);
    if (ear) ear.position.x = (0.131 + (jaw - 1) * 0.012) * (tag === 'L' ? 1 : -1);
  }

  const chin = group.getObjectByName('chin');
  if (chin) {
    chin.scale.set(0.85 + jaw * 0.25, 0.85 + chinLen * 0.28, 0.9 + chinLen * 0.2);
    chin.position.y = SKULL_Y - 0.114 - (chinLen - 1) * 0.022;
  }

  const mouth = group.getObjectByName('mouth');
  const upperLip = group.getObjectByName('upperLip');
  const lowerLip = group.getObjectByName('lowerLip');
  const drop = (chinLen - 1) * 0.01;
  for (const m of [mouth, upperLip, lowerLip]) {
    if (m) {
      m.scale.x = (0.92 + jaw * 0.16 * shape.x) * (feminine ? 1.06 : 1);
      if (feminine) m.scale.y *= 1.35;
      m.position.y -= drop;
    }
  }
  if (feminine && mats) {
    // Kadınlarda dudak daha sıcak bir ton (aynı materyal paylaşılıyorsa klonla).
    const lipMat = (upperLip as THREE.Mesh | undefined)?.material as
      | THREE.MeshStandardMaterial
      | undefined;
    if (lipMat && !lipMat.userData?.feminineTint) {
      lipMat.color.set('#b05a52');
      lipMat.userData = { ...(lipMat.userData ?? {}), feminineTint: true };
    }
  }
  if (mouth) mouth.position.z = 0.1125 + (shape.z - 1) * 0.3;

  // Göz rengi canlı güncellenebilsin
  const irisMat = (group.getObjectByName('irisL') as THREE.Mesh | undefined)?.material as
    | THREE.MeshStandardMaterial
    | undefined;
  if (irisMat && d.eyeColor) irisMat.color.set(d.eyeColor);

  // Ten rengi değişince kulak/çene gibi ten parçaları da güncellenmeli
  if (mats) {
    group.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat === mats.skin) return; // paylaşılan ten materyali zaten güncel
    });
  }
}

/** Yüz şeklinin kafa ölçeğine katkısı (characterMorph bunu kullanır). */
export function faceShapeScale(shape?: FaceShape): { x: number; y: number; z: number } {
  return FACE_SHAPE_FACTORS[shape ?? 'oval'] ?? FACE_SHAPE_FACTORS.oval;
}
