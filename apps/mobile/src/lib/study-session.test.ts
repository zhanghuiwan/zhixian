import { describe, expect, it } from 'vitest';
import { buildCompletionPayload, createDraft, finalizeDraft, isDraftComplete, recordAttempt, roundStats, roundWordIds } from './study-session';
import type { StudyAttempt, StudyQueue } from './types';

const queue: StudyQueue = {
  due_count: 1,
  new_count: 1,
  items: [1, 2].map((id, index) => ({
    word: { id, term: `word${id}`, phonetic: '', part_of_speech: 'n.', translation: `词${id}`, definitions: [], example: '', example_translation: '', dictionary_source: 'system' as const },
    mode: index ? 'new' as const : 'review' as const,
    repetitions: 0,
    mastery_score: 0,
    source_kind: 'system' as const,
    source_id: 3,
    source_name: '测试词书',
    intervals: {},
  })),
};
const attempt = (score: number, roundNo: number): StudyAttempt => ({ score, answer_kind: score >= 80 ? 'remembered' : 'forgot', round_no: roundNo, response_ms: 800, revealed_before_answer: true });

describe('study session rounds', () => {
  it('moves failed words into the next round and keeps every attempt', () => {
    let draft = createDraft(queue, 'all', 'card');
    draft = recordAttempt(draft, 1, attempt(0, 1));
    expect(draft.active_word_ids).toEqual([2]);
    expect(draft.next_round_word_ids).toEqual([1]);
    draft = recordAttempt(draft, 2, attempt(90, 1));
    expect(draft.round_no).toBe(2);
    expect(draft.active_word_ids).toEqual([1]);
    draft = recordAttempt(draft, 1, attempt(90, 2));
    expect(isDraftComplete(draft)).toBe(true);
    expect(draft.attempts[1].map((item) => item.score)).toEqual([0, 90]);
  });

  it('builds one batch payload with all round history', () => {
    let draft = createDraft(queue, 'review', 'quick');
    draft = recordAttempt(draft, 1, attempt(50, 1));
    draft = recordAttempt(draft, 2, attempt(90, 1));
    draft = recordAttempt(draft, 1, attempt(90, 2));
    const payload = buildCompletionPayload(draft);
    expect(payload.round_count).toBe(2);
    expect(payload.words).toHaveLength(2);
    expect(payload.words[0].attempts).toHaveLength(2);
    expect(payload.words.every((word) => word.attempts.at(-1)!.score >= 80)).toBe(true);
    expect(payload.source_kind).toBe('system');
  });

  it('keeps the completion payload stable when a failed request is retried', () => {
    let draft = createDraft(queue, 'all', 'card');
    draft = recordAttempt(draft, 1, attempt(90, 1));
    draft = recordAttempt(draft, 2, attempt(90, 1));
    const first = finalizeDraft(draft, new Date(draft.started_at).getTime() + 4321);
    const persisted = JSON.parse(JSON.stringify(first));
    const retry = finalizeDraft(persisted, new Date(draft.started_at).getTime() + 9999);
    expect(retry.completion_payload).toEqual(first.completion_payload);
    expect(retry.completion_payload?.duration_ms).toBe(4321);
  });
  it('answers arbitrary list rows without removing another pending word or accepting duplicates', () => {
    const original = createDraft(queue, 'all', 'quick');
    const answered = recordAttempt(original, 2, attempt(90, 99));
    expect(answered.active_word_ids).toEqual([1]);
    expect(answered.attempts[2][0].round_no).toBe(1);
    expect(roundStats(answered)).toEqual({ done: 1, total: 2 });
    expect(recordAttempt(answered, 2, attempt(0, 1))).toBe(answered);
  });

  it('resets progress each round, uses the 80 boundary and preserves error order', () => {
    let draft = createDraft(queue, 'all', 'quick');
    draft = recordAttempt(draft, 2, attempt(79, 1));
    draft = recordAttempt(draft, 1, attempt(0, 1));
    expect(draft.round_word_ids).toEqual([2, 1]);
    expect(roundStats(draft)).toEqual({ done: 0, total: 2 });
    draft = recordAttempt(draft, 2, attempt(80, 2));
    draft = recordAttempt(draft, 1, attempt(50, 2));
    expect(draft.round_no).toBe(3);
    expect(roundStats(draft)).toEqual({ done: 0, total: 1 });
    draft = recordAttempt(draft, 1, attempt(90, 3));
    expect(roundStats(draft)).toEqual({ done: 1, total: 1 });
    expect(buildCompletionPayload(draft).words[0].attempts.map((a) => a.score)).toEqual([0, 50, 90]);
  });

  it('restores the full round from an older version-one draft', () => {
    let draft = createDraft(queue, 'review', 'card');
    draft = recordAttempt(draft, 1, attempt(50, 1));
    delete draft.round_word_ids;
    const restored = JSON.parse(JSON.stringify(draft));
    expect(roundWordIds(restored)).toEqual([1, 2]);
    expect(roundStats(restored)).toEqual({ done: 1, total: 2 });
    expect(recordAttempt(restored, 2, attempt(90, 1)).round_word_ids).toEqual([1]);
  });

});
