import { useRef } from 'react';
import type { ReactElement } from 'react';

import { useGameLoop } from './hooks/useGameLoop';
import { useProgress } from './hooks/useProgress';
import { Countdown } from './ui/Countdown';
import { GameOver } from './ui/GameOver';
import { Hud } from './ui/Hud';
import { LevelClear } from './ui/LevelClear';
import { LevelSelect } from './ui/LevelSelect';
import { Menu } from './ui/Menu';
import { MuteButton } from './ui/MuteButton';
import { PauseButton } from './ui/PauseButton';
import { PauseOverlay } from './ui/PauseOverlay';

/**
 * Обёртка `stage` нужна ResizeObserver: за самим канвасом наблюдать нельзя,
 * `autoDensity` пишет в него инлайн-стили.
 *
 * Экран не хранится отдельным состоянием, а выводится из уже имеющихся:
 * так `setState` случается только на смене счёта и фазы, а не на каждом
 * переходе оболочки. Атрибут `data-screen` — единственная точка, по которой
 * измеряется время рестарта; собственной инструментовки в коде нет.
 */
export function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressApi = useProgress();
  const session = useGameLoop(canvasRef, progressApi);

  const best = progressApi.progress.bestScores[String(session.level.id)] ?? 0;
  // Единственная точка, по которой всё меряется снаружи. Пауза и отсчёт —
  // отдельные значения: различать их в замере нужно.
  const view =
    session.screen === 'playing'
      ? session.countdown > 0
        ? 'countdown'
        : session.paused
          ? 'paused'
          : session.outcome
      : session.screen;

  return (
    <div className="stage" data-screen={view}>
      <canvas ref={canvasRef} className="game-canvas" />

      {/* Виден на всех экранах: во время игры переключатель нужнее всего. */}
      <MuteButton muted={session.muted} onToggle={session.toggleMuted} />

      {/* Пауза — только в живой попытке: на смерти и на пройденном уровне мир
          уже заморожен своим способом. */}
      {session.screen === 'playing' && session.outcome === 'running' && !session.paused ? (
        <PauseButton onPause={session.pause} />
      ) : null}

      {session.screen === 'menu' ? <Menu onPlay={session.openLevels} /> : null}

      {session.screen === 'levels' ? (
        <LevelSelect
          progress={progressApi.progress}
          onPick={session.startLevel}
          onBack={session.openMenu}
        />
      ) : null}

      {session.screen === 'playing' ? (
        <>
          {/* Подсказка про взмах молчит под оверлеями: там мир заморожен,
              и тот же тап ведёт не во взмах, а на следующий экран. */}
          <Hud
            score={session.score}
            target={session.level.target}
            showHint={session.showHint && session.outcome === 'running'}
          />

          {session.outcome === 'cleared' ? (
            <LevelClear
              name={session.level.name}
              score={session.score}
              best={best}
              onContinue={session.openLevels}
            />
          ) : null}

          {session.outcome === 'over' ? (
            <GameOver score={session.score} best={best} onRestart={session.restart} />
          ) : null}

          {session.paused ? (
            <PauseOverlay
              name={session.level.name}
              onResume={session.resume}
              onLeave={session.openLevels}
            />
          ) : null}

          {session.countdown > 0 ? <Countdown value={session.countdown} /> : null}
        </>
      ) : null}
    </div>
  );
}
