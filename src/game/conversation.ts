/**
 * conversation.ts — Faz 6d: diyalog sahnesi (kamera yaklaşması + jestler)
 *
 * Bannerlord'da bir lordla konuşmaya başladığınızda kamera **oyuncunun omzunun
 * arkasından** muhataba doğru yaklaşır; muhatap başını size çevirir, nefes alır,
 * konuşurken ağzı oynar ve eliyle jest yapar.
 *
 * Bu modül o sahneyi kurar; oynanış koduna (IK, dövüş, arena) dokunmaz:
 *   · muhatap = `createHeroPortraitRig` ile üretilen gerçek rig (DNA + zırh),
 *   · oyuncu = yakın planda sırtı dönük ikinci rig (omuz üstü kadraj),
 *   · kamera = yaklaşma eğrisi (wide → close), yumuşak sönümleme,
 *   · yüz = baş takibi (yaw/pitch sınırlı), göz kırpma, konuşma sırasında
 *     ağız açıp kapanması, nefes,
 *   · gövde = jest (el kaldırma/vurgu), baş sallama.
 *
 * Ölçüm: `scripts/probe-conversation.ts` (kamera mesafesi, baş açısı, jest
 * genliği, ağız açıklığı, göz kırpma, sahneden çıkarma).
 */
import * as THREE from 'three';
import { createCharacterRig, type CharacterRig } from './characterRig.ts';
import { applyMorphDNAToRig, getHeroDNA } from './characterMorph.ts';
import { createHeroPortraitRig, disposeRig } from './portraitRenderer.ts';
import { deriveOccupation, type HeroRecord, type Occupation } from './heroes.ts';
import type { FactionId, LordAgent } from './rules.ts';

/**
 * Sahne için gereken asgari kahraman bilgisi. `HeroRecord` bunu yapısal olarak
 * karşılar; `LordAgent` de `heroFromLord` ile buraya çevrilir.
 */
export interface ConversationHero {
  id: string;
  name: string;
  occupation: Occupation;
  culture: FactionId;
  bannerColor: string;
}

/** Diyalog muhatabı (`LordAgent`) → sahne kahramanı. */
export function heroFromLord(lord: {
  id: string;
  name: string;
  title?: string;
  faction: FactionId;
  bannerColor?: string;
  isRuler?: boolean;
}): ConversationHero {
  const occupation: Occupation = lord.isRuler
    ? 'RULER'
    : lord.title
      ? deriveOccupation(lord as LordAgent)
      : lord.faction === 'bandits'
        ? 'GANG_LEADER'
        : 'LORD';
  return {
    id: lord.id,
    name: lord.name,
    occupation,
    culture: lord.faction,
    bannerColor: lord.bannerColor ?? '#7f1d1d',
  };
}

export interface ConversationSceneOptions {
  hero: ConversationHero;
  /** Yakın planda sırtı görünecek oyuncu (yoksa yalnızca muhatap çekilir). */
  includePlayer?: boolean;
  /** Oyuncunun yüz/saç bilgisi (portre DNA'sı yoksa nötr kullanılır). */
  player?: { skinTone?: string; hairColor?: string; factionColor?: string };
}

export interface ConversationFrameState {
  /** Konuşuyor mu? (ağız + jest yoğunluğu) */
  speaking: boolean;
  /** Yaklaşma tamamlandı mı? (tam 1 = yakın plan) */
  approach?: number;
}

/** Kamera yaklaşması: wide → close. */
export const APPROACH = {
  from: new THREE.Vector3(0.36, 1.74, 3.2),
  // Yakın plan: muhatabın yüzü kadrajın üst-orta kısmında, oyuncunun omzu
  // sol altta kalacak şekilde kamera omzun hemen gerisinde.
  to: new THREE.Vector3(0.1, 1.67, 1.58),
  /** Yaklaşma süresi (sn). */
  duration: 1.15,
  /** Bakış noktası: muhatabın göz hizası. */
  target: new THREE.Vector3(0, 1.8, 0),
};

/** Baş takibi sınırları (rad) — boyun kırılmasın. */
export const HEAD_LIMIT = { yaw: 0.55, pitch: 0.32 };

const easeInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export interface ConversationScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  npc: CharacterRig;
  player: CharacterRig | null;
  /** Kamera–muhatap mesafesi (ölçüm için). */
  readonly cameraDistance: number;
  /** Yaklaşma ilerlemesi 0..1. */
  readonly approach: number;
  update(dt: number, state?: Partial<ConversationFrameState>): void;
  setSpeaking(value: boolean): void;
  /** Jest tetikle (diyalog seçeneği seçildiğinde). */
  gesture(): void;
  dispose(): void;
}

function faceGroupOf(rig: CharacterRig): THREE.Object3D | null {
  return rig.head.getObjectByName('Face') ?? null;
}

/**
 * Sahneyi kurar. Ağır değil: iki rig + düz ışık; WebGL bağlamı çağıran tarafta.
 */
export function createConversationScene(options: ConversationSceneOptions): ConversationScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14100c');

  // ── ışık: sıcak anahtar + fraksiyon rengi kenar ışığı (portre diliyle aynı)
  scene.add(new THREE.AmbientLight('#fed7aa', 0.78));
  const key = new THREE.DirectionalLight('#fff7ed', 1.75);
  key.position.set(1.4, 2.7, 2.1);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#f59e0b', 1.05);
  rim.position.set(-1.7, 2.1, -1.7);
  scene.add(rim);

  // ── muhatap: portre hattının aynısı (DNA + zırh + saç/sakal)
  const npc = createHeroPortraitRig(options.hero as HeroRecord);
  npc.root.rotation.y = 0; // yüzü +Z (kamera) bakıyor
  scene.add(npc.root);

  // ── oyuncu: yakın planda, sırtı kameraya dönük (omuz üstü kadraj)
  let player: CharacterRig | null = null;
  if (options.includePlayer !== false) {
    player = createCharacterRig({
      skinTone: options.player?.skinTone ?? '#e8be99',
      hairColor: options.player?.hairColor ?? '#2b1b10',
      beardColor: options.player?.hairColor ?? '#2b1b10',
      factionColor: options.player?.factionColor ?? '#1e3a8a',
      hasBeard: false,
      weaponType: 'UNARMED',
      shieldType: 'NONE',
      helmetType: 'NONE',
      armorTier: 'CHAINMAIL',
    });
    // Oyuncu: kameranın sol-önünde, sırtı kameraya dönük (omuz üstü kadraj).
    player.root.position.set(-0.52, 0, 1.12);
    player.root.rotation.y = Math.PI * 0.9; // sırtı kameraya, yüzü muhatafa
    scene.add(player.root);
  }

  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 30);
  camera.position.copy(APPROACH.from);
  camera.lookAt(APPROACH.target);

  // ── durum
  let elapsed = 0;
  let approachT = 0;
  let speaking = false;
  let speakPhase = 0;
  let blinkTimer = 0;
  let blinkPhase = 1; // 1 = açık
  let gestureT = -1;
  let nodT = -1;
  let cameraDistance = camera.position.distanceTo(APPROACH.target);

  const face = faceGroupOf(npc);
  const lowerLip = face?.getObjectByName('lowerLip') as THREE.Mesh | undefined;
  const lipRest = lowerLip ? lowerLip.position.y : 0;
  const eyeMeshes: THREE.Mesh[] = [];
  const lidMeshes: THREE.Mesh[] = [];
  if (face) {
    for (const tag of ['L', 'R'] as const) {
      const eye = face.getObjectByName(`eyeWhite${tag}`) as THREE.Mesh | undefined;
      if (eye) eyeMeshes.push(eye);
      const lid = face.getObjectByName(`lid${tag}`) as THREE.Mesh | undefined;
      if (lid) lidMeshes.push(lid);
    }
  }
  const eyeRestScale = eyeMeshes.map((m) => m.scale.clone());
  const lidRest = lidMeshes.map((m) => m.position.y);

  const tmp = new THREE.Vector3();
  const headWorld = new THREE.Vector3();

  /*
   * Jest için **taban açılar** saklanır. Önceki sürüm her karede `-=` ile
   * açı ekliyordu → el 86 cm yukarıda kalıp inmiyordu (probe-conversation).
   * Artık her karede `taban + genlik × ağırlık` yazılıyor.
   */
  const rest = {
    rShoulderX: npc.rightShoulder.rotation.x,
    rShoulderZ: npc.rightShoulder.rotation.z,
    rForearmX: npc.rightForearm.rotation.x,
    rHandZ: npc.rightHand.rotation.z,
    lShoulderX: npc.leftShoulder.rotation.x,
    torsoX: npc.torso.rotation.x,
    chestY: npc.chestArmorSocket.position.y,
  };

  function update(dt: number, state: Partial<ConversationFrameState> = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    elapsed += dt;
    if (state.speaking !== undefined) speaking = state.speaking;

    // ── 1. kamera yaklaşması (yumuşak, tek yönlü)
    const forced = state.approach;
    approachT = Math.min(1, approachT + dt / APPROACH.duration);
    const p = forced !== undefined ? Math.min(1, Math.max(0, forced)) : easeInOut(approachT);
    camera.position.lerpVectors(APPROACH.from, APPROACH.to, p);
    // Nefes/parallax: kamera hafifçe yaşasın.
    camera.position.x += Math.sin(elapsed * 0.6) * 0.006 * p;
    camera.position.y += Math.sin(elapsed * 0.9) * 0.004 * p;
    camera.lookAt(APPROACH.target);
    camera.updateMatrixWorld(true);
    cameraDistance = camera.position.distanceTo(APPROACH.target);

    // ── 2. muhatap başını kameraya çevirir
    npc.head.getWorldPosition(headWorld);
    tmp.copy(camera.position).sub(headWorld).normalize();
    // Baş yerel uzayında kamera yönü: rig +Z'ye bakıyor.
    const yaw = Math.atan2(tmp.x, tmp.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1));
    const yawC = THREE.MathUtils.clamp(yaw, -HEAD_LIMIT.yaw, HEAD_LIMIT.yaw);
    const pitchC = THREE.MathUtils.clamp(pitch, -HEAD_LIMIT.pitch, HEAD_LIMIT.pitch);
    npc.head.rotation.y = THREE.MathUtils.damp(npc.head.rotation.y, yawC, 5.5, dt);
    npc.head.rotation.x = THREE.MathUtils.damp(npc.head.rotation.x, pitchC, 5.5, dt);
    npc.head.rotation.z = Math.sin(elapsed * 0.7) * 0.012;

    // ── 3. nefes (göğüs/gövde)
    const breath = Math.sin(elapsed * 1.35) * 0.012;
    npc.torso.rotation.x = rest.torsoX + breath * 0.5;
    npc.chestArmorSocket.position.y = rest.chestY + breath * 0.004;

    // ── 4. jest: el kaldırma + vurgu (konuşurken daha sık)
    if (speaking && gestureT < 0 && Math.sin(elapsed * 1.9) > 0.93) gestureT = 0;
    if (gestureT >= 0) {
      gestureT += dt;
      const g = gestureT / 0.75; // 0.75 sn'lik jest
      if (g >= 1) gestureT = -1;
    }
    const gw = gestureT >= 0 ? Math.sin(Math.min(1, gestureT / 0.75) * Math.PI) : 0;
    // Sağ el göğüs hizasına kalkar, avuç içi yukarı döner (taban + genlik).
    npc.rightShoulder.rotation.x = rest.rShoulderX - gw * 0.62;
    npc.rightShoulder.rotation.z = rest.rShoulderZ - gw * 0.3;
    npc.rightForearm.rotation.x = rest.rForearmX - gw * 0.85;
    npc.rightHand.rotation.z = rest.rHandZ + gw * 0.35;
    // Sol el: hafif destek (bel hizasında), küçük salınım.
    npc.leftShoulder.rotation.x = rest.lShoulderX - 0.1 + Math.sin(elapsed * 0.55) * 0.02;

    // ── 5. baş sallama (onaylama): jestten bağımsız, periyodik
    if (nodT >= 0) {
      nodT += dt;
      if (nodT > 0.6) nodT = -1;
    }
    const nod = nodT >= 0 ? Math.sin((nodT / 0.6) * Math.PI * 2) * 0.06 : 0;
    npc.head.rotation.x += nod;

    // ── 6. konuşma: ağız açıp kapanması + küçük çene hareketi
    if (speaking) speakPhase += dt * 9.5;
    const mouthOpen = speaking ? (0.5 + 0.5 * Math.sin(speakPhase)) * 0.0085 : 0;
    if (lowerLip) lowerLip.position.y = lipRest - mouthOpen;
    const mouth = face?.getObjectByName('mouth');
    if (mouth) mouth.position.y = -mouthOpen * 0.45;

    // ── 7. göz kırpma (3–6 sn arası rastgele, hızlı)
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blinkTimer = 2.6 + Math.random() * 3.4;
      blinkPhase = 0;
    }
    if (blinkPhase < 1) {
      blinkPhase = Math.min(1, blinkPhase + dt / 0.16);
      // 0 → kapalı, 1 → açık; kapanma eğrisi hızlı, açılma yumuşak.
      const closed = blinkPhase < 0.5 ? blinkPhase * 2 : (1 - blinkPhase) * 2;
      const sy = 1 - closed * 0.88;
      eyeMeshes.forEach((m, i) => {
        m.scale.y = eyeRestScale[i].y * sy;
      });
      lidMeshes.forEach((m, i) => {
        m.position.y = lidRest[i] - closed * 0.006;
      });
    } else {
      eyeMeshes.forEach((m, i) => {
        m.scale.y = eyeRestScale[i].y;
      });
      lidMeshes.forEach((m, i) => {
        m.position.y = lidRest[i];
      });
    }

    // ── 8. oyuncu: nefes + hafif ağırlık kayması (kadrajda canlı dursun)
    if (player) {
      player.torso.rotation.x = Math.sin(elapsed * 1.1) * 0.008;
      player.root.position.x = -0.52 + Math.sin(elapsed * 0.45) * 0.006;
    }

    npc.root.updateMatrixWorld(true);
    player?.root.updateMatrixWorld(true);
  }

  // İlk kareyi kur (kamera/baş pozisyonları hazır olsun).
  update(0);

  return {
    scene,
    camera,
    npc,
    player,
    get cameraDistance() {
      return cameraDistance;
    },
    get approach() {
      return approachT;
    },
    update,
    setSpeaking(value: boolean) {
      speaking = value;
    },
    gesture() {
      gestureT = 0;
      nodT = 0;
    },
    dispose() {
      scene.remove(npc.root);
      disposeRig(npc);
      if (player) {
        scene.remove(player.root);
        disposeRig(player);
        player = null;
      }
      scene.clear();
    },
  };
}
