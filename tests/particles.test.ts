import { describe, expect, it } from 'vitest';

import { PLAYABLE } from '../src/game/levels';
import { THEMES } from '../src/game/themes';
import { FLOW_REQUEST, particleCounts, PARTICLE_BUDGET, PARTICLE_MAX_ALPHA } from '../src/render/particles';

/**
 * Числа контракта читаемости жили внутри слоя, который тянет `pixi.js`, и не
 * были закреплены ничем. С появлением второго населения частиц — телеграфа зон
 * потока — цена ошибки выросла: бюджет теперь делится, и сумма обязана
 * держаться под потолком. Литералы, а не константы модуля.
 */
describe('бюджет частиц', () => {
  it('числа контракта закреплены', () => {
    expect(PARTICLE_MAX_ALPHA).toBe(0.35);
    expect(PARTICLE_BUDGET).toBe(400);
  });

  it('сумма двух населений не выходит за бюджет ни при каком запросе', () => {
    for (const weather of [0, 40, 120, 240, 300, 399, 400, 1000]) {
      for (const hasFlow of [false, true]) {
        const { drops, motes } = particleCounts(weather, hasFlow);

        expect(drops).toBeGreaterThanOrEqual(0);
        expect(motes).toBeGreaterThanOrEqual(0);
        expect(drops + motes).toBeLessThanOrEqual(400);
      }
    }
  });

  it('погода берёт бюджет первой, телеграф — остаток', () => {
    expect(particleCounts(300, true)).toEqual({ drops: 300, motes: 100 });
    expect(particleCounts(400, true)).toEqual({ drops: 400, motes: 0 });
    expect(particleCounts(0, true)).toEqual({ drops: 0, motes: FLOW_REQUEST });
    expect(particleCounts(120, false)).toEqual({ drops: 120, motes: 0 });
  });

  it('на живых уровнях телеграфу остаётся, чем показать зоны', () => {
    for (const level of PLAYABLE) {
      if (level.mechanics.airflow === undefined) {
        continue;
      }

      const theme = Object.values(THEMES).find((t) => t.id === level.themeId);
      const weather = theme?.weather.kind === 'none' ? 0 : (theme?.weather.count ?? 0);
      const { drops, motes } = particleCounts(weather, true);

      expect(motes).toBeGreaterThanOrEqual(100);
      expect(drops + motes).toBeLessThanOrEqual(400);
    }
  });
});
