function normalizedLabel(label) {
  return String(label || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function tocSlug(label) {
  return normalizedLabel(label)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildTocEntries(headings) {
  const used = new Map();
  const entries = [];

  for (const [index, heading] of headings.entries()) {
    const label = normalizedLabel(heading.label);
    if (!label) continue;

    const requestedId = String(heading.id || "").trim();
    const slug = tocSlug(label) || `section-${index + 1}`;
    const baseId = requestedId || `kamelog-toc-${slug}`;
    const seen = used.get(baseId) || 0;
    used.set(baseId, seen + 1);

    entries.push({
      id: seen === 0 ? baseId : `${baseId}-${seen + 1}`,
      label,
      level: Number(heading.level),
    });
  }

  return entries;
}
