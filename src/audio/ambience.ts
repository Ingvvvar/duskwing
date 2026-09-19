import { BIRD_X } from '../game/constants';
import { airflowNormalised } from '../game/mechanics';
import { mulberry32 } from '../game/rng';
import type { GameState, LevelConfig, Theme } from '../game/types';

type Kind = Theme['ambience']['kind'];

/** Как часто фон каньона пересчитывается по зонам потока. */
const GUST_UPDATE_MS = 50;
/** Сглаживание этого пересчёта, секунды: без него порыв щёлкает. */
const GUST_SMOOTHING = 0.08;

/** Ночные ноты: редкие, короткие, из одной гаммы. */
const NIGHT_NOTES = [329.63, 392, 440, 493.88, 587.33];
const NIGHT_MIN_GAP_MS = 4000;
const NIGHT_MAX_GAP_MS = 9000;
const NIGHT_SEED = 20260921;
/** Уровень темы — доля от этого потолка. Фон обязан быть заметно тише эффектов. */
const VOICE_SCALE = 0.12;

/**
 * Один фоновый голос: всё, что он создал, он же и убирает.
 *
 * Источник шума в набор не входит — он один на весь звук и живёт, пока жив
 * контекст. Голос только подключается к нему.
 */
interface Voice {
  readonly gain: GainNode;
  readonly nodes: readonly AudioNode[];
  readonly oscillators: readonly OscillatorNode[];
  readonly kind: Kind;
  /** Вход, подключённый к разделяемому шуму, — его же и отключаем. `null` у гула. */
  readonly noiseInput: AudioNode | null;
  /** Базовая громкость голоса — от неё считаются порывы и затухания. */
  level: number;
}

/**
 * Фон уровня на синтезе: ни одного файла, ни одной ноды на каплю дождя.
 *
 * Дождь, ветер и гул берут один разделяемый источник шума и расходятся по
 * фильтрам. Цепочка нод на каждое событие собрала бы мусор на телефоне — это
 * и есть основной риск фонового звука.
 *
 * `src/game/**` про этот модуль не знает: вид фона приходит данными из темы.
 */
export class Ambience {
  readonly #context: AudioContext;
  readonly #out: GainNode;
  readonly #noise: AudioBufferSourceNode;
  readonly #random = mulberry32(NIGHT_SEED);

  #voice: Voice | null = null;
  #gustLeftMs = 0;
  #noteLeftMs = NIGHT_MIN_GAP_MS;

  constructor(context: AudioContext, out: GainNode) {
    this.#context = context;
    this.#out = out;
    this.#noise = Ambience.#createNoise(context);
    this.#noise.start();
  }

  /**
   * Сменить фон с перетеканием. Длительность та же, что у кроссфейда картинки:
   * звук и изображение меняются одним движением, без обрыва.
   */
  set(ambience: Theme['ambience'], fadeMs: number): void {
    // Тот же вид фона — не пересобираем граф, только ведём громкость.
    if (this.#voice !== null && this.#voice.kind === ambience.kind) {
      this.#voice.level = ambience.level * VOICE_SCALE;
      this.#ramp(this.#voice.gain, this.#voice.level, fadeMs);

      return;
    }

    this.#fadeOutCurrent(fadeMs);

    if (ambience.kind === 'none') {
      return;
    }

    const voice = this.#build(ambience);

    this.#voice = voice;
    voice.gain.gain.setValueAtTime(0.0001, this.#context.currentTime);
    this.#ramp(voice.gain, voice.level, fadeMs);
  }

  /** Порывы каньона и ночные ноты — единственное, что живёт покадрово. */
  update(state: GameState, config: LevelConfig, dtMs: number): void {
    const voice = this.#voice;

    if (voice === null || dtMs <= 0) {
      return;
    }

    if (voice.kind === 'gusts') {
      this.#gustLeftMs -= dtMs;

      if (this.#gustLeftMs <= 0) {
        this.#gustLeftMs = GUST_UPDATE_MS;

        const airflow = config.mechanics.airflow;
        // Та же функция, что ведёт физику и полосы ветра. Третьего источника
        // координат зон в проекте нет и не будет.
        const flow =
          airflow === undefined ? 0 : airflowNormalised(state.travelledX + BIRD_X, airflow);

        voice.gain.gain.setTargetAtTime(
          voice.level * (0.45 + 0.55 * Math.abs(flow)),
          this.#context.currentTime,
          GUST_SMOOTHING,
        );
      }
    }

    if (voice.kind === 'night') {
      this.#noteLeftMs -= dtMs;

      if (this.#noteLeftMs <= 0) {
        this.#noteLeftMs =
          NIGHT_MIN_GAP_MS + this.#random() * (NIGHT_MAX_GAP_MS - NIGHT_MIN_GAP_MS);
        this.#note();
      }
    }
  }

  /** Гром: короткий раскат из того же шума. Зовётся по событию вспышки. */
  thunder(): void {
    const context = this.#context;
    const now = context.currentTime;
    const gain = context.createGain();
    const low = context.createBiquadFilter();

    low.type = 'lowpass';
    low.frequency.setValueAtTime(320, now);
    low.frequency.exponentialRampToValueAtTime(90, now + 1.6);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    this.#noise.connect(low);
    low.connect(gain);
    gain.connect(this.#out);

    // Раскат отключается по времени: висящие ноды — это и есть утечка.
    window.setTimeout(() => {
      this.#noise.disconnect(low);
      low.disconnect();
      gain.disconnect();
    }, 2200);
  }

  stop(fadeMs: number): void {
    this.#fadeOutCurrent(fadeMs);
  }

  destroy(): void {
    this.#fadeOutCurrent(0);

    try {
      this.#noise.stop();
    } catch {
      // Уже остановлен — уборке это не мешает.
    }

    this.#noise.disconnect();
  }

  #ramp(gain: GainNode, to: number, fadeMs: number): void {
    const now = this.#context.currentTime;
    const target = Math.max(0.0001, to);

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(target, now + Math.max(0.001, fadeMs / 1000));
  }

  #fadeOutCurrent(fadeMs: number): void {
    const voice = this.#voice;

    this.#voice = null;

    if (voice === null) {
      return;
    }

    this.#ramp(voice.gain, 0.0001, fadeMs);

    // Уборка после затухания: всё, что голос создал, отключается поимённо.
    // Висящие ноды — это и есть утечка, ради которой делался замер.
    window.setTimeout(() => {
      for (const oscillator of voice.oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Уже остановлен.
        }
      }

      if (voice.noiseInput !== null) {
        this.#noise.disconnect(voice.noiseInput);
      }

      for (const node of voice.nodes) {
        node.disconnect();
      }

      voice.gain.disconnect();
    }, Math.max(60, fadeMs + 80));
  }

  #note(): void {
    const context = this.#context;
    const now = context.currentTime;
    const index = Math.floor(this.#random() * NIGHT_NOTES.length);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(NIGHT_NOTES[index] ?? 440, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(0.05, now + 0.12);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    oscillator.connect(envelope);
    envelope.connect(this.#out);
    oscillator.start(now);
    oscillator.stop(now + 1.5);
    oscillator.onended = (): void => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  /**
   * Голоса. У каждого фиксированный граф: источник шума разделяемый, своё —
   * фильтры, громкость и, где нужно, медленная LFO.
   */
  #build(ambience: Theme['ambience']): Voice {
    const context = this.#context;
    const gain = context.createGain();
    const level = ambience.level * VOICE_SCALE;

    gain.connect(this.#out);

    if (ambience.kind === 'hum') {
      const low = context.createBiquadFilter();
      const a = context.createOscillator();
      const b = context.createOscillator();

      low.type = 'lowpass';
      low.frequency.value = 180;
      a.type = 'sine';
      a.frequency.value = 55;
      b.type = 'sine';
      b.frequency.value = 55.4;
      a.connect(low);
      b.connect(low);
      low.connect(gain);
      a.start();
      b.start();

      return { gain, nodes: [low], oscillators: [a, b], kind: ambience.kind, noiseInput: null, level };
    }

    const filter = context.createBiquadFilter();

    if (ambience.kind === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.5;
    } else if (ambience.kind === 'night') {
      filter.type = 'lowpass';
      filter.frequency.value = 220;
    } else {
      // Ветер и порывы: одна и та же полоса, разная модуляция.
      filter.type = 'lowpass';
      filter.frequency.value = 400;
    }

    this.#noise.connect(filter);
    filter.connect(gain);

    if (ambience.kind === 'wind' || ambience.kind === 'rain') {
      // Медленное дыхание. У порывов каньона его нет: там громкость ведут
      // зоны потока, и вторая модуляция поверх них только мешала бы.
      const lfo = context.createOscillator();
      const depth = context.createGain();

      lfo.type = 'sine';
      lfo.frequency.value = ambience.kind === 'wind' ? 0.07 : 0.23;
      depth.gain.value = level * 0.35;
      lfo.connect(depth);
      depth.connect(gain.gain);
      lfo.start();

      return {
        gain,
        nodes: [filter, depth],
        oscillators: [lfo],
        kind: ambience.kind,
        noiseInput: filter,
        level,
      };
    }

    return { gain, nodes: [filter], oscillators: [], kind: ambience.kind, noiseInput: filter, level };
  }

  /** Две секунды белого шума, зациклены. Один источник на весь звук. */
  static #createNoise(context: AudioContext): AudioBufferSourceNode {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    const random = mulberry32(20260922);

    for (let i = 0; i < length; i += 1) {
      data[i] = random() * 2 - 1;
    }

    const source = context.createBufferSource();

    source.buffer = buffer;
    source.loop = true;

    return source;
  }
}
