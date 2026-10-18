import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Endpoint 1: Dynamic Lord Diplomacy & Decision Making powered by Gemini
  app.post('/api/diplomacy', async (req, res) => {
    const {
      lordName,
      lordTitle,
      factionName,
      personality,
      relation,
      playerName,
      playerRenown,
      playerGold,
      playerArmySize,
      isAtWar,
      playerMessage,
      proposalType,
      worldContext,
    } = req.body || {};

    const ai = getAiClient();

    // Deterministic rich fallback when API key is missing or offline
    const buildFallback = () => {
      let relationDelta = 0;
      let politicalAction: 'NONE' | 'PEACE' | 'ALLIANCE' | 'WAR' | 'TRADE' | 'MERCENARY' | 'TRIBUTE' = 'NONE';
      let goldDelta = 0;
      let renownDelta = 2;
      let reply = '';
      let chronicleEntry = '';

      if (proposalType === 'PEACE') {
        if (playerRenown >= 60 || relation >= 10 || playerGold >= 250) {
          relationDelta = 12;
          politicalAction = 'PEACE';
          goldDelta = -150;
          renownDelta = 10;
          reply = `${playerName}, sancağının savaş meydanındaki ağırlığını inkar edemem. 150 dinar savaş tazminatı karşılığında ${factionName} ile kılıçlarımızı kınına sokmayı kabul ediyorum.`;
          chronicleEntry = `${lordTitle} ${lordName} ile ${playerName} arasında barış ahitnamesi imzalandı.`;
        } else {
          relationDelta = -3;
          reply = `Barış mı istiyorsun ${playerName}? Henüz ne namın ne de ordun bize şart koşacak kudrette değil!`;
          chronicleEntry = `${lordTitle} ${lordName}, ${playerName} tarafından sunulan barış teklifini geri çevirdi.`;
        }
      } else if (proposalType === 'ALLIANCE') {
        if (relation >= 15 || playerRenown >= 80) {
          relationDelta = 15;
          politicalAction = 'ALLIANCE';
          renownDelta = 15;
          reply = `Sözlerin bilgece ${playerName}. Ortak düşmanlarımıza karşı sancaklarımızı birleştirme vakti geldi. Kılıcım seninle!`;
          chronicleEntry = `${lordTitle} ${lordName}, ${playerName} ile stratejik askeri ittifak kurdu.`;
        } else {
          relationDelta = 4;
          reply = `İttifak büyük bir güvendir ${playerName}. Önce savaş meydanında veya ortak seferlerde sadakatini kanıtla, sonra konuşalım.`;
          chronicleEntry = `${lordTitle} ${lordName}, ${playerName} ile ittifak için daha fazla güven talep etti.`;
        }
      } else if (proposalType === 'MERCENARY') {
        relationDelta = 8;
        politicalAction = 'MERCENARY';
        goldDelta = 200;
        renownDelta = 8;
        reply = `Ordunun keskin kılıçlara ihtiyacı var ${playerName}. Hazine sandığından 200 dinar avans gönderiyorum; düşmanlarımızı ez!`;
        chronicleEntry = `${playerName}, ${factionName} adına paralı sancaktar sözleşmesi imzaladı.`;
      } else if (proposalType === 'TRADE') {
        relationDelta = 6;
        politicalAction = 'TRADE';
        goldDelta = 120;
        renownDelta = 5;
        reply = `Kervanlarımızın güvenliği iki tarafı da zenginleştirir. İşte ticaret imtiyazı ve 120 dinar kâr payın.`;
        chronicleEntry = `${lordTitle} ${lordName} ile ${playerName} arasında kervan ticaret anlaşması yapıldı.`;
      } else if (proposalType === 'WAR') {
        relationDelta = -25;
        politicalAction = 'WAR';
        renownDelta = 12;
        reply = `Demek kan ve demir istiyorsun ${playerName}! Sancağını savaş meydanında toprağa gömeceğim, ordunu hazırla!`;
        chronicleEntry = `${playerName}, ${lordTitle} ${lordName} ve ${factionName} ordularına resmen savaş ilan etti!`;
      } else {
        relationDelta = 5;
        reply = `Sözlerini dikkatle dinledim ${playerName}. Kalradya topraklarında her sancağın kendi kaderi vardır; gücünü koru.`;
        chronicleEntry = `${playerName}, ${lordTitle} ${lordName} ile siyasi istişarede bulundu.`;
      }

      return {
        reply,
        relationDelta,
        politicalAction,
        goldDelta,
        renownDelta,
        chronicleEntry,
        aiPowered: false,
      };
    };

    if (!ai) {
      return res.json(buildFallback());
    }

    try {
      const systemPrompt = `Sen "Sancak-ı Kalradya: Taht ve Kılıç" adlı Mount & Blade: Bannerlord benzeri 3D strateji ve aksiyon-RPG oyununda yaşayan bir feodal lordsun.
Karakter Bilgilerin:
- İsim: ${lordTitle} ${lordName}
- Krallık / Hizip: ${factionName}
- Kişilik: ${personality}
- Oyuncu ile mevcut ilişki puanı (-100 ile +100 arası): ${relation}
- Şu an savaş durumu: ${isAtWar ? 'SAVAŞTA' : 'BARIŞ / ATEŞKES'}

Karşındaki Oyuncu Komutan:
- İsim: ${playerName}
- Nam (Renown): ${playerRenown}
- Hazine (Dinar): ${playerGold}
- Ordu Büyüklüğü: ${playerArmySize} asker
- Teklif Türü: ${proposalType || 'SERBEST_DIYALOG'}
- Dünya Özeti: ${worldContext || 'Kalradya krallıkları sınır kaleleri için mücadele ediyor.'}

Görev:
Oyuncunun mesajına ve teklifine kendi kişiliğine, aranızdaki ilişkiye, oyuncunun askeri gücüne ve namına göre Türkçe, ortaçağ atmosferine uygun, etkileyici ve kısa (2-3 cümle) bir yanıt ver ve politik kararını JSON olarak döndür.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Oyuncunun sözü: "${playerMessage || 'Seninle krallıklarımızın geleceğini konuşmaya geldim.'}"`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Lordun oyuncuya verdiği Türkçe, ortaçağ üslubunda yanıt (2-3 cümle).',
              },
              relationDelta: {
                type: Type.INTEGER,
                description: 'İlişki değişimi (-30 ile +25 arası tam sayı).',
              },
              politicalAction: {
                type: Type.STRING,
                description: 'Alınan politik karar: NONE, PEACE, ALLIANCE, WAR, TRADE, MERCENARY veya TRIBUTE.',
              },
              goldDelta: {
                type: Type.INTEGER,
                description: 'Oyuncunun altın değişimi (-200 ile +250 arası).',
              },
              renownDelta: {
                type: Type.INTEGER,
                description: 'Oyuncunun nam değişimi (0 ile +20 arası).',
              },
              chronicleEntry: {
                type: Type.STRING,
                description: 'Kalradya Vakanüvis Günlüğüne eklenecek 1 cümlelik politik olay özeti.',
              },
            },
            required: [
              'reply',
              'relationDelta',
              'politicalAction',
              'goldDelta',
              'renownDelta',
              'chronicleEntry',
            ],
          },
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        return res.json(buildFallback());
      }
      const parsed = JSON.parse(rawText);
      return res.json({
        reply: parsed.reply || buildFallback().reply,
        relationDelta: Number.isFinite(parsed.relationDelta) ? parsed.relationDelta : 5,
        politicalAction: ['NONE', 'PEACE', 'ALLIANCE', 'WAR', 'TRADE', 'MERCENARY', 'TRIBUTE'].includes(parsed.politicalAction)
          ? parsed.politicalAction
          : 'NONE',
        goldDelta: Number.isFinite(parsed.goldDelta) ? parsed.goldDelta : 0,
        renownDelta: Number.isFinite(parsed.renownDelta) ? parsed.renownDelta : 4,
        chronicleEntry: parsed.chronicleEntry || `${lordTitle} ${lordName} ile diplomatik görüşme gerçekleşti.`,
        aiPowered: true,
      });
    } catch (_error) {
      return res.json(buildFallback());
    }
  });

  // Endpoint 2: Dynamic Living World Political Chronicle & Royal Decree Generator
  app.post('/api/world-council', async (req, res) => {
    const { day, season, playerFaction, playerRenown, settlementsSummary, recentEvents } = req.body || {};
    const ai = getAiClient();

    const buildFallbackCouncil = () => ({
      headline: `${season || 'Güz'} Divanı: Sınır Kalelerinde Sancak Hareketliliği`,
      decree: `Kalradya'nın ${day || 1}. gününde kuzey geçitlerinde tahkimat artırıldı ve kervan vergileri yeniden düzenlendi.`,
      strategicAdvice: `Namınız (${playerRenown || 50}) yükselirken ordunuzun erzağını yüksek tutun ve sınır kalelerindeki garnizonları güçlendirin.`,
      factionShift: 'Kuzey Krallığı ile Altın Bozkır Hanlığı arasındaki sınır gerilimi tırmanıyor.',
      aiPowered: false,
    });

    if (!ai) {
      return res.json(buildFallbackCouncil());
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Gün: ${day}, Mevsim: ${season}, Oyuncu Hizbi: ${playerFaction}, Oyuncu Namı: ${playerRenown}. Yerleşimler: ${settlementsSummary}. Son olaylar: ${recentEvents}. Kalradya'da yaşayan politik dünya için yeni bir divan kararı ve stratejik tavsiye üret.`,
        config: {
          systemInstruction:
            'Sen Sancak-ı Kalradya strateji oyununun Baş Vakanüvisi ve Strateji Danışmanısın. Türkçe, akıcı, ortaçağ politik atmosferine uygun JSON yanıt üret.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              decree: { type: Type.STRING },
              strategicAdvice: { type: Type.STRING },
              factionShift: { type: Type.STRING },
            },
            required: ['headline', 'decree', 'strategicAdvice', 'factionShift'],
          },
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) return res.json(buildFallbackCouncil());
      const parsed = JSON.parse(rawText);
      return res.json({
        ...buildFallbackCouncil(),
        ...parsed,
        aiPowered: true,
      });
    } catch (_err) {
      return res.json(buildFallbackCouncil());
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
