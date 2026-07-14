#!/usr/bin/env node
/**
 * Check Facebook session using configured browser mode (managed or cdp).
 * Never prints cookies, passwords, or storage.
 *
 * Usage: npm run agent:check-facebook-session
 */
import 'dotenv/config';
import {
  AGENT_BROWSER_CHANNEL,
  loadWorkerConfig,
  parseAndSanitizeCdpEndpoint,
} from '../server/agent-worker/config.ts';
import { openBrowserConnection } from '../server/agent-worker/agentBrowserConnection.ts';
import { probeFacebookSessionState } from '../server/agent-worker/facebook/facebookCheckpointDetector.ts';

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  // Facebook session check prefers CDP when endpoint is set, else managed.
  const mode =
    process.env.AGENT_BROWSER_MODE?.trim() === 'managed'
      ? 'managed'
      : process.env.AGENT_CDP_ENDPOINT?.trim() || config.browserMode === 'cdp'
        ? 'cdp'
        : 'managed';

  console.log('[check-facebook-session]');
  console.log(`  browserMode: ${mode}`);

  if (mode === 'cdp') {
    const endpoint = config.cdpEndpoint ?? parseAndSanitizeCdpEndpoint(process.env.AGENT_CDP_ENDPOINT);
    console.log(`  cdpHost:     ${endpoint.host}`);
    console.log(`  cdpPort:     ${endpoint.port}`);
  } else {
    console.log(`  channel:     ${AGENT_BROWSER_CHANNEL}`);
    console.log(`  profilePath: ${config.profileDir}`);
  }

  const conn = await openBrowserConnection(mode, {
    ...config,
    browserMode: mode,
    cdpEndpoint:
      mode === 'cdp'
        ? config.cdpEndpoint ?? parseAndSanitizeCdpEndpoint(process.env.AGENT_CDP_ENDPOINT)
        : config.cdpEndpoint,
    headless: false,
  });

  try {
    const page = await conn.getOrCreatePage({
      preferredDomain: 'facebook.com',
      initialUrl: 'https://www.facebook.com/',
    });
    await page.waitForTimeout(1500);
    const probe = await probeFacebookSessionState(page);

    const report = {
      browserMode: mode,
      channel: mode === 'managed' ? AGENT_BROWSER_CHANNEL : undefined,
      cdpHost: mode === 'cdp' ? (config.cdpEndpoint?.host ?? '127.0.0.1') : undefined,
      cdpPort: mode === 'cdp' ? (config.cdpEndpoint?.port ?? 9222) : undefined,
      currentUrl: probe.currentUrl,
      title: probe.title,
      detectedState: probe.detectedState,
      loggedIn: probe.loggedIn,
    };

    console.log('\n=== Facebook session check ===');
    console.log(JSON.stringify(report, null, 2));

    if (!probe.loggedIn) {
      console.error(`\n[check-facebook-session] Not logged_in (${probe.detectedState}).`);
      if (mode === 'cdp') {
        console.error('Log in manually in the CDP Chrome window, then re-run this check.');
      } else {
        console.error('Run npm run agent:login (managed) or switch to CDP for Facebook.');
      }
      await conn.shutdown();
      process.exit(2);
    }

    console.log('\n[check-facebook-session] OK — logged_in');
    await conn.shutdown();
    process.exit(0);
  } catch (innerError) {
    await conn.shutdown().catch(() => undefined);
    throw innerError;
  }
}

main().catch(error => {
  console.error(
    '[check-facebook-session] Fatal:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
