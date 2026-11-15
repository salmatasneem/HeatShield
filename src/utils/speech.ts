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

let sharedAudioCtx: AudioContext | null = null;
let currentBufferSource: AudioBufferSourceNode | null = null;
let currentActiveAudio: HTMLAudioElement | null = null;
let currentAudioObjectUrl: string | null = null;
let currentFetchController: AbortController | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
let playbackGeneration = 0;

interface ClientTtsCacheItem {
  audioBase64: string;
  mimeType: string;
}

const clientTtsCache = new Map<string, ClientTtsCacheItem>();
const CLIENT_TTS_CACHE_MAX = 30;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContextClass();
  }
  return sharedAudioCtx;
}

/**
 * Call synchronously inside a user gesture (tap/click) so later async voice responses
 * can play audio cleanly without browser autoplay blocking.
 */
export function unlockAudioPlayback() {
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // ignore
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const bytes = base64ToUint8Array(base64);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType || 'audio/wav' });
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

  if (currentBufferSource) {
    try {
      currentBufferSource.onended = null;
      currentBufferSource.stop();
      currentBufferSource.disconnect();
    } catch {
      // ignore
    }
    currentBufferSource = null;
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

  if (speechKeepAliveTimer !== null) {
    clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = null;
  }
  activeUtterance = null;

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function pickBestBrowserVoice(lang: SupportedLanguage): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const targetCodes = LANG_CODE_MAP[lang] || ['en-US'];
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;

  for (const code of targetCodes) {
    const exact = voices.find((v) => v.lang.toLowerCase() === code.toLowerCase());
    if (exact) return exact;
    const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(code.toLowerCase().split('-')[0]));
    if (prefix) return prefix;
  }
  return undefined;
}

/**
 * Speaks the text aloud using browser SpeechSynthesis API with configurable rate.
 */
export function speakAlertText(
  text: string,
  lang: SupportedLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  rate: number = 1.0
): boolean {
  stopAllSpeech();
  const gen = playbackGeneration;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    playAlertChime('high');
    onEnd?.();
    return false;
  }

  try {
    const startSpeaking = () => {
      if (gen !== playbackGeneration) return;
      const utterance = new SpeechSynthesisUtterance(text);
      activeUtterance = utterance;
      const targetCodes = LANG_CODE_MAP[lang] || ['en-US'];
      const selectedVoice = pickBestBrowserVoice(lang);

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
        if (speechKeepAliveTimer !== null) {
          clearInterval(speechKeepAliveTimer);
          speechKeepAliveTimer = null;
        }
        if (activeUtterance === utterance) {
          activeUtterance = null;
        }
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

      // Chrome workaround: keep SpeechSynthesis active during longer Arabic/English sentences
      if (speechKeepAliveTimer !== null) clearInterval(speechKeepAliveTimer);
      speechKeepAliveTimer = setInterval(() => {
        if (gen !== playbackGeneration || !window.speechSynthesis.speaking) {
          if (speechKeepAliveTimer !== null) {
            clearInterval(speechKeepAliveTimer);
            speechKeepAliveTimer = null;
          }
          return;
        }
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 4000);

      // Delay slightly after cancel() so Chromium does not swallow the new utterance
      setTimeout(() => {
        if (gen !== playbackGeneration) return;
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      }, 45);
    };

    const initialVoices = window.speechSynthesis.getVoices();
    if (initialVoices.length === 0) {
      let triggered = false;
      const runOnce = () => {
        if (triggered) return;
        triggered = true;
        window.speechSynthesis.onvoiceschanged = null;
        startSpeaking();
      };
      window.speechSynthesis.onvoiceschanged = runOnce;
      setTimeout(runOnce, 180);
    } else {
      startSpeaking();
    }

    return true;
  } catch {
    playAlertChime('high');
    onEnd?.();
    return false;
  }
}

async function playDecodedBase64Audio(
  audioBase64: string,
  mimeType: string,
  rate: number,
  gen: number,
  onStart?: () => void,
  onEnd?: () => void
): Promise<boolean> {
  // 1. Prefer singleton AudioContext.decodeAudioData so unlocked gesture avoids async autoplay blocks
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state === 'running') {
        const bytes = base64ToUint8Array(audioBase64);
        const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);

        if (gen !== playbackGeneration) return true;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        source.connect(ctx.destination);
        currentBufferSource = source;

        source.onended = () => {
          if (currentBufferSource === source) {
            currentBufferSource = null;
          }
          if (gen === playbackGeneration) {
            onEnd?.();
          }
        };

        onStart?.();
        source.start(0);
        return true;
      }
    }
  } catch {
    // Fall through to HTMLAudioElement playback
  }

  // 2. Fallback to HTMLAudioElement
  if (gen !== playbackGeneration) return true;
  const objectUrl = base64ToBlobUrl(audioBase64, mimeType);
  currentAudioObjectUrl = objectUrl;

  const audio = new Audio(objectUrl);
  currentActiveAudio = audio;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  (audio as any).preservesPitch = true;

  audio.onplay = () => {
    if (gen === playbackGeneration) {
      onStart?.();
    }
  };

  audio.onended = () => {
    if (currentActiveAudio === audio) currentActiveAudio = null;
    if (currentAudioObjectUrl === objectUrl) {
      URL.revokeObjectURL(objectUrl);
      currentAudioObjectUrl = null;
    }
    if (gen === playbackGeneration) {
      onEnd?.();
    }
  };

  return new Promise<boolean>((resolve) => {
    audio.onerror = () => {
      if (currentActiveAudio === audio) currentActiveAudio = null;
      if (currentAudioObjectUrl === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentAudioObjectUrl = null;
      }
      resolve(false);
    };

    audio.play().then(
      () => resolve(true),
      () => {
        if (currentActiveAudio === audio) currentActiveAudio = null;
        if (currentAudioObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          currentAudioObjectUrl = null;
        }
        resolve(false);
      }
    );
  });
}

/**
 * Plays speech using Gemini TTS (/api/gemini/tts) for crisp English, Arabic, and multilingual voices,
 * with client-side caching and automatic fallback to browser SpeechSynthesis.
 */
export async function playTtsOrFallback(
  text: string,
  lang: SupportedLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  rate: number = 1.0
): Promise<void> {
  stopAllSpeech();
  unlockAudioPlayback();
  const gen = playbackGeneration;
  const cacheKey = `${lang}:${text.trim()}`;

  onStart?.();

  try {
    const cached = clientTtsCache.get(cacheKey);
    if (cached) {
      const ok = await playDecodedBase64Audio(
        cached.audioBase64,
        cached.mimeType,
        rate,
        gen,
        onStart,
        onEnd
      );
      if (ok || gen !== playbackGeneration) return;
    }

    const controller = new AbortController();
    currentFetchController = controller;

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
        if (clientTtsCache.size >= CLIENT_TTS_CACHE_MAX) {
          const firstKey = clientTtsCache.keys().next().value;
          if (firstKey) clientTtsCache.delete(firstKey);
        }
        clientTtsCache.set(cacheKey, { audioBase64: data.audioBase64, mimeType });

        const ok = await playDecodedBase64Audio(
          data.audioBase64,
          mimeType,
          rate,
          gen,
          onStart,
          onEnd
        );
        if (ok || gen !== playbackGeneration) return;
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError' || gen !== playbackGeneration) {
      return;
    }
  }

  if (gen === playbackGeneration) {
    speakAlertText(text, lang, onStart, onEnd, rate);
  }
}

/**
 * Quietly warms the client & server TTS cache for a language so switching audio EN/AR plays instantly.
 */
export async function prefetchTts(text: string, lang: SupportedLanguage): Promise<void> {
  const cleaned = text.trim();
  if (!cleaned) return;
  const cacheKey = `${lang}:${cleaned}`;
  if (clientTtsCache.has(cacheKey)) return;

  try {
    const res = await fetch('/api/gemini/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleaned, language: lang }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.audioBase64) {
      if (clientTtsCache.size >= CLIENT_TTS_CACHE_MAX) {
        const firstKey = clientTtsCache.keys().next().value;
        if (firstKey) clientTtsCache.delete(firstKey);
      }
      clientTtsCache.set(cacheKey, {
        audioBase64: data.audioBase64,
        mimeType: data.mimeType || 'audio/wav',
      });
    }
  } catch {
    // Best-effort background prefetch
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
