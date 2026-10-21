/**
 * probe-dialogue-sound.ts — Faz 6d: diyalog ses efektleri
 *
 *   npx tsx scripts/probe-dialogue-sound.ts
 *
 * Tarayıcı yok; `window.AudioContext` yerine küçük bir sahte (fake) bağlam
 * kurulur ve her sesin **gerçekten osilatör kurduğunu, kazancı 0'a indirdiğini
 * ve durdurduğunu** ölçer. Böylece "ses çıkıyor mu, sızıntı var mı" test
 * edilebilir.
 */
type Osc = {
  type: string;
  frequency: { setValueAtTime: (v: number, t: number) => void; exponentialRampToValueAtTime: (v: number, t: number) => void; linearRampToValueAtTime: (v: number, t: number) => void };
  connect: (n: unknown) => void;
  start: (t: number) => void;
  stop: (t: number) => void;
};

class FakeCtx {
  currentTime = 0;
  state = 'running';
  destination = { name: 'dest' };
  oscs: Osc[] = [];
  gains: { peak: number; rampsToZero: boolean }[] = [];
  createOscillator(): Osc {
    const o: Osc = {
      type: 'sine',
      frequency: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
    this.oscs.push(o);
    return o;
  }
  createGain() {
    const rec = { peak: 0, rampsToZero: false };
    this.gains.push(rec);
    return {
      gain: {
        setValueAtTime: (v: number) => {
          rec.peak = Math.max(rec.peak, v);
        },
        exponentialRampToValueAtTime: (v: number) => {
          if (v <= 0.001) rec.rampsToZero = true;
        },
        linearRampToValueAtTime: () => {},
      },
      connect: () => {},
    };
  }
  resume() {
    return Promise.resolve();
  }
}

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const ctx = new FakeCtx();
(globalThis as unknown as { window: unknown }).window = {
  AudioContext: function () {
    return ctx;
  },
};

const { sound } = await import('../src/game/sound.ts');

const run = (fn: () => void, expectedOsc: number) => {
  ctx.oscs = [];
  ctx.gains = [];
  fn();
  return { osc: ctx.oscs.length, gains: ctx.gains };
};

/* ── açılış ── */
{
  const r = run(() => sound.playDialogueOpen(), 2);
  ok(r.osc === 2, 'diyalog açılışı 2 ton çalıyor', `${r.osc} osilatör`);
  ok(r.gains.every((g) => g.peak <= 0.12), 'açılış sesi kısık (≤ 0.12)');
  ok(r.gains.every((g) => g.rampsToZero), 'açılış sesi sıfıra iniyor (sızıntı yok)');
}

/* ── kapanış ── */
{
  const r = run(() => sound.playDialogueClose(), 1);
  ok(r.osc === 1, 'kapanış tek ton');
  ok(r.gains.every((g) => g.rampsToZero), 'kapanış sesi sıfıra iniyor');
}

/* ── seçim: nötr / kabul / ret ── */
for (const [tone, expected] of [
  ['neutral', 2],
  ['good', 2],
  ['bad', 2],
] as const) {
  const r = run(() => sound.playDialogueChoice(tone), expected);
  ok(r.osc === expected, `seçim sesi (${tone}) iki nota`, `${r.osc}`);
  ok(r.gains.every((g) => g.peak <= 0.09), `seçim sesi (${tone}) kısık`);
  ok(r.gains.every((g) => g.rampsToZero), `seçim sesi (${tone}) sıfıra iniyor`);
}

/* ── metin tıkı ── */
{
  const r = run(() => sound.playDialogueBlip(), 1);
  ok(r.osc === 1, 'metin tıkı tek osilatör');
  ok(r.gains.every((g) => g.peak <= 0.04), 'metin tıkı çok hafif (≤ 0.04)');
}

/* ── anlaşma ── */
{
  const r = run(() => sound.playAgreement(), 3);
  ok(r.osc === 3, 'anlaşma sesi = yükselen ton + para çınlaması (2)', `${r.osc}`);
  ok(r.gains.every((g) => g.rampsToZero), 'anlaşma sesi sıfıra iniyor');
}

/* ── sessize alma ── */
{
  sound.toggleMute();
  const r = run(() => sound.playDialogueChoice('good'), 0);
  ok(r.osc === 0, 'sessizde hiç ses üretilmiyor');
  sound.toggleMute();
  const r2 = run(() => sound.playDialogueChoice('good'), 2);
  ok(r2.osc === 2, 'sessizden çıkınca ses geri geliyor');
}

/* ── süre: hiçbir ses 0.5 sn'yi geçmiyor (diyalog metnini maskelemesin) ── */
{
  const starts: number[] = [];
  const stops: number[] = [];
  const origCreate = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => {
    const o = origCreate();
    o.start = (t: number) => starts.push(t);
    o.stop = (t: number) => stops.push(t);
    return o;
  };
  sound.playDialogueChoice('bad');
  sound.playDialogueOpen();
  const maxDur = Math.max(...starts.map((s, i) => stops[i] - s));
  ok(maxDur <= 0.5, 'diyalog sesleri kısa (≤ 0.5 sn)', `en uzun ${maxDur.toFixed(2)} sn`);
  ctx.createOscillator = origCreate;
}

console.log(fails === 0 ? '\n✅ DİYALOG SESLERİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
