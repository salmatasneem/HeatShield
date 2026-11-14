import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Square,
  Send,
  X,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { RiskEvaluation, Role, VoiceQaMessage, VoiceQaResponse } from '../types';
import { AppLocale, UI_TRANSLATIONS } from '../utils/i18n';
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  playTtsOrFallback,
  stopAllSpeech,
  SpeechRecognizerHandle,
} from '../utils/speech';

interface VoiceQaModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluation: RiskEvaluation;
  role: Role;
  locale: AppLocale;
}

const PRESET_QUESTIONS: Array<{
  id: string;
  en: string;
  ar: string;
  icon: string;
}> = [
  {
    id: 'safe-work',
    en: 'Is it safe to work outdoors right now?',
    ar: 'هل العمل في الخارج آمن في الوقت الحالي؟',
    icon: '☀️',
  },
  {
    id: 'midday-ban',
    en: 'When does the UAE midday ban start and what are the rules?',
    ar: 'متى يبدأ حظر العمل وقت الظهيرة وما هي الشروط؟',
    icon: '🛑',
  },
  {
    id: 'hydration',
    en: 'How much water and electrolytes should I drink today?',
    ar: 'كمية الماء والأملاح التي يجب أن أتناولها اليوم؟',
    icon: '💧',
  },
  {
    id: 'symptoms',
    en: 'I feel dizzy and have muscle cramps, what should I do?',
    ar: 'أشعر بدوار وتقلصات عضلية، ما هي الإسعافات الأولية؟',
    icon: '⚠️',
  },
  {
    id: 'cooling-stations',
    en: 'Where can delivery riders find rest hubs with cold water in Dubai?',
    ar: 'أين محطات استراحة سائقي التوصيل المكيفة في دبي؟',
    icon: '🛵',
  },
];

function getSupportedRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio'));
    reader.readAsDataURL(blob);
  });
}

export const VoiceQaModal: React.FC<VoiceQaModalProps> = ({
  isOpen,
  onClose,
  evaluation,
  role,
  locale,
}) => {
  const t = UI_TRANSLATIONS[locale];
  const [selectedLang, setSelectedLang] = useState<'en' | 'ar'>(locale === 'ar' ? 'ar' : 'en');
  const [inputQuestion, setInputQuestion] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lastTranscriptBanner, setLastTranscriptBanner] = useState<{
    text: string;
    lang: 'en' | 'ar';
  } | null>(null);
  const [autoSendVoice, setAutoSendVoice] = useState<boolean>(true);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [micPermissionState, setMicPermissionState] = useState<
    'idle' | 'requesting' | 'granted' | 'denied'
  >('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playingLang, setPlayingLang] = useState<'en' | 'ar' | null>(null);
  const [speechSpeed, setSpeechSpeed] = useState<number>(0.95);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognizerRef = useRef<SpeechRecognizerHandle | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const browserTranscriptRef = useRef<string>('');
  const stoppingManuallyRef = useRef<boolean>(false);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);
  const selectedLangRef = useRef<'en' | 'ar'>(selectedLang);
  const isLoadingRef = useRef<boolean>(isLoading);
  const autoSendVoiceRef = useRef<boolean>(autoSendVoice);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    selectedLangRef.current = selectedLang;
  }, [selectedLang]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    autoSendVoiceRef.current = autoSendVoice;
  }, [autoSendVoice]);

  // Sync active Q&A language when global app locale changes
  useEffect(() => {
    setSelectedLang(locale === 'ar' ? 'ar' : 'en');
  }, [locale]);

  const buildWelcomeMessage = (
    evalData: RiskEvaluation,
    lang: 'en' | 'ar'
  ): VoiceQaMessage => ({
    id: `welcome-${Date.now()}`,
    sender: 'assistant',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    answer_en: `Hello! I am your HeatShield Safety Voice Assistant. Current WBGT in Dubai is ${evalData.wbgt.toFixed(1)}°C (${evalData.riskLevel} Risk). Tap the microphone to speak your question in English or Arabic, or select a quick topic below.`,
    answer_ar: `مرحباً بك! أنا مساعد درع الحرارة الصوتي لحمايتك في الميدان. مؤشر WBGT الحالي في دبي هو ${evalData.wbgt.toFixed(1)} درجة مئوية. اضغط على الميكروفون للتحدث بصوتك بالعربية أو الإنجليزية أو اختر سؤالاً سريعاً.`,
    key_advice:
      lang === 'ar'
        ? [
            'الأسئلة الصوتية والنص الدقيق مدعومان باللغتين العربية والإنجليزية.',
            'يمكنك الاستماع إلى الإجابة صوتياً أو قراءتها في أي وقت.',
          ]
        : [
            'Microphone speech capture & accurate transcripts work in both English and Arabic.',
            'You can hear the answer aloud or read it at any time.',
          ],
    safety_tip:
      lang === 'ar'
        ? 'احرص دائماً على شرب الماء وأبلغ المشرف فوراً إذا شعرت بأي تعب.'
        : 'Always stay hydrated and inform your supervisor immediately if you feel unwell.',
    urgency: 'normal',
    language: lang,
  });

  const [messages, setMessages] = useState<VoiceQaMessage[]>(() => [
    buildWelcomeMessage(evaluation, locale === 'ar' ? 'ar' : 'en'),
  ]);

  const releaseMediaResources = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setAudioLevel(0);

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }

    if (recognizerRef.current) {
      try {
        recognizerRef.current.stop();
      } catch {
        // ignore
      }
      recognizerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
  }, []);

  // Clean up audio & speech recognition on close or unmount
  useEffect(() => {
    if (!isOpen) {
      stopAllSpeech();
      setPlayingMessageId(null);
      setPlayingLang(null);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          stoppingManuallyRef.current = false;
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      releaseMediaResources();
      setIsListening(false);
      setIsTranscribing(false);
    }
    return () => {
      stopAllSpeech();
      releaseMediaResources();
    };
  }, [isOpen, releaseMediaResources]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, interimText, isTranscribing]);

  if (!isOpen) return null;

  const handleResetChat = () => {
    stopAllSpeech();
    setPlayingMessageId(null);
    setPlayingLang(null);
    setErrorMessage(null);
    setLastTranscriptBanner(null);
    setMessages([buildWelcomeMessage(evaluation, selectedLang)]);
  };

  const handlePlayVoice = async (
    messageId: string,
    text: string,
    lang: 'en' | 'ar'
  ) => {
    if (!text.trim()) return;

    if (playingMessageId === messageId && playingLang === lang) {
      stopAllSpeech();
      setPlayingMessageId(null);
      setPlayingLang(null);
      return;
    }

    stopAllSpeech();
    setPlayingMessageId(messageId);
    setPlayingLang(lang);

    await playTtsOrFallback(
      text,
      lang,
      () => {
        if (isOpenRef.current) {
          setPlayingMessageId(messageId);
          setPlayingLang(lang);
        }
      },
      () => {
        setPlayingMessageId((curr) => (curr === messageId ? null : curr));
        setPlayingLang((curr) => (curr === lang ? null : curr));
      },
      speechSpeed
    );
  };

  const handleSendQuestion = async (queryToSend?: string, explicitLang?: 'en' | 'ar') => {
    const questionText = (queryToSend ?? inputQuestion).trim();
    if (!questionText || isLoadingRef.current) return;

    // Auto-detect Arabic script in typed or spoken queries so Arabic answers & Arabic voice play automatically
    const hasArabicScript = /[\u0600-\u06FF]/.test(questionText);
    const activeLang: 'en' | 'ar' = explicitLang || (hasArabicScript ? 'ar' : selectedLangRef.current);

    if (hasArabicScript && selectedLangRef.current !== 'ar') {
      setSelectedLang('ar');
    }

    setInputQuestion('');
    setInterimText('');
    setErrorMessage(null);
    stopAllSpeech();
    setPlayingMessageId(null);
    setPlayingLang(null);

    const userMsgId = `user-${Date.now()}`;
    const newMsg: VoiceQaMessage = {
      id: userMsgId,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      question: questionText,
      language: activeLang,
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsLoading(true);
    isLoadingRef.current = true;

    try {
      const response = await fetch('/api/gemini/voice-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          preferredLanguage: activeLang,
          context: {
            airTemp: evaluation.airTemp,
            humidity: evaluation.humidity,
            globeTemp: evaluation.globeTemp,
            wbgt: evaluation.wbgt,
            riskLevel: evaluation.riskLevel,
            role,
            isMiddayBanActive: evaluation.isMiddayBanActive,
            workload: evaluation.workload,
            symptoms: evaluation.symptomsReported,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data: VoiceQaResponse = await response.json();

      const assistantMsgId = `assistant-${Date.now()}`;
      const assistantMsg: VoiceQaMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        answer_en: data.answer_en,
        answer_ar: data.answer_ar,
        key_advice: data.key_advice,
        safety_tip: data.safety_tip,
        urgency: data.urgency,
        language: activeLang,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsLoading(false);
      isLoadingRef.current = false;

      // Auto-read the response aloud in the active user language while modal remains open
      if (isOpenRef.current) {
        const textToSpeak = activeLang === 'ar' ? data.answer_ar : data.answer_en;
        handlePlayVoice(assistantMsgId, textToSpeak, activeLang);
      }
    } catch {
      setIsLoading(false);
      isLoadingRef.current = false;
      setErrorMessage(
        activeLang === 'ar'
          ? 'حدث خطأ أثناء معالجة السؤال. يرجى المحاولة مرة أخرى.'
          : 'Unable to reach safety reasoning engine. Please try again.'
      );
    }
  };

  const transcribeRecordedAudio = async (
    audioBlob: Blob,
    captureLang: 'en' | 'ar',
    fallbackBrowserText: string
  ) => {
    setIsTranscribing(true);
    try {
      const base64Audio = await blobToBase64(audioBlob);
      const res = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: audioBlob.type || 'audio/webm',
          language: captureLang,
        }),
      });

      let transcript = '';
      if (res.ok) {
        const data = await res.json();
        transcript = (data.transcript || '').trim();
      }

      if (!transcript && fallbackBrowserText.trim()) {
        transcript = fallbackBrowserText.trim();
      }

      if (!transcript) {
        setErrorMessage(
          captureLang === 'ar'
            ? 'لم نتمكن من التقاط صوت واضح. يرجى التحدث بوضوح قرب الميكروفون والمحاولة مجدداً.'
            : 'No clear speech was detected. Please speak clearly near your microphone and try again.'
        );
        return;
      }

      const detectedLang: 'en' | 'ar' = /[\u0600-\u06FF]/.test(transcript)
        ? 'ar'
        : captureLang;

      setLastTranscriptBanner({ text: transcript, lang: detectedLang });
      setInputQuestion(transcript);

      if (autoSendVoiceRef.current) {
        await handleSendQuestion(transcript, detectedLang);
      }
    } catch {
      const cleanedFallback = fallbackBrowserText.trim();
      if (cleanedFallback) {
        const detectedLang: 'en' | 'ar' = /[\u0600-\u06FF]/.test(cleanedFallback)
          ? 'ar'
          : captureLang;
        setLastTranscriptBanner({ text: cleanedFallback, lang: detectedLang });
        setInputQuestion(cleanedFallback);
        if (autoSendVoiceRef.current) {
          await handleSendQuestion(cleanedFallback, detectedLang);
        }
      } else {
        setErrorMessage(
          captureLang === 'ar'
            ? 'تعذر تحويل الصوت إلى نص. يرجى المحاولة مرة أخرى أو كتابة سؤالك.'
            : 'Could not transcribe audio clip. Please try again or type your question.'
        );
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleStopListening = () => {
    stoppingManuallyRef.current = true;
    setIsListening(false);

    if (recognizerRef.current) {
      try {
        recognizerRef.current.stop();
      } catch {
        // ignore
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        releaseMediaResources();
      }
    } else {
      releaseMediaResources();
    }
  };

  const handleStartListening = async () => {
    setErrorMessage(null);
    setLastTranscriptBanner(null);
    stopAllSpeech();
    setPlayingMessageId(null);
    setPlayingLang(null);
    setInterimText('');
    browserTranscriptRef.current = '';
    audioChunksRef.current = [];
    stoppingManuallyRef.current = false;

    const captureLang = selectedLangRef.current;

    // 1. Request explicit Microphone Access via getUserMedia (works in EN & AR on all modern browsers)
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        setMicPermissionState('requesting');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!isOpenRef.current) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        setMicPermissionState('granted');
        mediaStreamRef.current = stream;

        // Live audio level meter using AudioContext
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateMeter = () => {
              if (!mediaStreamRef.current) return;
              analyser.getByteFrequencyData(dataArray);
              const avg =
                dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 140) * 100)));
              rafIdRef.current = requestAnimationFrame(updateMeter);
            };
            rafIdRef.current = requestAnimationFrame(updateMeter);
          }
        } catch {
          // AudioContext meter optional
        }

        // Start MediaRecorder for reliable Gemini transcription in English & Arabic
        const mimeType = getSupportedRecorderMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const chunks = audioChunksRef.current;
          const recordedType = recorder.mimeType || mimeType || 'audio/webm';
          const fallbackText = browserTranscriptRef.current;
          releaseMediaResources();

          if (!isOpenRef.current || chunks.length === 0) {
            return;
          }

          const audioBlob = new Blob(chunks, { type: recordedType });
          if (audioBlob.size < 400 && !fallbackText.trim()) {
            setErrorMessage(
              captureLang === 'ar'
                ? 'التسجيل قصير جداً. اضغط على الميكروفون وتحدث بجملة كاملة ثم أوقف التسجيل.'
                : 'Recording was too brief. Tap the mic, speak your full question, then tap Stop.'
            );
            return;
          }

          await transcribeRecordedAudio(audioBlob, captureLang, fallbackText);
        };

        mediaRecorderRef.current = recorder;
        recorder.start(250);
        setIsListening(true);

        // Simultaneously run Web Speech API strictly for live interim preview & auto end-of-sentence detection
        if (isSpeechRecognitionSupported()) {
          const recognizer = createSpeechRecognizer(
            captureLang,
            (interim) => {
              setInterimText(interim);
              browserTranscriptRef.current = interim;
            },
            (finalText) => {
              setInterimText(finalText);
              browserTranscriptRef.current = finalText;
              // Auto-stop recorder shortly after natural end of speech so user doesn't even need a second tap
              setTimeout(() => {
                if (
                  mediaRecorderRef.current &&
                  mediaRecorderRef.current.state === 'recording' &&
                  !stoppingManuallyRef.current
                ) {
                  setIsListening(false);
                  mediaRecorderRef.current.stop();
                }
              }, 350);
            },
            () => {
              // Ignore browser SpeechRecognition network/no-speech errors because MediaRecorder + Gemini handles final transcript!
            },
            () => {
              // Ignore onend here; user or auto-stop stops MediaRecorder cleanly
            }
          );

          if (recognizer) {
            recognizerRef.current = recognizer;
            recognizer.start();
          }
        }

        return;
      } catch (err: any) {
        setMicPermissionState('denied');
        releaseMediaResources();
        const errName = err?.name || '';
        setErrorMessage(
          errName === 'NotAllowedError' || errName === 'PermissionDeniedError'
            ? captureLang === 'ar'
              ? 'تم رفض إذن الميكروفون. يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح ثم المحاولة مجدداً.'
              : 'Microphone permission was blocked. Please allow microphone access in your browser address bar and try again.'
            : captureLang === 'ar'
            ? 'لم يتم العثور على ميكروفون متصل أو تعذر تشغيله. يمكنك كتابة سؤالك أدناه.'
            : 'No microphone was detected or audio capture failed. You can type your question below.'
        );
        return;
      }
    }

    // 2. Fallback to browser SpeechRecognition only if MediaDevices API is absent
    if (isSpeechRecognitionSupported()) {
      const recognizer = createSpeechRecognizer(
        captureLang,
        (interim) => setInterimText(interim),
        (finalTranscript) => {
          setInterimText('');
          setInputQuestion(finalTranscript);
          setLastTranscriptBanner({ text: finalTranscript, lang: captureLang });
          setIsListening(false);
          if (autoSendVoiceRef.current) {
            handleSendQuestion(finalTranscript, captureLang);
          }
        },
        () => {
          setIsListening(false);
          setErrorMessage(
            captureLang === 'ar'
              ? 'تعذر الوصول للميكروفون. يمكنك كتابة سؤالك أدناه.'
              : 'Microphone access failed. You can type your question below.'
          );
        },
        () => setIsListening(false)
      );

      if (recognizer) {
        recognizerRef.current = recognizer;
        recognizer.start();
        setIsListening(true);
        return;
      }
    }

    setErrorMessage(t.voiceQa.micNotSupported);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-qa-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-[#FAF8F3] border-2 border-[#173829] rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-[#173829] text-[#FAF8F3] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-10 h-10 rounded-2xl bg-[#EBF5F0] text-[#173829] flex items-center justify-center font-bold">
              <Mic className="w-5 h-5 text-[#173829]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <h2 id="voice-qa-title" className="text-base sm:text-lg font-black tracking-tight">
                  {t.voiceQa.title}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF8F3]/20 text-[#FAF8F3]">
                  {selectedLang === 'ar' ? 'العربية' : 'English'}
                </span>
              </div>
              <p className="text-xs text-[#C3D9CD] font-medium hidden sm:block">
                {t.voiceQa.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            {/* Language Selector in Header */}
            <div className="flex items-center bg-[#FAF8F3]/15 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setSelectedLang('en')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedLang === 'en'
                    ? 'bg-[#FAF8F3] text-[#173829] shadow-xs'
                    : 'text-[#C3D9CD] hover:text-[#FAF8F3]'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setSelectedLang('ar')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedLang === 'ar'
                    ? 'bg-[#FAF8F3] text-[#173829] shadow-xs'
                    : 'text-[#C3D9CD] hover:text-[#FAF8F3]'
                }`}
              >
                عربي
              </button>
            </div>

            <button
              onClick={onClose}
              aria-label="Close voice assistant"
              className="w-9 h-9 rounded-xl bg-[#FAF8F3]/15 hover:bg-[#FAF8F3]/30 text-[#FAF8F3] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Thermal Context & Mic Status Banner */}
        <div className="px-4 py-2 bg-[#EBF5F0] border-b border-[#D5E5DC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#173829] font-medium">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <span className="w-2 h-2 rounded-full bg-[#173829]" />
            <span>
              {locale === 'ar' ? 'السياق الميداني:' : 'Live Context:'} WBGT{' '}
              {evaluation.wbgt.toFixed(1)}°C · {evaluation.riskLevel}
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <label className="flex items-center gap-1 text-[11px] font-bold text-[#173829] cursor-pointer">
              <input
                type="checkbox"
                checked={autoSendVoice}
                onChange={(e) => setAutoSendVoice(e.target.checked)}
                className="rounded text-[#173829] focus:ring-[#173829] w-3.5 h-3.5"
              />
              <span>{selectedLang === 'ar' ? 'إرسال تلقائي' : 'Auto-send voice'}</span>
            </label>

            <div className="flex items-center space-x-1 rtl:space-x-reverse">
              <span className="text-[#557564]">{t.resultsAudio.playbackSpeed}:</span>
              <select
                value={speechSpeed}
                onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                aria-label="Playback speed"
                className="bg-white border border-[#C5DFD0] rounded-md px-1.5 py-0.5 text-[11px] font-bold text-[#173829] cursor-pointer"
              >
                <option value="0.85">0.85x</option>
                <option value="0.95">1.0x</option>
                <option value="1.15">1.15x</option>
              </select>
            </div>

            <button
              onClick={handleResetChat}
              title={locale === 'ar' ? 'بدء محادثة جديدة' : 'Reset conversation'}
              className="flex items-center space-x-1 rtl:space-x-reverse px-2 py-0.5 rounded-md bg-white hover:bg-[#FAF8F3] border border-[#C5DFD0] text-[11px] font-bold text-[#173829] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{locale === 'ar' ? 'إعادة ضبط' : 'Reset'}</span>
            </button>
          </div>
        </div>

        {/* Messages Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isUrgent = msg.urgency === 'urgent' || msg.urgency === 'emergency';

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div
                    dir={/[\u0600-\u06FF]/.test(msg.question || '') ? 'rtl' : 'ltr'}
                    className="max-w-[85%] sm:max-w-[75%] bg-[#173829] text-[#FAF8F3] rounded-2xl rounded-tr-xs p-3.5 shadow-xs text-xs sm:text-sm"
                  >
                    <p className="font-medium leading-relaxed">{msg.question}</p>
                    <span className="block text-[10px] text-[#A3E5C1] mt-1.5 text-right rtl:text-left">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-start">
                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-tl-xs p-4 shadow-sm border space-y-3 ${
                    isUrgent
                      ? 'bg-[#FFF5F5] border-[#C81D25]/40 text-[#173829]'
                      : 'bg-white border-[#E5DFD3] text-[#173829]'
                  }`}
                >
                  {isUrgent && (
                    <div className="p-2.5 rounded-xl bg-[#C81D25] text-white text-xs font-bold flex items-center space-x-2 rtl:space-x-reverse">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-300" />
                      <span>{t.voiceQa.emergencyBanner}</span>
                    </div>
                  )}

                  {/* Dual Language Readout Tabs */}
                  <div className="space-y-2">
                    {/* English Readout */}
                    <div className="p-3 bg-[#FAF8F3] rounded-xl border border-[#EAE3D2] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#557564] uppercase tracking-wider">
                          English Text & Audio
                        </span>
                        <button
                          onClick={() => handlePlayVoice(msg.id, msg.answer_en || '', 'en')}
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            playingMessageId === msg.id && playingLang === 'en'
                              ? 'bg-[#C81D25] text-white animate-pulse'
                              : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3]'
                          }`}
                        >
                          {playingMessageId === msg.id && playingLang === 'en' ? (
                            <>
                              <Square className="w-3 h-3 fill-current" />
                              <span>{t.resultsAudio.stop}</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current" />
                              <span>🔊 {t.voiceQa.listenEn}</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-[#173829] leading-relaxed">
                        {msg.answer_en}
                      </p>
                    </div>

                    {/* Arabic Readout */}
                    <div dir="rtl" className="p-3 bg-[#FAF8F3] rounded-xl border border-[#EAE3D2] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-arabic-calligraphy text-xs font-bold text-[#557564]">
                          الإجابة باللغة العربية
                        </span>
                        <button
                          onClick={() => handlePlayVoice(msg.id, msg.answer_ar || '', 'ar')}
                          className={`flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            playingMessageId === msg.id && playingLang === 'ar'
                              ? 'bg-[#C81D25] text-white animate-pulse'
                              : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3]'
                          }`}
                        >
                          {playingMessageId === msg.id && playingLang === 'ar' ? (
                            <>
                              <Square className="w-3 h-3 fill-current" />
                              <span>{t.resultsAudio.stop}</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current" />
                              <span>🔊 {t.voiceQa.listenAr}</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-[#173829] leading-relaxed">
                        {msg.answer_ar}
                      </p>
                    </div>
                  </div>

                  {/* Key Advice Bullet Points */}
                  {msg.key_advice && msg.key_advice.length > 0 && (
                    <div className="pt-2 border-t border-[#E8E1D5] space-y-1.5">
                      <div className="text-[11px] font-bold text-[#173829]">
                        {locale === 'ar' ? 'إجراءات السلامة السريعة:' : 'Immediate Action Steps:'}
                      </div>
                      <ul className="space-y-1 text-xs text-[#2D4D3C]">
                        {msg.key_advice.map((item, idx) => (
                          <li key={idx} className="flex items-start space-x-1.5 rtl:space-x-reverse">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#24533D] shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.safety_tip && (
                    <div className="text-[11px] text-[#557564] italic bg-[#FAF8F3] p-2 rounded-lg border border-[#EAE3D2]">
                      💡 <strong>Tip:</strong> {msg.safety_tip}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-[#557564] pt-1">
                    <span>{t.voiceQa.sourceGemini}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live Microphone Recording & Audio Waveform Card */}
          {isListening && (
            <div
              dir={selectedLang === 'ar' ? 'rtl' : 'ltr'}
              className="p-4 rounded-2xl bg-[#EBF5F0] border-2 border-[#173829] text-[#173829] text-xs space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 rtl:space-x-reverse font-bold">
                  <span className="w-3 h-3 rounded-full bg-[#C81D25] animate-ping" />
                  <span>
                    {selectedLang === 'ar'
                      ? 'الميكروفون نشط · تحدث بالعربية الآن...'
                      : 'Microphone active · Speak in English now...'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleStopListening}
                  className="px-3 py-1 rounded-xl bg-[#C81D25] hover:bg-[#a5151c] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{selectedLang === 'ar' ? 'إيقاف وتحويل لنص' : 'Stop & Transcribe'}</span>
                </button>
              </div>

              {/* Live Audio Level Bars */}
              <div className="flex items-center gap-1 h-5">
                {[0.5, 0.85, 1.0, 0.75, 0.45, 0.9, 0.6].map((mult, idx) => {
                  const barHeight = Math.max(20, Math.min(100, Math.round(audioLevel * mult + 15)));
                  return (
                    <div
                      key={idx}
                      style={{ height: `${barHeight}%` }}
                      className="w-1.5 rounded-full bg-[#173829] transition-all duration-75"
                    />
                  );
                })}
                <span className="text-[11px] font-medium text-[#385947] ml-2 rtl:mr-2">
                  {interimText
                    ? `"${interimText}"`
                    : selectedLang === 'ar'
                    ? 'جاري تسجيل صوتك بوضوح...'
                    : 'Recording clear audio for transcript...'}
                </span>
              </div>
            </div>
          )}

          {/* Transcribing Speech Spinner */}
          {isTranscribing && (
            <div className="flex items-center space-x-2 rtl:space-x-reverse p-3.5 bg-[#EBF5F0] rounded-2xl border border-[#C5DFD0] text-xs font-bold text-[#173829] w-fit">
              <Loader2 className="w-4 h-4 animate-spin text-[#173829]" />
              <span>
                {selectedLang === 'ar'
                  ? 'جاري تحويل صوتك إلى نص عربي دقيق...'
                  : 'Transcribing your voice accurately...'}
              </span>
            </div>
          )}

          {/* Loading bubble while Gemini is thinking */}
          {isLoading && (
            <div className="flex items-center space-x-2 rtl:space-x-reverse p-3.5 bg-white rounded-2xl border border-[#E5DFD3] text-xs text-[#173829] w-fit">
              <span className="w-2 h-2 rounded-full bg-[#173829] animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-[#173829] animate-bounce [animation-delay:0.15s]" />
              <span className="w-2 h-2 rounded-full bg-[#173829] animate-bounce [animation-delay:0.3s]" />
              <span className="ml-2 font-medium">
                {selectedLang === 'ar'
                  ? 'جاري توليد الإجابة والتسجيل الصوتي...'
                  : 'Analyzing heat conditions and preparing voice response...'}
              </span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Verified Transcript Banner (Visible after voice capture) */}
        {lastTranscriptBanner && (
          <div
            dir={lastTranscriptBanner.lang === 'ar' ? 'rtl' : 'ltr'}
            className="px-4 py-2 bg-[#F4F9F6] border-t border-[#D5E5DC] flex items-center justify-between gap-2 text-xs text-[#173829]"
          >
            <div className="truncate">
              <strong className="font-bold">
                {lastTranscriptBanner.lang === 'ar'
                  ? 'النص الملتقط (العربية): '
                  : 'Captured Transcript (EN): '}
              </strong>
              <span>{lastTranscriptBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setLastTranscriptBanner(null)}
              className="text-[11px] font-bold underline shrink-0 cursor-pointer"
            >
              {locale === 'ar' ? 'إخفاء' : 'Hide'}
            </button>
          </div>
        )}

        {/* Quick Question Preset Chips */}
        <div className="px-4 py-2.5 bg-[#FAF8F3] border-t border-[#EAE3D2] space-y-1.5">
          <div className="text-[11px] font-bold text-[#557564]">
            {t.voiceQa.presetTitle}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRESET_QUESTIONS.map((q) => (
              <button
                key={q.id}
                onClick={() => handleSendQuestion(selectedLang === 'ar' ? q.ar : q.en, selectedLang)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-white hover:bg-[#EBF5F0] text-[#173829] border border-[#D8D0BF] text-xs font-semibold flex items-center space-x-1.5 rtl:space-x-reverse transition-colors shadow-2xs cursor-pointer"
              >
                <span>{q.icon}</span>
                <span>{selectedLang === 'ar' ? q.ar : q.en}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error notification if any */}
        {errorMessage && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-xs font-medium border-t border-red-200 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="font-bold underline ml-2 cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Voice Input & Text Control Bar */}
        <div className="p-3 sm:p-4 bg-white border-t border-[#EAE3D2] flex items-center gap-2">
          {/* Main Large Microphone Button */}
          <button
            type="button"
            disabled={isTranscribing || isLoading || micPermissionState === 'requesting'}
            onClick={isListening ? handleStopListening : handleStartListening}
            aria-label={isListening ? 'Stop listening' : t.voiceQa.tapToSpeak}
            title={
              isListening
                ? selectedLang === 'ar'
                  ? 'اضغط لإيقاف التسجيل'
                  : 'Tap to stop and transcribe'
                : selectedLang === 'ar'
                ? 'اضغط للتحدث بالعربية أو الإنجليزية'
                : 'Tap to speak in English or Arabic'
            }
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-50 ${
              isListening
                ? 'bg-[#C81D25] text-white shadow-lg animate-pulse ring-4 ring-red-200'
                : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] shadow-md'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isListening ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>

          {/* Text Input Box */}
          <div className="flex-1 relative">
            <input
              type="text"
              dir={selectedLang === 'ar' || /[\u0600-\u06FF]/.test(inputQuestion) ? 'rtl' : 'ltr'}
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendQuestion();
                }
              }}
              placeholder={
                isTranscribing
                  ? selectedLang === 'ar'
                    ? 'جاري كتابة النص...'
                    : 'Transcribing your audio...'
                  : isListening
                  ? t.voiceQa.listeningSubtitle
                  : t.voiceQa.typeQuestionPlaceholder
              }
              disabled={isListening || isTranscribing || isLoading}
              className="w-full bg-[#FAF8F3] border border-[#D8D0BF] rounded-2xl px-4 py-3 text-xs sm:text-sm text-[#173829] placeholder-[#889E92] focus:outline-none focus:ring-2 focus:ring-[#173829] disabled:opacity-50"
            />
          </div>

          {/* Send Button */}
          <button
            type="button"
            onClick={() => handleSendQuestion()}
            disabled={!inputQuestion.trim() || isLoading || isTranscribing}
            aria-label={t.voiceQa.send}
            className="w-12 h-12 rounded-2xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] disabled:opacity-40 disabled:hover:bg-[#173829] flex items-center justify-center shrink-0 transition-all shadow-sm cursor-pointer"
          >
            <Send className="w-5 h-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
