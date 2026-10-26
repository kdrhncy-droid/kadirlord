/**
 * notables.ts — Faz B0: yerleşim ileri gelenleri (notables).
 *
 * Bannerlord'da her kasabanın/köyün **kendi** ileri gelenleri vardır; her birinin
 * bir mesleği, gücü (power), oyuncuya karşı ilişkisi ve kendine ait bir repliği
 * bulunur. Bu modül onları **veriye** taşır: önceden `SettlementModal.tsx` içinde
 * sabit yazılmış 5 kişi her imparatorluk kasabasında aynı kişilerdi.
 *
 * Tasarım kuralları:
 *  - **Deterministik:** tohum `hashString(settlement.id) ^ worldSeed`. Aynı sefer +
 *    aynı yerleşim → hep aynı ileri gelenler. `Math.random()` yok.
 *  - **Saf:** yerleşim nesnesi değiştirilmez; yeni dizi döner.
 *  - **Kültüre duyarlı:** isim havuzları kültür başına ayrı (Vlandia, Battania,
 *    Sturgia, Khuzait, Aserai, İmparatorluk); haydut yerleşimlerinde haydut adları.
 *  - **Veri, React değil:** ikonlar anahtar olarak tutulur (`avatarIcon`), bileşen
 *    eşlemesi arayüzde yapılır.
 */
import { type FactionId, type Settlement } from './rules';
import { hashString, mulberry32, pick, randInt } from './rng';

export type NotableRole =
  | 'ruler'
  | 'commander'
  | 'merchant'
  | 'tavernkeeper'
  | 'gladiator'
  | 'smith'
  | 'horseTrader'
  | 'warden'
  | 'elder'
  | 'headman';

export type NotableIconKey =
  | 'crown'
  | 'landmark'
  | 'shield'
  | 'coins'
  | 'beer'
  | 'swords'
  | 'castle'
  | 'lock'
  | 'wheat'
  | 'hammer'
  | 'cart';

export interface SettlementNotable {
  /** `<settlementId>:<role>` — kayıt yüklendiğinde de aynı kalır. */
  id: string;
  name: string;
  title: string;
  role: NotableRole;
  avatarIcon: NotableIconKey;
  /** 0..100 — şehirdeki nüfuzu (seçim/görev/ganimet için ileride kullanılır). */
  power: number;
  /** -100..100 — oyuncuya karşı ilişki. */
  relation: number;
  /** Oyuncuyla konuştuğunda söylediği replik. */
  speech: string;
}

/** Bannerlord eşraf güç bantları: Etkili ≥100, Güçlü ≥200 (tek kaynak). */
export const NOTABLE_POWER_INFLUENTIAL = 100;
export const NOTABLE_POWER_POWERFUL = 200;

export function notablePowerLabel(power: number): string {
  if (power >= NOTABLE_POWER_POWERFUL) return 'Güçlü';
  if (power >= NOTABLE_POWER_INFLUENTIAL) return 'Etkili';
  return 'Sıradan';
}

/* ───────────────────────── isim havuzları ───────────────────────── */

const NAMES: Record<FactionId, readonly string[]> = {
  empire: [
    'Valerius', 'Cassius', 'Aurelia', 'Belisarios', 'Orestes', 'Lysander', 'Helena',
    'Marcellus', 'Theodora', 'Nikephoros', 'Irene', 'Justinian', 'Sofia', 'Andronikos',
  ],
  vlandia: [
    'Godric', 'Anselm', 'Bertrand', 'Osric', 'Adelheid', 'Mathilde', 'Roland', 'Wilhem',
    'Guiscard', 'Isabeau', 'Baldwin', 'Eleonore', 'Renaud', 'Sibylla',
  ],
  battania: [
    'Cadog', 'Brenin', 'Aeron', 'Gwydion', 'Rhiannon', 'Branwen', 'Tegan', 'Cadeyrn',
    'Eluned', 'Maelgwn', 'Owain', 'Ceridwen', 'Tudwal', 'Arianwen',
  ],
  sturgia: [
    'Vask', 'Boris', 'Yaroslav', 'Svetlana', 'Dmitri', 'Ingrid', 'Oleg', 'Mstislav',
    'Rurik', 'Katya', 'Vladislav', 'Anya', 'Svyatoslav', 'Milena',
  ],
  khuzait: [
    'Temur', 'Bortai', 'Chagatai', 'Altani', 'Subutai', 'Khulan', 'Naran', 'Jamukha',
    'Altan', 'Sarnai', 'Yesugei', 'Ogtul', 'Baraq', 'Tumen',
  ],
  aserai: [
    'Harun', 'Ziyad', 'Layla', 'Faris', 'Nadira', 'Tariq', 'Samir', 'Aisha', 'Yazid',
    'Zahra', 'Ibrahim', 'Salma', 'Khalid', 'Maryam',
  ],
  bandits: [
    'Kara', 'Gökçe', 'Kırbaç', 'Sadak', 'Tırnak', 'Sırtlan', 'Köstebek', 'Yılan',
  ],
  player: ['Komutan', 'Sancaktar', 'Muhafız', 'Rehber'],
};

/** Kültüre göre unvan eki — isim + ek birlikte yazılır (Bannerlord'da "of X" gibi). */
const EPITHETS: Record<FactionId, readonly string[]> = {
  empire: ['Senatör', 'Praefectus', 'Tribün', 'Vekilharç'],
  vlandia: ['Baron', 'Şövalye', 'Senyör', 'Kont'],
  battania: ['Reis', 'Şenli', 'Bilge', 'Savaşçı'],
  sturgia: ['Boyar', 'Drujina', 'Voyvoda', 'Knez'],
  khuzait: ['Noyan', 'Han', 'Bahadır', 'Khatun'],
  aserai: ['Şeyh', 'Emir', 'Kervanbaşı', 'Kadı'],
  bandits: ['Haydut Reisi', 'Kaçakçı', 'Yol Kesici', 'Çete Başı'],
  player: ['Sancaktar', 'Muhafız'],
};

/** Probe'lar için isim havuzları (dondurulmuş referans). */
export const NAMES_FOR_TEST = NAMES;

/* ─────────────────── rol → unvan, ikon, güç, replik ─────────────────── */

interface RoleSpec {
  role: NotableRole;
  icon: NotableIconKey;
  title: string;
  power: [number, number];
  relation: [number, number];
  speech: (settlement: Settlement) => string;
}

const ROLES: Record<string, RoleSpec> = {
  ruler: {
    role: 'ruler',
    icon: 'crown',
    title: 'Şehir Hakimi & Valisi',
    power: [210, 288],
    relation: [0, 25],
    speech: (s) =>
      `Hoş geldiniz. ${s.name} surları ardında asayiş ve ticaret lehimize işliyor. Şehrimize dostane niyetle mi geldiniz?`,
  },
  commander: {
    role: 'commander',
    icon: 'shield',
    title: 'Garnizon Kumandanı',
    power: [165, 255],
    relation: [-10, 20],
    speech: (s) =>
      `Surlarımız sağlam, ${s.name} garnizonu teyakkuzda. Dış vadilerdeki haydut hareketliliğini yakından izliyoruz.`,
  },
  merchant: {
    role: 'merchant',
    icon: 'coins',
    title: 'Lonca Temsilcisi',
    power: [120, 240],
    relation: [-5, 30],
    speech: () =>
      'Kervanlarımız doğudan batıya tuz, tahıl ve kaliteli demir taşıyor. Pazaryerimiz her zaman taze erzak alır.',
  },
  tavernkeeper: {
    role: 'tavernkeeper',
    icon: 'beer',
    title: 'Meyhaneci & Bilgi Kaynağı',
    power: [60, 165],
    relation: [0, 40],
    speech: () =>
      'Ocağımızın başı her zaman sıcak! Kiralık kılıçlar, esir fidyecileri… Hepsi masalarımızda oturur.',
  },
  gladiator: {
    role: 'gladiator',
    icon: 'swords',
    title: 'Arena Dövüş Ustası',
    power: [75, 195],
    relation: [-15, 25],
    speech: () =>
      'Kum havuzuna çıkacak cesaretin var mı? Arenada yalnızca çelik ve bilek gücü konuşur!',
  },
  smith: {
    role: 'smith',
    icon: 'hammer',
    title: 'Demirci Ustası',
    power: [90, 195],
    relation: [0, 20],
    speech: () =>
      'Ocağım körükte, çekicim elimde. Kırık kılıcını getir, sözümü tutarsam ücretini sonra konuşuruz.',
  },
  horseTrader: {
    role: 'horseTrader',
    icon: 'cart',
    title: 'At Tüccarı',
    power: [90, 210],
    relation: [-5, 25],
    speech: () =>
      'Bozkırın en iyi atları benim ahırımda. Sürünün hızı, komutanının hızıdır.',
  },
  warden: {
    role: 'warden',
    icon: 'lock',
    title: 'Hisar Zindan Başı',
    power: [105, 210],
    relation: [-25, 10],
    speech: () => 'Demir parmaklıklarımız arkasında hiçbir esir gün ışığı göremez. Saygılar komutanım.',
  },
  elder: {
    role: 'elder',
    icon: 'wheat',
    title: 'Köy İhtiyarı ve Temsilcisi',
    power: [50, 230],
    relation: [0, 30],
    speech: (s) =>
      `Hoş sefa geldiniz beyim. ${s.name} halkı buğday hasadından memnun; gençlerimiz sancağınızda yer isterse yazılır.`,
  },
  headman: {
    role: 'headman',
    icon: 'landmark',
    title: 'Köy Kethüdası',
    power: [60, 250],
    relation: [0, 25],
    speech: () => 'Ambarımız dolu, sürümüz otlakta. Lakin haydutlar yol kesiyor; bir el atarsanız dua ederiz.',
  },
};

/** Yerleşim türüne göre ileri gelen rollerinin sırası (ilk sıradakiler daha güçlü). */
const ROLE_PLAN: Record<Settlement['type'], NotableRole[]> = {
  TOWN: ['ruler', 'commander', 'merchant', 'tavernkeeper', 'smith', 'gladiator', 'horseTrader'],
  CASTLE: ['commander', 'warden', 'smith'],
  VILLAGE: ['elder', 'headman'],
};

/** Yerleşim türüne göre kaç ileri gelen bulunur (2–4). */
const COUNT_RANGE: Record<Settlement['type'], [number, number]> = {
  TOWN: [3, 4],
  CASTLE: [2, 3],
  VILLAGE: [1, 2],
};

/* ─────────────────────────── üretim ─────────────────────────── */

/**
 * Bir yerleşimin ileri gelenlerini üretir (saf + deterministik).
 * `worldSeed` sefer tohumudur; aynı seferde hep aynı kişiler çıkar.
 */
export function generateNotables(settlement: Settlement, worldSeed = 20261021): SettlementNotable[] {
  const rand = mulberry32((hashString(settlement.id) ^ worldSeed) >>> 0);
  const pool = NAMES[settlement.faction] ?? NAMES.empire;
  const epithets = EPITHETS[settlement.faction] ?? EPITHETS.empire;
  const plan = ROLE_PLAN[settlement.type] ?? ROLE_PLAN.TOWN;
  const [minCount, maxCount] = COUNT_RANGE[settlement.type] ?? [2, 3];
  const count = Math.min(plan.length, randInt(rand, minCount, maxCount));

  const usedNames = new Set<string>();
  const notables: SettlementNotable[] = [];

  for (const roleKey of plan.slice(0, count)) {
    const spec = ROLES[roleKey];
    let name = pick(rand, pool);
    // Aynı yerleşimde iki ileri gelen aynı adı taşımasın.
    for (let guard = 0; guard < 8 && usedNames.has(name); guard++) name = pick(rand, pool);
    usedNames.add(name);

    const withEpithet = roleKey === 'ruler' || roleKey === 'warden' ? name : `${name} · ${pick(rand, epithets)}`;

    notables.push({
      id: `${settlement.id}:${spec.role}`,
      name: withEpithet,
      title: spec.title,
      role: spec.role,
      avatarIcon: spec.icon,
      power: randInt(rand, spec.power[0], spec.power[1]),
      relation: randInt(rand, spec.relation[0], spec.relation[1]),
      speech: spec.speech(settlement),
    });
  }

  return notables;
}

/** Yerleşimde kayıtlı ileri gelenler yoksa üretir; varsa dokunmaz (saf). */
export function ensureSettlementNotables(settlement: Settlement, worldSeed = 20261021): Settlement {
  if (settlement.notables && settlement.notables.length > 0) return settlement;
  return { ...settlement, notables: generateNotables(settlement, worldSeed) };
}

/** Seferdeki tüm yerleşimler için `notables` alanını tamamlar. */
export function ensureNotables(
  settlements: Settlement[],
  worldSeed = 20261021,
): Settlement[] {
  let changed = false;
  const next = settlements.map((s) => {
    if (s.notables && s.notables.length > 0) return s;
    changed = true;
    return ensureSettlementNotables(s, worldSeed);
  });
  return changed ? next : settlements;
}
