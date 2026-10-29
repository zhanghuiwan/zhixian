/** Local, deterministic suggestions; selecting one never sends a chat request. */
export type CompanionAction = 'idle' | 'wave' | 'think' | 'read' | 'stretch' | 'sleep' | 'umbrella';
export type CompanionMood = 'auto' | 'calm' | 'cheerful' | 'focused' | 'tired';
export type CompanionWeather = 'unknown' | 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';
export type CompanionDaypart = 'morning' | 'afternoon' | 'evening' | 'night';
export type CompanionMoment = { id: string; action: CompanionAction; text: string };
export type CompanionContext = { mood: CompanionMood; weather: CompanionWeather; daypart: CompanionDaypart };

export function companionContextKey(context: CompanionContext): string {
  return `${context.mood}:${context.weather}:${context.daypart}`;
}
/** Hidden or busy screens retain their exact visible suggestion until active again. */
export function shouldRefreshCompanionContext(context: CompanionContext, presentedKey: string, active: boolean, foreground: boolean): boolean {
  return active && foreground && companionContextKey(context) !== presentedKey;
}


export const companionMoods: readonly CompanionMood[] = ['auto', 'calm', 'cheerful', 'focused', 'tired'];
export function parseCompanionMood(value: unknown): CompanionMood {
  return companionMoods.includes(value as CompanionMood) ? value as CompanionMood : 'auto';
}

/** Uses the phone's local hour, matching the mini-program's scene boundaries. */
export function getCompanionDaypart(date = new Date()): CompanionDaypart {
  const hour = date.getHours();
  if (hour < 6 || hour >= 19) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

type Suggestion = CompanionMoment & { mood?: Exclude<CompanionMood, 'auto'>; weather?: CompanionWeather; daypart?: CompanionDaypart };
const suggestions: readonly Suggestion[] = [
  { id: 'base-word', action: 'think', text: '讲一个容易混淆的英语词组。' },
  { id: 'base-story', action: 'read', text: '写一段简短的英语故事，附上中文。' },
  { id: 'base-chat', action: 'wave', text: '陪我练两句日常英语。' },
  { id: 'base-sentence', action: 'idle', text: '给我一句实用的英语表达。' },
  { id: 'morning-breakfast', daypart: 'morning', action: 'wave', text: '教我用英语点一份早餐。' },
  { id: 'morning-plan', daypart: 'morning', action: 'read', text: '帮我写三句今天的英语计划。' },
  { id: 'morning-greeting', daypart: 'morning', action: 'stretch', text: '教我几个自然的英语早安问候。' },
  { id: 'afternoon-coffee', daypart: 'afternoon', action: 'stretch', text: '教我用英语点一杯咖啡。' },
  { id: 'afternoon-short', daypart: 'afternoon', action: 'read', text: '给我一段一分钟能读完的英文。' },
  { id: 'afternoon-question', daypart: 'afternoon', action: 'think', text: '用一个小问题考考我的英语。' },
  { id: 'evening-day', daypart: 'evening', action: 'think', text: '教我用三句英语回顾今天。' },
  { id: 'evening-dinner', daypart: 'evening', action: 'wave', text: '陪我练一段餐厅英语对话。' },
  { id: 'evening-read', daypart: 'evening', action: 'read', text: '推荐几个适合写英文日记的表达。' },
  { id: 'night-sleep', daypart: 'night', action: 'sleep', text: '教我几种自然的英语晚安说法。' },
  { id: 'night-story', daypart: 'night', action: 'read', text: '讲一个简短温柔的英文睡前故事。' },
  { id: 'night-rest', daypart: 'night', action: 'stretch', text: '用英语怎么说“今天先到这里”？' },
  { id: 'calm-read', mood: 'calm', action: 'read', text: '陪我慢慢读一首简短的英文诗。' },
  { id: 'calm-think', mood: 'calm', action: 'think', text: '教我用英语描述安静的片刻。' },
  { id: 'calm-idle', mood: 'calm', action: 'idle', text: '给我一句平静的英文，解释其中的词。' },
  { id: 'cheerful-wave', mood: 'cheerful', action: 'wave', text: '教我用英语分享一件开心的小事。' },
  { id: 'cheerful-stretch', mood: 'cheerful', action: 'stretch', text: '我们玩一个简单的英语接词游戏吧。' },
  { id: 'cheerful-think', mood: 'cheerful', action: 'think', text: '讲一个能看懂的英语小笑话。' },
  { id: 'focused-read', mood: 'focused', action: 'read', text: '带我精读一个简短的英语句子。' },
  { id: 'focused-think', mood: 'focused', action: 'think', text: '讲清楚一个常见的英语语法难点。' },
  { id: 'focused-idle', mood: 'focused', action: 'idle', text: '出一道英语填空题，先别告诉我答案。' },
  { id: 'tired-sleep', mood: 'tired', action: 'sleep', text: '我有点累，陪我轻松学一句英语。' },
  { id: 'tired-stretch', mood: 'tired', action: 'stretch', text: '教我用英语表达“想休息一下”。' },
  { id: 'tired-read', mood: 'tired', action: 'read', text: '选三个简单的英文词，帮我记一记。' },
  { id: 'clear-stretch', weather: 'clear', action: 'stretch', text: '教我用英语描述晴朗的天气。' },
  { id: 'clear-wave', weather: 'clear', action: 'wave', text: '陪我练一段约朋友散步的英语对话。' },
  { id: 'clear-read', weather: 'clear', action: 'read', text: '写两句关于阳光的英文，附上中文。' },
  { id: 'cloudy-think', weather: 'cloudy', action: 'think', text: 'cloud、cloudy 和 overcast 有什么区别？' },
  { id: 'cloudy-read', weather: 'cloudy', action: 'read', text: '给我几个描述天空的英语词。' },
  { id: 'cloudy-idle', weather: 'cloudy', action: 'idle', text: '教我用英语自然地谈论天气。' },
  { id: 'rain-umbrella', weather: 'rain', action: 'umbrella', text: '教我用英语说“出门记得带伞”。' },
  { id: 'rain-read', weather: 'rain', action: 'read', text: '写一小段关于雨天的英文，附上中文。' },
  { id: 'rain-think', weather: 'rain', action: 'think', text: 'drizzle、rain 和 downpour 有什么区别？' },
  { id: 'snow-read', weather: 'snow', action: 'read', text: '给我几个描述雪景的英语表达。' },
  { id: 'snow-wave', weather: 'snow', action: 'wave', text: '教我用英语邀请朋友一起堆雪人。' },
  { id: 'snow-think', weather: 'snow', action: 'think', text: 'snow 和 snowy 分别怎么用？' },
  { id: 'storm-umbrella', weather: 'storm', action: 'umbrella', text: '教我读懂常见的英文雷雨预警词。' },
  { id: 'storm-read', weather: 'storm', action: 'read', text: '用简单英语解释 thunder 和 lightning。' },
  { id: 'storm-think', weather: 'storm', action: 'think', text: 'storm、thunderstorm 和 shower 有什么区别？' },
];

function randomIndex(length: number, random: () => number): number {
  const value = random();
  return Math.min(length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * length)));
}
export function getCompanionCandidates(context: CompanionContext): readonly CompanionMoment[] {
  return suggestions.filter(item => (!item.mood || item.mood === context.mood)
    && (!item.weather || item.weather === context.weather)
    && (!item.daypart || item.daypart === context.daypart));
}
export function nextCompanionMoment(context: CompanionContext, previous?: CompanionMoment | null, random = Math.random): CompanionMoment {
  const eligible = getCompanionCandidates(context).filter(item => item.action !== previous?.action && item.id !== previous?.id);
  const chosen = eligible[randomIndex(eligible.length, random)];
  return { id: chosen.id, action: chosen.action, text: chosen.text };
}
export function companionDelay(random = Math.random): number {
  return 28_000 + randomIndex(18_001, random);
}
