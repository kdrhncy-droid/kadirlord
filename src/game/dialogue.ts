/**
 * dialogue.ts — Faz 6 & Karşılaşma Sistemi: Bannerlord diyalog ve zorunlu karşılaşma veri modeli
 *
 * Bannerlord'un diyalog ve `PlayerEncounter` mantığı:
 *  - Karşılama düğümü, oyuncunun **numaralı seçenekleri** (1–9).
 *  - Seçenekler koşullu: savaş hâli, zorunlu yakalanma (`forcedEncounter`),
 *    güç dengesi (`EncounterScenario`), ilişki, aktif görev, meslek.
 *  - Savaş/yakalanma durumunda 2 aşamalı akış:
 *    1. Zorunlu karşılaşma diyaloğu (Haydut / Düşman Lordu — Güçlü veya Zayıf)
 *    2. Savaş Öncesi Karşılaşma Menüsü (`encounter-menu`: Saldır / Askerleri Gönder / Artçı Bırakıp Kaç / Teslim Ol)
 *
 * Tasarım kararı: düğümler saf veridir (`buildDialogue`), yan etkiler `applyOption`
 * ile ayrı tutulur. Böylece probe'lar grafiği başsız test edebilir.
 */
import {
  type EncounterScenario,
  calculateBribeCost,
  calculateSacrificeEscape,
  classifyEncounterScenario,
} from './encounter.ts';
import type { Quest } from './quests.ts';
import type { CampaignState, LordAgent, Settlement } from './rules.ts';

export type DialogueNodeId = string;

export interface DialogueOption {
  id: string;
  /** Oyuncunun göreceği metin. */
  text: string;
  /** Kısa açıklama / ipucu (ör. "İlişki +2"). */
  hint?: string;
  /** Seçenek görünür mü? */
  visible?: boolean;
  /** Seçilince uygulanacak etki. */
  effect?: DialogueEffect;
  /** Gidilecek düğüm; yoksa diyalog kapanır. */
  next?: DialogueNodeId;
}

export type DialogueEffect =
  | { kind: 'NONE' }
  | { kind: 'CLOSE' }
  | { kind: 'RELATION'; delta: number; reason: string }
  | { kind: 'GOLD'; delta: number; reason: string }
  | { kind: 'ACCEPT_QUEST'; questId: string }
  | { kind: 'OPEN_TRADE' }
  | { kind: 'START_BATTLE' }
  | { kind: 'AUTO_RESOLVE' }
  | { kind: 'SACRIFICE_ESCAPE' }
  | { kind: 'BRIBE_ESCAPE'; cost: number }
  | { kind: 'DEMAND_SURRENDER' }
  | { kind: 'PLAYER_SURRENDER' }
  | { kind: 'PERSUADE'; difficulty: number; successNext: DialogueNodeId; failNext: DialogueNodeId };

export interface DialogueNode {
  id: DialogueNodeId;
  /** Konuşan: NPC mi, oyuncu mu, anlatıcı mı? */
  speaker: 'NPC' | 'PLAYER' | 'NARRATOR';
  text: string;
  options: DialogueOption[];
  /** Düğüm kendiliğinden kapanır mı? */
  end?: boolean;
}

export interface DialogueGraph {
  root: DialogueNodeId;
  nodes: Record<DialogueNodeId, DialogueNode>;
  /** Muhatabın adı/rolü — başlıkta görünür. */
  speakerName: string;
  speakerTitle: string;
  /** Karşılaşma zorunlu mu? (True ise Esc veya X ile kapatılamaz) */
  forcedEncounter?: boolean;
  scenario?: EncounterScenario;
}

export interface DialogueContext {
  lord?: LordAgent;
  /** Muhatap bir yerleşimdeyse (muhtar, garnizon komutanı). */
  settlement?: Settlement;
  campaign: CampaignState;
  /** Muhatabın oyuncuya ilişkisi. */
  relation: number;
  /** Oyuncuyla savaşta mı? */
  atWar: boolean;
  /** Bu lordun/yerleşimin aktif görevi. */
  quest?: Quest;
  /** Muhatap pazaryeri olan bir yerleşkede mi? */
  canTrade?: boolean;
  /** Haritada düşman/haydut tarafından yakalandı mı veya düşmanı yakaladı mı? */
  forcedEncounter?: boolean;
  scenario?: EncounterScenario;
}

/* ─────────────────────────── yardımcılar ─────────────────────────── */

const relationTone = (relation: number): string => {
  if (relation >= 40) return 'Yüzünde sıcak bir gülümseme var.';
  if (relation >= 10) return 'Seni tanıdık biri gibi selamlıyor.';
  if (relation > -10) return 'Sana ölçülü bir baş selamı veriyor.';
  if (relation > -40) return 'Bakışları soğuk; seni pek sevmiyor.';
  return 'Seni görünce eli kılıcına gidiyor.';
};

const formatGold = (n: number) => `${n} dinar`;

/**
 * Diyalog metninin başındaki mükerrer `<Konuşmacı Adı>: "..."` önekini temizler.
 * Böylece üstteki isim plakasında zaten adı yazan lordun ismi metin kutusunda tekrar etmez.
 */
export function stripSpeakerPrefix(rawText: string, speakerName: string): string {
  const prefix = `${speakerName}: `;
  let body = rawText.startsWith(prefix) ? rawText.slice(prefix.length) : rawText;
  if (body.startsWith('"') && body.endsWith('"')) {
    body = body.slice(1, -1);
  } else if (body.startsWith('"')) {
    body = body.replace(/^"([^"]+)"/, '$1');
  }
  return body.trim();
}

/** Savaş öncesi taktik karşılaşma düğümünü (`encounter-menu`) oluşturur. */
function buildEncounterBattleMenuNode(
  name: string,
  lord: LordAgent | undefined,
  campaign: CampaignState,
): DialogueNode {
  const esc = lord
    ? calculateSacrificeEscape(campaign, lord)
    : { canEscape: false, sacrificedTotal: 0, moraleLoss: 8 };

  const options: DialogueOption[] = [
    {
      id: 'enc-attack',
      text: 'Saldır! (3B Meydan Muharebesine Gir)',
      hint: 'Orduna savaş meydanında bizzat komuta et',
      effect: { kind: 'START_BATTLE' },
    },
    {
      id: 'enc-autoresolve',
      text: 'Askerleri Gönder (Otomatik Muharebe Çözümü)',
      hint: 'Birlik gücü ve taktik becerisine göre simüle et',
      effect: { kind: 'AUTO_RESOLVE' },
    },
  ];

  if (esc.canEscape) {
    options.push({
      id: 'enc-escape',
      text: `Artçı Bırakıp Kaçmaya Çalış (-${esc.sacrificedTotal} Asker)`,
      hint: `${esc.sacrificedTotal} artçı asker feda edilir · Moral -${esc.moraleLoss}`,
      effect: { kind: 'SACRIFICE_ESCAPE' },
    });
  }

  options.push({
    id: 'enc-surrender',
    text: 'Teslim Ol',
    hint: 'Askerlerin katledilmesini önle · Haraç ve erzak kaybı',
    effect: { kind: 'PLAYER_SURRENDER' },
  });

  return {
    id: 'encounter-menu',
    speaker: 'NPC',
    text: `${name}: "Borular çalınsın! Savaş düzeni alın!"\n\nOrdular karşı karşıya dizildi. Muharebe kararın nedir?`,
    options,
  };
}

/* ─────────────────────────── grafik üretimi ─────────────────────────── */

export function buildDialogue(ctx: DialogueContext): DialogueGraph {
  const name = ctx.lord?.name ?? ctx.settlement?.name ?? 'Yabancı';
  const title = ctx.lord?.title ?? (ctx.settlement ? 'Yerleşim Reisi' : 'Muhatap');
  const relation = ctx.relation;

  const nodes: Record<DialogueNodeId, DialogueNode> = {};
  const isBandit = ctx.lord?.faction === 'bandits';
  const isHostile = Boolean(ctx.atWar || isBandit);

  /* ── Savaş veya Haydut Karşılaşması ── */
  if (isHostile) {
    const info = ctx.lord
      ? classifyEncounterScenario(ctx.lord, ctx.campaign)
      : {
          scenario: 'LORD_CAUGHT_PLAYER' as EncounterScenario,
          forced: Boolean(ctx.forcedEncounter),
          enemyStrength: 25,
          playerStrength: 20,
          strengthRatio: 1.25,
        };
    const scenario = ctx.scenario ?? info.scenario;
    const forced = ctx.forcedEncounter ?? false;
    const bribeCost = ctx.lord ? calculateBribeCost(ctx.lord, ctx.campaign) : 120;
    const canAffordBribe = ctx.campaign.gold >= bribeCost;

    nodes['encounter-menu'] = buildEncounterBattleMenuNode(name, ctx.lord, ctx.campaign);

    // 1. SENARYO: Güçlü Haydut Oyuncuyu Yakaladı
    if (isBandit && scenario === 'BANDIT_CAUGHT_PLAYER') {
      const rootOpts: DialogueOption[] = [
        {
          id: 'bandit-fight',
          text: 'Kılıcımı alırsın, haydut! Sancaklarımız konuşsun!',
          hint: 'Savaş öncesi muharebe ekranına geç',
          next: 'encounter-menu',
        },
        {
          id: 'war-parley',
          text: canAffordBribe
            ? `Geçiş hakkı için altın verelim (${bribeCost} dinar).`
            : `Yanımda ${bribeCost} dinar yok, canımızı bağışlayın!`,
          hint: canAffordBribe ? `-${bribeCost} dinar · Savaştan kaçın` : 'İkna denemesi (zor)',
          effect: canAffordBribe
            ? { kind: 'BRIBE_ESCAPE', cost: bribeCost }
            : {
                kind: 'PERSUADE',
                difficulty: 72,
                successNext: 'parley-ok',
                failNext: 'parley-fail',
              },
        },
        {
          id: 'bandit-surrender',
          text: 'Teslim oluyorum, kan dökülmesin.',
          hint: 'Haraç ve erzak bırakarak kurtul',
          effect: { kind: 'PLAYER_SURRENDER' },
        },
      ];
      if (!forced) {
        rootOpts.push({ id: 'war-leave', text: 'Vedalaş.', effect: { kind: 'CLOSE' } });
      }
      nodes.root = {
        id: 'root',
        speaker: 'NPC',
        text: `${name}: "Keseni ya da canını! Ya kılıcını bırakıp altını sökülürsün ya da bu geçitte kurda kuşa yem olursun!"`,
        options: rootOpts,
      };
      if (!canAffordBribe) {
        nodes['parley-ok'] = {
          id: 'parley-ok',
          speaker: 'NPC',
          text: `${name}: "Hıh, çulsuzlarla vakit kaybedemeyiz. Yıkılın karşımızdan!"`,
          options: [{ id: 'parley-end', text: 'Uzaklaş.', effect: { kind: 'CLOSE' } }],
          end: true,
        };
        nodes['parley-fail'] = {
          id: 'parley-fail',
          speaker: 'NPC',
          text: `${name}: "Masal anlatma! Üzerinizdeki zırhları soyup satacağız, saldırın çocuklar!"`,
          options: [
            {
              id: 'parley-fail-fight',
              text: 'Kılıcını çek! (Savaşa hazırlan)',
              next: 'encounter-menu',
            },
          ],
        };
      }
      return { root: 'root', nodes, speakerName: name, speakerTitle: title, forcedEncounter: forced, scenario };
    }

    // 2. SENARYO: Oyuncu Kaçan Zayıf Haydutu Yakaladı
    if (isBandit && scenario === 'PLAYER_CAUGHT_BANDIT') {
      nodes.root = {
        id: 'root',
        speaker: 'NPC',
        text: `${name}: "Aman dileriz beyim! Kılıcını kınına sok, biz sadece yolunu kaybetmiş garibanlarız!"`,
        options: [
          {
            id: 'bandit-demand-surrender',
            text: 'Silahlarınızı bırakın, hepiniz esirimsiniz!',
            hint: info.strengthRatio <= 0.55 ? 'Ezici üstünlük: Teslim olurlar' : 'Direnmeye çalışabilirler',
            effect: { kind: 'DEMAND_SURRENDER' },
          },
          {
            id: 'bandit-attack',
            text: 'Acımak yok, saldırın! (Savaşa hazırlan)',
            hint: 'Savaş öncesi muharebe ekranına geç',
            next: 'encounter-menu',
          },
          {
            id: 'war-parley',
            text: 'Defolun gidin, bir daha bu köylerin yakınında görmeyeyim sizi.',
            hint: 'Haydutları serbest bırak',
            effect: { kind: 'CLOSE' },
          },
        ],
      };
      return { root: 'root', nodes, speakerName: name, speakerTitle: title, forcedEncounter: forced, scenario };
    }

    // 3. SENARYO: Düşman Lordu Karşılaşması (Kıstırılma veya Yakalama)
    const lordCaughtPlayer = scenario === 'LORD_CAUGHT_PLAYER';
    const rootOptions: DialogueOption[] = [
      {
        id: 'war-attack',
        text: lordCaughtPlayer
          ? 'Sancaklarımız konuşsun! Kılıcımı çekiyorum! (Savaşa hazırlan)'
          : 'Teslim ol ya da kılıçtan geçiril! (Savaşa hazırlan)',
        hint: 'Savaş öncesi muharebe ekranına geç',
        next: 'encounter-menu',
      },
      {
        id: 'war-parley',
        text: 'Bir ateşkes konuşalım.',
        hint: 'İlişki +1 (ikna gerekir)',
        effect: {
          kind: 'PERSUADE',
          difficulty: lordCaughtPlayer ? 60 : 45,
          successNext: 'parley-ok',
          failNext: 'parley-fail',
        },
      },
    ];

    if (canAffordBribe && lordCaughtPlayer) {
      rootOptions.push({
        id: 'war-tribute',
        text: `Kan dökülmesin, geçiş tazminatı ödeyelim (${bribeCost} dinar).`,
        hint: `-${bribeCost} dinar · Güvenli geçiş`,
        effect: { kind: 'BRIBE_ESCAPE', cost: bribeCost },
      });
    }

    if (!forced || !lordCaughtPlayer) {
      rootOptions.push({
        id: 'war-defy',
        text: 'Meydanı terk et, bu sefer kan dökülmesin.',
        hint: 'İlişki −2 · savaş sürer',
        effect: { kind: 'RELATION', delta: -2, reason: 'Meydan okuma' },
        next: 'war-defy',
      });
      nodes['war-defy'] = {
        id: 'war-defy',
        speaker: 'NPC',
        text: `${name}: "O zaman sancakların gölgesi altında görüşürüz."`,
        options: [{ id: 'defy-end', text: 'Ayrıl.', effect: { kind: 'CLOSE' } }],
        end: true,
      };
    }

    if (!forced) {
      rootOptions.push({ id: 'war-leave', text: 'Vedalaş.', effect: { kind: 'CLOSE' } });
    }

    nodes.root = {
      id: 'root',
      speaker: 'NPC',
      text: lordCaughtPlayer
        ? `${name}: "Sonunda seni kıstırdım! Sancaklarımız aynı ovada; ya kılıcını çekersin ya da esirim olursun!"`
        : `${name}: "Sayıca üstün olabilirsin ama onurumuzu çiğnetmeyiz! Ya kılıcını çekersin ya da buradan gidersin."`,
      options: rootOptions,
    };

    nodes['parley-ok'] = {
      id: 'parley-ok',
      speaker: 'NPC',
      text: `${name}: "Sözlerinde samimiyet var. Bugünlük kılıç kınında kalsın."`,
      options: [
        {
          id: 'parley-end',
          text: 'Ayrıl.',
          effect: { kind: 'RELATION', delta: 1, reason: 'Ateşkes' },
        },
      ],
      end: true,
    };
    nodes['parley-fail'] = {
      id: 'parley-fail',
      speaker: 'NPC',
      text: `${name}: "Boş sözler. Kalradya'da barış, çelikle yazılır!"`,
      options: forced
        ? [
            {
              id: 'parley-fail-end',
              text: 'Öyleyse kılıçlar konuşsun! (Savaşa hazırlan)',
              next: 'encounter-menu',
            },
          ]
        : [{ id: 'parley-fail-end', text: 'Ayrıl.', effect: { kind: 'CLOSE' } }],
      end: !forced,
    };
    return {
      root: 'root',
      nodes,
      speakerName: name,
      speakerTitle: title,
      forcedEncounter: forced,
      scenario,
    };
  }

  /* ── barış zamanı: karşılama ── */
  nodes.root = {
    id: 'root',
    speaker: 'NPC',
    text: `${name}: "Sancak senin, yol senin. Ne getirdin?"\n${relationTone(relation)}`,
    options: [],
  };

  const rootOptions = nodes.root.options;

  /* Görev seçeneği */
  if (ctx.quest) {
    rootOptions.push({
      id: 'quest-talk',
      text: `İş hakkında konuş: "${ctx.quest.title}"`,
      hint: `${ctx.quest.reward.gold} dinar ödül`,
      next: 'quest-offer',
      effect: { kind: 'NONE' },
    });
    nodes['quest-offer'] = {
      id: 'quest-offer',
      speaker: 'NPC',
      text: `${name}: "${ctx.quest.description}"\n\nTamamlandığında ${formatGold(ctx.quest.reward.gold)} ve ${ctx.quest.reward.renown} nam senin olacak.`,
      options: [
        {
          id: 'quest-accept',
          text: 'Kabul ediyorum.',
          hint: 'Görev günlüğüne eklenir',
          effect: { kind: 'ACCEPT_QUEST', questId: ctx.quest.id },
          next: 'quest-accepted',
        },
        {
          id: 'quest-haggle',
          text: 'Ödülü artır.',
          hint: 'İkna gerekir',
          effect: {
            kind: 'PERSUADE',
            difficulty: 45,
            successNext: 'haggle-ok',
            failNext: 'haggle-fail',
          },
        },
        { id: 'quest-later', text: 'Şimdi değil.', next: 'root' },
      ],
    };
    nodes['quest-accepted'] = {
      id: 'quest-accepted',
      speaker: 'NPC',
      text: `${name}: "İyi. Kalradya'da sözünü tutan az kaldı."`,
      options: [{ id: 'accepted-end', text: 'Ayrıl.', effect: { kind: 'CLOSE' } }],
      end: true,
    };
    nodes['haggle-ok'] = {
      id: 'haggle-ok',
      speaker: 'NPC',
      text: `${name}: "Pekâlâ, ${formatGold(Math.round(ctx.quest.reward.gold * 1.2))}. Ama iş kusursuz olacak."`,
      options: [
        {
          id: 'haggle-accept',
          text: 'Anlaştık.',
          effect: { kind: 'ACCEPT_QUEST', questId: ctx.quest.id },
          next: 'quest-accepted',
        },
      ],
    };
    nodes['haggle-fail'] = {
      id: 'haggle-fail',
      speaker: 'NPC',
      text: `${name}: "Pazarlık masası burada değil. Teklifim bu."`,
      options: [
        {
          id: 'haggle-fail-accept',
          text: 'Yine de kabul ediyorum.',
          effect: { kind: 'ACCEPT_QUEST', questId: ctx.quest.id },
          next: 'quest-accepted',
        },
        { id: 'haggle-fail-back', text: 'Vazgeç.', next: 'root' },
      ],
    };
  }

  /* Ticaret söylentisi */
  rootOptions.push({
    id: 'trade-rumour',
    text: 'Piyasada ne var ne yok?',
    hint: ctx.canTrade ? 'Pazaryeri açılabilir' : 'Söylenti',
    next: 'rumour',
  });
  nodes.rumour = {
    id: 'rumour',
    speaker: 'NPC',
    text: `${name}: "Kuzeyde tahıl kıt, güneyde demir bol. Doğru yükle yola çıkan kâr eder."`,
    options: [
      ...(ctx.canTrade
        ? [
            {
              id: 'rumour-market',
              text: 'Pazaryerini göster.',
              hint: 'Yalnız yerleşim içinde',
              effect: { kind: 'OPEN_TRADE' as const },
            },
          ]
        : []),
      { id: 'rumour-back', text: 'Başka bir şey sor.', next: 'root' },
    ],
  };

  /* İlişki seçenekleri */
  rootOptions.push({
    id: 'praise',
    text: 'Sancağın dillere destan.',
    hint: 'İlişki +1 (ikna)',
    effect: { kind: 'PERSUADE', difficulty: 35, successNext: 'praise-ok', failNext: 'praise-fail' },
  });
  nodes['praise-ok'] = {
    id: 'praise-ok',
    speaker: 'NPC',
    text: `${name}: "Güzel sözler... Kalradya'da nadir duyulur."`,
    options: [{ id: 'praise-end', text: 'Ayrıl.', effect: { kind: 'RELATION', delta: 1, reason: 'Övgü' } }],
    end: true,
  };
  nodes['praise-fail'] = {
    id: 'praise-fail',
    speaker: 'NPC',
    text: `${name}: "Yalakalıkla mı sancak topladın?"`,
    options: [{ id: 'praise-fail-end', text: 'Ayrıl.', effect: { kind: 'RELATION', delta: -1, reason: 'Boş övgü' } }],
    end: true,
  };

  rootOptions.push({
    id: 'threat',
    text: 'Bu topraklarda dikkatli ol.',
    hint: 'İlişki −3',
    effect: { kind: 'RELATION', delta: -3, reason: 'Tehdit' },
    next: 'threat',
  });
  nodes.threat = {
    id: 'threat',
    speaker: 'NPC',
    text: `${name}: "Tehdit mi? Sancağını topla, yoksa askerlerim toplar."`,
    options: [
      ...(ctx.lord
        ? [
            {
              id: 'threat-attack',
              text: 'Kılıcını çek o halde! (Meydan Savaşına Gir)',
              hint: 'Doğrudan savaşa tutuş',
              effect: { kind: 'START_BATTLE' as const },
            },
          ]
        : []),
      { id: 'threat-end', text: 'Ayrıl.', effect: { kind: 'CLOSE' as const } },
    ],
    end: true,
  };

  rootOptions.push({ id: 'leave', text: 'Vedalaş.', effect: { kind: 'CLOSE' } });

  return { root: 'root', nodes, speakerName: name, speakerTitle: title, forcedEncounter: false };
}

/* ─────────────────────────── doğrulama ─────────────────────────── */

/**
 * Grafik tutarlılığı: her `next` var olan bir düğüme gitmeli, her düğümün
 * seçeneği olmalı, kökten her düğüme ulaşılabilmeli, çıkmaz döngü olmamalı.
 */
export function validateDialogue(graph: DialogueGraph): string[] {
  const problems: string[] = [];
  const ids = new Set(Object.keys(graph.nodes));

  if (!ids.has(graph.root)) problems.push(`kök düğüm yok: ${graph.root}`);

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.id !== id) problems.push(`${id}: düğüm id'si anahtarla uyuşmuyor`);
    if (node.options.length === 0) problems.push(`${id}: seçenek yok (çıkmaz)`);
    for (const opt of node.options) {
      if (opt.next && !ids.has(opt.next)) problems.push(`${id}/${opt.id}: hedef düğüm yok (${opt.next})`);
      if (!opt.next && !opt.effect) problems.push(`${id}/${opt.id}: ne etki ne hedef var`);
      if (opt.effect?.kind === 'PERSUADE') {
        if (!ids.has(opt.effect.successNext)) problems.push(`${id}/${opt.id}: ikna başarı düğümü yok`);
        if (!ids.has(opt.effect.failNext)) problems.push(`${id}/${opt.id}: ikna başarısızlık düğümü yok`);
      }
      if (opt.effect?.kind === 'ACCEPT_QUEST' && !opt.effect.questId) {
        problems.push(`${id}/${opt.id}: görev id'si boş`);
      }
    }
  }

  // erişilebilirlik
  const seen = new Set<string>();
  const queue = [graph.root];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id) || !graph.nodes[id]) continue;
    seen.add(id);
    for (const opt of graph.nodes[id].options) {
      if (opt.next) queue.push(opt.next);
      if (opt.effect?.kind === 'PERSUADE') {
        queue.push(opt.effect.successNext, opt.effect.failNext);
      }
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) problems.push(`erişilemeyen düğüm: ${id}`);
  }

  return problems;
}

/** Diyalogdan çıkış yolu var mı? (her düğümden CLOSE veya sonlandırıcı etkiye ulaşılabilir) */
export function canExit(graph: DialogueGraph): boolean {
  const memo = new Map<string, boolean>();
  const visit = (id: string, stack: Set<string>): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (stack.has(id)) return false; // döngü
    const node = graph.nodes[id];
    if (!node) return false;
    if (node.end || node.options.length === 0) return false;
    stack.add(id);
    let ok = false;
    for (const opt of node.options) {
      const e = opt.effect;
      if (e?.kind === 'CLOSE') {
        ok = true;
      } else if (e?.kind === 'PERSUADE') {
        ok = visit(e.successNext, stack) || visit(e.failNext, stack) || ok;
      } else if (opt.next) {
        ok = visit(opt.next, stack) || ok;
      } else if (e) {
        // etki var, hedef yok → diyalog/karşılaşma sonlanır
        ok = true;
      }
    }
    stack.delete(id);
    memo.set(id, ok);
    return ok;
  };
  return visit(graph.root, new Set());
}

/** İkna başarı oranı (0..1) — ilişki ve zorluğa göre. */
export function persuadeChance(difficulty: number, relation: number): number {
  const raw = 0.5 + relation / 120 - (difficulty - 40) / 160;
  return Math.max(0.05, Math.min(0.95, raw));
}

export type EncounterActionTrigger =
  | { kind: 'START_BATTLE' }
  | { kind: 'AUTO_RESOLVE' }
  | { kind: 'SACRIFICE_ESCAPE' }
  | { kind: 'BRIBE_ESCAPE'; cost: number }
  | { kind: 'DEMAND_SURRENDER' }
  | { kind: 'PLAYER_SURRENDER' }
  | null;

/** Oyuncu seçeneğini uygular → yeni ilişki/altın + sonraki düğüm + karşılaşma aksiyonu. */
export function applyOption(
  graph: DialogueGraph,
  currentId: string,
  optionId: string,
  state: { relation: number; gold: number },
): {
  nextId: DialogueNodeId | null;
  relation: number;
  gold: number;
  openTrade: boolean;
  acceptedQuestId: string | null;
  encounterAction: EncounterActionTrigger;
  closed: boolean;
} {
  const node = graph.nodes[currentId];
  const opt = node?.options.find((o) => o.id === optionId);
  if (!opt) {
    return {
      nextId: null,
      relation: state.relation,
      gold: state.gold,
      openTrade: false,
      acceptedQuestId: null,
      encounterAction: null,
      closed: true,
    };
  }
  let { relation, gold } = state;
  let openTrade = false;
  let acceptedQuestId: string | null = null;
  let encounterAction: EncounterActionTrigger = null;
  let closed = false;
  let nextId: DialogueNodeId | null = opt.next ?? null;

  const e = opt.effect;
  if (e) {
    switch (e.kind) {
      case 'CLOSE':
        closed = true;
        nextId = null;
        break;
      case 'RELATION':
        relation += e.delta;
        break;
      case 'GOLD':
        gold = Math.max(0, gold + e.delta);
        break;
      case 'ACCEPT_QUEST':
        acceptedQuestId = e.questId;
        break;
      case 'OPEN_TRADE':
        openTrade = true;
        closed = true;
        nextId = null;
        break;
      case 'START_BATTLE':
        encounterAction = { kind: 'START_BATTLE' };
        closed = true;
        nextId = null;
        break;
      case 'AUTO_RESOLVE':
        encounterAction = { kind: 'AUTO_RESOLVE' };
        closed = true;
        nextId = null;
        break;
      case 'SACRIFICE_ESCAPE':
        encounterAction = { kind: 'SACRIFICE_ESCAPE' };
        closed = true;
        nextId = null;
        break;
      case 'BRIBE_ESCAPE':
        gold = Math.max(0, gold - e.cost);
        encounterAction = { kind: 'BRIBE_ESCAPE', cost: e.cost };
        closed = true;
        nextId = null;
        break;
      case 'DEMAND_SURRENDER':
        encounterAction = { kind: 'DEMAND_SURRENDER' };
        closed = true;
        nextId = null;
        break;
      case 'PLAYER_SURRENDER':
        encounterAction = { kind: 'PLAYER_SURRENDER' };
        closed = true;
        nextId = null;
        break;
      case 'PERSUADE': {
        const success = Math.random() < persuadeChance(e.difficulty, relation);
        nextId = success ? e.successNext : e.failNext;
        break;
      }
      case 'NONE':
      default:
        break;
    }
  }
  if (!nextId && !e) closed = true;
  return { nextId, relation, gold, openTrade, acceptedQuestId, encounterAction, closed };
}

export const DIALOGUE_VERSION = 2;

/** Oyuncunun gördüğü numaralı seçenek listesi (1–9). */
export function numberedOptions(node: DialogueNode): Array<DialogueOption & { index: number }> {
  return node.options
    .filter((o) => o.visible !== false)
    .slice(0, 9)
    .map((o, i) => ({ ...o, index: i + 1 }));
}
