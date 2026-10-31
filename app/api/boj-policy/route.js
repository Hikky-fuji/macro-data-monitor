import { fetchWithRetry } from '../../lib/resilient-fetch.js'
import { baseYearFromHeader, spliceBaseSeries, stripBaseTags } from '../../lib/boj-base-years.mjs'

export const revalidate = 21600
export const dynamic = 'force-dynamic'

const BOJ_CORE_CPI_URL = 'https://www.boj.or.jp/en/research/research_data/cpi/cpirev.xlsx'
const BOJ_GAP_URL = 'https://www.boj.or.jp/en/research/research_data/gap/gap.xlsx'

const CORE_CPI_DEFINITIONS = {
  exFreshInstitutional: {
    aliases: [
      'excluding fresh food and institutional factors',
      'all items less fresh food and institutional factors',
      '生鮮食品を除く総合 制度要因',
    ],
    required: ['fresh food', 'institutional'],
    avoid: ['energy'],
  },
  exFreshEnergyInstitutional: {
    aliases: [
      'excluding fresh food energy and institutional factors',
      'all items less fresh food energy and institutional factors',
      '生鮮食品及びエネルギーを除く総合 制度要因',
    ],
    required: ['fresh food', 'energy', 'institutional'],
  },
  exFoodEnergyInstitutional: {
    aliases: [
      'excluding food energy and institutional factors',
      'all items less food energy and institutional factors',
      '食料及びエネルギーを除く総合 制度要因',
    ],
    required: ['food', 'energy', 'institutional'],
    avoid: ['fresh food'],
  },
  trimmedMean: {
    aliases: ['trimmed mean', '刈込平均値'],
    required: ['trimmed', 'mean'],
  },
  weightedMedian: {
    aliases: ['weighted median', '加重中央値'],
    required: ['weighted', 'median'],
  },
  mode: {
    aliases: ['mode', '最頻値'],
    required: ['mode'],
  },
  diffusionIndex: {
    aliases: ['diffusion index', 'share of increasing items minus share of decreasing items', '上昇品目割合 減少品目割合 差'],
    required: ['diffusion', 'index'],
  },
  shareIncreasing: {
    aliases: ['share of increasing items', '上昇品目割合'],
    required: ['increasing', 'items'],
    avoid: ['minus', 'diffusion'],
  },
  shareDecreasing: {
    aliases: ['share of decreasing items', '下落品目割合', '減少品目割合'],
    required: ['decreasing', 'items'],
    avoid: ['minus', 'diffusion'],
  },
}

const GAP_DEFINITIONS = {
  outputGap: {
    aliases: ['output gap', '需給ギャップ'],
    required: ['output', 'gap'],
    avoid: ['capital', 'labor', 'potential'],
  },
  capitalInputGap: {
    aliases: ['capital input gap', '資本投入ギャップ'],
    required: ['capital', 'input', 'gap'],
  },
  laborInputGap: {
    aliases: ['labor input gap', 'labour input gap', '労働投入ギャップ'],
    required: ['input', 'gap'],
    oneOf: ['labor', 'labour', '労働'],
  },
  tankanUtilization: {
    aliases: ['tankan factor utilization index', '短観加重平均di', '短観設備 雇用判断di'],
    required: ['tankan', 'utilization'],
  },
  potentialGrowth: {
    aliases: ['potential growth rate', '潜在成長率'],
    required: ['potential', 'growth'],
  },
  totalFactorProductivity: {
    aliases: ['total factor productivity', 'tfp', '全要素生産性'],
    oneOf: ['total factor productivity', 'tfp', '全要素生産性'],
  },
  capitalStock: {
    aliases: ['capital stock', '資本ストック'],
    required: ['capital', 'stock'],
  },
  employedPersons: {
    aliases: ['number of employed', 'employed persons', '就業者数'],
    oneOf: ['number of employed', 'employed persons', '就業者数'],
  },
  hoursWorked: {
    aliases: ['hours worked', 'working hours', '労働時間'],
    oneOf: ['hours worked', 'working hours', '労働時間'],
  },
  beveridgeRatio: {
    aliases: ['beveridge ratio', 'ベバリッジ比率'],
    required: ['beveridge', 'ratio'],
  },
  tankanEmploymentDI: {
    aliases: ['tankan employment conditions di', '雇用人員判断di'],
    required: ['employment', 'conditions', 'di'],
    oneOf: ['tankan', '短観'],
  },
  unemploymentRate: {
    aliases: ['unemployment rate', '完全失業率'],
    required: ['unemployment', 'rate'],
    avoid: ['gap'],
  },
  employmentRateGap: {
    aliases: ['employment rate gap', '雇用率ギャップ'],
    required: ['employment', 'rate', 'gap'],
  },
  accessionSeparationGap: {
    aliases: ['accession separation rate gap', 'accession rate separation rate', '入職率 離職率 ギャップ'],
    required: ['accession', 'separation', 'gap'],
  },
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/,/g, '').replace(/[%％]/g, '').trim()
  if (!cleaned || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePeriod(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear()
    const month = value.getUTCMonth() + 1
    return `${year}/${String(month).padStart(2, '0')}`
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    const text = String(value)
    if (/^(19|20)\d{4}$/.test(text)) return `${text.slice(0, 4)}/${text.slice(4, 6)}`
    if (/^(19|20)\d{2}$/.test(text)) return text
  }

  const text = String(value ?? '').normalize('NFKC').trim()
  if (!text) return null

  let match = text.match(/^((?:19|20)\d{2})\.([12])\s*:/)
  if (match) return `FY${match[1]}/H${match[2]}`

  match = text.match(/((?:19|20)\d{2})\s*(?:[/.-]?\s*[Qq]\s*([1-4])|[.-]\s*([1-4])\s*[Qq]|年\s*第?\s*([1-4])\s*四半期)/)
  if (match) return `${match[1]}/Q${match[2] || match[3] || match[4]}`

  match = text.match(/((?:19|20)\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*月?/)
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return `${match[1]}/${String(match[2]).padStart(2, '0')}`
  }
  if (match) return `${match[1]}/Q${match[2]}`

  match = text.match(/(?:FY\s*)?((?:19|20)\d{2})\s*(?:年度|FY)?$/i)
  if (match) return text.toLowerCase().includes('fy') || text.includes('年度') ? `FY${match[1]}` : match[1]

  return null
}

function periodRank(period) {
  const monthly = period.match(/^(\d{4})\/(\d{2})$/)
  if (monthly) return Number(monthly[1]) * 12 + Number(monthly[2])
  const quarterly = period.match(/^(\d{4})\/Q([1-4])$/)
  if (quarterly) return Number(quarterly[1]) * 12 + Number(quarterly[2]) * 3
  const half = period.match(/^FY(\d{4})\/H([12])$/)
  if (half) return Number(half[1]) * 12 + Number(half[2]) * 6
  const annual = period.match(/^(?:FY)?(\d{4})$/)
  return annual ? Number(annual[1]) * 12 + 12 : 0
}

function transpose(rows) {
  const width = Math.max(0, ...rows.map(row => row.length))
  return Array.from({ length: width }, (_, column) => rows.map(row => row[column] ?? null))
}

function dateBlocks(entries) {
  const blocks = []
  for (const entry of entries) {
    const current = blocks.at(-1)
    if (!current || entry.row - current.at(-1).row > 3) blocks.push([entry])
    else current.push(entry)
  }
  return blocks.filter(block => block.length >= 3)
}

function collectCandidates(rows, sheetName, orientation) {
  const candidates = []
  const width = Math.max(0, ...rows.map(row => row.length))

  for (let dateColumn = 0; dateColumn < width; dateColumn += 1) {
    const datedRows = rows
      .map((row, index) => ({ row: index, period: parsePeriod(row[dateColumn]) }))
      .filter(item => item.period)

    for (const block of dateBlocks(datedRows)) {
      const firstRow = block[0].row
      const lastRow = block.at(-1).row
      const headerStart = Math.max(0, firstRow - 12)

      for (let valueColumn = 0; valueColumn < width; valueColumn += 1) {
        if (valueColumn === dateColumn) continue

        const series = block
          .map(({ row, period }) => {
            const value = asNumber(rows[row]?.[valueColumn])
            return value == null ? null : { date: period, value: Number(value.toFixed(3)) }
          })
          .filter(Boolean)

        if (series.length < 3) continue

        const labelParts = []
        for (let row = headerStart; row < firstRow; row += 1) {
          const label = normalize(rows[row]?.[valueColumn])
          if (label && !parsePeriod(rows[row]?.[valueColumn]) && !labelParts.includes(label)) labelParts.push(label)
        }

        const uniqueSeries = [...new Map(series.map(item => [item.date, item])).values()]
          .sort((a, b) => periodRank(a.date) - periodRank(b.date))

        candidates.push({
          sheet: sheetName,
          orientation,
          labels: [...labelParts, normalize(sheetName)].filter(Boolean),
          header: [...labelParts, normalize(sheetName)].filter(Boolean).join(' | '),
          rowRange: [firstRow, lastRow],
          series: uniqueSeries,
        })
      }
    }
  }

  return candidates
}

function phraseScore(text, phrase) {
  const normalizedPhrase = normalize(phrase)
  if (!normalizedPhrase) return 0
  if (text === normalizedPhrase) return 1500 + normalizedPhrase.length
  if (text.includes(normalizedPhrase)) return 1100 + normalizedPhrase.length
  const tokens = normalizedPhrase.split(' ').filter(token => token.length > 1)
  if (!tokens.length) return 0
  const hits = tokens.filter(token => text.includes(token)).length
  return hits === tokens.length ? 650 + hits * 10 : Math.round((hits / tokens.length) * 300)
}

function definitionScore(candidate, definition) {
  const labelScores = candidate.labels.flatMap(label => definition.aliases.map(alias => phraseScore(label, alias)))
  let score = Math.max(0, ...labelScores)
  const combined = candidate.header

  if (definition.required?.length) {
    const required = definition.required.map(normalize)
    if (required.every(term => combined.includes(term))) score = Math.max(score, 720 + required.length * 12)
    else score -= 300
  }
  if (definition.oneOf?.length && !definition.oneOf.map(normalize).some(term => combined.includes(term))) score -= 260
  if (definition.avoid?.some(term => combined.includes(normalize(term)))) score -= 520
  // Prefer the newest CPI base the BOJ publishes; older bases are linked below.
  const baseYear = baseYearFromHeader(combined)
  if (baseYear) score += 60 + (baseYear - 2015) * 24
  return score
}

function linkOlderBases(best, candidates) {
  const baseYear = baseYearFromHeader(best.header)
  if (!baseYear) return { series: best.series, bases: [] }

  const stripped = stripBaseTags(best.header)
  const parts = new Map([[baseYear, { baseYear, series: best.series }]])
  for (const candidate of candidates) {
    if (candidate.sheet !== best.sheet || candidate.orientation !== best.orientation) continue
    const candidateBase = baseYearFromHeader(candidate.header)
    if (!candidateBase || candidateBase >= baseYear || parts.has(candidateBase)) continue
    if (stripBaseTags(candidate.header) !== stripped) continue
    parts.set(candidateBase, { baseYear: candidateBase, series: candidate.series })
  }

  const ordered = [...parts.values()].sort((a, b) => b.baseYear - a.baseYear)
  return {
    series: spliceBaseSeries(ordered, periodRank),
    bases: ordered.map(part => ({
      baseYear: part.baseYear,
      start: part.series[0]?.date ?? null,
      end: part.series.at(-1)?.date ?? null,
    })),
  }
}

function resolveSeries(candidates, definitions) {
  const series = {}
  const matches = {}

  for (const [key, definition] of Object.entries(definitions)) {
    const ranked = candidates
      .map(candidate => ({ candidate, score: definitionScore(candidate, definition) }))
      .sort((a, b) => b.score - a.score || b.candidate.series.length - a.candidate.series.length)
    const best = ranked[0]

    if (!best || best.score < 450) {
      series[key] = []
      matches[key] = null
      continue
    }

    const linked = linkOlderBases(best.candidate, candidates)
    series[key] = linked.series.slice(-160)
    matches[key] = {
      sheet: best.candidate.sheet,
      orientation: best.candidate.orientation,
      header: best.candidate.header,
      bases: linked.bases,
      score: best.score,
    }
  }

  return { series, matches }
}

async function parseWorkbook(buffer, definitions) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const candidates = []

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    })
    candidates.push(...collectCandidates(rows, sheetName, 'columns'))
    candidates.push(...collectCandidates(transpose(rows), sheetName, 'rows'))
  }

  const resolved = resolveSeries(candidates, definitions)
  return { ...resolved, sheets: workbook.SheetNames, candidateCount: candidates.length }
}

async function fetchWorkbook(url) {
  const response = await fetchWithRetry(url, {
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.5',
      'User-Agent': 'JapanPulse/1.0 (+https://japanpulse.vercel.app)',
    },
    next: { revalidate },
  }, { attempts: 2, timeoutMs: 20000 })
  if (!response.ok) throw new Error(`BOJ workbook returned HTTP ${response.status}`)
  return response.arrayBuffer()
}

function latestPeriod(seriesCollection) {
  return Object.values(seriesCollection)
    .flat()
    .map(item => item.date)
    .sort((a, b) => periodRank(a) - periodRank(b))
    .at(-1) ?? null
}

export async function GET() {
  const fetchedAt = new Date().toISOString()
  const [coreResult, gapResult] = await Promise.allSettled([
    fetchWorkbook(BOJ_CORE_CPI_URL).then(buffer => parseWorkbook(buffer, CORE_CPI_DEFINITIONS)),
    fetchWorkbook(BOJ_GAP_URL).then(buffer => parseWorkbook(buffer, GAP_DEFINITIONS)),
  ])

  if (coreResult.status === 'rejected' && gapResult.status === 'rejected') {
    return Response.json({
      error: 'BOJ research workbooks could not be loaded',
      details: [coreResult.reason?.message, gapResult.reason?.message].filter(Boolean),
      fetchedAt,
    }, { status: 502 })
  }

  const core = coreResult.status === 'fulfilled' ? coreResult.value : { series: {}, matches: {}, sheets: [] }
  const gap = gapResult.status === 'fulfilled' ? gapResult.value : { series: {}, matches: {}, sheets: [] }
  const warnings = [
    coreResult.status === 'rejected' ? `Core CPI: ${coreResult.reason?.message}` : null,
    gapResult.status === 'rejected' ? `Output gap: ${gapResult.reason?.message}` : null,
  ].filter(Boolean)

  return Response.json({
    coreInflation: core.series,
    activity: gap.series,
    latest: {
      coreInflation: latestPeriod(core.series),
      activity: gap.series.outputGap?.at(-1)?.date ?? latestPeriod(gap.series),
      laborMarket: gap.series.tankanEmploymentDI?.at(-1)?.date ?? null,
    },
    meta: {
      fetchedAt,
      automatic: true,
      partial: warnings.length > 0,
      warnings,
      coreCpiBases: core.matches?.exFreshInstitutional?.bases ?? [],
      coreCpiBaseNote: 'Core CPI measures link the BOJ’s official per-base y/y columns; the newest base is used for its own period and earlier bases are not rebased.',
      sources: [
        { label: 'BOJ Indicators for Core CPI', url: BOJ_CORE_CPI_URL, cadence: 'Monthly' },
        { label: 'BOJ Output Gap and Labor Market Indicators', url: BOJ_GAP_URL, cadence: 'Quarterly' },
      ],
      methodology: 'The analytical chain is informed by a 2023 MUMSS framework; every displayed observation is fetched from current official BOJ workbooks.',
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
