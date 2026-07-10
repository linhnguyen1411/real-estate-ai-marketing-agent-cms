import fs from 'fs';
import path from 'path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { WorkerConfig } from './config';

export class BrowserManager {
  private context: BrowserContext | null = null;
  private readonly config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  get profilePath(): string {
    return this.config.profileDir;
  }

  async launch(): Promise<BrowserContext> {
    if (this.context) return this.context;

    fs.mkdirSync(this.config.profileDir, { recursive: true });

    this.context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless: this.config.headless,
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
    });

    return this.context;
  }

  async getPage(): Promise<Page> {
    const context = await this.launch();
    const page = context.pages()[0] ?? (await context.newPage());
    return page;
  }

  async currentUrl(): Promise<string | null> {
    if (!this.context) return null;
    const page = this.context.pages()[0];
    return page?.url() ?? null;
  }

  async visitUrl(url: string): Promise<{ title: string; currentUrl: string }> {
    const page = await this.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const title = await page.title();
    return { title, currentUrl: page.url() };
  }

  async close(): Promise<void> {
    if (!this.context) return;
    await this.context.close();
    this.context = null;
  }
}

/** Headed login helper — opens profile dir without starting the worker loop. */
export async function openLoginBrowser(profileDir: string): Promise<BrowserContext> {
  fs.mkdirSync(profileDir, { recursive: true });
  const startUrl = process.env.AGENT_LOGIN_START_URL?.trim() || 'https://www.facebook.com/';

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  console.log('');
  console.log('=== AI Agent Login Browser ===');
  console.log(`Profile: ${path.resolve(profileDir)}`);
  console.log('Đăng nhập thủ công trong cửa sổ Chromium. Không lưu mật khẩu vào DB.');
  console.log('Đóng cửa sổ browser hoặc nhấn Ctrl+C khi xong.');
  console.log('');

  return context;
}
