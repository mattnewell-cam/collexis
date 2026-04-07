import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const nextBin = join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const runtimeRoot = join(repoRoot, 'runtime');
const defaultRuntimeVenvDir = join(runtimeRoot, 'venvs', 'collexis');
const defaultLocalVenvDir = join(repoRoot, '.venv');
const defaultPycacheDir = join(runtimeRoot, 'pycache');

function resolveRepoPath(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function resolveWindowsPython(venvDir) {
  return join(venvDir, 'Scripts', 'python.exe');
}

function resolvePosixPython(venvDir) {
  return join(venvDir, 'bin', 'python');
}

function venvPythonExecutable(venvDir) {
  return process.platform === 'win32'
    ? resolveWindowsPython(venvDir)
    : resolvePosixPython(venvDir);
}

function detectPythonCommand() {
  const candidates = process.platform === 'win32'
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

  throw new Error('No Python interpreter was found. Install Python 3 to run the Collexis backend in development.');
}

function resolvePythonInvocation() {
  const venvDirs = [
    resolveRepoPath(process.env.COLLEXIS_RUNTIME_VENV_DIR, defaultRuntimeVenvDir),
    resolveRepoPath(process.env.COLLEXIS_DEV_VENV_DIR, defaultLocalVenvDir),
  ];

  for (const venvDir of venvDirs) {
    const executable = venvPythonExecutable(venvDir);
    if (existsSync(executable)) {
      return { command: executable, baseArgs: [] };
    }
  }

  return detectPythonCommand();
}

function terminate(child) {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
}

async function backendIsReady() {
  try {
    const response = await fetch('http://127.0.0.1:8000/health', { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackendReady() {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (await backendIsReady()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for the local Python backend on 127.0.0.1:8000.');
}

const python = resolvePythonInvocation();
const backendEnv = {
  ...process.env,
  PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX ?? resolveRepoPath(process.env.COLLEXIS_PYTHON_PYCACHE_DIR, defaultPycacheDir),
};

let backendProcess = null;
let nextProcess = null;

if (!(await backendIsReady())) {
  backendProcess = spawn(
    python.command,
    [...python.baseArgs, '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: backendEnv,
    },
  );

  backendProcess.on('exit', code => {
    if (!nextProcess) {
      process.exit(code ?? 1);
    }
    terminate(nextProcess);
    process.exit(code ?? 1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (backendProcess) terminate(backendProcess);
    if (nextProcess) terminate(nextProcess);
  });
}

try {
  await waitForBackendReady();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The Python backend failed to start.');
  if (backendProcess) terminate(backendProcess);
  process.exit(1);
}

nextProcess = spawn(
  process.execPath,
  [nextBin, 'dev', '--webpack'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

nextProcess.on('exit', code => {
  if (backendProcess) terminate(backendProcess);
  process.exit(code ?? 0);
});
