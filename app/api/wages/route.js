import { fetchWithRetry } from '../../lib/resilient-fetch.js'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

function normDig(s) {
  return String(s ?? '').replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
}

function urlParts(year, month) {
  return {
    rr: String(year - 2018).padStart(2, '0'),
    yy: String(year % 100).padStart(2, '0'),
    mm: String(month).padStart(2, '0'),
  }
}

function prevMo(year, month) {
  const m = month - 1 || 12
  return { year: m === 12 ? year - 1 : year, month: m }
}

async function tryFetch(year, month, table, suffix) {
  const { rr, yy, mm } = urlParts(year, month)
  const url = `https://www.mhlw.go.jp/toukei/itiran/roudou/monthly/r${rr}/${yy}${mm}${suffix}/xls/${yy}${mm}${table}${suffix}.xlsx`
  const res = await fetchWithRetry(url, { next: { revalidate } }, { attempts: 2, timeoutMs: 15000 })
  return res.ok ? res.arrayBuffer() : null
}

// Returns [newerBuf, olderBuf?] — older buf covers ~12 months prior for 24-month window
async function fetchPair(table, suffixes, maxBack = 5) {
  let y = new Date().getFullYear()
  let m = new Date().getMonth() + 1
  let latestBuf = null

  for (let i = 0; i < maxBack; i++) {
    for (const sfx of suffixes) {
      latestBuf = await tryFetch(y, m, table, sfx)
      if (latestBuf) break
    }
    if (latestBuf) break
    ;({ year: y, month: m } = prevMo(y, m))
  }

  if (!latestBuf) return []

  // Go back 12 months to cover a full 24-month window
  let { year: py, month: pm } = { year: y, month: m }
  for (let i = 0; i < 12; i++) ({ year: py, month: pm } = prevMo(py, pm))

  let prevBuf = null
  for (const sfx of ['r', 'p']) {
    prevBuf = await tryFetch(py, pm, table, sfx)
    if (prevBuf) break
  }

  return prevBuf ? [prevBuf, latestBuf] : [latestBuf]
}

function parseCellDate(cell, currentYear) {
  const s = normDig(String(cell ?? '')).replace(/[\s\u3000]+/g, '')
  let m
  if ((m = s.match(/^(20\d{2})年(\d+)月/)))   return { year: +m[1], month: +m[2] }
  if ((m = s.match(/令和(\d+)年(\d+)月/)))     return { year: 2018 + +m[1], month: +m[2] }
  if ((m = s.match(/^(\d{1,2})年(\d+)月$/)))  return { year: 2018 + +m[1], month: +m[2] }
  if ((m = s.match(/^(\d+)月/)) && currentYear) return { year: currentYear, month: +m[1] }
  return null
}

function parseSeries(rows, vCol, yCol) {
  const results = []
  let currentYear = null
  for (const row of rows) {
    const parsed = parseCellDate(row?.[0], currentYear)
    if (!parsed) continue
    currentYear = parsed.year
    const date = `${parsed.year}/${String(parsed.month).padStart(2, '0')}`
    const value = typeof row[vCol] === 'number' ? row[vCol] : null
    const yoy   = typeof row[yCol] === 'number' ? row[yCol] : null
    if (value != null || yoy != null) results.push({ date, value, yoy })
  }
  return results.sort((a, b) => a.date.localeCompare(b.date))
}

function extractSection(rows, keyword, vCol = 2, yCol = 3) {
  const norm = s => normDig(String(s ?? '')).replace(/[\s\u3000]/g, '')
  const kwNorm = norm(keyword)
  let started = false
  const sectionRows = []

  for (const row of rows) {
    const cn = norm(row?.[0] ?? '')
    if (!started) { if (cn.includes(kwNorm)) started = true; continue }
    const looksLikeDate = /\d+[年月]/.test(cn) || /令和/.test(cn)
    if (sectionRows.length > 0 && cn && !looksLikeDate && !cn.startsWith('注')) break
    sectionRows.push(row)
  }
  return parseSeries(sectionRows, vCol, yCol)
}

// Merge multiple series arrays — later entries in the array take precedence for same date
function mergeSeries(seriesArray) {
  const map = new Map()
  for (const series of seriesArray) {
    for (const item of series) map.set(item.date, item)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// kyo{yy}{mm}{suffix}.xlsx — 共通事業所（同一事業所）ベースの前年同月比
async function tryFetchKyo(year, month, suffix) {
  const { rr, yy, mm } = urlParts(year, month)
  const url = `https://www.mhlw.go.jp/toukei/itiran/roudou/monthly/r${rr}/${yy}${mm}${suffix}/xls/kyo${yy}${mm}${suffix}.xlsx`
  const res = await fetchWithRetry(url, { next: { revalidate } }, { attempts: 2, timeoutMs: 15000 })
  return res.ok ? res.arrayBuffer() : null
}

async function findLatestKyo(maxBack = 5) {
  let y = new Date().getFullYear()
  let m = new Date().getMonth() + 1
  for (let i = 0; i < maxBack; i++) {
    for (const sfx of ['p', 'r']) {
      const buf = await tryFetchKyo(y, m, sfx)
      if (buf) return buf
    }
    ;({ year: y, month: m } = prevMo(y, m))
  }
  return null
}

// Parse 共通事業所 sheet — date is in col[1], section 1 only (stop at "年月" section header)
function parseKyo(rows, yoyCol) {
  const norm = s => normDig(String(s ?? '')).replace(/[\s\u3000]/g, '')
  const results = []
  let currentYear = null
  let started = false

  for (const row of rows) {
    const c1 = norm(row?.[1] ?? '')

    if (!started) {
      if (c1.includes('賃金')) started = true
      continue
    }

    // "年月" in col[1] = section 2 header → stop
    if (results.length > 0 && c1 === '年月') break

    const parsed = parseCellDate(row?.[1], currentYear)
    if (!parsed) continue
    currentYear = parsed.year
    const date = `${parsed.year}/${String(parsed.month).padStart(2, '0')}`
    const yoy = typeof row[yoyCol] === 'number' ? row[yoyCol] : null
    if (yoy != null) results.push({ date, yoy })
  }
  return results.sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET() {
  const XLSX = await import('xlsx')

  const readRows = (buf) => {
    const wb = XLSX.read(buf, { type: 'array' })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  }

  const readSheet = (buf, sheetName) => {
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  }

  try {
    const [bufs1, bufs4, bufs6, kyoBuf] = await Promise.all([
      fetchPair('t01', ['p', 'r']),
      fetchPair('t04', ['p', 'r']),
      fetchPair('t06', ['r']),
      findLatestKyo(),
    ])

    if (!bufs1.length) return Response.json({ error: 'MHLW wages data unavailable' }, { status: 502 })

    const rows1All = bufs1.map(readRows)
    const rows4All = bufs4.map(readRows)
    const rows6All = bufs6.map(readRows)

    const nominal   = mergeSeries(rows1All.map(r => extractSection(r, '現金給与総額'))).slice(-24)
    const scheduled = mergeSeries(rows1All.map(r => extractSection(r, '所定内給与'))).slice(-24)
    const parttime_ratio = mergeSeries(
      rows4All.map(r => parseSeries(r, 2, 3).map(d => ({ date: d.date, value: d.value })))
    ).filter(d => d.value != null).slice(-24)
    const real = mergeSeries(rows6All.map(r => parseSeries(r, 2, 3))).slice(-24)

    // 共通事業所（同一事業所）前年比: col[3]=現金給与総額, col[9]=所定内給与
    let nominal_same = [], scheduled_same = []
    if (kyoBuf) {
      const kyoRows = readSheet(kyoBuf, '共通事業所')
      nominal_same   = parseKyo(kyoRows, 3).slice(-24)
      scheduled_same = parseKyo(kyoRows, 9).slice(-24)
    }

    const latest_date = nominal.at(-1)?.date ?? ''

    return Response.json({ nominal, real, scheduled, parttime_ratio, nominal_same, scheduled_same, latest_date })
  } catch (e) {
    return Response.json({ error: e.message })
  }
}
