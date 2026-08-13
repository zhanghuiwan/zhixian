export interface User {
  id: number;
  email: string;
  nickname: string;
  level: string;
  daily_new_words: number;
  selected_wordbook_id: number | null;
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

