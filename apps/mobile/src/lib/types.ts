export interface User { id: number; email: string; nickname: string; level: string; daily_new_words: number; timezone: string; selected_wordbook_id: number | null; selected_collection_id: number | null; created_at: string; }
export interface Word { id: number; term: string; phonetic: string; part_of_speech: string; translation: string; definitions: { part_of_speech: string; meaning: string }[]; example: string; example_translation: string; dictionary_source: 'system' | 'custom'; }
export interface Wordbook { id: number; kind: 'system' | 'personal'; name: string; description: string; level: string; cover_color: string; word_count: number; learned_count: number; mastered_count: number; due_count: number; is_selected: boolean; is_default: boolean; }
export interface BookWord { word: Word; status: 'new' | 'learning' | 'mastered'; mastery_score: number; }
export interface BookDetail { book: Wordbook; words: BookWord[]; total: number; offset: number; }
export interface AddTermsResult { added: number; existing: number; missing: string[]; }
export interface Dashboard { due_today: number; studied_today: number; mastered_words: number; vocabulary_count: number; streak_days: number; current_wordbook: (Omit<Wordbook, 'kind' | 'due_count' | 'is_default'>) | null; recent_activity: { word: string; translation: string; rating: string; reviewed_at: string }[]; }
export interface StudyQueueItem { word: Word; mode: 'new' | 'review'; repetitions: number; mastery_score: number; source_kind: 'system' | 'personal' | 'all' | 'legacy'; source_id: number | null; source_name: string; intervals: Record<string, string>; }
export interface StudyQueue {
  items: StudyQueueItem[]; due_count: number; new_count: number;
  source_kind?: 'system' | 'personal' | null;
  source_id?: number | null; source_name?: string | null;
  remaining_new_count?: number | null;
  empty_reason?: 'book_completed' | 'daily_goal_reached' | 'no_selected_book' | null;
}
export interface StudyAttempt { score: number; answer_kind: 'forgot' | 'fuzzy' | 'remembered' | 'slider' | 'quick'; round_no: number; response_ms: number; revealed_before_answer: boolean; }
export interface StudySessionPayload { session_id: string; mode: 'all' | 'new' | 'review'; source_kind: 'system' | 'personal' | 'all'; source_id: number | null; source_name: string; started_at: string; duration_ms: number; round_count: number; words: { word_id: number; mode: 'new' | 'review'; source_kind: 'system' | 'personal' | 'all'; source_id: number | null; attempts: StudyAttempt[] }[]; }
export interface StudyDraft { version: 1; session_id: string; mode: 'all' | 'new' | 'review'; source_kind: 'system' | 'personal' | 'all'; source_id: number | null; source_name: string; items: StudyQueueItem[]; active_word_ids: number[]; round_word_ids?: number[]; next_round_word_ids: number[]; attempts: Record<string, StudyAttempt[]>; round_no: number; started_at: string; view_mode: 'card' | 'quick'; completion_payload?: StudySessionPayload; }
export interface StudySessionResult { session_id: string; word_count: number; attempt_count: number; repeated_words: number; round_count: number; duration_ms: number; completed_at: string; }
export interface Article { id: number; title: string; title_zh: string; summary: string; level: string; topic: string; read_minutes: number; cover_gradient: string; source_type: string; is_private: boolean; progress: number; is_completed: boolean; }
export interface ArticleSentence { id: number; position: number; text: string; translation: string; is_bookmarked: boolean; }
export interface ArticleDetail extends Article { sentences: ArticleSentence[]; last_position: number; }
export interface VocabularyItem { id: number; word: Word; source_type: string; source_ref: string | null; note: string; mastery_score: number; created_at: string; }
export interface SentenceBookmark { id: number; sentence_id: number | null; article_id: number | null; article_title: string; text: string; translation: string; source_type: string; source_ref: string | null; note: string; tags: string[]; is_example: boolean; created_at: string; }
export interface DayRecord { date: string; new_count: number; review_count: number; attempts: number; word_count: number; reading_count: number; saved_words: number; saved_sentences: number; books: { name: string; kind: string; id: number | null; word_count: number }[]; words: { id: number; term: string; translation: string; rating: string; mode: string }[]; articles: { id: number; title: string; percent: number; completed: boolean }[]; }
export interface MonthRecords { month: string; timezone: string; today: string; days: DayRecord[]; }
export type AIProviderName = 'deepseek' | 'minimax';
export interface AIConversation { id: number; title: string; provider: AIProviderName; model: string; conversation_type: 'daily' | 'manual'; local_date: string | null; created_at: string; updated_at: string; archived_at: string | null; message_count: number; }
export interface AIResponseAction { id: string; type: 'add_word_to_collection' | 'request_custom_word' | 'save_sentence' | 'import_article' | 'navigate'; label: string; payload: Record<string, unknown>; }
export interface AIMessage { id: number; role: 'user' | 'assistant' | 'tool'; content: string; created_at: string; actions: AIResponseAction[]; }
export interface AIProviderCatalogItem { provider: AIProviderName; display_name: string; base_url: string; default_model: string; models: string[]; }
export interface AIProviderConfig { provider: AIProviderName; display_name: string; base_url: string; model: string; masked_api_key: string; is_enabled: boolean; is_default: boolean; }
