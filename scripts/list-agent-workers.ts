/**
 * List live agent:worker process trees (Windows).
 * Usage: npx tsx scripts/list-agent-workers.ts
 */
import { execSync } from 'node:child_process';
import os from 'node:os';

function main() {
  if (os.platform() !== 'win32') {
    console.log('Windows-only helper');
    return;
  }
  const raw = execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Depth 3"',
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const rows = JSON.parse(raw || '[]');
  const list = Array.isArray(rows) ? rows : [rows];
  const workers = list.filter(
    (p: { CommandLine?: string }) =>
      typeof p.CommandLine === 'string' &&
      /agent:worker|agent-worker[\\/]index/.test(p.CommandLine),
  );
  console.log(
    JSON.stringify(
      {
        hostname: os.hostname(),
        workerProcessCount: workers.length,
        note:
          workers.length > 2
            ? 'Likely duplicate workers (npm + tsx + node per tree ≈ 3 procs)'
            : 'ok-ish',
        processes: workers.map((p: { ProcessId: number; ParentProcessId: number; CommandLine: string }) => ({
          pid: p.ProcessId,
          ppid: p.ParentProcessId,
          cmd: p.CommandLine.slice(0, 180),
        })),
      },
      null,
      2,
    ),
  );
}

main();
