import { PHRASES, phraseOfDay } from './phrases.js';

describe('phraseOfDay', () => {
  it('한국·일본 자정(UTC 15:00)에 바뀌고, 하루 안에서는 같다', () => {
    const morning = phraseOfDay(new Date('2026-11-24T00:00:00+09:00'));
    const night = phraseOfDay(new Date('2026-11-24T23:59:59+09:00'));
    const nextDay = phraseOfDay(new Date('2026-11-25T00:00:00+09:00'));
    expect(night).toBe(morning);
    expect(nextDay).not.toBe(morning);
  });

  it('목록을 한 바퀴 돌면 처음으로 돌아온다', () => {
    const d = new Date('2026-11-24T12:00:00+09:00');
    const later = new Date(d.getTime() + PHRASES.length * 86_400_000);
    expect(phraseOfDay(later)).toBe(phraseOfDay(d));
  });
});
