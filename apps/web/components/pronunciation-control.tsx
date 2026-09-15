"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "@/components/icons";
import {
  getPronunciationAccent,
  setPronunciationAccent,
  speakEnglish,
  type PronunciationAccent,
} from "@/lib/pronunciation";

export function PronunciationControl({ text }: { text: string }) {
  const [accent, setAccent] = useState<PronunciationAccent>("en-US");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => setAccent(getPronunciationAccent()), []);

  function choose(nextAccent: PronunciationAccent) {
    setAccent(nextAccent);
    setPronunciationAccent(nextAccent);
  }

  function speak() {
    const supported = speakEnglish(text, {
      accent,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    if (!supported) setSpeaking(false);
  }

  return (
    <div className="pronunciation-control" aria-label="单词发音">
      <div className="accent-switch" role="group" aria-label="发音口音">
        <button className={accent === "en-US" ? "active" : ""} onClick={() => choose("en-US")} type="button" aria-pressed={accent === "en-US"}>美</button>
        <button className={accent === "en-GB" ? "active" : ""} onClick={() => choose("en-GB")} type="button" aria-pressed={accent === "en-GB"}>英</button>
      </div>
      <button className={`sound-button ${speaking ? "speaking" : ""}`} onClick={speak} type="button" aria-label={`朗读 ${text}`}>
        <Volume2 size={20} />
      </button>
    </div>
  );
}
