import { describe, expect, it } from 'vitest';

import {
  BIRD_RADIUS_HITBOX,
  BIRD_X,
  GROUND_TOP,
  MAX_FALL_SPEED,
  STEP_MS,
  STEP_SECONDS,
} from '../src/game/constants';
import { LEVEL_1, LEVEL_3, LEVEL_4, PLAYABLE } from '../src/game/levels';
import { airflowAt, pipeGapCenterAt } from '../src/game/mechanics';
import { mulberry32 } from '../src/game/rng';
import type { LevelConfig } from '../src/game/types';
import { autopilot, run, started } from './support/simulate';

const EPSILON = 1e-9;

describe('зоны потоков', () => {
  const airflow = { zones: 3, strength: 400 };

  it('периодичны и ограничены силой из конфига', () => {
    const period = (2 * 360) / airflow.zones;
    const samples = Array.from({ length: 240 }, (_, index) => (index * period) / 240);

    for (const x of samples) {
      expect(Math.abs(airflowAt(x, airflow))).toBeLessThanOrEqual(airflow.strength + EPSILON);
      expect(airflowAt(x, airflow)).toBeCloseTo(airflowAt(x + period, airflow), 9);
    }

    // Среднее по периоду нулевое: сколько сносит вниз, столько же и вверх.
    const mean = samples.reduce((sum, x) => sum + airflowAt(x, airflow), 0) / samples.length;

    expect(Math.abs(mean)).toBeLessThan(0.01 * airflow.strength);
  });

  it('нулевое число зон выключает снос', () => {
    expect(airflowAt(123, { zones: 0, strength: 400 })).toBe(0);
  });

  it('птица в нисходящей зоне падает быстрее, чем в восходящей', () => {
    const half = 360 / airflow.zones / 2;
    const down = airflowAt(half, airflow);
    const up = airflowAt(-half, airflow);

    expect(down).toBeGreaterThan(0);
    expect(up).toBeLessThan(0);
  });
});

describe('единственность источника координат зон', () => {
  /**
   * ЭТОТ ТЕСТ НЕЛЬЗЯ УДАЛЯТЬ ПРИ УБОРКЕ.
   *
   * Он выглядит тавтологией — проверяет, что физика применила ровно то, что
   * вернула `airflowAt`. Смысл в другом: он закрепляет **отображение**
   * `мировая координата = state.travelledX + экранная x`.
   *
   * Рендер по этому же отображению двигает частицы потока. Если кто-нибудь
   * заведёт для них вторую формулу — другой период, другой отсчёт, свой
   * аккумулятор расстояния, — телеграф разъедется с физикой.
   * Игрок будет видеть восходящий поток там, где его сносит вниз; игра
   * станет нечестной, а причину такого расхождения по симптомам почти
   * невозможно найти. Этот тест — единственное место, где отображение
   * зафиксировано в исполняемом виде.
   */
  it('физика берёт снос ровно по travelledX + BIRD_X', () => {
    const airflow = LEVEL_4.mechanics.airflow;

    expect(airflow).toBeDefined();
    if (airflow === undefined) {
      return;
    }

    const game = started(LEVEL_4, mulberry32(11));
    const before = game.state;

    run(game, { frames: 1, dtMs: STEP_MS });

    const drift = airflowAt(before.travelledX + BIRD_X, airflow);
    const expected = Math.min(
      before.birdVelocity + (LEVEL_4.gravity + drift) * STEP_SECONDS,
      MAX_FALL_SPEED,
    );

    expect(game.state.birdVelocity).toBeCloseTo(expected, 10);
  });
});

describe('проходимость при сносе', () => {
  /**
   * За один взмах в худшей точке нисходящей зоны птица обязана подняться не
   * меньше, чем на `gapDrift` — максимальный вертикальный шаг между
   * соседними просветами. Это ровно то действие, которое игра требует от
   * игрока между трубами.
   *
   * Сравнения с половиной просвета здесь нет намеренно: подъём за взмах на
   * уровне 1 равен 63.76 px против половины просвета 105, то есть такой
   * критерий не выполняется даже при нулевом сносе и понижением `strength`
   * недостижим. Планка по `gapDrift`, наоборот, выверенным уровнем 1
   * проходится с запасом 3.76 px — она стоит там, где её поставило ТЗ.
   */
  it('один взмах перекрывает вертикальный шаг между просветами', () => {
    const offenders = PLAYABLE.filter((level) => {
      const strength = level.mechanics.airflow?.strength ?? 0;
      const rise = level.flapVelocity ** 2 / (2 * (level.gravity + strength));

      return rise < level.gapDrift;
    }).map((level) => level.name);

    expect(offenders).toEqual([]);
    expect(PLAYABLE).toHaveLength(6);
  });
});

describe('вертикальный ход труб', () => {
  it('центр ходит вокруг базы с амплитудой и периодом из конфига', () => {
    const moving = LEVEL_3.mechanics.movingPipes;

    expect(moving).toBeDefined();
    if (moving === undefined) {
      return;
    }

    // Чистая функция: на четверти периода — максимум отклонения.
    expect(pipeGapCenterAt(200, 0, 0, moving)).toBeCloseTo(200, 9);
    expect(pipeGapCenterAt(200, 0, moving.periodMs / 4, moving)).toBeCloseTo(
      200 + moving.amplitude,
      9,
    );
    expect(pipeGapCenterAt(200, 0, (moving.periodMs * 3) / 4, moving)).toBeCloseTo(
      200 - moving.amplitude,
      9,
    );
    expect(pipeGapCenterAt(200, 0, moving.periodMs, moving)).toBeCloseTo(200, 9);

    // Фаза сдвигает колебание: трубы не ходят синхронной стеной.
    expect(pipeGapCenterAt(200, 0.25, 0, moving)).toBeCloseTo(200 + moving.amplitude, 9);
  });

  it('в игре отклонение не выходит за амплитуду', () => {
    const game = started(LEVEL_3, mulberry32(17));
    const history = run(game, { frames: 3000, control: autopilot });
    const spans = new Map<number, number>();

    for (const state of history) {
      for (const pipe of state.pipes) {
        const offset = Math.abs(pipe.gapCenter - pipe.baseGapCenter);

        expect(offset).toBeLessThanOrEqual(moving().amplitude + EPSILON);
        spans.set(pipe.id, Math.max(spans.get(pipe.id) ?? 0, offset));
      }
    }

    expect(spans.size).toBeGreaterThanOrEqual(3);
    // Труба живёт в кадре дольше периода, значит хотя бы одна обязана
    // показать почти полный размах — иначе колебание не работает.
    expect(Math.max(...spans.values())).toBeGreaterThan(moving().amplitude * 0.8);

    function moving(): { amplitude: number; periodMs: number } {
      return LEVEL_3.mechanics.movingPipes ?? { amplitude: 0, periodMs: 1 };
    }
  });

  it('без механики центр не двигается вовсе', () => {
    const game = started(LEVEL_1, mulberry32(23));

    for (const state of run(game, { frames: 2500, control: autopilot })) {
      for (const pipe of state.pipes) {
        expect(pipe.gapCenter).toBe(pipe.baseGapCenter);
      }
    }
  });
});

describe('удержание колеблющейся трубы в лётной зоне', () => {
  it('крайние точки хода не выходят за потолок и за землю', () => {
    // Синтетический конфиг: разброс шире лётной зоны, поэтому связывает
    // именно удержание, а не полоса ±gapDrift. На уровнях 3 и 5 связывает
    // разброс, и запас на амплитуду там ничего не решает — без этой
    // проверки он остался бы кодом, который никто не проверяет.
    const wide: LevelConfig = {
      ...LEVEL_1,
      pipeGap: 300,
      gapDrift: 200,
      runwayMs: 0,
      mechanics: { movingPipes: { amplitude: 80, periodMs: 1800 } },
    };
    const half = wide.pipeGap / 2;
    const amplitude = wide.mechanics.movingPipes?.amplitude ?? 0;

    // Полоса разброса сама по себе выпустила бы просвет за пределы зоны.
    expect(360 / 2 - wide.gapDrift).toBeLessThan(half + amplitude);

    const history = run(started(wide, mulberry32(41)), { frames: 4000, control: autopilot });
    let seen = 0;

    for (const state of history) {
      for (const pipe of state.pipes) {
        seen += 1;
        expect(pipe.gapCenter - pipe.gapHeight / 2).toBeGreaterThanOrEqual(-EPSILON);
        expect(pipe.gapCenter + pipe.gapHeight / 2).toBeLessThanOrEqual(GROUND_TOP + EPSILON);
      }
    }

    expect(seen).toBeGreaterThan(0);
  });
});

/**
 * Точка вызова `airflowAt` в логике: поток берётся в МИРОВОЙ координате птицы,
 * то есть `travelledX + BIRD_X`, а не в её экранном иксе.
 *
 * Комментарий у `airflowAt` называет такой разъезд почти ненаходимым — и он
 * прав: мутационный прогон показал, что подмена мировой координаты на экранную
 * оставляла весь набор зелёным. Сама функция была покрыта, её вызов — нет.
 *
 * Наблюдение ведётся через ускорение птицы при НУЛЕВОЙ гравитации: тогда
 * единственное, что её разгоняет, — поток. Ожидание считается от ширины зоны,
 * записанной литералом (360 / 3 зоны = 120), а не тем же выражением, что в коде.
 */
describe('точка вызова потока в логике', () => {
  const ZONE_WIDTH = 120;
  const weightless: LevelConfig = {
    ...LEVEL_1,
    gravity: 0,
    // Импульс тоже нулевой: иначе стартовый взмах уносит птицу в потолок, а
    // упор гасит скорость и даёт ложный скачок ускорения.
    flapVelocity: 0,
    // Труб в кадре быть не должно: они бы убили птицу и оборвали наблюдение.
    runwayMs: 1_000_000,
    mechanics: { airflow: { zones: 3, strength: 220 } },
  };

  it('ширина зоны в этом конфиге действительно 120 px', () => {
    expect(360 / (weightless.mechanics.airflow?.zones ?? 0)).toBe(ZONE_WIDTH);
  });

  /** Ускорение по кадрам плюс мировая координата птицы в тот же момент. */
  function accelerations(): { worldX: number; a: number }[] {
    const history = run(started(weightless, mulberry32(4)), { frames: 480 });
    const out: { worldX: number; a: number }[] = [];

    for (let index = 1; index < history.length; index += 1) {
      const before = history[index - 1];
      const after = history[index];

      if (before === undefined || after === undefined) {
        continue;
      }

      out.push({
        worldX: before.travelledX + BIRD_X,
        a: (after.birdVelocity - before.birdVelocity) / STEP_SECONDS,
      });
    }

    return out;
  }

  it('наблюдение чистое: птица не касается ни потолка, ни земли', () => {
    const history = run(started(weightless, mulberry32(4)), { frames: 480 });

    expect(history.every((state) => state.phase === 'play')).toBe(true);
    expect(Math.min(...history.map((state) => state.birdY))).toBeGreaterThan(BIRD_RADIUS_HITBOX + 1);
    expect(Math.max(...history.map((state) => state.birdY))).toBeLessThan(GROUND_TOP - 1);
  });

  it('поток меняет знак по ходу полёта, а не стоит на месте', () => {
    const samples = accelerations();

    expect(Math.min(...samples.map((sample) => sample.a))).toBeLessThan(-100);
    expect(Math.max(...samples.map((sample) => sample.a))).toBeGreaterThan(100);
  });

  it('знак меняется на границах зон, отсчитанных от мировой координаты', () => {
    const samples = accelerations();
    const flips: number[] = [];

    for (let index = 1; index < samples.length; index += 1) {
      const before = samples[index - 1];
      const after = samples[index];

      if (before === undefined || after === undefined) {
        continue;
      }

      if (Math.sign(before.a) !== Math.sign(after.a)) {
        flips.push(after.worldX);
      }
    }

    expect(flips.length).toBeGreaterThanOrEqual(3);

    for (const worldX of flips) {
      const offset = ((worldX % ZONE_WIDTH) + ZONE_WIDTH) % ZONE_WIDTH;

      // Смена знака попадает на тик, а не точно на границу: допуск — путь
      // мира за пару кадров.
      expect(Math.min(offset, ZONE_WIDTH - offset)).toBeLessThan(4);
    }
  });
});
