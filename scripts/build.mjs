import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let esbuild;
try {
  esbuild = await import('esbuild');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') {
    console.warn('No se pudo cargar esbuild:', error.message);
  }
}

let jsmin;
if (!esbuild) {
  ({ minify: jsmin } = await import('./jsmin.mjs'));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const headerPath = path.join(projectRoot, 'autoscroll.user.js');
const sourcePath = path.join(projectRoot, 'src', 'autoscroll.source.js');
const distDir = path.join(projectRoot, 'dist');
const bundlePath = path.join(distDir, 'autoscroll.bundle.js');
const installerPath = path.join(distDir, 'autoscroll.user.js');
const headerCloseToken = '// ==/UserScript==';

async function build() {
  try {
    const [headerSource, scriptSource] = await Promise.all([
      readFile(headerPath, 'utf8'),
      readFile(sourcePath, 'utf8'),
    ]);

    const headerStart = headerSource.indexOf('// ==UserScript==');
    if (headerStart === -1) {
      throw new Error('No se encontró el encabezado Tampermonkey (==UserScript==).');
    }

    const headerEnd = headerSource.indexOf(headerCloseToken, headerStart);
    if (headerEnd === -1) {
      throw new Error('No se encontró el cierre del encabezado Tampermonkey (==/UserScript==).');
    }

    const headerCloseIndex = headerEnd + headerCloseToken.length;
    const header = headerSource.slice(headerStart, headerCloseIndex).trimEnd();

    const installerTail = headerSource.slice(headerCloseIndex).trim();
    if (
      installerTail &&
      !installerTail
        .split('\n')
        .every((line) => line.trim().startsWith('//'))
    ) {
      throw new Error('El instalador contiene código adicional fuera de comentarios.');
    }

    const installerOutput = installerTail ? `${header}\n\n${installerTail}` : header;

    let code;
    if (esbuild) {
      ({ code } = await esbuild.transform(scriptSource, {
        minify: true,
        format: 'iife',
        target: 'es2020',
      }));
    } else {
      code = jsmin(scriptSource);
    }

    await mkdir(distDir, { recursive: true });
    await writeFile(bundlePath, `${code}\n`, 'utf8');
    await writeFile(installerPath, `${installerOutput}\n`, 'utf8');

    console.log('Construcción completada:');
    console.log(` - ${path.relative(projectRoot, bundlePath)}`);
    console.log(` - ${path.relative(projectRoot, installerPath)}`);
  } catch (error) {
    console.error('Error al construir el script de usuario:', error);
    process.exit(1);
  }
}

build();
