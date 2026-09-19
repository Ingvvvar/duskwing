/** Контракт читаемости: альфа частиц не выше этого. */
export const PARTICLE_MAX_ALPHA = 0.35;

/** Бюджет производительности из ТЗ: столько частиц в кадре, и не больше. */
export const PARTICLE_BUDGET = 400;

/** Сколько частиц просит телеграф зон потока, если бюджет позволяет. */
export const FLOW_REQUEST = 140;

export interface ParticleCounts {
  /** Погода. */
  readonly drops: number;
  /** Телеграф зон потока. */
  readonly motes: number;
}

/**
 * Делёж бюджета между погодой и телеграфом.
 *
 * Бюджет общий, и первой его берёт погода: она задана темой, а телеграф —
 * служебный слой поверх. Вынесено чистой функцией потому, что сам слой
 * импортирует `pixi.js`: до вытяжки ни потолок альфы, ни бюджет не были
 * закреплены ничем, а с появлением второго населения частиц цена ошибки
 * выросла — теперь их два, и сумма обязана держаться под потолком.
 */
export function particleCounts(weatherCount: number, hasFlow: boolean): ParticleCounts {
  const drops = Math.max(0, Math.min(weatherCount, PARTICLE_BUDGET));
  const motes = hasFlow ? Math.max(0, Math.min(FLOW_REQUEST, PARTICLE_BUDGET - drops)) : 0;

  return { drops, motes };
}
