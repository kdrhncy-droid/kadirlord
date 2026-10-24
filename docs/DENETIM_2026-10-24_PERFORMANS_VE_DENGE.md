# PERFORMANS & DENGE DENETİMİ — 2026-10-24

Ölçüm araçları: `tools/e2e/perf-check.mjs` (Karede süresi + uzun görev + heap,
headless SwiftShader — mutlak FPS değil görece maliyet), `scripts/probe-balance.ts`
(savaş matrisi + ekonomi + ilerleme + 120 günlük dünya simülasyonu),
grep'le kaynak denetimi.

## Performans

| Sahne | p95 Karede | uzun görev ≥50ms (en uzun) | heap |
|---|---|---|---|
| Harita (varsayılan uzaklık) | 17 ms | az | 73 MB |
| Harita (yakın zum) | 94–126 ms | 0 | — |
| Küçük savaş (~26 aktör) | 633–900 ms | 4–5 (~1 sn) | — |
| Büyük konuşlanma (200 aktör) | ~1050 ms | 25→17 (1477→659 ms) | 73→65 MB |
| Büyük savaş | ~950 ms | 19→13 | — |

Yakın zum düşüşünde uzun görev 0 → maliyet JS değil, çizim (gölge/ekran kapsama).
Savaş tarafında risk: 200 aktör × ~25 geometri + 5–7 malzeme (yaklaşık 5000 GPU
arabelleği + ~1200 malzeme programı).

**Yapılanlar:**
- `createWarriorModel` geometri (19+ yapıcı) ve malzeme (çelik/deri/altın/yün +
  fraksiyon kumaşı) modül seviyesi paylaşıma geçti; `armorMat` vuruş parlaması için
  aktör bazlı kaldı. Sahne kuruluş sivrilikleri ve bellek ölçülebilir düştü (yukarıda).
- BattlefieldView temizliği artık malzemeleri de dispose ediyor.
- Paket ~2,0 MB tek chunk (gzip ~500 KB tahmin) — kod bölme ertelendi (şu an ağrı
  yaratmıyor; Three.js ayrımı istenirse tek satır).

**Asıl düzeltme = B6(c) instancing**: paylaşımlı geometri draw-call sayısını
düşürmez; gerçek makinede büyük savaş FPS'ini asıl iyileştiren
`instancedArmyRenderer` entegrasyonu olacak. Yakın zumda gölge haritası
boyutu/kademesi de ayrıca bakılacak.

Genel sağlık: WorldCanvas'ta tam-canlı simülasyon YOK (simülasyon kare başına
sınırlandırılmış kontroller; olay kuyruğu 80/kuşatma 20 kapaklı, token 672 kapaklı),
kapanmayan rAF/listener bulunmadı (BattlefieldView + WorldCanvas temizlikleri tam).

## Denge

**Sınıf matrisi** (`classStats` + `computeMeleeDamage`): süvari her sınıfı
3–4 vuruşta (4–5,5 sn) öldürüyor; piyade süvariyi 9 vuruş/12 sn'de alıyor; okçu
piyadeden biraz hızlı (5,2 > 5,0) — menzili koşarak koruyan okçu piyade
tarafından yakalanamaz; menzilli hasar ıskalamasız. Sonuç: süvari meta'sı +
kite riski. İlaç = B6(a) (mermi + isabet + cephane) ve B6(d) at canı; stat
çıpasını ayrıca B6 içinde gözden geçirmek.

**Ekonomi:** erken oyun akıcı (17 asker ~89 dinar/gün; 8 düşenli zafer 296 dinar).
Maaş `troopStacks` kademesinden bağımsızdı → **düzeltildi**: `calculatePartyDailyWage`
yığın tanım ücretlerini kullanır (yığınsız kayıtta sınıf ücreti). HUD da aynı
fonksiyonu gösterir. Doğrulama notu: elit kadro artık pahalı; "geç oyuna kadar
elit ordu bedava" açığı kapandı.

**İlerleme:** nam eşikleri (0/50/150/350/900/2350) ve parti bonusları düzgün;
2000 nam Kademe 4'te durması tasarım (2350 eşik sonrası Kademe 5 tanımsız).

**Dünya (120 gün sim):** kanıt — şehir/kale dağılımı 0/30/60/120. günlerde
AYNI; 309 savaş olayı, kuşatma anan 5 olay, fetih 0. Harita fetih ekseninde
donuk: lord partileri (medyan 32, max ~63) garnizon+milis savunma ağırlığına
(~99) karşı hiç kale alamıyor. İlaç: AI-toplu sefer ordusu (army) kavramı —
ayrı büyük madde (bkz. DÜNYA-SİM).

**Doğrulanan temiz noktalar:** kademe bazlı maaş tanımları mevcut ve artık
kullanılıyor; karnaval statik sıcak yolda new Vector3/thread yok (tmp
nesneleri); kuşatma/normal savaş ganimet ölçekleri sağlıklı.
