import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { Game } from '../game/Game';
import { LEVEL_1 } from '../game/levels';
import { mulberry32 } from '../game/rng';
import type { Theme } from '../game/types';
import { PixiRenderer } from '../render/pixi/PixiRenderer';

/** Тем ещё нет: они приезжают в фазе 3. */
const PHASE_TWO_THEME: Theme = {};

/**
 * Сид раскладки. `?seed=` имеет приоритет: без него баг, найденный на
 * конкретной раскладке, невоспроизводим. `Date.now()` здесь законен —
 * запрет на часы действует в `src/game/**`, а не в оболочке.
 */
function readSeed(): number {
  const fromQuery = new URLSearchParams(window.location.search).get('seed');
  const parsed = fromQuery === null ? Number.NaN : Number.parseInt(fromQuery, 10);

  return Number.isFinite(parsed) ? parsed >>> 0 : Date.now() >>> 0;
}

/** Временный ввод фазы 2. В фазе 4 переедет в UI. */
function attachInput(canvas: HTMLCanvasElement, tap: () => void): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    tap();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Автоповтор при зажатом пробеле — это не намерение игрока.
    if (event.code !== 'Space' || event.repeat) {
      return;
    }

    event.preventDefault();
    tap();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Наблюдаем за родителем канваса, а не за самим канвасом: `autoDensity`
 * пишет размеры инлайн-стилем прямо в канвас, и наблюдение за ним самим
 * рискует зациклиться.
 */
function observeSize(canvas: HTMLCanvasElement, renderer: PixiRenderer): () => void {
  const target = canvas.parentElement ?? canvas;

  const apply = (): void => {
    const box = target.getBoundingClientRect();
    renderer.resize(box.width, box.height);
  };

  const observer = new ResizeObserver(apply);

  observer.observe(target);
  apply();

  return () => {
    observer.disconnect();
  };
}

/**
 * Поднимает рендер, крутит цикл и отдаёт счёт. Возвращаемое число меняется
 * только когда меняется счёт: `setState` внутри игрового цикла запрещён.
 */
export function useGameLoop(canvasRef: RefObject<HTMLCanvasElement | null>): number {
  const [score, setScore] = useState(0);
  const chainRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    let cancelled = false;
    let renderer: PixiRenderer | null = null;
    let stopFrames: (() => void) | null = null;
    let detachInput: (() => void) | null = null;
    let detachResize: (() => void) | null = null;

    const seed = readSeed();
    const rng = mulberry32(seed);

    if (import.meta.env.DEV) {
      console.info(`[duskwing] seed=${seed}`);
    }

    // Один поток rng на сессию: каждая попытка получает свою раскладку, но
    // вся сессия воспроизводится от одного числа в ?seed=.
    let game = new Game(LEVEL_1, rng);
    let lastScore = 0;

    const tap = (): void => {
      if (game.state.phase === 'over') {
        game = new Game(LEVEL_1, rng);
      } else {
        game.flap();
      }
    };

    const boot = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      const created = new PixiRenderer(LEVEL_1);

      await created.init(canvas, PHASE_TWO_THEME);

      if (cancelled) {
        // Размонтировались, пока шёл await: на канвас ничего не вешаем.
        created.destroy();
        return;
      }

      renderer = created;
      detachResize = observeSize(canvas, created);
      detachInput = attachInput(canvas, tap);
      stopFrames = created.onFrame((dtMs) => {
        game.step(dtMs);
        created.draw(game.state, dtMs);

        if (game.state.score !== lastScore) {
          lastScore = game.state.score;
          setScore(lastScore);
        }
      });
    };

    // Монтирования выстраиваются в цепочку промисов, а не отсекаются одним
    // флагом `cancelled`. Причина: StrictMode запускает второй эффект, не
    // дожидаясь, пока `await init()` первого завершится, а WebGL-контекст у
    // канваса один на всех. С одним лишь флагом два init гонятся за этот
    // контекст, и уничтожение первого приложения отбирает контекст у уже
    // поднявшегося второго. Цепочка гарантирует, что следующий монтаж
    // начинается только после того, как предыдущий доубрался.
    // Не упрощать обратно во флаг.
    const previous = chainRef.current ?? Promise.resolve();

    chainRef.current = previous.then(boot).catch((error: unknown) => {
      console.error('[duskwing] рендер не поднялся', error);
    });

    return () => {
      cancelled = true;
      stopFrames?.();
      detachInput?.();
      detachResize?.();

      chainRef.current = (chainRef.current ?? Promise.resolve()).then(() => {
        renderer?.destroy();
        renderer = null;
      });
    };
  }, [canvasRef]);

  return score;
}
