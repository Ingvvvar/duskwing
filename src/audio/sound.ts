/**
 * Звук на осцилляторах WebAudio. Ни одного бинарного файла — как и текстуры,
 * всё синтезируется на месте.
 *
 * `src/game/**` про этот модуль не знает: логика по-прежнему ничего не издаёт,
 * звуки запускает оболочка по тем же переходам состояния, по которым уже
 * обновляет счёт и фазу.
 */

import { mulberry32 } from '../game/rng';
import type { GameState, LevelConfig, Theme } from '../game/types';
import { Ambience } from './ambience';
import { ThunderQueue } from './thunder';

export type SoundName = 'flap' | 'score' | 'hit' | 'clear';

/**
 * Фон заметно тише эффектов, и на информативных эффектах он приседает.
 *
 * Приседают не все: взмах идёт по несколько раз в секунду, и фон дёргался бы
 * непрерывно. Приседают очко и прохождение уровня — это информация, которую
 * нельзя утопить в дожде, — и удар, где фон и так уходит в тишину.
 */
const DUCKING: Readonly<Record<SoundName, boolean>> = {
  flap: false,
  score: true,
  clear: true,
  hit: true,
};

const DUCK_DEPTH = 0.3;
const DUCK_ATTACK_S = 0.04;
const DUCK_RELEASE_S = 0.26;

/** Насколько фон приглушается на паузе и на отсчёте. Не выключается. */
export const AMBIENCE_PAUSED = 0.35;
/** За сколько фон затухает вместе с замиранием мира на смерти. */
export const AMBIENCE_DEATH_FADE_MS = 600;

const THUNDER_SEED = 20260923;

interface Voice {
  readonly type: OscillatorType;
  readonly from: number;
  readonly to: number;
  readonly durationMs: number;
  readonly gain: number;
  readonly delayMs?: number;
}

const VOICES: Readonly<Record<SoundName, readonly Voice[]>> = {
  flap: [{ type: 'triangle', from: 190, to: 120, durationMs: 60, gain: 0.22 }],
  score: [
    { type: 'sine', from: 660, to: 660, durationMs: 70, gain: 0.18 },
    { type: 'sine', from: 880, to: 880, durationMs: 90, gain: 0.18, delayMs: 55 },
  ],
  hit: [{ type: 'sawtooth', from: 220, to: 55, durationMs: 260, gain: 0.26 }],
  clear: [
    { type: 'sine', from: 523, to: 523, durationMs: 130, gain: 0.18 },
    { type: 'sine', from: 659, to: 659, durationMs: 130, gain: 0.18, delayMs: 110 },
    { type: 'sine', from: 784, to: 784, durationMs: 240, gain: 0.2, delayMs: 220 },
  ],
};

interface Channel {
  readonly context: AudioContext;
  /** Мьют глушит здесь — один переключатель на обе шины. */
  readonly master: GainNode;
  readonly sfx: GainNode;
  /** Состояние фона: игра, пауза, смерть. */
  readonly state: GainNode;
  /** Приседание под информативные эффекты. */
  readonly duck: GainNode;
  readonly ambience: Ambience;
  readonly thunder: ThunderQueue;
}

export class Sound {
  #channel: Channel | null = null;
  #muted = false;

  setMuted(muted: boolean): void {
    this.#muted = muted;

    if (this.#channel !== null) {
      this.#channel.master.gain.value = muted ? 0 : 1;
    }
  }

  /**
   * Играет звук, создавая `AudioContext` при первом обращении.
   *
   * Контекст не создаётся ни при загрузке, ни при монтировании: браузеры
   * запускают его только внутри обработчика жеста, а созданный раньше висит
   * в `suspended` и молчит. Первый звук — это всегда взмах, то есть жест.
   */
  play(name: SoundName): void {
    if (this.#muted) {
      return;
    }

    const channel = this.#open();

    if (channel === null) {
      return;
    }

    for (const voice of VOICES[name]) {
      this.#voice(channel, voice);
    }

    if (DUCKING[name]) {
      Sound.#duck(channel);
    }
  }

  /**
   * Открыть контекст заранее, внутри жеста.
   *
   * Клик по карточке уровня — такой же жест, как тап по канвасу, и он
   * случается раньше первого взмаха. Благодаря этому фон начинается вместе с
   * уровнем, а не с первого тапа. Раньше жеста по-прежнему не создаётся ничего.
   */
  warmUp(): void {
    this.#open();
  }

  /** Сменить фон уровня. Длительность та же, что у кроссфейда картинки. */
  setAmbience(ambience: Theme['ambience'], fadeMs: number): void {
    this.#open()?.ambience.set(ambience, fadeMs);
  }

  /** Фон замолкает: уход в меню или выбор уровня. */
  stopAmbience(fadeMs = 200): void {
    this.#channel?.ambience.stop(fadeMs);
  }

  /** Громкость фона по состоянию игры: 1 — игра, меньше — пауза, 0 — смерть. */
  setAmbienceLevel(level: number, fadeMs: number): void {
    const channel = this.#channel;

    if (channel === null) {
      return;
    }

    const now = channel.context.currentTime;

    channel.state.gain.cancelScheduledValues(now);
    channel.state.gain.setValueAtTime(Math.max(0.0001, channel.state.gain.value), now);
    channel.state.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, level),
      now + Math.max(0.001, fadeMs / 1000),
    );
  }

  /** Вспышка молнии: гром ставится в очередь, а не звучит сразу. */
  flash(): void {
    this.#channel?.thunder.onFlash();
  }

  /**
   * Покадровое: порывы каньона, ночные ноты и очередь грома. Двигается тем же
   * `dtMs`, что и мир, — на паузе фон живёт, но гром ждёт.
   */
  update(state: GameState, config: LevelConfig, dtMs: number): void {
    const channel = this.#channel;

    if (channel === null) {
      return;
    }

    channel.ambience.update(state, config, dtMs);

    for (let i = channel.thunder.advance(dtMs); i > 0; i -= 1) {
      channel.ambience.thunder();
    }
  }

  destroy(): void {
    const channel = this.#channel;

    this.#channel = null;

    if (channel !== null) {
      channel.ambience.destroy();
      void channel.context.close();
    }
  }

  /** Приседание: быстро вниз, медленно обратно. */
  static #duck(channel: Channel): void {
    const now = channel.context.currentTime;
    const { gain } = channel.duck;

    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.exponentialRampToValueAtTime(DUCK_DEPTH, now + DUCK_ATTACK_S);
    gain.setTargetAtTime(1, now + DUCK_ATTACK_S, DUCK_RELEASE_S);
  }

  #open(): Channel | null {
    if (this.#channel !== null) {
      // Вкладка могла уйти в фон и усыпить контекст.
      if (this.#channel.context.state === 'suspended') {
        void this.#channel.context.resume();
      }

      return this.#channel;
    }

    try {
      const context = new AudioContext();
      const master = context.createGain();
      const sfx = context.createGain();
      const state = context.createGain();
      const duck = context.createGain();

      master.gain.value = this.#muted ? 0 : 1;
      master.connect(context.destination);
      // Эффекты идут мимо приседания, фон — через него: приседает только фон.
      sfx.connect(master);
      state.connect(master);
      duck.connect(state);

      this.#channel = {
        context,
        master,
        sfx,
        state,
        duck,
        ambience: new Ambience(context, duck),
        thunder: new ThunderQueue(mulberry32(THUNDER_SEED)),
      };

      return this.#channel;
    } catch {
      // Звук — не повод ронять игру: без него она полностью играбельна.
      return null;
    }
  }

  #voice(channel: Channel, voice: Voice): void {
    const { context, sfx } = channel;
    const start = context.currentTime + (voice.delayMs ?? 0) / 1000;
    const end = start + voice.durationMs / 1000;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = voice.type;
    oscillator.frequency.setValueAtTime(voice.from, start);

    if (voice.to !== voice.from) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, voice.to), end);
    }

    // Мгновенная атака и экспоненциальный спад: щелчка на старте нет,
    // хвоста — тоже.
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(voice.gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(sfx);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}
