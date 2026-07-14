import 'dotenv/config';
import { chromium } from 'playwright';
import {
  AGENT_BROWSER_CHANNEL,
  loadWorkerConfig,
  resolveAgentBrowserProfileDir,
} from './config';

/**
 * Managed-mode login only.
 * Opens Google Chrome with a dedicated persistent profile.
 * User logs in manually — no autofill of credentials or 2FA.
 */
async function main(): Promise<void> {
  const config = loadWorkerConfig();
  if (config.browserMode === 'cdp') {
    console.log('[agent-login] AGENT_BROWSER_MODE=cdp — login script is for managed mode only.');
    console.log('For Facebook CDP:');
    console.log('  1. Start Chrome with --remote-debugging-port=9222 and a dedicated --user-data-dir');
    console.log('  2. Log in to Facebook manually in that Chrome window');
    console.log('  3. Keep Chrome open and run: npm run agent:check-facebook-session');
    console.log('See docs/AI-AGENT-BROWSER-MODES.md');
    process.exit(0);
  }

  const profileDir = resolveAgentBrowserProfileDir();
  const startUrl = process.env.AGENT_LOGIN_START_URL?.trim() || 'https://www.facebook.com/';

  console.log('[agent-login] Managed mode — Google Chrome persistent profile');
  console.log(`  profilePath: ${profileDir}`);
  console.log(`  channel:     ${AGENT_BROWSER_CHANNEL}`);
  console.log('  headless:    false');
  console.log('  No autofill. Log in manually, then close the window to flush the session.');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: AGENT_BROWSER_CHANNEL,
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
    locale: 'vi-VN',
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log(`  currentUrl:  ${page.url()}`);
  console.log('Đóng cửa sổ Chrome khi xong (cookie flush). Ctrl+C cũng đóng context sạch.');

  await new Promise<void>(resolve => {
    context.on('close', () => resolve());
    const onSignal = () => {
      void context.close().finally(() => resolve());
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });

  console.log('[agent-login] Browser closed. Session (if any) is in the profile dir (gitignored).');
  console.log(`[agent-login] profilePath: ${profileDir}`);
  console.log('[agent-login] Next: npm run agent:check-facebook-session  (or switch to CDP for Facebook)');
}

main().catch(error => {
  console.error('[agent-login] Fatal:', error);
  process.exit(1);
});
