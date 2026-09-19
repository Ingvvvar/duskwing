import { describe, expect, it } from 'vitest';

import {
  FALSE_MOTION_BAND,
  FALSE_MOTION_EXEMPT,
  flowDrift,
  layerScroll,
  PARALLAX,
  weatherDrift,
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

  it('список исключений закрытый и состоит из одной земли', () => {
    // Каждая строка здесь — ослабление контракта читаемости, и появляться
    // она должна осознанно, вместе с записанной причиной в parallax.ts.
    // Телеграф зон потока в исключении больше не нуждается: частицы берут
    // вертикальную скорость от своей мировой координаты каждый кадр.
    expect([...FALSE_MOTION_EXEMPT]).toEqual(['ground']);
  });

  it('частицы потока идут вне запретной полосы', () => {
    expect(PARALLAX.flow).toBe(0.7);
    expect(PARALLAX.flow).toBeLessThan(0.85);
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

  it('снос телеграфа зон идёт вне запретной полосы', () => {
    expect(flowDrift(100)).toBeCloseTo(70, 10);
  });

  it('снос погоды: по виду, и ноль, когда погоды нет', () => {
    expect(weatherDrift(100, 'rain')).toBeCloseTo(80, 10);
    expect(weatherDrift(100, 'snow')).toBeCloseTo(60, 10);
    expect(weatherDrift(100, 'fireflies')).toBeCloseTo(65, 10);
    expect(weatherDrift(100, 'dust')).toBeCloseTo(70, 10);
    expect(weatherDrift(100, 'none')).toBe(0);
  });
});
