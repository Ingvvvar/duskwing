#!/usr/bin/env node
/**
 * Проверка честности картинки по живым пикселям, все пять тем.
 *
 * Поднимает дев-сервер, снимает по два кадра на тему через дев-переключатель
 * `?theme=`, отдаёт кадры в `scripts/readability.py` и возвращает его код.
 * Ненулевой код означает нарушение контракта читаемости из TASK.md.
 *
 * В `npm run test` не входит намеренно: здесь нужен браузер, а юнит-набор
 * обязан идти без него. Юнит-тестами этот инвариант и не закрывается — то,
 * что плотным на экране оказалось ровно то, что участвует в коллизии, видно
 * только на настоящих пикселях.
 *
 * Браузер свой: `playwright-core` ничего не скачивает. Берётся системный
 * Chrome, либо путь из `DUSKWING_CHROME`.
 */
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import process from 'node:process';

import { chromium } from 'playwright-core';

const THEMES = ['dusk', 'night', 'storm', 'canyon', 'void'];
const SHOTS = '.readability';
const PORT = 5177;
const BASE = `http://localhost:${String(PORT)}/duskwing/`;

/**
 * Два сида на тему: раскладка разная, значит разная и высота просвета.
 *
 * Снимается уровень 2, а не 1: на первом первые препятствия односторонние по
 * кривой обучения, и в полосе замера от них остаётся слишком короткий столбик.
 */
const SEEDS = [4242, 90210];

function startDevServer() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('дев-сервер не поднялся за 30 с'));
    }, 30_000);

    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('ready in') || String(chunk).includes('Local:')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`дев-сервер вышел с кодом ${String(code)}`));
    });
  });
}

async function launch() {
  const executablePath = process.env.DUSKWING_CHROME;

  try {
    return await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
  } catch (error) {
    console.error(
      'Не удалось запустить браузер. Нужен установленный Google Chrome либо путь\n' +
        'к исполняемому файлу в переменной DUSKWING_CHROME.\n',
    );
    throw error;
  }
}

async function capture() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'duskwing.progress',
      JSON.stringify({ bestScores: {}, clearedLevels: [1], attempts: { 1: 9 }, muted: true }),
    );
  });

  for (const theme of THEMES) {
    for (const [index, seed] of SEEDS.entries()) {
      await page.goto(`${BASE}?theme=${theme}&seed=${String(seed)}`, { waitUntil: 'load' });
      await page.getByRole('button', { name: 'Играть' }).click();
      await page.getByRole('button', { name: /Ночь/ }).click();
      await page.waitForFunction(
        () => document.querySelector('.stage')?.dataset.screen === 'running',
      );

      // Частые взмахи прижимают птицу к потолку, и она неизбежно гибнет о
      // верхнюю половину первого же препятствия. Смерть замораживает мир —
      // труба остаётся стоять у птицы, и кадр получается воспроизводимым, а
      // не пойманным по таймеру.
      const deadline = Date.now() + 20_000;

      while (Date.now() < deadline) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(90);

        const screen = await page.evaluate(() => document.querySelector('.stage')?.dataset.screen);

        if (screen === 'over') {
          break;
        }
      }

      const screen = await page.evaluate(() => document.querySelector('.stage')?.dataset.screen);

      if (screen !== 'over') {
        throw new Error(`тема ${theme}, сид ${String(seed)}: птица не долетела до препятствия`);
      }

      // Оболочка скрывается только на время снимка: контракт читаемости — про
      // игровой слой и фон, а не про React поверх них. Мир в этот момент уже
      // заморожен, на замер это не влияет.
      await page.addStyleTag({ content: '.overlay, .hud { display: none !important; }' });
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${SHOTS}/${theme}-${String(index + 1)}.png` });
    }
  }

  await browser.close();
}

function analyse() {
  return new Promise((resolve) => {
    const child = spawn('python3', ['scripts/readability.py', `${SHOTS}/*.png`], {
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

let server = null;

try {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });
  server = await startDevServer();
  await capture();
  process.exitCode = await analyse();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  server?.kill();
}
