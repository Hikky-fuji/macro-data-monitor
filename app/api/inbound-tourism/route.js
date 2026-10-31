export const revalidate = 21600
export const dynamic = 'force-dynamic'

const SOURCE_PAGES = {
  arrivals: 'https://www.jnto.go.jp/statistics/data/visitors-statistics/',
  spending: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/gaikokujinshohidoko.html',
  accommodation: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/shukuhakutokei.html',
}

const FALLBACK = {
  arrivals: [
    { date: '2025-01', value: 3781629, yoy: 40.7 },
    { date: '2025-02', value: 3258491, yoy: 16.9 },
    { date: '2025-03', value: 3497755, yoy: 13.5 },
    { date: '2025-04', value: 3909128, yoy: 28.5 },
    { date: '2025-05', value: 3693587, yoy: 21.5 },
    { date: '2025-06', value: 3377985, yoy: 7.6 },
    { date: '2025-07', value: 3437118, yoy: 4.4 },
    { date: '2025-08', value: 3428406, yoy: 16.9 },
    { date: '2025-09', value: 3267228, yoy: 13.7 },
    { date: '2025-10', value: 3896524, yoy: 17.6 },
    { date: '2025-11', value: 3518195, yoy: 10.4 },
    { date: '2025-12', value: 3617791, yoy: 3.7 },
    { date: '2026-01', value: 3597881, yoy: -4.9 },
    { date: '2026-02', value: 3466848, yoy: 6.4 },
    { date: '2026-03', value: 3619159, yoy: 3.5 },
    { date: '2026-04', value: 3692364, yoy: -5.5 },
    { date: '2026-05', value: 3559900, yoy: -3.6 },
    { date: '2026-06', value: 3148600, yoy: -6.8 },
  ],
  arrivalSummary: {
    period: '2026-06', value: 3148600, yoy: -6.8, ytd: 21084800, ytdYoy: -2.0,
  },
  markets: [
    { name: 'Korea', value: 787100, yoy: 7.8 },
    { name: 'Taiwan', value: 670400, yoy: 14.6 },
    { name: 'United States', value: 354500, yoy: 2.7 },
    { name: 'China', value: 340700, yoy: -57.3 },
    { name: 'Hong Kong', value: 214300, yoy: 28.5 },
    { name: 'Singapore', value: 68400, yoy: -0.3 },
    { name: 'Australia', value: 63900, yoy: 7.5 },
    { name: 'Philippines', value: 59900, yoy: -5.2 },
    { name: 'Vietnam', value: 56500, yoy: 6.7 },
    { name: 'Indonesia', value: 52700, yoy: 2.4 },
    { name: 'Thailand', value: 48000, yoy: -7.8 },
    { name: 'Canada', value: 44000, yoy: 5.8 },
    { name: 'India', value: 36100, yoy: 26.1 },
  ],
  spending: {
    period: '2026-Q2', totalYen: 2509600000000, yoy: 0.2,
    perVisitorYen: 244457, perVisitorYoy: 3.3,
    categories: [
      { name: 'Accommodation', valueYen: 927800000000 },
      { name: 'Shopping', valueYen: 673100000000 },
      { name: 'Food & drink', valueYen: 545400000000 },
      { name: 'Transport', valueYen: 252700000000 },
      { name: 'Entertainment & services', valueYen: 108800000000 },
      { name: 'Other', valueYen: 1900000000 },
    ],
    markets: [
      { name: 'United States', valueYen: 384800000000, share: 15.3, yoy: 8.5 },
      { name: 'Taiwan', valueYen: 363900000000, share: 14.5, yoy: 27.9 },
      { name: 'China', valueYen: 259200000000, share: 10.3, yoy: -48.8 },
      { name: 'Korea', valueYen: 258900000000, share: 10.3, yoy: 12.2 },
      { name: 'Hong Kong', valueYen: 145200000000, share: 5.8, yoy: 7.8 },
    ],
  },
  accommodation: {
    period: '2026-06', totalGuestNights: 46775820, totalYoy: -6.5,
    foreignGuestNights: 12512800, foreignYoy: -11.9,
    occupancyRate: 56.2, occupancyChange: -2.6,
    status: 'First preliminary estimate',
  },
}

const MARKET_NAMES = {
  '韓国': 'Korea',
  '中国': 'China',
  '台湾': 'Taiwan',
  '香港': 'Hong Kong',
  'タイ': 'Thailand',
  'シンガポール': 'Singapore',
  'マレーシア': 'Malaysia',
  'インドネシア': 'Indonesia',
  'フィリピン': 'Philippines',
  'ベトナム': 'Vietnam',
  'インド': 'India',
  '米国': 'United States',
  'カナダ': 'Canada',
  '豪州': 'Australia',
}

function cleanText(value) {
  return String(value ?? '').replace(/[\s　]/g, '').trim()
}

function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[,，％%円人]/g, '').replace(/[＋+]/g, '').replace(/[－−]/g, '-')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function pairedValues(row) {
  const numbers = row.map(numberValue).filter(value => value !== null)
  const pairs = []
  for (let index = 0; index < numbers.length - 1; index += 1) {
    if (numbers[index] > 1000 && Math.abs(numbers[index + 1]) <= 500) {
      pairs.push({ value: numbers[index], yoy: numbers[index + 1] })
      index += 1
    }
  }
  return pairs
}

function workbookRows(workbook, XLSX) {
  return workbook.SheetNames.map(sheetName => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
    }),
  }))
}

function yearFromSheet(sheet) {
  const searchable = `${sheet.sheetName} ${sheet.rows.slice(0, 8).flat().join(' ')}`
  return Number(searchable.match(/20\d{2}/)?.[0]) || null
}

function parseArrivalsWorkbook(workbook, XLSX) {
  const parsedYears = []

  for (const sheet of workbookRows(workbook, XLSX)) {
    const year = yearFromSheet(sheet)
    if (!year || year < 2024) continue
    const totalRow = sheet.rows.find(row => row.some(cell => cleanText(cell) === '総数'))
    if (!totalRow) continue
    const pairs = pairedValues(totalRow)
    if (pairs.length < 2) continue
    const monthly = pairs.slice(0, -1).slice(0, 12)
    if (!monthly.length) continue

    const markets = Object.entries(MARKET_NAMES).flatMap(([japanese, english]) => {
      const row = sheet.rows.find(candidate => candidate.some(cell => cleanText(cell) === japanese))
      if (!row) return []
      const marketPairs = pairedValues(row)
      const latest = marketPairs[monthly.length - 1]
      return latest?.value ? [{ name: english, ...latest }] : []
    })

    parsedYears.push({
      year,
      series: monthly.map((point, index) => ({
        date: `${year}-${String(index + 1).padStart(2, '0')}`,
        ...point,
      })),
      summary: {
        period: `${year}-${String(monthly.length).padStart(2, '0')}`,
        ...monthly.at(-1),
        ytd: pairs.at(-1)?.value ?? null,
        ytdYoy: pairs.at(-1)?.yoy ?? null,
      },
      markets,
    })
  }

  const latest = parsedYears.sort((a, b) => a.year - b.year).at(-1)
  if (!latest) throw new Error('JNTO workbook structure was not recognized')

  return {
    series: parsedYears.flatMap(year => year.series).sort((a, b) => a.date.localeCompare(b.date)).slice(-24),
    summary: latest.summary,
    markets: latest.markets.sort((a, b) => b.value - a.value),
  }
}

function parseSpendingWorkbook(workbook, XLSX) {
  const sheets = workbookRows(workbook, XLSX)
  const rows = sheets.flatMap(sheet => sheet.rows)
  const totalRow = rows.find(row => row.some(cell => cleanText(cell) === '総額')
    && row.map(numberValue).some(value => value >= 10000 && value <= 100000))
  const totalNumbers = totalRow?.map(numberValue).filter(value => value !== null) ?? []
  const totalIndex = totalNumbers.findIndex(value => value >= 10000 && value <= 100000)
  if (totalIndex < 0) throw new Error('Tourism spending workbook structure was not recognized')

  const totalOkuYen = totalNumbers[totalIndex]
  const yoy = totalNumbers[totalIndex + 1]
  const categoryOkuYen = totalNumbers.slice(totalIndex + 2).filter(value => value >= 0).slice(0, 6)
  const categoryNames = ['Accommodation', 'Food & drink', 'Transport', 'Entertainment & services', 'Shopping', 'Other']
  const perVisitorRow = rows.find(row => row.some(cell => cleanText(cell) === '全国籍・地域')
    && row.map(numberValue).some(value => value >= 100000 && value <= 800000))
  const perVisitorNumbers = perVisitorRow?.map(numberValue).filter(value => value !== null) ?? []
  const perVisitorIndex = perVisitorNumbers.findIndex(value => value >= 100000 && value <= 800000)

  return {
    period: FALLBACK.spending.period,
    totalYen: totalOkuYen * 100000000,
    yoy: Math.abs(yoy) <= 100 ? yoy : FALLBACK.spending.yoy,
    perVisitorYen: perVisitorNumbers[perVisitorIndex] ?? FALLBACK.spending.perVisitorYen,
    perVisitorYoy: Math.abs(perVisitorNumbers[perVisitorIndex + 1]) <= 100
      ? perVisitorNumbers[perVisitorIndex + 1]
      : FALLBACK.spending.perVisitorYoy,
    categories: categoryOkuYen.length >= 5
      ? categoryOkuYen.map((value, index) => ({ name: categoryNames[index], valueYen: value * 100000000 }))
      : FALLBACK.spending.categories,
    markets: FALLBACK.spending.markets,
  }
}

function parseAccommodationWorkbook(workbook, XLSX) {
  const sheets = workbookRows(workbook, XLSX)
  const nightsSheet = sheets.find(sheet => /^第1表/.test(sheet.sheetName))
  const occupancySheet = sheets.find(sheet => /^第5表/.test(sheet.sheetName))
  const nightsRow = nightsSheet?.rows.find(row => {
    const values = row.map(numberValue)
    return /令和\d+年\d+月/.test(cleanText(row[0]))
      && values.some(value => value > 10000000)
  })
  if (!nightsRow) throw new Error('Accommodation workbook structure was not recognized')

  const eraMatch = cleanText(nightsRow[0]).match(/令和(\d+)年(\d+)月/)
  const period = eraMatch
    ? `${2018 + Number(eraMatch[1])}-${String(Number(eraMatch[2])).padStart(2, '0')}`
    : FALLBACK.accommodation.period
  const totalGuestNights = numberValue(nightsRow[1])
  const foreignGuestNights = numberValue(nightsRow[2])
  const occupancyRow = occupancySheet?.rows.find(row => cleanText(row[0]) === cleanText(nightsRow[0]))
  const occupancyRate = numberValue(occupancyRow?.[1])
  const comparableSnapshot = period === FALLBACK.accommodation.period

  return {
    period,
    totalGuestNights,
    foreignGuestNights,
    occupancyRate,
    totalYoy: comparableSnapshot ? FALLBACK.accommodation.totalYoy : null,
    foreignYoy: comparableSnapshot ? FALLBACK.accommodation.foreignYoy : null,
    occupancyChange: comparableSnapshot ? FALLBACK.accommodation.occupancyChange : null,
    status: comparableSnapshot
      ? FALLBACK.accommodation.status
      : 'First preliminary estimate; YoY rates await the detailed release',
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MacroDataMonitor/1.0 (official-data dashboard)' },
    next: { revalidate },
  })
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.text()
}

function workbookLinks(html, pageUrl) {
  return [...html.matchAll(/href=["']([^"']+\.xlsx(?:\?[^"']*)?)["']/gi)]
    .map(match => new URL(match[1].replace(/&amp;/g, '&'), pageUrl).href)
}

async function latestWorkbook(pageUrl) {
  const html = await fetchText(pageUrl)
  const links = workbookLinks(html, pageUrl)
  if (!links.length) throw new Error(`No current workbook found at ${pageUrl}`)
  const response = await fetch(links[0], {
    headers: { 'User-Agent': 'MacroDataMonitor/1.0 (official-data dashboard)' },
    next: { revalidate },
  })
  if (!response.ok) throw new Error(`${response.status} from ${links[0]}`)
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' })
  return { workbook, XLSX, url: links[0] }
}

async function loadSource(key, parser) {
  try {
    const { workbook, XLSX, url } = await latestWorkbook(SOURCE_PAGES[key])
    try {
      return { data: parser(workbook, XLSX), live: true, fileUrl: url, error: null }
    } catch (error) {
      return {
        data: null,
        live: false,
        fileUrl: url,
        error: error.message,
      }
    }
  } catch (error) {
    return { data: null, live: false, fileUrl: null, error: error.message }
  }
}

export async function GET() {
  const [arrivalsResult, spendingResult, accommodationResult] = await Promise.all([
    loadSource('arrivals', parseArrivalsWorkbook),
    loadSource('spending', parseSpendingWorkbook),
    loadSource('accommodation', parseAccommodationWorkbook),
  ])

  const arrivals = arrivalsResult.data ?? {
    series: FALLBACK.arrivals,
    summary: FALLBACK.arrivalSummary,
    markets: FALLBACK.markets,
  }
  const totalLatest = arrivals.summary.value || 1
  const markets = arrivals.markets.map(market => ({
    ...market,
    share: market.value / totalLatest * 100,
  }))
  const positiveMarkets = markets.filter(market => market.yoy > 0).length
  const topFourShare = markets.slice(0, 4).reduce((sum, market) => sum + market.share, 0)

  return Response.json({
    arrivals: arrivals.series,
    arrivalSummary: arrivals.summary,
    markets,
    spending: spendingResult.data ?? FALLBACK.spending,
    accommodation: accommodationResult.data ?? FALLBACK.accommodation,
    analysis: {
      positiveMarkets,
      marketCount: markets.length,
      topFourShare,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      cacheSeconds: revalidate,
      sources: [
        { key: 'arrivals', label: 'JNTO Visitor Arrivals', pageUrl: SOURCE_PAGES.arrivals, ...arrivalsResult },
        { key: 'spending', label: 'Japan Tourism Agency Inbound Spending', pageUrl: SOURCE_PAGES.spending, ...spendingResult },
        { key: 'accommodation', label: 'Japan Tourism Agency Accommodation Survey', pageUrl: SOURCE_PAGES.accommodation, ...accommodationResult },
      ].map(({ data, ...source }) => source),
    },
  })
}
