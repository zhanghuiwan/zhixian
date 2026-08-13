"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked, Search, Volume2, X } from "@/components/icons";
import { EmptyState, InlineLoader } from "@/components/feedback";
import { api } from "@/lib/api";
import type { VocabularyItem } from "@/lib/types";

const sourceLabels: Record<string, string> = { article: "来自文章", study: "来自学习", manual: "手工添加" };

export default function VocabularyPage() {
  const [items, setItems] = useState<VocabularyItem[] | null>(null);
  const [query, setQuery] = useState("");
  const load = useCallback(async (term = "") => setItems(await api<VocabularyItem[]>(`/vocabulary?q=${encodeURIComponent(term)}`)), []);
  useEffect(() => { const timer = window.setTimeout(() => load(query), 220); return () => window.clearTimeout(timer); }, [load, query]);

  async function remove(wordId: number) { await api(`/vocabulary/${wordId}`, { method: "DELETE" }); await load(query); }
  function speak(term: string) { if ("speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(term)); } }

  return (
    <div className="page narrow-page">
      <header className="page-header split-header"><div><span className="eyebrow">MY VOCABULARY</span><h1>生词本</h1><p>把阅读中遇见的词留在这里，系统会在合适的时候安排复习。</p></div><div className="word-total"><BookMarked size={21} /><strong>{items?.length ?? "—"}</strong><span>个生词</span></div></header>
      <div className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索英文或中文释义" aria-label="搜索生词" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={17} /></button>}</div>
      {!items ? <InlineLoader /> : items.length === 0 ? <EmptyState eyebrow="A FRESH PAGE" title={query ? "没有找到相关生词" : "生词本还是空的"} description={query ? "换一个关键词试试看。" : "阅读文章时点击不熟悉的单词，就能把它加入这里。"} /> : <div className="vocabulary-list">{items.map((item) => <article key={item.id} className="vocab-card"><div className="vocab-word"><button className="sound-button small" onClick={() => speak(item.word.term)} aria-label={`朗读 ${item.word.term}`}><Volume2 size={17} /></button><div><h2>{item.word.term}</h2><span>{item.word.phonetic}</span></div></div><div className="vocab-meaning"><p><em>{item.word.part_of_speech}</em>{item.word.translation}</p><div className="mini-mastery"><span>熟练度</span><i><b style={{ width: `${item.mastery_score}%` }} /></i><strong>{item.mastery_score}%</strong></div></div><div className="vocab-meta"><span>{sourceLabels[item.source_type] || item.source_type}</span><time>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(item.created_at))}</time><button onClick={() => remove(item.word.id)}>移除</button></div></article>)}</div>}
    </div>
  );
}

