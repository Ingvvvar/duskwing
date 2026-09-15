import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME_DIR = join(ROOT, 'src', 'game');

/** Пакеты, которых в `src/game/**` быть не должно ни в каком виде. */
const FORBIDDEN_ROOTS = new Set(['react', 'react-dom', 'pixi.js']);
const FORBIDDEN_SCOPE = '@pixi/';

/**
 * Ловит все формы указания модуля: `from 'x'`, `import 'x'`, `import('x')`,
 * `require('x')`, `export * from 'x'`.
 */
const SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * Комментарии выбрасываются до разбора: иначе фраза про запрет импорта в
 * доккомменте сама роняет проверку. Строчные комментарии снимаются только
 * с начала строки, чтобы не съесть `//` внутри строкового литерала.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function collectSources(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSources(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }

  return files;
}

/** Корень пакета: `pixi.js/scene` -> `pixi.js`, `@pixi/sound/x` -> `@pixi/sound`. */
function packageRoot(specifier: string): string {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return parts.slice(0, 2).join('/');
  }
  return parts[0] ?? specifier;
}

function forbiddenImports(source: string): string[] {
  const found: string[] = [];

  for (const match of stripComments(source).matchAll(SPECIFIER)) {
    const specifier = match[1];
    if (specifier === undefined) {
      continue;
    }

    const root = packageRoot(specifier);
    if (FORBIDDEN_ROOTS.has(root) || root.startsWith(FORBIDDEN_SCOPE)) {
      found.push(specifier);
    }
  }

  return found;
}

describe('граница src/game', () => {
  const files = collectSources(GAME_DIR);

  it('находит исходники — иначе проверка зеленеет, ничего не проверив', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('не импортирует react и pixi.js', () => {
    const offenders = files
      .map((file) => ({
        file: relative(ROOT, file),
        imports: forbiddenImports(readFileSync(file, 'utf8')),
      }))
      .filter((entry) => entry.imports.length > 0);

    expect(offenders).toEqual([]);
  });
});
