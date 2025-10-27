import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import javascriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_FILE = path.join(projectRoot, 'src', 'autoscroll.source.js');
const DIST_DIR = path.join(projectRoot, 'dist');
const BUNDLE_FILE = path.join(DIST_DIR, 'autoscroll.bundle.js');
const INSTALLER_FILE = path.join(projectRoot, 'autoscroll.user.js');
const PACKAGE_JSON = path.join(projectRoot, 'package.json');

const BUNDLE_REQUIRE_URL =
  'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/dist/autoscroll.bundle.js';
const INSTALLER_URL =
  'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/autoscroll.user.js';

function createInstaller(version) {
  return `// ==UserScript==\n` +
    `// @name         AutoScroll\n` +
    `// @namespace    https://matias.ramirez/autoscroll\n` +
    `// @version      ${version}\n` +
    `// @description  Auto-scroll configurable con panel avanzado\n` +
    `// @match        http*://*/*\n` +
    `// @updateURL    ${INSTALLER_URL}\n` +
    `// @downloadURL  ${INSTALLER_URL}\n` +
    `// @require      ${BUNDLE_REQUIRE_URL}\n` +
    `// @grant        GM_getValue\n` +
    `// @grant        GM_setValue\n` +
    `// @grant        GM_addStyle\n` +
    `// @grant        GM_registerMenuCommand\n` +
    `// ==/UserScript==\n`;
}

async function build() {
  try {
    const [sourceCode, packageJson] = await Promise.all([
      readFile(SOURCE_FILE, 'utf8'),
      readFile(PACKAGE_JSON, 'utf8'),
    ]);

    if (!sourceCode.trim()) {
      throw new Error('El archivo de entrada "src/autoscroll.source.js" está vacío.');
    }

    const { version } = JSON.parse(packageJson);
    if (typeof version !== 'string' || !version.trim()) {
      throw new Error('No se pudo obtener la versión desde package.json');
    }

    const transformed = await esbuild.transform(sourceCode, {
      loader: 'js',
      target: 'es2020',
      minify: true,
      legalComments: 'none',
    });

    const obfuscationResult = javascriptObfuscator.obfuscate(transformed.code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.5,
      deadCodeInjection: false,
      identifierNamesGenerator: 'hexadecimal',
      simplify: true,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.75,
      target: 'browser',
    });

    await mkdir(DIST_DIR, { recursive: true });
    await writeFile(BUNDLE_FILE, `${obfuscationResult.getObfuscatedCode()}\n`, 'utf8');

    const installer = createInstaller(version);
    await writeFile(INSTALLER_FILE, `${installer}\n`, 'utf8');

    console.log(`Bundle generado en ${path.relative(projectRoot, BUNDLE_FILE)}`);
    console.log(`Instalador actualizado en ${path.relative(projectRoot, INSTALLER_FILE)}`);
  } catch (error) {
    console.error('Error durante la construcción:', error);
    process.exit(1);
  }
}

build();
