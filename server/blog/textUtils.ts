export function slugifyTag(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugifyTitle(title: string) {
  return slugifyTag(title);
}

export function countWords(text: string) {
  return text
    .replace(/[#*_\[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function estimateReadingTime(wordCount: number) {
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/^---[\s\S]*?---\n?/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
