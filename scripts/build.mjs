import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'autoscroll.user.js');
const distDir = path.join(projectRoot, 'dist');
const outputPath = path.join(distDir, 'autoscroll.user.js');

async function build() {
  try {
    const source = await readFile(sourcePath, 'utf8');

    const headerStart = source.indexOf('// ==UserScript==');
    if (headerStart === -1) {
      throw new Error('No se encontró el encabezado Tampermonkey (==UserScript==).');
    }

    const headerEnd = source.indexOf('// ==/UserScript==', headerStart);
    if (headerEnd === -1) {
      throw new Error('No se encontró el cierre del encabezado Tampermonkey (==/UserScript==).');
    }

    const headerCloseIndex = headerEnd + '// ==/UserScript=='.length;
    const header = source.slice(headerStart, headerCloseIndex).trimEnd();
    const body = source.slice(headerCloseIndex);

    const { code } = await esbuild.transform(body, {
      minify: true,
      format: 'iife',
      target: 'es2020',
    });

    await mkdir(distDir, { recursive: true });
    const output = `${header}\n\n${code}\n`;
    await writeFile(outputPath, output, 'utf8');

    console.log(`Construcción completada: ${path.relative(projectRoot, outputPath)}`);
  } catch (error) {
    console.error('Error al construir el script de usuario:', error);
    process.exit(1);
  }
}

build();
