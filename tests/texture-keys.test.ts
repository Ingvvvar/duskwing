import { describe, expect, it } from 'vitest';

import { endlessTheme, THEMES } from '../src/game/themes';
import type { Theme } from '../src/game/types';
import { celestialKey, hazeKey, vignetteKey, weatherKey, weatherTint } from '../src/render/textureKeys';

/**
 * Ключ пересборки обязан меняться от поля, от которого зависит слой, и не
 * меняться от чужого. Вторая сторона важнее: лишнее поле в ключе картинку не
 * портит, а молча выключает оптимизацию — и заметить это можно только числом.
 *
 * Проверка идёт по каждому листу темы: поле меняется по одному, всё остальное
 * остаётся как было. Так покрыты и поля, которых в теме ещё нет: новое поле
 * `celestial` обязано попасть в ключ светила, а любое другое — не попасть.
 */

type Node = Record<string, unknown>;

/** Пути ко всем листьям темы. Пустые (`null`) пропускаются: мутировать их нечем. */
function leaves(value: unknown, path: readonly string[] = []): string[][] {
  if (value === null) {
    return [];
  }

  if (typeof value === 'object') {
    return Object.entries(value as Node).flatMap(([key, child]) => leaves(child, [...path, key]));
  }

  return [[...path]];
}

/** Тема с одним изменённым листом. */
function mutated(theme: Theme, path: readonly string[]): Theme {
  const copy = structuredClone(theme) as unknown as Node;
  let node = copy;

  for (const step of path.slice(0, -1)) {
    node = node[step] as Node;
  }

  const last = path[path.length - 1] ?? '';
  const old = node[last];

  node[last] =
    typeof old === 'number' ? old + 1 : typeof old === 'boolean' ? !old : `${String(old)}~`;

  return copy as unknown as Theme;
}

const BASES: readonly Theme[] = [...Object.values(THEMES), endlessTheme(20), endlessTheme(40)];

interface Tally {
  readonly own: number;
  readonly foreign: number;
}

/**
 * Проходит все листья всех базовых тем и возвращает, сколько путей оказалось
 * своими и чужими. Счётчики — контроль самого теста: обход, не нашедший ни
 * одного листа, прошёл бы любые ожидания.
 */
function check(
  key: (theme: Theme) => string,
  own: (path: string, base: Theme) => boolean,
): Tally {
  let ownCount = 0;
  let foreignCount = 0;

  for (const base of BASES) {
    for (const path of leaves(base)) {
      const name = path.join('.');
      const changed = key(mutated(base, path)) !== key(base);

      if (own(name, base)) {
        ownCount += 1;
        expect(changed, `${base.id}: ключ обязан меняться от ${name}`).toBe(true);
      } else {
        foreignCount += 1;
        expect(changed, `${base.id}: ключ не должен меняться от ${name}`).toBe(false);
      }
    }
  }

  return { own: ownCount, foreign: foreignCount };
}

describe('ключи пересборки слоёв', () => {
  it('обход видит все листья темы', () => {
    // Литерал, а не выведенное число: при добавлении поля в тему тест
    // требует осознанно поправить и эту строку.
    expect(leaves(THEMES.void).map((path) => path.join('.'))).toContain('celestial.glow');
    expect(leaves(THEMES.void).map((path) => path.join('.'))).toContain('obstacle.capOverhang');
    expect(leaves(THEMES.dusk).map((path) => path.join('.'))).not.toContain('haze');
    expect(mutated(THEMES.void, ['grade', 'vignette']).grade.vignette).not.toBe(THEMES.void.grade.vignette);
    expect(mutated(THEMES.void, ['grade', 'vignette']).grade.tint).toBe(THEMES.void.grade.tint);
  });

  it('светило: все поля celestial и ничего больше', () => {
    const tally = check(celestialKey, (path) => path.startsWith('celestial.'));

    expect(tally.own).toBe(BASES.length * 5);
    expect(tally.foreign).toBeGreaterThan(BASES.length * 30);
  });

  it('дымка: только цвет, альфа — чужое поле', () => {
    const tally = check(hazeKey, (path) => path === 'haze.color');

    expect(tally.own).toBe(BASES.filter((theme) => theme.haze !== null).length);
    expect(tally.foreign).toBeGreaterThan(BASES.length * 30);
    expect(hazeKey({ ...THEMES.void, haze: { color: '#123456', alpha: 0.02 } })).toBe(
      hazeKey({ ...THEMES.void, haze: { color: '#123456', alpha: 0.2 } }),
    );
    expect(hazeKey({ ...THEMES.void, haze: null })).not.toBe(hazeKey(THEMES.void));
  });

  it('виньетка: только grade.vignette, остальной грейд — чужое', () => {
    const tally = check(vignetteKey, (path) => path === 'grade.vignette');

    expect(tally.own).toBe(BASES.length);
    expect(tally.foreign).toBeGreaterThan(BASES.length * 30);
  });

  it('частицы: погода и оттенок капель; оттенок — дымка, а без неё последний цвет неба', () => {
    const key = (theme: Theme): string => weatherKey(theme, undefined, false);
    const tally = check(
      key,
      (path, base) =>
        path.startsWith('weather.') || path === (base.haze === null ? 'sky.3' : 'haze.color'),
    );

    expect(tally.own).toBe(BASES.length * 4);
    expect(tally.foreign).toBeGreaterThan(BASES.length * 30);
    expect(weatherTint({ ...THEMES.void, haze: { color: '#123456', alpha: 0.1 } })).toBe('#123456');
    expect(weatherTint({ ...THEMES.void, haze: null })).toBe(THEMES.void.sky[3]);
  });

  it('частицы: зоны потока и prefers-reduced-motion входят в ключ', () => {
    const theme = THEMES.canyon;
    const base = weatherKey(theme, { zones: 3, strength: 220 }, false);

    expect(weatherKey(theme, { zones: 3, strength: 220 }, false)).toBe(base);
    expect(weatherKey(theme, { zones: 4, strength: 220 }, false)).not.toBe(base);
    expect(weatherKey(theme, { zones: 3, strength: 340 }, false)).not.toBe(base);
    expect(weatherKey(theme, undefined, false)).not.toBe(base);
    expect(weatherKey(theme, { zones: 3, strength: 220 }, true)).not.toBe(base);
  });
});

/**
 * Ради чего ключи заводились: в бесконечном режиме светило, дымка и частицы
 * между порогами не пересобираются. Пороги — литералы: светило переключается
 * на середине (очко 30 из 60), погода — на 12, 28 и 45.
 */
describe('бесконечный режим: между порогами строить нечего', () => {
  const same = (key: (theme: Theme) => string, from: number, to: number): void => {
    for (let score = from; score <= to; score += 1) {
      expect(key(endlessTheme(score)), `очко ${String(score)}`).toBe(key(endlessTheme(from)));
    }
  };
  const particles = (theme: Theme): string => weatherKey(theme, undefined, false);

  it('светило стоит до середины и после неё', () => {
    same(celestialKey, 0, 29);
    same(celestialKey, 30, 90);
    expect(celestialKey(endlessTheme(30))).not.toBe(celestialKey(endlessTheme(29)));
  });

  it('дымка стоит на всём забеге: меняется только альфа', () => {
    same(hazeKey, 0, 90);
  });

  it('частицы стоят между порогами погоды и меняются на них', () => {
    same(particles, 0, 11);
    same(particles, 12, 27);
    same(particles, 28, 44);
    same(particles, 45, 90);
    expect(particles(endlessTheme(12))).not.toBe(particles(endlessTheme(11)));
    expect(particles(endlessTheme(28))).not.toBe(particles(endlessTheme(27)));
    expect(particles(endlessTheme(45))).not.toBe(particles(endlessTheme(44)));
  });

  it('виньетка честно меняется каждое очко: ключ её не глушит', () => {
    expect(vignetteKey(endlessTheme(14))).not.toBe(vignetteKey(endlessTheme(13)));
  });
});
