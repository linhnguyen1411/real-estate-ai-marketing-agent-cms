/**
 * Parse console command lines: "/health", "report today", "scan start <id>"
 */

export type ParsedCommand = {
  name: string;
  args: string[];
  raw: string;
};

export function parseCommandLine(input: string): ParsedCommand {
  const raw = String(input || '').trim();
  const withoutSlash = raw.replace(/^\/+/, '');
  const parts = withoutSlash.split(/\s+/).filter(Boolean);
  const name = (parts[0] || '').toLowerCase();
  return { name, args: parts.slice(1), raw };
}
