"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked, Search, Volume2, X } from "@/components/icons";
import { EmptyState, InlineLoader } from "@/components/feedback";
import { api } from "@/lib/api";
import { speakEnglish } from "@/lib/pronunciation";
import type { VocabularyItem } from "@/lib/types";

const sourceLabels: Record<string, string> = { article: "来自文章", study: "来自学习", manual: "手工添加", custom_word: "AI 补充", ai_agent: "AI 添加" };
type DictionarySource = "all" | "system" | "custom";

export default function VocabularyPage() {
  const [items, setItems] = useState<VocabularyItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [dictionarySource, setDictionarySource] = useState<DictionarySource>("all");
  const load = useCallback(async (term = "") => setItems(await api<VocabularyItem[]>(`/vocabulary?q=${encodeURIComponent(term)}`)), []);
  useEffect(() => { const timer = window.setTimeout(() => load(query), 220); return () => window.clearTimeout(timer); }, [load, query]);
  useEffect(() => {
    const source = new URL(window.location.href).searchParams.get("origin");
    if (source === "system" || source === "custom") setDictionarySource(source);
  }, []);

  async function remove(wordId: number) { await api(`/vocabulary/${wordId}`, { method: "DELETE" }); await load(query); }
  function speak(term: string) { speakEnglish(term); }

  const visibleItems = items?.filter(
    (item) => dictionarySource === "all" || item.word.dictionary_source === dictionarySource
  );
  const customCount = items?.filter((item) => item.word.dictionary_source === "custom").length ?? 0;

  return (
    <div className="page narrow-page">
      <header className="page-header split-header"><div><span className="eyebrow">MY VOCABULARY</span><h1>我的单词</h1><p>统一查看收藏的系统词和 AI 帮你补充的私有词条。</p></div><div className="word-total"><BookMarked size={21} /><strong>{items?.length ?? "—"}</strong><span>个单词</span></div></header>
      <div className="workspace-tabs vocabulary-tabs" role="tablist" aria-label="单词来源">
        <button role="tab" aria-selected={dictionarySource === "all"} onClick={() => setDictionarySource("all")}>全部 <span>{items?.length ?? 0}</span></button>
        <button role="tab" aria-selected={dictionarySource === "system"} onClick={() => setDictionarySource("system")}>系统词</button>
        <button role="tab" aria-selected={dictionarySource === "custom"} onClick={() => setDictionarySource("custom")}>我的新增 <span>{customCount}</span></button>
      </div>
      <div className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索英文或中文释义" aria-label="搜索生词" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={17} /></button>}</div>
      {!items ? <InlineLoader /> : !visibleItems?.length ? <EmptyState eyebrow="A FRESH PAGE" title={query ? "没有找到相关单词" : dictionarySource === "custom" ? "还没有我的新增单词" : "这里还是空的"} description={query ? "换一个关键词试试看。" : dictionarySource === "custom" ? "AI 查到系统词库没有的词时，可以在你确认后补充到这里。" : "阅读文章或学习时收藏单词，就能在这里统一管理。"} /> : <div className="vocabulary-list">{visibleItems.map((item) => <article key={item.id} className="vocab-card"><div className="vocab-word"><button className="sound-button small" onClick={() => speak(item.word.term)} aria-label={`朗读 ${item.word.term}`}><Volume2 size={17} /></button><div><div className="word-title-row"><h2>{item.word.term}</h2><span className={`word-origin ${item.word.dictionary_source}`}>{item.word.dictionary_source === "custom" ? "我的新增" : "系统词"}</span></div><span>{item.word.phonetic}</span></div></div><div className="vocab-meaning"><p><em>{item.word.part_of_speech}</em>{item.word.translation}</p><div className="mini-mastery"><span>熟练度</span><i><b style={{ width: `${item.mastery_score}%` }} /></i><strong>{item.mastery_score}%</strong></div></div><div className="vocab-meta"><span>{sourceLabels[item.source_type] || item.source_type}</span><time>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(item.created_at))}</time><button onClick={() => remove(item.word.id)}>移除</button></div></article>)}</div>}
    </div>
  );
}
