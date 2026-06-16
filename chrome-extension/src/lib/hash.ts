export function normalizeForHash(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200).toLowerCase();
}

export function makePostHash(phone: string, text: string): string {
  const base = `${phone}|${normalizeForHash(text)}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

export function makeArticleHash(text: string): string {
  return makePostHash('', text);
}
