"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { BookMarked, ChevronLeft, Sparkles, Volume2 } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { StudyQueueItem } from "@/lib/types";

const ratings = [
  { key: "again", label: "忘记", shortcut: "1", className: "again" },
  { key: "hard", label: "困难", shortcut: "2", className: "hard" },
  { key: "good", label: "认识", shortcut: "3", className: "good" },
  { key: "easy", label: "简单", shortcut: "4", className: "easy" },
] as const;

export default function LearnPage({ searchParams }: { searchParams: Promise<{ kind?: string; source_id?: string; mode?: string }> }) {
  const params = use(searchParams);
  const kind = params.kind === "system" || params.kind === "personal" ? params.kind : undefined;
  const sourceId = params.source_id && Number.isInteger(Number(params.source_id)) ? Number(params.source_id) : undefined;
  const mode = params.mode === "new" || params.mode === "review" ? params.mode : "all";
  const [queue, setQueue] = useState<StudyQueueItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams({ limit: "20", mode });
    if (kind && sourceId) { query.set("kind", kind); query.set("source_id", String(sourceId)); }
    try { const response = await api<{ items: StudyQueueItem[] }>(`/study/queue?${query}`); setQueue(response.items); setIndex(0); setRevealed(false); setSaved(false); setError(""); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "学习队列加载失败"); setQueue([]); }
  }, [kind, mode, sourceId]);
  useEffect(() => { void load(); }, [load]);

  const item = queue?.[index];
  const rate = useCallback(async (rating: string) => {
    if (!item || submitting) return;
    setSubmitting(true); setError("");
    try {
      await api("/study/reviews", { method: "POST", body: JSON.stringify({ word_id: item.word.id, rating, source_kind: item.source_kind, source_id: item.source_id, request_id: crypto.randomUUID() }) });
      if (index + 1 < (queue?.length || 0)) { setIndex(index + 1); setRevealed(false); setSaved(false); }
      else await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "评分提交失败，请重试"); }
    finally { setSubmitting(false); }
  }, [index, item, load, queue, submitting]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a")) return;
      if (event.code === "Space" && !revealed) { event.preventDefault(); setRevealed(true); }
      if (revealed) { const rating = ratings.find((value) => value.shortcut === event.key); if (rating) void rate(rating.key); }
    }
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [rate, revealed]);

  async function saveWord() { if (item) { await api("/vocabulary", { method: "POST", body: JSON.stringify({ word_id: item.word.id, source_type: "study", source_ref: item.source_name }) }); setSaved(true); } }
  function speak() { if (item && "speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(item.word.term)); } }
  if (!queue) return <InlineLoader />;
  if (error && !item) return <div className="page learn-page"><div className="workspace-empty"><h2>{error}</h2><button className="secondary-button" onClick={() => void load()}>重新加载</button></div></div>;
  if (!item) return <div className="page learn-page"><div className="workspace-empty"><h2>{mode === "review" ? "当前没有到期单词" : "这一轮完成了"}</h2><p>可以去读一篇文章，或从其他词书继续学习。</p><div className="button-row"><Link className="primary-button" href="/articles">去阅读</Link><Link className="secondary-button" href="/wordbooks">选择词书</Link></div></div></div>;

  return <div className="page learn-page focus-page">
    <header className="learn-header"><Link href={kind && sourceId ? `/wordbooks/${kind}/${sourceId}` : "/wordbooks"} className="round-back" aria-label="返回词书"><ChevronLeft size={21} /></Link><div className="learn-progress"><div><span>{item.mode === "review" ? "到期复习" : "学习新词"} · {item.source_name}</span><strong>{index + 1} / {queue.length}</strong></div><div className="progress-line"><i style={{ width: `${((index + 1) / queue.length) * 100}%` }} /></div></div><button onClick={saveWord} className={`round-back ${saved ? "saved" : ""}`} disabled={saved} title="加入默认生词本" aria-label="加入默认生词本"><BookMarked size={20} /></button></header>
    {error && <p className="workspace-error" role="alert">{error}</p>}
    <section className={`study-card ${revealed ? "revealed" : ""}`}>
      <div className="card-top"><span className="mode-chip">{item.mode === "review" ? `第 ${item.repetitions + 1} 次相遇` : "初次学习"}</span><div><Link href={`/assistant?message=${encodeURIComponent(`请帮我理解单词 ${item.word.term}，结合它的常见语境给一个好记的解释`)}`} className="sound-button" aria-label={`询问 AI 关于 ${item.word.term}`}><Sparkles size={20} /></Link><button className="sound-button" onClick={speak} aria-label="朗读单词"><Volume2 size={21} /></button></div></div>
      <div className="word-face"><h1>{item.word.term}</h1><p>{item.word.phonetic}</p></div>
      {!revealed ? <button className="reveal-button" onClick={() => setRevealed(true)}>想一想，再看释义<span>按空格键显示答案</span></button> : <div className="word-answer"><div className="definition"><span>{item.word.part_of_speech}</span><h2>{item.word.translation}</h2></div><div className="example"><p>{item.word.example || "这个词暂时没有例句，可以询问 AI 获取适合你等级的示例。"}</p><span>{item.word.example_translation}</span></div></div>}
    </section>
    {revealed ? <div className="rating-area"><p>回忆得怎么样？</p><div className="rating-grid">{ratings.map((rating) => <button disabled={submitting} onClick={() => void rate(rating.key)} className={rating.className} key={rating.key}><strong>{rating.label}</strong><span>{item.intervals[rating.key]} · {rating.shortcut}</span></button>)}</div></div> : <p className="learn-tip">先主动回忆含义，再显示答案。</p>}
  </div>;
}
