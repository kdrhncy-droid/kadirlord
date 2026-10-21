/**
 * equipmentPose.ts — Faz 9: ekipman duruş sabitleri
 *
 * Kalkanın eldeki dinlenme duruşu **tek yerde** tanımlanır. Legacy model,
 * BannerForge modeli ve `setRigSheathed` aynı değerleri kullanır; aksi halde
 * kalkan kınından çıkarılırken eski (yan yatmış) duruşa geri dönüyordu.
 *
 * Uzay: sol el (wrist) yerel uzayı. +Z ileri (kalkan yüzü), +Y yukarı.
 */
import type { ShieldType } from './characterRig.types.ts';

export const SHIELD_REST_POSITION: readonly [number, number, number] = [0.05, 0.05, 0.2];
export const SHIELD_REST_ROTATION: readonly [number, number, number] = [0, 0, 0];

/** Kalkan tipine göre ölçek — Bannerlord ölçülerine yakın. */
export const SHIELD_SCALE: Record<Exclude<ShieldType, 'NONE'>, number> = {
  ROUND_SHIELD: 0.76, // ~0.69 m çap
  KITE_SHIELD: 0.74, // ~0.92 m boy
  PAVISE: 0.74, // ~0.80 m boy
};
