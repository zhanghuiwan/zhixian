import * as Speech from 'expo-speech';
export async function speakEnglish(text: string, locale: 'en-US' | 'en-GB' = 'en-US') { await Speech.stop(); Speech.speak(text, { language: locale, rate: 0.88, pitch: 1 }); }
