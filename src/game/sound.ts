import { playImpact, setArmorySoundEnabled, unlockArmorySound, armorySoundEnabled } from './armorySound.ts';

// Procedural Web Audio Synthesizer for Sancak-ı Kalradya
class SoundManager {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
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

  public toggleMute(): boolean {
    this.muted = !this.muted;
    setArmorySoundEnabled(!this.muted && armorySoundEnabled());
    return this.muted;
  }

  /** İlk kullanıcı jestinde çağrılır — tarayıcı autoplay kilidini açar. */
  public unlock(): void {
    unlockArmorySound();
  }

  public playSwordSwing() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitchVar = 0.92 + Math.random() * 0.16;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(95 * pitchVar, now + 0.14);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
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

    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playWarhorn() {
    // BannerForge: 3 katmanlı pirinç savaş borusu + meydan yankısı
    if (!this.muted && playImpact('battleHorn', { intensity: 1.15 })) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(146.8, now + 0.25);
    osc.frequency.setValueAtTime(146.8, now + 0.65);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.88);
  }

  public playBowShot() {
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

  public playShieldHit() {
    if (!this.muted && playImpact('shieldBlock', { intensity: 1 })) return;
    this.playHeavyHit(true);
  }

  public playArrowFly() {
    if (!this.muted && playImpact('bowRelease', { intensity: 0.9 })) return;
    this.playBowShot();
  }

  public playClang() {
    if (!this.muted && playImpact('swordClash', { intensity: 1.1 })) return;
    this.playHeavyHit(true);
  }

  /** Kılıç çınlaması (metal–metal). */
  public playSwordClash() {
    if (!this.muted && playImpact('swordClash', { intensity: 1.2 })) return;
    this.playHeavyHit(true);
  }

  /** Ağır balta/2H savurma ıslığı. */
  public playHeavySwing() {
    if (!this.muted && playImpact('heavyAxeSwing', { intensity: 1.1 })) return;
    this.playSwordSwing();
  }

  /** Ok gövdeye/kalkana saplandı. */
  public playArrowImpact() {
    if (!this.muted && playImpact('arrowHit', { intensity: 1 })) return;
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
    this.playHeavyHit(false);
  }
}

export const sound = new SoundManager();

