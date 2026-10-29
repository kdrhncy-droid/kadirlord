import { playImpact, setArmorySoundEnabled, unlockArmorySound, armorySoundEnabled } from './armorySound.ts';

const SOUND_FILES = [
  '/sounds/weapon_swing_01.ogg',
  '/sounds/weapon_swing_02.ogg',
  '/sounds/weapon_swing_03.ogg',
  '/sounds/Sword_clash_01.ogg',
  '/sounds/Sword_clash_02.ogg',
  '/sounds/Sword_clash_03.ogg',
  '/sounds/Sword_clash_04.ogg',
  '/sounds/Sword_clash_05.ogg',
  '/sounds/shield_metal_metal_01.ogg',
  '/sounds/shield_wood_wood_01.ogg',
  '/sounds/shield_break_01.ogg',
  '/sounds/bow_shoot_01.ogg',
  '/sounds/draw_bow_01.ogg',
  '/sounds/arrow_pass_01.ogg',
  '/sounds/arrow_ground_01.ogg',
  '/sounds/missile_flesh_01.ogg',
  '/sounds/horn.ogg',
  '/sounds/man_victory_01.ogg',
  '/sounds/man_yell_01.ogg',
  '/sounds/man_yell_04.ogg',
  '/sounds/metal_high_high_01.ogg',
  '/sounds/blunt_high_high_01.ogg',
  '/sounds/horse_gallop_01.ogg',
  '/sounds/horse_charge_01.ogg',
  '/sounds/decap1.ogg',
];

// Procedural Web Audio Synthesizer & Hardware Mixing Engine for Sancak-ı Kalradya
class SoundManager {
  private ctx: AudioContext | null = null;
  public muted = false;
  public masterVolume = 0.75;
  private lastStepAt = 0;
  private stepPhase = 0;

  // WebAudio AudioBuffer Memory Cache (0 GC allocation during battle)
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();
  private totalActiveVoices = 0;
  private readonly maxTotalVoices = 16;
  private categoryCooldowns: Record<string, number> = {};
  private categoryActiveVoices: Record<string, number> = {};
  private readonly CATEGORY_LIMITS: Record<string, { minIntervalMs: number; maxVoices: number }> = {
    swing: { minIntervalMs: 40, maxVoices: 3 },
    clash: { minIntervalMs: 35, maxVoices: 4 },
    shield: { minIntervalMs: 40, maxVoices: 4 },
    bow: { minIntervalMs: 60, maxVoices: 3 },
    arrow: { minIntervalMs: 45, maxVoices: 3 },
    hit: { minIntervalMs: 35, maxVoices: 4 },
    horn: { minIntervalMs: 800, maxVoices: 1 },
    voice: { minIntervalMs: 120, maxVoices: 2 },
    horse: { minIntervalMs: 80, maxVoices: 2 },
    decap: { minIntervalMs: 200, maxVoices: 1 },
    general: { minIntervalMs: 30, maxVoices: 4 },
  };

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedVol = localStorage.getItem('kadirlord_sfx_volume');
        if (savedVol !== null) {
          const v = parseFloat(savedVol);
          if (!isNaN(v)) this.masterVolume = Math.max(0, Math.min(1, v));
        }
        const savedMute = localStorage.getItem('kadirlord_sfx_muted');
        if (savedMute !== null) {
          this.muted = savedMute === 'true';
        }
      } catch {}
    }
  }

  public async preloadSounds(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    for (const url of SOUND_FILES) {
      this.loadBuffer(url);
    }
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)!;
    if (this.loadingPromises.has(url)) return this.loadingPromises.get(url)!;
    const ctx = this.getContext();
    if (!ctx) return null;

    const promise = (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.bufferCache.set(url, audioBuf);
        return audioBuf;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(url);
      }
    })();

    this.loadingPromises.set(url, promise);
    return promise;
  }

  public playClip(category: string, url: string, volumeScale = 1): boolean {
    if (this.muted || this.masterVolume <= 0.01 || typeof window === 'undefined') return false;
    const ctx = this.getContext();
    if (!ctx) return false;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const limit = this.CATEGORY_LIMITS[category] || this.CATEGORY_LIMITS.general;
    const lastTime = this.categoryCooldowns[category] || 0;
    if (nowMs - lastTime < limit.minIntervalMs) {
      return true; // Warband channel throttling: drop spam seamlessly
    }

    const currentVoices = this.categoryActiveVoices[category] || 0;
    if (currentVoices >= limit.maxVoices || this.totalActiveVoices >= this.maxTotalVoices) {
      return true; // Channel cap reached
    }

    this.categoryCooldowns[category] = nowMs;

    const buffer = this.bufferCache.get(url);
    if (!buffer) {
      this.loadBuffer(url);
      return false; // Not yet decoded, fall back cleanly
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      const finalVol = Math.max(0, Math.min(1, this.masterVolume * volumeScale));
      gainNode.gain.setValueAtTime(finalVol, ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.totalActiveVoices++;
      this.categoryActiveVoices[category] = currentVoices + 1;

      source.onended = () => {
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch {}
        this.totalActiveVoices = Math.max(0, this.totalActiveVoices - 1);
        this.categoryActiveVoices[category] = Math.max(0, (this.categoryActiveVoices[category] || 1) - 1);
      };

      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  public playRandomClip(category: string, urls: string[], volumeScale = 1): boolean {
    if (!urls || urls.length === 0) return false;
    const picked = urls[Math.floor(Math.random() * urls.length)];
    return this.playClip(category, picked, volumeScale);
  }

  private getContext(): AudioContext | null {
    if (this.muted || this.masterVolume <= 0.01 || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setVolume(val: number): void {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterVolume === 0) {
      this.muted = true;
    } else if (this.muted) {
      this.muted = false;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('kadirlord_sfx_volume', this.masterVolume.toString());
        localStorage.setItem('kadirlord_sfx_muted', this.muted.toString());
      } catch {}
    }
    setArmorySoundEnabled(!this.muted && armorySoundEnabled());
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('kadirlord_sfx_muted', this.muted.toString());
      } catch {}
    }
    setArmorySoundEnabled(!this.muted && armorySoundEnabled());
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /** İlk kullanıcı jestinde çağrılır — tarayıcı autoplay kilidini açar ve sesleri RAM'e önyükler. */
  public unlock(): void {
    unlockArmorySound();
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.preloadSounds();
  }

  /** Arayüz ve menü tıklama sesi (yumuşak orta çağ parşömen/demir tıkı). */
  public playUiClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(135, now + 0.05);
    gain.gain.setValueAtTime(0.075 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Yerleşime girildiğinde veya sefer başladığında çalan sıcak, yumuşak akor. */
  public playSettlementEnter() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [220, 277.18, 329.63].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.055);
      gain.gain.linearRampToValueAtTime(0.065 * this.masterVolume, now + idx * 0.055 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.055 + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.36);
    });
  }

  /** Haritada parti hareket ederken çalan gerçekçi at nalı / yürüyüş ritmi. */
  public playMapStep(hasMountOrCavalry = true, timeScale = 1) {
    const ctx = this.getContext();
    if (!ctx) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const intervals = hasMountOrCavalry ? [165, 130, 315] : [285, 285];
    const speedFactor = Math.max(0.75, Math.min(2.1, timeScale));
    const minWait = Math.max(90, intervals[this.stepPhase % intervals.length] / speedFactor);
    if (nowMs - this.lastStepAt < minWait) return;
    this.lastStepAt = nowMs;
    this.stepPhase = (this.stepPhase + 1) % intervals.length;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const pitch = hasMountOrCavalry
      ? (this.stepPhase === 0 ? 116 : this.stepPhase === 1 ? 134 : 102)
      : (this.stepPhase % 2 === 0 ? 86 : 94);
    osc.frequency.setValueAtTime(pitch * (0.96 + Math.random() * 0.08), now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.062);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(hasMountOrCavalry ? 390 : 260, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05 * this.masterVolume, now + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playSwordSwing() {
    if (this.playRandomClip('swing', ['/sounds/weapon_swing_01.ogg', '/sounds/weapon_swing_02.ogg', '/sounds/weapon_swing_03.ogg'], 0.85)) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = this.createOscillatorSafe(ctx);
    if (!osc) return;
    const gain = ctx.createGain();
    const pitchVar = 0.92 + Math.random() * 0.16;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(95 * pitchVar, now + 0.14);

    gain.gain.setValueAtTime(0.16 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  private createOscillatorSafe(ctx: AudioContext): OscillatorNode | null {
    try {
      return ctx.createOscillator();
    } catch {
      return null;
    }
  }

  public playHeavyHit(isBlocked = false) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitchVar = 0.92 + Math.random() * 0.16;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isBlocked ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime((isBlocked ? 520 : 190) * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);

    gain.gain.setValueAtTime(0.22 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playWarhorn() {
    if (this.playClip('horn', '/sounds/horn.ogg', 0.85)) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(73.4, now + 0.36);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08 * this.masterVolume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playBowShot() {
    if (this.playClip('bow', '/sounds/bow_shoot_01.ogg', 0.85)) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitchVar = 0.94 + Math.random() * 0.12;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(180 * pitchVar, now + 0.09);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playCoinChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1174.6].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.14, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.19);
    });
  }

  public playTelegraphCue() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(440, now + 0.28);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playVictoryFanfare() {
    if (this.playClip('voice', '/sounds/man_victory_01.ogg', 0.9)) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.18, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.4);
    });
  }

  public playDefeatSting() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [220, 196, 164.81];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);
      gain.gain.setValueAtTime(0.16, now + idx * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.38);
    });
  }

  public playSwordSwoosh() {
    this.playSwordSwing();
  }

  public playShieldHit(isWood = false) {
    if (!this.muted && playImpact('shieldBlock', { intensity: 1 })) return;
    const clip = isWood ? '/sounds/shield_wood_wood_01.ogg' : '/sounds/shield_metal_metal_01.ogg';
    if (this.playClip('shield', clip, 0.9)) return;
    this.playHeavyHit(true);
  }

  public playArrowFly() {
    if (!this.muted && playImpact('bowRelease', { intensity: 0.9 })) return;
    if (this.playClip('arrow', '/sounds/arrow_pass_01.ogg', 0.85)) return;
    this.playBowShot();
  }

  public playClang() {
    if (!this.muted && playImpact('swordClash', { intensity: 1.1 })) return;
    if (this.playRandomClip('clash', [
      '/sounds/Sword_clash_01.ogg',
      '/sounds/Sword_clash_02.ogg',
      '/sounds/Sword_clash_03.ogg',
      '/sounds/Sword_clash_04.ogg',
      '/sounds/Sword_clash_05.ogg',
    ], 0.9)) return;
    this.playHeavyHit(true);
  }

  /** Kılıç çınlaması (metal–metal). */
  public playSwordClash() {
    if (!this.muted && playImpact('swordClash', { intensity: 1.2 })) return;
    if (this.playRandomClip('clash', [
      '/sounds/Sword_clash_01.ogg',
      '/sounds/Sword_clash_02.ogg',
      '/sounds/Sword_clash_03.ogg',
      '/sounds/Sword_clash_04.ogg',
      '/sounds/Sword_clash_05.ogg',
    ], 0.9)) return;
    this.playHeavyHit(true);
  }

  /** Ağır balta/2H savurma ıslığı. */
  public playHeavySwing() {
    if (!this.muted && playImpact('heavyAxeSwing', { intensity: 1.1 })) return;
    if (this.playRandomClip('swing', ['/sounds/weapon_swing_01.ogg', '/sounds/weapon_swing_02.ogg'], 0.95)) return;
    this.playSwordSwing();
  }

  /** Ok gövdeye/kalkana saplandı. */
  public playArrowImpact() {
    if (!this.muted && playImpact('arrowHit', { intensity: 1 })) return;
    if (this.playRandomClip('hit', ['/sounds/missile_flesh_01.ogg', '/sounds/arrow_ground_01.ogg'], 0.9)) return;
    this.playHeavyHit(false);
  }

  public playCoin() {
    this.playCoinChime();
  }

  /* ─────────────────── diyalog sesleri (Faz 6d) ───────────────────
   * Hepsi prosedürel: harici dosya yok, tarayıcı autoplay kilidi `unlock()`
   * ile açılıyor. Sesler kısa (≤ 0.4 sn) ve birbirini maskelemiyor.
   */

  /** Diyalog açılışı: alçak, sıcak bir "perde açıldı" tonu. */
  public playDialogueOpen() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [
      { f: 196, t: 0, d: 0.34, gain: 0.1 },
      { f: 293.7, t: 0.07, d: 0.3, gain: 0.085 },
    ].forEach(({ f, t, d, gain: g }) => {
      const osc = ctx.createOscillator();
      const vca = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + t);
      vca.gain.setValueAtTime(0.0001, now + t);
      vca.gain.exponentialRampToValueAtTime(g, now + t + 0.03);
      vca.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(vca);
      vca.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    });
  }

  /** Diyalog kapanışı: inen, yumuşak bir kapanış. */
  public playDialogueClose() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vca = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.24);
    vca.gain.setValueAtTime(0.09, now);
    vca.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(vca);
    vca.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /**
   * Seçenek seçildi: kısa tık + yükselen iki nota.
   * `tone` = 'neutral' | 'good' | 'bad' → teklif kabul/ret ayrımı.
   */
  public playDialogueChoice(tone: 'neutral' | 'good' | 'bad' = 'neutral') {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const seq =
      tone === 'good'
        ? [523.3, 784] // kabul: yukarı çıkış
        : tone === 'bad'
          ? [392, 261.6] // ret: aşağı iniş
          : [440, 587.3]; // nötr: hafif yükseliş
    seq.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const vca = ctx.createGain();
      osc.type = tone === 'bad' ? 'square' : 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.075);
      vca.gain.setValueAtTime(0.0001, now + i * 0.075);
      vca.gain.exponentialRampToValueAtTime(0.085, now + i * 0.075 + 0.012);
      vca.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.075 + 0.17);
      osc.connect(vca);
      vca.connect(ctx.destination);
      osc.start(now + i * 0.075);
      osc.stop(now + i * 0.075 + 0.18);
    });
  }

  /** Diyalog metni belirdi: kısa "yazıldı" tıkı (çok hafif). */
  public playDialogueBlip() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vca = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620 + Math.random() * 110, now);
    vca.gain.setValueAtTime(0.035, now);
    vca.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(vca);
    vca.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /** Görev kabul / anlaşma: kısa mürekkep-mühür vurgusu. */
  public playAgreement() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vca = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(196, now);
    osc.frequency.exponentialRampToValueAtTime(392, now + 0.12);
    vca.gain.setValueAtTime(0.13, now);
    vca.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(vca);
    vca.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
    this.playCoinChime();
  }

  public playHit() {
    if (!this.muted && playImpact('swordClash', { intensity: 0.8 })) return;
    if (this.playRandomClip('hit', [
      '/sounds/Sword_clash_01.ogg',
      '/sounds/metal_high_high_01.ogg',
      '/sounds/blunt_high_high_01.ogg',
    ], 0.85)) return;
    this.playHeavyHit(false);
  }

  public playShieldBreak() {
    this.playClip('shield', '/sounds/shield_break_01.ogg', 0.95);
  }

  public playHorseGallop() {
    this.playRandomClip('horse', ['/sounds/horse_gallop_01.ogg', '/sounds/horse_charge_01.ogg'], 0.7);
  }

  public playBattleYell() {
    this.playRandomClip('voice', ['/sounds/man_yell_01.ogg', '/sounds/man_yell_04.ogg'], 0.85);
  }

  public playDecap() {
    this.playClip('decap', '/sounds/decap1.ogg', 0.9);
  }
}

export const sound = new SoundManager();

