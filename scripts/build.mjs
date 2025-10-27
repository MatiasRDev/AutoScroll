import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import javascriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const entryFile = path.join(projectRoot, 'src', 'autoscroll.source.js');
const distDir = path.join(projectRoot, 'dist');
const bundlePath = path.join(distDir, 'autoscroll.bundle.js');
const installerPath = path.join(distDir, 'autoscroll.user.js');
const rootInstallerPath = path.join(projectRoot, 'autoscroll.user.js');
const packageJsonPath = path.join(projectRoot, 'package.json');

const BUNDLE_REQUIRE_URL =
  'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/dist/autoscroll.bundle.js';
const INSTALLER_URL =
  'https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/dist/autoscroll.user.js';
const INSTALLER_COMMENT =
  '// Archivo generado automáticamente. Ejecuta "npm run build" para regenerar.';

function createInstallerHeader(version) {
  return `// ==UserScript==\n`
    + `// @name         AutoScroll\n`
    + `// @namespace    https://matias.ramirez/autoscroll\n`
    + `// @version      ${version}\n`
    + `// @description  Auto-scroll configurable con panel avanzado\n`
    + `// @match        http*://*/*\n`
    + `// @updateURL    ${INSTALLER_URL}\n`
    + `// @downloadURL  ${INSTALLER_URL}\n`
    + `// @require      ${BUNDLE_REQUIRE_URL}\n`
    + `// @grant        GM_getValue\n`
    + `// @grant        GM_setValue\n`
    + `// @grant        GM_addStyle\n`
    + `// @grant        GM_registerMenuCommand\n`
    + `// ==/UserScript==\n`;
}

async function build() {
  try {
    const [sourceCode, packageJson] = await Promise.all([
      readFile(entryFile, 'utf8'),
      readFile(packageJsonPath, 'utf8'),
    ]);

    const { version } = JSON.parse(packageJson);
    if (!version) {
      throw new Error('No se pudo leer la versión desde package.json');
    }

    if (!sourceCode.trim()) {
      throw new Error('El archivo de entrada está vacío');
    }

    const esbuildResult = await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      format: 'iife',
      target: 'es2020',
      platform: 'browser',
      minify: false,
      write: false,
    });

    if (!esbuildResult.outputFiles?.length) {
      throw new Error('esbuild no generó resultados');
    }

    const bundledCode = esbuildResult.outputFiles[0].text;

    const obfuscationResult = javascriptObfuscator.obfuscate(bundledCode, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      identifierNamesGenerator: 'hexadecimal',
      simplify: true,
      stringArray: true,
      stringArrayThreshold: 0.75,
      target: 'browser',
    });

    const obfuscatedCode = obfuscationResult.getObfuscatedCode();

    await mkdir(distDir, { recursive: true });
    await writeFile(bundlePath, `${obfuscatedCode}\n`, 'utf8');

    const installerHeader = createInstallerHeader(version);
    const installerContent = `${installerHeader}\n${INSTALLER_COMMENT}\n`;
    await writeFile(installerPath, installerContent, 'utf8');
    await writeFile(rootInstallerPath, installerContent, 'utf8');

    console.log(`Bundle generado en ${path.relative(projectRoot, bundlePath)}`);
    console.log(`Instalador actualizado en ${path.relative(projectRoot, installerPath)}`);
  } catch (error) {
    console.error('Error durante la construcción:', error);
    process.exit(1);
  }
}

build();
