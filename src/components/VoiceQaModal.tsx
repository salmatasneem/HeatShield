import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Send,
  X,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Languages,
  MessageSquare,
  Flame,
  Info,
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
  const [interimText, setInterimText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playingLang, setPlayingLang] = useState<'en' | 'ar' | null>(null);
  const [speechSpeed, setSpeechSpeed] = useState<number>(0.95);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognizerRef = useRef<SpeechRecognizerHandle | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Initial welcome message in session
  const [messages, setMessages] = useState<VoiceQaMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      answer_en: `Hello! I am your HeatShield Safety Voice Assistant. Current WBGT in Dubai is ${evaluation.wbgt.toFixed(1)}°C (${evaluation.riskLevel} Risk). Tap the microphone to speak your question, or select a quick topic below.`,
      answer_ar: `مرحباً بك! أنا مساعد درع الحرارة الصوتي لحمايتك في الميدان. مؤشر WBGT الحالي في دبي هو ${evaluation.wbgt.toFixed(1)} درجة مئوية. اضغط على الميكروفون للتحدث بصوتك أو اختر سؤالاً سريعاً.`,
      key_advice: [
        'Voice questions are supported in English and Arabic.',
        'You can hear the answer aloud or read it at any time.',
      ],
      safety_tip: 'Always stay hydrated and inform your supervisor immediately if you feel unwell.',
      urgency: 'normal',
      language: locale === 'ar' ? 'ar' : 'en',
    },
  ]);

  // Clean up audio & speech recognition on close or unmount
  useEffect(() => {
    if (!isOpen) {
      stopAllSpeech();
      if (recognizerRef.current) {
        recognizerRef.current.stop();
        setIsListening(false);
      }
    }
  }, [isOpen]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, interimText]);

  if (!isOpen) return null;

  const handleStartListening = () => {
    setErrorMessage(null);
    stopAllSpeech();
    setPlayingMessageId(null);
    setInterimText('');

    if (!isSpeechRecognitionSupported()) {
      setErrorMessage(t.voiceQa.micNotSupported);
      return;
    }

    const recognizer = createSpeechRecognizer(
      selectedLang,
      (interim) => {
        setInterimText(interim);
      },
      (finalTranscript) => {
        setInterimText('');
        setInputQuestion(finalTranscript);
        setIsListening(false);
        // Automatically submit the spoken question
        handleSendQuestion(finalTranscript);
      },
      (err) => {
        console.warn('Speech recognition warning:', err);
        setIsListening(false);
        setErrorMessage(
          selectedLang === 'ar'
            ? 'تعذر الوصول للميكروفون أو حدث انقطاع. يمكنك كتابة السؤال أدناه.'
            : 'Microphone permission denied or connection timed out. You can type your question.'
        );
      },
      () => {
        setIsListening(false);
      }
    );

    if (recognizer) {
      recognizerRef.current = recognizer;
      recognizer.start();
      setIsListening(true);
    } else {
      setErrorMessage(t.voiceQa.micNotSupported);
    }
  };

  const handleStopListening = () => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      setIsListening(false);
      if (interimText) {
        setInputQuestion(interimText);
        setInterimText('');
      }
    }
  };

  const handleSendQuestion = async (queryToSend?: string) => {
    const questionText = (queryToSend || inputQuestion).trim();
    if (!questionText || isLoading) return;

    setInputQuestion('');
    setInterimText('');
    setErrorMessage(null);
    stopAllSpeech();

    const userMsgId = `user-${Date.now()}`;
    const newMsg: VoiceQaMessage = {
      id: userMsgId,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      question: questionText,
      language: selectedLang,
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/voice-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          preferredLanguage: selectedLang,
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
        language: selectedLang,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsLoading(false);

      // Auto-read the response aloud in the active user language for hands-free convenience
      const textToSpeak = selectedLang === 'ar' ? data.answer_ar : data.answer_en;
      handlePlayVoice(assistantMsgId, textToSpeak, selectedLang);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(
        selectedLang === 'ar'
          ? 'حدث خطأ أثناء معالجة السؤال. جاري تقديم الإجابة الاحتياطية الميدانية.'
          : 'Unable to connect to safety reasoning engine. Standard protocol loaded.'
      );
    }
  };

  const handlePlayVoice = async (
    messageId: string,
    text: string,
    lang: 'en' | 'ar'
  ) => {
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
        setPlayingMessageId(messageId);
        setPlayingLang(lang);
      },
      () => {
        setPlayingMessageId(null);
        setPlayingLang(null);
      },
      speechSpeed
    );
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
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedLang === 'en'
                    ? 'bg-[#FAF8F3] text-[#173829] shadow-xs'
                    : 'text-[#C3D9CD] hover:text-[#FAF8F3]'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setSelectedLang('ar')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
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
              className="w-9 h-9 rounded-xl bg-[#FAF8F3]/15 hover:bg-[#FAF8F3]/30 text-[#FAF8F3] flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Thermal Context Banner */}
        <div className="px-4 py-2 bg-[#EBF5F0] border-b border-[#D5E5DC] flex items-center justify-between text-xs text-[#173829] font-medium">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <span className="w-2 h-2 rounded-full bg-[#173829] animate-ping" />
            <span>
              {locale === 'ar' ? 'السياق الميداني:' : 'Live Context:'} WBGT {evaluation.wbgt.toFixed(1)}°C • {evaluation.riskLevel}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 rtl:space-x-reverse">
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
        </div>

        {/* Messages Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isUrgent = msg.urgency === 'urgent' || msg.urgency === 'emergency';

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] bg-[#173829] text-[#FAF8F3] rounded-2xl rounded-tr-xs p-3.5 shadow-xs text-xs sm:text-sm">
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
                  {/* Emergency notice if urgent */}
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
                          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
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
                          className={`flex items-center space-x-1 space-x-reverse px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
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

                  {/* Safety Tip Footer */}
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

          {/* Live speech transcription interim bubble */}
          {isListening && (
            <div className="p-3.5 rounded-2xl bg-[#EBF5F0] border-2 border-[#173829] text-[#173829] text-xs space-y-2 animate-pulse">
              <div className="flex items-center space-x-2 rtl:space-x-reverse font-bold">
                <span className="w-3 h-3 rounded-full bg-[#C81D25] animate-ping" />
                <span>{t.voiceQa.listening}</span>
              </div>
              <p className="text-sm italic font-medium">
                "{interimText || (selectedLang === 'ar' ? 'تحدث الآن، جاري الاستماع...' : 'Listening to your voice...')}"
              </p>
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

        {/* Quick Question Preset Chips */}
        <div className="px-4 py-2.5 bg-[#FAF8F3] border-t border-[#EAE3D2] space-y-1.5">
          <div className="text-[11px] font-bold text-[#557564]">
            {t.voiceQa.presetTitle}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRESET_QUESTIONS.map((q) => (
              <button
                key={q.id}
                onClick={() => handleSendQuestion(selectedLang === 'ar' ? q.ar : q.en)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-white hover:bg-[#EBF5F0] text-[#173829] border border-[#D8D0BF] text-xs font-semibold flex items-center space-x-1.5 rtl:space-x-reverse transition-colors shadow-2xs"
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
            <button onClick={() => setErrorMessage(null)} className="font-bold underline ml-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Voice Input & Text Control Bar */}
        <div className="p-3 sm:p-4 bg-white border-t border-[#EAE3D2] flex items-center gap-2">
          {/* Main Large Microphone Button */}
          <button
            onClick={isListening ? handleStopListening : handleStartListening}
            aria-label={isListening ? 'Stop listening' : t.voiceQa.tapToSpeak}
            title={isListening ? 'Stop listening' : t.voiceQa.tapToSpeak}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
              isListening
                ? 'bg-[#C81D25] text-white shadow-lg animate-pulse ring-4 ring-red-200'
                : 'bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] shadow-md'
            }`}
          >
            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Text Input Box */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendQuestion();
                }
              }}
              placeholder={isListening ? t.voiceQa.listeningSubtitle : t.voiceQa.typeQuestionPlaceholder}
              disabled={isListening || isLoading}
              className="w-full bg-[#FAF8F3] border border-[#D8D0BF] rounded-2xl px-4 py-3 text-xs sm:text-sm text-[#173829] placeholder-[#889E92] focus:outline-none focus:ring-2 focus:ring-[#173829] disabled:opacity-50"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={() => handleSendQuestion()}
            disabled={!inputQuestion.trim() || isLoading}
            aria-label={t.voiceQa.send}
            className="w-12 h-12 rounded-2xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] disabled:opacity-40 disabled:hover:bg-[#173829] flex items-center justify-center shrink-0 transition-all shadow-sm"
          >
            <Send className="w-5 h-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
