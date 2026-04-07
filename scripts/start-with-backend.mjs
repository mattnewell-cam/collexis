import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const repoRoot = process.cwd();
const nextBin = join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const runtimeRoot = join(repoRoot, 'runtime');
const defaultVenvDir = join(runtimeRoot, 'venvs', 'collexis');
const defaultPycacheDir = join(runtimeRoot, 'pycache');
const nextPort = process.env.PORT || '3000';
const nextHost = process.env.NEXT_HOST || process.env.HOST || '0.0.0.0';

function resolveRepoPath(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

const venvDir = resolveRepoPath(process.env.COLLEXIS_RUNTIME_VENV_DIR, defaultVenvDir);
const pythonExecutable = process.platform === 'win32'
  ? join(venvDir, 'Scripts', 'python.exe')
  : join(venvDir, 'bin', 'python');
const pythonEnv = {
  ...process.env,
  PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX ?? resolveRepoPath(process.env.COLLEXIS_PYTHON_PYCACHE_DIR, defaultPycacheDir),
};

if (!existsSync(pythonExecutable)) {
  console.error('Python runtime is not prepared. Run the project build first so the backend virtualenv is created.');
  process.exit(1);
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

async function waitForBackendReady() {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:8000/health', { cache: 'no-store' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the deadline.
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for the local Python backend on 127.0.0.1:8000.');
}

const backendProcess = spawn(
  pythonExecutable,
  ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: pythonEnv,
  },
);

backendProcess.on('exit', code => {
  if (!nextProcess) {
    process.exit(code ?? 1);
  }
  terminate(nextProcess);
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    terminate(backendProcess);
    terminate(nextProcess);
  });
}

let nextProcess;

try {
  await waitForBackendReady();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The Python backend failed to start.');
  terminate(backendProcess);
  process.exit(1);
}

nextProcess = spawn(
  process.execPath,
  [nextBin, 'start', '-p', nextPort, '-H', nextHost],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

nextProcess.on('exit', code => {
  terminate(backendProcess);
  process.exit(code ?? 0);
});
