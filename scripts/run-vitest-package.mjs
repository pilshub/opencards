import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { startVitest } from 'vitest/node';

/*
 * Windows fallback for Vitest config loading.
 * See docs/adr/0003-windows-vitest-runner.md for the esbuild spawn failure
 * that keeps package tests on this runner until direct `vitest run --coverage`
 * works on the supported Windows/Node toolchain.
 */

const packageDir = process.cwd();
const configPath = path.join(packageDir, 'vitest.config.ts');
const packageConfig = await import(pathToFileURL(configPath).href);
const fullConfig = packageConfig.default;
const unsupportedTopLevelKeys = [
  'plugins',
  'resolve',
  'define',
  'optimizeDeps',
  'css',
  'esbuild',
  'json',
  'assetsInclude',
].filter((key) => Object.hasOwn(fullConfig ?? {}, key));

if (unsupportedTopLevelKeys.length > 0) {
  console.error(
    [
      `Unsupported top-level Vitest/Vite config key(s) in ${configPath}: ${unsupportedTopLevelKeys.join(', ')}.`,
      "The custom Windows runner only supports the 'test' portion of vitest.config.ts.",
      'Adding top-level Vite config requires updating scripts/run-vitest-package.mjs or migrating back to direct Vitest.',
      'See docs/adr/0003-windows-vitest-runner.md.',
    ].join('\n'),
  );
  process.exit(1);
}

const testConfig = fullConfig?.test;

if (!testConfig?.coverage?.thresholds) {
  console.error(`No coverage thresholds configured in ${configPath}.`);
  process.exit(1);
}

const tsNoEsbuildPlugin = {
  name: 'opencards-ts-no-esbuild',
  enforce: 'pre',
  transform(code, id) {
    const filePath = id.split('?')[0];

    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
      return null;
    }

    const result = ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
      fileName: filePath,
    });

    return {
      code: result.outputText,
      map: result.sourceMapText ?? null,
    };
  },
};

const filters = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

const vitest = await startVitest(
  'test',
  filters,
  {
    ...testConfig,
    coverage: {
      ...testConfig.coverage,
      enabled: true,
    },
    pool: 'vmThreads',
    root: packageDir,
    run: true,
    server: {
      deps: {
        external: [/^@vitest\/coverage-v8/],
      },
    },
  },
  {
    configFile: false,
    esbuild: false,
    plugins: [tsNoEsbuildPlugin],
    resolve: {
      preserveSymlinks: true,
    },
    root: packageDir,
  },
);

await vitest?.close();

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
