"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ChevronLeft, Volume2, X } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { api, ApiError } from "@/lib/api";
import type { ArticleDetail, Word } from "@/lib/types";

export default function ArticleReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(new Set());
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [wordSaved, setWordSaved] = useState(false);
  const [progress, setProgress] = useState(0);
  const readerRef = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api<ArticleDetail>(`/articles/${id}`).then(setArticle), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onScroll = () => {
      const element = readerRef.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const max = Math.max(1, element.offsetHeight - window.innerHeight * 0.55);
      setProgress(Math.min(100, Math.max(0, ((window.scrollY - top + 180) / max) * 100)));
    };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [article]);

  if (!article) return <InlineLoader />;
  async function lookup(term: string) {
    setLookupMessage(""); setWordSaved(false);
    try { setSelectedWord(await api<Word>(`/words/lookup?term=${encodeURIComponent(term)}`)); }
    catch (error) { setSelectedWord(null); setLookupMessage(error instanceof ApiError ? error.message : "暂未查到该词"); }
  }
  async function toggleBookmark(sentenceId: number, active: boolean) {
    await api(`/articles/sentences/${sentenceId}/bookmark`, { method: active ? "DELETE" : "POST" });
    setArticle((current) => current ? {
      ...current,
      sentences: current.sentences.map((sentence) =>
        sentence.id === sentenceId ? { ...sentence, is_bookmarked: !active } : sentence
      ),
    } : current);
  }
  async function saveSelectedWord() {
    if (!selectedWord) return;
    await api("/vocabulary", { method: "POST", body: JSON.stringify({ word_id: selectedWord.id, source_type: "article", source_ref: id }) });
    setWordSaved(true);
  }
  function toggleTranslation(sentenceId: number) {
    setVisibleTranslations((current) => {
      const next = new Set(current);
      if (next.has(sentenceId)) next.delete(sentenceId);
      else next.add(sentenceId);
      return next;
    });
  }
  function speak(text: string) { if ("speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }
  function renderWords(text: string) { return text.split(/(\s+)/).map((part, index) => /^([A-Za-z]+(?:'[A-Za-z]+)?)[.,!?;:'”"]?$/.test(part) ? <button key={index} className="inline-word" onClick={() => lookup(part)}>{part}</button> : part); }

  return (
    <div className="reader-page">
      <div className="reader-topbar"><Link href="/articles"><ChevronLeft size={19} /> 阅读室</Link><div className="reader-progress"><i style={{ width: `${progress}%` }} /></div><span>{Math.round(progress)}%</span></div>
      <article ref={readerRef} className="reader-article">
        <header className={`reader-cover ${article.cover_gradient}`}><div><span className="eyebrow light-text">{article.topic} · {article.level}</span><h1>{article.title}</h1><h2>{article.title_zh}</h2><p>{article.summary}</p><small>预计阅读 {article.read_minutes} 分钟 · 点击单词查看释义</small></div></header>
        <div className="reader-body">
          {article.sentences.map((sentence) => <section className="sentence-block" key={sentence.id}><div className="sentence-actions"><span>{String(sentence.position).padStart(2, "0")}</span><button className={sentence.is_bookmarked ? "active" : ""} onClick={() => toggleBookmark(sentence.id, sentence.is_bookmarked)} title="收藏句子" aria-label="收藏句子"><Bookmark size={18} fill={sentence.is_bookmarked ? "currentColor" : "none"} /></button><button onClick={() => speak(sentence.text)} title="朗读句子" aria-label="朗读句子"><Volume2 size={18} /></button></div><p className="english-sentence">{renderWords(sentence.text)}</p><button className="translation-toggle" onClick={() => toggleTranslation(sentence.id)}>{visibleTranslations.has(sentence.id) ? "收起译文" : "查看译文"}</button>{visibleTranslations.has(sentence.id) && <p className="sentence-translation">{sentence.translation}</p>}</section>)}
        </div>
        <footer className="reader-end"><span>END</span><h2>读到这里，很好。</h2><p>收藏的句子和加入的生词已经留在你的知闲空间。</p><Link href="/articles" className="secondary-button">再读一篇</Link></footer>
      </article>
      {(selectedWord || lookupMessage) && <aside className="dictionary-popover" aria-live="polite"><button className="close-dictionary" onClick={() => { setSelectedWord(null); setLookupMessage(""); }} aria-label="关闭"><X size={18} /></button>{selectedWord ? <><div className="dictionary-title"><div><h2>{selectedWord.term}</h2><span>{selectedWord.phonetic}</span></div><button className="sound-button small" onClick={() => speak(selectedWord.term)}><Volume2 size={17} /></button></div><p className="dictionary-meaning"><em>{selectedWord.part_of_speech}</em>{selectedWord.translation}</p><div className="dictionary-example"><p>{selectedWord.example}</p><span>{selectedWord.example_translation}</span></div><button className="primary-button wide" disabled={wordSaved} onClick={saveSelectedWord}>{wordSaved ? "已加入生词本" : "加入生词本"}</button></> : <div className="lookup-empty"><span>DICTIONARY</span><p>{lookupMessage}</p><small>第一阶段内置的是示例词典，后续可接入完整词典服务。</small></div>}</aside>}
    </div>
  );
}
