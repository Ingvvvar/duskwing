import { describe, expect, it } from 'vitest';

import { LEVEL_1 } from '../src/game/levels';
import type { ProgressStorage } from '../src/game/progress';
import {
  attemptsOf,
  EMPTY_PROGRESS,
  HINT_ATTEMPTS,
  isLevelUnlocked,
  loadProgress,
  recordAttempt,
  recordRun,
  resolveOutcome,
  saveProgress,
  shouldShowHint,
} from '../src/game/progress';

/** Хранилище в памяти: тот же порт, что даст адаптер localStorage в фазе 4. */
function memoryStorage(initial: string | null = null): ProgressStorage {
  let stored = initial;

  return {
    read: () => stored,
    write: (_key, value) => {
      stored = value;
    },
  };
}

describe('прогресс', () => {
  it('пустое хранилище даёт дефолт', () => {
    expect(loadProgress(memoryStorage())).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(memoryStorage(''))).toEqual(EMPTY_PROGRESS);
  });

  it('испорченное содержимое даёт дефолт и не бросает', () => {
    const broken = ['{"bestScores":', 'не json вовсе', '"строка вместо объекта"', 'null'];

    for (const raw of broken) {
      expect(() => loadProgress(memoryStorage(raw))).not.toThrow();
      expect(loadProgress(memoryStorage(raw))).toEqual(EMPTY_PROGRESS);
    }

    // Порча одного поля не обнуляет второе.
    expect(
      loadProgress(memoryStorage('{"bestScores":{"1":"много"},"clearedLevels":[1]}')),
    ).toEqual({ bestScores: {}, clearedLevels: [1], attempts: {} });

    // Бросающее чтение — приватный режим Safari — тоже даёт дефолт.
    const throwing: ProgressStorage = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => undefined,
    };

    expect(loadProgress(throwing)).toEqual(EMPTY_PROGRESS);
  });

  it('рекорд не понижается, пройденный уровень остаётся пройденным', () => {
    const storage = memoryStorage();

    saveProgress(storage, recordRun(loadProgress(storage), LEVEL_1.id, 12, LEVEL_1.target));
    expect(loadProgress(storage).bestScores['1']).toBe(12);

    const afterWeakRun = recordRun(loadProgress(storage), LEVEL_1.id, 4, LEVEL_1.target);

    expect(afterWeakRun.bestScores['1']).toBe(12);
    expect(afterWeakRun.clearedLevels).toEqual([LEVEL_1.id]);
  });

  it('первый уровень открыт всегда, следующий — после прохождения предыдущего', () => {
    expect(isLevelUnlocked(EMPTY_PROGRESS, 1)).toBe(true);
    expect(isLevelUnlocked(EMPTY_PROGRESS, 2)).toBe(false);

    const afterFail = recordRun(EMPTY_PROGRESS, LEVEL_1.id, LEVEL_1.target - 1, LEVEL_1.target);

    expect(afterFail.clearedLevels).toEqual([]);
    expect(isLevelUnlocked(afterFail, 2)).toBe(false);

    const afterClear = recordRun(EMPTY_PROGRESS, LEVEL_1.id, LEVEL_1.target, LEVEL_1.target);

    expect(isLevelUnlocked(afterClear, 2)).toBe(true);
    expect(isLevelUnlocked(afterClear, 3)).toBe(false);
  });
});

describe('попытки и подсказка', () => {
  it('пустое хранилище — ноль попыток и подсказки нет', () => {
    expect(attemptsOf(EMPTY_PROGRESS, LEVEL_1.id)).toBe(0);
    expect(shouldShowHint(EMPTY_PROGRESS, LEVEL_1.id)).toBe(false);
  });

  it('подсказка видна ровно на попытках 1, 2, 3 и больше никогда', () => {
    // Граница off-by-one: счётчик растёт на СТАРТЕ попытки, поэтому первая
    // попытка — это единица, а не ноль, и четвёртая подсказки уже не даёт.
    const seen: boolean[] = [];
    let progress = EMPTY_PROGRESS;

    for (let attempt = 1; attempt <= HINT_ATTEMPTS + 2; attempt += 1) {
      progress = recordAttempt(progress, LEVEL_1.id);
      expect(attemptsOf(progress, LEVEL_1.id)).toBe(attempt);
      seen.push(shouldShowHint(progress, LEVEL_1.id));
    }

    expect(seen).toEqual([true, true, true, false, false]);
  });

  it('на других уровнях подсказки нет никогда', () => {
    const progress = recordAttempt(EMPTY_PROGRESS, 2);

    expect(attemptsOf(progress, 2)).toBe(1);
    expect(shouldShowHint(progress, 2)).toBe(false);
  });

  it('попытки переживают запись и чтение, испорченные не трогают рекорды', () => {
    const storage = memoryStorage();

    saveProgress(storage, recordAttempt(recordRun(EMPTY_PROGRESS, LEVEL_1.id, 7, LEVEL_1.target), LEVEL_1.id));
    expect(attemptsOf(loadProgress(storage), LEVEL_1.id)).toBe(1);

    const broken = memoryStorage('{"bestScores":{"1":7},"clearedLevels":[],"attempts":"мусор"}');

    expect(loadProgress(broken).bestScores['1']).toBe(7);
    expect(attemptsOf(loadProgress(broken), LEVEL_1.id)).toBe(0);
  });
});

describe('исход забега', () => {
  it('цель перекрывает смерть, если они пришлись на один тик', () => {
    expect(resolveOutcome(LEVEL_1.target, LEVEL_1.target, 'over')).toBe('cleared');
    expect(resolveOutcome(LEVEL_1.target - 1, LEVEL_1.target, 'over')).toBe('over');
    expect(resolveOutcome(LEVEL_1.target - 1, LEVEL_1.target, 'play')).toBe('running');
    expect(resolveOutcome(LEVEL_1.target, LEVEL_1.target, 'play')).toBe('cleared');
  });
});
