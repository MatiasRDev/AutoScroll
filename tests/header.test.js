import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

const RAW_BASE = 'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main';
const HEADER_FIELDS = [
  ['@updateURL', '/autoscroll.user.js'],
  ['@downloadURL', '/autoscroll.user.js'],
  ['@require', '/dist/autoscroll.bundle.js'],
];
const NAMESPACE_URL = 'https://github.com/MatiasRDev/AutoScroll';

const USERSCRIPT_PATH = new URL('../autoscroll.user.js', import.meta.url);
const PACKAGE_JSON_PATH = new URL('../package.json', import.meta.url);
const README_PATH = new URL('../README.md', import.meta.url);

test('la versión del userscript coincide con package.json', async () => {
  const [header, packageJson] = await Promise.all([
    readFile(USERSCRIPT_PATH, 'utf8'),
    readFile(PACKAGE_JSON_PATH, 'utf8'),
  ]);

  const versionMatch = header.match(/^\/\/\s+@version\s+(\S+)/m);
  expect(versionMatch, 'No se encontró la línea @version').toBeTruthy();

  const { version } = JSON.parse(packageJson);
  expect(versionMatch?.[1], 'La versión del userscript no coincide con package.json').toBe(
    version
  );
});

test('los metadatos usan la URL RAW esperada', async () => {
  const header = await readFile(USERSCRIPT_PATH, 'utf8');

  for (const [tag, suffix] of HEADER_FIELDS) {
    const pattern = new RegExp(`^//\\s+${tag}\\s+(\\S+)`, 'm');
    const match = header.match(pattern);
    expect(match, `No se encontró la línea ${tag}`).toBeTruthy();
    expect(match?.[1], `La URL de ${tag} no coincide con la base RAW esperada`).toBe(
      `${RAW_BASE}${suffix}`
    );
  }
});

test('el namespace apunta a la URL pública', async () => {
  const header = await readFile(USERSCRIPT_PATH, 'utf8');

  const pattern = /^\/\/\s+@namespace\s+(\S+)/m;
  const match = header.match(pattern);

  expect(match, 'No se encontró la línea @namespace').toBeTruthy();
  expect(match?.[1], 'El namespace no coincide con la URL pública').toBe(NAMESPACE_URL);
});

test('la descripción coincide con la frase pública del README', async () => {
  const [header, readme] = await Promise.all([
    readFile(USERSCRIPT_PATH, 'utf8'),
    readFile(README_PATH, 'utf8'),
  ]);

  const descriptionMatch = header.match(/^\/\/\s+@description\s+(.+)$/m);
  expect(descriptionMatch, 'No se encontró la línea @description').toBeTruthy();

  const readmeFeatureLine = readme
    .split('\n')
    .find((line) => line.trim() && !line.trim().startsWith('#'));

  // Garantiza que lo que ve el usuario en Tampermonkey se mantenga alineado con la documentación pública.
  expect(descriptionMatch?.[1].trim(), 'La descripción no coincide con README').toBe(
    readmeFeatureLine?.trim()
  );
});
