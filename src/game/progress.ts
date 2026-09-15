/**
 * Рекорды и разблокировки поверх абстрактного хранилища.
 *
 * `localStorage` здесь не упоминается: `src/game/**` про браузер не знает.
 * Адаптер с try/catch вокруг реального хранилища подключается в фазе 4.
 * Разбор того, что пришло из хранилища, — забота этого файла: снаружи может
 * прийти пустота, обрезанная строка или чужой JSON.
 */

import type { GamePhase } from './types';

/** Порт хранилища. Реализация может бросать — здесь это учтено. */
export interface ProgressStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export interface Progress {
  /** Ключ — id уровня строкой: через JSON числовые ключи всё равно станут строками. */
  readonly bestScores: Readonly<Record<string, number>>;
  readonly clearedLevels: readonly number[];
  /** Сколько раз уровень запускали. Нужен подсказке по управлению. */
  readonly attempts: Readonly<Record<string, number>>;
}

export const PROGRESS_KEY = 'duskwing.progress';

export const EMPTY_PROGRESS: Progress = { bestScores: {}, clearedLevels: [], attempts: {} };

/** Уровень, на котором показывается подсказка по управлению. */
const TUTORIAL_LEVEL_ID = 1;

/** Подсказка живёт ровно первые три попытки: это попытки 1, 2 и 3. */
export const HINT_ATTEMPTS = 3;

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === 'number' && Number.isFinite(entry),
  );
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

/**
 * Читает прогресс. Любая неисправность — пустое хранилище, мусор вместо JSON,
 * бросающий `read` — даёт дефолт, а не исключение. Порча одного поля не
 * обнуляет второе.
 */
export function loadProgress(storage: ProgressStorage): Progress {
  let raw: string | null;

  try {
    raw = storage.read(PROGRESS_KEY);
  } catch {
    return EMPTY_PROGRESS;
  }

  if (raw === null || raw === '') {
    return EMPTY_PROGRESS;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return EMPTY_PROGRESS;
  }

  const candidate = parsed as { bestScores?: unknown; clearedLevels?: unknown; attempts?: unknown };

  return {
    bestScores: isNumberRecord(candidate.bestScores) ? candidate.bestScores : {},
    clearedLevels: isNumberArray(candidate.clearedLevels) ? candidate.clearedLevels : [],
    attempts: isNumberRecord(candidate.attempts) ? candidate.attempts : {},
  };
}

export function saveProgress(storage: ProgressStorage, progress: Progress): void {
  try {
    storage.write(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Не сохранился прогресс — не повод ронять игру: приватный режим Safari
    // и переполненная квота бросают именно отсюда.
  }
}

/**
 * Итог забега. Рекорд только растёт: неудачная попытка не затирает удачную.
 * Уровень считается пройденным, когда набрана цель из его конфига.
 */
export function recordRun(progress: Progress, levelId: number, score: number, target: number): Progress {
  const key = String(levelId);
  const best = progress.bestScores[key] ?? 0;
  const cleared =
    score >= target && !progress.clearedLevels.includes(levelId)
      ? [...progress.clearedLevels, levelId]
      : progress.clearedLevels;

  return {
    ...progress,
    bestScores: { ...progress.bestScores, [key]: Math.max(best, score) },
    clearedLevels: cleared,
  };
}

/**
 * Отмечает НАЧАЛО попытки.
 *
 * Счётчик растёт на старте, а не на смерти: иначе первая попытка шла бы с
 * нулём, и «первые три попытки» съехали бы на одну. После первого запуска
 * уровня счётчик равен единице.
 */
export function recordAttempt(progress: Progress, levelId: number): Progress {
  const key = String(levelId);

  return {
    ...progress,
    attempts: { ...progress.attempts, [key]: (progress.attempts[key] ?? 0) + 1 },
  };
}

/** Сколько попыток уровня уже начиналось. Ноль — его ещё не запускали. */
export function attemptsOf(progress: Progress, levelId: number): number {
  return progress.attempts[String(levelId)] ?? 0;
}

/**
 * Показывать ли подсказку по управлению. Видна на попытках 1, 2 и 3 уровня 1
 * и больше никогда — ни на четвёртой, ни на других уровнях.
 */
export function shouldShowHint(progress: Progress, levelId: number): boolean {
  if (levelId !== TUTORIAL_LEVEL_ID) {
    return false;
  }

  const attempts = attemptsOf(progress, levelId);

  return attempts >= 1 && attempts <= HINT_ATTEMPTS;
}

export type RunOutcome = 'running' | 'cleared' | 'over';

/**
 * Итог забега по текущему состоянию.
 *
 * Очко и смерть могут прийтись на один тик: `Game` засчитывает очко в
 * `#advancePipes` до проверки столкновений. Порядок веток ниже — это решение
 * в пользу игрока: «уровень пройден» перекрывает «игру окончена». Переставишь
 * ветки — и последнее очко превратится в проглоченную смерть.
 */
export function resolveOutcome(score: number, target: number, phase: GamePhase): RunOutcome {
  if (score >= target) {
    return 'cleared';
  }

  if (phase === 'over') {
    return 'over';
  }

  return 'running';
}

/** Первый уровень открыт всегда, следующий — когда пройден предыдущий. */
export function isLevelUnlocked(progress: Progress, levelId: number): boolean {
  return levelId <= 1 || progress.clearedLevels.includes(levelId - 1);
}
