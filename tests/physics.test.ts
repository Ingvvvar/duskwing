import { describe, expect, it } from 'vitest';

import {
  BIRD_RADIUS_HITBOX,
  BIRD_X,
  FLYABLE_CENTER,
  GROUND_TOP,
  MAX_FALL_SPEED,
  PIPE_WIDTH,
  STEP_SECONDS,
} from '../src/game/constants';
import { LEVEL_1 } from '../src/game/levels';
import {
  circleHitsRect,
  hitsGround,
  integrateVertical,
  pipeRects,
  resolveCeiling,
} from '../src/game/physics';
import { mulberry32 } from '../src/game/rng';
import { run, started } from './support/simulate';

describe('интегрирование', () => {
  it('под гравитацией скорость и высота растут', () => {
    const before = { y: 100, velocity: 0 };
    const after = integrateVertical(before, LEVEL_1.gravity, STEP_SECONDS);

    expect(after.velocity).toBeCloseTo(LEVEL_1.gravity * STEP_SECONDS, 10);
    expect(after.y).toBeGreaterThan(before.y);
  });

  it('скорость падения ограничена сверху', () => {
    let vertical = { y: 0, velocity: 0 };

    for (let tick = 0; tick < 1000; tick += 1) {
      vertical = integrateVertical(vertical, LEVEL_1.gravity, STEP_SECONDS);
      expect(vertical.velocity).toBeLessThanOrEqual(MAX_FALL_SPEED);
    }

    expect(vertical.velocity).toBe(MAX_FALL_SPEED);
  });

  it('flap меняет знак вертикальной скорости', () => {
    const game = started(LEVEL_1, mulberry32(1));

    run(game, { frames: 60 });
    expect(game.state.birdVelocity).toBeGreaterThan(0);

    game.flap();
    expect(game.state.birdVelocity).toBe(LEVEL_1.flapVelocity);
    expect(game.state.birdVelocity).toBeLessThan(0);
  });
});

describe('потолок', () => {
  it('упор гасит скорость', () => {
    expect(resolveCeiling({ y: 3, velocity: -430 }, BIRD_RADIUS_HITBOX)).toEqual({
      y: BIRD_RADIUS_HITBOX,
      velocity: 0,
    });
  });

  it('в игре птица упирается в потолок и остаётся живой', () => {
    const game = started(LEVEL_1, mulberry32(7));

    run(game, { frames: 200, control: () => true });

    expect(game.state.phase).toBe('play');
    expect(game.state.birdY).toBe(BIRD_RADIUS_HITBOX);
    expect(game.state.birdVelocity).toBe(0);
    // Разгон ещё не кончился: труб нет, значит смерть исключена по построению.
    expect(game.state.pipes).toHaveLength(0);
  });
});

describe('коллизия с трубой', () => {
  const gapCenter = FLYABLE_CENTER;
  const gapTop = gapCenter - LEVEL_1.pipeGap / 2;
  const gapBottom = gapCenter + LEVEL_1.pipeGap / 2;
  const [top, bottom] = pipeRects(BIRD_X - PIPE_WIDTH / 2, gapCenter, LEVEL_1.pipeGap);

  it('верхняя труба убивает', () => {
    expect(circleHitsRect(BIRD_X, gapTop - 1, BIRD_RADIUS_HITBOX, top)).toBe(true);
    expect(circleHitsRect(BIRD_X, gapTop + 1, BIRD_RADIUS_HITBOX, top)).toBe(true);
  });

  it('нижняя труба убивает', () => {
    expect(circleHitsRect(BIRD_X, gapBottom + 1, BIRD_RADIUS_HITBOX, bottom)).toBe(true);
    expect(circleHitsRect(BIRD_X, gapBottom - 1, BIRD_RADIUS_HITBOX, bottom)).toBe(true);
  });

  it('центр просвета чист', () => {
    expect(circleHitsRect(BIRD_X, gapCenter, BIRD_RADIUS_HITBOX, top)).toBe(false);
    expect(circleHitsRect(BIRD_X, gapCenter, BIRD_RADIUS_HITBOX, bottom)).toBe(false);
  });

  it('касание ровно по касательной не убивает', () => {
    expect(circleHitsRect(BIRD_X, gapTop + BIRD_RADIUS_HITBOX, BIRD_RADIUS_HITBOX, top)).toBe(false);
    expect(circleHitsRect(BIRD_X, gapBottom - BIRD_RADIUS_HITBOX, BIRD_RADIUS_HITBOX, bottom)).toBe(
      false,
    );
  });

  /**
   * Проверка стоит НЕ на границе касания намеренно.
   *
   * На самой касательной `d² < r²` и ошибочное `d² < r` дают один и тот же
   * ответ, поэтому граничный тест такую подмену пропускает — мутационный
   * прогон это и показал. Расходятся они между √r и r: при радиусе 10.5 это
   * полоса от 3.24 до 10.5. Глубина 6 px лежит ровно внутри неё.
   */
  it('заметно внутри касания убивает: радиус сравнивается со своим квадратом', () => {
    const depth = 6;

    expect(depth).toBeGreaterThan(Math.sqrt(BIRD_RADIUS_HITBOX));
    expect(depth).toBeLessThan(BIRD_RADIUS_HITBOX);

    expect(circleHitsRect(BIRD_X, gapTop + depth, BIRD_RADIUS_HITBOX, top)).toBe(true);
    expect(circleHitsRect(BIRD_X, gapBottom - depth, BIRD_RADIUS_HITBOX, bottom)).toBe(true);

    // И симметрично: чуть дальше радиуса по-прежнему не убивает.
    expect(circleHitsRect(BIRD_X, gapTop + BIRD_RADIUS_HITBOX + 0.5, BIRD_RADIUS_HITBOX, top)).toBe(
      false,
    );
  });

  /**
   * Коробки трубы описываются независимо от `pipeRects`: ожидание считается
   * из центра просвета и его высоты вручную, иначе тест повторил бы ту же
   * формулу и закрепил бы ноль.
   */
  it('коробки трубы: от потолка до просвета и от просвета ровно до земли', () => {
    const [t, b] = pipeRects(0, gapCenter, LEVEL_1.pipeGap);

    expect(t.y).toBe(0);
    expect(t.height).toBeCloseTo(gapTop, 10);
    expect(b.y).toBeCloseTo(gapBottom, 10);
    // Нижняя коробка доходит до земли: под трубой нет щели, в которую можно
    // проскочить.
    expect(b.y + b.height).toBeCloseTo(GROUND_TOP, 10);
    // Ширина обеих — ровно ширина коллизии, литералом.
    expect(t.width).toBe(64);
    expect(b.width).toBe(64);
  });
});

describe('земля', () => {
  it('убивает ровно тогда, когда низ птицы дошёл до линии земли', () => {
    // Радиус участвует: считается низ птицы, а не её центр.
    expect(hitsGround(GROUND_TOP - BIRD_RADIUS_HITBOX, BIRD_RADIUS_HITBOX)).toBe(true);
    expect(hitsGround(GROUND_TOP - BIRD_RADIUS_HITBOX - 0.5, BIRD_RADIUS_HITBOX)).toBe(false);
    // Центр на линии земли — птица давно мертва.
    expect(hitsGround(GROUND_TOP, BIRD_RADIUS_HITBOX)).toBe(true);
  });

  it('без радиуса птица провалилась бы в землю на свой радиус', () => {
    // Закрепляет именно то, что радиус не забыт: на этой высоте центр ещё
    // выше земли, а низ птицы уже под ней.
    const y = GROUND_TOP - BIRD_RADIUS_HITBOX / 2;

    expect(y).toBeLessThan(GROUND_TOP);
    expect(hitsGround(y, BIRD_RADIUS_HITBOX)).toBe(true);
  });
});
