import { describe, expect, it } from 'vitest';

import type { Renderer, Theme } from '../src/game/types';
import { PixiRenderer } from '../src/render/pixi/PixiRenderer';

const EMPTY_THEME: Theme = {};
const CANVAS_STUB = {} as HTMLCanvasElement;

describe('каркас', () => {
  it('PixiRenderer удовлетворяет контракту Renderer', () => {
    const renderer: Renderer = new PixiRenderer();

    for (const method of ['init', 'setTheme', 'draw', 'resize', 'destroy'] as const) {
      expect(typeof renderer[method]).toBe('function');
    }
  });

  it('init заглушки резолвится, а не бросает', async () => {
    await expect(new PixiRenderer().init(CANVAS_STUB, EMPTY_THEME)).resolves.toBeUndefined();
  });
});
