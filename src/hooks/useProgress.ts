import { useCallback, useState } from 'react';

import type { Progress, ProgressStorage } from '../game/progress';
import { loadProgress, saveProgress } from '../game/progress';

/**
 * Адаптер `localStorage` — то самое место, ради которого в фазе 1 хранилище
 * было сделано портом.
 *
 * Чтение и запись в отдельных `try/catch`: приватный режим Safari бросает на
 * записи, заблокированные куки и `SecurityError` в iframe — на чтении. Игра
 * обязана стартовать в обоих случаях, поэтому оба пути молча дают дефолт.
 */
export const browserStorage: ProgressStorage = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Не сохранился прогресс — не повод ронять игру.
    }
  },
};

export interface ProgressApi {
  readonly progress: Progress;
  /** Свойство-функция, не метод: её деструктурируют, и `this` ей не нужен. */
  readonly update: (mapper: (previous: Progress) => Progress) => void;
}

export function useProgress(storage: ProgressStorage = browserStorage): ProgressApi {
  // Ленивая инициализация: чтение хранилища не должно повторяться на каждый
  // рендер, а испорченное содержимое разбирает loadProgress.
  const [progress, setProgress] = useState<Progress>(() => loadProgress(storage));

  const update = useCallback(
    (mapper: (previous: Progress) => Progress): void => {
      setProgress((previous) => {
        const next = mapper(previous);

        saveProgress(storage, next);

        return next;
      });
    },
    [storage],
  );

  return { progress, update };
}
