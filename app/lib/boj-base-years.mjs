// BOJ research workbooks publish each core-CPI measure as separate columns per
// CPI base year (e.g. "2025base" from 2026/01, "2020base" for 2021-2025). The
// y/y rates are official per base and are linked here without rebasing.

const FOUR_DIGIT_BASE = /((?:19|20)\d{2})\s*base/
const TWO_DIGIT_BASE = /(\d{2})\s*年基準/

export function baseYearFromHeader(header) {
  const text = String(header ?? '')
  const full = text.match(FOUR_DIGIT_BASE)
  if (full) return Number(full[1])
  const short = text.match(TWO_DIGIT_BASE)
  if (short) {
    const year = Number(short[1])
    return year >= 50 ? 1900 + year : 2000 + year
  }
  return null
}

export function stripBaseTags(header) {
  return String(header ?? '')
    .replace(/(?:19|20)\d{2}\s*base/g, '')
    .replace(/\d{2}\s*年基準/g, '')
    .replace(/\s*\|\s*(?=\||$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Newer bases take precedence on any overlapping period.
export function spliceBaseSeries(parts, periodRank) {
  const ordered = [...parts].sort((a, b) => a.baseYear - b.baseYear)
  const byDate = new Map()
  for (const part of ordered) {
    for (const point of part.series) byDate.set(point.date, point)
  }
  return [...byDate.values()].sort((a, b) => periodRank(a.date) - periodRank(b.date))
}
