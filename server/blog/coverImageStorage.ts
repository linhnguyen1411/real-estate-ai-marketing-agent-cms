import { saveImageFromDataUrl } from './imageStorage';

/** @deprecated Use saveImageFromDataUrl — kept for existing imports */
export function ensureBlogCoverDir(): void {
  // no-op; saveImageFromDataUrl creates dir on demand
}

export function saveBlogCoverFromDataUrl(dataUrl: string, basename?: string): string {
  return saveImageFromDataUrl(dataUrl, 'blog-covers', basename);
}
