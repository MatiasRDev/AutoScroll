import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

const RAW_BASE = 'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main';
const HEADER_FIELDS = [
  ['@updateURL', '/autoscroll.user.js'],
  ['@downloadURL', '/autoscroll.user.js'],
  ['@require', '/dist/autoscroll.bundle.js'],
];

const USERSCRIPT_PATH = new URL('../autoscroll.user.js', import.meta.url);

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
