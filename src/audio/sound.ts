/**
 * Звук на осцилляторах WebAudio. Ни одного бинарного файла — как и текстуры,
 * всё синтезируется на месте.
 *
 * `src/game/**` про этот модуль не знает: логика по-прежнему ничего не издаёт,
 * звуки запускает оболочка по тем же переходам состояния, по которым уже
 * обновляет счёт и фазу.
 */

export type SoundName = 'flap' | 'score' | 'hit' | 'clear';

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
  readonly master: GainNode;
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
  }

  destroy(): void {
    const channel = this.#channel;

    this.#channel = null;

    if (channel !== null) {
      void channel.context.close();
    }
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

      master.gain.value = this.#muted ? 0 : 1;
      master.connect(context.destination);
      this.#channel = { context, master };

      return this.#channel;
    } catch {
      // Звук — не повод ронять игру: без него она полностью играбельна.
      return null;
    }
  }

  #voice(channel: Channel, voice: Voice): void {
    const { context, master } = channel;
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
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}
