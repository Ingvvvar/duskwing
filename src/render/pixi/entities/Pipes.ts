import { Container, Graphics, GraphicsContext } from 'pixi.js';

import { GROUND_TOP, PIPE_WIDTH } from '../../../game/constants';
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

  readonly #active = new Map<number, PipeView>();
  readonly #free: PipeView[] = [];

  #context: GraphicsContext;

  constructor(color: string) {
    this.#context = PipePool.#buildContext(color);
  }

  static #buildContext(color: string): GraphicsContext {
    return new GraphicsContext().rect(0, 0, PIPE_WIDTH, 1).fill(color);
  }

  /**
   * Цвет труб задаётся темой (`Theme.accent`), поэтому при смене темы общий
   * контекст пересобирается, а прежний уничтожается. Разделяемый контекст не
   * принадлежит ни одному `Graphics` и сам по себе не умрёт.
   */
  setColor(color: string): void {
    const next = PipePool.#buildContext(color);

    for (const view of [...this.#active.values(), ...this.#free]) {
      view.top.context = next;
      view.bottom.context = next;
    }

    this.#context.destroy();
    this.#context = next;
  }

  destroy(): void {
    this.#context.destroy();
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
