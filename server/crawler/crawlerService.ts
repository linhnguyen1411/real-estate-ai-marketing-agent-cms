import type { CrawlerJob, CrawlerRunSummary, CrawlerTestPreview } from '../../src/types';
import {
  createCustomer,
  createCrawlerResult,
  findCrawlerDuplicate,
  findCrawlerResultByUrl,
  findCustomerByPhone,
  getCrawlerJob,
  saveCrawlerLog,
  updateCrawlerJob
} from '../dbHelper';
import { fetchPublicHtml, isAllowedPublicUrl } from './htmlFetcher';
import {
  extractPhones,
  hasNeedSignal,
  isRssUrl,
  parseGoogleSearchResults,
  parseHtmlPage,
  parseRssFeed
} from './htmlParser';
import { classifyLeadIntent, computeLeadScore, intentLabel } from './leadExtractor';

const MAX_PAGES_PER_JOB = 8;

interface PageCandidate {
  url: string;
  title?: string;
  text?: string;
}

async function discoverSearchUrls(keyword: string): Promise<{ urls: string[]; errors: string[] }> {
  const errors: string[] = [];
  const urls: string[] = [];

  if (!keyword.trim()) return { urls, errors };

  const query = encodeURIComponent(keyword.trim());
  const googleUrl = `https://www.google.com/search?q=${query}&num=10&hl=vi`;

  try {
    const { html } = await fetchPublicHtml(googleUrl);
    const links = parseGoogleSearchResults(html);
    urls.push(...links);
    if (!links.length) {
      errors.push('Google Search không trả kết quả hoặc bị chặn (không bypass captcha).');
    }
  } catch (error: any) {
    errors.push(`Google Search: ${error.message || String(error)}`);
  }

  return { urls: [...new Set(urls)].slice(0, 10), errors };
}

async function discoverFromStartUrl(startUrl: string): Promise<{ candidates: PageCandidate[]; rssUrls: string[]; errors: string[] }> {
  const errors: string[] = [];
  const candidates: PageCandidate[] = [];
  const rssUrls: string[] = [];

  if (!startUrl.trim()) return { candidates, rssUrls, errors };
  if (!isAllowedPublicUrl(startUrl)) {
    errors.push(`start_url không hợp lệ: ${startUrl}`);
    return { candidates, rssUrls, errors };
  }

  try {
    if (isRssUrl(startUrl)) {
      rssUrls.push(startUrl);
      return { candidates, rssUrls, errors };
    }

    const { html, finalUrl } = await fetchPublicHtml(startUrl);
    const parsed = parseHtmlPage(html, finalUrl);
    candidates.push({ url: finalUrl, title: parsed.title, text: parsed.text });
    rssUrls.push(...parsed.rssLinks);

    parsed.links.slice(0, 5).forEach(link => {
      if (isAllowedPublicUrl(link)) candidates.push({ url: link });
    });
  } catch (error: any) {
    errors.push(`start_url: ${error.message || String(error)}`);
  }

  return { candidates, rssUrls: [...new Set(rssUrls)], errors };
}

async function fetchRssItems(rssUrl: string): Promise<{ items: PageCandidate[]; errors: string[] }> {
  const errors: string[] = [];
  try {
    const { html, finalUrl } = await fetchPublicHtml(rssUrl);
    const items = parseRssFeed(html, finalUrl);
    return {
      items: items.map(item => ({ url: item.link, title: item.title, text: item.text })),
      errors
    };
  } catch (error: any) {
    return { items: [], errors: [`RSS ${rssUrl}: ${error.message || String(error)}`] };
  }
}

async function fetchPageCandidate(candidate: PageCandidate): Promise<PageCandidate | null> {
  if (candidate.title && candidate.text) return candidate;
  if (!isAllowedPublicUrl(candidate.url)) return null;

  try {
    const { html, finalUrl } = await fetchPublicHtml(candidate.url);
    const parsed = parseHtmlPage(html, finalUrl);
    return { url: finalUrl, title: parsed.title, text: parsed.text };
  } catch {
    return null;
  }
}

async function collectJobCandidates(job: CrawlerJob, maxPages = MAX_PAGES_PER_JOB) {
  const errors: string[] = [];
  const pageMap = new Map<string, PageCandidate>();

  const startDiscovery = await discoverFromStartUrl(job.start_url);
  errors.push(...startDiscovery.errors);
  startDiscovery.candidates.forEach(c => pageMap.set(c.url, c));

  for (const rssUrl of startDiscovery.rssUrls) {
    const rssResult = await fetchRssItems(rssUrl);
    errors.push(...rssResult.errors);
    rssResult.items.forEach(item => pageMap.set(item.url, item));
  }

  if (pageMap.size < maxPages) {
    const searchDiscovery = await discoverSearchUrls(job.keyword);
    errors.push(...searchDiscovery.errors);
    searchDiscovery.urls.forEach(url => {
      if (!pageMap.has(url)) pageMap.set(url, { url });
    });
  }

  return {
    candidates: Array.from(pageMap.values()).slice(0, maxPages),
    errors
  };
}

function shouldSaveAsLead(phones: string[], text: string) {
  return phones.length > 0 || hasNeedSignal(text);
}

function createLeadFromPage(input: {
  job: CrawlerJob;
  page: PageCandidate;
  phone?: string;
  intent: ReturnType<typeof classifyLeadIntent>;
}) {
  const { job, page, phone, intent } = input;
  const displayPhone = phone || '';
  const leadScore = computeLeadScore(intent, Boolean(displayPhone));

  const customer = createCustomer({
    name: page.title?.slice(0, 80) || `Lead từ ${job.source_name}`,
    phone: displayPhone,
    email: '',
    source: 'crawler',
    budget: 0,
    interested_area: job.keyword || 'Đà Nẵng',
    property_type: 'Khác',
    status: 'new',
    notes: `Nguồn crawler: ${job.source_name}\nURL: ${page.url}\nIntent: ${intentLabel(intent)}`,
    ai_summary: `[Crawler] ${intentLabel(intent)} — ${page.text?.slice(0, 300) || ''}`,
    lead_score: leadScore,
    company_id: job.company_id
  });

  return customer;
}

export async function testCrawlerJob(jobId: string): Promise<CrawlerTestPreview> {
  const job = getCrawlerJob(jobId);
  if (!job) throw new Error('Không tìm thấy crawler job');

  const { candidates, errors } = await collectJobCandidates(job, 1);
  const candidate = candidates[0];

  if (!candidate) {
    return {
      job_id: job.id,
      source_url: job.start_url || '',
      title: '',
      text: '',
      intent: 'unknown',
      would_save: false,
      dry_run: true,
      errors: errors.length ? errors : ['Không tìm được trang public để test (1 trang).']
    };
  }

  const page = await fetchPageCandidate(candidate);
  if (!page || !page.text) {
    return {
      job_id: job.id,
      source_url: candidate.url,
      title: candidate.title || '',
      text: '',
      intent: 'unknown',
      would_save: false,
      dry_run: true,
      errors: [...errors, 'Không đọc được nội dung trang test.']
    };
  }

  const phones = extractPhones(page.text);
  const primaryPhone = phones[0];
  const intent = classifyLeadIntent(`${page.title || ''} ${page.text}`);

  return {
    job_id: job.id,
    source_url: page.url,
    title: page.title || '',
    text: page.text.slice(0, 1500),
    phone: primaryPhone,
    intent,
    would_save: shouldSaveAsLead(phones, page.text),
    dry_run: true,
    errors
  };
}

export async function runCrawlerJob(jobId: string): Promise<CrawlerRunSummary> {
  const job = getCrawlerJob(jobId);
  if (!job) {
    throw new Error('Không tìm thấy crawler job');
  }

  let pagesScanned = 0;
  let newLeads = 0;
  let duplicates = 0;

  const { candidates, errors } = await collectJobCandidates(job);

  for (const candidate of candidates) {
    const page = await fetchPageCandidate(candidate);
    if (!page || !page.text) continue;

    pagesScanned += 1;
    const phones = extractPhones(page.text);
    const primaryPhone = phones[0];

    if (!shouldSaveAsLead(phones, page.text)) continue;

    if (findCrawlerResultByUrl(page.url) || (primaryPhone && findCrawlerDuplicate(primaryPhone, page.url))) {
      duplicates += 1;
      continue;
    }

    const intent = classifyLeadIntent(`${page.title || ''} ${page.text}`);

    let leadId: string | undefined;
    if (primaryPhone) {
      const existingCustomer = findCustomerByPhone(primaryPhone);
      if (existingCustomer) {
        duplicates += 1;
        continue;
      }
      const customer = createLeadFromPage({ job, page, phone: primaryPhone, intent });
      leadId = customer.id;
      newLeads += 1;
    } else if (hasNeedSignal(page.text)) {
      const customer = createLeadFromPage({ job, page, intent });
      leadId = customer.id;
      newLeads += 1;
    }

    try {
      createCrawlerResult({
        job_id: job.id,
        source_name: job.source_name,
        title: page.title || '',
        text: page.text.slice(0, 2000),
        phone: primaryPhone,
        source_url: page.url,
        intent,
        lead_id: leadId,
        company_id: job.company_id
      });
    } catch {
      duplicates += 1;
    }
  }

  const message = `Quét ${pagesScanned} trang, ${newLeads} lead mới, ${duplicates} trùng.`;
  saveCrawlerLog({
    job_id: job.id,
    pages_scanned: pagesScanned,
    new_leads: newLeads,
    duplicates,
    errors,
    message
  });

  updateCrawlerJob(job.id, { last_run_at: new Date().toISOString() });

  return {
    job_id: job.id,
    pages_scanned: pagesScanned,
    new_leads: newLeads,
    duplicates,
    errors,
    message
  };
}

export async function runAllActiveCrawlerJobs() {
  const { getActiveCrawlerJobs } = await import('../dbHelper');
  const jobs = getActiveCrawlerJobs();
  const summaries: CrawlerRunSummary[] = [];

  for (const job of jobs) {
    try {
      summaries.push(await runCrawlerJob(job.id));
    } catch (error: any) {
      summaries.push({
        job_id: job.id,
        pages_scanned: 0,
        new_leads: 0,
        duplicates: 0,
        errors: [error.message || String(error)],
        message: 'Job thất bại'
      });
    }
  }

  return summaries;
}
