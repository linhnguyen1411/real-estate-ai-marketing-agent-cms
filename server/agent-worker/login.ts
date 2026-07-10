import 'dotenv/config';
import path from 'path';
import { loadWorkerConfig } from './config';
import { openLoginBrowser } from './browserManager';

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const profileDir = path.resolve(config.profileDir);

  console.log('[agent-login] Mở Chromium headed để đăng nhập thủ công...');

  const context = await openLoginBrowser(profileDir);

  await new Promise<void>(resolve => {
    context.on('close', () => resolve());
    process.on('SIGINT', () => {
      void context.close().finally(() => resolve());
    });
    process.on('SIGTERM', () => {
      void context.close().finally(() => resolve());
    });
  });

  console.log('[agent-login] Đã đóng. Session cookies nằm trong profile dir (gitignored).');
}

main().catch(error => {
  console.error('[agent-login] Fatal:', error);
  process.exit(1);
});
