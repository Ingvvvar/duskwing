import type { LevelConfig, Theme } from '../game/types';

type Airflow = LevelConfig['mechanics']['airflow'];

/**
 * Ключи пересборки слоёв фона.
 *
 * Ключ — ровно те поля темы, от которых зависит построенное слоем, и ничего
 * больше. Ключ совпал с прошлым — слой ничего не строит. В бесконечном режиме
 * тема меняется на каждом очке, но светило, дымка и частицы между порогами
 * остаются теми же, и без ключа строились бы заново на каждом очке.
 *
 * Лишнее поле в ключе ошибкой не выглядит: картинка верна, только оптимизация
 * молча выключается. Поэтому тест проверяет обе стороны — ключ меняется от
 * своего поля и не меняется от чужого, — и вторая сторона важнее.
 *
 * Вынесено без `pixi.js`: так ключи проверяются в node.
 */

/** Светило и звёзды: всё `celestial`, и только оно. */
export function celestialKey(theme: Theme): string {
  const { kind, x, y, glow, stars } = theme.celestial;

  return JSON.stringify([kind, x, y, glow, stars]);
}

/**
 * Дымка: только цвет. Альфа в текстуру не запекается — она ставится на спрайт
 * при каждой смене темы, поэтому пересборки не требует.
 */
export function hazeKey(theme: Theme): string {
  return JSON.stringify(theme.haze === null ? null : theme.haze.color);
}

/**
 * Оттенок капель погоды. Одна формула на ключ и на слой: разъехавшись, они
 * дали бы частицы старого цвета при совпавшем ключе.
 */
export function weatherTint(theme: Theme): string {
  return theme.haze?.color ?? theme.sky[3];
}

/**
 * Контейнер частиц: вид, число и скорость погоды, оттенок капель, зоны потока
 * уровня и `prefers-reduced-motion`. Текстура частиц в ключ не входит — она
 * общая и живёт в кэше рендерера.
 */
export function weatherKey(theme: Theme, airflow: Airflow, reducedMotion: boolean): string {
  const { kind, count, speed } = theme.weather;

  return JSON.stringify([
    kind,
    count,
    speed,
    weatherTint(theme),
    airflow?.zones ?? null,
    airflow?.strength ?? null,
    reducedMotion,
  ]);
}

/** Виньетка: только её сила. Остальной грейд — числа фильтра, не текстура. */
export function vignetteKey(theme: Theme): string {
  return JSON.stringify(theme.grade.vignette);
}
