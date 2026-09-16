import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { MAX_FRAME_MS } from '../game/constants';
import { Game } from '../game/Game';
import { findLevel, LEVEL_1 } from '../game/levels';
import type { RunOutcome } from '../game/progress';
import { recordAttempt, recordRun, resolveOutcome, shouldShowHint } from '../game/progress';
import { mulberry32 } from '../game/rng';
import type { Rng } from '../game/rng';
import { DEBUG_THEME, DUSK } from '../game/themes';
import type { GamePhase, LevelConfig, Theme } from '../game/types';
import { PixiRenderer } from '../render/pixi/PixiRenderer';
import type { ProgressApi } from './useProgress';

export type Screen = 'menu' | 'levels' | 'playing';

/**
 * Окно проглатывания ввода после смерти.
 *
 * Игрок, тапающий три раза в секунду, иначе рестартует предсмертным тапом и
 * собственного счёта не видит — это читается как самопроизвольный перезапуск.
 * Ввод внутри окна не теряется: он буферизуется и срабатывает в момент, когда
 * окно закрывается. Бюджет ТЗ в 300 мс от смерти до управляемой попытки при
 * этом сохраняется.
 */
const DEATH_INPUT_WINDOW_MS = 200;

export interface Session {
  readonly screen: Screen;
  readonly outcome: RunOutcome;
  readonly level: LevelConfig;
  readonly score: number;
  readonly showHint: boolean;
  /** Свойства-функции, не методы: их передают в пропсы, `this` им не нужен. */
  readonly openMenu: () => void;
  readonly openLevels: () => void;
  readonly startLevel: (id: number) => void;
  readonly restart: () => void;
}

/**
 * Отладочная тема доступна только в деве. В проде `import.meta.env.DEV`
 * схлопывается в `false`, ветка становится мёртвой, и `DEBUG_THEME` выпадает
 * из бандла вместе с ней.
 */
function readTheme(): Theme {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('theme') === 'debug') {
    return DEBUG_THEME;
  }

  return DUSK;
}

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

export function useGameLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  progressApi: ProgressApi,
): Session {
  const [screen, setScreen] = useState<Screen>('menu');
  const [level, setLevel] = useState<LevelConfig>(LEVEL_1);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('ready');

  const chainRef = useRef<Promise<void> | null>(null);
  const gameRef = useRef<Game | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const levelRef = useRef<LevelConfig>(LEVEL_1);
  const screenRef = useRef<Screen>('menu');
  /** Цель набрана: мир заморожен до ухода с экрана «уровень пройден». */
  const frozenRef = useRef(false);
  /** Итог попытки уже записан в прогресс — второй раз не писать. */
  const recordedRef = useRef(false);
  /** Сколько ещё миллисекунд после смерти ввод проглатывается. */
  const deathWindowRef = useRef(0);
  /** Во время окна был ввод: сработает, когда окно закроется. */
  const bufferedRef = useRef(false);
  const tapRef = useRef<() => void>(() => undefined);
  const restartRef = useRef<() => void>(() => undefined);
  const rendererRef = useRef<PixiRenderer | null>(null);

  const { update } = progressApi;

  const beginAttempt = useCallback(
    (config: LevelConfig): void => {
      const rng = rngRef.current;

      if (rng === null) {
        return;
      }

      // Один поток rng на сессию: каждая попытка получает свою раскладку, но
      // вся сессия воспроизводится от одного числа в ?seed=.
      gameRef.current = new Game(config, rng);
      frozenRef.current = false;
      recordedRef.current = false;
      setScore(0);
      setPhase('ready');
      update((previous) => recordAttempt(previous, config.id));
    },
    [update],
  );

  const startLevel = useCallback(
    (id: number): void => {
      const config = findLevel(id);

      if (config === undefined) {
        return;
      }

      levelRef.current = config;
      // Скорость прокрутки фона берётся из конфига уровня — рендер обязан
      // узнать о смене сразу, а не при следующем монтировании.
      rendererRef.current?.setLevel(config);
      screenRef.current = 'playing';
      setLevel(config);
      setScreen('playing');
      beginAttempt(config);
    },
    [beginAttempt],
  );

  /**
   * Рестарт после смерти. Новая попытка сразу стартует взмахом: иначе одного
   * нажатия хватает лишь на возврат в `ready`, и до полёта нужно два — а ТЗ
   * требует управляемую попытку меньше чем за 300 мс от смерти.
   *
   * Заход на уровень из меню взмаха не делает: там игрок сам выбирает момент.
   */
  const restart = useCallback((): void => {
    deathWindowRef.current = 0;
    bufferedRef.current = false;
    beginAttempt(levelRef.current);
    gameRef.current?.flap();
  }, [beginAttempt]);

  const leave = useCallback(
    (next: Screen): void => {
      screenRef.current = next;
      setScreen(next);
      // Уходя с уровня, ставим мир в спокойное состояние: за меню не должна
      // висеть замершая мёртвая птица.
      const rng = rngRef.current;

      if (rng !== null) {
        gameRef.current = new Game(levelRef.current, rng);
        frozenRef.current = false;
        recordedRef.current = true;
        setScore(0);
        setPhase('ready');
      }
    },
    [],
  );

  const openMenu = useCallback((): void => {
    leave('menu');
  }, [leave]);

  const openLevels = useCallback((): void => {
    leave('levels');
  }, [leave]);

  // Ввод маршрутизируется по экрану. Меню и выбор уровня обрабатывают клики
  // своими кнопками, канвас там молчит.
  //
  // Обработчик кладётся в реф после рендера, а не во время: слушатели висят
  // всю жизнь эффекта, им нужна свежая версия, но запись в реф во время
  // рендера ломает конкурентный рендеринг (react-hooks/refs).
  useEffect(() => {
    tapRef.current = (): void => {
      if (screenRef.current !== 'playing') {
        return;
      }

      if (frozenRef.current) {
        openLevels();

        return;
      }

      const game = gameRef.current;

      if (game === null) {
        return;
      }

      if (game.state.phase === 'over') {
        if (deathWindowRef.current > 0) {
          // Окно ещё открыто: ввод не теряем, а откладываем до его конца.
          bufferedRef.current = true;

          return;
        }

        restart();

        return;
      }

      game.flap();
    };

    restartRef.current = restart;
  }, [openLevels, restart]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    let cancelled = false;
    let renderer: PixiRenderer | null = null;
    let stopFrames: (() => void) | null = null;
    let detachResize: (() => void) | null = null;

    const seed = readSeed();

    rngRef.current = mulberry32(seed);
    gameRef.current = new Game(levelRef.current, rngRef.current);

    if (import.meta.env.DEV) {
      console.info(`[duskwing] seed=${seed}`);
    }

    const onPointerDown = (event: PointerEvent): void => {
      event.preventDefault();
      tapRef.current();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      // Автоповтор при зажатом пробеле — это не намерение игрока.
      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      event.preventDefault();
      tapRef.current();
    };

    let lastScore = 0;
    let lastPhase: GamePhase = 'ready';

    const boot = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      const created = new PixiRenderer(levelRef.current);

      await created.init(canvas, readTheme());

      if (cancelled) {
        // Размонтировались, пока шёл await: на канвас ничего не вешаем.
        created.destroy();

        return;
      }

      renderer = created;
      rendererRef.current = created;
      // Уровень мог быть выбран, пока шёл await init.
      created.setLevel(levelRef.current);
      detachResize = observeSize(canvas, created);
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('keydown', onKeyDown);

      stopFrames = created.onFrame((dtMs) => {
        const game = gameRef.current;

        if (game === null) {
          return;
        }

        const frozen = frozenRef.current;

        if (!frozen) {
          game.step(dtMs);
        }

        // Заморозка полная: нулевой dtMs останавливает и прокрутку фона, и
        // погоду, которые считаются в рендере, а не в логике.
        created.draw(game.state, frozen ? 0 : dtMs);

        const state = game.state;

        if (state.score !== lastScore) {
          lastScore = state.score;
          setScore(state.score);
        }

        if (state.phase !== lastPhase) {
          if (state.phase === 'over') {
            deathWindowRef.current = DEATH_INPUT_WINDOW_MS;
            bufferedRef.current = false;
          }

          lastPhase = state.phase;
          setPhase(state.phase);
        }

        if (deathWindowRef.current > 0 && state.phase === 'over') {
          deathWindowRef.current -= Math.min(dtMs, MAX_FRAME_MS);

          if (deathWindowRef.current <= 0 && bufferedRef.current) {
            bufferedRef.current = false;
            restartRef.current();
          }
        }

        const config = levelRef.current;
        const reachedTarget = state.score >= config.target;

        if (!frozen && reachedTarget) {
          // Геймплей на экране «уровень пройден» не идёт (TASK.md, раздел 4).
          frozenRef.current = true;
        }

        if (!recordedRef.current && (reachedTarget || state.phase === 'over')) {
          recordedRef.current = true;
          update((previous) => recordRun(previous, config.id, state.score, config.target));
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
      detachResize?.();
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);

      rendererRef.current = null;

      chainRef.current = (chainRef.current ?? Promise.resolve()).then(() => {
        renderer?.destroy();
        renderer = null;
      });
    };
  }, [canvasRef, update]);

  return {
    screen,
    outcome: resolveOutcome(score, level.target, phase),
    level,
    score,
    showHint: shouldShowHint(progressApi.progress, level.id),
    openMenu,
    openLevels,
    startLevel,
    restart,
  };
}
