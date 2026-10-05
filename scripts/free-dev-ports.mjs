/**
 * Giải phóng port dev (3000 HTTP, 24678 Vite HMR) trước khi npm run dev.
 * Chỉ dừng tiến trình node.exe đang LISTENING — không đụng Chrome/Cursor.
 */
import { execSync } from 'node:child_process';

const PORTS = [3000, 24678];
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

function warnPortsWindows() {
  const busy = [];
  for (const port of PORTS) {
    const pids = Array.from(collectListenerPids(port));
    if (pids.length > 0) {
      busy.push({ port, pids });
    }
  }
  if (busy.length > 0) {
    console.warn('[DEV NOTICE] Các port dev sau đang có tiến trình chiếm giữ (không kill tự động):');
    for (const b of busy) {
      console.warn(`  - Port ${b.port}: PID [${b.pids.join(', ')}]`);
    }
    console.warn('Gợi ý: Nếu cần giải phóng port, vui lòng dừng ứng dụng cũ hoặc chạy: npm run dev:restart\n');
  }
}

function warnPortsUnix() {
  const busy = [];
  for (const port of PORTS) {
    try {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
      if (out) {
        busy.push({ port, pids: out.split('\n') });
      }
    } catch {
      /* port already free */
    }
  }
  if (busy.length > 0) {
    console.warn('[DEV NOTICE] Các port dev sau đang có tiến trình chiếm giữ (không kill tự động):');
    for (const b of busy) {
      console.warn(`  - Port ${b.port}: PID [${b.pids.join(', ')}]`);
    }
    console.warn('Gợi ý: Nếu cần giải phóng port, vui lòng dừng ứng dụng cũ hoặc chạy: npm run dev:restart\n');
  }
}

if (process.platform === 'win32') {
  warnPortsWindows();
} else {
  warnPortsUnix();
}
