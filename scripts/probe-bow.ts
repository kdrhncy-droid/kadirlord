/**
 * probe-bow.ts — yay nişan/bırakma regresyon testi (tarayıcısız)
 *
 *   npx tsx scripts/probe-bow.ts
 *
 * Kısa tık → atış yok, uzun basış → atış var, basılı tutunca çekiş dolu kalıyor mu?
 */
import { createCharacterRig } from '../src/game/characterRig.ts';
import { CharacterAnimator, BOW_MIN_RELEASE_DRAW } from '../src/game/characterAnimator.ts';

const rig = createCharacterRig({ weaponType: 'BOW', shieldType: 'NONE', helmetType: 'NONE', armorTier: 'CIVILIAN' } as any);
const anim = new CharacterAnimator(rig);
const events: string[] = [];
anim.onEvent = (e, clip) => events.push(`${e}:${clip}`);

let fails = 0;
function run(label: string, holdMs: number, expectShot: boolean) {
  events.length = 0;
  anim.reset();
  anim.update(1 / 60);
  anim.play('bow_draw', { hold: true });
  const steps = Math.round((holdMs / 1000) * 60);
  const drawSamples: number[] = [];
  for (let i = 0; i < steps; i++) {
    anim.update(1 / 60);
    drawSamples.push(anim.getBowDrawProgress());
  }
  const drawAtRelease = anim.getBowDrawProgress();
  anim.release();
  for (let i = 0; i < 60; i++) anim.update(1 / 60);
  const fired = events.includes('release:bow_release');
  const ok = fired === expectShot;
  if (!ok) fails++;
  console.log(
    `${ok ? '✓' : '✗'} ${label.padEnd(22)} bırakma doluluğu ${drawAtRelease.toFixed(2)} ` +
    `(eşik ${BOW_MIN_RELEASE_DRAW}) → ${fired ? 'OK ATILDI' : 'atış yok'} | beklenti ${expectShot ? 'atış' : 'atış yok'}`,
  );
  return { drawAtRelease, drawSamples };
}

const hold = run('basılı tut (1.4 sn)', 1400, true);
run('orta basış (0.5 sn)', 500, true);
run('çok kısa tık (0.1 sn)', 100, false);
run('anlık tık (0.03 sn)', 30, false);

// Basılı tutunca çekiş DOLU kalıyor mu? (eski hata: 0.7 sn sonra sıfırlanıyordu)
const settled = hold.drawSamples.slice(-20);
const stayedFull = settled.every((v) => v > 0.95);
console.log(`${stayedFull ? '✓' : '✗'} basılı tutunca çekiş dolu kalıyor (son değerler ${settled.slice(-3).map((v) => v.toFixed(2)).join(', ')})`);
if (!stayedFull) fails++;

// Sağ tık / iptal: çekiş iptal edilince atış olmamalı
events.length = 0;
anim.reset();
anim.update(1 / 60);
anim.play('bow_draw', { hold: true });
for (let i = 0; i < 60; i++) anim.update(1 / 60);
anim.cancelBowDraw();
for (let i = 0; i < 40; i++) anim.update(1 / 60);
const cancelled = !events.includes('release:bow_release');
console.log(`${cancelled ? '✓' : '✗'} iptal edilen nişan ok fırlatmıyor`);
if (!cancelled) fails++;

console.log(fails === 0 ? '\n✅ YAY DAVRANIŞI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
