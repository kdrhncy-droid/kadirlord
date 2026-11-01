/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SANCAK-I KALRADYA · factionTroopLoadouts.ts
 *  6 Krallık Asker Terfi Ağacı (T1 Acemi → T6 Soylu Şampiyon) & Lord/Hükümdar
 *  Kuşanma (Loadout) Sistemi + Pazar (Market) Kataloğu Köprüsü
 *
 *  Bu dosya `src/armory/FactionArsenal.ts` ve `src/armory/FactionAnimations.ts`
 *  ile doğrudan bağlantılıdır; rütbe atlayan askerlerin, elit birliklerin ve
 *  krallık lordlarının hangi kılıç, zırh, kalkan ve savaş atını hangi kalitede
 *  kuşanacağını belirler ve 3B sahne düğümü olarak üretir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { DEG, LodLevel, triCount } from '../armory/Core.ts';
import { FactionPalette } from '../armory/Faction.ts';
import {
  FactionAnimationId,
  applyFactionAnimationToCharacterAnimator,
  ensureFactionIKClipsRegistered,
  updateEquippedCharacterAndMount,
} from '../armory/FactionAnimations.ts';
import {
  ArsenalFactionId,
  ComputedArmorStats,
  ComputedHorseStats,
  ComputedWeaponStats,
  FACTION_ARMORS,
  FACTION_HORSES,
  FACTION_WEAPONS,
  FactionArmorDef,
  FactionHorseDef,
  FactionWeaponDef,
  ItemQualityId,
  applyFactionArmorToRig,
  buildFactionWarHorseRig,
  buildFactionWeapon3D,
  computeArmorStatsWithQuality,
  computeHorseStatsWithQuality,
  computeWeaponStatsWithQuality,
  getArsenalArmorById,
  getArsenalHorseById,
  getArsenalWeaponById,
  mountFactionShieldToRig,
  mountFactionWeaponToRig,
} from '../armory/FactionArsenal.ts';
import {
  createCharacterRig,
  type CharacterRig,
  type WarHorseRig,
} from './characterRig.ts';
import { CharacterAnimator } from './characterAnimator.ts';
import type { MarketplaceItem } from './marketRules.ts';

export type TroopRankStageId =
  | 'T1_RECRUIT'
  | 'T2_MILITIA'
  | 'T3_REGULAR'
  | 'T4_VETERAN'
  | 'T5_ELITE'
  | 'T6_CHAMPION'
  | 'FACTION_LORD'
  | 'FACTION_RULER';

export interface FactionTroopRankLoadout {
  id: string;
  faction: ArsenalFactionId;
  rankStage: TroopRankStageId;
  rankBadgeTr: string;
  unitNameTr: string;
  roleTr: string;
  tierNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  defaultQuality: ItemQualityId;
  primaryWeaponId: string;
  secondaryWeaponId: string | null;
  shieldId: string | null;
  armorId: string;
  horseId: string | null;
  defaultAnimation: FactionAnimationId;
  dailyWageDinar: number;
  upgradeXpRequired: number;
  promotionNoteTr: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   1. 6 KRALLIK ASKER TERFİ & LORD KUŞANMA TABLOSU (48 BİRİM/RÜTBE)
   ═══════════════════════════════════════════════════════════════════════ */

export const FACTION_TROOP_LOADOUTS: FactionTroopRankLoadout[] = [
  // ─────────────────── 1. KALRADYA İMPARATORLUĞU (EMPIRE) ───────────────────
  {
    id: 'emp_rank_t1',
    faction: 'empire',
    rankStage: 'T1_RECRUIT',
    rankBadgeTr: 'Rütbe 1 · Acemi',
    unitNameTr: 'İmparatorluk Acemi Neferi',
    roleTr: 'Hafif Piyade',
    tierNumber: 1,
    defaultQuality: 'WORN',
    primaryWeaponId: 'emp_spatha_t3',
    secondaryWeaponId: null,
    shieldId: null,
    armorId: 'emp_armor_vigla_t2',
    horseId: null,
    defaultAnimation: 'attackSword',
    dailyWageDinar: 2,
    upgradeXpRequired: 100,
    promotionNoteTr: 'Köy ve şehirlerden yeni toplanmış acemi nefer; yıpranmış spatha ve keten tunik taşır.',
  },
  {
    id: 'emp_rank_t2',
    faction: 'empire',
    rankStage: 'T2_MILITIA',
    rankBadgeTr: 'Rütbe 2 · Vigla',
    unitNameTr: 'İmparatorluk Vigla Piyadesi',
    roleTr: 'Kalkanlı Piyade',
    tierNumber: 2,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'emp_spatha_t3',
    secondaryWeaponId: null,
    shieldId: 'emp_scutum_shield_t5',
    armorId: 'emp_armor_vigla_t2',
    horseId: null,
    defaultAnimation: 'shieldWallBrace',
    dailyWageDinar: 4,
    upgradeXpRequired: 250,
    promotionNoteTr: 'İlk terfide standart Spatha, dolgulu deri zırh ve lejyon kalkanı kuşanır.',
  },
  {
    id: 'emp_rank_t3',
    faction: 'empire',
    rankStage: 'T3_REGULAR',
    rankBadgeTr: 'Rütbe 3 · Nizami',
    unitNameTr: 'İmparatorluk Eğitimli Piyadesi',
    roleTr: 'Nizami Piyade',
    tierNumber: 3,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'emp_paramion_t4',
    secondaryWeaponId: 'emp_spatha_t3',
    shieldId: 'emp_scutum_shield_t5',
    armorId: 'emp_armor_legionary_t4',
    horseId: null,
    defaultAnimation: 'attackSabreSlash',
    dailyWageDinar: 7,
    upgradeXpRequired: 480,
    promotionNoteTr: 'Pullu zırha (Lorica) geçer ve kesici gücü yüksek Paramion kılıcını alır.',
  },
  {
    id: 'emp_rank_t4',
    faction: 'empire',
    rankStage: 'T4_VETERAN',
    rankBadgeTr: 'Rütbe 4 · Kıdemli',
    unitNameTr: 'İmparatorluk Menavliaton Gönderlisi',
    roleTr: 'Ağır Gönderli Piyade',
    tierNumber: 4,
    defaultQuality: 'FINE',
    primaryWeaponId: 'emp_menavlion_t5',
    secondaryWeaponId: 'emp_paramion_t4',
    shieldId: null,
    armorId: 'emp_armor_legionary_t4',
    horseId: null,
    defaultAnimation: 'attackPolearmSweep',
    dailyWageDinar: 11,
    upgradeXpRequired: 800,
    promotionNoteTr: 'Süvari avcısı ağır Menavlion gönderlisi ve sorguçlu lejyon miğferi kuşanır.',
  },
  {
    id: 'emp_rank_t5',
    faction: 'empire',
    rankStage: 'T5_ELITE',
    rankBadgeTr: 'Rütbe 5 · Elit Lejyon',
    unitNameTr: 'İmparatorluk Elit Lejyoneri',
    roleTr: 'Ağır Kalkan Duvarı Piyadesi',
    tierNumber: 5,
    defaultQuality: 'FINE',
    primaryWeaponId: 'emp_pernach_mace_t5',
    secondaryWeaponId: 'emp_thamaskene_spatha_t6',
    shieldId: 'emp_scutum_shield_t5',
    armorId: 'emp_armor_cataphract_t6',
    horseId: null,
    defaultAnimation: 'attackMaceCrush',
    dailyWageDinar: 16,
    upgradeXpRequired: 1250,
    promotionNoteTr: 'Altın kanatlı zırh ezici gürz, Scutum kalkanı ve ağır lamellar zırhla donanır.',
  },
  {
    id: 'emp_rank_t6',
    faction: 'empire',
    rankStage: 'T6_CHAMPION',
    rankBadgeTr: 'Rütbe 6 · Soylu Şampiyon',
    unitNameTr: 'İmparatorluk Elit Katafraktı',
    roleTr: 'Ağır Zırhlı Şok Süvarisi',
    tierNumber: 6,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'emp_kontos_t6',
    secondaryWeaponId: 'emp_thamaskene_spatha_t6',
    shieldId: 'emp_scutum_shield_t5',
    armorId: 'emp_armor_cataphract_t6',
    horseId: 'emp_horse_cataphract_t6',
    defaultAnimation: 'attackCouchedLance',
    dailyWageDinar: 24,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Zırhlı Katafrakt Küheylanı, Kontos kargısı, Thamaskene Spathası ve yüz maskeli miğfer.',
  },
  {
    id: 'emp_rank_lord',
    faction: 'empire',
    rankStage: 'FACTION_LORD',
    rankBadgeTr: 'Krallık Lordu · Arkhon',
    unitNameTr: 'İmparatorluk Arkhonu & Lejyon Komutanı',
    roleTr: 'Soylu Sancakbeyi',
    tierNumber: 7,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'emp_thamaskene_spatha_t6',
    secondaryWeaponId: 'emp_pernach_mace_t5',
    shieldId: 'emp_scutum_shield_t5',
    armorId: 'emp_armor_cataphract_t6',
    horseId: 'emp_horse_cataphract_t6',
    defaultAnimation: 'weaponFlourish',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Usta işi altın kartallı Thamaskene Spathası ve tam zırhlı Katafrakt binek takımı.',
  },
  {
    id: 'emp_rank_ruler',
    faction: 'empire',
    rankStage: 'FACTION_RULER',
    rankBadgeTr: 'Hükümdar · İmparatoriçe / İmparator',
    unitNameTr: 'İmparatoriçe Rhagaea / İmparator Lucon Muhafızı',
    roleTr: 'Kalradya Taht Hükümdarı',
    tierNumber: 7,
    defaultQuality: 'LEGENDARY',
    primaryWeaponId: 'emp_thamaskene_spatha_t6',
    secondaryWeaponId: 'emp_kontos_t6',
    shieldId: 'emp_scutum_shield_t5',
    armorId: 'emp_armor_cataphract_t6',
    horseId: 'emp_horse_cataphract_t6',
    defaultAnimation: 'attackCouchedLance',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Efsanevi (Legendary) kalitede imparatorluk hazinesi silahları ve altın katafrakt zırhı.',
  },

  // ─────────────────── 2. VLANDİYA KRALLIĞI (VLANDIA) ───────────────────
  {
    id: 'vla_rank_t1',
    faction: 'vlandia',
    rankStage: 'T1_RECRUIT',
    rankBadgeTr: 'Rütbe 1 · Acemi',
    unitNameTr: 'Vlandiya Feodal Köylü Acemisi',
    roleTr: 'Hafif Milis',
    tierNumber: 1,
    defaultQuality: 'WORN',
    primaryWeaponId: 'vla_arming_sword_t3',
    secondaryWeaponId: null,
    shieldId: null,
    armorId: 'vla_armor_levy_t2',
    horseId: null,
    defaultAnimation: 'attackSword',
    dailyWageDinar: 2,
    upgradeXpRequired: 100,
    promotionNoteTr: 'Kapitone gambeson ve yıpranmış şövalye yaveri kılıcıyla savaşa katılır.',
  },
  {
    id: 'vla_rank_t2',
    faction: 'vlandia',
    rankStage: 'T2_MILITIA',
    rankBadgeTr: 'Rütbe 2 · Milis',
    unitNameTr: 'Vlandiya Yaver Piyadesi',
    roleTr: 'Kalkanlı Piyade',
    tierNumber: 2,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'vla_arming_sword_t3',
    secondaryWeaponId: null,
    shieldId: 'vla_heater_kite_shield_t5',
    armorId: 'vla_armor_levy_t2',
    horseId: null,
    defaultAnimation: 'block',
    dailyWageDinar: 4,
    upgradeXpRequired: 250,
    promotionNoteTr: 'Demir şapka (Kettle Hat), Arming kılıcı ve Vlandiya damla kalkanı alır.',
  },
  {
    id: 'vla_rank_t3',
    faction: 'vlandia',
    rankStage: 'T3_REGULAR',
    rankBadgeTr: 'Rütbe 3 · Nizami',
    unitNameTr: 'Vlandiya Ağır Arbaletçisi',
    roleTr: 'Zırh Delici Nişancı',
    tierNumber: 3,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'vla_heavy_crossbow_t5',
    secondaryWeaponId: 'vla_arming_sword_t3',
    shieldId: 'vla_heater_kite_shield_t5',
    armorId: 'vla_armor_sergeant_t4',
    horseId: null,
    defaultAnimation: 'crossbowAimFire',
    dailyWageDinar: 8,
    upgradeXpRequired: 480,
    promotionNoteTr: 'Çıkrıklı çelik arbalet ve sırtında büyük siper kalkanıyla kuşatmaların belkemiği.',
  },
  {
    id: 'vla_rank_t4',
    faction: 'vlandia',
    rankStage: 'T4_VETERAN',
    rankBadgeTr: 'Rütbe 4 · Kıdemli',
    unitNameTr: 'Vlandiya Voulger Yarma Piyadesi',
    roleTr: 'Kalkan Kırıcı Şok Piyadesi',
    tierNumber: 4,
    defaultQuality: 'FINE',
    primaryWeaponId: 'vla_voulge_t5',
    secondaryWeaponId: 'vla_bastard_longsword_t5',
    shieldId: null,
    armorId: 'vla_armor_sergeant_t4',
    horseId: null,
    defaultAnimation: 'attackPolearmSweep',
    dailyWageDinar: 12,
    upgradeXpRequired: 800,
    promotionNoteTr: 'Ağır Voulge satır-kargısı ve örme zincir Hauberk ile düşman kalkan duvarını yarar.',
  },
  {
    id: 'vla_rank_t5',
    faction: 'vlandia',
    rankStage: 'T5_ELITE',
    rankBadgeTr: 'Rütbe 5 · Elit Çavuş',
    unitNameTr: 'Vlandiya Kraliyet Çavuşu (Sergeant)',
    roleTr: 'Ağır Zırhlı Piyade',
    tierNumber: 5,
    defaultQuality: 'FINE',
    primaryWeaponId: 'vla_bastard_longsword_t5',
    secondaryWeaponId: null,
    shieldId: 'vla_heater_kite_shield_t5',
    armorId: 'vla_armor_banner_knight_t6',
    horseId: null,
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 16,
    upgradeXpRequired: 1250,
    promotionNoteTr: 'Bastard uzun kılıcı, armalı surcoat ve tam plaka zırhla donatılmış elit piyade.',
  },
  {
    id: 'vla_rank_t6',
    faction: 'vlandia',
    rankStage: 'T6_CHAMPION',
    rankBadgeTr: 'Rütbe 6 · Soylu Şampiyon',
    unitNameTr: 'Vlandiya Sancak Şövalyesi (Banner Knight)',
    roleTr: 'Ağır Koltuklu Kargı Süvarisi',
    tierNumber: 6,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'vla_heavy_knight_lance_t6',
    secondaryWeaponId: 'vla_bastard_longsword_t5',
    shieldId: 'vla_heater_kite_shield_t5',
    armorId: 'vla_armor_banner_knight_t6',
    horseId: 'vla_horse_destrier_t6',
    defaultAnimation: 'attackCouchedLance',
    dailyWageDinar: 25,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Zırhlı Destrier küheylanı, koltuklu şövalye kargısı ve taçlı Great Helm kuşanır.',
  },
  {
    id: 'vla_rank_lord',
    faction: 'vlandia',
    rankStage: 'FACTION_LORD',
    rankBadgeTr: 'Krallık Lordu · Baron',
    unitNameTr: 'Vlandiya Baronu & Sancak Komutanı',
    roleTr: 'Feodal Süvari Lordu',
    tierNumber: 7,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'vla_royal_greatsword_t6',
    secondaryWeaponId: 'vla_heavy_knight_lance_t6',
    shieldId: 'vla_heater_kite_shield_t5',
    armorId: 'vla_armor_banner_knight_t6',
    horseId: 'vla_horse_destrier_t6',
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Dey Meroc çift elli şövalye kılıcı ve tam zırhlı Destrier savaş atı.',
  },
  {
    id: 'vla_rank_ruler',
    faction: 'vlandia',
    rankStage: 'FACTION_RULER',
    rankBadgeTr: 'Hükümdar · Kral Derthert',
    unitNameTr: 'Kral Derthert (Vlandiya Hükümdarı)',
    roleTr: 'Vlandiya Kralı',
    tierNumber: 7,
    defaultQuality: 'LEGENDARY',
    primaryWeaponId: 'vla_royal_greatsword_t6',
    secondaryWeaponId: 'vla_heavy_knight_lance_t6',
    shieldId: 'vla_heater_kite_shield_t5',
    armorId: 'vla_armor_banner_knight_t6',
    horseId: 'vla_horse_destrier_t6',
    defaultAnimation: 'weaponFlourish',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Efsanevi kraliyet çift elli kılıcı, altın taçlı miğfer ve siyah Destrier.',
  },

  // ─────────────────── 3. STURGİYA KNEZLİĞİ (STURGIA) ───────────────────
  {
    id: 'stu_rank_t1',
    faction: 'sturgia',
    rankStage: 'T1_RECRUIT',
    rankBadgeTr: 'Rütbe 1 · Acemi',
    unitNameTr: 'Sturgiya Orman Acemisi',
    roleTr: 'Kuzey Milisi',
    tierNumber: 1,
    defaultQuality: 'WORN',
    primaryWeaponId: 'stu_bearded_axe_t4',
    secondaryWeaponId: null,
    shieldId: null,
    armorId: 'stu_armor_hunter_t2',
    horseId: null,
    defaultAnimation: 'attackAxe',
    dailyWageDinar: 2,
    upgradeXpRequired: 100,
    promotionNoteTr: 'Kürk yakalı deri kaftan ve yıpranmış kuzey baltasıyla savaşa girer.',
  },
  {
    id: 'stu_rank_t2',
    faction: 'sturgia',
    rankStage: 'T2_MILITIA',
    rankBadgeTr: 'Rütbe 2 · Savaşçı',
    unitNameTr: 'Sturgiya Kalkanlı Balta Savaşçısı',
    roleTr: 'Kalkan Duvarı Piyadesi',
    tierNumber: 2,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'stu_bearded_axe_t4',
    secondaryWeaponId: null,
    shieldId: 'stu_huskarl_round_shield_t6',
    armorId: 'stu_armor_hunter_t2',
    horseId: null,
    defaultAnimation: 'shieldWallBrace',
    dailyWageDinar: 4,
    upgradeXpRequired: 250,
    promotionNoteTr: 'Geniş yuvarlak kuzey kalkanı ve sakallı baltayla kalkan duvarına katılır.',
  },
  {
    id: 'stu_rank_t3',
    faction: 'sturgia',
    rankStage: 'T3_REGULAR',
    rankBadgeTr: 'Rütbe 3 · Varyag',
    unitNameTr: 'Sturgiya Varyag Kılıç Savaşçısı',
    roleTr: 'Ağır Piyade',
    tierNumber: 3,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'stu_nord_broadsword_t4',
    secondaryWeaponId: 'stu_bearded_axe_t4',
    shieldId: 'stu_huskarl_round_shield_t6',
    armorId: 'stu_armor_varyag_t4',
    horseId: null,
    defaultAnimation: 'attackSword',
    dailyWageDinar: 8,
    upgradeXpRequired: 480,
    promotionNoteTr: 'Ulfberht kuzey kılıcı ve gözlüklü Gjermundbu demir miğfer kuşanır.',
  },
  {
    id: 'stu_rank_t4',
    faction: 'sturgia',
    rankStage: 'T4_VETERAN',
    rankBadgeTr: 'Rütbe 4 · Kıdemli',
    unitNameTr: 'Sturgiya Kahraman Hat Kırıcı (Line Breaker)',
    roleTr: 'Çift Elli Balta Şok Piyadesi',
    tierNumber: 4,
    defaultQuality: 'FINE',
    primaryWeaponId: 'stu_dane_great_axe_t6',
    secondaryWeaponId: 'stu_nord_broadsword_t4',
    shieldId: null,
    armorId: 'stu_armor_varyag_t4',
    horseId: null,
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 12,
    upgradeXpRequired: 800,
    promotionNoteTr: 'Devasa iki elli Dane Axe baltasıyla düşman kalkan duvarlarını paramparça eder.',
  },
  {
    id: 'stu_rank_t5',
    faction: 'sturgia',
    rankStage: 'T5_ELITE',
    rankBadgeTr: 'Rütbe 5 · Elit Huskarl',
    unitNameTr: 'Sturgiya Ağır Mızraklı Huskarlı',
    roleTr: 'Geçilmez Kalkan Duvarı Muhafızı',
    tierNumber: 5,
    defaultQuality: 'FINE',
    primaryWeaponId: 'stu_nord_broadsword_t4',
    secondaryWeaponId: 'stu_sovnya_polearm_t5',
    shieldId: 'stu_huskarl_round_shield_t6',
    armorId: 'stu_armor_druzhinnik_t6',
    horseId: null,
    defaultAnimation: 'shieldWallBrace',
    dailyWageDinar: 17,
    upgradeXpRequired: 1250,
    promotionNoteTr: 'Demir çemberli Huskarl kalkanı, Sovnya gönderlisi ve ağır lamellar hauberk.',
  },
  {
    id: 'stu_rank_t6',
    faction: 'sturgia',
    rankStage: 'T6_CHAMPION',
    rankBadgeTr: 'Rütbe 6 · Soylu Şampiyon',
    unitNameTr: 'Sturgiya Druzhinnik Şampiyon Süvarisi',
    roleTr: 'Soylu Boyar Süvarisi',
    tierNumber: 6,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'stu_varsheg_greatsword_t6',
    secondaryWeaponId: 'stu_nord_broadsword_t4',
    shieldId: 'stu_huskarl_round_shield_t6',
    armorId: 'stu_armor_druzhinnik_t6',
    horseId: 'stu_horse_druzhinnik_t6',
    defaultAnimation: 'mountedIdle',
    dailyWageDinar: 24,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Kürk ve zincir zırhlı kuzey küheylanı üzerinde hem eyerde hem yaya ölümcül şampiyon.',
  },
  {
    id: 'stu_rank_lord',
    faction: 'sturgia',
    rankStage: 'FACTION_LORD',
    rankBadgeTr: 'Krallık Lordu · Boyar',
    unitNameTr: 'Sturgiya Boyarı & Knezlik Muhafızı',
    roleTr: 'Kuzey Boyarı',
    tierNumber: 7,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'stu_dane_great_axe_t6',
    secondaryWeaponId: 'stu_varsheg_greatsword_t6',
    shieldId: 'stu_huskarl_round_shield_t6',
    armorId: 'stu_armor_druzhinnik_t6',
    horseId: 'stu_horse_druzhinnik_t6',
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Usta işi Kahraman Yarma Baltası ve ayı postlu Boyar zırhı.',
  },
  {
    id: 'stu_rank_ruler',
    faction: 'sturgia',
    rankStage: 'FACTION_RULER',
    rankBadgeTr: 'Hükümdar · Büyük Knyaz Raganvad',
    unitNameTr: 'Büyük Knyaz Raganvad (Sturgiya Hükümdarı)',
    roleTr: 'Sturgiya Büyük Knyazı',
    tierNumber: 7,
    defaultQuality: 'LEGENDARY',
    primaryWeaponId: 'stu_varsheg_greatsword_t6',
    secondaryWeaponId: 'stu_dane_great_axe_t6',
    shieldId: 'stu_huskarl_round_shield_t6',
    armorId: 'stu_armor_druzhinnik_t6',
    horseId: 'stu_horse_druzhinnik_t6',
    defaultAnimation: 'weaponFlourish',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Efsanevi Varşeg Çift Elli Kuzey Kılıcı ve altın işlemeli Knyaz zırhı.',
  },

  // ─────────────────── 4. KUZAİT HANLIĞI (KHUZAIT) ───────────────────
  {
    id: 'khu_rank_t1',
    faction: 'khuzait',
    rankStage: 'T1_RECRUIT',
    rankBadgeTr: 'Rütbe 1 · Göçebe',
    unitNameTr: 'Kuzait Bozkır Göçebesi',
    roleTr: 'Hafif Bozkır Savaşçısı',
    tierNumber: 1,
    defaultQuality: 'WORN',
    primaryWeaponId: 'khu_steppe_ild_sabre_t3',
    secondaryWeaponId: null,
    shieldId: null,
    armorId: 'khu_armor_nomad_t2',
    horseId: null,
    defaultAnimation: 'attackSabreSlash',
    dailyWageDinar: 2,
    upgradeXpRequired: 100,
    promotionNoteTr: 'Keçe kaftan ve Bozkır İld eğri kılıcıyla akına katılan göçebe genç.',
  },
  {
    id: 'khu_rank_t2',
    faction: 'khuzait',
    rankStage: 'T2_MILITIA',
    rankBadgeTr: 'Rütbe 2 · Atlı Avcı',
    unitNameTr: 'Kuzait Kabile Atlı Okçusu',
    roleTr: 'Hafif Atlı Okçu',
    tierNumber: 2,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'khu_horn_composite_bow_t6',
    secondaryWeaponId: 'khu_steppe_ild_sabre_t3',
    shieldId: null,
    armorId: 'khu_armor_nomad_t2',
    horseId: 'khu_horse_steppe_t3',
    defaultAnimation: 'shootBow',
    dailyWageDinar: 5,
    upgradeXpRequired: 250,
    promotionNoteTr: 'Rütbe 2’de çevik Bozkır Midillisine biner ve kompozit yay kuşanır.',
  },
  {
    id: 'khu_rank_t3',
    faction: 'khuzait',
    rankStage: 'T3_REGULAR',
    rankBadgeTr: 'Rütbe 3 · Süvari',
    unitNameTr: 'Kuzait Bozkır Kargıcısı',
    roleTr: 'Hızlı Mızraklı Süvari',
    tierNumber: 3,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'khu_steppe_lance_t4',
    secondaryWeaponId: 'khu_steppe_ild_sabre_t3',
    shieldId: 'khu_cavalry_round_shield_t4',
    armorId: 'khu_armor_lancer_t4',
    horseId: 'khu_horse_steppe_t3',
    defaultAnimation: 'attackCouchedLance',
    dailyWageDinar: 8,
    upgradeXpRequired: 480,
    promotionNoteTr: 'At kuyruklu tug kargısı, süvari kalkanı ve deri-çelik lamellar yelek kuşanır.',
  },
  {
    id: 'khu_rank_t4',
    faction: 'khuzait',
    rankStage: 'T4_VETERAN',
    rankBadgeTr: 'Rütbe 4 · Kıdemli',
    unitNameTr: 'Kuzait Darhan Kalkanlı Piyadesi',
    roleTr: 'Ağır Bozkır Piyadesi',
    tierNumber: 4,
    defaultQuality: 'FINE',
    primaryWeaponId: 'khu_long_glaive_t6',
    secondaryWeaponId: 'khu_steppe_ild_sabre_t3',
    shieldId: 'khu_cavalry_round_shield_t4',
    armorId: 'khu_armor_lancer_t4',
    horseId: null,
    defaultAnimation: 'attackPolearmSweep',
    dailyWageDinar: 12,
    upgradeXpRequired: 800,
    promotionNoteTr: 'Uzun Glaive gönderli bıçağı ve tuğlu çelik tolgasıyla ön safları biçer.',
  },
  {
    id: 'khu_rank_t5',
    faction: 'khuzait',
    rankStage: 'T5_ELITE',
    rankBadgeTr: 'Rütbe 5 · Elit Süvari',
    unitNameTr: 'Kuzait Ağır Kargıcısı & Atlı Okçusu',
    roleTr: 'Zırhlı Atlı Okçu',
    tierNumber: 5,
    defaultQuality: 'FINE',
    primaryWeaponId: 'khu_horn_composite_bow_t6',
    secondaryWeaponId: 'khu_khan_scimitar_t6',
    shieldId: 'khu_cavalry_round_shield_t4',
    armorId: 'khu_armor_khans_guard_t6',
    horseId: 'khu_horse_khan_t6',
    defaultAnimation: 'shootBow',
    dailyWageDinar: 17,
    upgradeXpRequired: 1250,
    promotionNoteTr: 'Zırhlı Kanglı Küheylanı üzerinde boynuz kompozit yay ve Han şamşırı taşır.',
  },
  {
    id: 'khu_rank_t6',
    faction: 'khuzait',
    rankStage: 'T6_CHAMPION',
    rankBadgeTr: 'Rütbe 6 · Soylu Şampiyon',
    unitNameTr: 'Kuzait Han Muhafızı (Khan’s Guard)',
    roleTr: 'Elit Glaive & Yay Süvarisi',
    tierNumber: 6,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'khu_long_glaive_t6',
    secondaryWeaponId: 'khu_horn_composite_bow_t6',
    shieldId: null,
    armorId: 'khu_armor_khans_guard_t6',
    horseId: 'khu_horse_khan_t6',
    defaultAnimation: 'attackPolearmSweep',
    dailyWageDinar: 26,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Uzun Glaive kargı-kılıcı, Han Kompozit Yayı ve ayna plakalı ağır lamellar zırh.',
  },
  {
    id: 'khu_rank_lord',
    faction: 'khuzait',
    rankStage: 'FACTION_LORD',
    rankBadgeTr: 'Krallık Lordu · Noyan',
    unitNameTr: 'Kuzait Noyanı & Tümen Komutanı',
    roleTr: 'Bozkır Sancakbeyi',
    tierNumber: 7,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'khu_khan_scimitar_t6',
    secondaryWeaponId: 'khu_long_glaive_t6',
    shieldId: 'khu_cavalry_round_shield_t4',
    armorId: 'khu_armor_khans_guard_t6',
    horseId: 'khu_horse_khan_t6',
    defaultAnimation: 'attackSabreSlash',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Usta işi altın kakmalı Han Şamşırı ve Kanglı zırhlı küheylan.',
  },
  {
    id: 'khu_rank_ruler',
    faction: 'khuzait',
    rankStage: 'FACTION_RULER',
    rankBadgeTr: 'Hükümdar · Monchug Han',
    unitNameTr: 'Büyük Monchug Han (Kuzait Hükümdarı)',
    roleTr: 'Kuzait Kağanı',
    tierNumber: 7,
    defaultQuality: 'LEGENDARY',
    primaryWeaponId: 'khu_long_glaive_t6',
    secondaryWeaponId: 'khu_khan_scimitar_t6',
    shieldId: 'khu_cavalry_round_shield_t4',
    armorId: 'khu_armor_khans_guard_t6',
    horseId: 'khu_horse_khan_t6',
    defaultAnimation: 'weaponFlourish',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Efsanevi Han Muhafızı Glaive’i, altın güneş aynalı zırh ve Palomino Han Küheylanı.',
  },

  // ─────────────────── 5. ASERAY SULTANLIĞI (ASERAI) ───────────────────
  {
    id: 'ase_rank_t1',
    faction: 'aserai',
    rankStage: 'T1_RECRUIT',
    rankBadgeTr: 'Rütbe 1 · Kabile',
    unitNameTr: 'Aseray Vaha Kabile Savaşçısı',
    roleTr: 'Hafif Çöl Piyadesi',
    tierNumber: 1,
    defaultQuality: 'WORN',
    primaryWeaponId: 'ase_kaskara_sword_t4',
    secondaryWeaponId: null,
    shieldId: null,
    armorId: 'ase_armor_bedouin_t2',
    horseId: null,
    defaultAnimation: 'attackSword',
    dailyWageDinar: 2,
    upgradeXpRequired: 100,
    promotionNoteTr: 'Kefiyeli çöl cübbesi ve Kaskara kılıcıyla vaha savunmasına katılır.',
  },
  {
    id: 'ase_rank_t2',
    faction: 'aserai',
    rankStage: 'T2_MILITIA',
    rankBadgeTr: 'Rütbe 2 · Avcı',
    unitNameTr: 'Aseray Ciritçi Avcısı',
    roleTr: 'Fırlatma Mızraklı Avcı',
    tierNumber: 2,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'ase_jereed_quiver_t5',
    secondaryWeaponId: 'ase_kaskara_sword_t4',
    shieldId: 'ase_mamluke_shield_t5',
    armorId: 'ase_armor_bedouin_t2',
    horseId: null,
    defaultAnimation: 'javelinThrow',
    dailyWageDinar: 4,
    upgradeXpRequired: 250,
    promotionNoteTr: 'Ölümcül Aseray Ciriti (Jereed) ve yıldızlı Memlük kalkanı kuşanır.',
  },
  {
    id: 'ase_rank_t3',
    faction: 'aserai',
    rankStage: 'T3_REGULAR',
    rankBadgeTr: 'Rütbe 3 · Nizami',
    unitNameTr: 'Aseray Memlük Piyadesi',
    roleTr: 'Zırhlı Kılıç Piyadesi',
    tierNumber: 3,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'ase_kaskara_sword_t4',
    secondaryWeaponId: 'ase_jereed_quiver_t5',
    shieldId: 'ase_mamluke_shield_t5',
    armorId: 'ase_armor_mamluke_t4',
    horseId: null,
    defaultAnimation: 'attackSword',
    dailyWageDinar: 8,
    upgradeXpRequired: 480,
    promotionNoteTr: 'Pirinç pullu Memlük Hauberk zırhı ve sarıklı çelik tolgaya terfi eder.',
  },
  {
    id: 'ase_rank_t4',
    faction: 'aserai',
    rankStage: 'T4_VETERAN',
    rankBadgeTr: 'Rütbe 4 · Kıdemli',
    unitNameTr: 'Aseray Memlük Balta Muhafızı',
    roleTr: 'İki Elli Tabarzin Şok Piyadesi',
    tierNumber: 4,
    defaultQuality: 'FINE',
    primaryWeaponId: 'ase_mamluke_tabarzin_t5',
    secondaryWeaponId: 'ase_kaskara_sword_t4',
    shieldId: null,
    armorId: 'ase_armor_mamluke_t4',
    horseId: null,
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 12,
    upgradeXpRequired: 800,
    promotionNoteTr: 'Çift hilal ağızlı Memlük Tabarzin baltasıyla kalkanları ve zırhları yarar.',
  },
  {
    id: 'ase_rank_t5',
    faction: 'aserai',
    rankStage: 'T5_ELITE',
    rankBadgeTr: 'Rütbe 5 · Elit Muhafız',
    unitNameTr: 'Aseray Saray Muhafızı (Palace Guard)',
    roleTr: 'Elit Zırhlı Balta & Cirit Muhafızı',
    tierNumber: 5,
    defaultQuality: 'FINE',
    primaryWeaponId: 'ase_mamluke_tabarzin_t5',
    secondaryWeaponId: 'ase_jereed_quiver_t5',
    shieldId: null,
    armorId: 'ase_armor_faris_emir_t6',
    horseId: null,
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 17,
    upgradeXpRequired: 1250,
    promotionNoteTr: 'Altın kakmalı cevher zırhı, ağır Tabarzin baltası ve Jereed cirit seti.',
  },
  {
    id: 'ase_rank_t6',
    faction: 'aserai',
    rankStage: 'T6_CHAMPION',
    rankBadgeTr: 'Rütbe 6 · Soylu Şampiyon',
    unitNameTr: 'Aseray Öncü Faris Süvarisi (Vanguard Faris)',
    roleTr: 'Ciritli & Kargılı Elit Çöl Süvarisi',
    tierNumber: 6,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'ase_faris_lance_t5',
    secondaryWeaponId: 'ase_golden_scimitar_t6',
    shieldId: 'ase_mamluke_shield_t5',
    armorId: 'ase_armor_faris_emir_t6',
    horseId: 'ase_horse_nahasawi_t6',
    defaultAnimation: 'attackCouchedLance',
    dailyWageDinar: 25,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Nahasawi Altın Zırhlı Küheylan, Faris kargısı, cirit ve Sultan Şamşırı.',
  },
  {
    id: 'ase_rank_lord',
    faction: 'aserai',
    rankStage: 'FACTION_LORD',
    rankBadgeTr: 'Krallık Lordu · Emir',
    unitNameTr: 'Aseray Emiri & Kervan Saray Beyi',
    roleTr: 'Çöl Emiri',
    tierNumber: 7,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'ase_golden_scimitar_t6',
    secondaryWeaponId: 'ase_jereed_quiver_t5',
    shieldId: 'ase_mamluke_shield_t5',
    armorId: 'ase_armor_faris_emir_t6',
    horseId: 'ase_horse_nahasawi_t6',
    defaultAnimation: 'attackSabreSlash',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Usta işi Nahasawi Altın Şamşırı ve yaldızlı Emir küheylanı.',
  },
  {
    id: 'ase_rank_ruler',
    faction: 'aserai',
    rankStage: 'FACTION_RULER',
    rankBadgeTr: 'Hükümdar · Sultan Unqid',
    unitNameTr: 'Sultan Unqid (Aseray Hükümdarı)',
    roleTr: 'Aseray Sultanı',
    tierNumber: 7,
    defaultQuality: 'LEGENDARY',
    primaryWeaponId: 'ase_golden_scimitar_t6',
    secondaryWeaponId: 'ase_faris_lance_t5',
    shieldId: 'ase_mamluke_shield_t5',
    armorId: 'ase_armor_faris_emir_t6',
    horseId: 'ase_horse_nahasawi_t6',
    defaultAnimation: 'weaponFlourish',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Efsanevi Sultan Şamşırı, altın yakalı cevher zırhı ve Nahasawi küheylanı.',
  },

  // ─────────────────── 6. BATTANYA KRALLIĞI (BATTANIA) ───────────────────
  {
    id: 'bat_rank_t1',
    faction: 'battania',
    rankStage: 'T1_RECRUIT',
    rankBadgeTr: 'Rütbe 1 · Klan Genci',
    unitNameTr: 'Battanya Orman Gönüllüsü',
    roleTr: 'Hafif Klan Savaşçısı',
    tierNumber: 1,
    defaultQuality: 'WORN',
    primaryWeaponId: 'bat_highland_broadsword_t4',
    secondaryWeaponId: null,
    shieldId: null,
    armorId: 'bat_armor_woodrunner_t2',
    horseId: null,
    defaultAnimation: 'attackSword',
    dailyWageDinar: 2,
    upgradeXpRequired: 100,
    promotionNoteTr: 'Ekose tartan pelerin ve yayla kılıcıyla sisli ormanlardan savaşa katılır.',
  },
  {
    id: 'bat_rank_t2',
    faction: 'battania',
    rankStage: 'T2_MILITIA',
    rankBadgeTr: 'Rütbe 2 · Klan Savaşçısı',
    unitNameTr: 'Battanya Kalkanlı Klan Savaşçısı',
    roleTr: 'Çevik Piyade',
    tierNumber: 2,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'bat_highland_broadsword_t4',
    secondaryWeaponId: null,
    shieldId: 'bat_celtic_oval_shield_t4',
    armorId: 'bat_armor_woodrunner_t2',
    horseId: null,
    defaultAnimation: 'block',
    dailyWageDinar: 4,
    upgradeXpRequired: 250,
    promotionNoteTr: 'Bronz sarmallı Kelt oval kalkanı ve geniş yayla kılıcı kuşanır.',
  },
  {
    id: 'bat_rank_t3',
    faction: 'battania',
    rankStage: 'T3_REGULAR',
    rankBadgeTr: 'Rütbe 3 · Yeminli',
    unitNameTr: 'Battanya Yeminli Savaşçısı (Oathsworn)',
    roleTr: 'Zırhlı Klan Piyadesi',
    tierNumber: 3,
    defaultQuality: 'STANDARD',
    primaryWeaponId: 'bat_highland_broadsword_t4',
    secondaryWeaponId: null,
    shieldId: 'bat_celtic_oval_shield_t4',
    armorId: 'bat_armor_oathsworn_t4',
    horseId: null,
    defaultAnimation: 'shieldWallBrace',
    dailyWageDinar: 8,
    upgradeXpRequired: 480,
    promotionNoteTr: 'Kurt postlu omuzluk, bronz göğüslük ve boynuzlu Kelt miğferine geçer.',
  },
  {
    id: 'bat_rank_t4',
    faction: 'battania',
    rankStage: 'T4_VETERAN',
    rankBadgeTr: 'Rütbe 4 · Falx Savaşçısı',
    unitNameTr: 'Battanya Yaban Falx Savaşçısı (Falxman)',
    roleTr: 'Kalkan Kırıcı Orak Piyadesi',
    tierNumber: 4,
    defaultQuality: 'FINE',
    primaryWeaponId: 'bat_falx_t5',
    secondaryWeaponId: 'bat_highland_broadsword_t4',
    shieldId: null,
    armorId: 'bat_armor_oathsworn_t4',
    horseId: null,
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 12,
    upgradeXpRequired: 800,
    promotionNoteTr: 'İki elli içe kavisli Falx orak kılıcıyla düşman kalkanlarını tek darbede yarar.',
  },
  {
    id: 'bat_rank_t5',
    faction: 'battania',
    rankStage: 'T5_ELITE',
    rankBadgeTr: 'Rütbe 5 · Orakçı',
    unitNameTr: 'Battanya Kıdemli Rhomphaia Orakçısı (Reaper)',
    roleTr: 'Elit Gönderli Orak Piyadesi',
    tierNumber: 5,
    defaultQuality: 'FINE',
    primaryWeaponId: 'bat_rhomphaia_t6',
    secondaryWeaponId: 'bat_claymore_t6',
    shieldId: null,
    armorId: 'bat_armor_fian_champion_t6',
    horseId: null,
    defaultAnimation: 'attackPolearmSweep',
    dailyWageDinar: 17,
    upgradeXpRequired: 1250,
    promotionNoteTr: 'Uzun Rhomphaia biçici kargı-orağı ve ağır Kelt bronz-çelik zırhı kuşanır.',
  },
  {
    id: 'bat_rank_t6',
    faction: 'battania',
    rankStage: 'T6_CHAMPION',
    rankBadgeTr: 'Rütbe 6 · Soylu Şampiyon',
    unitNameTr: 'Battanya Fian Şampiyonu (Fian Champion)',
    roleTr: 'Efsanevi Uzun Yay & Claymore Şampiyonu',
    tierNumber: 6,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'bat_fian_longbow_t6',
    secondaryWeaponId: 'bat_claymore_t6',
    shieldId: null,
    armorId: 'bat_armor_fian_champion_t6',
    horseId: null,
    defaultAnimation: 'shootBow',
    dailyWageDinar: 26,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Porsuk uzun yayıyla uzaktan, Marunath Claymore çift elli kılıcıyla yakından yenilmez.',
  },
  {
    id: 'bat_rank_lord',
    faction: 'battania',
    rankStage: 'FACTION_LORD',
    rankBadgeTr: 'Krallık Lordu · Mormaer',
    unitNameTr: 'Battanya Klan Reisi (Mormaer)',
    roleTr: 'Yayla Klan Beyi',
    tierNumber: 7,
    defaultQuality: 'MASTERWORK',
    primaryWeaponId: 'bat_claymore_t6',
    secondaryWeaponId: 'bat_rhomphaia_t6',
    shieldId: 'bat_celtic_oval_shield_t4',
    armorId: 'bat_armor_fian_champion_t6',
    horseId: 'bat_horse_celtic_war_t5',
    defaultAnimation: 'attackTwoHandedCleave',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Usta işi Claymore çift elli kılıcı, altın Kelt torku ve bronz maskeli savaş atı.',
  },
  {
    id: 'bat_rank_ruler',
    faction: 'battania',
    rankStage: 'FACTION_RULER',
    rankBadgeTr: 'Hükümdar · Yüksek Kral Caladog',
    unitNameTr: 'Yüksek Kral Caladog (Battanya Hükümdarı)',
    roleTr: 'Battanya Yüksek Kralı',
    tierNumber: 7,
    defaultQuality: 'LEGENDARY',
    primaryWeaponId: 'bat_rhomphaia_t6',
    secondaryWeaponId: 'bat_claymore_t6',
    shieldId: null,
    armorId: 'bat_armor_fian_champion_t6',
    horseId: 'bat_horse_celtic_war_t5',
    defaultAnimation: 'attackPolearmSweep',
    dailyWageDinar: 0,
    upgradeXpRequired: 0,
    promotionNoteTr: 'Efsanevi Rhomphaia kargı-orağı, Marunath Claymore ve kurt postlu kraliyet zırhı.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   2. 3B ASKER / LORD / SÜVARİ KUŞANMA SAHNE ÜRETİCİSİ
   ═══════════════════════════════════════════════════════════════════════ */

export interface EquippedUnitSceneResult {
  rootGroup: THREE.Group;
  characterRig: CharacterRig;
  characterAnimator: CharacterAnimator;
  horseRig: WarHorseRig | null;
  loadout: FactionTroopRankLoadout;
  primaryWeapon: FactionWeaponDef;
  primaryWeaponStats: ComputedWeaponStats;
  secondaryWeapon: FactionWeaponDef | null;
  shield: FactionWeaponDef | null;
  armor: FactionArmorDef;
  armorStats: ComputedArmorStats;
  horseDef: FactionHorseDef | null;
  horseStats: ComputedHorseStats | null;
  totalEquipmentValueDinar: number;
  totalTriangles: number;
  updateAnimation: (dt: number) => void;
  setAnimation: (animId: FactionAnimationId) => void;
  dispose: () => void;
}

function countObjectTriangles(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      tris += triCount(m.geometry);
    }
  });
  return Math.round(tris);
}

/**
 * Seçilen krallık rütbesini (T1..T6 veya Lord/Hükümdar) ve kalite çarpanını alıp
 * asker/lordu kalibre edilmiş `CharacterRig` + 2-Bone IK `CharacterAnimator` +
 * `WarHorseRig` üzerinde **sıfır zırh çakışması ve gerçek çift el/kalkan tutuşuyla**
 * tek bir `THREE.Group` içinde canlı animasyonlu olarak kurar.
 */
export function buildEquippedTroopOrLordScene(
  loadout: FactionTroopRankLoadout,
  qualityOverride?: ItemQualityId,
  lod: LodLevel = 'hero',
): EquippedUnitSceneResult {
  ensureFactionIKClipsRegistered();

  const quality = qualityOverride ?? loadout.defaultQuality;
  const primaryWeapon =
    getArsenalWeaponById(loadout.primaryWeaponId) ?? FACTION_WEAPONS[0];
  const secondaryWeapon = loadout.secondaryWeaponId
    ? (getArsenalWeaponById(loadout.secondaryWeaponId) ?? null)
    : null;
  const shield = loadout.shieldId
    ? (getArsenalWeaponById(loadout.shieldId) ?? null)
    : null;
  const armor =
    getArsenalArmorById(loadout.armorId) ?? FACTION_ARMORS[0];
  const horseDef = loadout.horseId
    ? (getArsenalHorseById(loadout.horseId) ?? null)
    : null;

  const primaryWeaponStats = computeWeaponStatsWithQuality(primaryWeapon, quality);
  const armorStats = computeArmorStatsWithQuality(armor, quality);
  const horseStats = horseDef ? computeHorseStatsWithQuality(horseDef, quality) : null;
  const secondaryStats = secondaryWeapon
    ? computeWeaponStatsWithQuality(secondaryWeapon, quality)
    : null;
  const shieldStats = shield ? computeWeaponStatsWithQuality(shield, quality) : null;

  const totalEquipmentValueDinar =
    primaryWeaponStats.priceDinar +
    (secondaryStats?.priceDinar ?? 0) +
    (shieldStats?.priceDinar ?? 0) +
    armorStats.priceDinar +
    (horseStats?.priceDinar ?? 0);

  const factionPal = FactionPalette.byId(loadout.faction);

  // 1. Kalibre edilmiş CharacterRig oluştur
  const skinByFaction: Record<ArsenalFactionId, string> = {
    empire: '#d9ad87',
    vlandia: '#e4b894',
    sturgia: '#ebdbc8',
    khuzait: '#d7a87e',
    aserai: '#ba855c',
    battania: '#e2b692',
  };
  const hairByFaction: Record<ArsenalFactionId, string> = {
    empire: '#261a12',
    vlandia: '#422918',
    sturgia: '#8a6b3e',
    khuzait: '#171412',
    aserai: '#16110e',
    battania: '#5a2d18',
  };

  const characterRig = createCharacterRig({
    skinTone: skinByFaction[loadout.faction],
    hairColor: hairByFaction[loadout.faction],
    beardColor: hairByFaction[loadout.faction],
    factionColor: `#${factionPal.colors.primary.toString(16).padStart(6, '0')}`,
    factionId: loadout.faction,
    hasBeard: loadout.tierNumber >= 3,
    weaponType: 'ONE_HANDED_SWORD',
    shieldType: 'NONE',
    helmetType: 'NONE',
    armorTier: 'CHAINMAIL',
  });

  // 2. Krallığa özel kalibre zırhı ve miğferi giydir (iç içe girmez, çeneyi kapatmaz)
  applyFactionArmorToRig(characterRig, armor, quality);

  // 3. Ana silahı (veya yayı) monte et (kabza merkezi avuç içine tam oturur)
  mountFactionWeaponToRig(characterRig, primaryWeapon, quality, lod);

  // 4. Sol el kalkanını monte et (yalnız tek elli silah veya tek elli mızrak/kargı varsa;
  //    iki elli kılıç/balta/falx/glaive/yay ile kalkan aynı anda elde tutulmaz!)
  if (shield && primaryWeapon.kind !== 'bow' && primaryWeapon.kind !== 'crossbow' && !primaryWeapon.twoHanded) {
    mountFactionShieldToRig(characterRig, shield, quality, lod);
  } else if (shield && primaryWeapon.twoHanded) {
    // Çift elli silah taşıyan birliğin kalkanı varsa sırtına asılır:
    const backShield = buildFactionWeapon3D(shield, quality, lod).group;
    backShield.scale.setScalar(0.68);
    backShield.position.set(0, 0.02, -0.04);
    backShield.rotation.y = Math.PI;
    characterRig.backSocket.add(backShield);
  }

  // 5. İkincil silahı bel/sırt soketine as (varsa ve sırt dolu değilse)
  if (secondaryWeapon && characterRig.hipSocket.children.length === 0) {
    const builtSecondary = buildFactionWeapon3D(secondaryWeapon, quality, lod);
    builtSecondary.group.scale.setScalar(0.76);
    builtSecondary.group.rotation.set(Math.PI * 0.38, 0, 0);
    characterRig.hipSocket.add(builtSecondary.group);
  }

  // 6. 2-Bone IK CharacterAnimator başlat
  const characterAnimator = new CharacterAnimator(characterRig);

  // 7. Savaş atı varsa WarHorseRig kur ve karakteri eyer düğümüne (`riderMount`) oturt
  const rootGroup = new THREE.Group();
  rootGroup.name = `troop_scene_${loadout.id}`;
  let horseRig: WarHorseRig | null = null;

  if (horseDef) {
    horseRig = buildFactionWarHorseRig(horseDef, quality);
    // applyRiderMountedPosture pelvis.position.y = 0.14 olarak ayarladığından
    // root doğrudan (0, 0, 0) ile riderMount'a bağlanır:
    characterRig.root.position.set(0, 0, 0);
    horseRig.riderMount.add(characterRig.root);
    horseRig.root.rotation.y = -58 * DEG;
    rootGroup.add(horseRig.root);
  } else {
    characterRig.root.position.set(0, 0, 0);
    rootGroup.add(characterRig.root);
  }

  let currentAnimId: FactionAnimationId = loadout.defaultAnimation;
  let elapsedSec = 0;

  const setAnimation = (animId: FactionAnimationId) => {
    currentAnimId = animId;
    applyFactionAnimationToCharacterAnimator(characterAnimator, animId);
  };

  setAnimation(loadout.defaultAnimation);

  const updateAnimation = (dt: number) => {
    elapsedSec += dt;
    updateEquippedCharacterAndMount({
      rig: characterRig,
      animator: characterAnimator,
      horseRig,
      animId: currentAnimId,
      dt,
      elapsedSec,
    });
  };

  // İlk kareleri değerlendir ki 2-bone IK ve binek oturuşu anında kilitlensin
  for (let i = 0; i < 6; i++) {
    updateAnimation(0.032);
  }

  const totalTriangles = countObjectTriangles(rootGroup);

  return {
    rootGroup,
    characterRig,
    characterAnimator,
    horseRig,
    loadout,
    primaryWeapon,
    primaryWeaponStats,
    secondaryWeapon,
    shield,
    armor,
    armorStats,
    horseDef,
    horseStats,
    totalEquipmentValueDinar,
    totalTriangles,
    updateAnimation,
    setAnimation,
    dispose: () => {
      rootGroup.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.isMesh && m.geometry) {
          m.geometry.dispose();
        }
      });
    },
  };
}

export function getTroopLoadoutsByFaction(
  faction: ArsenalFactionId,
): FactionTroopRankLoadout[] {
  return FACTION_TROOP_LOADOUTS.filter((l) => l.faction === faction);
}

export function normalizeArsenalFactionId(faction?: string): ArsenalFactionId {
  const f = (faction || 'empire').toLowerCase();
  if (f.includes('vlan')) return 'vlandia';
  if (f.includes('sturg')) return 'sturgia';
  if (f.includes('khuz')) return 'khuzait';
  if (f.includes('ase')) return 'aserai';
  if (f.includes('bat')) return 'battania';
  return 'empire';
}

export function getTroopLoadoutForRole(
  factionId?: string,
  division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY' = 'INFANTRY',
  tier = 3,
): FactionTroopRankLoadout {
  const fac = normalizeArsenalFactionId(factionId);
  const troops = getTroopLoadoutsByFaction(fac);

  if (division === 'CAVALRY') {
    const cav =
      troops.find((t) => t.horseId && (tier >= 5 ? t.tierNumber >= 5 : true)) ||
      troops.find((t) => t.horseId) ||
      troops.find((t) => t.rankStage === 'T6_CHAMPION');
    if (cav) return cav;
  } else if (division === 'ARCHERS') {
    const archer =
      troops.find(
        (t) =>
          (t.roleTr.includes('Okçu') ||
            t.roleTr.includes('Menzilli') ||
            t.roleTr.includes('Arbalet')) &&
          (tier >= 4 ? t.tierNumber >= 4 : true),
      ) ||
      troops.find(
        (t) =>
          t.roleTr.includes('Okçu') ||
          t.roleTr.includes('Menzilli') ||
          t.roleTr.includes('Arbalet'),
      );
    if (archer) return archer;
  }

  const targetStage: TroopRankStageId =
    tier <= 1
      ? 'T1_RECRUIT'
      : tier === 2
        ? 'T2_MILITIA'
        : tier === 3
          ? 'T3_REGULAR'
          : tier === 4
            ? 'T4_VETERAN'
            : tier === 5
              ? 'T5_ELITE'
              : 'T6_CHAMPION';

  const inf =
    troops.find((t) => t.rankStage === targetStage && !t.horseId) ||
    troops.find((t) => !t.horseId && t.tierNumber === tier) ||
    troops.find((t) => t.rankStage === 'T3_REGULAR') ||
    troops[0];

  return inf;
}

export function getLordLoadout(factionId?: string, isRuler = false): FactionTroopRankLoadout {
  const fac = normalizeArsenalFactionId(factionId);
  const stage: TroopRankStageId = isRuler ? 'FACTION_RULER' : 'FACTION_LORD';
  const found = FACTION_TROOP_LOADOUTS.find((l) => l.faction === fac && l.rankStage === stage);
  if (found) return found;
  return (
    FACTION_TROOP_LOADOUTS.find((l) => l.faction === fac && l.rankStage === 'FACTION_LORD') ||
    FACTION_TROOP_LOADOUTS[0]
  );
}

export function findArsenalWeaponByTextOrId(str?: string): FactionWeaponDef | undefined {
  if (!str) return undefined;
  const cleanId = str.startsWith('mkt_') ? str.slice(4) : str;
  const byId = getArsenalWeaponById(cleanId) || getArsenalWeaponById(str);
  if (byId) return byId;
  const lower = str.toLowerCase();
  return FACTION_WEAPONS.find((w) => w.nameTr.toLowerCase() === lower || lower.includes(w.nameTr.toLowerCase()));
}

export function findArsenalArmorByTextOrId(str?: string): FactionArmorDef | undefined {
  if (!str) return undefined;
  const cleanId = str.startsWith('mkt_') ? str.slice(4) : str;
  const byId = getArsenalArmorById(cleanId) || getArsenalArmorById(str);
  if (byId) return byId;
  const lower = str.toLowerCase();
  return FACTION_ARMORS.find((a) => a.nameTr.toLowerCase() === lower || lower.includes(a.nameTr.toLowerCase()));
}

export function findArsenalHorseByTextOrId(str?: string): FactionHorseDef | undefined {
  if (!str) return undefined;
  const cleanId = str.startsWith('mkt_') ? str.slice(4) : str;
  const byId = getArsenalHorseById(cleanId) || getArsenalHorseById(str);
  if (byId) return byId;
  const lower = str.toLowerCase();
  return FACTION_HORSES.find((h) => h.nameTr.toLowerCase() === lower || lower.includes(h.nameTr.toLowerCase()));
}

/* ═══════════════════════════════════════════════════════════════════════
   3. PAZAR YERİ (MARKETPLACE) ENTEGRASYON KÖPRÜSÜ
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * `FactionArsenal.ts` içindeki tüm krallık silahlarını, kalkanlarını, zırhlarını
 * ve savaş atlarını oyun içi Pazaryeri (`CALRADIA_MARKETPLACE_ITEMS`) formatına
 * dönüştürür. Böylece kurulan her ekipman doğrudan şehir pazarlarında satılır.
 */
export function buildFactionArsenalMarketCatalog(): MarketplaceItem[] {
  const items: MarketplaceItem[] = [];

  for (const w of FACTION_WEAPONS) {
    const st = computeWeaponStatsWithQuality(w, 'STANDARD');
    const isShield = w.kind === 'shield';
    const isBow = w.kind === 'bow' || w.kind === 'crossbow';
    const isPolearm =
      w.kind === 'polearm_cleave' || w.kind === 'cavalry_lance' || w.kind === 'javelin';

    items.push({
      id: `mkt_${w.id}`,
      name: w.nameTr,
      category: isShield ? 'SHIELD' : 'WEAPON',
      slot: isShield ? 'WEAPON2' : isBow ? 'WEAPON4' : isPolearm ? 'WEAPON3' : 'WEAPON1',
      value: st.priceDinar,
      weight: st.weightKg,
      statBonus: st.statSummaryTr,
      iconKey: isShield
        ? 'shield'
        : isBow
          ? w.kind === 'crossbow'
            ? 'crossbow'
            : 'bow'
          : isPolearm
            ? 'spear'
            : w.kind === 'one_handed_axe' || w.kind === 'two_handed_axe' || w.kind === 'falx_blade'
              ? 'axe'
              : w.kind === 'mace'
                ? 'mace'
                : 'sword',
      civilianLegal: !w.twoHanded && !isShield && !isPolearm && !isBow,
      tier: w.tier,
      description: w.loreTr,
    });
  }

  for (const a of FACTION_ARMORS) {
    const st = computeArmorStatsWithQuality(a, 'STANDARD');
    items.push({
      id: `mkt_${a.id}`,
      name: a.nameTr,
      category: 'ARMOR',
      slot: 'BODY',
      value: st.priceDinar,
      weight: st.weightKg,
      statBonus: st.statSummaryTr,
      iconKey: 'armor',
      civilianLegal: a.armorClass === 'light',
      tier: a.tier,
      description: a.loreTr,
    });
  }

  for (const h of FACTION_HORSES) {
    const st = computeHorseStatsWithQuality(h, 'STANDARD');
    items.push({
      id: `mkt_${h.id}`,
      name: h.nameTr,
      category: 'HORSE',
      slot: 'MOUNT',
      value: st.priceDinar,
      weight: 0,
      statBonus: st.statSummaryTr,
      iconKey: 'horse',
      civilianLegal: true,
      tier: h.tier,
      description: h.loreTr,
    });
  }

  return items;
}
