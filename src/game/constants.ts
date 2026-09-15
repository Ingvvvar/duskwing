/**
 * Физика и размеры мира — раздел 2 TASK.md.
 *
 * Всё в логических единицах. Масштабирование под реальный экран — забота
 * рендера, здесь о пикселях устройства не знают.
 */

/** Логическая сетка. */
export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 640;

/** Земля занимает нижнюю полосу и убивает при касании. */
export const GROUND_HEIGHT = 92;
export const GROUND_TOP = WORLD_HEIGHT - GROUND_HEIGHT;

/** Центр лётной зоны: стартовая высота птицы и середина полосы просветов. */
export const FLYABLE_CENTER = GROUND_TOP / 2;

/** Птица стоит на месте по X и движется только по Y. */
export const BIRD_X = 104;
export const BIRD_RADIUS_VISUAL = 13;
export const BIRD_RADIUS_HITBOX = 10.5;
export const BIRD_START_Y = FLYABLE_CENTER;

/** Общий для всех уровней предел скорости падения, px/s. */
export const MAX_FALL_SPEED = 780;

export const PIPE_WIDTH = 64;

/** Фиксированный шаг симуляции: 1/120 с. */
export const STEP_SECONDS = 1 / 120;
export const STEP_MS = 1000 / 120;

/**
 * Предел накопления за один вызов step. Вкладка могла провисеть в фоне час —
 * без клампа аккумулятор отработает этот час тиками и подвесит страницу.
 */
export const MAX_FRAME_MS = 250;
