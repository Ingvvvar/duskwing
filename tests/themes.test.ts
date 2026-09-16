import { describe, expect, it } from 'vitest';

import { airflowAt, airflowNormalised, airflowPeriod } from '../src/game/mechanics';
import {
  DUSK,
  ENDLESS_FULL_SCORE,
  endlessTheme,
  interpolateTheme,
  mixHex,
  THEMES,
  VOID,
} from '../src/game/themes';

describe('темы', () => {
  it('пять тем, у каждой свой id и четыре стопа неба', () => {
    expect(Object.keys(THEMES)).toHaveLength(5);

    for (const [id, theme] of Object.entries(THEMES)) {
      expect(theme.id).toBe(id);
      expect(theme.sky).toHaveLength(4);
      expect(theme.grade.vignette).toBeGreaterThanOrEqual(0);
      expect(theme.weather.count).toBeLessThanOrEqual(400);
      expect(theme.foreground.blur).toBeLessThanOrEqual(3);
    }
  });
});

describe('смешивание цветов', () => {
  it('на краях возвращает исходные, посередине — середину', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('зажимает выход за 0…1', () => {
    expect(mixHex('#000000', '#FFFFFF', -3)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 7)).toBe('#FFFFFF');
  });
});

describe('интерполяция темы', () => {
  it('на краях совпадает с исходными по палитре', () => {
    expect(interpolateTheme(DUSK, VOID, 0).sky).toEqual(DUSK.sky);
    expect(interpolateTheme(DUSK, VOID, 0).accent).toBe(DUSK.accent);
    expect(interpolateTheme(DUSK, VOID, 1).sky).toEqual(VOID.sky);
    expect(interpolateTheme(DUSK, VOID, 1).accent).toBe(VOID.accent);
  });

  it('грейд движется монотонно', () => {
    const saturation = [0, 0.25, 0.5, 0.75, 1].map(
      (t) => interpolateTheme(DUSK, VOID, t).grade.saturation,
    );
    const vignette = [0, 0.25, 0.5, 0.75, 1].map(
      (t) => interpolateTheme(DUSK, VOID, t).grade.vignette,
    );

    expect(saturation).toEqual([...saturation].sort((a, b) => b - a));
    expect(vignette).toEqual([...vignette].sort((a, b) => a - b));
  });

  it('структурное переключается на середине, а не смешивается', () => {
    // Форма силуэта — не палитра: смешивать её нечем, а пересборка стоит
    // снятия текстуры, и в бесконечном режиме шла бы на каждом очке.
    expect(interpolateTheme(DUSK, VOID, 0.49).ridgeFar.seed).toBe(DUSK.ridgeFar.seed);
    expect(interpolateTheme(DUSK, VOID, 0.5).ridgeFar.seed).toBe(VOID.ridgeFar.seed);
    expect(interpolateTheme(DUSK, VOID, 0.49).celestial.kind).toBe(DUSK.celestial.kind);
    expect(interpolateTheme(DUSK, VOID, 0.5).celestial.kind).toBe(VOID.celestial.kind);
  });

  it('дымка вводится альфой, а не скачком', () => {
    // У dusk дымки нет, у void есть: на подходе она обязана нарастать.
    expect(DUSK.haze).toBeNull();
    expect(interpolateTheme(DUSK, VOID, 0).haze?.alpha ?? 0).toBe(0);
    expect(interpolateTheme(DUSK, VOID, 0.5).haze?.alpha ?? 0).toBeGreaterThan(0);
    expect(interpolateTheme(DUSK, VOID, 1).haze?.alpha).toBeCloseTo(VOID.haze?.alpha ?? 0, 9);
  });
});

describe('бесконечный режим', () => {
  it('погода переключается на порогах', () => {
    expect(endlessTheme(0).weather.kind).toBe('none');
    expect(endlessTheme(11).weather.kind).toBe('none');
    expect(endlessTheme(12).weather.kind).toBe('fireflies');
    expect(endlessTheme(28).weather.kind).toBe('dust');
    expect(endlessTheme(45).weather.kind).toBe('rain');
    expect(endlessTheme(9000).weather.kind).toBe('rain');
  });

  it('палитра доходит до void и дальше не меняется', () => {
    expect(endlessTheme(0).sky).toEqual(DUSK.sky);
    expect(endlessTheme(ENDLESS_FULL_SCORE).sky).toEqual(VOID.sky);
    expect(endlessTheme(ENDLESS_FULL_SCORE * 4).sky).toEqual(VOID.sky);
  });
});

describe('плитка полос ветра', () => {
  /**
   * Полосы рисуются плиткой шириной в один период зон, сдвигаемой на
   * travelledX. Если ширина плитки перестанет быть периодом, полосы уедут
   * из фазы с физикой — и это единственное место, где такое расхождение
   * ловится числом.
   */
  it('ширина плитки равна периоду зон', () => {
    const airflow = { zones: 3, strength: 300 };
    const period = airflowPeriod(airflow);

    for (const x of [0, 17, 123.5, 250, -80]) {
      expect(airflowAt(x + period, airflow)).toBeCloseTo(airflowAt(x, airflow), 9);
    }

    // Половина периода — противоположный знак: одна зона вверх, одна вниз.
    expect(airflowNormalised(period / 4, airflow)).toBeCloseTo(
      -airflowNormalised((period * 3) / 4, airflow),
      9,
    );
  });
});
