export function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractHeadings(content: string) {
  return [...content.matchAll(/^## (.+)$/gm)].map(match => {
    const text = match[1].trim();
    return { id: slugifyHeading(text), text };
  }).filter(item => item.text.toLowerCase() !== 'mục lục');
}
