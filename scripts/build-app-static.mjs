import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const appDir = path.join(rootDir, 'packages', 'app');
const outDir = path.join(appDir, 'dist-web');

const modules = [
  ['effects', path.join(rootDir, 'packages', 'effects', 'src')],
  ['schema', path.join(rootDir, 'packages', 'schema', 'src')],
  ['core', path.join(rootDir, 'packages', 'core', 'src')],
  ['app', path.join(appDir, 'src')],
];

const compilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  useDefineForClassFields: true,
  verbatimModuleSyntax: true,
};

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const sourcePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(sourcePath)));
      continue;
    }

    if (!/\.(ts|tsx)$/u.test(entry.name) || /\.test\.(ts|tsx)$/u.test(entry.name)) {
      continue;
    }

    files.push(sourcePath);
  }

  return files;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function transpileModule(moduleName, srcDir) {
  const files = await collectSourceFiles(srcDir);

  await Promise.all(
    files.map(async (sourcePath) => {
      const relativePath = path.relative(srcDir, sourcePath);
      const targetPath = path.join(
        outDir,
        'modules',
        moduleName,
        relativePath.replace(/\.(ts|tsx)$/u, '.js'),
      );
      const source = await readFile(sourcePath, 'utf8');
      const { outputText, diagnostics } = ts.transpileModule(source, {
        compilerOptions,
        fileName: sourcePath,
        reportDiagnostics: true,
      });

      const errors = diagnostics.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length > 0) {
        const message = ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (fileName) => fileName,
          getCurrentDirectory: () => rootDir,
          getNewLine: () => '\n',
        });
        throw new Error(message);
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, outputText.replace("import './styles.css';\n", ''), 'utf8');
    }),
  );
}

async function buildCss() {
  const tailwindConfigPath = path.join(appDir, 'tailwind.config.js');
  const tailwindConfig = (await import(pathToFileURL(tailwindConfigPath).href)).default;
  const content = Array.isArray(tailwindConfig.content)
    ? tailwindConfig.content.map((pattern) => toPosixPath(path.join(appDir, pattern)))
    : tailwindConfig.content;
  const css = await readFile(path.join(appDir, 'src', 'styles.css'), 'utf8');
  const result = await postcss([tailwindcss({ ...tailwindConfig, content }), autoprefixer]).process(
    css,
    {
      from: path.join(appDir, 'src', 'styles.css'),
      to: path.join(outDir, 'assets', 'styles.css'),
    },
  );

  await mkdir(path.join(outDir, 'assets'), { recursive: true });
  await writeFile(path.join(outDir, 'assets', 'styles.css'), result.css, 'utf8');
}

async function copyVendorFiles() {
  await mkdir(path.join(outDir, 'vendor'), { recursive: true });
  await Promise.all([
    cp(
      path.join(rootDir, 'node_modules', 'react', 'umd', 'react.production.min.js'),
      path.join(outDir, 'vendor', 'react.js'),
    ),
    cp(
      path.join(rootDir, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
      path.join(outDir, 'vendor', 'react-dom.js'),
    ),
    cp(
      path.join(rootDir, 'node_modules', 'framer-motion', 'dist', 'framer-motion.js'),
      path.join(outDir, 'vendor', 'framer-motion.js'),
    ),
    cp(
      path.join(rootDir, 'node_modules', '@noble', 'hashes', 'esm'),
      path.join(outDir, 'vendor', 'noble'),
      {
        recursive: true,
      },
    ),
  ]);

  const wrappers = new Map([
    [
      'react-wrapper.js',
      `const React = globalThis.React;
export const Children = React.Children;
export const Fragment = React.Fragment;
export const StrictMode = React.StrictMode;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const memo = React.memo;
export const useCallback = React.useCallback;
export const useContext = React.useContext;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useInsertionEffect = React.useInsertionEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useReducer = React.useReducer;
export const useRef = React.useRef;
export const useState = React.useState;
export default React;
`,
    ],
    [
      'react-jsx-runtime.js',
      `const React = globalThis.React;
export const Fragment = React.Fragment;

function withKey(props, key) {
  return key === undefined ? props : { ...(props ?? {}), key };
}

export function jsx(type, props, key) {
  return React.createElement(type, withKey(props ?? {}, key));
}

export const jsxs = jsx;
export const jsxDEV = jsx;
`,
    ],
    [
      'react-dom-client.js',
      `export const createRoot = globalThis.ReactDOM.createRoot;
export const hydrateRoot = globalThis.ReactDOM.hydrateRoot;
`,
    ],
    [
      'framer-motion-wrapper.js',
      `const Motion = globalThis.Motion;
export const LayoutGroup = Motion.LayoutGroup;
export const MotionConfig = Motion.MotionConfig;
export const motion = Motion.motion;
export const useMotionValue = Motion.useMotionValue;
export const useTransform = Motion.useTransform;
export default Motion;
`,
    ],
  ]);

  await Promise.all(
    [...wrappers.entries()].map(([fileName, contents]) =>
      writeFile(path.join(outDir, 'vendor', fileName), contents, 'utf8'),
    ),
  );
}

async function writeHtml() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenCards · Ember Duel demo</title>
    <link rel="stylesheet" href="/assets/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="/vendor/react.js"></script>
    <script src="/vendor/react-dom.js"></script>
    <script src="/vendor/framer-motion.js"></script>
    <script type="importmap">
      {
        "imports": {
          "@noble/hashes/crypto": "/vendor/noble/crypto.js",
          "@noble/hashes/sha256": "/vendor/noble/sha256.js",
          "@noble/hashes/utils": "/vendor/noble/utils.js",
          "@opencards/core": "/modules/core/index.js",
          "@opencards/effects": "/modules/effects/index.js",
          "@opencards/schema": "/modules/schema/index.js",
          "framer-motion": "/vendor/framer-motion-wrapper.js",
          "react": "/vendor/react-wrapper.js",
          "react-dom/client": "/vendor/react-dom-client.js",
          "react/jsx-runtime": "/vendor/react-jsx-runtime.js"
        }
      }
    </script>
    <script type="module" src="/modules/app/main.js"></script>
  </body>
</html>
`;

  await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
}

await rm(outDir, { recursive: true, force: true });
await Promise.all(modules.map(([moduleName, srcDir]) => transpileModule(moduleName, srcDir)));
await Promise.all([buildCss(), copyVendorFiles()]);
await writeHtml();
