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
import { deriveClan, deriveOccupation, nearestSettlement } from './heroes.ts';
import type { Quest } from './quests.ts';
import {
  type CampaignState,
  FACTION_INFO,
  type LordAgent,
  type Settlement,
  calculateClanTier,
} from './rules.ts';

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
  | { kind: 'MEET_HERO' }
  | { kind: 'RELATION'; delta: number; reason: string }
  | { kind: 'GOLD'; delta: number; reason: string }
  | { kind: 'RELATION_AND_GOLD'; relationDelta: number; goldDelta: number; reason: string }
  | { kind: 'ACCEPT_QUEST'; questId: string }
  | { kind: 'OPEN_TRADE' }
  | { kind: 'OPEN_BARTER'; presetMarriage?: boolean; presetPeace?: boolean }
  | { kind: 'OPEN_COUNCIL' }
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
  /** Oyuncu bu lord/kral/leydi ile daha önce tanıştı mı? (False ise ilk tanışma diyaloğu açılır) */
  hasMet?: boolean;
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
        text: 'Bir ateşkes ve barış konuşalım.',
        hint: 'İlişki +1 (ikna gerekir)',
        effect: {
          kind: 'PERSUADE',
          difficulty: lordCaughtPlayer ? 60 : 45,
          successNext: 'parley-ok',
          failNext: 'parley-fail',
        },
      },
      {
        id: 'war-barter-peace',
        text: 'Aramızdaki savaşı bitirecek bir anlaşma teklif ediyorum. (Takas Masası)',
        hint: 'Barış antlaşması için takas ekranını aç',
        effect: { kind: 'OPEN_BARTER', presetPeace: true },
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

  /* ── BARIŞ ZAMANI: GERÇEK BANNERLORD LORD / KRAL / LEYDİ / MUHTAR DİYALOĞU ── */
  const occupation = ctx.lord ? deriveOccupation(ctx.lord) : 'HEADMAN';
  const isRuler = occupation === 'RULER';
  const isLady = occupation === 'LADY';
  const factionId = ctx.lord?.faction ?? ctx.settlement?.faction ?? 'empire';
  const factionName = FACTION_INFO[factionId]?.name ?? 'Kalradya';
  const playerName = ctx.campaign.playerName || 'Komutan';
  const lordIdx = ctx.lord
    ? Math.max(0, ctx.campaign.lords.findIndex((l) => l.id === ctx.lord!.id))
    : 0;
  const clanInfo = ctx.lord ? deriveClan(ctx.lord, lordIdx) : { clanId: 'clan-local', clanName: 'Yerel Eşraf' };
  const playerClan = calculateClanTier(ctx.campaign.renown);
  const nearSet = ctx.lord
    ? nearestSettlement(ctx.campaign.settlements, ctx.lord.x, ctx.lord.z)
    : ctx.settlement ?? ctx.campaign.settlements[0];

  const greetingLine = isRuler
    ? `${name}: "${factionName} tahtı ve sancağı adına seni dinliyorum, ${playerName}. Huzuruma ne getirdin?"\n${relationTone(relation)}`
    : isLady
      ? `${name}: "${clanInfo.clanName} adına sizi selamlıyorum, ${playerName}. Söyleyin, size nasıl yardımcı olabilirim?"\n${relationTone(relation)}`
      : ctx.lord
        ? `${name}: "Yolun açık olsun ${playerName}. ${factionName} sınırlarında sancağını görmek güzel. Ne konuşmak istiyorsun?"\n${relationTone(relation)}`
        : `${name}: "Sancak senin, yol senin. Ne getirdin?"\n${relationTone(relation)}`;

  nodes.root = {
    id: 'root',
    speaker: 'NPC',
    text: greetingLine,
    options: [],
  };

  const rootOptions = nodes.root.options;

  /* 0. İlk Tanışma Akışı (Yalnızca daha önce tanışılmamış Lord/Kral/Leydi için) */
  const isFirstMeeting = Boolean(ctx.lord && ctx.hasMet === false);
  if (isFirstMeeting && ctx.lord) {
    const introText = isRuler
      ? `${name}: "Sancağını daha önce divanımda görmedim yabancı. Ben ${factionName} hükümdarı ${title} ${name}. Sen kimsin ve topraklarımda ne arıyorsun?"`
      : isLady
        ? `${name}: "Daha önce tanıştırıldığımızı sanmıyorum. Ben ${clanInfo.clanName} mensubu ${title} ${name}. Sizin adınız ve sancağınız nedir?"`
        : `${name}: "Dur bakalım yolcu, simanı daha önce bu sınır boylarında görmedim. Ben ${clanInfo.clanName}'ndan ${title} ${name}. Sen kimsin?"`;

    nodes['intro-root'] = {
      id: 'intro-root',
      speaker: 'NPC',
      text: introText,
      options: [
        {
          id: 'intro-respect',
          text: `Benim adım ${playerName}. Sizinle tanışmak bir onurdur, ${title} ${name}.`,
          hint: 'Saygılı tanışma · Ansiklopedi kaydı açılır',
          effect: { kind: 'MEET_HERO' },
          next: 'root',
        },
        {
          id: 'intro-proud',
          text: `Ben ${playerName}, kendi sancağımın komutanıyım. Adımı yakında sıkça duyacaksınız.`,
          hint: 'Kararlı tanışma · Ansiklopedi kaydı açılır',
          effect: { kind: 'MEET_HERO' },
          next: 'root',
        },
        {
          id: 'intro-leave',
          text: 'Yalnızca yoldan geçiyordum, vaktinizi almayayım. (Vedalaş)',
          effect: { kind: 'CLOSE' },
        },
      ],
    };
  }

  /* 1. Aktif Görev Seçeneği (ctx.quest varsa kökte gösterilir) */
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

  /* 2. BANNERLORD LORD / KRAL / LEYDİ ÖZEL DALLARI */
  if (ctx.lord) {
    // 2A. "Konuşmamız gereken bir şey var." (Discuss Hub: Teklif/Takas, Vasallık, Paralı Askerlik, Evlilik, Divan)
    rootOptions.push({
      id: 'discuss-hub',
      text: 'Konuşmamız gereken bir şey var.',
      hint: isRuler
        ? 'Vasallık yemini, paralı askerlik, evlilik ittifakı veya takas'
        : isLady
          ? 'Kur yapma, evlilik ittifakı veya takas teklifi'
          : 'Takas teklifi, siyasi ittifak, paralı askerlik veya evlilik',
      next: 'discuss-menu',
    });

    const discussOptions: DialogueOption[] = [
      {
        id: 'discuss-barter',
        text: 'İkimizin de yararına olacak bir teklifim var. (Takas Yap)',
        hint: 'Bannerlord çift sütunlu takas ve pazarlık masasını aç',
        effect: { kind: 'OPEN_BARTER' },
      },
      {
        id: 'discuss-fealty',
        text: isRuler
          ? `Kılıcımı ve sancağımı ${factionName} hizmetine sunmak, size bağlılık yemini etmek istiyorum.`
          : `${factionName} sancağı altına girmek ve hükümdarınıza bağlılık yemini etmek istiyorum.`,
        hint: `Klan Kademesi 2 gerekir (Mevcut: Kademe ${playerClan.tier})`,
        next: 'discuss-fealty-node',
      },
      {
        id: 'discuss-mercenary',
        text: `Sancağımı ${factionName} ordularına paralı asker olarak kiralamak istiyorum.`,
        hint: 'Sefer sözleşmesi · +60 Dinar avans ve +2 İlişki',
        next: 'discuss-mercenary-node',
      },
    ];

    if (isLady) {
      discussOptions.push({
        id: 'discuss-courtship',
        text: 'Sizinle geleceğimiz hakkında konuşmak ve kalbinize talip olmak istiyorum.',
        hint: 'Kur yapma & ikna denemesi (+İlişki)',
        effect: {
          kind: 'PERSUADE',
          difficulty: 40,
          successNext: 'courtship-ok',
          failNext: 'courtship-fail',
        },
      });
      nodes['courtship-ok'] = {
        id: 'courtship-ok',
        speaker: 'NPC',
        text: `${name}: "Sözleriniz hem cesur hem de asilce, ${playerName}. Hanedanlarımızın birleşmesi Kalradya'da büyük yankı uyandıracaktır."`,
        options: [
          {
            id: 'courtship-barter',
            text: 'Hanedan başlık ve çeyiz şartlarını konuşalım. (Takas Masası)',
            effect: { kind: 'OPEN_BARTER', presetMarriage: true },
          },
          {
            id: 'courtship-back',
            text: 'Bu güzel sözlerinizi unutmayacağım.',
            hint: 'İlişki +4',
            effect: { kind: 'RELATION', delta: 4, reason: 'Kur yapma başarısı' },
            next: 'root',
          },
        ],
      };
      nodes['courtship-fail'] = {
        id: 'courtship-fail',
        speaker: 'NPC',
        text: `${name}: "Henüz birbirimizi yeterince tanımıyoruz ${playerName}. Önce savaş meydanlarında ve divanda adınızı kanıtlayın."`,
        options: [
          {
            id: 'courtship-fail-back',
            text: 'Haklısınız, sabırla bekleyeceğim.',
            next: 'root',
          },
        ],
      };
    }

    discussOptions.push(
      {
        id: 'discuss-marriage',
        text: 'Ailelerimiz arasında bir evlilik ittifakı kurmayı teklif ediyorum.',
        hint: 'Hanedan evliliği ve çeyiz pazarlığı',
        next: 'discuss-marriage-node',
      },
      {
        id: 'discuss-council',
        text: 'Siyasi divan müzakeresine geçelim. (4 Aşamalı İkna & Divan)',
        hint: 'Detaylı siyasi müzakere ekranını aç',
        effect: { kind: 'OPEN_COUNCIL' },
      },
      {
        id: 'discuss-back',
        text: 'Başka bir konudan bahsedelim.',
        next: 'root',
      },
    );

    nodes['discuss-menu'] = {
      id: 'discuss-menu',
      speaker: 'NPC',
      text: `${name}: "Seni dinliyorum ${playerName}. Aklındaki mesele nedir?"`,
      options: discussOptions,
    };

    nodes['discuss-fealty-node'] = {
      id: 'discuss-fealty-node',
      speaker: 'NPC',
      text:
        playerClan.tier >= 2
          ? isRuler
            ? `${name}: "Sancağının şöhreti (${ctx.campaign.renown} Nam, Kademe ${playerClan.tier}) kulağıma kadar geldi ${playerName}. Kılıcını düşmanlarımıza karşı çekmeye ant içersen seni ${factionName} derebeyi olarak kabul ederim!"`
            : `${name}: "Şöhretin vasallık için yeterli ${playerName}. Hükümdarımızın sancağı altında omuz omuza çarpışmaktan onur duyarız."`
          : `${name}: "Cesaretini takdir ediyorum ${playerName}, ancak Bannerlord geleneklerine göre vasallık yemini edebilmek için klanının en az Kademe 2 (150 Nam) seviyesine ulaşması gerekir. Şu anki şöhretin ${ctx.campaign.renown} Nam (Kademe ${playerClan.tier})."`,
      options:
        playerClan.tier >= 2
          ? [
              {
                id: 'fealty-swear',
                text: 'Kılıcım ve onurum üzerine bağlılık yemini ediyorum!',
                hint: 'İlişki +5 · Siyasi İttifak',
                effect: { kind: 'RELATION', delta: 5, reason: 'Bağlılık yemini' },
                next: 'root',
              },
              {
                id: 'fealty-back',
                text: 'Kararımı vermeden önce biraz daha düşüneyim.',
                next: 'root',
              },
            ]
          : [
              {
                id: 'fealty-mercenary-instead',
                text: 'O halde şimdilik paralı asker olarak hizmet edeyim.',
                next: 'discuss-mercenary-node',
              },
              {
                id: 'fealty-back',
                text: 'Anlaşıldı, şöhretimi artırdığımda tekrar geleceğim.',
                next: 'root',
              },
            ],
    };

    nodes['discuss-mercenary-node'] = {
      id: 'discuss-mercenary-node',
      speaker: 'NPC',
      text: `${name}: "${factionName} ordularının her zaman eli kılıç tutan paralı bölük komutanlarına ihtiyacı vardır. Kazanacağın her muharebe ve esir için günlük sancak akçesi alırsın."`,
      options: [
        {
          id: 'mercenary-sign',
          text: 'Sözleşmeyi kabul ediyorum, kılıcım hizmetinizdedir.',
          hint: '+60 dinar sözleşme avansı · İlişki +2',
          effect: {
            kind: 'RELATION_AND_GOLD',
            relationDelta: 2,
            goldDelta: 60,
            reason: 'Paralı asker sözleşmesi',
          },
          next: 'mercenary-signed',
        },
        {
          id: 'mercenary-back',
          text: 'Şimdilik bağımsız kalmayı tercih ediyorum.',
          next: 'root',
        },
      ],
    };

    nodes['mercenary-signed'] = {
      id: 'mercenary-signed',
      speaker: 'NPC',
      text: `${name}: "Güzel! Al bakalım, bu 60 dinar ilk sefer avansındır. Düşman sancaklarını devirdikçe hazinemizden payını alacaksın."`,
      options: [{ id: 'merc-done', text: 'Başka bir konuya geçelim.', next: 'root' }],
    };

    nodes['discuss-marriage-node'] = {
      id: 'discuss-marriage-node',
      speaker: 'NPC',
      text: `${name}: "Evlilik, Kalradya'da iki hanedanı kan bağıyla birbirine bağlayan en ciddi antlaşmadır. Çeyiz ve başlık şartlarını takas masasında resmiyete dökebiliriz."`,
      options: [
        {
          id: 'marriage-open-barter',
          text: 'Evlilik ittifakı şartlarını masada konuşalım. (Takas Masası)',
          effect: { kind: 'OPEN_BARTER', presetMarriage: true },
        },
        {
          id: 'marriage-back',
          text: 'Daha sonra tekrar konuşalım.',
          next: 'root',
        },
      ],
    };

    // 2B. "Size bir sorum var." (Question Hub: Birini Arıyorum / Konum Sorma, Savaş Durumu, Hanedan Bilgisi)
    rootOptions.push({
      id: 'ask-question-hub',
      text: 'Size bir sorum var.',
      hint: 'Lordların/leydilerin yerini sor, savaş ve krallık durumunu öğren',
      next: 'question-menu',
    });

    const fellowLords = ctx.campaign.lords
      .filter((l) => l.faction === ctx.lord!.faction && l.id !== ctx.lord!.id)
      .slice(0, 4);
    const locationLines =
      fellowLords.length > 0
        ? fellowLords
            .map((fl) => {
              const ns = nearestSettlement(ctx.campaign.settlements, fl.x, fl.z);
              return `• ${fl.title} ${fl.name}: Son olarak ${ns ? ns.name : 'sınır'} yakınlarında görüldü (${fl.currentAction}).`;
            })
            .join('\n')
        : '• Tüm sancakbeylerimiz şu an kendi tımarlarında devriye geziyor.';

    const activeWars = (ctx.campaign.world?.wars ?? []).filter(
      (w) => w.a === ctx.lord!.faction || w.b === ctx.lord!.faction,
    );
    const warSummaryText =
      activeWars.length > 0
        ? activeWars
            .map((w) => {
              const enemyFac = w.a === ctx.lord!.faction ? w.b : w.a;
              const enemyName = FACTION_INFO[enemyFac]?.name ?? enemyFac;
              const adv =
                (w.a === ctx.lord!.faction ? w.score : -w.score) >= 0
                  ? 'Ordularımız cephede üstünlüğü elinde tutuyor'
                  : 'Sınır hatlarımızda çetin çarpışmalar yaşanıyor';
              return `• ${enemyName} ile savaş hâlindeyiz (${adv}).`;
            })
            .join('\n')
        : `• Şu an ${factionName} sınırlarında resmi bir meydan savaşı yok; garnizonlarımızı tahkim ediyoruz.`;

    nodes['question-menu'] = {
      id: 'question-menu',
      speaker: 'NPC',
      text: `${name}: "Sor bakalım ${playerName}, ne öğrenmek istiyorsun?"`,
      options: [
        {
          id: 'q-locate',
          text: 'Birini arıyorum, krallığınızın soylularının nerede olduğunu biliyor musunuz?',
          hint: 'Lord, kral ve leydilerin güncel konumlarını öğren',
          next: 'question-locate',
        },
        {
          id: 'q-politics',
          text: 'Savaşlar ve Kalradya siyaseti nasıl gidiyor?',
          hint: 'Aktif savaşlar ve cephe durumu',
          next: 'question-politics',
        },
        {
          id: 'q-lore',
          text: `Bana ${clanInfo.clanName} ve görevleriniz hakkında bilgi verin.`,
          hint: 'Kişilik ve hanedan geçmişi',
          next: 'question-lore',
        },
        {
          id: 'q-back',
          text: 'Başka bir konudan bahsedelim.',
          next: 'root',
        },
      ],
    };

    nodes['question-locate'] = {
      id: 'question-locate',
      speaker: 'NPC',
      text: `${name}: "Ulaklarımızdan gelen son raporlara göre sancakbeylerimiz ve leydilerimiz şu bölgelerde bulunuyor:\n${locationLines}"`,
      options: [
        {
          id: 'q-locate-back',
          text: 'Bilgi için teşekkür ederim. Başka bir sorum var.',
          next: 'question-menu',
        },
        {
          id: 'q-locate-root',
          text: 'Anlaşıldı, ana konulara dönelim.',
          next: 'root',
        },
      ],
    };

    nodes['question-politics'] = {
      id: 'question-politics',
      speaker: 'NPC',
      text: `${name}: "${factionName} divanındaki son stratejik durum şöyle:\n${warSummaryText}"`,
      options: [
        {
          id: 'q-politics-back',
          text: 'Başka bir sorum olacak.',
          next: 'question-menu',
        },
        {
          id: 'q-politics-root',
          text: 'Teşekkürler, başka bir konuya geçelim.',
          next: 'root',
        },
      ],
    };

    nodes['question-lore'] = {
      id: 'question-lore',
      speaker: 'NPC',
      text: `${name}: "Ben ${clanInfo.clanName}'ndan ${title} ${name}. ${ctx.lord.personality}. Şu sıralar ${nearSet?.name ?? 'sınır'} bölgesinde ${ctx.lord.currentAction.toLowerCase()}."`,
      options: [
        {
          id: 'q-lore-back',
          text: 'Başka bir sorum var.',
          next: 'question-menu',
        },
        {
          id: 'q-lore-root',
          text: 'Memnun oldum, başka bir konuya geçelim.',
          next: 'root',
        },
      ],
    };

    // 2C. "Yapabileceğim bir görev var mı?" (Soylu / Kral / Leydi Görevleri)
    rootOptions.push({
      id: 'noble-task-hub',
      text: 'Yapabileceğim bir görev var mı?',
      hint: 'Lord, kral veya leydiden yeni görev iste',
      next: 'noble-quest-menu',
    });

    const dynamicQuestId = ctx.quest?.id ?? `noble-quest-${ctx.lord.id}-day-${ctx.campaign.day}`;
    const targetSetName = nearSet?.name ?? 'Sınır Kalesi';

    nodes['noble-quest-menu'] = {
      id: 'noble-quest-menu',
      speaker: 'NPC',
      text: `${name}: "Doğrusu ${playerName}, ${targetSetName} çevresinde sancağımızın desteğe ihtiyaç duyduğu birkaç acil mesele var. Hangisini üstlenebilirsin?"`,
      options: [
        {
          id: 'noble-q-bounty',
          text: `${targetSetName} yollarını kesen haydut çetelerini temizleme görevini üstlenirim.`,
          hint: 'Görev günlüğüne eklenir · +180 Dinar & +3 İlişki',
          effect: { kind: 'ACCEPT_QUEST', questId: dynamicQuestId },
          next: 'noble-quest-accepted',
        },
        {
          id: 'noble-q-troops',
          text: 'Garnizonunuz için kıdemli muhafız ve acemi asker eğitimi görevini alabilirim.',
          hint: 'Görev günlüğüne eklenir · +150 Dinar & +3 İlişki',
          effect: { kind: 'ACCEPT_QUEST', questId: `${dynamicQuestId}-troops` },
          next: 'noble-quest-accepted',
        },
        {
          id: 'noble-q-supply',
          text: 'Ordunuzun sefer iaşesi için hemen erzak ve lojistik destek sağlayayım.',
          hint: '+90 Dinar & +2 İlişki (Anında Destek)',
          effect: {
            kind: 'RELATION_AND_GOLD',
            relationDelta: 2,
            goldDelta: 90,
            reason: 'Soylu sefer iaşe desteği',
          },
          next: 'noble-supply-done',
        },
        {
          id: 'noble-q-back',
          text: 'Şu an kendi seferimle meşgulüm, başka bir konudan bahsedelim.',
          next: 'root',
        },
      ],
    };

    nodes['noble-quest-accepted'] = {
      id: 'noble-quest-accepted',
      speaker: 'NPC',
      text: `${name}: "Harika! Sözünü tutup bu işi başarıyla tamamladığında hem kesen altınla dolacak hem de ${clanInfo.clanName} nezdinde itibarın yükselecek."`,
      options: [
        {
          id: 'noble-q-done',
          text: 'Görevi tamamladığımda döneceğim. (Vedalaş)',
          effect: { kind: 'RELATION', delta: 2, reason: 'Soylu görevi üstlenildi' },
        },
      ],
      end: true,
    };

    nodes['noble-supply-done'] = {
      id: 'noble-supply-done',
      speaker: 'NPC',
      text: `${name}: "Bu desteğin tam vaktinde yetişti ${playerName}. İşte malzemelerin karşılığı olan 90 dinar. Bu iyiliğini unutmayacağım."`,
      options: [{ id: 'noble-supply-back', text: 'Her zaman, başka bir konuya geçelim.', next: 'root' }],
    };

    // 2D. Doğrudan Takas Kısayolu
    rootOptions.push({
      id: 'barter-direct',
      text: 'İkimizin de yararına olacak bir teklifim var. (Takas)',
      hint: 'Altın, esir, barış veya evlilik pazarlığı yap',
      effect: { kind: 'OPEN_BARTER' },
    });
  }

  /* 3. Ticaret söylentisi */
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

  /* 4. İlişki seçenekleri */
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

  return {
    root: isFirstMeeting ? 'intro-root' : 'root',
    nodes,
    speakerName: name,
    speakerTitle: title,
    forcedEncounter: false,
  };
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
  | { kind: 'OPEN_BARTER'; presetMarriage?: boolean; presetPeace?: boolean }
  | { kind: 'OPEN_COUNCIL' }
  | { kind: 'MEET_HERO' }
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
  let acceptedQuestId: string | null;
  acceptedQuestId = null;
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
      case 'MEET_HERO':
        encounterAction = { kind: 'MEET_HERO' };
        break;
      case 'RELATION':
        relation += e.delta;
        break;
      case 'GOLD':
        gold = Math.max(0, gold + e.delta);
        break;
      case 'RELATION_AND_GOLD':
        relation += e.relationDelta;
        gold = Math.max(0, gold + e.goldDelta);
        break;
      case 'ACCEPT_QUEST':
        acceptedQuestId = e.questId;
        break;
      case 'OPEN_TRADE':
        openTrade = true;
        closed = true;
        nextId = null;
        break;
      case 'OPEN_BARTER':
        encounterAction = {
          kind: 'OPEN_BARTER',
          presetMarriage: e.presetMarriage,
          presetPeace: e.presetPeace,
        };
        break;
      case 'OPEN_COUNCIL':
        encounterAction = { kind: 'OPEN_COUNCIL' };
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
  if (!nextId && e && e.kind !== 'OPEN_BARTER' && e.kind !== 'MEET_HERO') {
    closed = true;
  }
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
