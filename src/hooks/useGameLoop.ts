import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { MAX_FRAME_MS } from '../game/constants';
import { Game } from '../game/Game';
import { ENDLESS, findLevel, LEVEL_1 } from '../game/levels';
import type { RunOutcome } from '../game/progress';
import { recordAttempt, recordRun, resolveOutcome, setMuted, shouldShowHint } from '../game/progress';
import { mulberry32 } from '../game/rng';
import type { Rng } from '../game/rng';
import { DEBUG_THEME, endlessTheme, findTheme, THEMES } from '../game/themes';
import type { GamePhase, LevelConfig, Theme } from '../game/types';
import { PixiRenderer } from '../render/pixi/PixiRenderer';
import { AMBIENCE_DEATH_FADE_MS, AMBIENCE_PAUSED, Sound } from '../audio/sound';
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

/**
 * Отсчёт перед возвратом из паузы.
 *
 * Без него птица падает раньше, чем игрок вернёт палец на экран: мир
 * оживает в тот же кадр, в котором закрылся оверлей. Три секунды — это время
 * донести руку и поймать положение птицы глазами. Ввод на отсчёте
 * игнорируется: тап по кнопке «Продолжить» не должен превратиться во взмах.
 */
const RESUME_COUNTDOWN_MS = 3000;

export interface Session {
  readonly muted: boolean;
  readonly screen: Screen;
  readonly outcome: RunOutcome;
  /** Мир остановлен игроком. */
  readonly paused: boolean;
  /** Секунд до возврата управления: 3, 2, 1 или 0, когда отсчёта нет. */
  readonly countdown: number;
  readonly level: LevelConfig;
  readonly score: number;
  readonly showHint: boolean;
  /** Свойства-функции, не методы: их передают в пропсы, `this` им не нужен. */
  readonly openMenu: () => void;
  readonly openLevels: () => void;
  readonly startLevel: (id: number) => void;
  readonly restart: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly toggleMuted: () => void;
}

/** Длительность кроссфейда тем на экране «уровень пройден» (TASK.md). */
const CROSSFADE_MS = 700;

/**
 * Дев-переключатель `?theme=<id>`: любая тема плюс отладочная. Нужен, чтобы
 * снимать читаемость по пятой теме, не проходя ради этого четыре уровня.
 *
 * Только в деве: в проде `import.meta.env.DEV` схлопывается в `false`, ветка
 * становится мёртвой, и `DEBUG_THEME` выпадает из бандла вместе с ней.
 */
function readThemeOverride(): Theme | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const id = new URLSearchParams(window.location.search).get('theme');

  if (id === null) {
    return null;
  }

  return id === 'debug' ? DEBUG_THEME : findTheme(id);
}

/**
 * Тема уровня. У бесконечного режима она не задана заранее: палитра и грейд
 * перетекают от `dusk` к `void` по счёту.
 */
function themeFor(level: LevelConfig, score: number): Theme {
  // Ветка по данным, а не по id уровня: тему «нет как данных» объявляет сам
  // конфиг, и появись второй такой режим, здесь править нечего.
  return level.themeId === null ? endlessTheme(score) : THEMES[level.themeId];
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
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);

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
  /** Мир остановлен игроком — заморозка идёт тем же путём, что и на «уровне пройден». */
  const pausedRef = useRef(false);
  /** Остаток отсчёта возврата, мс. Пока он больше нуля, мир тоже заморожен. */
  const countdownRef = useRef(0);
  const tapRef = useRef<() => void>(() => undefined);
  const restartRef = useRef<() => void>(() => undefined);
  /** Escape: снаружи эффекта монтирования нужна свежая версия обработчика. */
  const pauseToggleRef = useRef<() => void>(() => undefined);
  const rendererRef = useRef<PixiRenderer | null>(null);
  const soundRef = useRef<Sound | null>(null);

  const { update } = progressApi;
  const muted = progressApi.progress.muted;

  /**
   * Зеркало мьюта в рефе. Класть `muted` в зависимости монтирующего эффекта
   * нельзя: переключение звука пересоздавало бы весь рендер.
   */
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
    soundRef.current?.setMuted(muted);
  }, [muted]);

  const toggleMuted = useCallback((): void => {
    update((previous) => {
      const next = setMuted(previous, !previous.muted);

      soundRef.current?.setMuted(next.muted);

      return next;
    });
  }, [update]);

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
      pausedRef.current = false;
      countdownRef.current = 0;
      setPaused(false);
      setCountdown(0);
      soundRef.current?.setAmbienceLevel(1, 120);
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
      // Клик по карточке — жест, значит контекст можно открыть здесь, и фон
      // начнётся вместе с уровнем, а не с первого взмаха.
      soundRef.current?.warmUp();
      // Скорость прокрутки фона и зоны для частиц потока берутся из конфига
      // уровня — рендер обязан узнать о смене сразу, а не при следующем
      // монтировании.
      rendererRef.current?.setLevel(config);
      const entering = readThemeOverride() ?? themeFor(config, 0);

      rendererRef.current?.setTheme(entering, 0);
      soundRef.current?.setAmbience(entering.ambience, 0);
      soundRef.current?.setAmbienceLevel(1, 120);
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

  /**
   * Пауза доступна только в живой попытке: на «игра окончена» и «уровень
   * пройден» мир уже заморожен своим способом, и вторая заморозка поверх него
   * означала бы два состояния на один экран.
   */
  const pause = useCallback((): void => {
    const game = gameRef.current;

    if (screenRef.current !== 'playing' || frozenRef.current || game === null) {
      return;
    }

    if (game.state.phase === 'over' || pausedRef.current || countdownRef.current > 0) {
      return;
    }

    pausedRef.current = true;
    setPaused(true);
    // Фон приглушается, но не выключается: уровень должен остаться на слуху.
    soundRef.current?.setAmbienceLevel(AMBIENCE_PAUSED, 250);
  }, []);

  const resume = useCallback((): void => {
    if (!pausedRef.current) {
      return;
    }

    pausedRef.current = false;
    countdownRef.current = RESUME_COUNTDOWN_MS;
    setPaused(false);
    setCountdown(Math.ceil(RESUME_COUNTDOWN_MS / 1000));
    // На отсчёте фон остаётся приглушённым и поднимается вместе с миром.
    soundRef.current?.setAmbienceLevel(AMBIENCE_PAUSED, 120);
  }, []);

  const leave = useCallback(
    (next: Screen): void => {
      screenRef.current = next;
      setScreen(next);
      // В меню и на выборе уровня фона нет вовсе.
      soundRef.current?.stopAmbience();
      // Уходя с уровня, ставим мир в спокойное состояние: за меню не должна
      // висеть замершая мёртвая птица.
      const rng = rngRef.current;

      if (rng !== null) {
        gameRef.current = new Game(levelRef.current, rng);
        frozenRef.current = false;
        recordedRef.current = true;
        pausedRef.current = false;
        countdownRef.current = 0;
        setScore(0);
        setPhase('ready');
        setPaused(false);
        setCountdown(0);
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
    pauseToggleRef.current = (): void => {
      // На отсчёте Escape молчит: возврат уже запущен, отменять его нечем.
      if (countdownRef.current > 0) {
        return;
      }

      if (pausedRef.current) {
        resume();
      } else {
        pause();
      }
    };

    tapRef.current = (): void => {
      if (screenRef.current !== 'playing') {
        return;
      }

      // На паузе и на отсчёте ввод игнорируется целиком: отсчёт затем и
      // поставлен, чтобы игрок вернул руку, а не чтобы первый же тап после
      // «Продолжить» ушёл во взмах.
      if (pausedRef.current || countdownRef.current > 0) {
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
      // Первый звук всегда приходит отсюда — то есть из обработчика жеста,
      // где браузер и разрешает создать AudioContext.
      soundRef.current?.play('flap');
    };

    restartRef.current = restart;
  }, [openLevels, pause, restart, resume]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    let cancelled = false;
    let renderer: PixiRenderer | null = null;
    let stopFrames: (() => void) | null = null;
    let detachResize: (() => void) | null = null;
    let detachFlash: (() => void) | null = null;

    const sound = new Sound();

    sound.setMuted(mutedRef.current);
    soundRef.current = sound;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = (): void => {
      rendererRef.current?.setReducedMotion(motion.matches);
    };

    motion.addEventListener('change', applyMotion);

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
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault();
        pauseToggleRef.current();

        return;
      }

      // Автоповтор при зажатом пробеле — это не намерение игрока.
      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      event.preventDefault();
      tapRef.current();
    };

    let lastScore = 0;
    let lastPhase: GamePhase = 'ready';
    let lastCountdown = 0;

    const boot = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      const created = new PixiRenderer(levelRef.current);

      await created.init(canvas, readThemeOverride() ?? themeFor(levelRef.current, 0));

      if (cancelled) {
        // Размонтировались, пока шёл await: на канвас ничего не вешаем.
        created.destroy();

        return;
      }

      renderer = created;
      rendererRef.current = created;
      created.setReducedMotion(motion.matches);
      // Уровень мог быть выбран, пока шёл await init.
      created.setLevel(levelRef.current);
      detachResize = observeSize(canvas, created);
      // Гром идёт от того же события, что и вспышка: у него нет своего
      // расписания, иначе гроза разъедется сама с собой.
      detachFlash = created.onFlash(() => {
        sound.flash();
      });
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('keydown', onKeyDown);

      stopFrames = created.onFrame((dtMs) => {
        const game = gameRef.current;

        if (game === null) {
          return;
        }

        // Отсчёт идёт по тому же dtMs, что и всё остальное, с тем же клампом:
        // вкладка, ушедшая в фон, не должна отыграть его одним кадром.
        if (countdownRef.current > 0) {
          countdownRef.current = Math.max(0, countdownRef.current - Math.min(dtMs, MAX_FRAME_MS));

          const left = Math.ceil(countdownRef.current / 1000);

          if (left !== lastCountdown) {
            lastCountdown = left;
            setCountdown(left);
          }
        }

        // Пауза и отсчёт замораживают мир ровно тем же способом, что и экран
        // «уровень пройден»: нулевой dtMs, отдельного механизма нет.
        const frozen = frozenRef.current || pausedRef.current || countdownRef.current > 0;

        if (!frozen) {
          game.step(dtMs);
        }

        // Заморозка полная: нулевой dtMs останавливает и прокрутку фона, и
        // погоду, которые считаются в рендере, а не в логике.
        created.draw(game.state, frozen ? 0 : dtMs);
        // Порывы каньона, ночные ноты и очередь грома двигаются тем же
        // временем: на паузе фон звучит, но гром ждёт вместе с миром.
        sound.update(game.state, levelRef.current, frozen ? 0 : dtMs);

        const state = game.state;

        if (state.score !== lastScore) {
          lastScore = state.score;
          setScore(state.score);

          sound.play('score');

          // Бесконечный режим: палитра и грейд перетекают по счёту. Смена
          // мгновенная, кроссфейд здесь был бы шагами вместо перетекания.
          if (levelRef.current.id === ENDLESS.id && readThemeOverride() === null) {
            const next = endlessTheme(state.score);

            created.setTheme(next, 0);
            sound.setAmbience(next.ambience, CROSSFADE_MS);
          }
        }

        if (state.phase !== lastPhase) {
          if (state.phase === 'over') {
            deathWindowRef.current = DEATH_INPUT_WINDOW_MS;
            bufferedRef.current = false;
            sound.play('hit');
            sound.setAmbienceLevel(0, AMBIENCE_DEATH_FADE_MS);
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
          sound.play('clear');

          // Переход к теме следующего уровня играется здесь: мир заморожен,
          // и 700 мс кроссфейда никому не мешают.
          const upcoming = findLevel(config.id + 1);

          if (upcoming !== undefined && readThemeOverride() === null) {
            const next = themeFor(upcoming, 0);

            created.setTheme(next, CROSSFADE_MS);
            sound.setAmbience(next.ambience, CROSSFADE_MS);
          }

          sound.setAmbienceLevel(AMBIENCE_PAUSED, 400);
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
      motion.removeEventListener('change', applyMotion);
      sound.destroy();
      soundRef.current = null;
      stopFrames?.();
      detachResize?.();
      detachFlash?.();
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
    muted,
    screen,
    outcome: resolveOutcome(score, level.target, phase),
    paused,
    countdown,
    level,
    score,
    showHint: shouldShowHint(progressApi.progress, level.id),
    openMenu,
    openLevels,
    startLevel,
    restart,
    pause,
    resume,
    toggleMuted,
  };
}
