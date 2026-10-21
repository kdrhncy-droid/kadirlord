/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  armoryBridge.ts — BannerForge (armory-studio) ↔ Sancak-ı Kalradya köprüsü
 *
 *  NE YAPAR:  Sadece GÖRSEL VARLIK üretir (zırh, kılıç, kalkan, miğfer, ok).
 *  NE YAPMAZ: Oynanışa dokunmaz. IK, 4 yönlü dövüş, animasyon, simülasyon,
 *             kamera ve hasar mantığı tamamen mevcut `characterRig.ts` +
 *             `characterAnimator.ts` içinde kalır.
 *
 *  NASIL:  BannerForge parçaları EKLEM UZAYINDA yazılmıştır (her parça, bağlı
 *          olduğu eklemin pivotunda (0,0,0) durur ve kemik boyunca -Y yönünde
 *          uzanır). Bizim rig de aynı sözleşmeyi kullanıyor; bu yüzden parçalar
 *          doğrudan kendi eklem düğümlerimize takılabilir.
 *
 *  FİT (kalibrasyon):  Bizim karakter BannerForge mankeninden daha kalın
 *          (kol yarıçapı 0.07'ye karşı 0.05; gövde 0.24'e karşı 0.21). Bu yüzden
 *          `JOINT_FIT` tablosundaki radyal ölçekler zırhı vücudun DIŞINA oturtur.
 *          Tablo `scripts/verify-armory.ts` içindeki kapsama (containment)
 *          testiyle doğrulanır; değerleri değiştirirseniz testi tekrar çalıştırın.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { Armory, type ArmoryItemId, type ArmoryItemBuild } from '../armory/Armory.ts';
import { buildArmorSet, type ArmorPiece, type ArmorSet } from '../armory/Armor.ts';
import { FactionPalette, type FactionDef } from '../armory/Faction.ts';
import { MaterialLibrary, type MaterialDef, type LodLevel } from '../armory/Core.ts';
import { createArmorPalette } from '../armory/Armor.ts';
import type {
  CharacterRig,
  WeaponType,
  ShieldType,
  HelmetType,
  ArmorTier,
} from './characterRig.ts';

/* ─────────────────────────── genel tipler ─────────────────────────── */

export type ArmoryLod = LodLevel;

export interface ArmoryContext {
  /** Oyunun fraksiyon kimliği: vlandia, empire, sturgia, khuzait, aserai, battania, bandits, player */
  factionId?: string;
  /** Fraksiyon ana rengi (#rrggbb) — bilinmeyen fraksiyonlarda palet buradan üretilir. */
  factionColor?: string;
  /** Detay seviyesi: 'hero' (yakın plan), 'battle' (savaş), 'crowd' (kalabalık). */
  lod?: ArmoryLod;
}

const DEFAULT_LOD: ArmoryLod = 'battle';

/* ─────────────────────────── ana anahtar (toggle) ─────────────────────────── */

let armoryEnabled = true;

/** BannerForge görsellerini aç/kapat. Kapatınca eski (legacy) modeller devreye girer. */
export function setArmoryVisualsEnabled(enabled: boolean): void {
  armoryEnabled = enabled;
}

export function armoryVisualsEnabled(): boolean {
  return armoryEnabled;
}

/* ─────────────────────────── fraksiyon paleti ─────────────────────────── */

/** Oyun fraksiyon kimliği → BannerForge fraksiyon kimliği. */
const FACTION_ALIAS: Record<string, string> = {
  player: 'custom',
  bandits: 'bandit',
  bandit: 'bandit',
  empire: 'empire',
  vlandia: 'vlandia',
  sturgia: 'sturgia',
  khuzait: 'khuzait',
  aserai: 'aserai',
  battania: 'battania',
  custom: 'custom',
};

const paletteCache = new Map<string, FactionPalette>();

/**
 * Oyunun fraksiyon bilgisinden BannerForge paleti üretir.
 * Bilinen kültürler hazır paletleri kullanır; serbest renkler (oyuncu sancağı,
 * haydutlar) verilen hex'ten türetilir.
 */
export function resolveArmoryFaction(ctx: ArmoryContext = {}): FactionPalette {
  const rawId = (ctx.factionId ?? 'vlandia').toLowerCase();
  const id = FACTION_ALIAS[rawId] ?? rawId;
  const color = ctx.factionColor;
  const key = `${id}|${color ?? 'default'}`;

  const cached = paletteCache.get(key);
  if (cached) return cached;

  let palette: FactionPalette;
  if (id === 'custom' || (!FACTION_ALIAS[rawId] && color)) {
    const primary = color ? new THREE.Color(color).getHex() : 0xd97706;
    const def: Partial<FactionDef> & { id: string; name: string } = {
      id: 'custom',
      name: 'Bağımsız Sancak',
      primary,
      secondary: mixHex(primary, 0xf2e3c2, 0.72),
      trim: mixHex(primary, 0xd9a441, 0.55),
      cloth: mixHex(primary, 0x2a2622, 0.55),
      steel: 0x8e97a3,
      steelDark: 0x4d545e,
      gold: 0xd9a441,
      wood: 0x6b4a2b,
      leather: 0x4e3117,
    };
    palette = new FactionPalette(def);
  } else {
    palette = FactionPalette.byId(id);
    // Bilinen kültürde bile oyuncunun sancak rengi farklıysa ana rengi ez.
    if (color) palette.setColor('primary', color);
  }

  paletteCache.set(key, palette);
  return palette;
}

function mixHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/* ─────────────────────────── üretim önbelleği ─────────────────────────── */

const armoryCache = new Map<string, Armory>();

function armoryFor(ctx: ArmoryContext): Armory {
  const palette = resolveArmoryFaction(ctx);
  const key = `${palette.id}|${palette.colors.primary.toString(16)}|${ctx.lod ?? DEFAULT_LOD}`;
  const hit = armoryCache.get(key);
  if (hit) return hit;
  const armory = new Armory(palette, { seed: 20261021, warnOnBudgetOverflow: false });
  armoryCache.set(key, armory);
  return armory;
}

/**
 * Bir ekipmanı üretir. `lod` verilmezse bağlama göre seçilir
 * (oyuncu/arenada 'hero', kalabalıkta 'battle').
 */
export function buildArmoryItem(id: ArmoryItemId, ctx: ArmoryContext = {}): ArmoryItemBuild {
  return armoryFor(ctx).buildItem(id, ctx.lod ?? DEFAULT_LOD);
}

/* ─────────────────────────── eşlemeler ─────────────────────────── */

/** Bizim silah tiplerimiz → BannerForge katalog kimlikleri. */
export const WEAPON_MODEL_MAP: Record<WeaponType, ArmoryItemId | null> = {
  ONE_HANDED_SWORD: 'gladius',
  TWO_HANDED_SWORD: 'greatsword',
  SPEAR: 'lance',
  BOW: 'recurveBow',
  UNARMED: null,
};

/** Fraksiyona göre tek elli silah dokusu (görsel çeşitlilik, denge etkisi yok). */
const ONE_HANDED_BY_FACTION: Record<string, ArmoryItemId> = {
  khuzait: 'scimitar',
  sturgia: 'warAxe',
  battania: 'warAxe',
  aserai: 'flangedMace',
  vlandia: 'gladius',
  empire: 'gladius',
  bandit: 'warAxe',
  custom: 'gladius',
};

export const SHIELD_MODEL_MAP: Record<ShieldType, ArmoryItemId | null> = {
  NONE: null,
  ROUND_SHIELD: 'vikingShield',
  KITE_SHIELD: 'kiteShield',
  PAVISE: 'paviseShield',
};

export const HELMET_MODEL_MAP: Record<HelmetType, ArmoryItemId | null> = {
  NONE: null,
  KETTLE_HAT: 'kettleHat',
  SPANGENHELM: 'nasalHelm',
  /*
   * Katafrakt miğferi için BannerForge'un `greatHelm` modeli KULLANILMIYOR:
   * model bizim kafatasımıza göre fazla büyük (yükseklik 0.40 m, kafatası 0.28)
   * ve göz yarıkları göz hizasının ~3 cm altına düşüyordu. Sonuç: kafada kova
   * gibi duran, yüzü kapatan bozuk bir miğfer. `null` döndürünce
   * `characterRig.buildHelmet` içindeki kendi katafrakt modelimiz kullanılır
   * (kubbe + alın plakası + göz yarığı + yanak plakası + boyun zırhı + tepelik).
   */
  IMPERIAL_VISOR: null,
};

/** Bizim zırh kadememiz → BannerForge zırh kademesi. CIVILIAN = zırhsız. */
export const ARMOR_TIER_MAP: Record<ArmorTier, 'light' | 'medium' | 'heavy' | null> = {
  CIVILIAN: null,
  LEATHER: 'light',
  CHAINMAIL: 'medium',
  PLATE: 'heavy',
};

/** Mevcut silah tipini fraksiyona göre çözer. */
export function resolveWeaponId(weapon: WeaponType, ctx: ArmoryContext = {}): ArmoryItemId | null {
  if (weapon === 'ONE_HANDED_SWORD') {
    const fid = (ctx.factionId ?? '').toLowerCase();
    return ONE_HANDED_BY_FACTION[FACTION_ALIAS[fid] ?? fid] ?? 'gladius';
  }
  return WEAPON_MODEL_MAP[weapon];
}

/* ─────────────────────────── eklem eşlemesi + fit ─────────────────────────── */

type LegJoin = { obj: THREE.Object3D; offset: [number, number, number]; scale: [number, number, number] };

/**
 * BannerForge eklem adı → bizim rig'deki düğüm + kalibrasyon.
 *
 * `scale`: parçayı vücudumuzun DIŞINA oturtmak için radyal (x/z) büyütme.
 *          Bizim uzuvlarımız BannerForge mankeninden kalın olduğu için gerekli.
 * `offset`: kadraj düzeltmesi (yalnızca gövde/baş bölgelerinde).
 */
function jointFit(rig: CharacterRig, bfJoint: string): LegJoin | null {
  switch (bfJoint) {
    // ── gövde ──
    case 'pelvis':
      return { obj: rig.pelvis, offset: [0, 0.02, 0], scale: [1.12, 1.05, 1.12] };
    case 'spine':
      return { obj: rig.torso, offset: [0, 0.02, 0], scale: [1.2, 1.15, 1.2] };
    case 'chest':
      return { obj: rig.chestArmorSocket, offset: [0, 0, 0], scale: [1.16, 1.12, 1.16] };
    case 'neck':
      return { obj: rig.neck, offset: [0, 0.02, 0], scale: [1.25, 1.0, 1.25] };
    case 'head':
      return { obj: rig.head, offset: [0, 0.14, 0], scale: [1.22, 1.18, 1.22] };
    // ── omuz / kol ──
    case 'shoulderL':
      return { obj: rig.leftShoulder, offset: [0, 0, 0], scale: [1.35, 1.0, 1.35] };
    case 'shoulderR':
      return { obj: rig.rightShoulder, offset: [0, 0, 0], scale: [1.35, 1.0, 1.35] };
    case 'upperArmL':
      return { obj: rig.leftUpperArm, offset: [0, 0, 0], scale: [1.45, 1.0, 1.45] };
    case 'upperArmR':
      return { obj: rig.rightUpperArm, offset: [0, 0, 0], scale: [1.45, 1.0, 1.45] };
    case 'forearmL':
      return { obj: rig.leftForearm, offset: [0, 0, 0], scale: [1.32, 1.0, 1.32] };
    case 'forearmR':
      return { obj: rig.rightForearm, offset: [0, 0, 0], scale: [1.32, 1.0, 1.32] };
    case 'handL':
      return { obj: rig.leftHand, offset: [0, 0, 0], scale: [1.2, 1.0, 1.2] };
    case 'handR':
      return { obj: rig.rightHand, offset: [0, 0, 0], scale: [1.2, 1.0, 1.2] };
    // ── bacak ──
    case 'thighL':
      return { obj: rig.leftThigh, offset: [0, 0, 0], scale: [1.28, 1.02, 1.28] };
    case 'thighR':
      return { obj: rig.rightThigh, offset: [0, 0, 0], scale: [1.28, 1.02, 1.28] };
    case 'shinL':
      return { obj: rig.leftShin, offset: [0, 0, 0], scale: [1.22, 1.02, 1.22] };
    case 'shinR':
      return { obj: rig.rightShin, offset: [0, 0, 0], scale: [1.22, 1.02, 1.22] };
    case 'footL':
      return { obj: rig.leftFoot, offset: [0, 0, 0], scale: [1.18, 1.1, 1.05] };
    case 'footR':
      return { obj: rig.rightFoot, offset: [0, 0, 0], scale: [1.18, 1.1, 1.05] };
    default:
      return null;
  }
}

/* ─────────────────────────── materyal yardımcıları ─────────────────────────── */

/**
 * BannerForge materyalleri önbellekli/paylaşımlıdır. Rig'den ekipman sökülürken
 * (`disposeEquipment`) paylaşılan materyalin atılması diğer birimleri bozar;
 * bu yüzden takarken materyalleri klonluyoruz (ekipman seyrek yeniden kurulur).
 */
function cloneMaterialsDeep(root: THREE.Object3D): void {
  const seen = new Map<THREE.Material, THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(source)) {
      mesh.material = source.map((m) => cloneOnce(m, seen));
    } else if (source) {
      mesh.material = cloneOnce(source, seen);
    }
  });
}

function cloneOnce(m: THREE.Material, seen: Map<THREE.Material, THREE.Material>): THREE.Material {
  const hit = seen.get(m);
  if (hit) return hit;
  const clone = m.clone();
  seen.set(m, clone);
  return clone;
}

/* ─────────────────────────── silah / kalkan / miğfer ─────────────────────────── */

/**
 * Bir ekipman modelini "tutuş noktası orijinde, ana eksen +Y" uzayından
 * bizim elimizin uzayına (ana eksen +Z) taşır.
 */
function mountFromAuthor(
  item: ArmoryItemBuild,
  opts: { position?: [number, number, number]; rotateX?: number } = {},
): THREE.Group {
  const holder = new THREE.Group();
  holder.name = `Armory_${item.id}`;
  holder.userData.armoryItemId = item.id;

  const inner = new THREE.Group();
  inner.name = `${item.id}_model`;
  const grip = item.spec.attack.grip;
  // Kabza noktası orijine gelsin.
  inner.position.set(-grip[0], -grip[1], -grip[2]);
  inner.add(item.group);
  holder.add(inner);

  // BannerForge: kabza altta, namlu +Y. Bizim el uzayımız: ana eksen +Z.
  holder.rotation.x = opts.rotateX ?? Math.PI / 2;
  if (opts.position) holder.position.set(...opts.position);

  cloneMaterialsDeep(holder);
  return holder;
}

/** Silah tipine göre tutuş düzeltmesi (bizim eski modellerin kabza noktasına hizalama). */
const WEAPON_MOUNT_OFFSET: Record<string, [number, number, number]> = {
  // Mızrak/kargı modelleri BannerForge'da %40 noktadan kavranır; bizim eski
  // mızrağımız %20 noktadan kavranıyordu. Ucu aynı yere getirmek için ileri al.
  SPEAR: [0, -0.06, 0.45],
};

/** Sağ ele takılacak silah modeli. `UNARMED` için null döner. */
export function createArmoryWeapon(weapon: WeaponType, ctx: ArmoryContext = {}): THREE.Group | null {
  const id = resolveWeaponId(weapon, ctx);
  if (!id) return null;
  const item = buildArmoryItem(id, ctx);
  // Bizim eski silah tutucusuyla aynı ofset → animasyonun hedeflediği konum.
  const offset = WEAPON_MOUNT_OFFSET[weapon] ?? [0, -0.06, 0];
  return mountFromAuthor(item, { position: offset });
}

/** Sol ele takılacak kalkan modeli (yüzey normali +Z, üst +Y). */
import { SHIELD_REST_POSITION, SHIELD_SCALE } from './equipmentPose.ts';

export function createArmoryShield(shield: ShieldType, ctx: ArmoryContext = {}): THREE.Group | null {
  const id = SHIELD_MODEL_MAP[shield];
  if (!id) return null;
  const item = buildArmoryItem(id, ctx);
  /*
   * ESKİ HATA: burada `rotation.z = π/2` vardı → uçurtma (kiteShield) ve
   * pavise kalkanları yan yatmış, uzun ekseni yere paralel görünüyordu.
   * BannerForge modelleri zaten "yüz +Z, üst +Y" yazıldığı için dönüş
   * gereksizdi. Ölçek ve konum legacy modelle aynı sabitlerden gelir.
   */
  const holder = mountFromAuthor(item, { rotateX: 0 });
  if (shield !== 'NONE') holder.scale.setScalar(SHIELD_SCALE[shield]);
  holder.position.set(...SHIELD_REST_POSITION);
  return holder;
}

/**
 * Baş yuvaları için miğfer modeli. Bizim `helmetSocket` kafatasının MERKEZİNDE
 * durur; BannerForge miğferleri kafa eklemine göre yazıldığı için +0.14 m
 * yukarı kaydırılıp kafa yarıçapı oranında büyütülür.
 */
export function createArmoryHelmet(helmet: HelmetType, ctx: ArmoryContext = {}): THREE.Group | null {
  const id = HELMET_MODEL_MAP[helmet];
  if (!id) return null;
  const item = buildArmoryItem(id, ctx);
  const holder = mountFromAuthor(item, { rotateX: 0 });

  /* ── kalibrasyon ──
     BannerForge miğferleri kendi kafa ölçüsüne (r ≈ 0.103) göre yazılmış;
     bizim kafatasımız r = 0.125. Ayrıca modelin "oturma yüksekliği" miğfer
     tipine göre değişiyor: kapalı miğfer kafayı TAM sararken kettle hat'ın
     siperliği alın hizasında durmalı. Ölçek 1.16 iken göz hizasına inip yüzü
     kesiyordu. */
  const fit = HELMET_FIT[helmet as Exclude<HelmetType, 'NONE'>];
  holder.scale.setScalar(fit.scale);
  holder.position.set(0, fit.y, fit.z ?? 0);
  return holder;
}

/** Miğfer tipine göre ölçek / dikey ofset (kafa eklemi yerel uzayı). */
const HELMET_FIT: Record<Exclude<HelmetType, 'NONE'>, { scale: number; y: number; z?: number }> = {
  // Siperlik alın üstünde kalmalı (göz hizasına inmemeli) → daha küçük + yukarı.
  // Siperlik alın hizasında (gözlerin üstünde, tepenin altında) durmalı.
  KETTLE_HAT: { scale: 0.7, y: 0.082 },
  SPANGENHELM: { scale: 0.92, y: 0.05 },
  IMPERIAL_VISOR: { scale: 0.98, y: 0.048 },
};

/** Oklar: uçuş halindeki mermiler için (uç +Z'ye bakar). */
export function createArmoryArrow(ctx: ArmoryContext = {}): THREE.Group | null {
  const item = buildArmoryItem('arrow', ctx);
  const holder = mountFromAuthor(item, { rotateX: Math.PI / 2 });
  return holder;
}

/** Sırta asılan sadak (okluk). */
export function createArmoryQuiver(ctx: ArmoryContext = {}): THREE.Object3D | null {
  const item = buildArmoryItem('arrow', { ...ctx, lod: 'crowd' });
  const group = new THREE.Group();
  group.name = 'Armory_Quiver';
  // 3 oku saplama yerine dizerek basit bir sadak silüeti kur.
  for (let i = 0; i < 3; i++) {
    const a = mountFromAuthor(item, { rotateX: Math.PI });
    a.position.set((i - 1) * 0.035, -0.1, (i % 2) * 0.012);
    group.add(a);
  }
  group.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.05, 0.42, 6),
    new THREE.MeshStandardMaterial({ color: 0x4e3117, roughness: 0.9, flatShading: true }),
  ));
  return group;
}

/* ─────────────────────────── zırh seti ─────────────────────────── */

const ARMOR_REGISTRY = new WeakMap<CharacterRig, THREE.Object3D[]>();

/**
 * Zırhı doğrudan eklemlere takar (gövde, kollar, bacaklar, ayaklar).
 * Parçalar bizim iskeletimizin eklem uzayında konumlandığı için animasyonla
 * birlikte sorunsuz hareket eder.
 */
export function applyArmoryArmor(
  rig: CharacterRig,
  tier: ArmorTier,
  ctx: ArmoryContext = {},
): ArmorSet | null {
  clearArmoryArmor(rig);
  const bfTier = ARMOR_TIER_MAP[tier];
  if (!bfTier) return null;

  const faction = resolveArmoryFaction(ctx);
  const lod: ArmoryLod = ctx.lod ?? DEFAULT_LOD;
  const set = buildArmorSet({ tier: bfTier, lod, faction, helmStyle: 'none', surcoat: tier !== 'LEATHER' });

  const mats = new MaterialLibrary(createArmorPalette(faction));
  mats.setFaction(faction);

  const attached: THREE.Object3D[] = [];
  /*
   * Faz 9b: 'head', 'torso', 'neck' ve 'shoulders' BannerForge'dan ALINMIYOR.
   *   · head  → kendi miğfer modelimiz kullanılıyor (çifte miğfer olmasın),
   *   · torso → BannerForge gövde zırhı başka iskelet için yazılmış: bizim
   *     göğsümüzü kapatmıyor (belin altına kayıyor), göğüs levhası 0.57 m
   *     genişliğinde düz bir levha olarak 10 cm önde duruyor ve surcoat
   *     panelleri karton tabela gibi kalıyor,
   *   · neck / shoulders → aynı ölçek sorunu (kolların içine 33 cm giriyor),
   *   · armsUpper / armsLower / hands → bizim kolumuzdan ~1 cm küçük; 6 kenarlı
   *     kol silindirinin köşeleri zırhın içinden geçiyor (kırmızı çizikler).
   * Gövde ve omuz zırhı artık `characterRig.buildArmor` içinde gövdemize
   * oturan lathe kabuğu olarak üretiliyor; BannerForge kol/bacak/el/ayak
   * parçaları korunuyor (onlar doğru oturuyor).
   */
  const SKIP_ZONES = new Set([
    'head',
    'torso',
    'neck',
    'shoulders',
    'armsUpper',
    'armsLower',
    'hands',
  ]);
  for (const zone of Object.keys(set.zones) as (keyof typeof set.zones)[]) {
    if (SKIP_ZONES.has(zone)) continue;
    for (const piece of set.zones[zone] ?? []) {
      const node = attachArmorPiece(rig, piece, mats);
      if (node) attached.push(node);
    }
  }
  ARMOR_REGISTRY.set(rig, attached);
  return set;
}

function attachArmorPiece(
  rig: CharacterRig,
  piece: ArmorPiece,
  mats: MaterialLibrary,
): THREE.Object3D | null {
  const fit = jointFit(rig, piece.joint);
  if (!fit) return null;

  const def = mats.resolve(piece.material);
  const material = buildArmorMaterial(def ?? (piece.material as MaterialDef), mats);
  const mesh = new THREE.Mesh(piece.geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = piece.name ?? `armor_${piece.joint}`;
  if (piece.position) {
    mesh.position.set(piece.position[0], piece.position[1], piece.position[2]);
  }
  if (piece.rotation) {
    mesh.rotation.set(piece.rotation[0], piece.rotation[1], piece.rotation[2]);
  }
  if (piece.scale !== undefined) {
    if (typeof piece.scale === 'number') mesh.scale.setScalar(piece.scale);
    else mesh.scale.set(piece.scale[0], piece.scale[1], piece.scale[2]);
  }

  const wrapper = new THREE.Group();
  wrapper.name = `armory_${piece.joint}`;
  wrapper.position.set(fit.offset[0], fit.offset[1], fit.offset[2]);
  wrapper.scale.set(fit.scale[0], fit.scale[1], fit.scale[2]);
  wrapper.userData.armoryArmor = true;
  wrapper.add(mesh);
  fit.obj.add(wrapper);
  return wrapper;
}

function buildArmorMaterial(def: MaterialDef, mats: MaterialLibrary): THREE.Material {
  if (def && def.key && mats.has(def.key)) return mats.material(def.key).clone();
  return new THREE.MeshStandardMaterial({
    color: def?.color ?? 0x8e97a3,
    metalness: def?.metalness ?? 0.15,
    roughness: def?.roughness ?? 0.85,
    flatShading: def?.flatShading ?? true,
    side: def?.side ?? THREE.FrontSide,
  });
}

/** Zırhı söker (geometri + materyal temizliği ile). */
export function clearArmoryArmor(rig: CharacterRig): void {
  const list = ARMOR_REGISTRY.get(rig);
  if (!list) return;
  for (const node of list) {
    node.parent?.remove(node);
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        (Array.isArray(mat) ? mat : [mat]).forEach((m) => m?.dispose());
      }
    });
  }
  list.length = 0;
  ARMOR_REGISTRY.delete(rig);
}

/* ─────────────────────────── at ─────────────────────────── */

export interface ArmoryHorseOptions extends ArmoryContext {
  breed?: 'war' | 'steppe' | 'destrier';
  coat?: 'bay' | 'chestnut' | 'grey' | 'black' | 'palomino' | 'dun';
  barding?: boolean;
}

/**
 * BannerForge savaş atı (kendi iskeletiyle). Arena'nın `WarHorseRig`'i ayrı bir
 * sistemdir; bu üretici şimdilik vitrin / kalabalık sahneleri içindir.
 */
export function createArmoryHorse(opts: ArmoryHorseOptions = {}): THREE.Group | null {
  // Döngüsel importu önlemek için modül tembel yüklenir.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return createHorseGroup(opts);
  } catch (error) {
    console.warn('[armoryBridge] At modeli üretilemedi:', error);
    return null;
  }
}

/* Horse.ts statik importu (döngü yok: Horse → Character → Armory → Core) */
import { Horse } from '../armory/Horse.ts';

function createHorseGroup(opts: ArmoryHorseOptions): THREE.Group {
  const faction = resolveArmoryFaction(opts);
  const horse = new Horse({
    faction,
    breed: opts.breed ?? 'war',
    coat: opts.coat ?? 'bay',
    lod: opts.lod ?? DEFAULT_LOD,
    barding: opts.barding ?? true,
  });
  const group = horse.group;
  group.name = 'Armory_WarHorse';
  cloneMaterialsDeep(group);
  return group;
}

/* ─────────────────────────── teşhis / vitrin yardımcıları ─────────────────────────── */

/** Bir ekipmanın üçgen sayısı (HUD/vitrin için). */
export function armoryItemTriangles(id: ArmoryItemId, ctx: ArmoryContext = {}): number {
  return buildArmoryItem(id, ctx).triangles;
}

/** Rig'e takılan tüm BannerForge nesnelerinin toplam üçgen sayısı (teşhis). */
export function countArmoryTriangles(rig: CharacterRig): number {
  let total = 0;
  const count = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const g = mesh.geometry;
      const index = g.getIndex();
      total += index ? index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
    });
  };
  count(rig.rightWeaponSocket);
  count(rig.leftShieldSocket);
  count(rig.helmetSocket);
  count(rig.backSocket);
  for (const node of ARMOR_REGISTRY.get(rig) ?? []) count(node);
  return Math.round(total);
}
