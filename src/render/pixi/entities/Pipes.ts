import { Container, Graphics, type GraphicsContext } from 'pixi.js';

import { GROUND_TOP } from '../../../game/constants';
import type { Pipe } from '../../../game/types';

interface PipeView {
  readonly container: Container;
  readonly top: Graphics;
  readonly bottom: Graphics;
}

/**
 * Пул дисплей-объектов под трубы, сопоставленный с состоянием по `id`.
 *
 * Геометрия строится один раз: общий `GraphicsContext` с прямоугольником
 * единичной высоты, растянутый `scale.y` под конкретную трубу в момент выдачи
 * из пула. Покадрово меняется только `container.x` — ни одного `clear()` и ни
 * одной перерисовки за кадр.
 *
 * Единичная высота, а не полная, выбрана намеренно: прямоугольник во всю
 * высоту мира вылезал бы за пределы логической сетки в полосы леттербокса и
 * потребовал бы маски на корневом контейнере.
 */
export class PipePool {
  readonly container = new Container({ label: 'pipes' });

  readonly #context: GraphicsContext;
  readonly #active = new Map<number, PipeView>();
  readonly #free: PipeView[] = [];

  constructor(context: GraphicsContext) {
    this.#context = context;
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

  #acquire(pipe: Pipe): PipeView {
    const view = this.#free.pop() ?? this.#create();
    const gapTop = pipe.gapCenter - pipe.gapHeight / 2;
    const gapBottom = pipe.gapCenter + pipe.gapHeight / 2;

    view.top.y = 0;
    view.top.scale.y = Math.max(0, gapTop);
    view.bottom.y = gapBottom;
    view.bottom.scale.y = Math.max(0, GROUND_TOP - gapBottom);
    view.container.visible = true;

    return view;
  }

  #create(): PipeView {
    const container = new Container();
    const top = new Graphics(this.#context);
    const bottom = new Graphics(this.#context);

    container.addChild(top, bottom);
    this.container.addChild(container);

    return { container, top, bottom };
  }
}
