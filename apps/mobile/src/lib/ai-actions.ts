import type { AIResponseAction } from './types';

export type AIActionPlan =
  | { kind: 'navigate'; destination: 'home' | 'learn' | 'articles' | 'article' | 'wordbooks' | 'study' | 'sentences' | 'vocabulary'; id?: number; term?: string }
  | { kind: 'request'; path: string; body: Record<string, unknown>; successMessage: string; invalidate: string[]; openArticle?: boolean };

function text(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function actionLabel(action: AIResponseAction) {
  return action.type === 'request_custom_word' ? '前往添加单词' : action.label;
}

export function planAIAction(action: AIResponseAction): AIActionPlan {
  const payload = action.payload;
  if (action.type === 'add_word_to_collection') {
    const term = text(payload, 'term');
    const collectionId = positiveInteger(payload, 'collection_id');
    if (!term || !collectionId) throw new Error('这个加词操作缺少单词或词书信息，请重新询问闲闲');
    return { kind: 'request', path: `/library/personal/${collectionId}/words`, body: { terms: [term] }, successMessage: `${term} 已加入词书`, invalidate: ['library', 'vocabulary'] };
  }
  if (action.type === 'save_sentence') {
    const sentence = text(payload, 'text');
    if (!sentence) throw new Error('这个收藏操作缺少句子内容，请重新询问闲闲');
    return { kind: 'request', path: '/sentences', body: { text: sentence, translation: text(payload, 'translation') || '', conversation_id: positiveInteger(payload, 'conversation_id') }, successMessage: '句子已收藏', invalidate: ['sentences'] };
  }
  if (action.type === 'import_article') {
    const content = text(payload, 'content');
    if (!content || content.length < 20) throw new Error('文章内容不完整，暂时无法保存');
    return { kind: 'request', path: '/articles/import-text', body: { content, title: text(payload, 'title') }, successMessage: '文章已保存', invalidate: ['articles'], openArticle: true };
  }
  if (action.type === 'request_custom_word') {
    const term = text(payload, 'term');
    if (!term) throw new Error('这个操作缺少单词内容，请重新询问闲闲');
    return { kind: 'navigate', destination: 'vocabulary', term };
  }
  const path = text(payload, 'path');
  if (!path) throw new Error('这个跳转操作缺少目标页面');
  const article = path.match(/^\/articles\/(\d+)$/);
  if (article) return { kind: 'navigate', destination: 'article', id: Number(article[1]) };
  if (path.includes('learn')) return { kind: 'navigate', destination: 'learn' };
  if (path.includes('articles')) return { kind: 'navigate', destination: 'articles' };
  if (path.includes('wordbooks')) return { kind: 'navigate', destination: 'wordbooks' };
  if (path.includes('sentences')) return { kind: 'navigate', destination: 'sentences' };
  if (path.includes('vocabulary')) return { kind: 'navigate', destination: 'vocabulary' };
  if (path === '/' || path.includes('home')) return { kind: 'navigate', destination: 'home' };
  return { kind: 'navigate', destination: 'study' };
}
