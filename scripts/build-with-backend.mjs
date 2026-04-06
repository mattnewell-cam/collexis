import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const repoRoot = process.cwd();
const nextBin = join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const runtimeRoot = join(repoRoot, 'runtime');
const defaultVenvDir = join(runtimeRoot, 'venvs', 'collexis');

function resolveRepoPath(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

const venvDir = resolveRepoPath(process.env.COLLEXIS_RUNTIME_VENV_DIR, defaultVenvDir);

function isWindows() {
  return process.platform === 'win32';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function detectPythonCommand() {
  const candidates = isWindows()
    ? [
        ['py', ['-3']],
        ['python', []],
        ['python3', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ];

  for (const [command, baseArgs] of candidates) {
    const result = spawnSync(command, [...baseArgs, '--version'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    if (result.status === 0) {
      return { command, baseArgs };
    }
  }

  throw new Error('No Python interpreter was found. Install Python 3 to build Collexis.');
}

function pythonExecutable() {
  return isWindows()
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');
}

const detectedPython = detectPythonCommand();

if (!existsSync(pythonExecutable())) {
  run(detectedPython.command, [...detectedPython.baseArgs, '-m', 'venv', venvDir]);
}

run(pythonExecutable(), ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(pythonExecutable(), ['-m', 'pip', 'install', '-r', 'backend/requirements.txt']);
run(process.execPath, [nextBin, 'build']);
