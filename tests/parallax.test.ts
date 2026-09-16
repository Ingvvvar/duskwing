import { describe, expect, it } from 'vitest';

import {
  FALSE_MOTION_BAND,
  FALSE_MOTION_EXEMPT,
  layerScroll,
  PARALLAX,
  weatherDrift,
  windTileOffset,
} from '../src/render/parallax';

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

/**
 * Применение таблицы, а не сама таблица.
 *
 * Мутационный прогон показал: таблица закреплена, а её применение в `Scene`
 * нет — слой мог поехать со скоростью мира мимо коэффициента, а земля с
 * передним планом обменяться значениями, и набор оставался зелёным. Числа
 * ниже записаны литералами, иначе тест повторил бы ту же таблицу.
 */
describe('применение параллакса к слоям', () => {
  it('каждый слой едет со своим коэффициентом', () => {
    const offset = layerScroll(1000);

    expect(offset.celestial).toBeCloseTo(30, 10);
    expect(offset.ridgeFar).toBeCloseTo(120, 10);
    expect(offset.ridgeNear).toBeCloseTo(280, 10);
    expect(offset.haze).toBeCloseTo(200, 10);
    expect(offset.ground).toBeCloseTo(1000, 10);
    expect(offset.foreground).toBeCloseTo(1500, 10);
  });

  it('передний план обгоняет землю, а не наоборот', () => {
    const offset = layerScroll(1000);

    expect(offset.foreground).toBeGreaterThan(offset.ground);
    expect(offset.ground).toBeGreaterThan(offset.ridgeNear);
    expect(offset.ridgeNear).toBeGreaterThan(offset.ridgeFar);
    expect(offset.ridgeFar).toBeGreaterThan(offset.celestial);
  });

  it('снос погоды: по виду, и ноль, когда погоды нет', () => {
    expect(weatherDrift(100, 'rain')).toBeCloseTo(80, 10);
    expect(weatherDrift(100, 'snow')).toBeCloseTo(60, 10);
    expect(weatherDrift(100, 'fireflies')).toBeCloseTo(65, 10);
    expect(weatherDrift(100, 'dust')).toBeCloseTo(70, 10);
    expect(weatherDrift(100, 'none')).toBe(0);
  });
});

/**
 * Полосы ветра идут ровно со скоростью мира — это не параллакс, а телеграф
 * механики. Проверяется не значение коэффициента, а его отсутствие: смещение
 * плитки обязано меняться на столько же, на сколько прошёл мир.
 */
describe('смещение полос ветра', () => {
  const PERIOD = 240;

  it('коэффициента нет: мир прошёл 50 — полоса сдвинулась на 50', () => {
    const before = windTileOffset(10, PERIOD);
    const after = windTileOffset(60, PERIOD);

    expect(before - after).toBeCloseTo(50, 10);
  });

  it('заворот ровно по периоду, а не по его части', () => {
    expect(windTileOffset(35 + PERIOD, PERIOD)).toBeCloseTo(windTileOffset(35, PERIOD), 10);
    expect(windTileOffset(35 - PERIOD, PERIOD)).toBeCloseTo(windTileOffset(35, PERIOD), 10);

    // Одного лишь равенства через период мало: заворот по половине периода
    // ему тоже удовлетворяет. Поэтому проверяется, что смещение доходит до
    // дальнего края — прямо перед заворотом оно почти в целый период.
    expect(windTileOffset(PERIOD - 1, PERIOD)).toBeCloseTo(-(PERIOD - 1), 10);
    expect(windTileOffset(PERIOD / 2 + 1, PERIOD)).toBeCloseTo(-(PERIOD / 2 + 1), 10);
  });

  it('смещение всегда в пределах одного периода и не положительно', () => {
    for (const travelled of [-1000, -1, 0, 1, 239, 240, 241, 10_000]) {
      const offset = windTileOffset(travelled, PERIOD);

      expect(offset).toBeLessThanOrEqual(0);
      expect(offset).toBeGreaterThan(-PERIOD);
    }
  });
});
