import { describe, expect, it } from 'vitest';

import { FALSE_MOTION_BAND, FALSE_MOTION_EXEMPT, PARALLAX } from '../src/render/parallax';

describe('контракт читаемости: параллакс', () => {
  it('ни один слой фона, кроме земли, не идёт со скоростью, близкой к игровой', () => {
    const offenders = Object.entries(PARALLAX)
      .filter(([layer]) => !FALSE_MOTION_EXEMPT.includes(layer))
      .filter(
        ([, value]) => value >= FALSE_MOTION_BAND.min && value <= FALSE_MOTION_BAND.max,
      )
      .map(([layer, value]) => `${layer}=${String(value)}`);

    expect(offenders).toEqual([]);
  });

  it('земля идёт ровно со скоростью игры', () => {
    expect(PARALLAX.ground).toBe(1);
  });

  it('таблица не пуста — иначе проверка зеленеет, ничего не проверив', () => {
    expect(Object.keys(PARALLAX).length).toBeGreaterThan(0);
  });

  it('список исключений закрытый', () => {
    // Каждая строка здесь — ослабление контракта читаемости, и появляться
    // она должна осознанно, вместе с записанной причиной в parallax.ts.
    // Земля обязана идти со скоростью игры; полосы ветра — телеграф механики,
    // они обязаны совпадать с зонами airflow.
    expect([...FALSE_MOTION_EXEMPT].sort()).toEqual(['ground', 'wind']);
  });
});
