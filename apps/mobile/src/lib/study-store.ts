import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StudyDraft } from './types';
const PREFIX = 'zhixian:study:v1';
export function studyKey(userId: number, sourceKind: string, sourceId: number | null, mode: string) { return `${PREFIX}:${userId}:${sourceKind}:${sourceId ?? 'all'}:${mode}`; }
export async function loadStudyDraft(key: string) { const value = await AsyncStorage.getItem(key); if (!value) return null; try { const draft = JSON.parse(value) as StudyDraft; return draft.version === 1 ? draft : null; } catch { await AsyncStorage.removeItem(key); return null; } }
export async function saveStudyDraft(key: string, draft: StudyDraft) { await AsyncStorage.setItem(key, JSON.stringify(draft)); }
export async function removeStudyDraft(key: string) { await AsyncStorage.removeItem(key); }
export function createSessionId() { return `mob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
