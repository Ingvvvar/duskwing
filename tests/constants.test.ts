import { describe, expect, it } from 'vitest';

import { BIRD_RADIUS_HITBOX, BIRD_X, MAX_FRAME_MS, PIPE_WIDTH } from '../src/game/constants';
import { FLASH_MAX_ALPHA, FLASH_MAX_MS, FLASH_PIPE_GUARD_MS } from '../src/game/mechanics';
import { mulberry32 } from '../src/game/rng';
import { FALSE_MOTION_BAND } from '../src/render/parallax';

/**
 * Числа, которые нельзя менять молча.
 *
 * Сверка идёт с литералом, а не с самой константой. Это не придирка к стилю:
 * тест, который пишет `expect(PIPE_WIDTH).toBe(PIPE_WIDTH)`, проходит при
 * любом значении и закрепляет ровно ничего. Мутационный прогон показал восемь
 * таких мест в наборе — правка константы уезжала вместе с ожиданием теста.
 *
 * Образец взят с замороженного конфига уровня 1 в `levels.test.ts`: там
 * литералы стоят по той же причине.
 *
 * Менять числа здесь можно — но только вместе с осознанным решением, а падение
 * этого теста и есть требование такое решение принять.
 */
describe('замороженные константы мира', () => {
  it('геометрия коллизии', () => {
    // Радиус хитбокса меньше визуального (13): плотное тело птицы выходит за
    // хитбокс не больше чем на 3 px — правило пропорций из `Bird.ts`.
    expect(BIRD_RADIUS_HITBOX).toBe(10.5);
    // Ширина прямоугольника столкновения. Контракт честности из TASK.md:
    // плотным может быть только то, что участвует в коллизии, и ровно на эту
    // ширину. Всё, что шире, обязано читаться мягким.
    expect(PIPE_WIDTH).toBe(64);
    // Позиция птицы по X. От неё считается и коллизия, и мировая координата
    // зон потока (`travelledX + BIRD_X`).
    expect(BIRD_X).toBe(104);
  });

  it('защита от фоновой вкладки', () => {
    // Накопление времени клампится этим числом: вернувшаяся из фона вкладка
    // не должна отыгрывать минуту симуляции одним кадром (TASK.md, раздел 2).
    expect(MAX_FRAME_MS).toBe(250);
  });

  it('числа контракта читаемости: вспышка молнии', () => {
    // TASK.md: вспышка не длиннее 120 мс, не ярче 0.25 и никогда в пределах
    // 400 мс от появления новой трубы в кадре.
    expect(FLASH_MAX_MS).toBe(120);
    expect(FLASH_MAX_ALPHA).toBe(0.25);
    expect(FLASH_PIPE_GUARD_MS).toBe(400);
  });

  it('числа контракта читаемости: запретная полоса ложного движения', () => {
    // TASK.md: ни один слой фона не идёт с параллаксом в этой полосе, кроме
    // земли и полос ветра. `parallax.test.ts` сверяет слои с этой полосой,
    // поэтому саму полосу закрепить больше некому.
    expect(FALSE_MOTION_BAND.min).toBe(0.85);
    expect(FALSE_MOTION_BAND.max).toBe(1.15);
  });
});

/**
 * Вырожденный поток случайности ломает игру молча: все просветы встают в одну
 * точку, а тест на воспроизводимость по сиду при этом остаётся зелёным —
 * константа воспроизводима лучше всего. Мутационный прогон это и показал.
 */
describe('поток случайности не вырожден', () => {
  it('значения не повторяются и покрывают диапазон', () => {
    const random = mulberry32(12345);
    const values = Array.from({ length: 200 }, () => random());

    expect(new Set(values).size).toBeGreaterThan(190);
    expect(Math.min(...values)).toBeLessThan(0.1);
    expect(Math.max(...values)).toBeGreaterThan(0.9);
  });

  it('каждое значение лежит в [0, 1)', () => {
    const random = mulberry32(7);

    for (let draw = 0; draw < 500; draw += 1) {
      const value = random();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('соседние значения различаются', () => {
    const random = mulberry32(99);
    const first = random();

    expect(random()).not.toBe(first);
  });
});
