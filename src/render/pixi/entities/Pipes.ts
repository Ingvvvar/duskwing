import { Container, NineSliceSprite, Texture } from 'pixi.js';

import { PIPE_WIDTH } from '../../../game/constants';
import type { Pipe, Theme } from '../../../game/types';
import { obstacleLayout } from '../../obstacleLayout';
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
 * кромки просвета не деформируется ни при какой высоте трубы.
 *
 * Вертикальная геометрия пересчитывается каждый кадр, а не один раз при
 * выдаче из пула. Это не перестраховка: у движущихся труб `gapCenter` меняет
 * `Game` на каждом тике, и раскладка, поставленная в момент появления трубы
 * за правым краем, к встрече с птицей расходилась с коллизией на 44 px на
 * уровне 3 и на 48 px на уровне 5 — птица умирала о нарисованную пустоту.
 * Формула раскладки живёт в `obstacleLayout` и сверена с `pipeRects` тестом
 * `tests/obstacle-layout.test.ts`.
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
      this.#place(view, pipe);
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

    // Спрайт шире коллизии на мягкое поле с каждой стороны, поэтому ставится
    // левее на `pad`. Прямоугольник коллизии при этом не сдвигается. По
    // горизонтали геометрия зависит только от плитки, поэтому живёт здесь, а
    // не в покадровой раскладке.
    view.top.x = -top.pad;
    view.top.width = PIPE_WIDTH + top.pad * 2;
    view.bottom.x = -bottom.pad;
    view.bottom.width = PIPE_WIDTH + bottom.pad * 2;
  }

  #place(view: PipeView, pipe: Pipe): void {
    const top = this.#top;
    const bottom = this.#bottom;

    if (top === null || bottom === null) {
      return;
    }

    const floor = (texture: ObstacleTexture): number => texture.capBorder + texture.tailBorder;
    const layout = obstacleLayout(pipe.gapCenter, pipe.gapHeight, floor(top), floor(bottom));

    view.top.y = layout.topY;
    view.top.height = layout.topHeight;
    view.bottom.y = layout.bottomY;
    view.bottom.height = layout.bottomHeight;
  }

  #acquire(pipe: Pipe): PipeView {
    const view = this.#free.pop() ?? this.#create();

    view.container.visible = true;
    // Отсутствующая половина не рисуется. Прямоугольник присутствующей при
    // этом тот же самый: коллизия про вид препятствия ничего не знает.
    view.top.visible = pipe.shape !== 'bottom';
    view.bottom.visible = pipe.shape !== 'top';

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
