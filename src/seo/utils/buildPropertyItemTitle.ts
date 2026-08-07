/**
 * SEO property item title formula for bdsdanang.site:
 * [Property Type] + [Project Name/Location] + "Đà Nẵng" + [Highlight]
 *
 * Examples:
 * - "Căn 2PN Sun Symphony" → "Căn Hộ 2 Phòng Ngủ Sun Symphony Residence Đà Nẵng - View Sông Hàn"
 * - "Shophouse Cora" → "Shophouse Khối Đế Cora Tower Đà Nẵng - Tâm Điểm Nam Hòa Xuân"
 */

export type PropertyTitleInput = {
  title?: string | null;
  type?: string | null;
  project_name?: string | null;
  location?: string | null;
  selling_points?: string[] | null;
  /** Optional explicit highlight override */
  highlight?: string | null;
};

const PROJECT_CANONICAL: Array<{ match: RegExp; name: string }> = [
  { match: /sun\s*symphony|symphony/i, name: 'Sun Symphony Residence' },
  { match: /sun\s*cosmo|cosmo/i, name: 'Sun Cosmo' },
  { match: /sun\s*ponte|ponte/i, name: 'Sun Ponte' },
  { match: /\bcora\b/i, name: 'Cora Tower' },
  { match: /spana/i, name: 'Spana Tower' },
  { match: /s[\s-]?light/i, name: 'S Light Tower' },
  { match: /four\s*s|fours/i, name: 'Sun FourS' },
  { match: /nam\s*h[oò]a\s*xu[aâ]n/i, name: 'Nam Hòa Xuân' },
  { match: /h[oò]a\s*xu[aâ]n/i, name: 'Hòa Xuân' },
  { match: /mai\s*đăng\s*chơn|mai\s*dang\s*chon/i, name: 'Mai Đăng Chơn' },
];

function compact(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function haystackOf(input: PropertyTitleInput): string {
  return [input.title, input.type, input.project_name, input.location, ...(input.selling_points || [])]
    .filter(Boolean)
    .join(' ');
}

function expandRoomToken(title: string): string {
  return title
    .replace(/\b(\d+)\s*PN\b/gi, '$1 Phòng Ngủ')
    .replace(/\b(\d+)\s*WC\b/gi, '$1 WC')
    .replace(/\bcăn\s+(\d+)\s+phòng\s+ngủ/gi, 'Căn Hộ $1 Phòng Ngủ')
    .replace(/\bcăn\s+(\d+)\b/gi, 'Căn Hộ $1');
}

function resolvePropertyType(input: PropertyTitleInput): string {
  const hay = haystackOf(input).toLowerCase();
  const type = compact(input.type).toLowerCase();

  if (type.includes('shophouse') || /shophouse|shop\s*house|khối\s*đế|khoi\s*de/.test(hay)) {
    return 'Shophouse Khối Đế';
  }
  if (type.includes('căn') || type.includes('can') || /\bcăn\b|\bcan\s*ho\b|\b\d+\s*pn\b/.test(hay)) {
    return 'Căn Hộ';
  }
  if (type.includes('đất') || type.includes('dat') || /đất\s*nền|dat\s*nen/.test(hay)) {
    return 'Đất Nền';
  }
  if (type.includes('nhà') || type.includes('nha') || /nhà\s*phố|nha\s*pho/.test(hay)) {
    return 'Nhà Phố';
  }
  if (type.includes('biệt') || /biệt\s*thự|biet\s*thu/.test(hay)) {
    return 'Biệt Thự';
  }
  return compact(input.type) || 'Bất Động Sản';
}

function resolveProjectOrLocation(input: PropertyTitleInput): string {
  const fromProject = compact(input.project_name);
  const blob = [fromProject, compact(input.title), compact(input.location)].join(' ');

  for (const entry of PROJECT_CANONICAL) {
    if (entry.match.test(blob)) return entry.name;
  }

  if (fromProject) return fromProject;

  const loc = compact(input.location);
  if (loc) {
    const first = loc.split(',')[0]?.trim() || loc;
    if (!/đà\s*nẵng|da\s*nang/i.test(first)) return first;
  }

  return '';
}

function defaultHighlight(input: PropertyTitleInput, typeLabel: string, project: string): string {
  const explicit = compact(input.highlight);
  if (explicit) return explicit;

  const points = (input.selling_points || []).map(compact).filter(Boolean);
  if (points[0]) return points[0];

  const hay = haystackOf(input).toLowerCase();
  if (/sông\s*hàn|song\s*han|view\s*sông/.test(hay) || /symphony|s\s*light|spana/i.test(project)) {
    return 'View Sông Hàn';
  }
  if (/cora|nam\s*hòa\s*xuân|hòa\s*xuân|khối\s*đế/i.test(hay) || typeLabel.includes('Shophouse')) {
    return 'Tâm Điểm Nam Hòa Xuân';
  }
  if (/đất|dat|hòa\s*xuân|mai\s*đăng/.test(hay)) {
    return 'Pháp Lý Rõ · Tiềm Năng Tăng Giá';
  }
  return 'Cơ Hội Đầu Tư';
}

function stripRedundantParts(body: string, typeLabel: string, project: string): string {
  let next = expandRoomToken(body);

  // Drop leading type duplicates already represented by typeLabel
  const typePatterns = [
    /^căn\s*hộ\s*/i,
    /^can\s*ho\s*/i,
    /^shophouse(\s*khối\s*đế)?\s*/i,
    /^đất\s*nền\s*/i,
    /^nhà\s*phố\s*/i,
    /^biệt\s*thự\s*/i,
  ];
  for (const pattern of typePatterns) {
    next = next.replace(pattern, '');
  }

  if (project) {
    const projectStripped = next
      .replace(new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
      .replace(/\bsun\s*symphony(\s*residence)?\b/gi, ' ')
      .replace(/\bcora(\s*tower)?\b/gi, ' ')
      .replace(/\bđà\s*nẵng\b|\bda\s*nang\b/gi, ' ');
    next = projectStripped;
  } else {
    next = next.replace(/\bđà\s*nẵng\b|\bda\s*nang\b/gi, ' ');
  }

  return compact(next);
}

/**
 * Build (or upgrade) a property listing title to the SEO item formula.
 * If the incoming title already looks complete, keep its substance and only fill gaps.
 */
export function buildPropertyItemTitle(input: PropertyTitleInput): string {
  const typeLabel = resolvePropertyType(input);
  const project = resolveProjectOrLocation(input);
  const highlight = defaultHighlight(input, typeLabel, project);
  const rawTitle = compact(input.title);

  const alreadyRich =
    rawTitle.length >= 40 ||
    (rawTitle.length >= 28 &&
      /đà\s*nẵng|da\s*nang/i.test(rawTitle) &&
      (rawTitle.includes(' - ') || rawTitle.includes(' – ')));

  if (alreadyRich) return rawTitle;

  const remnant = stripRedundantParts(rawTitle, typeLabel, project);
  const middle = [remnant, project].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const core = [typeLabel, middle, 'Đà Nẵng'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const withHighlight = highlight ? `${core} - ${highlight}` : core;

  return compact(withHighlight);
}

/** True when a stored title is too weak for public SEO display. */
export function isWeakPropertyTitle(title: string | null | undefined): boolean {
  const value = compact(title);
  if (!value) return true;
  // Long marketing/copy titles — never auto-rewrite (even without "Đà Nẵng")
  if (value.length >= 40) return false;
  // Short stubs: "Căn 2PN Sun Symphony", "Shophouse Cora"
  if (value.length < 28) return true;
  if (!/đà\s*nẵng|da\s*nang/i.test(value)) return true;
  return false;
}

/**
 * Prefer stored title when already SEO-rich; otherwise apply the formula.
 */
export function resolvePropertyItemTitle(input: PropertyTitleInput): string {
  const stored = compact(input.title);
  if (!isWeakPropertyTitle(stored)) return stored;
  return buildPropertyItemTitle(input);
}
