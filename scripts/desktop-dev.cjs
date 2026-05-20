const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rendererUrl = 'http://127.0.0.1:5173';
const childProcesses = new Set();
let shuttingDown = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPort = async (port, host, timeoutMs = 60000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const isOpen = await new Promise((resolve) => {
      const socket = net.createConnection({ port, host });

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (isOpen) return;
    await wait(1000);
  }

  throw new Error(`Timeout en attendant ${host}:${port}`);
};

const terminateChild = (child) => {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of childProcesses) terminateChild(child);

  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
};

const spawnScript = (label, scriptName, extraEnv = {}) => {
  const child = spawn(npmCommand, ['run', scriptName], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: false,
  });

  childProcesses.add(child);

  child.on('exit', (code, signal) => {
    childProcesses.delete(child);
    if (shuttingDown) return;

    if (label === 'electron') {
      shutdown(code ?? 0);
      return;
    }

    if (code !== 0) {
      console.error(`${label} s'est arrete avec le code ${code ?? 'null'}${signal ? ` (${signal})` : ''}.`);
      shutdown(code ?? 1);
    }
  });

  return child;
};

const main = async () => {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  spawnScript('backend', 'start:backend');
  await waitForPort(5000, '127.0.0.1');

  spawnScript('frontend', 'dev:web');
  await waitForPort(5173, '127.0.0.1');

  spawnScript('electron', 'electron', {
    ELECTRON_RENDERER_URL: rendererUrl,
  });
};

main().catch((error) => {
  console.error('Impossible de lancer le mode desktop:', error.message);
  shutdown(1);
});
