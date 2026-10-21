/**
 * saveGame.ts — Sefer kaydı (Faz 10a)
 *
 * Tarayıcı `localStorage`'ında **tek yuva** tutulur (Bannerlord'un "Save 1"i gibi).
 * Modül DOM'a bağımlı değildir: depolama dışarıdan enjekte edilir → probe'lar
 * bellek içi sahte depolama ile çalışır.
 *
 * Kural: bozuk/eski/eksik kayıt **asla çökme sebebi olmaz**; `readSave` sessizce
 * `null` döner ve oyun yeni sefer açar.
 */
import type { CampaignState } from './rules';
import type { KingdomMacroState } from './kingdomSystem';

/** Kayıt biçimi sürümü. Uyumsuz kayıt yüklenmez (ileride göç ettirilebilir). */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'sancak-kalradya/sefer-v1';

export type BackgroundChoice = 'noble' | 'steppe' | 'tactician';

export interface SaveInput {
  campaign: CampaignState;
  macroState: KingdomMacroState;
  metHeroIds: string[];
  backgroundChoice: BackgroundChoice;
}

export interface SaveData extends SaveInput {
  version: number;
  /** `Date.now()` — "ne zaman kaydedildi" bilgisi için. */
  savedAt: number;
}

export interface SaveSummary {
  day: number;
  playerName: string;
  gold: number;
  savedAt: number;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Kampanya gerçekten oynanabilir mi? (kayıt bozulmasına karşı asgari kontrol) */
function isValidCampaign(value: unknown): value is CampaignState {
  if (!isObject(value)) return false;
  if (typeof value.day !== 'number' || !Number.isFinite(value.day)) return false;
  if (typeof value.playerName !== 'string' || value.playerName.length === 0) return false;
  if (!Array.isArray(value.settlements) || value.settlements.length === 0) return false;
  if (!Array.isArray(value.lords)) return false;
  if (!Array.isArray(value.chronicle)) return false;
  if (!isObject(value.roster)) return false;
  return true;
}

function isValidMacroState(value: unknown): value is KingdomMacroState {
  return isObject(value) && Array.isArray(value.clans) && value.clans.length > 0;
}

export function createSaveData(input: SaveInput, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    backgroundChoice: input.backgroundChoice,
    metHeroIds: [...input.metHeroIds],
    campaign: input.campaign,
    macroState: input.macroState,
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

/** Ham metni doğrular. Herhangi bir sorunda `null`. */
export function parseSave(raw: string | null | undefined): SaveData | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (parsed.version !== SAVE_VERSION) return null;
  if (!isValidCampaign(parsed.campaign)) return null;
  if (!isValidMacroState(parsed.macroState)) return null;
  const metHeroIds = Array.isArray(parsed.metHeroIds)
    ? parsed.metHeroIds.filter((id): id is string => typeof id === 'string')
    : [];
  const background: BackgroundChoice =
    parsed.backgroundChoice === 'steppe' || parsed.backgroundChoice === 'tactician'
      ? parsed.backgroundChoice
      : 'noble';
  return {
    version: SAVE_VERSION,
    savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    backgroundChoice: background,
    metHeroIds,
    campaign: parsed.campaign,
    macroState: parsed.macroState,
  };
}

export function summarizeSave(data: SaveData): SaveSummary {
  return {
    day: data.campaign.day,
    playerName: data.campaign.playerName,
    gold: data.campaign.gold,
    savedAt: data.savedAt,
  };
}

/** Tarayıcı deposu; SSR/test ortamında `null`. */
export function defaultStorage(): SaveStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Gizli mod / depolama kapalı → oyun kayıtsız devam eder.
    return null;
  }
}

/** Kaydeder. Depolama yoksa/dolu ise `false` (oyun akışı bozulmaz). */
export function writeSave(
  storage: SaveStorage | null,
  input: SaveInput,
  now = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serializeSave(createSaveData(input, now)));
    return true;
  } catch {
    return false;
  }
}

export function readSave(storage: SaveStorage | null): SaveData | null {
  if (!storage) return null;
  try {
    return parseSave(storage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function readSaveSummary(storage: SaveStorage | null): SaveSummary | null {
  const data = readSave(storage);
  return data ? summarizeSave(data) : null;
}

export function clearSave(storage: SaveStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* yoksay */
  }
}
