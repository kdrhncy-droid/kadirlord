/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · BattleSoundFX.ts
 *  SIFIR harici dosyalı prosedürel savaş sesi motoru (Web Audio API).
 *
 *  ✦ .mp3 / .ogg / .wav YOK. Tüm sesler osilatör + noise buffer + BiquadFilter
 *    + GainNode ADSR zarfları + WaveShaper (brass doygunluğu) + ConvolverNode
 *    (prosedürel impulse response ile "meydan yankısı") ile üretilir.
 *  ✦ 6 efekt: playSwordClash · playShieldBlock · playBowRelease ·
 *    playArrowHit · playHeavyAxeSwing · playBattleHorn
 *  ✦ Polifoni koruması: ses başına maksimum eşzamanlı örnek (voice) sayısı, otomatik
 *    ses çöp toplama (stopped nodes disconnect), master limiter.
 *  ✦ React/TS uyumlu: sınıf örneğini useRef ile tut, ilk kullanıcı
 *    etkileşiminde `unlock()` çağır (tarayıcı autoplay politikası).
 *
 *  KULLANIM:
 *    const sfx = new BattleSoundFX({ masterVolume: 0.85, reverb: 0.35 });
 *    button.addEventListener('pointerdown', () => sfx.unlock());
 *    sfx.playSwordClash({ intensity: 1.2 });
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface BattleSoundOptions {
  /** Mevcut bir AudioContext'i kullan (React/oyun motoru paylaşımlı ses için). */
  context?: AudioContext;
  /** Çıkış hedefi (varsayılan: context.destination). */
  destination?: AudioNode;
  masterVolume?: number;
  /** Prosedürel convolution reverb ıslaklık oranı (0 = kuru). */
  reverb?: number;
  /** Reverb süresi (saniye) — açık meydan / kale içi hissi. */
  reverbSeconds?: number;
  /** Aşırı yüklemeyi önleyen limiter (DynamicsCompressor). */
  limiter?: boolean;
  /** Aynı efektin eşzamanlı maksimum örneği. */
  maxVoicesPerSound?: number;
  /** Global eşzamanlı ses sınırı. */
  maxTotalVoices?: number;
  /** Konsola teşhis bilgisi yaz. */
  debug?: boolean;
}

export interface SoundOptions {
  /** 0..2 arası şiddet (zarf genliği + filtre parlaklığı). */
  intensity?: number;
  /** Stereo konum (-1 sol … +1 sağ). */
  pan?: number;
  /** Frekans çarpanı (1 = normal, 0.5 = bir oktav pes). */
  rate?: number;
  /** Efektin kendi ıslaklık oranı (master reverb ile çarpılır). */
  reverbSend?: number;
  /** Zamanlama: şimdiden itibaren saniye. */
  delay?: number;
}

const DEFAULTS = {
  masterVolume: 0.9,
  reverb: 0.3,
  reverbSeconds: 2.4,
  limiter: true,
  maxVoicesPerSound: 4,
  maxTotalVoices: 28,
};

interface VoiceCount {
  [key: string]: number;
}

export class BattleSoundFX {
  private opts: Required<Omit<BattleSoundOptions, 'context' | 'destination'>> & {
    context?: AudioContext;
    destination?: AudioNode;
  };
  private _ctx: AudioContext | null = null;
  private externalCtx: boolean;
  private master!: GainNode;
  private dryBus!: GainNode;
  private wetBus!: GainNode;
  private convolver!: ConvolverNode;
  private voices: VoiceCount = {};
  private totalVoices = 0;
  private noiseWhite: AudioBuffer | null = null;
  private noisePink: AudioBuffer | null = null;
  private brassCurve: Float32Array<ArrayBuffer> | null = null;
  private debug: boolean;

  constructor(options: BattleSoundOptions = {}) {
    this.opts = {
      context: options.context,
      destination: options.destination,
      masterVolume: options.masterVolume ?? DEFAULTS.masterVolume,
      reverb: options.reverb ?? DEFAULTS.reverb,
      reverbSeconds: options.reverbSeconds ?? DEFAULTS.reverbSeconds,
      limiter: options.limiter ?? DEFAULTS.limiter,
      maxVoicesPerSound: options.maxVoicesPerSound ?? DEFAULTS.maxVoicesPerSound,
      maxTotalVoices: options.maxTotalVoices ?? DEFAULTS.maxTotalVoices,
      debug: options.debug ?? false,
    };
    this.debug = this.opts.debug;
    this.externalCtx = !!options.context;
    if (options.context) {
      this._ctx = options.context;
      this.buildGraph();
    }
  }

  /* ═══════════════════════ genel API ═══════════════════════ */

  /** AudioContext'i oluştur/Devam ettir. Kullanıcı jestinde çağrılmalı. */
  unlock(): Promise<AudioContext | null> {
    const ctx = this.context;
    if (!ctx) return Promise.resolve(null);
    if (ctx.state === 'suspended') return ctx.resume().then(() => ctx).catch(() => ctx);
    return Promise.resolve(ctx);
  }

  get context(): AudioContext | null {
    if (!this._ctx) {
      const Ctor: typeof AudioContext | undefined =
        typeof window !== 'undefined'
          ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!Ctor) {
        if (this.debug) console.warn('[BattleSoundFX] Web Audio API desteklenmiyor.');
        return null;
      }
      try {
        this._ctx = new Ctor({ latencyHint: 'interactive' });
      } catch (err) {
        console.error('[BattleSoundFX] AudioContext oluşturulamadı:', err);
        return null;
      }
      this.buildGraph();
    }
    return this._ctx;
  }

  get ready(): boolean {
    return !!this._ctx && this._ctx.state === 'running';
  }

  setMasterVolume(v: number): void {
    this.opts.masterVolume = clamp01Fx(v);
    if (this._ctx && this.master) this.master.gain.setTargetAtTime(clamp01Fx(v), this._ctx.currentTime, 0.02);
  }

  setReverb(amount: number): void {
    this.opts.reverb = clamp01Fx(amount);
    if (this._ctx && this.wetBus) this.wetBus.gain.setTargetAtTime(clamp01Fx(amount) * 0.9, this._ctx.currentTime, 0.05);
  }

  /** Tüm sesleri sustur ve grafı çöz. */
  dispose(): void {
    try {
      this.convolver?.disconnect();
      this.wetBus?.disconnect();
      this.dryBus?.disconnect();
      this.master?.disconnect();
      if (this._ctx && !this.externalCtx) void this._ctx.close();
    } catch {
      /* yoksay */
    }
    this._ctx = null;
    this.noiseWhite = null;
    this.noisePink = null;
    this.voices = {};
    this.totalVoices = 0;
  }

  /* ═══════════════════════ ses grafı ═══════════════════════ */

  private buildGraph(): void {
    const ctx = this._ctx!;
    const dest = this.opts.destination ?? ctx.destination;

    this.master = ctx.createGain();
    this.master.gain.value = this.opts.masterVolume;

    let tail: AudioNode = this.master;
    if (this.opts.limiter) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -8;
      comp.knee.value = 8;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      this.master.connect(comp);
      tail = comp;
    }
    tail.connect(dest);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1;
    this.dryBus.connect(this.master);

    this.wetBus = ctx.createGain();
    this.wetBus.gain.value = this.opts.reverb * 0.9;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.createImpulseResponse(this.opts.reverbSeconds, 2.6);
    this.wetBus.connect(this.convolver);
    this.convolver.connect(this.master);
  }

  /** Prosedürel impulse response: alçak geçiren gürültü kuyruğu (meydan/kale). */
  private createImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const ctx = this._ctx!;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const white = Math.random() * 2 - 1;
        // tek kutuplu alçak geçiren: uzak yankılar daha koyu
        lp += 0.38 * (white - lp);
        const envelope = Math.pow(1 - t, decay);
        // ilk 8 ms'de erken yansımalar (tok "taş duvar" hissi)
        const early = t < 0.008 ? 1.6 * (1 - t / 0.008) : 0;
        data[i] = lp * envelope * 0.5 + (Math.random() * 2 - 1) * early * 0.35;
      }
    }
    return buf;
  }

  /* ═══════════════════════ yapı taşları ═══════════════════════ */

  /** Beyaz gürültü (2 sn, döngülü kullanıma uygun). */
  private whiteBuffer(): AudioBuffer {
    if (this.noiseWhite) return this.noiseWhite;
    const ctx = this._ctx!;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseWhite = buf;
    return buf;
  }

  /** Pembe gürültü (Voss-McCartney yaklaşımı): rüzgâr, gövde, tok darbe. */
  private pinkBuffer(): AudioBuffer {
    if (this.noisePink) return this.noisePink;
    const ctx = this._ctx!;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    this.noisePink = buf;
    return buf;
  }

  /** Pirinç (brass) doygunluk eğrisi: tanh benzeri yumuşak kırpma + 2. harmonik. */
  private brassShaperCurve(amount = 1): Float32Array<ArrayBuffer> {
    if (this.brassCurve) return this.brassCurve;
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      const drive = 1 + amount * 2.2;
      curve[i] = Math.tanh(x * drive) * 0.82 + Math.sin(x * Math.PI * 2) * 0.06;
    }
    this.brassCurve = curve;
    return curve;
  }

  private now(delay = 0): number {
    return this._ctx!.currentTime + Math.max(0, delay);
  }

  /** Ses başına polifoni kapısı. */
  private acquire(key: string): boolean {
    if (this.totalVoices >= this.opts.maxTotalVoices) return false;
    const cur = this.voices[key] ?? 0;
    if (cur >= this.opts.maxVoicesPerSound) return false;
    this.voices[key] = cur + 1;
    this.totalVoices++;
    return true;
  }

  private release(key: string, node: AudioScheduledSourceNode): void {
    node.onended = () => {
      this.voices[key] = Math.max(0, (this.voices[key] ?? 1) - 1);
      this.totalVoices = Math.max(0, this.totalVoices - 1);
      try {
        node.disconnect();
      } catch {
        /* zaten kopuk */
      }
    };
  }

  /** Efekt çıkış zinciri: gain → [panner] → dry + wet. */
  private makeBus(o: SoundOptions, key: string, node: AudioScheduledSourceNode): GainNode {
    const ctx = this._ctx!;
    const out = ctx.createGain();
    out.gain.value = 1;
    let tail: AudioNode = out;
    if (o.pan !== undefined && o.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clampFx(o.pan, -1, 1);
      out.connect(panner);
      tail = panner;
    }
    tail.connect(this.dryBus);
    const send = o.reverbSend ?? 1;
    if (send > 0 && this.opts.reverb > 0) {
      const wet = ctx.createGain();
      wet.gain.value = clampFx(send, 0, 1);
      tail.connect(wet);
      wet.connect(this.wetBus);
    }
    this.release(key, node);
    return out;
  }

  /**
   * ADSR zarfı (üstel yaklaşımlı, Web Audio'nun üstel rampa kısıtlarına
   * dayanıklı: tüm değerler > 0.0001).
   */
  private envelope(
    param: AudioParam,
    t0: number,
    peak: number,
    a: number,
    d: number,
    s: number,
    r: number,
  ): number {
    const floor = 0.0001;
    const p = Math.max(floor, peak);
    param.cancelScheduledValues(t0);
    param.setValueAtTime(floor, t0);
    param.linearRampToValueAtTime(p, t0 + Math.max(0.0008, a));
    param.exponentialRampToValueAtTime(Math.max(floor, p * s), t0 + a + Math.max(0.005, d));
    const end = t0 + a + d + r;
    param.setValueAtTime(Math.max(floor, p * s), Math.max(t0, end - r));
    param.exponentialRampToValueAtTime(floor, end);
    return end;
  }

  /** Basit üstel sönüm zarfı (vuruş/çınlama katmanları için). */
  private decay(param: AudioParam, t0: number, peak: number, attack: number, seconds: number): number {
    const floor = 0.0001;
    const p = Math.max(floor, peak);
    param.cancelScheduledValues(t0);
    param.setValueAtTime(floor, t0);
    param.linearRampToValueAtTime(p, t0 + Math.max(0.0006, attack));
    param.exponentialRampToValueAtTime(floor, t0 + attack + seconds);
    return t0 + attack + seconds;
  }

  /* ═══════════════════════════════════════════════════════════════════
     1) KILIÇ ÇARPIŞMASI — metalin metale çınlaması
     FM sentez + uyumsuz (inharmonic) metalik kısmiler + bant geçiren gürültü
     ═══════════════════════════════════════════════════════════════════ */
  playSwordClash(options: SoundOptions = {}): void {
    const ctx = this.context;
    if (!ctx || !this.acquire('clash')) return;
    const o = options;
    const t0 = this.now(o.delay ?? 0);
    const I = clampFx(o.intensity ?? 1, 0.1, 2.2);
    const rate = clampFx(o.rate ?? 1, 0.4, 2.5);

    const src = ctx.createConstantSource();
    src.offset.value = 0;
    const bus = this.makeBus({ reverbSend: 0.45, ...o }, 'clash', src);

    // ── geçici vuruş: yüksek frekanslı gürültü patlaması ──
    const noise = ctx.createBufferSource();
    noise.buffer = this.whiteBuffer();
    noise.loop = true;
    noise.playbackRate.value = 1.4 * rate;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600 * rate;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5400 * rate;
    bp.Q.value = 0.8;
    const nGain = ctx.createGain();
    this.decay(nGain.gain, t0, 0.5 * I, 0.001, 0.055);
    noise.connect(hp).connect(bp).connect(nGain).connect(bus);
    noise.start(t0);
    noise.stop(t0 + 0.12);

    // ── FM "çın": modülatör taşıyıcıyı oran dışı vurur → metalik tını ──
    const carrier = ctx.createOscillator();
    carrier.type = 'square';
    carrier.frequency.value = 1720 * rate;
    const modulator = ctx.createOscillator();
    modulator.type = 'triangle';
    modulator.frequency.value = 613 * rate;
    const modGain = ctx.createGain();
    const cGain = ctx.createGain();
    this.decay(modGain.gain, t0, 2400 * I, 0.001, 0.09);
    this.decay(cGain.gain, t0, 0.34 * I, 0.002, 0.5);
    modulator.connect(modGain).connect(carrier.frequency);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.brassShaperCurve(0.45);
    carrier.connect(shaper).connect(cGain).connect(bus);
    carrier.start(t0);
    modulator.start(t0);
    carrier.stop(t0 + 0.7);
    modulator.stop(t0 + 0.7);

    // ── uyumsuz metalik kısmiler (çelik rezonansı) ──
    const partials: [number, number, number, number][] = [
      [1.0, 2437, 0.16, 1.25],
      [1.414, 3452, 0.11, 0.95],
      [1.732, 4188, 0.09, 0.72],
      [2.31, 5612, 0.07, 0.5],
      [2.83, 6890, 0.05, 0.36],
      [3.61, 8780, 0.035, 0.24],
    ];
    let lastEnd = t0;
    for (const [ratio, freq, amp, dur] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * rate;
      osc.detune.value = (Math.random() * 2 - 1) * 14;
      const bp2 = ctx.createBiquadFilter();
      bp2.type = 'bandpass';
      bp2.frequency.value = freq * rate;
      bp2.Q.value = 7 + ratio * 3;
      const g = ctx.createGain();
      lastEnd = Math.max(lastEnd, this.decay(g.gain, t0 + ratio * 0.0016, amp * I, 0.002, dur / (0.8 + ratio * 0.35)));
      osc.connect(bp2).connect(g).connect(bus);
      osc.start(t0);
      osc.stop(lastEnd + 0.05);
    }

    // ── gövde: alçak "tok" vuruş (kılıçların kütlesi) ──
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(320 * rate, t0);
    body.frequency.exponentialRampToValueAtTime(120 * rate, t0 + 0.1);
    const bodyGain = ctx.createGain();
    this.decay(bodyGain.gain, t0, 0.16 * I, 0.002, 0.12);
    body.connect(bodyGain).connect(bus);
    body.start(t0);
    body.stop(t0 + 0.25);

    src.start(t0);
    src.stop(lastEnd + 0.2);
  }

  /* ═══════════════════════════════════════════════════════════════════
     2) KALKAN BLOĞU — tok ahşap/demir gümlemesi, alçak geçiren darbe
     ═══════════════════════════════════════════════════════════════════ */
  playShieldBlock(options: SoundOptions = {}): void {
    const ctx = this.context;
    if (!ctx || !this.acquire('shield')) return;
    const o = options;
    const t0 = this.now(o.delay ?? 0);
    const I = clampFx(o.intensity ?? 1, 0.1, 2.2);
    const rate = clampFx(o.rate ?? 1, 0.4, 2.2);

    const src = ctx.createConstantSource();
    src.offset.value = 0;
    const bus = this.makeBus({ reverbSend: 0.3, ...o }, 'shield', src);

    // ── gövde gümlemesi: süpürülen alçak geçiren + rezonans ──
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(196 * rate, t0);
    thump.frequency.exponentialRampToValueAtTime(58 * rate, t0 + 0.17);
    const thumpGain = ctx.createGain();
    this.decay(thumpGain.gain, t0, 0.85 * I, 0.004, 0.24);
    thump.connect(thumpGain).connect(bus);
    thump.start(t0);
    thump.stop(t0 + 0.45);

    // ── tahta gövde: bant geçiren pembe gürültü ──
    const wood = ctx.createBufferSource();
    wood.buffer = this.pinkBuffer();
    wood.loop = true;
    const woodBp = ctx.createBiquadFilter();
    woodBp.type = 'bandpass';
    woodBp.frequency.setValueAtTime(620 * rate, t0);
    woodBp.frequency.exponentialRampToValueAtTime(230 * rate, t0 + 0.16);
    woodBp.Q.value = 1.5;
    const woodGain = ctx.createGain();
    this.decay(woodGain.gain, t0, 0.5 * I, 0.003, 0.19);
    wood.connect(woodBp).connect(woodGain).connect(bus);
    wood.start(t0);
    wood.stop(t0 + 0.4);

    // ── darbe "tıklaması": kısa alçak geçirenli gürültü ──
    const crack = ctx.createBufferSource();
    crack.buffer = this.whiteBuffer();
    crack.loop = true;
    const crackLp = ctx.createBiquadFilter();
    crackLp.type = 'lowpass';
    crackLp.frequency.setValueAtTime(3400 * rate, t0);
    crackLp.frequency.exponentialRampToValueAtTime(700 * rate, t0 + 0.05);
    crackLp.Q.value = 1.1;
    const crackGain = ctx.createGain();
    this.decay(crackGain.gain, t0, 0.42 * I, 0.001, 0.06);
    crack.connect(crackLp).connect(crackGain).connect(bus);
    crack.start(t0);
    crack.stop(t0 + 0.2);

    // ── demir çember/göbek tınlaması ──
    const ring = ctx.createOscillator();
    ring.type = 'triangle';
    ring.frequency.value = 812 * rate;
    const ringBp = ctx.createBiquadFilter();
    ringBp.type = 'bandpass';
    ringBp.frequency.value = 812 * rate;
    ringBp.Q.value = 9;
    const ringGain = ctx.createGain();
    const endRing = this.decay(ringGain.gain, t0 + 0.004, 0.16 * I, 0.003, 0.55);
    ring.connect(ringBp).connect(ringGain).connect(bus);
    ring.start(t0);
    ring.stop(endRing + 0.05);

    // ── düşük göğüs rezonansı (kalkanın "nefesi") ──
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(96 * rate, t0);
    sub.frequency.exponentialRampToValueAtTime(44 * rate, t0 + 0.3);
    const subGain = ctx.createGain();
    this.decay(subGain.gain, t0, 0.3 * I, 0.006, 0.3);
    sub.connect(subGain).connect(bus);
    sub.start(t0);
    sub.stop(t0 + 0.5);

    src.start(t0);
    src.stop(Math.max(endRing, t0 + 0.6));
  }

  /* ═══════════════════════════════════════════════════════════════════
     3) YAY BIRAKMA — kiriş "twang" + okun havayı yarması (whoosh)
     ═══════════════════════════════════════════════════════════════════ */
  playBowRelease(options: SoundOptions = {}): void {
    const ctx = this.context;
    if (!ctx || !this.acquire('bow')) return;
    const o = options;
    const t0 = this.now(o.delay ?? 0);
    const I = clampFx(o.intensity ?? 1, 0.1, 2.2);
    const rate = clampFx(o.rate ?? 1, 0.4, 2.2);

    const src = ctx.createConstantSource();
    src.offset.value = 0;
    const pan = o.pan ?? 0;
    const bus = this.makeBus({ reverbSend: 0.25, ...o, pan }, 'bow', src);

    // ── kiriş twang'ı: perde düşen testere + bant geçiren + kısa gecikmeli tarak filtresi ──
    const twang = ctx.createOscillator();
    twang.type = 'sawtooth';
    twang.frequency.setValueAtTime(392 * rate, t0);
    twang.frequency.exponentialRampToValueAtTime(148 * rate, t0 + 0.075);
    const twangBp = ctx.createBiquadFilter();
    twangBp.type = 'bandpass';
    twangBp.frequency.setValueAtTime(1750 * rate, t0);
    twangBp.frequency.exponentialRampToValueAtTime(760 * rate, t0 + 0.1);
    twangBp.Q.value = 2.6;
    const twangGain = ctx.createGain();
    this.decay(twangGain.gain, t0, 0.34 * I, 0.002, 0.16);
    twang.connect(twangBp).connect(twangGain);

    // tarak filtresi (comb): kirişin tel rezonansını taklit eder
    const comb = ctx.createDelay(0.05);
    comb.delayTime.value = 1 / (520 * rate);
    const combFb = ctx.createGain();
    combFb.gain.value = 0.42;
    const combLp = ctx.createBiquadFilter();
    combLp.type = 'lowpass';
    combLp.frequency.value = 3200 * rate;
    twangGain.connect(comb);
    comb.connect(combLp).connect(combFb).connect(comb);
    const combOut = ctx.createGain();
    combOut.gain.value = 0.55;
    comb.connect(combOut).connect(bus);
    twangGain.connect(bus);
    twang.start(t0);
    twang.stop(t0 + 0.32);

    // ── whoosh: okun havayı yarması (stereo kayan bant geçiren gürültü) ──
    const t1 = t0 + 0.012;
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.pinkBuffer();
    whoosh.loop = true;
    const wBp = ctx.createBiquadFilter();
    wBp.type = 'bandpass';
    wBp.frequency.setValueAtTime(420 * rate, t1);
    wBp.frequency.exponentialRampToValueAtTime(2600 * rate, t1 + 0.1);
    wBp.frequency.exponentialRampToValueAtTime(680 * rate, t1 + 0.3);
    wBp.Q.value = 1.5;
    const wGain = ctx.createGain();
    wGain.gain.setValueAtTime(0.0001, t1);
    wGain.gain.linearRampToValueAtTime(0.4 * I, t1 + 0.035);
    wGain.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.34);
    whoosh.connect(wBp).connect(wGain);

    if (typeof ctx.createStereoPanner === 'function') {
      const mover = ctx.createStereoPanner();
      mover.pan.setValueAtTime(clampFx(pan - 0.75, -1, 1), t1);
      mover.pan.linearRampToValueAtTime(clampFx(pan + 0.75, -1, 1), t1 + 0.3);
      wGain.connect(mover).connect(bus);
    } else {
      wGain.connect(bus);
    }
    whoosh.start(t1);
    whoosh.stop(t1 + 0.4);

    // ── gövde "ahşap gıcırtısı" (yay gövdesinin esnemesi) ──
    const creak = ctx.createOscillator();
    creak.type = 'triangle';
    creak.frequency.setValueAtTime(210 * rate, t0);
    creak.frequency.exponentialRampToValueAtTime(120 * rate, t0 + 0.09);
    const creakGain = ctx.createGain();
    this.decay(creakGain.gain, t0, 0.1 * I, 0.003, 0.1);
    creak.connect(creakGain).connect(bus);
    creak.start(t0);
    creak.stop(t0 + 0.2);

    src.start(t0);
    src.stop(t1 + 0.45);
  }

  /* ═══════════════════════════════════════════════════════════════════
     4) OK İSABETİ — kısa tok darbe (hedefe/kalkana saplanma)
     ═══════════════════════════════════════════════════════════════════ */
  playArrowHit(options: SoundOptions = {}): void {
    const ctx = this.context;
    if (!ctx || !this.acquire('arrowHit')) return;
    const o = options;
    const t0 = this.now(o.delay ?? 0);
    const I = clampFx(o.intensity ?? 1, 0.1, 2.2);
    const rate = clampFx(o.rate ?? 1, 0.4, 2.2);

    const src = ctx.createConstantSource();
    src.offset.value = 0;
    const bus = this.makeBus({ reverbSend: 0.22, ...o }, 'arrowHit', src);

    // ── "thock": perde düşen üçgen dalga (ahşaba saplanma) ──
    const thock = ctx.createOscillator();
    thock.type = 'triangle';
    thock.frequency.setValueAtTime(280 * rate, t0);
    thock.frequency.exponentialRampToValueAtTime(76 * rate, t0 + 0.075);
    const thockGain = ctx.createGain();
    this.decay(thockGain.gain, t0, 0.6 * I, 0.001, 0.1);
    thock.connect(thockGain).connect(bus);
    thock.start(t0);
    thock.stop(t0 + 0.2);

    // ── darbe gürültüsü: kısa, alçak geçirenli ──
    const noise = ctx.createBufferSource();
    noise.buffer = this.whiteBuffer();
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2900 * rate, t0);
    lp.frequency.exponentialRampToValueAtTime(460 * rate, t0 + 0.055);
    const nGain = ctx.createGain();
    this.decay(nGain.gain, t0, 0.4 * I, 0.001, 0.075);
    noise.connect(lp).connect(nGain).connect(bus);
    noise.start(t0);
    noise.stop(t0 + 0.16);

    // ── kıymık/titreşim: saplanan okun gövde titreşimi ──
    const splinter = ctx.createBufferSource();
    splinter.buffer = this.whiteBuffer();
    splinter.loop = true;
    splinter.playbackRate.value = 1.6;
    const sBp = ctx.createBiquadFilter();
    sBp.type = 'bandpass';
    sBp.frequency.setValueAtTime(3200 * rate, t0 + 0.02);
    sBp.frequency.exponentialRampToValueAtTime(1500 * rate, t0 + 0.14);
    sBp.Q.value = 4;
    const sGain = ctx.createGain();
    this.decay(sGain.gain, t0 + 0.018, 0.14 * I, 0.006, 0.13);
    splinter.connect(sBp).connect(sGain).connect(bus);
    splinter.start(t0 + 0.018);
    splinter.stop(t0 + 0.25);

    // ── zırh/kalkan ise metalik tını katmanı ──
    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.value = 2180 * rate;
    const pingGain = ctx.createGain();
    const endPing = this.decay(pingGain.gain, t0 + 0.003, 0.07 * I, 0.002, 0.28);
    ping.connect(pingGain).connect(bus);
    ping.start(t0);
    ping.stop(endPing + 0.05);

    src.start(t0);
    src.stop(Math.max(endPing, t0 + 0.3));
  }

  /* ═══════════════════════════════════════════════════════════════════
     5) AĞIR BALTA SAVURMA — uzun, süpürülen whoosh + hafif metal uğultu
     ═══════════════════════════════════════════════════════════════════ */
  playHeavyAxeSwing(options: SoundOptions = {}): void {
    const ctx = this.context;
    if (!ctx || !this.acquire('axeSwing')) return;
    const o = options;
    const t0 = this.now(o.delay ?? 0);
    const I = clampFx(o.intensity ?? 1, 0.1, 2.2);
    const rate = clampFx(o.rate ?? 1, 0.4, 2);
    const dur = 0.52;

    const src = ctx.createConstantSource();
    src.offset.value = 0;
    const pan = o.pan ?? -0.25;
    const bus = this.makeBus({ reverbSend: 0.2, ...o, pan }, 'axeSwing', src);

    // ── ana whoosh: pembe gürültü + süpürülen alçak geçiren ──
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.pinkBuffer();
    whoosh.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260 * rate, t0);
    lp.frequency.exponentialRampToValueAtTime(1500 * rate, t0 + dur * 0.55);
    lp.frequency.exponentialRampToValueAtTime(340 * rate, t0 + dur);
    lp.Q.value = 1.1;
    const wGain = ctx.createGain();
    wGain.gain.setValueAtTime(0.0001, t0);
    wGain.gain.linearRampToValueAtTime(0.55 * I, t0 + dur * 0.5);
    wGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 1.15);
    whoosh.connect(lp).connect(wGain);

    // ── rezonant bant: savurma yayının "ıslığı" ──
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(320 * rate, t0);
    bp.frequency.exponentialRampToValueAtTime(1950 * rate, t0 + dur * 0.62);
    bp.frequency.exponentialRampToValueAtTime(520 * rate, t0 + dur);
    bp.Q.value = 2.4;
    const bpGain = ctx.createGain();
    bpGain.gain.setValueAtTime(0.0001, t0);
    bpGain.gain.linearRampToValueAtTime(0.34 * I, t0 + dur * 0.55);
    bpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 1.1);
    whoosh.connect(bp).connect(bpGain);

    // stereo hareket: balta bir yandan öbürüne geçer
    if (typeof ctx.createStereoPanner === 'function') {
      const mover = ctx.createStereoPanner();
      mover.pan.setValueAtTime(clampFx(pan - 0.6, -1, 1), t0);
      mover.pan.linearRampToValueAtTime(clampFx(pan + 0.65, -1, 1), t0 + dur * 0.85);
      mover.pan.linearRampToValueAtTime(clampFx(pan + 0.2, -1, 1), t0 + dur * 1.15);
      wGain.connect(mover);
      bpGain.connect(mover);
      mover.connect(bus);
    } else {
      wGain.connect(bus);
      bpGain.connect(bus);
    }
    whoosh.start(t0);
    whoosh.stop(t0 + dur * 1.3);

    // ── sap gıcırtısı (ahşap esneme) ──
    const creak = ctx.createOscillator();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(128 * rate, t0);
    creak.frequency.linearRampToValueAtTime(92 * rate, t0 + dur * 0.8);
    const creakLp = ctx.createBiquadFilter();
    creakLp.type = 'lowpass';
    creakLp.frequency.value = 460 * rate;
    const creakGain = ctx.createGain();
    creakGain.gain.setValueAtTime(0.0001, t0);
    creakGain.gain.linearRampToValueAtTime(0.09 * I, t0 + dur * 0.4);
    creakGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    creak.connect(creakLp).connect(creakGain).connect(bus);
    creak.start(t0);
    creak.stop(t0 + dur * 1.1);

    // ── balta başının metal uğultusu (savurma sonunda parlar) ──
    const metal = ctx.createOscillator();
    metal.type = 'square';
    metal.frequency.value = 486 * rate;
    const metalBp = ctx.createBiquadFilter();
    metalBp.type = 'bandpass';
    metalBp.frequency.value = 1750 * rate;
    metalBp.Q.value = 5;
    const metalGain = ctx.createGain();
    const endMetal = this.decay(metalGain.gain, t0 + dur * 0.72, 0.09 * I, 0.006, 0.3);
    metal.connect(metalBp).connect(metalGain).connect(bus);
    metal.start(t0 + dur * 0.7);
    metal.stop(endMetal + 0.05);

    src.start(t0);
    src.stop(Math.max(endMetal, t0 + dur * 1.3) + 0.1);
  }

  /* ═══════════════════════════════════════════════════════════════════
     6) SAVAŞ BORAZANI — derin, epik orta çağ borazanı
     testere dalgası + pirinç armonikleri + vibrato + prosedürel reverb + eko
     ═══════════════════════════════════════════════════════════════════ */
  playBattleHorn(options: SoundOptions & { note?: number; pattern?: number[] } = {}): void {
    const ctx = this.context;
    if (!ctx || !this.acquire('horn')) return;
    const o = options;
    const t0 = this.now(o.delay ?? 0);
    const I = clampFx(o.intensity ?? 1, 0.2, 2);
    const rate = clampFx(o.rate ?? 1, 0.5, 2);
    // Re (D) temelli heroik motif: kök → dördüncü → kök (oktav aşağı kapanış)
    const base = (o.note ?? 73.42) * rate; // D2
    const pattern = o.pattern ?? [1, 1.5, 1, 0.75];
    const noteDur = [0.55, 0.5, 0.75, 1.15];

    const src = ctx.createConstantSource();
    src.offset.value = 0;
    const bus = this.makeBus({ reverbSend: 1.35, ...o }, 'horn', src);

    // ── eko (geri beslemeli gecikme): açık meydanda yankılanan borazan ──
    const echo = ctx.createDelay(1.2);
    echo.delayTime.value = 0.34;
    const echoFb = ctx.createGain();
    echoFb.gain.value = 0.34;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 1400;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.4;
    bus.connect(echo);
    echo.connect(echoLp).connect(echoFb).connect(echo);
    echo.connect(echoOut).connect(this.dryBus);

    // ── üfleme gürültüsü (borunun hava sütunu) ──
    const breath = ctx.createBufferSource();
    breath.buffer = this.pinkBuffer();
    breath.loop = true;
    const breathBp = ctx.createBiquadFilter();
    breathBp.type = 'bandpass';
    breathBp.frequency.value = 520 * rate;
    breathBp.Q.value = 0.7;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.0001;
    breath.connect(breathBp).connect(breathGain).connect(bus);
    breath.start(t0);

    // ── vibrato LFO ──
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.1;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0.1, t0);
    vibDepth.gain.linearRampToValueAtTime(9.5, t0 + 1.1);
    vib.connect(vibDepth);
    vib.start(t0);

    let cursor = t0;
    let lastEnd = t0;
    const layers: OscillatorNode[] = [];

    for (let n = 0; n < pattern.length; n++) {
      const freq = base * pattern[n];
      const dur = noteDur[n] ?? 0.7;
      const tNote = cursor;

      // ana boru sesi: iki detune testere (koro hissi)
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * 0.985, tNote);
        osc.frequency.linearRampToValueAtTime(freq, tNote + 0.1);
        osc.detune.value = detune;
        vibDepth.connect(osc.detune);
        layers.push(osc);
        osc.start(tNote);
        osc.stop(tNote + dur + 0.5);
      }
      // oktav üstü (parlaklık)
      const oct = ctx.createOscillator();
      oct.type = 'sawtooth';
      oct.frequency.setValueAtTime(freq * 2 * 0.99, tNote);
      oct.frequency.linearRampToValueAtTime(freq * 2, tNote + 0.12);
      layers.push(oct);
      oct.start(tNote);
      oct.stop(tNote + dur + 0.4);
      // beşli (brass dolgusu)
      const fifth = ctx.createOscillator();
      fifth.type = 'triangle';
      fifth.frequency.value = freq * 1.5;
      layers.push(fifth);
      fifth.start(tNote);
      fifth.stop(tNote + dur + 0.4);

      cursor = tNote + dur;
      lastEnd = Math.max(lastEnd, cursor + 0.5);
    }

    // ── ortak pirinç zinciri: waveshaper → alçak geçiren → zarf ──
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.brassShaperCurve(1);
    shaper.oversample = '2x';
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(420 * rate, t0);
    tone.frequency.linearRampToValueAtTime(1250 * rate, t0 + 0.35);
    tone.frequency.setValueAtTime(1250 * rate, lastEnd - 0.6);
    tone.frequency.linearRampToValueAtTime(520 * rate, lastEnd);
    tone.Q.value = 0.9;
    const hornGain = ctx.createGain();
    hornGain.gain.setValueAtTime(0.0001, t0);
    hornGain.gain.linearRampToValueAtTime(0.42 * I, t0 + 0.14);
    hornGain.gain.setValueAtTime(0.4 * I, lastEnd - 0.42);
    hornGain.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.35);

    for (const l of layers) l.connect(shaper);
    shaper.connect(tone).connect(hornGain).connect(bus);

    // üfleme zarfı
    breathGain.gain.setValueAtTime(0.0001, t0);
    breathGain.gain.linearRampToValueAtTime(0.2 * I, t0 + 0.09);
    breathGain.gain.setValueAtTime(0.16 * I, lastEnd - 0.4);
    breathGain.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.3);
    breath.stop(lastEnd + 0.4);

    // ── alt oktav gövde (borunun "göğsü") ──
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = base * 0.5;
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, t0);
    subGain.gain.linearRampToValueAtTime(0.22 * I, t0 + 0.25);
    subGain.gain.exponentialRampToValueAtTime(0.0001, lastEnd + 0.3);
    sub.connect(subGain).connect(bus);
    sub.start(t0);
    sub.stop(lastEnd + 0.4);

    vib.stop(lastEnd + 0.5);
    src.start(t0);
    src.stop(lastEnd + 0.9);
  }

  /* ═══════════════════════ yardımcı: toplu çalma ═══════════════════════ */

  /** Aynı efekti hafif rastgele varyasyonlarla N kez çalar (kalabalık dövüş). */
  playCrowdClash(count: number, spread = 0.18): void {
    for (let i = 0; i < count; i++) {
      this.playSwordClash({
        delay: Math.random() * spread,
        intensity: 0.5 + Math.random() * 0.7,
        pan: Math.random() * 2 - 1,
        rate: 0.9 + Math.random() * 0.25,
        reverbSend: 0.5,
      });
    }
  }

  /** Efekt adıyla çalma (UI butonları / oyun olayları için). */
  play(name: string, options: SoundOptions = {}): void {
    switch (name) {
      case 'swordClash': return this.playSwordClash(options);
      case 'shieldBlock': return this.playShieldBlock(options);
      case 'bowRelease': return this.playBowRelease(options);
      case 'arrowHit': return this.playArrowHit(options);
      case 'heavyAxeSwing': return this.playHeavyAxeSwing(options);
      case 'battleHorn': return this.playBattleHorn(options);
      default:
        if (this.debug) console.warn(`[BattleSoundFX] bilinmeyen efekt: ${name}`);
    }
  }

  /** Eşzamanlı ses durumu (HUD/telemetri). */
  getVoiceInfo(): { perSound: VoiceCount; total: number; state: string } {
    return { perSound: { ...this.voices }, total: this.totalVoices, state: this._ctx?.state ?? 'none' };
  }
}

/* ─────────────────────────── küçük yardımcılar ─────────────────────────── */

function clampFx(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01Fx(v: number): number {
  return clampFx(v, 0, 1);
}
