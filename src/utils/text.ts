export function toPlainText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateText(value: string, maxLength = 155) {
  const cleanValue = toPlainText(value);
  return cleanValue.length > maxLength
    ? `${cleanValue.slice(0, maxLength - 3).trim()}...`
    : cleanValue;
}
