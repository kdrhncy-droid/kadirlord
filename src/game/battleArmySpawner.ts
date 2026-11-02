import * as THREE from 'three';
import {
  type ArmorTier,
  type HelmetType,
  type ShieldType,
  type WarHorseRig,
  type WeaponType,
  createCharacterRig,
  createWarHorseRig,
  applyEquipmentToRig,
  applyRiderMountedPosture,
} from './characterRig';
import { CharacterAnimator } from './characterAnimator';
import {
  normalizeArsenalFactionId,
  getTroopLoadoutForRole,
  getLordLoadout,
  type FactionTroopRankLoadout,
} from './factionTroopLoadouts';
import { getTroopDefinition } from './bannerlordFoundation';
import { applyMorphDNAToRig, getLordDNA } from './characterMorph';
import {
  type CampaignState,
  type LordAgent,
  type Settlement,
  type TroopRoster,
  FACTION_INFO,
  getTotalTroops,
} from './rules';
import {
  type SkirmishFighter,
  ALL_DIRS,
  getFieldElevation,
  createLordBannerBadge,
} from './arenaTypes';

export interface CampaignArmySpawnParams {
  campaign?: CampaignState;
  targetLord?: LordAgent | null;
  targetSettlement?: Settlement | null;
  isSiege: boolean;
  baseSpawnZ: number;
}

export interface ArmySpawnResult {
  units: SkirmishFighter[];
  meshes: THREE.Object3D[];
}

export function createCampaignArmyFighters(params: CampaignArmySpawnParams): ArmySpawnResult {
  const { campaign, targetLord, targetSettlement, isSiege, baseSpawnZ } = params;
  const units: SkirmishFighter[] = [];
  const meshes: THREE.Object3D[] = [];

  const pRoster: TroopRoster = campaign?.roster ?? { infantry: 14, archer: 8, cavalry: 4, horseArcher: 0 };
  const eLord = targetLord;
  const eSettlement = targetSettlement;
  const eRoster: TroopRoster = eLord?.roster ?? {
    infantry: Math.round((eSettlement?.garrison ?? 24) * 0.5),
    archer: Math.round((eSettlement?.garrison ?? 24) * 0.35),
    cavalry: Math.round((eSettlement?.garrison ?? 24) * 0.15),
    horseArcher: 0,
  };

  const playerCulture = (campaign?.heroes?.find((h) => h.id === 'player')?.culture ?? 'vlandia') as keyof typeof FACTION_INFO;
  const playerFactionColor = FACTION_INFO[playerCulture]?.color ?? '#991b1b';
  const enemyFaction = (eLord?.faction ?? eSettlement?.faction ?? 'empire') as keyof typeof FACTION_INFO;
  const enemyFactionColor = FACTION_INFO[enemyFaction]?.color ?? '#581c87';

  const allyArsenalFaction = normalizeArsenalFactionId(playerCulture);
  const allyInfLoadout = getTroopLoadoutForRole(allyArsenalFaction, 'INFANTRY', 3);
  const allyArcLoadout = getTroopLoadoutForRole(allyArsenalFaction, 'ARCHERS', 3);
  const allyCavLoadout = getTroopLoadoutForRole(allyArsenalFaction, 'CAVALRY', 5);

  const enemyArsenalFaction = normalizeArsenalFactionId(
    eLord?.faction ?? eSettlement?.faction ?? 'empire',
  );
  const enemyInfLoadout = getTroopLoadoutForRole(enemyArsenalFaction, 'INFANTRY', 3);
  const enemyArcLoadout = getTroopLoadoutForRole(enemyArsenalFaction, 'ARCHERS', 3);
  const enemyCavLoadout = getTroopLoadoutForRole(enemyArsenalFaction, 'CAVALRY', 5);

  const allyInfCount = Math.min(16, Math.max(3, pRoster.infantry ?? 10));
  const allyArcCount = Math.min(10, Math.max(2, pRoster.archer ?? 6));
  const allyCavCount = Math.min(6, Math.max(1, pRoster.cavalry ?? 3));

  const enemyInfCount = Math.min(16, Math.max(3, eRoster.infantry ?? 10));
  const enemyArcCount = Math.min(10, Math.max(2, eRoster.archer ?? 6));
  const enemyCavCount = Math.min(6, Math.max(1, eRoster.cavalry ?? 3));

  // 1. ALLIED FORCES
  interface DeployedTroopProfile {
    name: string;
    tier: number;
    hp: number;
    factionId: string;
    loadout: FactionTroopRankLoadout;
    helmetType?: HelmetType;
    armorTier?: ArmorTier;
  }

  const alliedInfantryProfiles: DeployedTroopProfile[] = [];
  const alliedArcherProfiles: DeployedTroopProfile[] = [];
  const alliedCavalryProfiles: DeployedTroopProfile[] = [];

  if (campaign?.troopStacks && campaign.troopStacks.length > 0) {
    for (const stack of campaign.troopStacks) {
      const healthy = Math.max(0, stack.count - (stack.wounded ?? 0));
      if (healthy <= 0) continue;
      const def = getTroopDefinition(stack.troopId);
      const tier = (def?.tier ?? 3) as 1 | 2 | 3 | 4 | 5 | 6;
      const culture = def?.culture ?? playerCulture;
      const isMounted = Boolean(def?.isMounted || def?.battleClass === 'cavalry');
      const isArcher = def?.battleClass === 'archer';

      const division = isMounted ? 'CAVALRY' : isArcher ? 'ARCHERS' : 'INFANTRY';
      const arsenalFaction = normalizeArsenalFactionId(culture);
      const loadout = getTroopLoadoutForRole(arsenalFaction, division, tier);
      const hp = def?.maxHp ?? (tier <= 1 ? 80 : tier === 2 ? 95 : tier === 3 ? 110 : tier === 4 ? 125 : tier === 5 ? 140 : 160);
      const name = def?.name ?? loadout.unitNameTr;

      const profile: DeployedTroopProfile = {
        name,
        tier,
        hp,
        factionId: arsenalFaction,
        loadout,
        helmetType: tier >= 5 ? 'IMPERIAL_VISOR' : tier >= 3 ? 'SPANGENHELM' : 'KETTLE_HAT',
        armorTier: tier >= 5 ? 'PLATE' : tier >= 3 ? 'CHAINMAIL' : 'LEATHER',
      };

      for (let k = 0; k < healthy; k++) {
        if (division === 'CAVALRY') alliedCavalryProfiles.push(profile);
        else if (division === 'ARCHERS') alliedArcherProfiles.push(profile);
        else alliedInfantryProfiles.push(profile);
      }
    }
  }

  const defaultInfProfile: DeployedTroopProfile = {
    name: allyInfLoadout.unitNameTr,
    tier: allyInfLoadout.tierNumber,
    hp: 110,
    factionId: allyArsenalFaction,
    loadout: allyInfLoadout,
  };
  const defaultArcProfile: DeployedTroopProfile = {
    name: allyArcLoadout.unitNameTr,
    tier: allyArcLoadout.tierNumber,
    hp: 85,
    factionId: allyArsenalFaction,
    loadout: allyArcLoadout,
  };
  const defaultCavProfile: DeployedTroopProfile = {
    name: allyCavLoadout.unitNameTr,
    tier: allyCavLoadout.tierNumber,
    hp: 150,
    factionId: allyArsenalFaction,
    loadout: allyCavLoadout,
  };

  // 1.1 Allied Infantry
  for (let i = 0; i < allyInfCount; i++) {
    const profile = alliedInfantryProfiles[i % (alliedInfantryProfiles.length || 1)] ?? defaultInfProfile;
    const col = (i % 7) - 3.0;
    const row = Math.floor(i / 7);
    const x = col * 2.0;
    const z = isSiege ? 11.0 + row * 2.0 : baseSpawnZ + row * 2.2;
    const y = isSiege ? 0 : getFieldElevation(x, z);

    const rig = createCharacterRig({
      skinTone: '#d9a17c',
      hairColor: '#2b1d12',
      factionColor: playerFactionColor,
      factionId: profile.factionId,
      weaponType: 'ONE_HANDED_SWORD',
      shieldType: profile.loadout.shieldId ? (i % 2 === 0 ? 'ROUND_SHIELD' : 'KITE_SHIELD') : 'NONE',
      helmetType: profile.helmetType ?? (i % 3 === 0 ? 'SPANGENHELM' : 'KETTLE_HAT'),
      armorTier: profile.armorTier ?? (i % 2 === 0 ? 'CHAINMAIL' : 'LEATHER'),
      factionArmorId: profile.loadout.armorId,
      factionWeaponId: profile.loadout.primaryWeaponId,
      factionShieldId: profile.loadout.shieldId || undefined,
      factionQuality: profile.loadout.defaultQuality,
    });
    applyEquipmentToRig(rig, rig.currentOptions);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = Math.PI;
    meshes.push(rig.root);

    const animator = new CharacterAnimator(rig);
    units.push({
      id: `ally-inf-${i}`,
      name: `${profile.name} #${i + 1}`,
      team: 'ALLY',
      division: 'INFANTRY',
      tier: profile.tier,
      rig,
      animator,
      x,
      z,
      yaw: Math.PI,
      hp: profile.hp,
      maxHp: profile.hp,
      alive: true,
      hasShield: Boolean(profile.loadout.shieldId),
      weaponType: 'ONE_HANDED_SWORD',
      attackDir: ALL_DIRS[i % 4],
      blockDir: 'up',
      aiTimer: 0.2 + (i % 5) * 0.15,
      strafeSign: i % 2 === 0 ? 1 : -1,
      respawnTimer: 0,
      tacticalStance: 'ATTACK',
      tacticalTimer: 0,
    });
  }

  // 1.2 Allied Archers
  for (let i = 0; i < allyArcCount; i++) {
    const profile = alliedArcherProfiles[i % (alliedArcherProfiles.length || 1)] ?? defaultArcProfile;
    const col = (i % 6) - 2.5;
    const row = Math.floor(i / 6);
    const x = col * 2.2;
    const z = isSiege ? 16.5 + row * 2.0 : baseSpawnZ + 6.0 + row * 2.0;
    const y = isSiege ? 0 : getFieldElevation(x, z);

    const rig = createCharacterRig({
      skinTone: '#c68a62',
      hairColor: '#1c1917',
      factionColor: playerFactionColor,
      factionId: profile.factionId,
      weaponType: 'BOW',
      shieldType: 'NONE',
      helmetType: profile.helmetType ?? 'KETTLE_HAT',
      armorTier: profile.armorTier ?? 'LEATHER',
      factionArmorId: profile.loadout.armorId,
      factionWeaponId: profile.loadout.primaryWeaponId,
      factionQuality: profile.loadout.defaultQuality,
    });
    applyEquipmentToRig(rig, rig.currentOptions);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = Math.PI;
    meshes.push(rig.root);

    const animator = new CharacterAnimator(rig);
    units.push({
      id: `ally-arc-${i}`,
      name: `${profile.name} #${i + 1}`,
      team: 'ALLY',
      division: 'ARCHERS',
      tier: profile.tier,
      rig,
      animator,
      x,
      z,
      yaw: Math.PI,
      hp: profile.hp,
      maxHp: profile.hp,
      alive: true,
      hasShield: false,
      weaponType: 'BOW',
      attackDir: 'up',
      blockDir: 'up',
      aiTimer: 0.1 + (i % 4) * 0.2,
      strafeSign: 1,
      respawnTimer: 0,
    });
  }

  // 1.3 Allied Cavalry
  for (let i = 0; i < allyCavCount; i++) {
    const profile = alliedCavalryProfiles[i % (alliedCavalryProfiles.length || 1)] ?? defaultCavProfile;
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (12.0 + Math.floor(i / 2) * 3.0);
    const z = isSiege ? 14.0 + Math.floor(i / 2) * 3.5 : baseSpawnZ + 4.0 + Math.floor(i / 2) * 3.5;
    const y = isSiege ? 0 : getFieldElevation(x, z);

    const rig = createCharacterRig({
      skinTone: '#e0a980',
      hairColor: '#3d2616',
      factionColor: playerFactionColor,
      factionId: profile.factionId,
      weaponType: 'SPEAR',
      shieldType: 'KITE_SHIELD',
      helmetType: profile.helmetType ?? 'IMPERIAL_VISOR',
      armorTier: profile.armorTier ?? 'PLATE',
      factionArmorId: profile.loadout.armorId,
      factionWeaponId: profile.loadout.primaryWeaponId,
      factionShieldId: profile.loadout.shieldId || undefined,
      factionQuality: profile.loadout.defaultQuality,
    });
    applyEquipmentToRig(rig, rig.currentOptions);
    applyRiderMountedPosture(rig, 0, 0);

    const horse = createWarHorseRig({
      coatColor: i % 2 === 0 ? '#3b281a' : '#573d26',
      factionColor: playerFactionColor,
      armoredBarding: profile.tier >= 4,
    });
    horse.root.position.set(x, y, z);
    horse.root.rotation.y = Math.PI;
    horse.riderMount.add(rig.root);
    rig.root.position.set(0, 0, 0);
    meshes.push(horse.root);

    const animator = new CharacterAnimator(rig);
    units.push({
      id: `ally-cav-${i}`,
      name: `${profile.name} #${i + 1}`,
      team: 'ALLY',
      division: 'CAVALRY',
      tier: profile.tier,
      cavalryChargeState: 'CHARGE',
      cavalryTimer: 0,
      rig,
      animator,
      horse,
      x,
      z,
      yaw: Math.PI,
      hp: profile.hp,
      maxHp: profile.hp,
      alive: true,
      hasShield: true,
      weaponType: 'SPEAR',
      attackDir: 'down',
      blockDir: 'up',
      aiTimer: 0.3 + i * 0.2,
      strafeSign: 1,
      respawnTimer: 0,
    });
  }

  // 2. ENEMY FORCES
  // 2.0 Enemy Lord
  if (eLord) {
    const isLordRuler = Boolean(eLord.title && /(Kral|Sultan|İmparator|Büyük|Hakan|Kağan|Kraliçe)/i.test(eLord.title));
    const lordLoadout = getLordLoadout(enemyArsenalFaction, isLordRuler);
    const lordRig = createCharacterRig({
      skinTone: '#d49b73',
      hairColor: '#1f2937',
      factionColor: enemyFactionColor,
      factionId: enemyArsenalFaction,
      weaponType: 'ONE_HANDED_SWORD',
      shieldType: 'KITE_SHIELD',
      helmetType: 'IMPERIAL_VISOR',
      armorTier: 'PLATE',
      factionArmorId: lordLoadout.armorId,
      factionWeaponId: lordLoadout.primaryWeaponId,
      factionShieldId: lordLoadout.shieldId || undefined,
      factionHorseId: lordLoadout.horseId || undefined,
      factionQuality: 'MASTERWORK',
    });
    applyEquipmentToRig(lordRig, lordRig.currentOptions);
    applyRiderMountedPosture(lordRig, 0, 0);

    const lordDNA = getLordDNA(eLord.id);
    if (lordDNA) {
      applyMorphDNAToRig(lordRig, lordDNA);
    }

    const lordHorse = createWarHorseRig({
      coatColor: '#1a1a1a',
      factionColor: enemyFactionColor,
      armoredBarding: true,
    });
    const lx = 0;
    const lz = isSiege ? -18.0 : -(baseSpawnZ + 10.0);
    const ly = isSiege ? 0 : getFieldElevation(lx, lz);
    lordHorse.root.position.set(lx, ly, lz);
    lordHorse.root.rotation.y = 0;
    lordHorse.riderMount.add(lordRig.root);
    lordRig.root.position.set(0, 0, 0);
    meshes.push(lordHorse.root);

    const lordBadge = createLordBannerBadge(
      `${eLord.title ? `${eLord.title} ` : 'Lord '}${eLord.name}`,
      enemyFactionColor,
    );
    lordHorse.root.add(lordBadge);

    const lordAnimator = new CharacterAnimator(lordRig);
    units.push({
      id: `enemy-lord-${eLord.id}`,
      name: `${eLord.title ? `${eLord.title} ` : 'Lord '}${eLord.name}`,
      team: 'ENEMY',
      division: 'CAVALRY',
      tier: 6,
      cavalryChargeState: 'CHARGE',
      cavalryTimer: 0,
      tacticalStance: 'ATTACK',
      tacticalTimer: 0,
      rig: lordRig,
      animator: lordAnimator,
      horse: lordHorse,
      x: lx,
      z: lz,
      yaw: 0,
      hp: 200,
      maxHp: 200,
      alive: true,
      hasShield: Boolean(lordLoadout.shieldId),
      weaponType: 'ONE_HANDED_SWORD',
      attackDir: 'right',
      blockDir: 'up',
      aiTimer: 0.1,
      strafeSign: 1,
      respawnTimer: 0,
      isLord: true,
      badge: lordBadge,
    });
  }

  // 2.1 Enemy Infantry
  for (let i = 0; i < enemyInfCount; i++) {
    const col = (i % 7) - 3.0;
    const row = Math.floor(i / 7);
    const x = col * 2.0;
    const z = isSiege ? -22.0 - row * 2.0 : -baseSpawnZ - row * 2.2;
    const y = isSiege ? 0 : getFieldElevation(x, z);

    const rig = createCharacterRig({
      skinTone: '#c68a62',
      hairColor: '#1c1917',
      factionColor: enemyFactionColor,
      factionId: enemyArsenalFaction,
      weaponType: i % 3 === 0 ? 'SPEAR' : 'ONE_HANDED_SWORD',
      shieldType: enemyInfLoadout.shieldId ? 'ROUND_SHIELD' : 'NONE',
      helmetType: i % 2 === 0 ? 'SPANGENHELM' : 'KETTLE_HAT',
      armorTier: i % 2 === 0 ? 'CHAINMAIL' : 'LEATHER',
      factionArmorId: enemyInfLoadout.armorId,
      factionWeaponId: enemyInfLoadout.primaryWeaponId,
      factionShieldId: enemyInfLoadout.shieldId || undefined,
      factionQuality: enemyInfLoadout.defaultQuality,
    });
    applyEquipmentToRig(rig, rig.currentOptions);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = 0;
    meshes.push(rig.root);

    const animator = new CharacterAnimator(rig);
    units.push({
      id: `enemy-inf-${i}`,
      name: `${enemyInfLoadout.unitNameTr} #${i + 1}`,
      team: 'ENEMY',
      division: 'INFANTRY',
      tier: enemyInfLoadout.tierNumber,
      rig,
      animator,
      x,
      z,
      yaw: 0,
      hp: 105,
      maxHp: 105,
      alive: true,
      hasShield: Boolean(enemyInfLoadout.shieldId),
      weaponType: i % 3 === 0 ? 'SPEAR' : 'ONE_HANDED_SWORD',
      attackDir: ALL_DIRS[i % 4],
      blockDir: 'up',
      aiTimer: 0.2 + (i % 5) * 0.15,
      strafeSign: i % 2 === 0 ? 1 : -1,
      respawnTimer: 0,
      tacticalStance: 'ATTACK',
      tacticalTimer: 0,
    });
  }

  // 2.2 Enemy Archers
  for (let i = 0; i < enemyArcCount; i++) {
    const col = (i % 6) - 2.5;
    const row = Math.floor(i / 6);
    const x = col * 2.2;
    const z = isSiege ? -27.0 - row * 2.0 : -baseSpawnZ - 6.0 - row * 2.0;
    const y = isSiege ? 0 : getFieldElevation(x, z);

    const rig = createCharacterRig({
      skinTone: '#a87550',
      hairColor: '#0a0a0a',
      factionColor: enemyFactionColor,
      factionId: enemyArsenalFaction,
      weaponType: 'BOW',
      shieldType: 'NONE',
      helmetType: 'KETTLE_HAT',
      armorTier: 'LEATHER',
      factionArmorId: enemyArcLoadout.armorId,
      factionWeaponId: enemyArcLoadout.primaryWeaponId,
      factionQuality: enemyArcLoadout.defaultQuality,
    });
    applyEquipmentToRig(rig, rig.currentOptions);
    rig.root.position.set(x, y, z);
    rig.root.rotation.y = 0;
    meshes.push(rig.root);

    const animator = new CharacterAnimator(rig);
    units.push({
      id: `enemy-arc-${i}`,
      name: `${enemyArcLoadout.unitNameTr} #${i + 1}`,
      team: 'ENEMY',
      division: 'ARCHERS',
      tier: enemyArcLoadout.tierNumber,
      rig,
      animator,
      x,
      z,
      yaw: 0,
      hp: 80,
      maxHp: 80,
      alive: true,
      hasShield: false,
      weaponType: 'BOW',
      attackDir: 'up',
      blockDir: 'up',
      aiTimer: 0.15 + (i % 4) * 0.2,
      strafeSign: -1,
      respawnTimer: 0,
    });
  }

  // 2.3 Enemy Cavalry
  for (let i = 0; i < enemyCavCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * (12.0 + Math.floor(i / 2) * 3.0);
    const z = isSiege ? -24.0 - Math.floor(i / 2) * 3.5 : -baseSpawnZ - 4.0 - Math.floor(i / 2) * 3.5;
    const y = isSiege ? 0 : getFieldElevation(x, z);

    const rig = createCharacterRig({
      skinTone: '#c68a62',
      hairColor: '#1c1917',
      factionColor: enemyFactionColor,
      factionId: enemyArsenalFaction,
      weaponType: 'SPEAR',
      shieldType: 'ROUND_SHIELD',
      helmetType: 'SPANGENHELM',
      armorTier: 'CHAINMAIL',
      factionArmorId: enemyCavLoadout.armorId,
      factionWeaponId: enemyCavLoadout.primaryWeaponId,
      factionShieldId: enemyCavLoadout.shieldId || undefined,
      factionQuality: enemyCavLoadout.defaultQuality,
    });
    applyEquipmentToRig(rig, rig.currentOptions);
    applyRiderMountedPosture(rig, 0, 0);

    const horse = createWarHorseRig({
      coatColor: i % 2 === 0 ? '#1f1610' : '#4a3321',
      factionColor: enemyFactionColor,
      armoredBarding: true,
    });
    horse.root.position.set(x, y, z);
    horse.root.rotation.y = 0;
    horse.riderMount.add(rig.root);
    rig.root.position.set(0, 0, 0);
    meshes.push(horse.root);

    const animator = new CharacterAnimator(rig);
    units.push({
      id: `enemy-cav-${i}`,
      name: `${enemyCavLoadout.unitNameTr} #${i + 1}`,
      team: 'ENEMY',
      division: 'CAVALRY',
      tier: enemyCavLoadout.tierNumber,
      cavalryChargeState: 'CHARGE',
      cavalryTimer: 0,
      rig,
      animator,
      horse,
      x,
      z,
      yaw: 0,
      hp: 145,
      maxHp: 145,
      alive: true,
      hasShield: true,
      weaponType: 'SPEAR',
      attackDir: 'down',
      blockDir: 'up',
      aiTimer: 0.3 + i * 0.2,
      strafeSign: -1,
      respawnTimer: 0,
    });
  }

  return { units, meshes };
}

export function createSkirmishInitialAllies(): ArmySpawnResult {
  const units: SkirmishFighter[] = [];
  const meshes: THREE.Object3D[] = [];

  const allyDefs: Array<{
    id: string;
    name: string;
    division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY';
    weapon: WeaponType;
    shield: ShieldType;
    helmet: HelmetType;
    armor: ArmorTier;
    mounted?: boolean;
    x: number;
    z: number;
  }> = [
    {
      id: 'ally-inf-1',
      name: 'Kalradya Kalkanlı Piyade',
      division: 'INFANTRY',
      weapon: 'ONE_HANDED_SWORD',
      shield: 'ROUND_SHIELD',
      helmet: 'SPANGENHELM',
      armor: 'CHAINMAIL',
      x: -2.4,
      z: 3.5,
    },
    {
      id: 'ally-inf-2',
      name: 'İmparatorluk Ağır Piyadesi',
      division: 'INFANTRY',
      weapon: 'ONE_HANDED_SWORD',
      shield: 'KITE_SHIELD',
      helmet: 'IMPERIAL_VISOR',
      armor: 'PLATE',
      x: 2.4,
      z: 3.5,
    },
    {
      id: 'ally-arc-1',
      name: 'Sancak Keskin Nişancısı',
      division: 'ARCHERS',
      weapon: 'BOW',
      shield: 'NONE',
      helmet: 'KETTLE_HAT',
      armor: 'LEATHER',
      x: -1.5,
      z: 6.2,
    },
    {
      id: 'ally-cav-1',
      name: 'Zırhlı Katafrakt Süvarisi',
      division: 'CAVALRY',
      weapon: 'SPEAR',
      shield: 'KITE_SHIELD',
      helmet: 'IMPERIAL_VISOR',
      armor: 'PLATE',
      mounted: true,
      x: 3.8,
      z: 5.2,
    },
  ];

  for (const def of allyDefs) {
    const rig = createCharacterRig({
      skinTone: '#d9a17c',
      hairColor: '#2b1d12',
      factionColor: '#991b1b',
      weaponType: def.weapon,
      shieldType: def.shield,
      helmetType: def.helmet,
      armorTier: def.armor,
    });
    const animator = new CharacterAnimator(rig);
    let horse: WarHorseRig | undefined;
    if (def.mounted) {
      horse = createWarHorseRig({
        coatColor: '#3b281a',
        factionColor: '#991b1b',
        armoredBarding: true,
      });
      horse.root.position.set(def.x, 0, def.z);
      horse.root.rotation.y = Math.PI;
      horse.riderMount.add(rig.root);
      rig.root.position.set(0, 0, 0);
      meshes.push(horse.root);
    } else {
      rig.root.position.set(def.x, 0, def.z);
      rig.root.rotation.y = Math.PI;
      meshes.push(rig.root);
    }

    units.push({
      id: def.id,
      name: def.name,
      team: 'ALLY',
      division: def.division,
      tier: def.mounted ? 5 : 3,
      cavalryChargeState: def.mounted ? 'CHARGE' : undefined,
      cavalryTimer: 0,
      tacticalStance: 'ATTACK',
      tacticalTimer: 0,
      rig,
      animator,
      horse,
      x: def.x,
      z: def.z,
      yaw: Math.PI,
      hp: def.mounted ? 140 : 110,
      maxHp: def.mounted ? 140 : 110,
      alive: true,
      hasShield: def.shield !== 'NONE',
      weaponType: def.weapon,
      attackDir: 'right',
      blockDir: 'up',
      aiTimer: Math.random() * 0.6,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      respawnTimer: 0,
    });
  }

  return { units, meshes };
}

export function createSkirmishWaveEnemies(waveNumber: number): ArmySpawnResult {
  const units: SkirmishFighter[] = [];
  const meshes: THREE.Object3D[] = [];

  const enemyConfigs: Array<{
    name: string;
    division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY';
    weapon: WeaponType;
    shield: ShieldType;
    helmet: HelmetType;
    armor: ArmorTier;
    x: number;
    z: number;
  }> = [
    {
      name: 'Kuzeyli Kalkanlı Yağmacı',
      division: 'INFANTRY',
      weapon: 'ONE_HANDED_SWORD',
      shield: 'ROUND_SHIELD',
      helmet: 'SPANGENHELM',
      armor: waveNumber >= 2 ? 'CHAINMAIL' : 'LEATHER',
      x: -3.2,
      z: -8.5,
    },
    {
      name: 'Vlandiya Çift Elli Şövalye',
      division: 'INFANTRY',
      weapon: 'TWO_HANDED_SWORD',
      shield: 'NONE',
      helmet: 'IMPERIAL_VISOR',
      armor: waveNumber >= 2 ? 'PLATE' : 'CHAINMAIL',
      x: 0.2,
      z: -9.0,
    },
    {
      name: 'Bozkır Mızrakçısı',
      division: 'INFANTRY',
      weapon: 'SPEAR',
      shield: 'ROUND_SHIELD',
      helmet: 'KETTLE_HAT',
      armor: 'CHAINMAIL',
      x: 3.4,
      z: -8.5,
    },
    {
      name: 'Gölge Okçusu',
      division: 'ARCHERS',
      weapon: 'BOW',
      shield: 'NONE',
      helmet: 'KETTLE_HAT',
      armor: 'LEATHER',
      x: 0,
      z: -11.5,
    },
  ];

  enemyConfigs.forEach((cfg, idx) => {
    const rig = createCharacterRig({
      skinTone: '#c68a62',
      hairColor: '#1c1917',
      factionColor: '#581c87',
      weaponType: cfg.weapon,
      shieldType: cfg.shield,
      helmetType: cfg.helmet,
      armorTier: cfg.armor,
    });
    rig.root.position.set(cfg.x, 0, cfg.z);
    rig.root.rotation.y = 0;
    meshes.push(rig.root);

    const animator = new CharacterAnimator(rig);
    const maxHp = 85 + waveNumber * 15;
    const enemyTier = idx === 1 ? 5 : (idx === 3 ? 3 : (waveNumber >= 2 ? 3 : 2));
    units.push({
      id: `enemy-w${waveNumber}-${idx}`,
      name: cfg.name,
      team: 'ENEMY',
      division: cfg.division,
      tier: enemyTier,
      cavalryChargeState: cfg.division === 'CAVALRY' ? 'CHARGE' : undefined,
      cavalryTimer: 0,
      tacticalStance: 'ATTACK',
      tacticalTimer: 0,
      rig,
      animator,
      x: cfg.x,
      z: cfg.z,
      yaw: 0,
      hp: maxHp,
      maxHp,
      alive: true,
      hasShield: cfg.shield !== 'NONE',
      weaponType: cfg.weapon,
      attackDir: 'left',
      blockDir: 'up',
      aiTimer: 0.2 + idx * 0.15,
      strafeSign: idx % 2 === 0 ? 1 : -1,
      respawnTimer: 0,
    });
  });

  return { units, meshes };
}
