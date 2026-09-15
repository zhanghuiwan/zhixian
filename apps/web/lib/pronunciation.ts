export type PronunciationAccent = "en-US" | "en-GB";

const ACCENT_KEY = "zhixian-pronunciation-accent";

export function getPronunciationAccent(): PronunciationAccent {
  if (typeof window === "undefined") return "en-US";
  return localStorage.getItem(ACCENT_KEY) === "en-GB" ? "en-GB" : "en-US";
}

export function setPronunciationAccent(accent: PronunciationAccent): void {
  if (typeof window !== "undefined") localStorage.setItem(ACCENT_KEY, accent);
}

export function speakEnglish(
  text: string,
  options: {
    accent?: PronunciationAccent;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  } = {},
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const accent = options.accent || getPronunciationAccent();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const exactVoice = voices.find((voice) => voice.lang.toLowerCase() === accent.toLowerCase());
  const languageVoice = voices.find((voice) =>
    voice.lang.toLowerCase().startsWith(accent.slice(0, 2).toLowerCase()),
  );
  utterance.lang = accent;
  utterance.voice = exactVoice || languageVoice || null;
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
