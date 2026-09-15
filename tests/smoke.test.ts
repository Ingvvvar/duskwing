import { describe, expect, it } from 'vitest';

import { BIRD_START_Y, GROUND_TOP, WORLD_HEIGHT } from '../src/game/constants';
import { Game } from '../src/game/Game';
import { LEVEL_1 } from '../src/game/levels';
import { mulberry32 } from '../src/game/rng';

/**
 * Каркас жив: ядро собирается и отдаёт осмысленное начальное состояние.
 *
 * Рендер сюда не импортируется намеренно. По ТЗ vitest покрывает только чистую
 * логику: тест на то, что `PixiRenderer` удовлетворяет контракту `Renderer`,
 * дала бы связка `implements Renderer` плюс `npm run typecheck`, а импорт
 * `pixi.js` в node-окружение утащил бы в прогон весь рантайм рендера.
 */
describe('каркас', () => {
  it('новая игра начинается в ready, в центре лётной зоны и без труб', () => {
    const state = new Game(LEVEL_1, mulberry32(1)).state;

    expect(state.phase).toBe('ready');
    expect(state.birdY).toBe(BIRD_START_Y);
    expect(state.prevBirdY).toBe(BIRD_START_Y);
    expect(state.birdVelocity).toBe(0);
    expect(state.score).toBe(0);
    expect(state.alpha).toBe(0);
    expect(state.pipes).toEqual([]);
  });

  it('мир и земля согласованы между собой', () => {
    expect(GROUND_TOP).toBeLessThan(WORLD_HEIGHT);
    expect(BIRD_START_Y).toBeGreaterThan(0);
    expect(BIRD_START_Y).toBeLessThan(GROUND_TOP);
  });
});
