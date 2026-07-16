import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface PublishEvidenceBundle {
  publishJobId: string;
  missionRunId: string;
  workerId?: string | null;
  browserSessionId?: string | null;
  destinationKey?: string | null;
  durationMs: number;
  publishedUrl?: string | null;
  domHash?: string | null;
  screenshotBeforePath?: string | null;
  screenshotAfterPath?: string | null;
  htmlSnapshotPath?: string | null;
  capturedAt: string;
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
export async function writePublishEvidenceManifest(
  attemptId: string,
  bundle: PublishEvidenceBundle,
): Promise<PublishEvidenceBundle> {
  const paths = buildEvidencePaths(bundle.publishJobId, attemptId);
  await fs.mkdir(paths.baseDir, { recursive: true });

  const record: PublishEvidenceBundle = {
    ...bundle,
    screenshotBeforePath: bundle.screenshotBeforePath ?? paths.screenshotBeforePath,
    screenshotAfterPath: bundle.screenshotAfterPath ?? paths.screenshotAfterPath,
    htmlSnapshotPath: bundle.htmlSnapshotPath ?? paths.htmlSnapshotPath,
    capturedAt: bundle.capturedAt || new Date().toISOString(),
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
