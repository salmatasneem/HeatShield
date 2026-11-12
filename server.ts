import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize GoogleGenAI server-side with User-Agent header
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Resilient helper to call Gemini with automatic fallback: gemini-3.8-flash -> gemini-3.1-flash-lite
async function generateContentResilient(params: {
  contents: string;
  responseSchema?: any;
}) {
  if (!aiClient) return null;

  // 1. Try primary model: gemini-3.8-flash
  try {
    const config: any = { responseMimeType: 'application/json' };
    if (params.responseSchema) config.responseSchema = params.responseSchema;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: params.contents,
      config,
    });
    return response.text;
  } catch (primaryErr: any) {
    const status = primaryErr?.status || primaryErr?.error?.code || primaryErr?.code;
    const msg = primaryErr?.message || '';

    // If 503 (high demand) or 429 (rate limit), attempt fallback model gemini-3.1-flash-lite
    if (status === 503 || status === 'UNAVAILABLE' || msg.includes('high demand') || status === 429) {
      console.log('Gemini 3.8 Flash experiencing temporary demand spike. Routing to Gemini 3.1 Flash Lite fallback...');
      try {
        const config: any = { responseMimeType: 'application/json' };
        if (params.responseSchema) config.responseSchema = params.responseSchema;

        const fallbackResponse = await aiClient.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: params.contents,
          config,
        });
        return fallbackResponse.text;
      } catch (fallbackErr: any) {
        console.log('Gemini models temporarily at peak capacity, serving pre-verified deterministic rule template.');
        return null;
      }
    }

    console.log('Gemini request notice:', msg.slice(0, 80));
    return null;
  }
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
  const { currentWbgt, forecastSummary } = req.body;

  const fallbackPlan = {
    rationale:
      'To mitigate severe afternoon thermal strain while strictly abiding by UAE ministerial decree, heavy physical activities are rescheduled to the early morning (06:00-09:30) and late afternoon (16:00-18:00). All outdoor work is legally halted between 12:30 and 15:00.',
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
- WBGT: ${currentWbgt}°C
- Forecast: ${forecastSummary || 'Peak heat between 11:30 and 15:30 with high UV index and humidity.'}
- Crews: Crew A (Moderate), Crew B (Heavy), Crew C (Very Heavy)

REGULATORY CONSTRAINTS (STRICT):
1. Between 12:30 and 15:00, all outdoor work is legally prohibited under UAE MoHRE Midday Break policy. NEVER schedule any outdoor task during this window. Mark it as mandatory air-conditioned rest.
2. Shift heavy tasks to cooler morning (06:00 - 09:30) or late afternoon (16:00 - 18:00).
3. Assign rotation and cooling protocols.

Generate JSON with:
- rationale: 2-3 sentences explaining heat prevention.
- timeline: array of 5 time-slot objects (06:00 to 18:00), each with: timeSlot, label, crewActions (Crew A, B, C), risk, coolingProtocol, isMiddayBan (boolean).
- adherenceNotes: array of 3 bullet points.
`;

    const responseText = await generateContentResilient({
      contents: prompt,
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
  const targetLang = preferredLanguage === 'ar' || isArabicQuery ? 'ar' : 'en';

  let fallbackAnswer = {
    answer_en: `Current WBGT in Dubai is ${Number(wbgt).toFixed(1)}°C with ${riskLevel} risk level. Air temperature is ${airTemp}°C with ${humidity}% humidity. Please drink 250ml cold water every 15 minutes, rest in shade, and comply with safety rules.`,
    answer_ar: `مؤشر الحرارة الرطبة الكروية (WBGT) الحالي في دبي هو ${Number(wbgt).toFixed(1)} درجة مئوية، ومستوى الخطر ${riskLevel === 'Critical' ? 'حرج جداً' : riskLevel === 'High' ? 'مرتفع' : 'معتدل'}. احرص على شرب 250 مل ماء بارد كل 15 دقيقة والراحة في الظل.`,
    key_advice: [
      'Drink 250ml of cold water or electrolytes every 15-20 minutes.',
      'Take scheduled rest breaks in shaded or air-conditioned rest stations.',
      'Report any dizziness, nausea, or heavy fatigue immediately to your supervisor.',
    ],
    safety_tip: 'Do not wait until you feel thirsty to drink water. Keep your neck and head covered.',
    urgency: 'normal' as 'normal' | 'urgent' | 'emergency',
    source: 'fallback',
  };

  if (qLower.includes('midday') || qLower.includes('ban') || question.includes('حظر') || question.includes('ظهيرة')) {
    fallbackAnswer = {
      answer_en: 'Under UAE MoHRE decree, all outdoor work under direct sunlight is strictly prohibited between 12:30 PM and 3:00 PM during the summer months. Employers must provide cooled rest areas.',
      answer_ar: 'وفقاً لقرارات وزارة الموارد البشرية والتوطين في دولة الإمارات، يُحظر العمل في الأماكن المكشوفة وتحت أشعة الشمس من الساعة 12:30 ظهراً وحتى 3:00 عصراً، مع توفير استراحات مكيفة للعمال.',
      key_advice: [
        'Mandatory halt of outdoor open sun work from 12:30 to 15:00.',
        'Use designated air-conditioned rest stations across Dubai.',
        'Violations carry strict regulatory penalties for site operators.',
      ],
      safety_tip: 'All crews must move to air-conditioned rest areas during the ban hours.',
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
    question.includes('صداع') ||
    question.includes('غثيان') ||
    question.includes('تعب')
  ) {
    fallbackAnswer = {
      answer_en: 'These are early warning symptoms of heat exhaustion or heat stroke! Stop physical work immediately, move into an air-conditioned room, loosen PPE, drink cool water, and apply cold towels.',
      answer_ar: 'هذه مؤشرات خطيرة للإجهاد الحراري أو ضربة الشمس! أوقف العمل الميداني فوراً، توجه إلى غرفة مكيفة، خفف ملابس ومعدات الوقاية، اشرب ماء بارداً، وأبلغ المشرف فوراً.',
      key_advice: [
        'Immediate work stoppage and evacuation to an air-conditioned room.',
        'Apply cold wet cloths to neck, armpits, and groin.',
        'If confusion or fainting occurs, call 998 for Dubai Emergency Medical Services.',
      ],
      safety_tip: 'Never ignore dizziness or nausea in extreme heat—cooling must begin in under 5 minutes.',
      urgency: 'emergency',
      source: 'fallback',
    };
  } else if (qLower.includes('water') || qLower.includes('drink') || question.includes('ماء') || question.includes('شرب')) {
    fallbackAnswer = {
      answer_en: 'In current Dubai thermal conditions, drink at least 250ml of cool water or electrolyte-rich fluids every 15 to 20 minutes, even if you are not thirsty. Avoid sugary sodas or energy drinks.',
      answer_ar: 'في الأجواء الحارة الحالية في دبي، اشرب ما لا يقل عن 250 مل من الماء البارد أو المشروبات الغنية بالأملاح كل 15 إلى 20 دقيقة، حتى دون الشعور بالعطش. تجنب المشروبات الغازية السكرية.',
      key_advice: [
        'Drink 250ml every 15-20 minutes.',
        'Include electrolytes or oral rehydration salts in high humidity.',
        'Keep water shaded and below 15°C for maximum palatability.',
      ],
      safety_tip: 'Dark urine indicates dehydration. Check your hydration status regularly.',
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
      answer_en: 'Dubai Municipality and MoHRE provide hundreds of air-conditioned rest hubs with cold drinking water for delivery riders in Downtown, Business Bay, Al Barsha, Deira, and Dubai Marina.',
      answer_ar: 'توفر بلدية دبي ووزارة الموارد البشرية والتوطين مئات محطات الاستراحة المكيفة والمزودة بماء بارد وشواحن لسائقي التوصيل في وسط المدينة، الخليج التجاري، البرشاء، ديرة، ودبي مارينا.',
      key_advice: [
        'Rest hubs are available at key Dubai districts with free cold water.',
        'Stop and cool down for 15 minutes between long delivery runs.',
        'Use the Rider View cooling map to find the nearest certified station.',
      ],
      safety_tip: 'Cool your motorcycle helmet and drink water before taking the next delivery.',
      urgency: 'normal',
      source: 'fallback',
    };
  }

  if (!aiClient) {
    return res.json({ ...fallbackAnswer, source: 'fallback_no_key' });
  }

  try {
    const prompt = `
You are the bilingual Voice Q&A Safety Assistant for "HeatShield", an occupational heat-health system for outdoor workers and delivery riders in Dubai, UAE.

CURRENT CONDITIONS & CONTEXT:
- Role of user: ${role}
- Air Temperature: ${airTemp}°C, Humidity: ${humidity}%, Solar Globe: ${globeTemp}°C
- Calculated WBGT: ${wbgt}°C, Risk Level: ${riskLevel}
- Workload: ${workload}, Midday Ban Active: ${isMiddayBanActive ? 'YES (12:30-15:00 legal stop)' : 'NO'}
- Reported symptoms: ${symptoms.length > 0 ? symptoms.join(', ') : 'None reported'}

USER QUESTION: "${question}"
USER PREFERRED LANGUAGE: ${targetLang}

REQUIREMENTS:
1. Provide a spoken-friendly, conversational, direct response designed to be LISTENED TO aloud through speech synthesis. Keep sentences clear, crisp, and under 50 words per language.
2. Provide answers in BOTH English (answer_en) AND authentic Dubai Arabic (answer_ar). Use standard Arabic (فصحى مبسطة وواضحة جداً) suitable for construction workers and delivery riders in the UAE.
3. If the user mentions symptoms (dizziness, nausea, vomiting, fainting, cramps), prioritize emergency first-aid protocols (stop work, cool shelter, hydrate, alert supervisor, call 998).
4. Strictly align with UAE Ministry of Human Resources and Emiratisation (MoHRE) regulations and ISO 7243 standards.
5. Return JSON matching the schema.
`;

    const responseText = await generateContentResilient({
      contents: prompt,
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
      return res.json({ ...fallbackAnswer, source: 'resilient_fallback' });
    }

    const parsed = JSON.parse(responseText);
    return res.json({ ...parsed, source: 'gemini' });
  } catch (err: any) {
    return res.json({ ...fallbackAnswer, source: 'fallback_error' });
  }
});

// 2c. Server-Side High Quality Text-to-Speech (TTS) Endpoint
app.post('/api/gemini/tts', async (req: Request, res: Response) => {
  const { text, language = 'en' } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required for TTS synthesis' });
  }

  if (!aiClient) {
    return res.json({ fallback: true, message: 'Gemini client not initialized; use client-side speech synthesis' });
  }

  try {
    const voiceName = language === 'ar' ? 'Kore' : 'Puck';
    const truncatedText = text.slice(0, 450); // Keep within fast real-time TTS window

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: truncatedText,
              speechMetadata: {
                style: language === 'ar' ? 'Clear, protective voice in authentic Arabic' : 'Clear, friendly occupational safety voice',
              },
            },
          ],
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
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        source: 'gemini-3.8-flash-lite-tts',
      });
    }

    return res.json({ fallback: true });
  } catch (err: any) {
    console.log('Gemini TTS fallback note:', err?.message?.slice?.(0, 80));
    return res.json({ fallback: true, error: err.message });
  }
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

// 4. Predictive Heat Windows / Weather Forecast for Dubai
app.get('/api/weather-forecast', async (_req: Request, res: Response) => {
  try {
    const apiUrl =
      'https://api.open-meteo.com/v1/forecast?latitude=25.2048&longitude=55.2708&hourly=temperature_2m,relative_humidity_2m,direct_normal_irradiance&timezone=Asia%2FDubai&forecast_days=1';
    const omRes = await fetch(apiUrl, { signal: AbortSignal.timeout(3500) });
    if (omRes.ok) {
      const weatherData = await omRes.json();
      return res.json(weatherData);
    }
  } catch (e) {
    // Graceful fallback to synthetic high-fidelity forecast
  }

  // Realistic Dubai Summer Hourly Forecast fallback
  const fallbackHours = [
    { hour: '06:00', temp: 31, rh: 65, wbgt: 26.2, status: 'Safe' },
    { hour: '08:00', temp: 35, rh: 58, wbgt: 29.4, status: 'Caution' },
    { hour: '10:00', temp: 39, rh: 48, wbgt: 31.8, status: 'Caution' },
    { hour: '12:00', temp: 42, rh: 42, wbgt: 34.1, status: 'High Risk' },
    { hour: '13:00', temp: 43.5, rh: 40, wbgt: 35.0, status: 'Midday Ban (Stop)' },
    { hour: '14:30', temp: 44, rh: 38, wbgt: 34.8, status: 'Midday Ban (Stop)' },
    { hour: '16:00', temp: 41, rh: 45, wbgt: 33.2, status: 'Caution' },
    { hour: '18:00', temp: 37, rh: 55, wbgt: 30.1, status: 'Caution' },
  ];
  return res.json({ fallback: true, hours: fallbackHours });
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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
