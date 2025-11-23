import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const README_PATH = path.join(__dirname, '..', 'README.md');

export async function getPublicDescription(readmePath = README_PATH) {
  const readme = await readFile(readmePath, 'utf8');
  const descriptionLine = readme
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));

  if (!descriptionLine) {
    throw new Error('No se encontró la línea descriptiva en README.md');
  }

  return descriptionLine;
}
