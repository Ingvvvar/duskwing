import { FLASH_MAX_ALPHA, FLASH_MAX_MS } from '../game/mechanics';
import type { Rng } from '../game/rng';

/** Пауза между вспышками: не чаще и не реже этого. */
export const FLASH_MIN_GAP_MS = 2600;
export const FLASH_MAX_GAP_MS = 7000;

export interface FlashState {
  /** Сколько ещё длится текущая вспышка. */
  readonly remainingMs: number;
  /** Сколько ещё ждать до права на следующую. */
  readonly cooldownMs: number;
}

export interface FlashStep {
  readonly state: FlashState;
  /** Вспышка началась именно на этом шаге. От этого события звучит гром. */
  readonly started: boolean;
  readonly alpha: number;
}

export const INITIAL_FLASH: FlashState = { remainingMs: 0, cooldownMs: FLASH_MIN_GAP_MS };

/**
 * Расписание вспышек молнии — чистым шагом.
 *
 * Вынесено из слоя по той же причине, что раскладка препятствия и смещение
 * полос ветра: сам слой импортирует `pixi.js`, а в прогон тестов рантайм
 * рендера не тащится. До вытяжки расписание не было покрыто ничем.
 *
 * Здесь же соблюдаются два из трёх ограничений контракта читаемости:
 * длительность не больше `FLASH_MAX_MS` и альфа не выше `FLASH_MAX_ALPHA`.
 * Третье — запрет вспышки рядом с появлением трубы — приходит снаружи флагом
 * `allowed`, который считает логика: своего расписания у вспышки нет.
 */
export function flashStep(
  state: FlashState,
  dtMs: number,
  allowed: boolean,
  random: Rng,
): FlashStep {
  if (dtMs <= 0) {
    return { state, started: false, alpha: alphaOf(state) };
  }

  if (state.remainingMs > 0) {
    const next: FlashState = { ...state, remainingMs: state.remainingMs - dtMs };

    return { state: next, started: false, alpha: alphaOf(next) };
  }

  const cooldownMs = state.cooldownMs - dtMs;

  if (cooldownMs > 0 || !allowed) {
    const next: FlashState = { remainingMs: 0, cooldownMs };

    return { state: next, started: false, alpha: 0 };
  }

  const next: FlashState = {
    remainingMs: FLASH_MAX_MS,
    cooldownMs: FLASH_MIN_GAP_MS + random() * (FLASH_MAX_GAP_MS - FLASH_MIN_GAP_MS),
  };

  return { state: next, started: true, alpha: alphaOf(next) };
}

/** Резкий подъём и спад: вспышка гаснет вместе с остатком своего окна. */
function alphaOf(state: FlashState): number {
  return FLASH_MAX_ALPHA * Math.max(0, Math.min(1, state.remainingMs / FLASH_MAX_MS));
}
