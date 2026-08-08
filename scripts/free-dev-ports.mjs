/**
 * Giải phóng port dev (3000 HTTP, 24678 Vite HMR) trước khi npm run dev.
 * Chỉ dừng tiến trình node.exe đang LISTENING — không đụng Chrome/Cursor.
 */
import { execSync } from 'node:child_process';

const PORTS = [3000, 24678, 24679];
const myPid = String(process.pid);

function isNodeProcess(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
    return /node\.exe/i.test(out);
  } catch {
    return false;
  }
}

function collectListenerPids(port) {
  const pids = new Set();
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes('LISTENING')) continue;
      const parts = trimmed.split(/\s+/);
      const pid = parts[parts.length - 1];
      if (!/^\d+$/.test(pid) || pid === '0' || pid === myPid) continue;
      if (!isNodeProcess(pid)) continue;
      pids.add(pid);
    }
  } catch {
    /* port free */
  }
  return pids;
}

function freePortsWindows() {
  const victims = new Set();
  for (const port of PORTS) {
    for (const pid of collectListenerPids(port)) {
      victims.add(pid);
    }
  }
  for (const pid of victims) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  }
  if (victims.size > 0) {
    console.log(`[dev] Đã dừng ${victims.size} tiến trình node chiếm port dev.`);
  }
}

function freePortsUnix() {
  for (const port of PORTS) {
    try {
      execSync(`lsof -ti tcp:${port} -sTCP:LISTEN | grep -v ${myPid} | xargs -r kill -9`, {
        shell: '/bin/bash',
        stdio: 'ignore',
      });
    } catch {
      /* port already free */
    }
  }
}

if (process.platform === 'win32') {
  freePortsWindows();
} else {
  freePortsUnix();
}
