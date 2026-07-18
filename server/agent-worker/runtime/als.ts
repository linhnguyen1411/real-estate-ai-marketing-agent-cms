import { AsyncLocalStorage } from 'node:async_hooks';
import type { BrowserPurpose } from './types';

export interface RuntimeJobContext {
  jobId: string;
  purpose: BrowserPurpose;
  missionRunId: string | null;
}

export const runtimeJobAls = new AsyncLocalStorage<RuntimeJobContext>();

export function getRuntimeJobContext(): RuntimeJobContext | undefined {
  return runtimeJobAls.getStore();
}
