"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { BookMarked, ChevronLeft, Sparkles } from "@/components/icons";
import { InlineLoader } from "@/components/feedback";
import { PronunciationControl } from "@/components/pronunciation-control";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { createRequestId } from "@/lib/request-id";
import {
  loadStudySession,
  removeStudySession,
  saveStudySession,
  studySessionStorageKey,
} from "@/lib/study-session-store";
import type {
  StudyAttempt,
  StudyQueueItem,
  StudySessionDraft,
  StudySessionResult,
} from "@/lib/types";

const PASS_SCORE = 80;
const fixedRatings = [
  { label: "不记得", score: 0, shortcut: "1", className: "forgot" },
  { label: "模糊", score: 50, shortcut: "2", className: "fuzzy" },
  { label: "熟悉", score: 90, shortcut: "3", className: "remembered" },
] as const;

type SourceKind = "system" | "personal" | "all";

function normalizedSource(kind: StudyQueueItem["source_kind"]): SourceKind {
  return kind === "system" || kind === "personal" ? kind : "all";
}

function answerKind(score: number): StudyAttempt["answer_kind"] {
  if (score < 20) return "forgot";
  if (score < PASS_SCORE) return "fuzzy";
  return "remembered";
}

function minutes(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

function QuickReviewRow({
  item,
  disabled,
  onRate,
}: {
  item: StudyQueueItem;
  disabled: boolean;
  onRate: (item: StudyQueueItem, score: number, kind: StudyAttempt["answer_kind"], revealed: boolean, responseMs?: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState(0);
  const touch = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  const rowStartedAt = useRef(0);

  useEffect(() => { rowStartedAt.current = Date.now(); }, []);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    const point = event.touches[0];
    touch.current = { x: point.clientX, y: point.clientY, horizontal: false };
  }

  function onTouchMove(event: TouchEvent<HTMLElement>) {
    const start = touch.current;
    const point = event.touches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (!start.horizontal) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      start.horizontal = true;
    }
    event.preventDefault();
    setOffset(Math.max(-132, Math.min(132, dx)));
  }

  function onTouchEnd() {
    if (!touch.current?.horizontal || Math.abs(offset) < 96) {
      touch.current = null;
      setOffset(0);
      return;
    }
    const score = offset < 0 ? 90 : 0;
    touch.current = null;
    setOffset(0);
    onRate(item, score, "quick", expanded, Date.now() - rowStartedAt.current);
  }

  return (
    <div className="quick-review-shell">
      <div className="quick-swipe-actions" aria-hidden="true">
        <span>不记得</span><span>熟悉</span>
      </div>
      <article
        className="quick-review-row"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touch.current = null; setOffset(0); }}
      >
        <button className="quick-word-main" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          <span><strong>{item.word.term}</strong><small>{item.word.phonetic}</small></span>
          <span className="quick-word-state">{expanded ? "收起" : "查看释义"}</span>
        </button>
        {expanded && (
          <div className="quick-word-detail">
            <p><em>{item.word.part_of_speech}</em>{item.word.translation}</p>
            {item.word.example && <blockquote>{item.word.example}<small>{item.word.example_translation}</small></blockquote>}
            <div className="quick-rating-row">
              {fixedRatings.map((rating) => (
                <button disabled={disabled} key={rating.score} className={rating.className} type="button" onClick={() => onRate(item, rating.score, answerKind(rating.score), true, Date.now() - rowStartedAt.current)}>
                  {rating.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

export default function LearnPage({ searchParams }: { searchParams: Promise<{ kind?: string; source_id?: string; mode?: string }> }) {
  const params = use(searchParams);
  const { user, loading: authLoading } = useAuth();
  const kind = params.kind === "system" || params.kind === "personal" ? params.kind : undefined;
  const sourceId = params.source_id && Number.isInteger(Number(params.source_id)) ? Number(params.source_id) : undefined;
  const mode = params.mode === "new" || params.mode === "review" ? params.mode : "all";
  const contextKey = `${user?.id || "pending"}:${kind || "all"}:${sourceId || "all"}:${mode}`;
  const storageKey = studySessionStorageKey(contextKey);
  const [session, setSession] = useState<StudySessionDraft | null>(null);
  const [completion, setCompletion] = useState<{ result: StudySessionResult; draft: StudySessionDraft } | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [familiarity, setFamiliarity] = useState(50);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const [savedWordIds, setSavedWordIds] = useState<Set<number>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);
  const wordStartedAt = useRef(0);
  const answerLock = useRef(false);
  const finishLock = useRef(false);

  const createDraft = useCallback((items: StudyQueueItem[]): StudySessionDraft => ({
    version: 2,
    context_key: contextKey,
    session_id: createRequestId(),
    mode,
    source_kind: kind || "all",
    source_id: sourceId || null,
    source_name: kind ? items[0]?.source_name || "当前词书" : "综合学习",
    items,
    active_word_ids: items.map((item) => item.word.id),
    next_round_word_ids: [],
    attempts: {},
    round_no: 1,
    started_at: new Date().toISOString(),
    view_mode: "card",
  }), [contextKey, kind, mode, sourceId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (authLoading || !user) return;
      setLoading(true);
      setError("");
      setEmpty(false);
      setRestored(false);
      setSession(null);
      const stored = await loadStudySession(storageKey);
      if (cancelled) return;
      if (stored?.version === 2 && stored.context_key === contextKey && stored.items.length) {
        setSession(stored);
        setRestored(true);
        setLoading(false);
        wordStartedAt.current = Date.now();
        return;
      }
      const query = new URLSearchParams({ limit: "20", mode });
      if (kind && sourceId) {
        query.set("kind", kind);
        query.set("source_id", String(sourceId));
      }
      try {
        const response = await api<{ items: StudyQueueItem[] }>(`/study/queue?${query}`);
        if (cancelled) return;
        if (!response.items.length) {
          setSession(null);
          setEmpty(true);
        } else {
          const draft = createDraft(response.items);
          setSession(draft);
          wordStartedAt.current = Date.now();
          await saveStudySession(storageKey, draft);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof ApiError ? cause.message : "学习队列加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [authLoading, contextKey, createDraft, kind, mode, reloadToken, sourceId, storageKey, user]);

  useEffect(() => {
    if (session) void saveStudySession(storageKey, session).catch(() => undefined);
  }, [session, storageKey]);

  const itemById = useMemo(
    () => new Map(session?.items.map((item) => [item.word.id, item]) || []),
    [session?.items],
  );
  const currentItem = session ? itemById.get(session.active_word_ids[0]) : undefined;
  const completedCount = session?.items.filter((queueItem) => {
    const history = session.attempts[String(queueItem.word.id)] || [];
    return Boolean(history.length && history.at(-1)!.score >= PASS_SCORE);
  }).length || 0;

  const finishSession = useCallback(async (draft: StudySessionDraft) => {
    if (finishLock.current) return;
    const durationMs = draft.duration_ms ?? Math.max(0, Math.min(86_400_000, Date.now() - new Date(draft.started_at).getTime()));
    const finalizedDraft = draft.duration_ms === undefined ? { ...draft, duration_ms: durationMs } : draft;
    const words = draft.items.map((queueItem) => ({
      word_id: queueItem.word.id,
      mode: queueItem.mode,
      source_kind: normalizedSource(queueItem.source_kind),
      source_id: normalizedSource(queueItem.source_kind) === "all" ? null : queueItem.source_id,
      attempts: draft.attempts[String(queueItem.word.id)] || [],
    }));
    if (words.some((word) => !word.attempts.length || word.attempts.at(-1)!.score < PASS_SCORE)) {
      setError("本地学习记录不完整，请返回学习中心重新开始这一组");
      return;
    }
    finishLock.current = true;
    setSyncing(true);
    setError("");
    if (finalizedDraft !== draft) setSession(finalizedDraft);
    await saveStudySession(storageKey, finalizedDraft);
    try {
      const result = await api<StudySessionResult>("/study/sessions/complete", {
        method: "POST",
        body: JSON.stringify({
          session_id: draft.session_id,
          mode: draft.mode,
          source_kind: draft.source_kind,
          source_id: draft.source_id,
          source_name: draft.source_name,
          started_at: draft.started_at,
          duration_ms: durationMs,
          round_count: draft.round_no,
          words,
        }),
      });
      await removeStudySession(storageKey);
      setCompletion({ result, draft: finalizedDraft });
      setRestored(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "本组记录同步失败，请重试");
    } finally {
      setSyncing(false);
      finishLock.current = false;
    }
  }, [storageKey]);

  useEffect(() => {
    if (session && !session.active_word_ids.length && !session.next_round_word_ids.length && !completion && !syncing && !error) {
      void finishSession(session);
    }
  }, [completion, error, finishSession, session, syncing]);

  const rate = useCallback((queueItem: StudyQueueItem, score: number, kindOfAnswer: StudyAttempt["answer_kind"], revealedBeforeAnswer: boolean, responseMs?: number) => {
    if (!session || answerLock.current || syncing) return;
    answerLock.current = true;
    const wordId = queueItem.word.id;
    const attempt: StudyAttempt = {
      score,
      answer_kind: kindOfAnswer,
      round_no: session.round_no,
      response_ms: Math.max(0, Math.min(3_600_000, responseMs ?? Date.now() - wordStartedAt.current)),
      revealed_before_answer: revealedBeforeAnswer,
    };
    let activeWordIds = session.active_word_ids.filter((id) => id !== wordId);
    let nextRoundWordIds = [...session.next_round_word_ids];
    if (score < PASS_SCORE && !nextRoundWordIds.includes(wordId)) nextRoundWordIds.push(wordId);
    let roundNo = session.round_no;
    if (!activeWordIds.length && nextRoundWordIds.length) {
      activeWordIds = nextRoundWordIds;
      nextRoundWordIds = [];
      roundNo += 1;
    }
    const nextSession: StudySessionDraft = {
      ...session,
      active_word_ids: activeWordIds,
      next_round_word_ids: nextRoundWordIds,
      round_no: roundNo,
      attempts: {
        ...session.attempts,
        [String(wordId)]: [...(session.attempts[String(wordId)] || []), attempt],
      },
    };
    if (!activeWordIds.length && !nextRoundWordIds.length) {
      nextSession.duration_ms = Math.max(0, Math.min(86_400_000, Date.now() - new Date(session.started_at).getTime()));
    }
    setSession(nextSession);
    setRevealed(false);
    setFamiliarity(50);
    setError("");
    setRestored(false);
    wordStartedAt.current = Date.now();
    window.setTimeout(() => { answerLock.current = false; }, 0);
  }, [session, syncing]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a") || session?.view_mode !== "card" || !currentItem) return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        setRevealed(true);
      }
      if (revealed) {
        const selected = fixedRatings.find((rating) => rating.shortcut === event.key);
        if (selected) rate(currentItem, selected.score, answerKind(selected.score), true);
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [currentItem, rate, revealed, session?.view_mode]);

  async function saveWord(queueItem: StudyQueueItem) {
    try {
      await api("/vocabulary", {
        method: "POST",
        body: JSON.stringify({ word_id: queueItem.word.id, source_type: "study", source_ref: queueItem.source_name }),
      });
      setSavedWordIds((current) => new Set(current).add(queueItem.word.id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "加入生词本失败");
    }
  }

  function switchView(viewMode: StudySessionDraft["view_mode"]) {
    if (!session) return;
    setSession({ ...session, view_mode: viewMode });
    setRevealed(false);
    setFamiliarity(50);
    wordStartedAt.current = Date.now();
  }

  function startAnotherGroup() {
    setLoading(true);
    setCompletion(null);
    setSession(null);
    setEmpty(false);
    setError("");
    setReloadToken((value) => value + 1);
  }

  if (loading) return <InlineLoader />;

  if (completion) {
    return (
      <div className="page learn-page focus-page">
        <section className="study-completion">
          <span className="completion-kicker">本组学习完成</span>
          <h1>这一组已经记住了</h1>
          <p>{completion.draft.source_name}</p>
          <div className="completion-metrics">
            <span><strong>{completion.result.word_count}</strong>单词</span>
            <span><strong>{completion.result.round_count}</strong>轮练习</span>
            <span><strong>{completion.result.repeated_words}</strong>重复词</span>
            <span><strong>{minutes(completion.result.duration_ms)}</strong>分钟</span>
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={startAnotherGroup}>继续下一组</button>
            <Link className="secondary-button" href="/study">返回学习中心</Link>
          </div>
        </section>
      </div>
    );
  }

  if (session && !session.active_word_ids.length && !session.next_round_word_ids.length) {
    return (
      <div className="page learn-page focus-page">
        <section className="study-completion syncing-completion">
          <span className="completion-kicker">本组已在本机保存</span>
          <h1>{syncing ? "正在同步学习记录" : "学习记录等待同步"}</h1>
          <p>{error || "正在把整组结果统一写入学习记录。"}</p>
          {!syncing && <button className="primary-button" type="button" onClick={() => void finishSession(session)}>重新同步</button>}
        </section>
      </div>
    );
  }

  if (error && !session) {
    return <div className="page learn-page"><div className="workspace-empty"><h2>{error}</h2><button className="secondary-button" onClick={() => setReloadToken((value) => value + 1)}>重新加载</button></div></div>;
  }

  if (empty || !session || !currentItem) {
    return <div className="page learn-page"><div className="workspace-empty"><h2>{mode === "review" ? "当前没有到期单词" : "今天的学习已完成"}</h2><p>可以去读一篇文章，或从其他词书继续学习。</p><div className="button-row"><Link className="primary-button" href="/articles">去阅读</Link><Link className="secondary-button" href="/wordbooks">选择词书</Link></div></div></div>;
  }

  const progress = Math.round((completedCount / session.items.length) * 100);
  const activeItems = session.active_word_ids.map((wordId) => itemById.get(wordId)).filter((value): value is StudyQueueItem => Boolean(value));
  const saved = savedWordIds.has(currentItem.word.id);

  return (
    <div className="page learn-page focus-page">
      <header className="learn-header">
        <Link href={kind && sourceId ? `/wordbooks/${kind}/${sourceId}` : "/study"} className="round-back" aria-label="退出本组学习"><ChevronLeft size={21} /></Link>
        <div className="learn-progress">
          <div><span>{session.source_name}</span><strong>{completedCount} / {session.items.length}</strong></div>
          <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
        </div>
        <button onClick={() => void saveWord(currentItem)} className={`round-back ${saved ? "saved" : ""}`} disabled={saved} title="加入默认生词本" aria-label="加入默认生词本"><BookMarked size={20} /></button>
      </header>

      <div className="session-toolbar">
        <div className="view-switch" role="group" aria-label="复习方式">
          <button type="button" className={session.view_mode === "card" ? "active" : ""} onClick={() => switchView("card")} aria-pressed={session.view_mode === "card"}>卡片</button>
          <button type="button" className={session.view_mode === "quick" ? "active" : ""} onClick={() => switchView("quick")} aria-pressed={session.view_mode === "quick"}>快速复习</button>
        </div>
        <div className="session-state"><strong>第 {session.round_no} 轮</strong><span>{restored ? "已恢复本机进度" : `本轮剩余 ${session.active_word_ids.length} 词`}</span></div>
      </div>

      {error && <p className="workspace-error" role="alert">{error}</p>}

      {session.view_mode === "quick" ? (
        <section className="quick-review-list" aria-label={`第 ${session.round_no} 轮快速复习`}>
          <header><div><h1>快速复习</h1><p>点开查看释义；手机端左滑熟悉，右滑不记得。</p></div><strong>{activeItems.length}</strong></header>
          {activeItems.map((queueItem) => <QuickReviewRow key={queueItem.word.id} item={queueItem} disabled={syncing} onRate={rate} />)}
        </section>
      ) : (
        <>
          <section className={`study-card ${revealed ? "revealed" : ""}`}>
            <div className="card-top">
              <div className="chip-row"><span className="mode-chip">{currentItem.mode === "review" ? "到期复习" : "学习新词"}</span><span className={`word-origin ${currentItem.word.dictionary_source}`}>{currentItem.word.dictionary_source === "custom" ? "我的新增" : "系统词"}</span></div>
              <div className="card-tools">
                <Link href={`/assistant?message=${encodeURIComponent(`请帮我理解单词 ${currentItem.word.term}，结合它的常见语境给一个好记的解释`)}`} className="sound-button" aria-label={`询问 AI 关于 ${currentItem.word.term}`}><Sparkles size={19} /></Link>
                <PronunciationControl text={currentItem.word.term} />
              </div>
            </div>
            <div className="word-face"><h1>{currentItem.word.term}</h1><p>{currentItem.word.phonetic}</p></div>
            {!revealed ? (
              <button className="reveal-button" onClick={() => setRevealed(true)}>想一想，再看释义<span>按空格键显示答案</span></button>
            ) : (
              <div className="word-answer">
                <div className="definition"><span>{currentItem.word.part_of_speech}</span><h2>{currentItem.word.translation}</h2></div>
                <div className="example"><p>{currentItem.word.example || "这个词暂时没有例句。"}</p><span>{currentItem.word.example_translation}</span></div>
              </div>
            )}
          </section>

          {revealed ? (
            <div className="rating-area">
              <div className="familiarity-heading"><span>熟悉度</span><strong>{familiarity}%</strong></div>
              <div className="rating-grid">
                {fixedRatings.map((rating) => <button type="button" onClick={() => rate(currentItem, rating.score, answerKind(rating.score), true)} className={rating.className} key={rating.score}><strong>{rating.label}</strong><span>{rating.shortcut}</span></button>)}
              </div>
              <div className="familiarity-slider">
                <input aria-label="自定义熟悉度" type="range" min="0" max="100" step="5" value={familiarity} onChange={(event) => setFamiliarity(Number(event.target.value))} onPointerUp={() => rate(currentItem, familiarity, "slider", true)} onKeyDown={(event) => { if (event.key === "Enter") rate(currentItem, familiarity, "slider", true); }} />
                <div><span>完全陌生</span><span>80 分通过本轮</span><span>非常熟悉</span></div>
              </div>
            </div>
          ) : <p className="learn-tip">先主动回忆含义，再显示答案。</p>}
        </>
      )}
    </div>
  );
}
