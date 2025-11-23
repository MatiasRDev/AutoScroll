import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { README_PATH, getPublicDescription } from '../scripts/description.js';

const RAW_BASE = 'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main';
const TAG_PATTERN = (tag, flags = 'm') => new RegExp(`^//\\s+${tag}\\s+(.+\\S)`, flags);
const RAW_TAGS = [
  ['@updateURL', '/autoscroll.user.js'],
  ['@downloadURL', '/autoscroll.user.js'],
  ['@require', '/dist/autoscroll.bundle.js'],
];
const NAMESPACE_URL = 'https://github.com/MatiasRDev/AutoScroll';
const HOMEPAGE_URL = 'https://github.com/MatiasRDev/AutoScroll';

const USERSCRIPT_PATH = new URL('../autoscroll.user.js', import.meta.url);
const PACKAGE_JSON_PATH = new URL('../package.json', import.meta.url);
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

  for (const [tag, suffix] of RAW_TAGS) {
    const pattern = TAG_PATTERN(tag);
    const match = header.match(pattern);

    expect(match, `No se encontró la línea ${tag}`).toBeTruthy();
    expect(match?.[1], `La URL de ${tag} no coincide con la base RAW esperada`).toBe(
      `${RAW_BASE}${suffix}`
    );
  }
});

test('los metadatos obligatorios existen y no están vacíos', async () => {
  const header = await readFile(USERSCRIPT_PATH, 'utf8');

  const requiredTags = [
    ['@author', 'Matías Ramírez'],
    ['@license', 'MIT'],
    ['@homepageURL', HOMEPAGE_URL],
    ['@namespace', NAMESPACE_URL],
  ];

  for (const [tag, expected] of requiredTags) {
    const match = header.match(TAG_PATTERN(tag));

    expect(match, `No se encontró la línea ${tag}`).toBeTruthy();
    expect(match?.[1], `El valor de ${tag} está vacío`).toBeTruthy();
    expect(match?.[1], `El valor de ${tag} no coincide con el esperado`).toBe(expected);
  }
});

test('los grants declarados usan un valor no vacío', async () => {
  const header = await readFile(USERSCRIPT_PATH, 'utf8');
  const grants = ['@grant'];

  for (const grant of grants) {
    const matches = [...header.matchAll(TAG_PATTERN(grant, 'gm'))];
    expect(matches.length, `No se encontraron líneas ${grant}`).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match[1], `El valor de ${grant} está vacío`).toBeTruthy();
    }
  }
});

test('casos negativos: detecta URLs RAW inválidas y campos vacíos', () => {
  const invalidRawHeader = `// @updateURL https://example.com/autoscroll.user.js`;
  const emptyFieldHeader = `// @license    `;

  const updateMatch = invalidRawHeader.match(TAG_PATTERN('@updateURL'));
  const licenseMatch = emptyFieldHeader.match(TAG_PATTERN('@license'));

  expect(updateMatch?.[1]).not.toBe(`${RAW_BASE}/autoscroll.user.js`);
  expect(licenseMatch, 'La regex no debe coincidir con campos vacíos').toBeNull();
});

test('el namespace apunta a la URL pública', async () => {
  const header = await readFile(USERSCRIPT_PATH, 'utf8');

  const match = header.match(TAG_PATTERN('@namespace'));

  expect(match, 'No se encontró la línea @namespace').toBeTruthy();
  expect(match?.[1], 'El namespace no coincide con la URL pública').toBe(NAMESPACE_URL);
});

test('la descripción coincide con la frase pública del README', async () => {
  const [header, readme] = await Promise.all([
    readFile(USERSCRIPT_PATH, 'utf8'),
    getPublicDescription(README_PATH),
  ]);

  const descriptionMatch = header.match(/^\/\/\s+@description\s+(.+)$/m);
  expect(descriptionMatch, 'No se encontró la línea @description').toBeTruthy();

  // Garantiza que lo que ve el usuario en Tampermonkey se mantenga alineado con la documentación pública.
  expect(descriptionMatch?.[1].trim(), 'La descripción no coincide con README').toBe(readme);
});
