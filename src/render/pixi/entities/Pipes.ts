import { Container, NineSliceSprite, Texture } from 'pixi.js';

import { GROUND_TOP, PIPE_WIDTH } from '../../../game/constants';
import type { Pipe, Theme } from '../../../game/types';
import { createObstacleTexture, type ObstacleTexture } from '../textures';

interface PipeView {
  readonly container: Container;
  readonly top: NineSliceSprite;
  readonly bottom: NineSliceSprite;
}

/**
 * Пул препятствий, сопоставленный с состоянием по `id`.
 *
 * Каждая половина — один `NineSliceSprite`: в его плитку запечены навершие,
 * тело, декор и мягкий контур. Итого на препятствие контейнер плюс две
 * половины, три дисплей-объекта.
 *
 * Девятислайсовая нарезка растягивает только середину, поэтому навершие у
 * кромки просвета не деформируется ни при какой высоте трубы, а геометрия
 * по-прежнему строится один раз: покадрово меняется только `container.x`.
 *
 * Плотная часть плитки — ровно `PIPE_WIDTH` и ровно цвета `accent`, то есть
 * ровно то, что участвует в коллизии. Всё остальное мягкое.
 */
export class PipePool {
  readonly container = new Container({ label: 'pipes' });

  readonly #active = new Map<number, PipeView>();
  readonly #free: PipeView[] = [];

  #top: ObstacleTexture | null = null;
  #bottom: ObstacleTexture | null = null;

  /**
   * Облик задаётся темой, поэтому плитки пересобираются при её смене — там
   * же, где раньше пересобирался разделяемый контекст под `accent`.
   */
  setTheme(theme: Theme): void {
    const top = createObstacleTexture(theme, 'top');
    const bottom = createObstacleTexture(theme, 'bottom');

    for (const view of [...this.#active.values(), ...this.#free]) {
      PipePool.#dress(view, top, bottom);
    }

    this.#top?.texture.destroy(true);
    this.#bottom?.texture.destroy(true);
    this.#top = top;
    this.#bottom = bottom;
  }

  /**
   * @param offsetX сдвиг интерполяции, общий для всех труб: они едут с одной
   * скоростью, поэтому дробный шаг у них тоже один.
   */
  sync(pipes: readonly Pipe[], offsetX: number): void {
    const live = new Set<number>();

    for (const pipe of pipes) {
      live.add(pipe.id);

      const view = this.#active.get(pipe.id) ?? this.#acquire(pipe);

      this.#active.set(pipe.id, view);
      view.container.x = pipe.x + offsetX;
    }

    for (const [id, view] of this.#active) {
      if (!live.has(id)) {
        view.container.visible = false;
        this.#active.delete(id);
        this.#free.push(view);
      }
    }
  }

  destroy(): void {
    this.#top?.texture.destroy(true);
    this.#bottom?.texture.destroy(true);
    this.#top = null;
    this.#bottom = null;
  }

  static #dress(view: PipeView, top: ObstacleTexture, bottom: ObstacleTexture): void {
    view.top.texture = top.texture;
    view.top.bottomHeight = top.capBorder;
    view.top.topHeight = top.tailBorder;

    view.bottom.texture = bottom.texture;
    view.bottom.topHeight = bottom.capBorder;
    view.bottom.bottomHeight = bottom.tailBorder;
  }

  #acquire(pipe: Pipe): PipeView {
    const view = this.#free.pop() ?? this.#create();
    const top = this.#top;
    const bottom = this.#bottom;

    view.container.visible = true;

    if (top === null || bottom === null) {
      return view;
    }

    const gapTop = pipe.gapCenter - pipe.gapHeight / 2;
    const gapBottom = pipe.gapCenter + pipe.gapHeight / 2;
    const floor = (texture: ObstacleTexture): number => texture.capBorder + texture.tailBorder;

    // Спрайт шире коллизии на мягкое поле с каждой стороны, поэтому ставится
    // левее на `pad`. Прямоугольник коллизии при этом не сдвигается.
    view.top.x = -top.pad;
    view.top.y = 0;
    view.top.width = PIPE_WIDTH + top.pad * 2;
    view.top.height = Math.max(floor(top), gapTop);

    view.bottom.x = -bottom.pad;
    view.bottom.y = gapBottom;
    view.bottom.width = PIPE_WIDTH + bottom.pad * 2;
    view.bottom.height = Math.max(floor(bottom), GROUND_TOP - gapBottom);

    return view;
  }

  #create(): PipeView {
    const container = new Container();
    const make = (): NineSliceSprite =>
      new NineSliceSprite({
        texture: Texture.EMPTY,
        // По горизонтали не растягиваем вовсе: ширина равна ширине плитки.
        leftWidth: 0,
        rightWidth: 0,
        topHeight: 0,
        bottomHeight: 0,
      });
    const view: PipeView = { container, top: make(), bottom: make() };

    container.addChild(view.top, view.bottom);
    this.container.addChild(container);

    const top = this.#top;
    const bottom = this.#bottom;

    if (top !== null && bottom !== null) {
      PipePool.#dress(view, top, bottom);
    }

    return view;
  }
}
