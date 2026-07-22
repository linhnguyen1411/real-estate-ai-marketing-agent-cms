/**
 * Convert draft markdown-ish text to Facebook plain text.
 * FB Timeline does not render markdown — keep structure via newlines / bullets / emoji.
 */

export function markdownToFacebookText(input: string): string {
  let text = String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Code fences → plain
  text = text.replace(/```[\s\S]*?```/g, block =>
    block.replace(/^```\w*\n?/, '').replace(/\n?```$/, ''),
  );

  // Headers → plain lines
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Bold / italic / strike / inline code (order: ** before *)
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/_(.+?)_/g, '$1');
  text = text.replace(/~~(.+?)~~/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');

  // Links [label](url) → label (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Unordered lists
  text = text.replace(/^\s*[-*+]\s+/gm, '• ');

  // Collapse 3+ blank lines to 2 (paragraph spacing)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/** Compare lengths ignoring whitespace (FB innerText vs source). */
export function significantTextLength(input: string): number {
  return String(input || '')
    .replace(/\s+/g, '')
    .length;
}
