import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { normalizeSocialLinks } from '../../link-normalization';
import { isMobileFriendlyUrl } from '../../link-normalization';

export interface PublishEvidenceBundle {
  publishJobId: string;
  missionRunId: string;
  workerId?: string | null;
  browserSessionId?: string | null;
  destinationKey?: string | null;
  durationMs: number;
  publishedUrl?: string | null;
  /** Normalized permalink metadata (link-normalization module). */
  postId?: string | null;
  postUrl?: string | null;
  groupId?: string | null;
  groupUrl?: string | null;
  canonicalUrl?: string | null;
  verified?: boolean;
  mobileVerified?: boolean;
  domHash?: string | null;
  screenshotBeforePath?: string | null;
  screenshotAfterPath?: string | null;
  htmlSnapshotPath?: string | null;
  capturedAt: string;
  /** Browser Action Framework (comment/reply/…); optional for publish-only runs. */
  actionKey?: string | null;
  result?: string | null;
  error?: string | null;
}

const RUNTIME_ROOT = path.resolve(process.cwd(), 'runtime', 'publish-evidence');

export function getPublishEvidenceRoot(): string {
  return RUNTIME_ROOT;
}

export function getEvidenceDirForJob(publishJobId: string): string {
  return path.join(RUNTIME_ROOT, publishJobId);
}

export function hashDomContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim().slice(0, 50_000);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function buildEvidencePaths(publishJobId: string, attemptId: string) {
  const base = path.join(getEvidenceDirForJob(publishJobId), attemptId);
  return {
    baseDir: base,
    manifestPath: path.join(base, 'manifest.json'),
    screenshotBeforePath: path.join(base, 'screenshot-before.png'),
    screenshotAfterPath: path.join(base, 'screenshot-after.png'),
    htmlSnapshotPath: path.join(base, 'composer.html'),
  };
}

/**
 * Persist evidence manifest under runtime/publish-evidence/{jobId}/{attemptId}/.
 * Screenshot/HTML files are placeholders in foundation phase (paths only).
 */
/** Enrich evidence with normalized post/group permalinks (no browser calls). */
export function enrichPublishEvidenceLinks(
  bundle: PublishEvidenceBundle,
): PublishEvidenceBundle {
  const links = normalizeSocialLinks({
    publishedUrl: bundle.publishedUrl,
    postUrl: bundle.postUrl || bundle.publishedUrl,
    groupUrl: bundle.groupUrl,
    postId: bundle.postId,
    groupId: bundle.groupId,
    canonicalUrl: bundle.canonicalUrl || bundle.publishedUrl,
  });
  const openUrl = links.postUrl || links.groupUrl || bundle.publishedUrl || null;
  return {
    ...bundle,
    publishedUrl: openUrl || bundle.publishedUrl || null,
    postId: links.postId ?? bundle.postId ?? null,
    postUrl: links.postUrl ?? bundle.postUrl ?? null,
    groupId: links.groupId ?? bundle.groupId ?? null,
    groupUrl: links.groupUrl ?? bundle.groupUrl ?? null,
    canonicalUrl: links.canonicalUrl ?? bundle.canonicalUrl ?? openUrl,
    verified: bundle.verified ?? Boolean(links.postUrl || links.groupUrl),
    mobileVerified: bundle.mobileVerified ?? isMobileFriendlyUrl(openUrl),
  };
}

export async function writePublishEvidenceManifest(
  attemptId: string,
  bundle: PublishEvidenceBundle,
): Promise<PublishEvidenceBundle> {
  const paths = buildEvidencePaths(bundle.publishJobId, attemptId);
  await fs.mkdir(paths.baseDir, { recursive: true });

  const enriched = enrichPublishEvidenceLinks(bundle);
  const record: PublishEvidenceBundle = {
    ...enriched,
    screenshotBeforePath: enriched.screenshotBeforePath ?? paths.screenshotBeforePath,
    screenshotAfterPath: enriched.screenshotAfterPath ?? paths.screenshotAfterPath,
    htmlSnapshotPath: enriched.htmlSnapshotPath ?? paths.htmlSnapshotPath,
    capturedAt: enriched.capturedAt || new Date().toISOString(),
  };

  await fs.writeFile(paths.manifestPath, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export async function readPublishEvidenceManifest(
  publishJobId: string,
  attemptId: string,
): Promise<PublishEvidenceBundle | null> {
  const paths = buildEvidencePaths(publishJobId, attemptId);
  try {
    const raw = await fs.readFile(paths.manifestPath, 'utf8');
    return JSON.parse(raw) as PublishEvidenceBundle;
  } catch {
    return null;
  }
}

/** List evidence attempt folders for a publish job (UI history). */
export async function listPublishEvidenceForJob(publishJobId: string): Promise<
  Array<{
    attemptId: string;
    manifest: PublishEvidenceBundle | null;
    paths: {
      manifestPath: string;
      screenshotBeforePath: string;
      screenshotAfterPath: string;
      htmlSnapshotPath: string;
    };
    files: {
      hasScreenshotBefore: boolean;
      hasScreenshotAfter: boolean;
      hasHtmlSnapshot: boolean;
    };
  }>
> {
  const dir = getEvidenceDirForJob(publishJobId);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const results: Array<{
    attemptId: string;
    manifest: PublishEvidenceBundle | null;
    paths: {
      manifestPath: string;
      screenshotBeforePath: string;
      screenshotAfterPath: string;
      htmlSnapshotPath: string;
    };
    files: {
      hasScreenshotBefore: boolean;
      hasScreenshotAfter: boolean;
      hasHtmlSnapshot: boolean;
    };
  }> = [];

  for (const attemptId of entries) {
    const paths = buildEvidencePaths(publishJobId, attemptId);
    let isDir = false;
    try {
      const st = await fs.stat(paths.baseDir);
      isDir = st.isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const manifest = await readPublishEvidenceManifest(publishJobId, attemptId);
    const fileExists = async (p: string) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    };

    results.push({
      attemptId,
      manifest,
      paths: {
        manifestPath: paths.manifestPath,
        screenshotBeforePath: paths.screenshotBeforePath,
        screenshotAfterPath: paths.screenshotAfterPath,
        htmlSnapshotPath: paths.htmlSnapshotPath,
      },
      files: {
        hasScreenshotBefore: await fileExists(paths.screenshotBeforePath),
        hasScreenshotAfter: await fileExists(paths.screenshotAfterPath),
        hasHtmlSnapshot: await fileExists(paths.htmlSnapshotPath),
      },
    });
  }

  return results.sort((a, b) => a.attemptId.localeCompare(b.attemptId));
}

export function createStubEvidenceBundle(input: {
  publishJobId: string;
  missionRunId: string;
  workerId?: string | null;
  browserSessionId?: string | null;
  destinationKey?: string | null;
  durationMs?: number;
}): PublishEvidenceBundle {
  return {
    publishJobId: input.publishJobId,
    missionRunId: input.missionRunId,
    workerId: input.workerId ?? null,
    browserSessionId: input.browserSessionId ?? null,
    destinationKey: input.destinationKey ?? null,
    durationMs: input.durationMs ?? 0,
    publishedUrl: null,
    domHash: hashDomContent(`stub:${input.publishJobId}`),
    capturedAt: new Date().toISOString(),
  };
}
