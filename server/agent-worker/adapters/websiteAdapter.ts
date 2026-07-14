import type { Page } from 'playwright';
import { prisma } from '../../prisma';
import type { BrowserManager } from '../browserManager';
import {
  assertSafePublicUrl,
  BROWSER_EXTRACT_SCRIPT,
  isSameDomain,
  normalizeCanonicalUrl,
  normalizeText,
  parseWebsiteConfig,
  resolveLink,
  type ParsedPageContent,
} from '../services/contentNormalizer';
import { saveScannedContent } from '../services/contentRepository';
import { getLeadAnalysisLimits } from '../../agent/leadAnalyzer';
import {
  processFindingForContent,
  resolveRuleSet,
  type AnalysisBudget,
} from '../services/findingRuleEngine';
import type { ScanContext, ScanMetrics, SourceAdapter } from './sourceAdapter';

const SUPPORTED_TYPES = new Set(['website', 'forum']);

export class WebsiteAdapter implements SourceAdapter {
  readonly name = 'website';

  supports(sourceType: string): boolean {
    return SUPPORTED_TYPES.has(sourceType);
  }

  async scan(ctx: ScanContext): Promise<ScanMetrics> {
    const started = Date.now();
    const config = parseWebsiteConfig(ctx.source.config);
    const missionRules = (ctx.mission?.rules || {}) as Record<string, unknown>;
    if (missionRules.maxItemsPerRun !== undefined) {
      const maxItems = Number(missionRules.maxItemsPerRun);
      if (Number.isFinite(maxItems)) {
        config.maxPages = Math.min(25, Math.max(1, Math.floor(maxItems)));
      }
    }
    const rules = resolveRuleSet(ctx.source, ctx.mission);

    const seedUrl = normalizeCanonicalUrl(ctx.source.url);
    assertSafePublicUrl(seedUrl);

    const page = await ctx.browser.getPage({
      source: ctx.source,
      preferredDomain: (() => {
        try {
          return new URL(seedUrl).hostname;
        } catch {
          return undefined;
        }
      })(),
      initialUrl: seedUrl,
    });
    await configurePageRoutes(page);

    const queue: string[] = [seedUrl];
    const visited = new Set<string>();

    let pagesVisited = 0;
    let contentsSeen = 0;
    let contentsInserted = 0;
    let findingsCreated = 0;
    const analysisBudget: AnalysisBudget = {
      used: 0,
      max: getLeadAnalysisLimits().maxPerJob,
    };

    while (queue.length > 0 && pagesVisited < config.maxPages!) {
      const nextUrl = queue.shift()!;
      if (visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      let parsed: ParsedPageContent;
      try {
        parsed = await fetchAndParsePage(page, nextUrl, config.pageTimeoutMs!);
      } catch (error) {
        console.warn(`[website-adapter] Skip ${nextUrl}:`, error instanceof Error ? error.message : error);
        continue;
      }

      pagesVisited += 1;
      contentsSeen += 1;

      const saved = await saveScannedContent({
        companyId: ctx.source.companyId,
        sourceId: ctx.source.id,
        parsed,
        maxContentChars: config.maxContentChars!,
      });

      if (saved?.inserted) {
        contentsInserted += 1;
      }

      if (saved) {
        const finding = await processFindingForContent({
          content: saved.record,
          source: ctx.source,
          mission: ctx.mission,
          rules,
          title: parsed.title,
          analysisBudget,
        });
        if (finding.findingCreated) findingsCreated += 1;
      }

      for (const link of parsed.links.slice(0, config.maxLinksPerPage!)) {
        if (visited.has(link) || queue.includes(link)) continue;
        if (config.sameDomainOnly && !isSameDomain(seedUrl, link)) continue;
        queue.push(link);
      }
    }

    const durationMs = Date.now() - started;
    const nextScanAt = new Date(Date.now() + ctx.source.scanIntervalMinutes * 60_000);

    await prisma.agentSource.update({
      where: { id: ctx.source.id },
      data: {
        lastScannedAt: new Date(),
        nextScanAt,
        lastError: null,
      },
    });

    return {
      pagesVisited,
      contentsSeen,
      contentsInserted,
      findingsCreated,
      durationMs,
    };
  }
}

async function configurePageRoutes(page: Page): Promise<void> {
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (type === 'media' || type === 'font') {
      void route.abort();
      return;
    }
    void route.continue();
  });
}

async function fetchAndParsePage(page: Page, url: string, timeoutMs: number): Promise<ParsedPageContent> {
  assertSafePublicUrl(url);
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });

  const contentType = response?.headers()['content-type'] ?? '';
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error(`Không phải HTML: ${contentType}`);
  }

  const raw = await page.evaluate(BROWSER_EXTRACT_SCRIPT) as {
    title: string;
    canonicalHref: string;
    bodyText: string;
    links: string[];
    publishedAt: string | null;
  };

  const canonicalUrl = raw.canonicalHref
    ? resolveLink(url, raw.canonicalHref) ?? url
    : url;

  const links = raw.links
    .map(href => resolveLink(url, href))
    .filter((link): link is string => Boolean(link));

  return {
    title: raw.title || 'Untitled',
    canonicalUrl: normalizeCanonicalUrl(canonicalUrl),
    bodyText: normalizeText(raw.bodyText),
    links: [...new Set(links)],
    publishedAt: raw.publishedAt,
  };
}

export const websiteAdapter = new WebsiteAdapter();
