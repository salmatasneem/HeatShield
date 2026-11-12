import { SupportedLanguage } from '../types';

const LANG_CODE_MAP: Record<SupportedLanguage, string[]> = {
  en: ['en-US', 'en-GB', 'en-AU', 'en'],
  hi: ['hi-IN', 'hi'],
  ml: ['ml-IN', 'ml'],
  kn: ['kn-IN', 'kn'],
  ar: ['ar-AE', 'ar-SA', 'ar-EG', 'ar'],
  ur: ['ur-PK', 'ur-IN', 'ur'],
};

/**
 * Play a short alert chime using the browser Web Audio API as an immediate audio feedback.
 */
export function playAlertChime(urgency: 'low' | 'moderate' | 'high' | 'critical' = 'moderate') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = urgency === 'critical' ? 880 : urgency === 'high' ? 660 : 440;
    osc.type = urgency === 'critical' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // AudioContext blocked or not supported
  }
}

let currentActiveAudio: HTMLAudioElement | null = null;

/**
 * Stops all currently active speech or audio playback.
 */
export function stopAllSpeech() {
  if (currentActiveAudio) {
    currentActiveAudio.pause();
    currentActiveAudio.currentTime = 0;
    currentActiveAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Speaks the text aloud using browser SpeechSynthesis API with configurable rate.
 */
export function speakAlertText(
  text: string,
  lang: SupportedLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  rate: number = 0.95
): boolean {
  stopAllSpeech();

  if (!('speechSynthesis' in window)) {
    playAlertChime('high');
    return false;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    const targetCodes = LANG_CODE_MAP[lang] || ['en-US'];

    // Try finding matching voice
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find((v) =>
      targetCodes.some((code) => v.lang.toLowerCase().startsWith(code.toLowerCase()))
    );

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = targetCodes[0];
    }

    utterance.rate = rate; // Slightly slower for clarity under noisy outdoor conditions
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      onEnd?.();
    };

    utterance.onerror = () => {
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    playAlertChime('high');
    onEnd?.();
    return false;
  }
}

/**
 * Plays speech using Gemini TTS if available, or seamlessly falls back to client SpeechSynthesis.
 */
export async function playTtsOrFallback(
  text: string,
  lang: 'en' | 'ar',
  onStart?: () => void,
  onEnd?: () => void,
  rate: number = 1.0
): Promise<void> {
  stopAllSpeech();

  try {
    const res = await fetch('/api/gemini/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.audioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        currentActiveAudio = audio;
        audio.playbackRate = rate;

        audio.onplay = () => onStart?.();
        audio.onended = () => {
          currentActiveAudio = null;
          onEnd?.();
        };
        audio.onerror = () => {
          // Fall back to SpeechSynthesis
          currentActiveAudio = null;
          speakAlertText(text, lang, onStart, onEnd, rate);
        };

        await audio.play();
        return;
      }
    }
  } catch (e) {
    // network or api error, proceed to fallback
  }

  // Fallback to client browser speech synthesis
  speakAlertText(text, lang, onStart, onEnd, rate);
}

/**
 * Checks if Web Speech Recognition is supported in the browser.
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface SpeechRecognizerHandle {
  start: () => void;
  stop: () => void;
}

/**
 * Creates a Speech Recognition instance for English or Arabic voice capture.
 */
export function createSpeechRecognizer(
  lang: 'en' | 'ar',
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (err: string) => void,
  onEnd: () => void
): SpeechRecognizerHandle | null {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = lang === 'ar' ? 'ar-AE' : 'en-US';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += chunk;
        } else {
          interimTranscript += chunk;
        }
      }

      if (interimTranscript) {
        onInterim(interimTranscript);
      }
      if (finalTranscript) {
        onFinal(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      onError(event.error || 'Speech recognition failed');
    };

    recognition.onend = () => {
      onEnd();
    };

    return {
      start: () => {
        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition already started or error:', e);
        }
      },
      stop: () => {
        try {
          recognition.stop();
        } catch (e) {
          // ignore
        }
      },
    };
  } catch (err) {
    return null;
  }
}

