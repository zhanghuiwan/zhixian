export interface User {
  id: number;
  email: string;
  nickname: string;
  level: string;
  daily_new_words: number;
  timezone: string;
  selected_wordbook_id: number | null;
  selected_collection_id: number | null;
  created_at: string;
}

export interface Word {
  id: number;
  term: string;
  phonetic: string;
  part_of_speech: string;
  translation: string;
  definitions: { part_of_speech: string; meaning: string }[];
  example: string;
  example_translation: string;
  dictionary_source: "system" | "custom";
}

export interface Wordbook {
  id: number;
  name: string;
  description: string;
  level: string;
  cover_color: string;
  word_count: number;
  learned_count: number;
  mastered_count: number;
  is_selected: boolean;
}

export interface StudyQueueItem {
  word: Word;
  mode: "new" | "review";
  repetitions: number;
  mastery_score: number;
  source_kind: "system" | "personal" | "all" | "legacy";
  source_id: number | null;
  source_name: string;
  intervals: Record<"again" | "hard" | "good" | "easy", string>;
}

export interface Article {
  id: number;
  title: string;
  title_zh: string;
  summary: string;
  level: string;
  topic: string;
  read_minutes: number;
  cover_gradient: string;
  source_type: string;
  is_private: boolean;
  progress: number;
  is_completed: boolean;
}

export interface ArticleSentence {
  id: number;
  position: number;
  text: string;
  translation: string;
  is_bookmarked: boolean;
}

export interface ArticleDetail extends Article {
  sentences: ArticleSentence[];
  last_position: number;
}

export interface VocabularyItem {
  id: number;
  word: Word;
  source_type: string;
  source_ref: string | null;
  note: string;
  mastery_score: number;
  created_at: string;
}

export interface Dashboard {
  due_today: number;
  studied_today: number;
  mastered_words: number;
  vocabulary_count: number;
  streak_days: number;
  current_wordbook: Wordbook | null;
  recent_activity: {
    word: string;
    translation: string;
    rating: string;
    reviewed_at: string;
  }[];
}

export type AIProviderName = "deepseek" | "minimax";

export interface AIProviderCatalogItem {
  provider: AIProviderName;
  display_name: string;
  base_url: string;
  default_model: string;
  models: string[];
  supports_tools: boolean;
  supports_streaming: boolean;
}

export interface AIProviderConfig {
  provider: AIProviderName;
  display_name: string;
  base_url: string;
  model: string;
  masked_api_key: string;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIProviderConnection {
  status: "ok";
  provider: AIProviderName;
  model: string;
  latency_ms: number;
}

export interface AIConversation {
  id: number;
  title: string;
  provider: AIProviderName;
  model: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  message_count: number;
}

export interface AIMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id: string | null;
  tool_calls: Record<string, unknown>[];
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
}

export interface AIToolRun {
  id: number;
  tool_name: string;
  status: "pending_confirmation" | "running" | "succeeded" | "failed" | "cancelled";
  arguments: Record<string, unknown>;
  result: Record<string, unknown> | null;
  result_summary: string;
  requires_confirmation: boolean;
  created_at: string;
}

export interface LibraryBook {
  id: number;
  kind: "system" | "personal";
  name: string;
  description: string;
  level: string;
  cover_color: string;
  word_count: number;
  learned_count: number;
  mastered_count: number;
  due_count: number;
  is_selected: boolean;
  is_default: boolean;
}

export interface LibraryBookDetail {
  book: LibraryBook;
  words: { word: Word; status: "new" | "learning" | "mastered"; mastery_score: number }[];
  total: number;
  offset: number;
}

export interface SentenceCollectionItem {
  id: number;
  sentence_id: number | null;
  article_id: number | null;
  article_title: string;
  text: string;
  translation: string;
  source_type: string;
  source_ref: string | null;
  note: string;
  tags: string[];
  is_example: boolean;
  created_at: string;
}

export interface DayRecord {
  date: string;
  new_count: number;
  review_count: number;
  attempts: number;
  word_count: number;
  reading_count: number;
  saved_words: number;
  saved_sentences: number;
  books: { name: string; kind: string; id: number | null; word_count: number }[];
  words: { id: number; term: string; translation: string; rating: string; mode: string }[];
  articles: { id: number; title: string; percent: number; completed: boolean }[];
}

export interface MonthRecords {
  month: string;
  timezone: string;
  today: string;
  days: DayRecord[];
}
