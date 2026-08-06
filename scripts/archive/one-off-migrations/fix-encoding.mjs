import fs from 'fs';
import path from 'path';

const MOJIBAKE = /Ã|â€|Ä|Æ|áº|á»|Ä'|mÂ²|tá»·|cÄ|BÄ|CÄ|PhÃ|LiÃ|KhÃ|ChÃ|Gá»|Má»|Vui l|DÆ|HÆ|LÃ|GiÃ|nhÃ|thuÃ|tÃ¬|sá»|hoáº|biá»|trá»|lá»|Vá»|Táº|Dá»|Káº|Em ch|Chia s|Gá»i|LiÃªn|Liên há»|cĒn/;

function hasMojibake(value) {
  return MOJIBAKE.test(value);
}

function fixText(value) {
  if (!hasMojibake(value)) return value;
  const fixed = Buffer.from(value, 'latin1').toString('utf8');
  return fixed.includes('\uFFFD') ? value : fixed;
}

function fixLine(line) {
  if (!hasMojibake(line)) return line;

  // Fix single-quoted strings
  let result = line.replace(/'([^'\\]|\\.)*'/g, (match) => {
    const inner = match.slice(1, -1);
    if (!hasMojibake(inner)) return match;
    return `'${fixText(inner)}'`;
  });

  // Fix double-quoted strings
  result = result.replace(/"([^"\\]|\\.)*"/g, (match) => {
    const inner = match.slice(1, -1);
    if (!hasMojibake(inner)) return match;
    return `"${fixText(inner)}"`;
  });

  // Fix template literal static segments (simple lines without ${})
  if (result.includes('`') && !result.includes('${')) {
    result = result.replace(/`([^`\\]|\\.)*`/g, (match) => {
      const inner = match.slice(1, -1);
      if (!hasMojibake(inner)) return match;
      return `\`${fixText(inner)}\``;
    });
  }

  // Fix remaining mojibake outside strings (e.g. regex)
  if (hasMojibake(result)) {
    result = fixText(result);
  }

  return result;
}

function resolveMergeConflicts(content) {
  return content.replace(
    /<<<<<<< Updated upstream\r?\n=======\r?\n([\s\S]*?)>>>>>>> Stashed changes\r?\n/g,
    (_, kept) => kept
  );
}

const target = path.resolve('src/ListingsPage.tsx');
let content = fs.readFileSync(target, 'utf8');
content = resolveMergeConflicts(content);
const output = content.split(/\r?\n/).map(fixLine).join('\n');
fs.writeFileSync(target, output, 'utf8');

const mojibakeLeft = (output.match(MOJIBAKE) || []).length;
console.log(`Fixed ${target}, mojibake patterns left: ${mojibakeLeft}`);
