import type { Rng } from '../game/rng';

/** Настоящая задержка между вспышкой и громом: она и делает грозу узнаваемой. */
export const THUNDER_MIN_DELAY_MS = 500;
export const THUNDER_MAX_DELAY_MS = 2000;

/**
 * Больше двух громов в полёте одновременно не бывает.
 *
 * Вспышки идут не реже чем раз в 2.6 с, а гром отстаёт до 2 с, поэтому в
 * норме их и так не больше двух. Ограничение нужно на случай, когда вспышки
 * пошли часто: без него очередь копит долг и выстреливает раскатами подряд,
 * а это читается как поломка, а не как гроза.
 */
export const THUNDER_MAX_PENDING = 2;

/**
 * Очередь грома. Чистая: ни одной ноды WebAudio, ни одного обращения к часам.
 *
 * Гром запускается от того же события, что и вспышка, а не по своему
 * расписанию — два источника одного явления неизбежно разъезжаются, и это в
 * проекте уже проходили с зонами ветра и центром просвета.
 *
 * Очередь двигается тем же `dtMs`, что и мир: на паузе гром ждёт, как ждёт и
 * сама вспышка.
 */
export class ThunderQueue {
  #pending: number[] = [];
  readonly #random: Rng;

  constructor(random: Rng) {
    this.#random = random;
  }

  get pending(): number {
    return this.#pending.length;
  }

  /** @returns гром поставлен в очередь; `false` — упёрлись в потолок. */
  onFlash(): boolean {
    if (this.#pending.length >= THUNDER_MAX_PENDING) {
      return false;
    }

    // Бросок делается только при успешной постановке: иначе поток случайности
    // зависел бы от переполнения очереди.
    const spread = THUNDER_MAX_DELAY_MS - THUNDER_MIN_DELAY_MS;

    this.#pending.push(THUNDER_MIN_DELAY_MS + this.#random() * spread);

    return true;
  }

  /** @returns сколько громов прозвучало на этом шаге. */
  advance(dtMs: number): number {
    if (dtMs <= 0) {
      return 0;
    }

    const left: number[] = [];
    let fired = 0;

    for (const remaining of this.#pending) {
      const next = remaining - dtMs;

      if (next <= 0) {
        fired += 1;
      } else {
        left.push(next);
      }
    }

    this.#pending = left;

    return fired;
  }

  reset(): void {
    this.#pending = [];
  }
}
