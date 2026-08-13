"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked, ChevronLeft, Volume2 } from "@/components/icons";
import { EmptyState, InlineLoader } from "@/components/feedback";
import { api } from "@/lib/api";
import type { StudyQueueItem } from "@/lib/types";

const ratings = [
  { key: "again", label: "忘记", hint: "10 分钟", className: "again" },
  { key: "hard", label: "困难", hint: "1 天", className: "hard" },
  { key: "good", label: "认识", hint: "按计划", className: "good" },
  { key: "easy", label: "简单", hint: "更久后", className: "easy" },
] as const;

export default function LearnPage() {
  const [queue, setQueue] = useState<StudyQueueItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const response = await api<{ items: StudyQueueItem[] }>("/study/queue?limit=20");
    setQueue(response.items); setIndex(0); setRevealed(false); setSaved(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const item = queue?.[index];
  async function rate(rating: string) {
    if (!item) return;
    setSubmitting(true);
    await api("/study/reviews", { method: "POST", body: JSON.stringify({ word_id: item.word.id, rating }) });
    if (index + 1 < (queue?.length || 0)) { setIndex(index + 1); setRevealed(false); setSaved(false); }
    else await load();
    setSubmitting(false);
  }
  async function saveWord() {
    if (!item) return;
    await api("/vocabulary", { method: "POST", body: JSON.stringify({ word_id: item.word.id, source_type: "study" }) });
    setSaved(true);
  }
  function speak() { if (item && "speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(item.word.term)); } }

  if (!queue) return <InlineLoader />;
  if (!item) return <div className="page learn-page"><EmptyState eyebrow="ALL CLEAR" title="今天的学习完成了" description="你已经处理完当前词书的待学内容。可以去读一篇文章，让新词回到真实语境里。" action={<div className="button-row"><Link className="primary-button" href="/articles">去阅读</Link><Link className="secondary-button" href="/wordbooks">看看词书</Link></div>} /></div>;

  return (
    <div className="page learn-page">
      <header className="learn-header"><Link href="/dashboard" className="round-back" aria-label="返回今日"><ChevronLeft size={21} /></Link><div className="learn-progress"><div><span>{item.mode === "review" ? "复习" : "新词"}</span><strong>{index + 1} / {queue.length}</strong></div><div className="progress-line"><i style={{ width: `${((index + 1) / queue.length) * 100}%` }} /></div></div><button onClick={saveWord} className={`round-back ${saved ? "saved" : ""}`} title="加入生词本" aria-label="加入生词本"><BookMarked size={20} /></button></header>
      <section className={`study-card ${revealed ? "revealed" : ""}`}>
        <div className="card-top"><span className="mode-chip">{item.mode === "review" ? `第 ${item.repetitions + 1} 次相遇` : "初次见面"}</span><button className="sound-button" onClick={speak} aria-label="朗读单词"><Volume2 size={21} /></button></div>
        <div className="word-face"><h1>{item.word.term}</h1><p>{item.word.phonetic}</p></div>
        {!revealed ? <button className="reveal-button" onClick={() => setRevealed(true)}>想一想，再看释义<span>也可以按空格键</span></button> : <div className="word-answer"><div className="definition"><span>{item.word.part_of_speech}</span><h2>{item.word.translation}</h2></div><div className="example"><p>{item.word.example}</p><span>{item.word.example_translation}</span></div></div>}
      </section>
      {revealed ? <div className="rating-area"><p>这个词对你来说怎么样？</p><div className="rating-grid">{ratings.map((rating) => <button disabled={submitting} onClick={() => rate(rating.key)} className={rating.className} key={rating.key}><strong>{rating.label}</strong><span>{rating.hint}</span></button>)}</div></div> : <p className="learn-tip">先尝试回忆含义，主动回忆会让记忆更牢固。</p>}
    </div>
  );
}

