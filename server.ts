import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const app = express();
function resolveServerPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (args[i].startsWith('--port=')) {
      const parsed = parseInt(args[i].slice('--port='.length), 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : NaN;
  const nginxPort = process.env.NGINX_PORT ? parseInt(process.env.NGINX_PORT, 10) : NaN;
  const defaultAppPort = process.env.DEFAULT_APP_PORT ? parseInt(process.env.DEFAULT_APP_PORT, 10) : 3000;

  if (process.env.NODE_ENV !== 'production') {
    return !Number.isNaN(defaultAppPort) ? defaultAppPort : 3000;
  }

  if (!Number.isNaN(nginxPort) && envPort === nginxPort) {
    return !Number.isNaN(defaultAppPort) ? defaultAppPort : 3000;
  }

  return !Number.isNaN(envPort) ? envPort : 3000;
}

const PORT = resolveServerPort();

app.use(express.json({ limit: '15mb' }));

// Initialize GoogleGenAI server-side with User-Agent header
let aiClient: GoogleGenAI | null = null;
let aiBetaClient: GoogleGenAI | null = null;
let aiAlphaClient: GoogleGenAI | null = null;

if (process.env.GEMINI_API_KEY) {
  const baseHeaders = { 'User-Agent': 'aistudio-build' };
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: baseHeaders,
    },
  });
  aiBetaClient = aiClient;
  aiAlphaClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      apiVersion: 'v1alpha',
      headers: baseHeaders,
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const textModelCooldownUntil = new Map<string, number>();

// Resilient helper to call Gemini with low-latency primary and fast cooldown failover
async function generateContentResilient(params: {
  contents: string;
  systemInstruction?: string;
  responseSchema?: any;
  timeoutMs?: number;
  fast?: boolean;
}) {
  if (!aiClient) return null;

  const timeoutMs = params.timeoutMs ?? 6000;
  const baseConfig: any = {
    responseMimeType: 'application/json',
  };
  if (params.responseSchema) baseConfig.responseSchema = params.responseSchema;
  if (params.systemInstruction) baseConfig.systemInstruction = params.systemInstruction;

  const modelOrder = params.fast
    ? (['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const)
    : (['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const);

  const now = Date.now();
  const candidates = modelOrder.filter((m) => (textModelCooldownUntil.get(m) || 0) <= now);
  const modelsToAttempt = candidates.length > 0 ? candidates : modelOrder;

  for (const model of modelsToAttempt) {
    try {
      const config =
        model === 'gemini-4-hydrogen'
          ? { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : baseConfig;

      const response = await withTimeout(
        aiClient.models.generateContent({
          model,
          contents: params.contents,
          config,
        }),
        timeoutMs,
        `GEMINI_${model}`
      );
      if (response.text) return response.text;
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('TIMEOUT')
      ) {
        textModelCooldownUntil.set(model, Date.now() + 60_000);
      }
      // Fail over cleanly to secondary model or deterministic compliance template
    }
  }

  return null;
}

// 1. Gemini Heat Risk Explanation & Multilingual Alert endpoint
app.post('/api/gemini/heat-advice', async (req: Request, res: Response) => {
  const {
    airTemp,
    humidity,
    globeTemp,
    wbgt,
    workload,
    ppe,
    acclimatized,
    exposureHours,
    riskLevel,
    symptoms = [],
    isMiddayBanActive = false,
  } = req.body;

  // Pre-verified deterministic fallback template text
  const fallbackAdvice = {
    explanation: `Calculated WBGT is ${wbgt?.toFixed?.(1) || wbgt}°C driven by high ambient temperature (${airTemp}°C), relative humidity (${humidity}%), and solar thermal load. Workload threshold is adjusted for safety.`,
    recommended_actions: [
      riskLevel === 'Critical' ? 'Stop outdoor work immediately and report to cool zone.' : 'Take mandatory 15-minute shaded rest breaks every hour.',
      'Drink 250ml of cold water or electrolyte drink every 15-20 minutes.',
      'Loosen non-essential heavy PPE where safe to facilitate convective cooling.',
    ],
    level_suggestion: riskLevel || 'Moderate',
    alert_text: {
      en: riskLevel === 'Critical'
        ? 'Critical heat risk! Stop outdoor work now, drink water, and move to cooling shelter immediately.'
        : riskLevel === 'High'
        ? 'High heat stress! Take an immediate shaded cooling break, hydrate, and notify your supervisor.'
        : 'Heat risk is rising. Hydrate regularly and take scheduled shaded breaks.',
      ar: riskLevel === 'Critical'
        ? 'خطر حراري حرج جداً! أوقف العمل فوراً في الأماكن المكشوفة، وتوجه إلى منطقة تبريد وتناول الماء البارد.'
        : riskLevel === 'High'
        ? 'مستوى الإجهاد الحراري مرتفع. يرجى أخذ استراحة في الظل وشرب الماء وإبلاغ المشرف.'
        : 'خطر الإجهاد الحراري في تصاعد. يرجى شرب الماء بانتظام وأخذ فترات راحة مظللة.',
      hi: riskLevel === 'Critical'
        ? 'अत्यधिक गर्मी का खतरा! तुरंत काम रोकें, पानी पिएं और ठंडे आश्रय में जाएं।'
        : 'गर्मी का जोखिम बढ़ रहा है। कृपया पानी पिएं, छाया में आराम करें और सुपरवाइजर को बताएं।',
      ml: riskLevel === 'Critical'
        ? 'അതിരൂക്ഷമായ ചൂട് അപായം! ഉടൻ ജോലി നിർത്തി തണലിലേക്ക് മാറുക, വെള്ളം കുടിക്കുക.'
        : 'ചൂട് കൂടുന്നു. തണലിൽ വിശ്രമിക്കുക, ധാരാളം വെള്ളം കുടിക്കുക, സൂപ്പർവൈസറെ അറിയിക്കുക.',
      kn: riskLevel === 'Critical'
        ? 'ಅತ್ಯಂತ ತೀವ್ರ ಶಾಖದ ಅಪಾಯ! ತಕ್ಷಣ ಕೆಲಸ ನಿಲ್ಲಿಸಿ, ನೆರಳಿಗೆ ಹೋಗಿ ಮತ್ತು ನೀರು ಕುಡಿಯಿರಿ.'
        : 'ಶಾಖದ ಅಪಾಯ ಹೆಚ್ಚುತ್ತಿದೆ. ದಯವಿಟ್ಟು ನೀರು ಕುಡಿಯಿರಿ ಮತ್ತು ನೆರಳಿನಲ್ಲಿ ವಿಶ್ರಾಂತಿ ಪಡೆಯಿರಿ.',
      ur: riskLevel === 'Critical'
        ? 'شدید گرمی کا خطرہ! فوری طور پر کام روکیں، پانی پییں اور ٹھنڈی پناہ گاہ میں جائیں۔'
        : 'گرمی کی شدت بڑھ رہی ہے۔ براہ کرم سائے میں آرام کریں، پانی پییں اور نگران کو مطلع کریں۔',
    },
  };

  if (!aiClient) {
    return res.json({ ...fallbackAdvice, source: 'fallback_no_key' });
  }

  try {
    const prompt = `
You are the heat-health reasoning engine for "HeatShield" in Dubai, UAE.
Inputs:
- Air Temp: ${airTemp}°C, Humidity: ${humidity}%, Solar Globe: ${globeTemp}°C
- WBGT: ${wbgt?.toFixed?.(1) || wbgt}°C, Workload: ${workload}, PPE: ${ppe ? 'Yes' : 'No'}
- Acclimatized: ${acclimatized ? 'Yes' : 'No'}, Continuous Exposure: ${exposureHours}h
- Symptoms: ${symptoms.length > 0 ? symptoms.join(', ') : 'None'}
- Rule-based Level: ${riskLevel}, UAE Midday Ban Active: ${isMiddayBanActive ? 'YES' : 'NO'}

Guardrail:
Rule engine level is "${riskLevel}". You may SUGGEST RAISING risk, but NEVER lower it below "${riskLevel}".

Return JSON strictly matching schema:
- explanation: 2 sentences naming top 3 drivers of thermal stress.
- recommended_actions: 3 safe action steps for workers.
- level_suggestion: "Low" | "Moderate" | "High" | "Critical".
- alert_text: object with keys "en", "ar", "hi", "ml", "kn", "ur" (each under 25 words).
`;

    const responseText = await generateContentResilient({
      contents: prompt,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanation: { type: Type.STRING },
          recommended_actions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          level_suggestion: { type: Type.STRING },
          alert_text: {
            type: Type.OBJECT,
            properties: {
              en: { type: Type.STRING },
              ar: { type: Type.STRING },
              hi: { type: Type.STRING },
              ml: { type: Type.STRING },
              kn: { type: Type.STRING },
              ur: { type: Type.STRING },
            },
            required: ['en', 'ar', 'hi', 'ml', 'kn', 'ur'],
          },
        },
        required: ['explanation', 'recommended_actions', 'level_suggestion', 'alert_text'],
      },
    });

    if (!responseText) {
      return res.json({ ...fallbackAdvice, source: 'resilient_template' });
    }

    const parsed = JSON.parse(responseText);
    return res.json({ ...parsed, source: 'gemini' });
  } catch (err) {
    return res.json({ ...fallbackAdvice, source: 'fallback_resilient' });
  }
});

// 2. Gemini SmartShift Schedule Planner endpoint
app.post('/api/gemini/smartshift-plan', async (req: Request, res: Response) => {
  const { currentWbgt, forecastSummary, district } = req.body;

  const fallbackPlan = {
    rationale:
      `${district ? `For ${district}: ` : ''}To mitigate severe afternoon thermal strain while strictly abiding by UAE ministerial decree, heavy physical activities are rescheduled to the early morning (06:00-09:30) and late afternoon (16:00-18:00). All outdoor work is legally halted between 12:30 and 15:00.`,
    timeline: [
      {
        timeSlot: '06:00 - 09:30',
        label: 'Cool Early Window (WBGT ~25°C)',
        crewActions: {
          'Crew A': 'Steel rebar assembly in shaded yard',
          'Crew B': 'Heavy scaffolding structural erection',
          'Crew C': 'Concrete casting and structural pouring',
        },
        risk: 'Low to Moderate',
        coolingProtocol: 'Hydration every 25 mins',
        isMiddayBan: false,
      },
      {
        timeSlot: '09:30 - 12:30',
        label: 'Escalating Heat Window (WBGT ~29°C - 33°C)',
        crewActions: {
          'Crew A': 'Light prefab alignment with portable mist fans',
          'Crew B': 'Crew rotation: 30 min scaffolding / 15 min shade',
          'Crew C': 'Troweling under canopy; rotate heavy loaders',
        },
        risk: 'Moderate to High',
        coolingProtocol: '15 min shade break per 45 min work; cold electrolyte stations active',
        isMiddayBan: false,
      },
      {
        timeSlot: '12:30 - 15:00',
        label: 'UAE LEGAL MIDDAY BAN (MANDATORY STOP)',
        crewActions: {
          'Crew A': 'MANDATORY REST in air-conditioned rest station',
          'Crew B': 'MANDATORY REST in air-conditioned rest station',
          'Crew C': 'MANDATORY REST in air-conditioned rest station',
        },
        risk: 'Prohibited - Legal Stop',
        coolingProtocol: 'Full site evacuation from open sun. AC cooling stations open.',
        isMiddayBan: true,
      },
      {
        timeSlot: '15:00 - 16:30',
        label: 'Post-Ban Re-entry (WBGT ~31°C)',
        crewActions: {
          'Crew A': 'Site inspection and tool prep in shaded bays',
          'Crew B': 'Light material logistics and inventory check',
          'Crew C': 'Pre-pour inspection under temporary awnings',
        },
        risk: 'Moderate',
        coolingProtocol: 'Buddy hydration check-in; ice towel reapplication',
        isMiddayBan: false,
      },
      {
        timeSlot: '16:30 - 18:00',
        label: 'Evening Cooling Window (WBGT ~27°C)',
        crewActions: {
          'Crew A': 'Final welding inspection & site cleanup',
          'Crew B': 'Complete remaining scaffolding fastening',
          'Crew C': 'Night pour finishing and cover installation',
        },
        risk: 'Low to Moderate',
        coolingProtocol: 'Normal hydration protocol',
        isMiddayBan: false,
      },
    ],
    adherenceNotes: [
      '100% compliant with UAE MoHRE Midday Break regulations (12:30 to 15:00).',
      'Crew C (Very Heavy) exposure capped at 90 continuous minutes before mandated AC recovery.',
      'Buddy-system pairs implemented across all 3 crews.',
    ],
  };

  if (!aiClient) {
    return res.json({ ...fallbackPlan, source: 'fallback_no_key' });
  }

  try {
    const prompt = `
You are the SmartShift industrial heat scheduler for construction and logistics operations in Dubai, UAE.
Current Conditions:
${district ? `- Target District: ${district}` : ''}
- WBGT: ${currentWbgt}°C
- Forecast: ${forecastSummary || 'Peak heat between 11:30 and 15:30 with high UV index and humidity.'}
- Crews: Crew A (Moderate), Crew B (Heavy), Crew C (Very Heavy)

REGULATORY CONSTRAINTS (STRICT):
1. Between 12:30 and 15:00, all outdoor work is legally prohibited under UAE MoHRE Midday Break policy. NEVER schedule any outdoor task during this window. Mark it as mandatory air-conditioned rest and set isMiddayBan to true.
2. Shift heavy tasks to cooler morning (06:00 - 09:30) or late afternoon (16:00 - 18:00).
3. Assign rotation and cooling protocols.

Generate JSON with:
- rationale: 2-3 sentences explaining heat prevention.
- timeline: array of 5 time-slot objects (06:00 to 18:00), each with: timeSlot, label, crewActions (Crew A, Crew B, Crew C), risk, coolingProtocol, isMiddayBan (boolean).
- adherenceNotes: array of 3 bullet points.
`;

    const responseText = await generateContentResilient({
      contents: prompt,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rationale: { type: Type.STRING },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timeSlot: { type: Type.STRING },
                label: { type: Type.STRING },
                crewActions: {
                  type: Type.OBJECT,
                  properties: {
                    'Crew A': { type: Type.STRING },
                    'Crew B': { type: Type.STRING },
                    'Crew C': { type: Type.STRING },
                  },
                },
                risk: { type: Type.STRING },
                coolingProtocol: { type: Type.STRING },
                isMiddayBan: { type: Type.BOOLEAN },
              },
              required: ['timeSlot', 'label', 'risk', 'coolingProtocol', 'isMiddayBan'],
            },
          },
          adherenceNotes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['rationale', 'timeline', 'adherenceNotes'],
      },
    });

    if (!responseText) {
      return res.json({ ...fallbackPlan, source: 'resilient_template' });
    }

    const parsed = JSON.parse(responseText);
    return res.json({ ...parsed, source: 'gemini' });
  } catch (err) {
    return res.json({ ...fallbackPlan, source: 'fallback_resilient' });
  }
});

// Speech-cleaning & TTS cache helpers for crisp, rapid English & Arabic audio
interface TtsCacheEntry {
  audioBase64: string;
  mimeType: string;
  source: string;
  expiresAt: number;
}

const TTS_CACHE_TTL_MS = 10 * 60 * 1000;
const TTS_CACHE_MAX = 60;
const ttsCache = new Map<string, TtsCacheEntry>();
const ttsInFlight = new Map<string, Promise<{ audioBase64?: string; mimeType?: string; source?: string; fallback?: boolean; error?: string }>>();
const ttsModelCooldownUntil = new Map<string, number>();

function pcmToWavBase64(pcmBuffers: Buffer[], sampleRate: number = 24000): string {
  const pcmData = Buffer.concat(pcmBuffers);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // AudioFormat = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]).toString('base64');
}

async function synthesizeViaGeminiLive(
  speechText: string,
  language: 'en' | 'ar'
): Promise<{ audioBase64: string; mimeType: string; source: string } | null> {
  const client = aiBetaClient || aiClient;
  if (!client) return null;

  const blockedUntil = ttsModelCooldownUntil.get('gemini-3.8-live') || 0;
  if (blockedUntil > Date.now()) return null;

  const voiceName = language === 'ar' ? 'Kore' : 'Puck';
  const systemInstruction =
    language === 'ar'
      ? 'أنت قارئ نصوص صوتية باللغة العربية الفصحى الواضحة. اقرأ النص الذي يرسله المستخدم حرفياً وبنطق عربي سليم وهادئ دون أي إضافات أو تعليقات أو تحية.'
      : 'You are a precise text-to-speech reader. Read ONLY the exact text provided verbatim in clear natural English without adding commentary or greetings.';

  return new Promise((resolve) => {
    const pcmChunks: Buffer[] = [];
    let settled = false;
    let sessionRef: any = null;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: { audioBase64: string; mimeType: string; source: string } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (idleTimer) clearTimeout(idleTimer);
      try {
        sessionRef?.close?.();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (pcmChunks.length > 0) {
        finish({
          audioBase64: pcmToWavBase64(pcmChunks, 24000),
          mimeType: 'audio/wav',
          source: 'gemini-3.8-live',
        });
      } else {
        finish(null);
      }
    }, 12000);

    client.live
      .connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction,
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            let addedAudio = false;
            for (const part of parts) {
              if (part.inlineData?.data) {
                pcmChunks.push(Buffer.from(part.inlineData.data, 'base64'));
                addedAudio = true;
              }
            }
            if (addedAudio) {
              if (idleTimer) clearTimeout(idleTimer);
              idleTimer = setTimeout(() => {
                if (pcmChunks.length > 0) {
                  finish({
                    audioBase64: pcmToWavBase64(pcmChunks, 24000),
                    mimeType: 'audio/wav',
                    source: 'gemini-3.8-live',
                  });
                }
              }, 700);
            }
            if (message.serverContent?.turnComplete) {
              if (pcmChunks.length > 0) {
                finish({
                  audioBase64: pcmToWavBase64(pcmChunks, 24000),
                  mimeType: 'audio/wav',
                  source: 'gemini-3.8-live',
                });
              } else {
                finish(null);
              }
            }
          },
          onerror: (err: any) => {
            const errMsg = err?.message || String(err || '');
            if (errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('RESOURCE_EXHAUSTED')) {
              ttsModelCooldownUntil.set('gemini-3.8-live', Date.now() + 30000);
            }
            finish(null);
          },
          onclose: () => {
            if (pcmChunks.length > 0) {
              finish({
                audioBase64: pcmToWavBase64(pcmChunks, 24000),
                mimeType: 'audio/wav',
                source: 'gemini-3.8-live',
              });
            } else {
              finish(null);
            }
          },
        },
      })
      .then((session) => {
        if (settled) {
          try {
            session.close();
          } catch {
            // ignore
          }
          return;
        }
        sessionRef = session;
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: speechText }] }],
          turnComplete: true,
        });
      })
      .catch((err: any) => {
        const errMsg = err?.message || String(err || '');
        if (errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          ttsModelCooldownUntil.set('gemini-3.8-live', Date.now() + 30000);
        }
        finish(null);
      });
  });
}

function cleanTextForSpeech(text: string, language: string): string {
  const trimmed = text.trim().slice(0, 500);
  if (language === 'ar') {
    return trimmed
      .replace(/WBGT/gi, 'مؤشر الحرارة الرطبة')
      .replace(/MoHRE/gi, 'وزارة الموارد البشرية والتوطين')
      .replace(/PPE/gi, 'معدات الوقاية')
      .replace(/UAE/gi, 'الإمارات')
      .replace(/(\d+(?:\.\d+)?)\s*°\s*C/gi, '$1 درجة مئوية')
      .replace(/°C/gi, 'درجة مئوية')
      .replace(/(\d+)\s*%/g, '$1 في المئة')
      .replace(/\bml\b/gi, 'ملليلتر');
  }
  return trimmed
    .replace(/(\d+(?:\.\d+)?)\s*°\s*C/gi, '$1 degrees Celsius')
    .replace(/°C/gi, 'degrees Celsius')
    .replace(/\bWBGT\b/g, 'wet bulb globe temperature')
    .replace(/\bml\b/gi, 'milliliters');
}

async function synthesizeTtsInternal(
  rawText: string,
  language: string = 'en'
): Promise<{ audioBase64?: string; mimeType?: string; source?: string; fallback?: boolean; error?: string }> {
  if (!aiBetaClient && !aiAlphaClient) {
    return { fallback: true, error: 'Gemini client not initialized' };
  }

  const normalizedLang = language === 'ar' ? 'ar' : 'en';
  const speechText = cleanTextForSpeech(rawText, normalizedLang);
  const cacheKey = `${normalizedLang}:${speechText}`;

  const cached = ttsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      audioBase64: cached.audioBase64,
      mimeType: cached.mimeType,
      source: cached.source,
    };
  }

  const existingPromise = ttsInFlight.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    const voiceName = normalizedLang === 'ar' ? 'Kore' : 'Puck';
    const styleHint =
      normalizedLang === 'ar'
        ? 'Clear, warm, natural Modern Standard Arabic safety announcer speaking Arabic fluently at a calm pace'
        : 'Clear, calm, friendly English occupational safety announcer with natural pacing';

    // Put standard v1beta without metadata first (lowest latency & zero schema issues), then flash-tts fallback
    const attempts: Array<{ client: GoogleGenAI | null; model: string; withMetadata: boolean }> = [
      { client: aiBetaClient, model: 'gemini-3.8-flash-lite-tts', withMetadata: false },
      { client: aiBetaClient, model: 'gemini-3.8-flash-lite-tts', withMetadata: true },
      { client: aiBetaClient, model: 'gemini-3.8-flash-tts', withMetadata: false },
    ];

    const attemptErrors: string[] = [];
    const rateLimitedInCall = new Set<string>();

    for (const attempt of attempts) {
      if (!attempt.client) continue;
      if (rateLimitedInCall.has(attempt.model)) continue;

      const blockedUntil = ttsModelCooldownUntil.get(attempt.model) || 0;
      if (blockedUntil > Date.now()) {
        attemptErrors.push(`${attempt.model}: cooldown`);
        continue;
      }

      try {
        const part: any = { text: speechText };
        if (attempt.withMetadata) {
          part.speechMetadata = { style: styleHint };
        }

        const response = await withTimeout(
          attempt.client.models.generateContent({
            model: attempt.model,
            contents: [
              {
                role: 'user',
                parts: [part],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          }),
          7500,
          `TTS_${attempt.model}`
        );

        const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const entry: TtsCacheEntry = {
            audioBase64: inlineData.data,
            mimeType: inlineData.mimeType || 'audio/wav',
            source: attempt.model,
            expiresAt: Date.now() + TTS_CACHE_TTL_MS,
          };
          if (ttsCache.size >= TTS_CACHE_MAX) {
            const oldestKey = ttsCache.keys().next().value;
            if (oldestKey) ttsCache.delete(oldestKey);
          }
          ttsCache.set(cacheKey, entry);
          return {
            audioBase64: entry.audioBase64,
            mimeType: entry.mimeType,
            source: entry.source,
          };
        } else {
          const finishReason = response.candidates?.[0]?.finishReason || 'EMPTY_AUDIO';
          attemptErrors.push(`${attempt.model}(meta=${attempt.withMetadata}): ${finishReason}`);
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (
          errMsg.includes('429') ||
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('RESOURCE_EXHAUSTED')
        ) {
          rateLimitedInCall.add(attempt.model);
          const isPerDay = errMsg.includes('PerDay') || errMsg.includes('RequestsPerDay');
          ttsModelCooldownUntil.set(attempt.model, Date.now() + (isPerDay ? 600000 : 15000));
        }
        attemptErrors.push(`${attempt.model}(meta=${attempt.withMetadata}): fallback`);
      }
    }

    // Native audio fallback via Gemini Live API (separate quota pool, supports fluent Arabic & English)
    const liveAudio = await synthesizeViaGeminiLive(speechText, normalizedLang);
    if (liveAudio) {
      const entry: TtsCacheEntry = {
        audioBase64: liveAudio.audioBase64,
        mimeType: liveAudio.mimeType,
        source: liveAudio.source,
        expiresAt: Date.now() + TTS_CACHE_TTL_MS,
      };
      if (ttsCache.size >= TTS_CACHE_MAX) {
        const oldestKey = ttsCache.keys().next().value;
        if (oldestKey) ttsCache.delete(oldestKey);
      }
      ttsCache.set(cacheKey, entry);
      return liveAudio;
    }

    return { fallback: true, error: attemptErrors.join(' | ') || 'No audio returned from TTS model' };
  })();

  ttsInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    ttsInFlight.delete(cacheKey);
  }
}

// 2b. Voice-Based Question and Answer Facility (English & Arabic)
app.post('/api/gemini/voice-qa', async (req: Request, res: Response) => {
  const { question, preferredLanguage = 'en', context = {} } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }

  const {
    airTemp = 38.4,
    humidity = 52,
    globeTemp = 45.4,
    wbgt = 32.5,
    riskLevel = 'High',
    role = 'worker',
    isMiddayBanActive = false,
    workload = 'Moderate',
    symptoms = [],
  } = context;

  // Build heuristic fallback answer in case Gemini is offline or rate limited
  const qLower = question.toLowerCase();
  const isArabicQuery = /[\u0600-\u06FF]/.test(question);
  const targetLang: 'en' | 'ar' = preferredLanguage === 'ar' || isArabicQuery ? 'ar' : 'en';
  const wbgtNum = Number(wbgt).toFixed(1);
  const riskAr = riskLevel === 'Critical' ? 'حرج جداً' : riskLevel === 'High' ? 'مرتفع' : riskLevel === 'Moderate' ? 'معتدل' : 'منخفض';

  let fallbackAnswer = {
    answer_en: `Current heat index in Dubai is ${wbgtNum}°C with ${riskLevel} risk. Air temperature is ${airTemp}°C with ${humidity}% humidity. Drink 250ml cool water every 15 minutes and rest in shade.`,
    answer_ar: `مؤشر الحرارة الرطبة الحالي في دبي هو ${wbgtNum} درجة مئوية ومستوى الخطر ${riskAr}. احرص على شرب مئتين وخمسين ملليلتر من الماء البارد كل خمس عشرة دقيقة والراحة في الظل.`,
    key_advice:
      targetLang === 'ar'
        ? [
            'اشرب 250 مل من الماء البارد أو الأملاح المعدنية كل 15 إلى 20 دقيقة.',
            'خذ فترات راحة منتظمة في المناطق المظللة أو المكيفة.',
            'أبلغ المشرف فوراً عند الشعور بأي دوخة أو غثيان أو إرهاق شديد.',
          ]
        : [
            'Drink 250ml of cold water or electrolytes every 15-20 minutes.',
            'Take scheduled rest breaks in shaded or air-conditioned stations.',
            'Report any dizziness, nausea, or heavy fatigue immediately to your supervisor.',
          ],
    safety_tip:
      targetLang === 'ar'
        ? 'لا تنتظر الشعور بالعطش لشرب الماء، وحافظ على تغطية الرأس والرقبة.'
        : 'Do not wait until you feel thirsty to drink water. Keep your neck and head covered.',
    urgency: 'normal' as 'normal' | 'urgent' | 'emergency',
    source: 'fallback',
  };

  if (qLower.includes('midday') || qLower.includes('ban') || question.includes('حظر') || question.includes('ظهيرة')) {
    fallbackAnswer = {
      answer_en: 'Under UAE MoHRE decree, all outdoor work under direct sunlight is strictly prohibited between 12:30 PM and 3:00 PM during the summer months. Employers must provide cooled rest areas.',
      answer_ar: 'وفقاً لقرارات وزارة الموارد البشرية والتوطين في الإمارات، يُحظر العمل تحت أشعة الشمس المباشرة من الساعة الثانية عشرة والنصف ظهراً وحتى الثالثة عصراً، مع توفير استراحات مكيفة للعمال.',
      key_advice:
        targetLang === 'ar'
          ? [
              'توقف إلزامي عن العمل تحت الشمس من 12:30 ظهراً إلى 3:00 عصراً.',
              'التوجه إلى محطات الاستراحة المكيفة المخصصة في الموقع أو المدينة.',
              'الالتزام التام لحماية العمال وتجنب المخالفات التنظيمية.',
            ]
          : [
              'Mandatory halt of outdoor open sun work from 12:30 to 15:00.',
              'Use designated air-conditioned rest stations across Dubai.',
              'Violations carry strict regulatory penalties for site operators.',
            ],
      safety_tip:
        targetLang === 'ar'
          ? 'يجب انتقال جميع الفرق إلى المناطق المكيفة طوال ساعات حظر الظهيرة.'
          : 'All crews must move to air-conditioned rest areas during the ban hours.',
      urgency: 'urgent',
      source: 'fallback',
    };
  } else if (
    qLower.includes('dizzy') ||
    qLower.includes('headache') ||
    qLower.includes('nausea') ||
    qLower.includes('cramp') ||
    qLower.includes('vomit') ||
    question.includes('دوخة') ||
    question.includes('دوار') ||
    question.includes('صداع') ||
    question.includes('غثيان') ||
    question.includes('تعب')
  ) {
    fallbackAnswer = {
      answer_en: 'These are warning symptoms of heat exhaustion or heat stroke. Stop work immediately, move into an air-conditioned room, loosen PPE, drink cool water, and apply cold wet towels.',
      answer_ar: 'هذه مؤشرات خطيرة للإجهاد الحراري أو ضربة الشمس. أوقف العمل فوراً، وانتقل إلى غرفة مكيفة، وخفف معدات الوقاية، واشرب ماءً بارداً، وأبلغ المشرف أو اتصل بالإسعاف.',
      key_advice:
        targetLang === 'ar'
          ? [
              'إيقاف العمل فوراً والانتقال إلى مكان مكيف وبارد.',
              'وضع كمادات ماء بارد على الرقبة وتحت الإبطين.',
              'عند الدوار الشديد أو الإغماء اتصل فوراً على 998 للإسعاف.',
            ]
          : [
              'Immediate work stoppage and evacuation to an air-conditioned room.',
              'Apply cold wet cloths to neck, armpits, and groin.',
              'If confusion or fainting occurs, call 998 for Dubai Emergency Medical Services.',
            ],
      safety_tip:
        targetLang === 'ar'
          ? 'لا تتجاهل الدوخة أو الغثيان أبداً؛ يجب بدء التبريد خلال أقل من خمس دقائق.'
          : 'Never ignore dizziness or nausea in extreme heat—cooling must begin in under 5 minutes.',
      urgency: 'emergency',
      source: 'fallback',
    };
  } else if (qLower.includes('water') || qLower.includes('drink') || question.includes('ماء') || question.includes('شرب') || question.includes('أملاح')) {
    fallbackAnswer = {
      answer_en: 'In current Dubai thermal conditions, drink at least 250ml of cool water or electrolyte fluids every 15 to 20 minutes, even before feeling thirsty. Avoid sugary sodas.',
      answer_ar: 'في الأجواء الحارة الحالية في دبي، اشرب مئتين وخمسين ملليلتر من الماء البارد أو المشروبات الغنية بالأملاح كل خمس عشرة إلى عشرين دقيقة، وتجنب المشروبات الغازية السكرية.',
      key_advice:
        targetLang === 'ar'
          ? [
              'اشرب 250 مل ماء بارداً كل 15 إلى 20 دقيقة بانتظام.',
              'أضف أملاح الترطيب عند ارتفاع الرطوبة والتعرق الشديد.',
              'احتفظ بالماء في عبوات معزولة ومبردة دون 15 درجة مئوية.',
            ]
          : [
              'Drink 250ml every 15-20 minutes.',
              'Include electrolytes or oral rehydration salts in high humidity.',
              'Keep water shaded and below 15°C for maximum palatability.',
            ],
      safety_tip:
        targetLang === 'ar'
          ? 'تغيّر لون البول إلى الداكن يدل على الجفاف ويستوجب زيادة شرب السوائل.'
          : 'Dark urine indicates dehydration. Check your hydration status regularly.',
      urgency: 'normal',
      source: 'fallback',
    };
  } else if (
    qLower.includes('station') ||
    qLower.includes('rider') ||
    qLower.includes('rest') ||
    question.includes('محطة') ||
    question.includes('سائق') ||
    question.includes('استراحة')
  ) {
    fallbackAnswer = {
      answer_en: 'Dubai Municipality and MoHRE provide air-conditioned rest hubs with cold drinking water for delivery riders in Downtown, Business Bay, Al Barsha, Deira, and Dubai Marina.',
      answer_ar: 'توفر بلدية دبي محطات استراحة مكيفة ومزودة بماء بارد لسائقي التوصيل في وسط المدينة والخليج التجاري والبرشاء وديرة ودبي مارينا.',
      key_advice:
        targetLang === 'ar'
          ? [
              'تتوفر محطات تبريد ومياه باردة مجانية في مناطق دبي الرئيسية.',
              'توقف للراحة والتبريد لمدة 15 دقيقة بين طلبات التوصيل الطويلة.',
              'استخدم خريطة الرادار في واجهة السائق للوصول لأقرب محطة.',
            ]
          : [
              'Rest hubs are available at key Dubai districts with free cold water.',
              'Stop and cool down for 15 minutes between long delivery runs.',
              'Use the Rider View cooling map to find the nearest certified station.',
            ],
      safety_tip:
        targetLang === 'ar'
          ? 'برّد خوذة الدراجة واشرب الماء قبل استلام طلب التوصيل التالي.'
          : 'Cool your motorcycle helmet and drink water before taking the next delivery.',
      urgency: 'normal',
      source: 'fallback',
    };
  }

  if (!aiClient) {
    return res.json({ ...fallbackAnswer, source: 'fallback_no_key' });
  }

  try {
    const systemInstruction = `You are the fast bilingual Voice Q&A Safety Assistant for "HeatShield" protecting outdoor workers & delivery riders in Dubai, UAE (UAE MoHRE rules & ISO 7243).
Keep answers concise, direct, and natural to listen to aloud (2 short sentences, ~25-35 words per language).
For answer_ar: write fluent, clear Modern Standard Arabic (العربية الفصحى المبسطة) WITHOUT English words or Latin acronyms like WBGT or °C (write "مؤشر الحرارة الرطبة" and "درجة مئوية" in Arabic words so Arabic voice synthesis reads smoothly).
Write key_advice (3 brief bullets) and safety_tip (1 brief sentence) in ${targetLang === 'ar' ? 'Arabic' : 'English'}.
If symptoms (dizziness, nausea, cramps, fainting) appear, set urgency to "emergency" and advise stopping work, AC rest, cold fluids, and calling 998.`;

    const prompt = `Context: role=${role}, Ta=${airTemp}°C, RH=${humidity}%, Tg=${globeTemp}°C, WBGT=${wbgtNum}°C, Risk=${riskLevel}, Workload=${workload}, MiddayBan=${isMiddayBanActive ? 'ACTIVE(12:30-15:00)' : 'NO'}, Symptoms=${symptoms.length > 0 ? symptoms.join(',') : 'None'}.
Preferred language: ${targetLang}.
User question: "${question}"`;

    const responseText = await generateContentResilient({
      systemInstruction,
      contents: prompt,
      fast: true,
      timeoutMs: 4000,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer_en: { type: Type.STRING },
          answer_ar: { type: Type.STRING },
          key_advice: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          safety_tip: { type: Type.STRING },
          urgency: {
            type: Type.STRING,
            enum: ['normal', 'urgent', 'emergency'],
          },
        },
        required: ['answer_en', 'answer_ar', 'key_advice', 'safety_tip', 'urgency'],
      },
    });

    if (!responseText) {
      const targetSpeech = targetLang === 'ar' ? fallbackAnswer.answer_ar : fallbackAnswer.answer_en;
      void synthesizeTtsInternal(targetSpeech, targetLang);
      return res.json({ ...fallbackAnswer, source: 'resilient_fallback' });
    }

    const parsed = JSON.parse(responseText);
    // Pre-warm TTS cache immediately in the background while response is sent to client
    const primarySpeech = targetLang === 'ar' ? parsed.answer_ar : parsed.answer_en;
    if (primarySpeech) {
      void synthesizeTtsInternal(primarySpeech, targetLang);
    }

    return res.json({ ...parsed, source: 'gemini' });
  } catch (err: any) {
    const targetSpeech = targetLang === 'ar' ? fallbackAnswer.answer_ar : fallbackAnswer.answer_en;
    void synthesizeTtsInternal(targetSpeech, targetLang);
    return res.json({ ...fallbackAnswer, source: 'fallback_error' });
  }
});

// 2c. Server-Side High Quality Text-to-Speech (TTS) Endpoint
app.post('/api/gemini/tts', async (req: Request, res: Response) => {
  const { text, language = 'en' } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required for TTS synthesis' });
  }

  const result = await synthesizeTtsInternal(text, language);
  return res.json(result);
});

// 2d. Server-Side Audio Transcription Endpoint (English & Arabic via gemini-3.5-transcribe)
app.post('/api/gemini/transcribe', async (req: Request, res: Response) => {
  const { audioBase64, mimeType = 'audio/webm', language = 'en' } = req.body;

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'Audio recording data is required for transcription' });
  }

  const client = aiBetaClient || aiClient;
  if (!client) {
    return res.status(503).json({
      error: 'Gemini transcription service unavailable (missing API key)',
    });
  }

  const normalizedMime = String(mimeType).split(';')[0].trim() || 'audio/webm';
  const promptText =
    language === 'ar'
      ? 'Transcribe the spoken audio accurately into Arabic script (العربية). Output ONLY the exact spoken Arabic words with proper punctuation. Do not translate to English and do not add commentary.'
      : 'Transcribe the spoken audio accurately in English. Output ONLY the exact spoken English words with proper punctuation. Do not translate and do not add commentary.';

  const modelsToTry = ['gemini-3.5-transcribe', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const config =
        model === 'gemini-4-hydrogen'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : undefined;

      const response = await withTimeout(
        client.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: normalizedMime,
                  data: audioBase64,
                },
              },
              { text: promptText },
            ],
          },
          ...(config ? { config } : {}),
        }),
        7000,
        `TRANSCRIBE_${model}`
      );

      const transcript = (response.text || '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim();

      if (transcript) {
        return res.json({
          transcript,
          language,
          source: model,
        });
      }
    } catch (err: any) {
      lastError = 'Transcription fallback triggered';
    }
  }

  return res.status(502).json({
    error: lastError || 'Could not transcribe audio clip. Please speak clearly and try again.',
  });
});

// 3. Sensor URL Proxy endpoint (solves CORS when ESP32 writes to Firebase Realtime DB or custom REST endpoint)
app.get('/api/sensor-proxy', async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  try {
    const fetchRes = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({
        error: `Remote sensor URL returned HTTP ${fetchRes.status}`,
      });
    }

    const data = await fetchRes.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(502).json({
      error: `Failed to poll sensor URL: ${err.message || 'Connection timeout or network error'}`,
    });
  }
});

// 4. Predictive Heat Windows / Weather Forecast for UAE Coordinates (Open-Meteo Live Proxy)
app.get('/api/weather-forecast', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat) || 25.1342;
  const lon = Number(req.query.lon) || 55.2286;

  try {
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,uv_index&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,uv_index&timezone=Asia%2FDubai&forecast_days=1`;
    const omRes = await fetch(apiUrl, { signal: AbortSignal.timeout(4500) });
    if (omRes.ok) {
      const weatherData = await omRes.json();
      return res.json(weatherData);
    }
  } catch (e) {
    // Graceful failure handled below
  }

  return res.status(503).json({
    error: 'Open-Meteo live endpoint unreachable',
    staleFallbackAvailable: true,
  });
});

// 5. Occupational Crew-Level Schedule Planner (Strict Data Minimization: Zero PII/Worker Health Data)
app.post('/api/gemini/schedule-plan', async (req: Request, res: Response) => {
  const {
    siteName = 'UAE Worksite',
    hourlyWeather = [],
    roster = [],
    complianceRules = {},
    siteRestCapacityCrews = 2,
    firstAidersOnDuty = 2,
  } = req.body || {};

  if (!Array.isArray(roster) || roster.length === 0) {
    return res.status(400).json({ error: 'Anonymized crew roster rows are required.' });
  }

  // Strictly project only allowed anonymized fields before sending anything to Gemini
  const cleanRoster = roster.map((r: any) => ({
    crew_id: String(r.crew_id || 'Crew').slice(0, 24),
    taskType: String(r.taskType || 'Site Work').slice(0, 64),
    workload: ['light', 'moderate', 'heavy'].includes(r.workload) ? r.workload : 'moderate',
    exposure: ['sun', 'shade', 'indoor'].includes(r.exposure) ? r.exposure : 'sun',
    shiftStart: String(r.shiftStart || '06:00').slice(0, 5),
    shiftEnd: String(r.shiftEnd || '17:00').slice(0, 5),
    crewTag: ['new_to_site', 'returning_after_leave', 'acclimatized'].includes(r.crewTag)
      ? r.crewTag
      : 'acclimatized',
  }));
  const restCap = Math.max(1, Number(siteRestCapacityCrews) || 2);
  const firstAiders = Math.max(1, Number(firstAidersOnDuty) || 2);

  const cleanWeather = Array.isArray(hourlyWeather)
    ? hourlyWeather.slice(0, 18).map((h: any) => ({
        hourIndex: Number(h.hourIndex),
        hourLabel: String(h.hourLabel || ''),
        airTempC: Number(h.airTempC),
        relativeHumidityPct: Number(h.relativeHumidityPct),
        windSpeedKmh: Number(h.windSpeedKmh),
        solarRadiationWm2: Number(h.solarRadiationWm2),
        wbgtEstimatedC: Number(h.wbgtEstimatedC),
        heatIndexEstimatedC: Number(h.heatIndexEstimatedC),
      }))
    : [];

  if (!aiClient) {
    return res.json({ source: 'deterministic_no_key', crewBlocks: [] });
  }

  try {
    const systemInstruction = `You are an occupational heat-safety schedule planner for UAE outdoor worksites.
STRICT DATA MINIMIZATION: Work ONLY with anonymized crew_id rows, hourly weather readings, and deterministic UAE compliance limits. Never mention or infer individual worker health.
UAE RULES:
- UAE MOHRE Midday Break Rule (15 June – 15 September): outdoor work under direct sun (exposure="sun") is strictly prohibited between 12:30 and 15:00.
  * For hourIndex=12 (12:00-13:00) on sun crews: max workMinutes=30 (ending 12:30), restMinutes=30.
  * For hourIndex=13 and hourIndex=14 on sun crews: workMinutes=0, restMinutes=60, restLocation="air_conditioned_rest".
- Provide shaded_shelter or air_conditioned_rest and 500-1000 ml/hr hydration during elevated estimated WBGT.
- Suggest shifting heavy open-sun tasks to early morning (06:00-09:00) and apply conservative rest for new_to_site / returning_after_leave crews.
- Stagger rest breaks outside midday stop so simultaneous resting crews do not exceed site rest-area capacity (${restCap} crews max) and first-aider coverage (${firstAiders} on duty) stays continuous.`;

    const prompt = `Site: ${String(siteName).slice(0, 60)}
Site Rest-Area Capacity: ${restCap} crews simultaneously · First-Aiders on Duty: ${firstAiders}
Compliance Rules Summary: ${JSON.stringify(complianceRules).slice(0, 1200)}
Anonymized Crew Roster: ${JSON.stringify(cleanRoster)}
Hourly Estimated Thermal Forecast: ${JSON.stringify(cleanWeather)}

Return JSON with:
- riskDriversExplanation: 2 plain-language sentences summarizing the top thermal risk drivers (air temp, humidity, wind, solar radiation, estimated WBGT).
- whyThisSchedule: 2 concise sentences explaining why rest cycles and task timings were staggered/placed where they are.
- suggestedTaskReordering: 2-3 actionable crew-level task reordering bullets (e.g. moving heavy sun work to 06:00-09:00).
- crewBlocks: array covering each crew's active shift hours (06..19), each object having crew_id, hourIndex (number), exposure ("sun"|"shade"|"indoor"), workMinutes (0-60), restMinutes (0-60, workMinutes+restMinutes=60), restLocation ("none_needed"|"shaded_shelter"|"air_conditioned_rest"|"indoor_cool_zone"), hydrationMlPerHour (500|750|1000), taskNote, suggestedTaskReordering.`;

    const responseText = await generateContentResilient({
      systemInstruction,
      contents: prompt,
      fast: false,
      timeoutMs: 9000,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskDriversExplanation: { type: Type.STRING },
          whyThisSchedule: { type: Type.STRING },
          suggestedTaskReordering: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          crewBlocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                crew_id: { type: Type.STRING },
                hourIndex: { type: Type.INTEGER },
                exposure: { type: Type.STRING },
                workMinutes: { type: Type.INTEGER },
                restMinutes: { type: Type.INTEGER },
                restLocation: { type: Type.STRING },
                hydrationMlPerHour: { type: Type.INTEGER },
                taskNote: { type: Type.STRING },
                suggestedTaskReordering: { type: Type.STRING },
              },
              required: [
                'crew_id',
                'hourIndex',
                'exposure',
                'workMinutes',
                'restMinutes',
                'restLocation',
                'hydrationMlPerHour',
              ],
            },
          },
        },
        required: [
          'riskDriversExplanation',
          'whyThisSchedule',
          'suggestedTaskReordering',
          'crewBlocks',
        ],
      },
    });

    if (!responseText) {
      return res.json({ source: 'deterministic_fallback', crewBlocks: [] });
    }

    const parsed = JSON.parse(responseText);
    return res.json({ ...parsed, source: 'gemini' });
  } catch (err: any) {
    console.log('Schedule plan Gemini fallback:', err?.message?.slice(0, 120));
    return res.json({ source: 'deterministic_fallback', crewBlocks: [] });
  }
});

// 6. Anonymous Shady Area Registry (Zero PII: stationId, siteId, crew_id, timestamp only)
interface ServerShadeCheckIn {
  id: string;
  stationId: string;
  stationName: string;
  siteId: string;
  crew_id: string;
  coolingType: 'ac_hall' | 'misting_tent' | 'shaded_canopy';
  checkedInAtIso: string;
  method: 'qr_scan' | 'quick_tap';
}

const SHADE_REGISTRY_MAX = 250;
let shadeRegistryStore: ServerShadeCheckIn[] = [];

function pruneOldShadeEntries() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  shadeRegistryStore = shadeRegistryStore.filter((entry) => {
    const ts = Date.parse(entry.checkedInAtIso);
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

app.get('/api/shade-registry', (req: Request, res: Response) => {
  pruneOldShadeEntries();
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId.trim() : '';
  const items = siteId
    ? shadeRegistryStore.filter((e) => e.siteId === siteId)
    : shadeRegistryStore;
  res.json({ entries: items, count: items.length });
});

app.post('/api/shade-registry', (req: Request, res: Response) => {
  pruneOldShadeEntries();
  const body = req.body || {};

  // Strictly whitelist ONLY non-PII station + crew fields
  const stationId = String(body.stationId || 'SHADE-A1').trim().slice(0, 32);
  const stationName = String(body.stationName || 'Shaded Rest Station').trim().slice(0, 80);
  const siteId = String(body.siteId || 'dubai').trim().slice(0, 32);
  const crew_id = String(body.crew_id || 'Site-Crew').trim().slice(0, 24);
  const coolingType: ServerShadeCheckIn['coolingType'] =
    body.coolingType === 'ac_hall' ||
    body.coolingType === 'misting_tent' ||
    body.coolingType === 'shaded_canopy'
      ? body.coolingType
      : 'shaded_canopy';
  const method: ServerShadeCheckIn['method'] =
    body.method === 'qr_scan' ? 'qr_scan' : 'quick_tap';

  const entry: ServerShadeCheckIn = {
    id: `shade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stationId,
    stationName,
    siteId,
    crew_id,
    coolingType,
    checkedInAtIso: new Date().toISOString(),
    method,
  };

  shadeRegistryStore = [entry, ...shadeRegistryStore].slice(0, SHADE_REGISTRY_MAX);
  res.status(201).json({ entry, entries: shadeRegistryStore });
});

app.post('/api/shade-registry/clear', (req: Request, res: Response) => {
  const stationId = typeof req.body?.stationId === 'string' ? req.body.stationId.trim() : '';
  if (stationId) {
    shadeRegistryStore = shadeRegistryStore.filter((e) => e.stationId !== stationId);
  } else {
    shadeRegistryStore = [];
  }
  res.json({ ok: true, entries: shadeRegistryStore });
});

// 7. Gemini Crew-Level Acclimatization Guidance Planner (Zero PII)
app.post('/api/gemini/acclimatization-plan', async (req: Request, res: Response) => {
  const body = req.body || {};
  const crew_id = String(body.crew_id || 'Crew-A').slice(0, 24);
  const status = ['new_to_site', 'returning_after_leave', 'acclimatized'].includes(body.status)
    ? body.status
    : 'new_to_site';
  const currentWbgt = Number(body.wbgtEstimatedC ?? body.currentWbgt) || 30.5;
  const taskType = String(body.taskType || 'Outdoor construction').slice(0, 64);

  const deterministicPcts =
    status === 'new_to_site' ? [20, 40, 60, 80, 100] : status === 'returning_after_leave' ? [50, 75, 90, 100] : [100];
  const fallbackAcclim = {
    crew_id,
    status,
    generatedAtIso: new Date().toISOString(),
    source: 'deterministic',
    summary:
      status === 'acclimatized'
        ? `${crew_id} is marked acclimatized for ${taskType}. Follow live WBGT work-rest schedules. General guidance, verify with your HSE officer.`
        : `${crew_id} (${status.replace(/_/g, ' ')}) should follow a gradual ${deterministicPcts.length}-day heat adaptation ramp. General guidance, verify with your HSE officer.`,
    days: deterministicPcts.map((pct, idx) => ({
      day: idx + 1,
      maxExposurePct: pct,
      recommendedWorkload: pct <= 45 ? 'light' : pct <= 80 ? 'moderate' : 'heavy',
      workRestNote:
        pct <= 45
          ? `Cap hot-zone exposure at ~${pct}% of full shift; prioritize early cool hours with 30m rest/hr.`
          : pct <= 80
          ? `Limit hot-zone exposure to ~${pct}% with 15m shaded/AC recovery every hour.`
          : `Standard site shift cadence (${pct}%) once moderate heat load is tolerated cleanly.`,
      guidanceNote: 'General guidance, verify with your HSE officer.',
    })),
    disclaimer:
      'General guidance, verify with your HSE officer. Automated environmental guidance only. Not a medical diagnosis or treatment.',
  };

  if (!aiClient) {
    return res.json(fallbackAcclim);
  }

  try {
    const prompt = `Provide general occupational-hygiene guidance for a multi-day heat acclimatization ramp in UAE summer conditions.
STRICT RULES:
- Crew-level guidance ONLY (${crew_id}, task: ${taskType}, tag: ${status}, est. WBGT: ${currentWbgt}°C).
- Do NOT diagnose medical conditions or recommend clinical treatment.
- End summary with "General guidance, verify with your HSE officer."
Return JSON with:
- summary: 2 short sentences explaining the gradual exposure ramp.
- days: array of 4 to 5 objects, each with day (number 1..5), maxExposurePct (number 20..100), recommendedWorkload ("light"|"moderate"|"heavy"), workRestNote (string), guidanceNote (string).`;

    const responseText = await generateContentResilient({
      contents: prompt,
      fast: true,
      timeoutMs: 12000,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER },
                maxExposurePct: { type: Type.INTEGER },
                recommendedWorkload: { type: Type.STRING },
                workRestNote: { type: Type.STRING },
                guidanceNote: { type: Type.STRING },
              },
              required: ['day', 'maxExposurePct', 'recommendedWorkload', 'workRestNote', 'guidanceNote'],
            },
          },
        },
        required: ['summary', 'days'],
      },
    });

    if (!responseText) {
      return res.json(fallbackAcclim);
    }

    const parsed = JSON.parse(responseText);
    return res.json({
      ...parsed,
      crew_id,
      status,
      generatedAtIso: new Date().toISOString(),
      source: 'gemini',
      disclaimer:
        'General guidance, verify with your HSE officer. Automated environmental guidance only. Not a medical diagnosis or treatment.',
    });
  } catch {
    return res.json(fallbackAcclim);
  }
});

// 8. Gemini What-If Simulator Trade-off Explanation (Zero PII)
app.post('/api/gemini/whatif-tradeoff', async (req: Request, res: Response) => {
  const b = req.body || {};
  const fallbackExplanation = `At ${Number(b.airTempC || 42).toFixed(1)}°C ambient and ${Number(b.effectiveWbgtC || 31).toFixed(1)}°C effective est. WBGT during ${String(b.shiftStartHour || 13)}:00, deterministic UAE evaluation is "${String(b.complianceStatus || 'At risk')}". Shifting heavy exertion outside midday peak or increasing shaded rest protects compliance with minimal shift-output loss.`;

  if (!aiClient) {
    return res.json({ tradeoffExplanation: fallbackExplanation, source: 'deterministic' });
  }

  try {
    const prompt = `Summarize the occupational heat-scheduling trade-offs in 2 concise sentences for a UAE site coordinator:
Simulated inputs: Air Temp ${Number(b.airTempC)}°C, Humidity ${Number(b.humidityPct)}%, Shift Start ${String(b.shiftStartHour)}:00, Workload ${String(b.workload)}, Rest ${Number(b.restMinutesPerHour)} min/hr, Zone ${String(b.zoneType)}, Effective Est. WBGT ${Number(b.effectiveWbgtC)}°C, Deterministic Compliance Verdict: ${String(b.complianceStatus)}.
Do NOT give medical advice or diagnosis. Focus on productivity vs. heat-risk & UAE compliance trade-off.`;

    const responseText = await generateContentResilient({
      contents: prompt,
      fast: true,
      timeoutMs: 5500,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tradeoffExplanation: { type: Type.STRING },
        },
        required: ['tradeoffExplanation'],
      },
    });

    if (!responseText) {
      return res.json({ tradeoffExplanation: fallbackExplanation, source: 'deterministic' });
    }
    const parsed = JSON.parse(responseText);
    return res.json({ ...parsed, source: 'gemini' });
  } catch {
    return res.json({ tradeoffExplanation: fallbackExplanation, source: 'deterministic' });
  }
});

// 9. Anonymous Site-Level Heat Incident & Near-Miss Log (For site learning only, zero PII)
interface ServerIncidentEntry {
  id: string;
  occurredAtIso: string;
  hourOfDay: number;
  zoneLabel: string;
  airTempC: number;
  wbgtEstimatedC: number;
  actionTaken: string;
  notes: string;
}

let anonymousIncidentsStore: ServerIncidentEntry[] = [];

app.get('/api/incidents', (_req: Request, res: Response) => {
  res.json({ entries: anonymousIncidentsStore });
});

app.post('/api/incidents', (req: Request, res: Response) => {
  const b = req.body || {};
  const hourOfDay = Math.max(0, Math.min(23, Number(b.hourOfDay) || new Date().getHours()));
  const entry: ServerIncidentEntry = {
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    occurredAtIso: String(b.occurredAtIso || new Date().toISOString()).slice(0, 40),
    hourOfDay,
    zoneLabel: String(b.zoneLabel || 'Zone A').trim().slice(0, 48),
    airTempC: Number(b.airTempC) || 40.0,
    wbgtEstimatedC: Number(b.wbgtEstimatedC) || 30.0,
    actionTaken: String(b.actionTaken || 'Crew moved to shaded cool-down station').trim().slice(0, 140),
    notes: String(b.notes || 'Anonymous environmental learning note').trim().slice(0, 200),
  };
  anonymousIncidentsStore = [entry, ...anonymousIncidentsStore].slice(0, 150);
  res.status(201).json({ entry, entries: anonymousIncidentsStore });
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', port: PORT });
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });

    app.use(async (req: Request, res: Response, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HeatShield server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
