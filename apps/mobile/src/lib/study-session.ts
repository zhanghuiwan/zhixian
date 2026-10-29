import type { StudyAttempt, StudyDraft, StudyQueue, StudyQueueItem, StudySessionPayload } from './types';

export const PASS_SCORE = 80;
function createSessionId() { return `mob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }

export function normalizedSource(item: StudyQueueItem) {
  return item.source_kind === 'legacy' ? 'all' : item.source_kind;
}

export function createDraft(queue: StudyQueue, mode: StudyDraft['mode'], viewMode: StudyDraft['view_mode']): StudyDraft {
  const first = queue.items[0];
  const sourceKind = first ? normalizedSource(first) : 'all';
  return {
    version: 1,
    session_id: createSessionId(),
    mode,
    source_kind: sourceKind,
    source_id: sourceKind === 'all' ? null : first?.source_id ?? null,
    source_name: first?.source_name || '综合学习',
    items: queue.items,
    active_word_ids: queue.items.map((item) => item.word.id),
    round_word_ids: queue.items.map((item) => item.word.id),
    next_round_word_ids: [],
    attempts: {},
    round_no: 1,
    started_at: new Date().toISOString(),
    view_mode: viewMode,
  };
}

export function currentItem(draft: StudyDraft) {
  const id = draft.active_word_ids[0];
  return draft.items.find((item) => item.word.id === id) ?? null;
}

// Version-one drafts from older builds did not store the round snapshot.
export function roundWordIds(draft: StudyDraft): number[] {
  return draft.round_word_ids ?? draft.items.filter(({ word }) =>
    draft.active_word_ids.includes(word.id) || draft.attempts[word.id]?.some((a) => a.round_no === draft.round_no),
  ).map(({ word }) => word.id);
}

export function roundStats(draft: StudyDraft) {
  const ids = roundWordIds(draft);
  return { total: ids.length, done: ids.filter((id) => !draft.active_word_ids.includes(id)).length };
}

export function recordAttempt(draft: StudyDraft, wordId: number, attempt: StudyAttempt): StudyDraft {
  // List mode can answer any pending row; processed rows must never be graded twice.
  if (!draft.active_word_ids.includes(wordId) || draft.completion_payload) return draft;
  const recorded = { ...attempt, score: Math.max(0, Math.min(100, Math.round(attempt.score))), round_no: draft.round_no };
  const remaining = draft.active_word_ids.filter((id) => id !== wordId);
  const next = recorded.score < PASS_SCORE
    ? [...new Set([...draft.next_round_word_ids, wordId])]
    : draft.next_round_word_ids;
  const attempts = { ...draft.attempts, [wordId]: [...(draft.attempts[wordId] || []), recorded] };
  const snapshot = roundWordIds(draft);
  if (remaining.length) return { ...draft, round_word_ids: snapshot, active_word_ids: remaining, next_round_word_ids: next, attempts };
  if (next.length) return { ...draft, round_word_ids: next, active_word_ids: next, next_round_word_ids: [], attempts, round_no: draft.round_no + 1 };
  return { ...draft, round_word_ids: snapshot, active_word_ids: [], next_round_word_ids: [], attempts };
}

export function isDraftComplete(draft: StudyDraft) {
  return draft.active_word_ids.length === 0 && draft.next_round_word_ids.length === 0 && draft.items.length > 0;
}

export function buildCompletionPayload(draft: StudyDraft, completedAt = Date.now()): StudySessionPayload {
  return {
    session_id: draft.session_id,
    mode: draft.mode,
    source_kind: draft.source_kind,
    source_id: draft.source_id,
    source_name: draft.source_name,
    started_at: draft.started_at,
    duration_ms: Math.min(86_400_000, Math.max(0, completedAt - new Date(draft.started_at).getTime())),
    round_count: draft.round_no,
    words: draft.items.map((item) => ({
      word_id: item.word.id,
      mode: item.mode,
      source_kind: normalizedSource(item),
      source_id: normalizedSource(item) === 'all' ? null : item.source_id,
      attempts: draft.attempts[item.word.id] || [],
    })),
  };
}

export function finalizeDraft(draft: StudyDraft, completedAt = Date.now()): StudyDraft {
  if (!isDraftComplete(draft)) throw new Error('学习组尚未完成');
  return draft.completion_payload ? draft : { ...draft, completion_payload: buildCompletionPayload(draft, completedAt) };
}
