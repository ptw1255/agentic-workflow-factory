import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'server'], { stdio: 'inherit' }),
  spawn('npm', ['exec', '--', 'vite'], { stdio: 'inherit' }),
];

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (child.pid !== undefined) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      shutdown('SIGTERM');
      process.exitCode = code ?? 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
