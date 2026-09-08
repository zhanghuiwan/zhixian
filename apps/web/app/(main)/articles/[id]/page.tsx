"use client";

import Link from "next/link";
import { FormEvent, use, useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ChevronLeft, PanelRightOpen, Send, Sparkles, Volume2, X } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { ApiError, api, streamApi } from "@/lib/api";
import type { ArticleDetail, Word } from "@/lib/types";

type SelectionState = { text: string; sentenceId?: number; translation?: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ArticleReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(new Set());
  const [allTranslations, setAllTranslations] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [wordSaved, setWordSaved] = useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [fontSize, setFontSize] = useState(23);
  const [progress, setProgress] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const load = useCallback(() => api<ArticleDetail>(`/articles/${id}`).then((value) => { setArticle(value); setProgress(value.progress); window.setTimeout(() => document.getElementById(`sentence-${value.last_position}`)?.scrollIntoView({ block: "center" }), 80); }), [id]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function onScroll() {
      const element = bodyRef.current;
      if (!element || !article) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const max = Math.max(1, element.offsetHeight - window.innerHeight * 0.5);
      const next = Math.min(99, Math.max(0, Math.round(((window.scrollY - top + 180) / max) * 100)));
      setProgress(next);
      const position = Math.min(article.sentences.length, Math.max(1, Math.ceil((next / 100) * article.sentences.length)));
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { void api(`/articles/${id}/progress`, { method: "PUT", body: JSON.stringify({ position, percent: next }) }); }, 800);
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [article, id]);

  if (!article) return <InlineLoader />;
  const currentArticle = article;
  function captureSelection() {
    window.setTimeout(() => {
      const selected = window.getSelection();
      const text = selected?.toString().trim();
      if (!text || text.length > 8000 || !bodyRef.current?.contains(selected?.anchorNode || null)) { setSelection(null); return; }
      const exact = currentArticle.sentences.find((sentence) => sentence.text.includes(text));
      setSelection({ text, sentenceId: exact && exact.text === text ? exact.id : undefined, translation: exact && exact.text === text ? exact.translation : "" });
      setSaveMessage("");
    }, 20);
  }
  async function lookup(term: string) {
    const clean = term.trim().replace(/[^A-Za-z'-]/g, "");
    if (!clean) return;
    setLookupMessage(""); setWordSaved(false);
    try { setSelectedWord(await api<Word>(`/words/lookup?term=${encodeURIComponent(clean)}`)); }
    catch (cause) { setSelectedWord(null); setLookupMessage(cause instanceof ApiError ? cause.message : "暂未查到该词"); }
  }
  async function saveSelection() {
    if (!selection) return;
    try {
      await api("/sentences", { method: "POST", body: JSON.stringify({ text: selection.text, translation: selection.translation || "", article_id: currentArticle.id }) });
      setSaveMessage("已收藏");
      if (selection.sentenceId) setArticle((current) => current ? { ...current, sentences: current.sentences.map((sentence) => sentence.id === selection.sentenceId ? { ...sentence, is_bookmarked: true } : sentence) } : current);
    } catch (cause) { setSaveMessage(cause instanceof ApiError ? cause.message : "收藏失败"); }
  }
  async function toggleBookmark(sentenceId: number, active: boolean) {
    await api(`/articles/sentences/${sentenceId}/bookmark`, { method: active ? "DELETE" : "POST" });
    setArticle((current) => current ? { ...current, sentences: current.sentences.map((sentence) => sentence.id === sentenceId ? { ...sentence, is_bookmarked: !active } : sentence) } : current);
  }
  async function saveSelectedWord() { if (selectedWord) { await api("/vocabulary", { method: "POST", body: JSON.stringify({ word_id: selectedWord.id, source_type: "article", source_ref: id }) }); setWordSaved(true); } }
  function speak(text: string) { if ("speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }
  function askAboutSelection(action: "explain" | "translate") {
    if (!selection) return;
    setAiOpen(true);
    setAiInput(`${action === "translate" ? "请翻译并解释" : "请解释这段文字的表达和语境"}。文章《${currentArticle.title}》：${selection.text}`);
  }
  async function askAi(event: FormEvent) {
    event.preventDefault();
    const message = aiInput.trim();
    if (!message || aiStreaming) return;
    setAiInput(""); setAiMessages((current) => [...current, { role: "user", content: message }]); setAiStreaming(true);
    try {
      await streamApi("/ai/chat/stream", { message, conversation_id: conversationId }, (event) => {
        if (event.event === "conversation.created") setConversationId(Number(event.data.conversation_id));
        if (event.event === "message.delta") {
          const delta = String(event.data.content || "");
          setAiMessages((current) => { const last = current.at(-1); return last?.role === "assistant" ? [...current.slice(0, -1), { ...last, content: last.content + delta }] : [...current, { role: "assistant", content: delta }]; });
        }
        if (event.event === "error") setAiMessages((current) => [...current, { role: "assistant", content: String(event.data.message || "AI 暂时无法回答") }]);
      });
    } catch (cause) { setAiMessages((current) => [...current, { role: "assistant", content: cause instanceof ApiError ? cause.message : "AI 连接中断，请稍后重试" }]); }
    finally { setAiStreaming(false); }
  }
  async function complete() { await api(`/articles/${id}/progress`, { method: "PUT", body: JSON.stringify({ position: currentArticle.sentences.length, percent: 100, completed: true }) }); setProgress(100); }

  return <div className={`reader-page reader-workspace ${aiOpen ? "with-ai" : ""}`}>
    <div className="reader-topbar"><Link href="/articles"><ChevronLeft size={18} /> 阅读</Link><div className="reader-progress"><i style={{ width: `${progress}%` }} /></div><span>{progress}%</span><div className="reader-settings"><button onClick={() => setFontSize(Math.max(18, fontSize - 1))} aria-label="缩小字体">A−</button><button onClick={() => setFontSize(Math.min(30, fontSize + 1))} aria-label="放大字体">A+</button><button className={allTranslations ? "active" : ""} onClick={() => setAllTranslations(!allTranslations)}>译文</button><button className={aiOpen ? "active" : ""} onClick={() => setAiOpen(!aiOpen)}><PanelRightOpen size={17} /> AI</button></div></div>
    <main className="reader-main"><article className="continuous-article">
      <header><div><span>{article.topic} · {article.level} · {article.read_minutes} 分钟</span>{article.is_private && <small>AI 生成草稿</small>}</div><h1>{article.title}</h1><h2>{article.title_zh}</h2><p>{article.summary}</p></header>
      <div className="continuous-body" ref={bodyRef} onMouseUp={captureSelection} onTouchEnd={captureSelection} style={{ "--reader-font-size": `${fontSize}px` } as React.CSSProperties}>
        {article.sentences.map((sentence) => <section id={`sentence-${sentence.position}`} key={sentence.id}><p onDoubleClick={() => void lookup(window.getSelection()?.toString() || "")}>{sentence.text}</p><div className="sentence-inline-actions"><button className={sentence.is_bookmarked ? "active" : ""} onClick={() => void toggleBookmark(sentence.id, sentence.is_bookmarked)}><Bookmark size={15} fill={sentence.is_bookmarked ? "currentColor" : "none"} /> {sentence.is_bookmarked ? "已收藏" : "收藏"}</button><button onClick={() => speak(sentence.text)}><Volume2 size={15} /> 朗读</button><button onClick={() => setVisibleTranslations((current) => { const next = new Set(current); if (next.has(sentence.id)) next.delete(sentence.id); else next.add(sentence.id); return next; })}>{allTranslations || visibleTranslations.has(sentence.id) ? "收起译文" : "查看译文"}</button></div>{(allTranslations || visibleTranslations.has(sentence.id)) && <p className="continuous-translation">{sentence.translation}</p>}</section>)}
      </div>
      <footer className="reader-finish"><p>读到这里了。将这次阅读记入学习记录。</p><button className="primary-button" onClick={() => void complete()} disabled={progress === 100}>{progress === 100 ? "已完成阅读" : "完成阅读"}</button></footer>
    </article></main>
    {selection && <div className="selection-toolbar" role="toolbar" aria-label="选中文字操作"><span title={selection.text}>{selection.text}</span>{/^\s*[A-Za-z'-]+\s*$/.test(selection.text) && <button onClick={() => void lookup(selection.text)}>查词</button>}<button onClick={() => askAboutSelection("translate")}>翻译</button><button onClick={() => void saveSelection()}>{saveMessage || "收藏"}</button><button onClick={() => askAboutSelection("explain")}><Sparkles size={15} /> 问 AI</button><button onClick={() => setSelection(null)} aria-label="关闭选中文字操作"><X size={15} /></button></div>}
    {(selectedWord || lookupMessage) && <aside className="dictionary-popover" aria-live="polite"><button className="close-dictionary" onClick={() => { setSelectedWord(null); setLookupMessage(""); }} aria-label="关闭"><X size={18} /></button>{selectedWord ? <><div className="dictionary-title"><div><h2>{selectedWord.term}</h2><span>{selectedWord.phonetic}</span></div><button className="sound-button small" onClick={() => speak(selectedWord.term)}><Volume2 size={17} /></button></div><p className="dictionary-meaning"><em>{selectedWord.part_of_speech}</em>{selectedWord.translation}</p>{selectedWord.example && <div className="dictionary-example"><p>{selectedWord.example}</p><span>{selectedWord.example_translation}</span></div>}<button className="primary-button wide" disabled={wordSaved} onClick={() => void saveSelectedWord()}>{wordSaved ? "已加入生词本" : "加入生词本"}</button></> : <div className="lookup-empty"><p>{lookupMessage}</p><button className="secondary-button" onClick={() => { setAiOpen(true); setAiInput(`请解释我在文章《${currentArticle.title}》里遇到的词：${selection?.text || ""}`); }}>询问 AI</button></div>}</aside>}
    {aiOpen && <aside className="reader-ai-panel"><header><div><Sparkles size={17} /><strong>文章 AI</strong></div><button onClick={() => setAiOpen(false)} aria-label="关闭 AI"><X size={18} /></button></header><div className="reader-ai-messages">{!aiMessages.length && <div><p>可以询问选中的词句、语法、上下文或整篇文章。</p><small>回答会保存在独立对话中。</small></div>}{aiMessages.map((message, index) => <article className={message.role} key={index}>{message.content}</article>)}{aiStreaming && aiMessages.at(-1)?.role !== "assistant" && <span>正在思考…</span>}</div><form onSubmit={askAi}><textarea value={aiInput} onChange={(event) => setAiInput(event.target.value)} placeholder="询问这篇文章…" rows={3} /><button disabled={!aiInput.trim() || aiStreaming} aria-label="发送给 AI"><Send size={17} /></button></form></aside>}
  </div>;
}
