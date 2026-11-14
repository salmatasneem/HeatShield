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

/**
 * Play a warm, uplifting 3-note celebratory chime when daily hydration goal is met.
 */
export function playCelebrationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.085;
      const duration = idx === notes.length - 1 ? 0.42 : 0.2;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.16, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.005, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (e) {
    // AudioContext blocked or not supported
  }
}

let currentActiveAudio: HTMLAudioElement | null = null;
let currentAudioObjectUrl: string | null = null;
let currentFetchController: AbortController | null = null;
let playbackGeneration = 0;

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
  return URL.createObjectURL(blob);
}

/**
 * Stops all currently active speech, pending TTS requests, or audio playback.
 */
export function stopAllSpeech() {
  playbackGeneration += 1;

  if (currentFetchController) {
    try {
      currentFetchController.abort();
    } catch {
      // ignore
    }
    currentFetchController = null;
  }

  if (currentActiveAudio) {
    try {
      currentActiveAudio.onplay = null;
      currentActiveAudio.onended = null;
      currentActiveAudio.onerror = null;
      currentActiveAudio.pause();
      currentActiveAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentActiveAudio = null;
  }

  if (currentAudioObjectUrl) {
    try {
      URL.revokeObjectURL(currentAudioObjectUrl);
    } catch {
      // ignore
    }
    currentAudioObjectUrl = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
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
  const gen = playbackGeneration;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    playAlertChime('high');
    onEnd?.();
    return false;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    const targetCodes = LANG_CODE_MAP[lang] || ['en-US'];

    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find((v) =>
      targetCodes.some((code) => v.lang.toLowerCase().startsWith(code.toLowerCase()))
    );

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = targetCodes[0];
    }

    utterance.rate = rate;
    utterance.pitch = 1.0;

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (gen === playbackGeneration) {
        onEnd?.();
      }
    };

    utterance.onstart = () => {
      if (gen === playbackGeneration) {
        onStart?.();
      }
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    playAlertChime('high');
    onEnd?.();
    return false;
  }
}

/**
 * Plays speech using Gemini TTS (/api/gemini/tts) for crisp English, Arabic, and multilingual voices,
 * with automatic fallback to browser SpeechSynthesis.
 */
export async function playTtsOrFallback(
  text: string,
  lang: SupportedLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  rate: number = 1.0
): Promise<void> {
  stopAllSpeech();
  const gen = playbackGeneration;
  const controller = new AbortController();
  currentFetchController = controller;

  // Notify UI immediately that playback/preparation has started
  onStart?.();

  try {
    const res = await fetch('/api/gemini/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang }),
      signal: controller.signal,
    });

    if (gen !== playbackGeneration) return;

    if (res.ok) {
      const data = await res.json();
      if (gen !== playbackGeneration) return;

      if (data.audioBase64) {
        const mimeType = data.mimeType || 'audio/wav';
        const objectUrl = base64ToBlobUrl(data.audioBase64, mimeType);
        currentAudioObjectUrl = objectUrl;

        const audio = new Audio(objectUrl);
        currentActiveAudio = audio;
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;

        audio.onplay = () => {
          if (gen === playbackGeneration) {
            onStart?.();
          }
        };

        audio.onended = () => {
          if (currentActiveAudio === audio) {
            currentActiveAudio = null;
          }
          if (currentAudioObjectUrl === objectUrl) {
            URL.revokeObjectURL(objectUrl);
            currentAudioObjectUrl = null;
          }
          if (gen === playbackGeneration) {
            onEnd?.();
          }
        };

        audio.onerror = () => {
          if (currentActiveAudio === audio) {
            currentActiveAudio = null;
          }
          if (currentAudioObjectUrl === objectUrl) {
            URL.revokeObjectURL(objectUrl);
            currentAudioObjectUrl = null;
          }
          if (gen === playbackGeneration) {
            speakAlertText(text, lang, onStart, onEnd, rate);
          }
        };

        try {
          await audio.play();
          return;
        } catch {
          // Clean up failed audio resource before fallback
          if (currentActiveAudio === audio) {
            currentActiveAudio = null;
          }
          if (currentAudioObjectUrl === objectUrl) {
            URL.revokeObjectURL(objectUrl);
            currentAudioObjectUrl = null;
          }
          // Browser blocked audio.play() or failed to decode -> fallback to SpeechSynthesis
          if (gen === playbackGeneration) {
            speakAlertText(text, lang, onStart, onEnd, rate);
          }
          return;
        }
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError' || gen !== playbackGeneration) {
      return;
    }
    // Network or API error -> proceed to SpeechSynthesis fallback
  }

  if (gen === playbackGeneration) {
    speakAlertText(text, lang, onStart, onEnd, rate);
  }
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
