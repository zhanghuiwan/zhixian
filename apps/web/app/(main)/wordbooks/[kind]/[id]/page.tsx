"use client";

import Link from "next/link";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { ChevronLeft, Search, Trash2, X } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api } from "@/lib/api";
import type { LibraryBookDetail } from "@/lib/types";

export default function WordbookDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  const validKind = kind === "personal" || kind === "system" ? kind : "system";
  const [data, setData] = useState<LibraryBookDetail | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [terms, setTerms] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await api<LibraryBookDetail>(`/library/${validKind}/${id}?q=${encodeURIComponent(query)}&state=${state}`)); setError(""); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "词书加载失败"); }
  }, [id, query, state, validKind]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 180); return () => window.clearTimeout(timer); }, [load]);

  async function selectBook() { await api(`/library/${validKind}/${id}/select`, { method: "POST" }); await load(); }
  async function addWords(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const parsed = terms.split(/[\s,，;；]+/).filter(Boolean);
    const result = await api<{ added: number; existing: number; missing: string[] }>(`/library/personal/${id}/words`, { method: "POST", body: JSON.stringify({ terms: parsed }) });
    setMessage(`已添加 ${result.added} 个，已有 ${result.existing} 个${result.missing.length ? `，未收录：${result.missing.join("、")}` : ""}`);
    setTerms(""); await load();
  }
  async function removeWord(wordId: number) { await api(`/library/personal/${id}/words/${wordId}`, { method: "DELETE" }); await load(); }
  if (error && !data) return <div className="page"><div className="workspace-empty"><h2>{error}</h2><Link className="secondary-button" href="/wordbooks">返回词书</Link></div></div>;
  if (!data) return <InlineLoader />;
  const book = data.book;
  return <div className="page workspace-page">
    <Link className="workspace-back" href="/wordbooks"><ChevronLeft size={18} /> 返回词书</Link>
    <header className="book-detail-head"><div><span>{book.kind === "system" ? "系统词书" : "个人词书"}</span><h1>{book.name}</h1><p>{book.description}</p></div><div className="book-detail-actions"><button className="secondary-button" disabled={book.is_selected} onClick={selectBook}>{book.is_selected ? "当前词书" : "设为当前词书"}</button><Link className="primary-button" href={`/learn?kind=${book.kind}&source_id=${book.id}&mode=all`}>开始学习</Link></div></header>
    <div className="book-summary"><span><strong>{book.word_count}</strong>总词数</span><span><strong>{book.learned_count}</strong>已学习</span><span><strong>{book.mastered_count}</strong>已掌握</span><span><strong>{book.due_count}</strong>待复习</span></div>
    {validKind === "personal" && <form className="add-terms-form" onSubmit={addWords}><label htmlFor="terms">添加单词</label><div><textarea id="terms" value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="输入或粘贴单词，用空格、逗号或换行分隔" required /><button className="primary-button">添加到词书</button></div>{message && <p role="status">{message}</p>}</form>}
    <div className="book-word-toolbar"><div className="search-box compact"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索本书单词" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={16} /></button>}</div><select value={state} onChange={(event) => setState(event.target.value)} aria-label="筛选学习状态"><option value="all">全部状态</option><option value="new">未学习</option><option value="learning">学习中</option><option value="mastered">已掌握</option></select></div>
    <div className="book-word-list">{data.words.map((item) => <article key={item.word.id}><div><div className="word-title-row"><h2>{item.word.term}</h2><span className={`word-origin ${item.word.dictionary_source}`}>{item.word.dictionary_source === "custom" ? "我的新增" : "系统词"}</span></div><span>{item.word.phonetic}</span></div><p><em>{item.word.part_of_speech}</em>{item.word.translation}</p><div className="word-state"><span>{item.status === "new" ? "未学习" : item.status === "mastered" ? "已掌握" : `熟练度 ${item.mastery_score}%`}</span>{validKind === "personal" && <button onClick={() => removeWord(item.word.id)} aria-label={`从词书移除 ${item.word.term}`}><Trash2 size={16} /></button>}</div></article>)}</div>
    {!data.words.length && <div className="workspace-empty"><h2>{query ? "没有匹配的单词" : "这本词书还是空的"}</h2><p>{query ? "换一个关键词或筛选状态试试。" : "在上方添加词典中已有的单词。"}</p></div>}
  </div>;
}
