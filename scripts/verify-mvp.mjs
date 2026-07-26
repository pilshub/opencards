#!/usr/bin/env node
import { spawn } from 'node:child_process';

const steps = [
  {
    name: 'schema+runtime validation',
    command: 'npm',
    args: ['run', 'verify:schema-runtime'],
  },
  {
    name: 'check',
    command: 'npm',
    args: ['run', 'check'],
  },
  {
    name: 'simulator suite',
    command: 'npm',
    args: ['run', 'test', '--workspace=@opencards/simulator'],
  },
  {
    name: 'foundry balance',
    command: 'npm',
    args: ['run', 'verify:balance'],
  },
  {
    name: 'build:web',
    command: 'npm',
    args: ['run', 'build:web'],
  },
  {
    name: 'verify:app',
    command: 'npm',
    args: ['run', 'verify:app'],
  },
  {
    name: 'browser end-to-end suite',
    command: 'npm',
    args: ['run', 'test:e2e', '--workspace=@opencards/app'],
  },
];

for (const step of steps) {
  const code = await runStep(step);
  if (code !== 0) {
    console.error(`[verify:mvp] ${step.name} failed with exit code ${String(code)}`);
    process.exit(code);
  }
}

console.log('[verify:mvp] all steps passed');

function runStep(step) {
  console.log(`[verify:mvp] ${step.name}: ${step.command} ${step.args.join(' ')}`);
  const command = commandForPlatform(step);

  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      console.error(`[verify:mvp] failed to start ${step.name}: ${error.message}`);
      resolve(1);
    });

    child.on('close', (code, signal) => {
      if (signal !== null) {
        console.error(`[verify:mvp] ${step.name} terminated by signal ${signal}`);
        resolve(1);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

function commandForPlatform(step) {
  if (process.platform === 'win32' && step.command === 'npm') {
    return {
      executable: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm', ...step.args].join(' ')],
    };
  }

  return { executable: step.command, args: step.args };
}
