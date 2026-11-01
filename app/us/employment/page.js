'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, Line, Scatter } from 'react-chartjs-2'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { DashboardFreshness, DashboardState } from '../../components/DashboardStatus'
import { addMonths } from '../../lib/us-cpi-scenarios.mjs'
import {
  SECTORS,
  SECTOR_FAMILIES,
  average,
  differenceSeries,
  familyChanges,
  familyColor,
  levelRates,
  monthlyChanges,
  payrollRevisions,
  payrollSummary,
  rateSummary,
  sumSeries,
} from '../../lib/us-employment-metrics.mjs'
// US and Japan dashboards share one layout and stylesheet.
import styles from '../cpi/page.module.css'

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = {
  total: '#e6eaec',
  u3: '#3987e5',
  u6: '#d95926',
  sep: '#c98500',
  primeLfpr: '#d55181',
  primeEpop: '#9085e9',
  ahe: '#3987e5',
  ahe3m: '#d95926',
  atlanta: '#199e70',
  eci: '#c98500',
}

const valid = value => Number.isFinite(value)
const signed = (value, digits = 0, suffix = '') =>
  valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}` : '—'
const percent = (value, digits = 1) => valid(value) ? `${value.toFixed(digits)}%` : '—'
const thousands = value => signed(value, 0, 'K')

// Green when the labor market strengthens, red when it weakens. `invert` is for
// slack measures (unemployment, duration) where a rise is a weakening. Values
// that round to zero at the displayed precision stay neutral.
function tone(value, { digits = 0, invert = false } = {}) {
  if (!valid(value) || Math.abs(value) < 0.5 * 10 ** -digits) return undefined
  return (value > 0) !== invert ? styles.cool : styles.hot
}

function monthLabel(date, includeYear = false) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

const shortMonth = date => new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  .format(new Date(`${date}T00:00:00Z`))

function since(observations = [], start) {
  return observations.filter(point => point.date >= start)
}

function valuesOn(observations = [], dates) {
  const map = new Map(observations.map(point => [point.date, point.value]))
  return dates.map(date => map.get(date) ?? null)
}

// Twelve-month change; works for monthly and quarterly series alike.
function yoySeries(observations = []) {
  const map = new Map(observations.map(point => [point.date, point.value]))
  return observations.map(point => {
    const base = map.get(addMonths(point.date, -12))
    return { date: point.date, value: valid(base) ? (point.value / base - 1) * 100 : null }
  })
}

function annualized3mSeries(observations = []) {
  const map = new Map(observations.map(point => [point.date, point.value]))
  return observations.map(point => {
    const base = map.get(addMonths(point.date, -3))
    return { date: point.date, value: valid(base) ? ((point.value / base) ** 4 - 1) * 100 : null }
  })
}

function KpiCard({ label, value, valueClass, unit, metrics, note }) {
  return (
    <article className={styles.kpiCard}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.kpiTop}>
        <div className={`${styles.kpiValue} ${valueClass || ''}`}>{value}</div>
        <div className={styles.kpiUnit}>{unit}</div>
      </div>
      <div className={styles.metricRow}>
        {metrics.map(([name, metric, className]) => <div key={name}><span>{name}</span><strong className={className}>{metric}</strong></div>)}
      </div>
      {note ? <div className={styles.panelSub} style={{ margin: '11px 0 0' }}>{note}</div> : null}
    </article>
  )
}

function chartOptions({ format = value => percent(value, 1), axis = format, stacked = false, indexAxis = 'x' } = {}) {
  const valueAxis = indexAxis === 'y' ? 'x' : 'y'
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    interaction: { mode: 'index', axis: indexAxis, intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, color: '#c7cdd1', font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          label: context => `${context.dataset.label}: ${format(context.parsed[valueAxis])}`,
        },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: indexAxis === 'y', color: '#495157' },
        ticks: { maxTicksLimit: 12, color: '#bac1c6', font: { size: 9 }, ...(indexAxis === 'y' ? { callback: value => axis(value) } : {}) },
      },
      y: {
        stacked,
        grid: { display: indexAxis !== 'y', color: '#495157' },
        ticks: { color: '#bac1c6', font: { size: 9 }, ...(indexAxis === 'y' ? {} : { callback: value => axis(value) }) },
      },
    },
  }
}

// Sector names drawn next to scatter points so identity never depends on color alone.
const scatterLabels = {
  id: 'employmentScatterLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      chart.getDatasetMeta(datasetIndex).data.forEach((point, index) => {
        const label = dataset.data[index]?.label
        if (!label) return
        const placeLeft = point.x > chart.chartArea.right - 110
        ctx.save()
        ctx.font = '600 10px Inter, sans-serif'
        ctx.textAlign = placeLeft ? 'right' : 'left'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4
        ctx.strokeStyle = '#30363a'
        ctx.fillStyle = '#e6eaec'
        const x = placeLeft ? point.x - 9 : point.x + 9
        ctx.strokeText(label, x, point.y - 6)
        ctx.fillText(label, x, point.y - 6)
        ctx.restore()
      })
    })
  },
}

export default function USEmploymentPage() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/us-employment')
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load employment data.')
        return body
      })
      .then(setPayload)
      .catch(fetchError => setError(fetchError.message))
  }, [])

  const model = useMemo(() => {
    if (!payload) return null
    const { employment, sectors, sectorAhe, wages = {}, sep = {}, revisions } = payload

    const privateExHealth = differenceSeries(employment.private, employment.healthSocial)
    const payrollRows = [
      { label: 'Total nonfarm', id: 'PAYEMS', series: employment.payems },
      { label: 'Private', id: 'USPRIV', series: employment.private },
      { label: 'Private ex health care & social assistance', id: 'DERIVED · USPRIV − CES6562000001', series: privateExHealth },
      { label: 'Health care & social assistance', id: 'CES6562000001', series: employment.healthSocial },
      { label: 'Government', id: 'USGOVT', series: sectors.govt },
      { label: 'Temporary help services', id: 'TEMPHELPS', series: employment.tempHelp },
    ].map(row => ({ ...row, stats: payrollSummary(row.series) }))

    const headline = payrollRows[0].stats
    const revision = revisions ? payrollRevisions(employment.payems, revisions.payems) : null

    // Stacked payroll changes by family, with the headline 3M average on top.
    const families = familyChanges(sectors, 13)
    const stackDates = families.goods.map(point => point.date)
    const totalChanges = monthlyChanges(employment.payems)
    const totalMap = new Map(totalChanges.map(point => [point.date, point.value]))
    const avg3Line = stackDates.map(date => average([0, -1, -2].map(offset => totalMap.get(addMonths(date, offset)))))

    const sectorTotal = sumSeries(SECTORS.map(sector => sectors[sector.key]))
    const residual = valid(sectorTotal.at(-1)?.value) && valid(headline.level) ? headline.level - sectorTotal.at(-1).value : null

    const sectorRow = (key, label, series, ahe, family) => {
      const stats = payrollSummary(series)
      const employmentRates = levelRates(series)
      const wageRates = levelRates(ahe)
      return {
        key,
        label,
        family,
        level: stats.level,
        share: valid(stats.level) && valid(headline.level) ? stats.level / headline.level * 100 : null,
        change: stats.change,
        avg3: stats.avg3,
        yoy: employmentRates.yoy,
        ahe: wageRates.level,
        aheYoy: wageRates.yoy,
      }
    }
    const sectorTable = SECTOR_FAMILIES.flatMap(family => {
      const members = SECTORS.filter(sector => sector.family === family.key)
      const familySeries = family.key === 'goods' ? sectors.goods : sumSeries(members.map(sector => sectors[sector.key]))
      const leafRows = members.map(sector => sectorRow(sector.key, sector.label, sectors[sector.key], sector.aheId ? sectorAhe[sector.key] : null, family.key))
      if (members.length === 1) return leafRows.map(row => ({ ...row, top: true }))
      return [
        { ...sectorRow(family.key, family.label, familySeries, family.key === 'goods' ? sectorAhe.goods : null, family.key), top: true },
        ...leafRows,
      ]
    })
    const leafRows = sectorTable.filter(row => SECTORS.some(sector => sector.key === row.key))

    const scatterPoints = leafRows
      .filter(row => valid(row.ahe) && valid(row.aheYoy))
      .map(row => ({ x: row.ahe, y: row.aheYoy, label: row.label, color: familyColor(row.family) }))
    const overallWage = levelRates(sectorAhe.overall)

    // Labor supply
    const unrate = rateSummary(employment.unrate)
    const unemploymentRows = [
      { label: 'Unemployment rate (U-3)', id: 'UNRATE', stats: unrate, unit: '%', invert: true },
      { label: 'U-6 underemployment', id: 'U6RATE', stats: rateSummary(employment.u6rate), unit: '%', invert: true },
      { label: 'Sahm rule indicator', id: 'SAHMREALTIME · FRED real-time', stats: rateSummary(employment.sahm), unit: 'pp', digits: 2, invert: true },
      { label: 'Participation rate, 16+', id: 'CIVPART', stats: rateSummary(employment.civpart), unit: '%' },
      { label: 'Prime-age (25–54) participation', id: 'LNS11300060', stats: rateSummary(employment.prime_part), unit: '%' },
      { label: 'Prime-age employment rate', id: 'LNS12300060', stats: rateSummary(employment.primeEpop), unit: '%' },
      { label: 'Long-term unemployed share', id: 'LNS13025703 · 27+ weeks', stats: rateSummary(employment.longTermShare), unit: '%', invert: true },
      { label: 'Median unemployment duration', id: 'UEMPMED', stats: rateSummary(employment.medianDuration), unit: ' wks', invert: true },
      { label: 'Permanent job losers', id: 'LNS13026638', stats: rateSummary(employment.permanentLosers), unit: 'K', digits: 0, invert: true },
    ]

    const sepYearEnd = (sep.yearEnd || []).map(point => ({ date: `${point.date.slice(0, 4)}-12-01`, value: point.value }))
    const sepLongRun = sep.longRun?.at(-1) ?? null
    const unrHistory = since(employment.unrate, '2021-01-01')
    const lastHist = unrHistory.at(-1)?.date
    const sepEnd = sepYearEnd.at(-1)?.date
    const futureDates = []
    if (lastHist && sepEnd) for (let date = addMonths(lastHist, 1); date <= sepEnd; date = addMonths(date, 1)) futureDates.push(date)
    const unrDates = [...unrHistory.map(point => point.date), ...futureDates]

    const u5Dates = employment.unrate.slice(-60).map(point => point.date)
    const lfprDates = employment.civpart.slice(-120).map(point => point.date)

    // Wages
    const ahe = levelRates(employment.ahe)
    const aheProd = levelRates(employment.aheProd)
    const eci = levelRates(wages.eci, { periodsPerYear: 4 })
    const atlanta = rateSummary(wages.atlanta)
    const hours = levelRates(employment.aggregateHours)
    const weeklyHours = rateSummary(employment.avgWeeklyHours)
    const wageDates = since(employment.ahe, '2022-01-01').map(point => point.date)
    const wageRows = [
      { label: 'Avg hourly earnings, all private', id: 'CES0500000003', cells: [{ text: signed(ahe.change, 2, '%'), className: tone(ahe.change, { digits: 2 }) }, percent(ahe.annualized3m, 2), percent(ahe.yoy, 2), percent(ahe.priorYoy, 2)] },
      { label: 'AHE, production & nonsupervisory', id: 'AHETPI', cells: [{ text: signed(aheProd.change, 2, '%'), className: tone(aheProd.change, { digits: 2 }) }, percent(aheProd.annualized3m, 2), percent(aheProd.yoy, 2), percent(aheProd.priorYoy, 2)] },
      { label: 'ECI wages & salaries, private', id: `ECIWAG · quarterly · ${eci.date ? `Q${Math.floor(Number(eci.date.slice(5, 7)) / 3) + 1} ${eci.date.slice(0, 4)}` : '—'}`, cells: [{ text: `${signed(eci.change, 2, '%')} Q/Q`, className: tone(eci.change, { digits: 2 }) }, '—', percent(eci.yoy, 2), percent(eci.priorYoy, 2)] },
      { label: 'Atlanta Fed Wage Growth Tracker', id: 'FRBATLWGT3MMAUMHWGO · published 3M avg', cells: ['—', '—', percent(atlanta.value, 1), percent(valid(atlanta.change1m) ? atlanta.value - atlanta.change1m : null, 1)] },
      { label: 'Aggregate weekly hours index', id: 'AWHI · labor input', cells: [{ text: signed(hours.change, 2, '%'), className: tone(hours.change, { digits: 2 }) }, percent(hours.annualized3m, 2), percent(hours.yoy, 2), percent(hours.priorYoy, 2)] },
    ]

    return {
      headline,
      payrollRows,
      revision,
      revisionVintage: revisions?.vintageDate ?? null,
      families,
      stackDates,
      avg3Line,
      residual,
      sectorTable,
      leafRows,
      scatterPoints,
      overallWage,
      unrate,
      unemploymentRows,
      sahm: rateSummary(employment.sahm),
      primeEpop: rateSummary(employment.primeEpop),
      primePart: rateSummary(employment.prime_part),
      civpart: rateSummary(employment.civpart),
      u6: rateSummary(employment.u6rate),
      sepYearEnd,
      sepLongRun,
      unrHistory,
      unrDates,
      u5Dates,
      lfprDates,
      ahe,
      aheProd,
      weeklyHours,
      wageRows,
      wageDates,
      eciYoy: yoySeries(wages.eci),
      atlanta: wages.atlanta || [],
      employment,
    }
  }, [payload])

  if (error) {
    return (
      <div className={styles.page}>
        <DashboardState type="error" message={`${error} The page will recover automatically when the official feed is available.`} />
      </div>
    )
  }

  if (!model) {
    return (
      <div className={styles.page}>
        <DashboardState message="Fetching the latest Employment Situation series from FRED." />
      </div>
    )
  }

  const { employment } = model
  const latestMonth = monthLabel(model.headline.date, true)
  const warnings = payload.meta?.warnings || []

  const stackedData = {
    labels: model.stackDates.map(shortMonth),
    datasets: [
      {
        type: 'line',
        label: 'Total nonfarm, 3M average',
        data: model.avg3Line,
        borderColor: COLORS.total,
        backgroundColor: COLORS.total,
        borderWidth: 2,
        pointRadius: 2,
        stack: 'line',
      },
      ...SECTOR_FAMILIES.map(family => ({
        type: 'bar',
        label: family.label,
        data: model.families[family.key].map(point => point.value),
        backgroundColor: family.color,
        borderColor: '#30363a',
        borderWidth: 1,
        stack: 'payrolls',
      })),
    ],
  }

  const sectorBarRows = model.leafRows
  const sectorBarOptions = chartOptions({ format: thousands, indexAxis: 'y' })
  sectorBarOptions.plugins.legend = { display: false }
  const sectorBarData = {
    labels: sectorBarRows.map(row => row.label),
    datasets: [{
      label: '3M average change',
      data: sectorBarRows.map(row => row.avg3),
      backgroundColor: sectorBarRows.map(row => familyColor(row.family)),
      borderRadius: 3,
    }],
  }

  const unrData = {
    labels: model.unrDates.map(shortMonth),
    datasets: [
      { label: 'Unemployment rate (U-3)', data: valuesOn(model.unrHistory, model.unrDates), borderColor: COLORS.u3, backgroundColor: COLORS.u3, borderWidth: 2, pointRadius: 0, tension: 0.2 },
      {
        label: `FOMC longer-run median${model.sepLongRun ? ` (${model.sepLongRun.value.toFixed(1)}%)` : ''}`,
        data: model.unrDates.map(() => model.sepLongRun?.value ?? null),
        borderColor: COLORS.sep,
        backgroundColor: COLORS.sep,
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
      {
        label: 'FOMC Q4 median projection',
        data: valuesOn(model.sepYearEnd, model.unrDates),
        borderColor: COLORS.sep,
        backgroundColor: COLORS.sep,
        pointRadius: 6,
        pointHoverRadius: 8,
        showLine: false,
      },
    ],
  }

  const u6Data = {
    labels: model.u5Dates.map(shortMonth),
    datasets: [
      { label: 'U-3', data: valuesOn(employment.unrate, model.u5Dates), borderColor: COLORS.u3, backgroundColor: COLORS.u3, borderWidth: 2, pointRadius: 0 },
      { label: 'U-6', data: valuesOn(employment.u6rate, model.u5Dates), borderColor: COLORS.u6, backgroundColor: COLORS.u6, borderWidth: 2, pointRadius: 0 },
    ],
  }

  const lfprData = {
    labels: model.lfprDates.map(shortMonth),
    datasets: [
      { label: 'Prime-age employment rate', data: valuesOn(employment.primeEpop, model.lfprDates), borderColor: COLORS.primeEpop, backgroundColor: COLORS.primeEpop, borderWidth: 2, pointRadius: 0 },
      { label: 'Prime-age participation', data: valuesOn(employment.prime_part, model.lfprDates), borderColor: COLORS.primeLfpr, backgroundColor: COLORS.primeLfpr, borderWidth: 2, pointRadius: 0 },
    ],
  }

  const wageData = {
    labels: model.wageDates.map(shortMonth),
    datasets: [
      { label: 'AHE Y/Y', data: valuesOn(yoySeries(employment.ahe), model.wageDates), borderColor: COLORS.ahe, backgroundColor: COLORS.ahe, borderWidth: 2, pointRadius: 0 },
      { label: 'AHE 3M ann.', data: valuesOn(annualized3mSeries(employment.ahe), model.wageDates), borderColor: COLORS.ahe3m, backgroundColor: COLORS.ahe3m, borderWidth: 1.5, pointRadius: 0 },
      { label: 'Atlanta Fed tracker', data: valuesOn(model.atlanta, model.wageDates), borderColor: COLORS.atlanta, backgroundColor: COLORS.atlanta, borderWidth: 2, pointRadius: 0 },
      { label: 'ECI wages Y/Y (quarterly)', data: valuesOn(model.eciYoy, model.wageDates), borderColor: COLORS.eci, backgroundColor: COLORS.eci, borderWidth: 2, pointRadius: 3, spanGaps: true },
    ],
  }

  const scatterData = {
    datasets: [{
      label: 'Sectors',
      data: model.scatterPoints,
      pointBackgroundColor: model.scatterPoints.map(point => point.color),
      pointBorderColor: '#30363a',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
    }],
  }
  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 12, right: 16 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#142b3c',
        callbacks: { label: context => `${context.raw.label}: $${context.raw.x.toFixed(2)}/hr · Y/Y ${context.raw.y.toFixed(2)}%` },
      },
    },
    scales: {
      x: {
        grid: { color: '#495157' },
        title: { display: true, text: 'Average hourly earnings ($)', color: '#c7cdd1', font: { size: 10 } },
        ticks: { color: '#bac1c6', font: { size: 9 }, callback: value => `$${value}` },
      },
      y: {
        grid: { color: '#495157' },
        title: { display: true, text: 'Y/Y change (%)', color: '#c7cdd1', font: { size: 10 } },
        ticks: { color: '#bac1c6', font: { size: 9 }, callback: value => `${value}%` },
      },
    },
  }

  const payrollDirection = valid(model.headline.avg3) && valid(model.headline.avg12)
    ? model.headline.avg3 < model.headline.avg12 ? 'slower than' : 'faster than'
    : null

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="BLS · FRED" />
        <nav className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <Link href="/">Macro Data Monitor</Link> / <Link href="/#united-states">US Macro</Link> / Employment
          </div>
          <Link className={styles.backLink} href="/#united-states">← US dashboard</Link>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>United States · Labor</div>
          <h1>Employment Situation</h1>
          <p>
            Payroll momentum and revisions, labor supply and slack, wage pressure, and breadth by
            sector from the BLS Employment Situation, delivered through FRED.
          </p>
          <div className={styles.heroMeta}>
            <span><i className={styles.statusDot} />Latest observation: {latestMonth}</span>
            <span>Monthly · seasonally adjusted</span>
            <span>Updated {new Date(payload.fetchedAt).toLocaleString('en-US')}</span>
            <span>{warnings.length ? `Partial coverage · ${warnings.length} series unavailable` : 'Official feed complete'}</span>
          </div>
        </header>

        <nav className={styles.sectionNav} aria-label="Employment analysis sections">
          <a href="#payrolls">Payrolls</a>
          <a href="#labor-supply">Unemployment &amp; participation</a>
          <a href="#wages">Wages &amp; hours</a>
          <a href="#sectors">Sectors</a>
        </nav>

        <section className={styles.kpiGrid} aria-label="Latest employment readings">
          <KpiCard
            label="Nonfarm payrolls"
            value={thousands(model.headline.change)}
            valueClass={tone(model.headline.change)}
            unit={`M/M · ${latestMonth}`}
            metrics={[
              ['Prior', thousands(model.headline.prior), tone(model.headline.prior)],
              ['3M avg', thousands(model.headline.avg3), tone(model.headline.avg3)],
              ['6M avg', thousands(model.headline.avg6), tone(model.headline.avg6)],
              ['2M rev.', thousands(model.revision?.net), tone(model.revision?.net)],
            ]}
          />
          <KpiCard
            label="Unemployment rate"
            value={percent(model.unrate.value)}
            unit={`U-3 · ${monthLabel(model.unrate.date, true)}`}
            metrics={[
              ['1M Δ', signed(model.unrate.change1m, 1, 'pp'), tone(model.unrate.change1m, { digits: 1, invert: true })],
              ['12M Δ', signed(model.unrate.change12m, 1, 'pp'), tone(model.unrate.change12m, { digits: 1, invert: true })],
              ['U-6', percent(model.u6.value)],
              ['Sahm', signed(model.sahm.value, 2, 'pp'), tone(model.sahm.value, { digits: 2, invert: true })],
            ]}
          />
          <KpiCard
            label="Prime-age employment rate"
            value={percent(model.primeEpop.value)}
            unit={`Ages 25–54 · ${monthLabel(model.primeEpop.date, true)}`}
            metrics={[
              ['1M Δ', signed(model.primeEpop.change1m, 1, 'pp'), tone(model.primeEpop.change1m, { digits: 1 })],
              ['12M Δ', signed(model.primeEpop.change12m, 1, 'pp'), tone(model.primeEpop.change12m, { digits: 1 })],
              ['Prime LFPR', percent(model.primePart.value)],
              ['LFPR 16+', percent(model.civpart.value)],
            ]}
          />
          <KpiCard
            label="Average hourly earnings"
            value={percent(model.ahe.yoy, 2)}
            unit={`Y/Y · ${monthLabel(model.ahe.date, true)}`}
            metrics={[
              ['M/M', signed(model.ahe.change, 2, '%'), tone(model.ahe.change, { digits: 2 })],
              ['3M ann.', percent(model.ahe.annualized3m, 2)],
              ['Prod. Y/Y', percent(model.aheProd.yoy, 2)],
              ['Wkly hrs', valid(model.weeklyHours.value) ? model.weeklyHours.value.toFixed(1) : '—'],
            ]}
          />
        </section>

        <section className={styles.section} id="payrolls">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Payrolls</div><h2>How fast is hiring, and where?</h2></div>
            <p>
              {payrollDirection
                ? `The 3-month average (${thousands(model.headline.avg3)}) is running ${payrollDirection} the 12-month average (${thousands(model.headline.avg12)}).`
                : 'Establishment survey · thousands of jobs, seasonally adjusted.'}
            </p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Monthly payroll change by supersector</h3>
              <p className={styles.panelSub}>Thousands · supersectors add up to total nonfarm · line = 3-month average of the headline</p>
              <div className={styles.contributionChart}>
                <Bar data={stackedData} options={chartOptions({ format: thousands, stacked: true })} />
              </div>
              <p className={styles.chartFootnote}>
                Colors follow the supersector everywhere on this page.
                {valid(model.residual) && Math.abs(model.residual) >= 1 ? ` Published sector levels differ from the headline by ${model.residual.toFixed(0)}K because of rounding.` : ''}
              </p>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Latest readings</h3>
              <p className={styles.panelSub}>Monthly change in thousands · {latestMonth}</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Series</th><th>Latest</th><th>3M avg</th><th>6M avg</th><th>12M avg</th></tr></thead>
                  <tbody>
                    {model.payrollRows.map(row => (
                      <tr key={row.label}>
                        <td>
                          <span className={styles.tableName}>{row.label}</span>
                          <span className={styles.seriesId}>{row.id}</span>
                        </td>
                        <td className={tone(row.stats.change)}>{thousands(row.stats.change)}</td>
                        <td className={tone(row.stats.avg3)}>{thousands(row.stats.avg3)}</td>
                        <td className={tone(row.stats.avg6)}>{thousands(row.stats.avg6)}</td>
                        <td className={tone(row.stats.avg12)}>{thousands(row.stats.avg12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className={styles.panelTitle} style={{ marginTop: 18 }}>Revisions to the prior two months</h3>
              <p className={styles.panelSub}>
                {model.revisionVintage
                  ? `Total nonfarm change: previous release (ALFRED vintage ${model.revisionVintage}) versus now`
                  : 'Previous release vintage unavailable'}
              </p>
              {model.revision ? (
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.compactTable}`}>
                    <thead><tr><th>Month</th><th>Previous</th><th>Current</th><th>Revision</th></tr></thead>
                    <tbody>
                      {model.revision.months.map(month => (
                        <tr key={month.date}>
                          <td><span className={styles.tableName}>{monthLabel(month.date, true)}</span></td>
                          <td className={tone(month.previous)}>{thousands(month.previous)}</td>
                          <td className={tone(month.revised)}>{thousands(month.revised)}</td>
                          <td className={tone(month.revision)}>{thousands(month.revision)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><span className={styles.tableName}>Net two-month revision</span></td>
                        <td /><td />
                        <td className={tone(model.revision.net)}><strong>{thousands(model.revision.net)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className={styles.chartFootnote}>
                Private ex health care &amp; social assistance is derived (private minus that industry) to show hiring outside the
                two sectors that have carried recent gains alongside government.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} id="labor-supply">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Unemployment &amp; participation</div><h2>How much slack is there?</h2></div>
            <p>Household survey · seasonally adjusted. FOMC projections are the Summary of Economic Projections medians.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Unemployment rate and FOMC projections</h3>
              <p className={styles.panelSub}>
                UNRATE, UNRATEMD, UNRATEMDLR · January 2021 to the last projection year
                {model.sepLongRun ? ` · SEP of ${monthLabel(model.sepLongRun.date, true)}` : ''}
              </p>
              <div className={styles.chart}>
                <Line data={unrData} options={chartOptions()} />
              </div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Latest readings</h3>
              <p className={styles.panelSub}>Level and change in percentage points unless noted · green = labor market stronger, red = weaker</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Series</th><th>Latest</th><th>1M Δ</th><th>12M Δ</th></tr></thead>
                  <tbody>
                    {model.unemploymentRows.map(row => {
                      const digits = row.digits ?? 1
                      const unit = row.unit === '%' ? '%' : row.unit
                      const deltaUnit = row.unit === '%' ? 'pp' : row.unit
                      return (
                        <tr key={row.label}>
                          <td>
                            <span className={styles.tableName}>{row.label}</span>
                            <span className={styles.seriesId}>{row.id}</span>
                          </td>
                          <td>{valid(row.stats.value) ? `${row.stats.value.toFixed(digits)}${unit}` : '—'}</td>
                          <td className={tone(row.stats.change1m, { digits, invert: row.invert })}>{signed(row.stats.change1m, digits, deltaUnit)}</td>
                          <td className={tone(row.stats.change12m, { digits, invert: row.invert })}>{signed(row.stats.change12m, digits, deltaUnit)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className={styles.chartFootnote}>
                The Sahm indicator is FRED&apos;s real-time series (3-month average unemployment rate minus its 12-month low);
                readings of 0.50pp or more have historically coincided with recessions. It is a descriptive rule, not a forecast.
              </p>
            </div>
          </div>
          <div className={styles.equalCol} style={{ marginTop: 14 }}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>U-3 and U-6</h3>
              <p className={styles.panelSub}>Percent · last five years</p>
              <div className={styles.chartSmall}><Line data={u6Data} options={chartOptions()} /></div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Prime-age employment and participation</h3>
              <p className={styles.panelSub}>Percent · last ten years · ages 25–54, less affected by population aging than the 16+ rate</p>
              <div className={styles.chartSmall}><Line data={lfprData} options={chartOptions()} /></div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="wages">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Wages &amp; hours</div><h2>Is wage pressure easing?</h2></div>
            <p>Average hourly earnings shift with the mix of jobs; ECI and the Atlanta Fed tracker are less sensitive to that mix.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Wage growth measures</h3>
              <p className={styles.panelSub}>Percent · January 2022 to latest · ECI points are quarter-start months</p>
              <div className={styles.chart}><Line data={wageData} options={chartOptions({ format: value => percent(value, 2) })} /></div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Latest readings</h3>
              <p className={styles.panelSub}>Seasonally adjusted · Atlanta Fed values are published rates</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Series</th><th>M/M</th><th>3M ann.</th><th>Y/Y</th><th>Prior Y/Y</th></tr></thead>
                  <tbody>
                    {model.wageRows.map(row => (
                      <tr key={row.label}>
                        <td>
                          <span className={styles.tableName}>{row.label}</span>
                          <span className={styles.seriesId}>{row.id}</span>
                        </td>
                        {row.cells.map((cell, index) => <td key={index} className={cell?.className}>{cell?.text ?? cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.chartFootnote}>
                Average weekly hours, private: {valid(model.weeklyHours.value) ? `${model.weeklyHours.value.toFixed(1)} hours` : '—'}
                {valid(model.weeklyHours.change1m) ? ` (${signed(model.weeklyHours.change1m, 1)} vs prior month)` : ''}.
                Aggregate hours combine jobs and hours, a rough gauge of labor input.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} id="sectors">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Sectors</div><h2>Is hiring broad or narrow?</h2></div>
            <p>BLS industries grouped into supersectors. Information, financial and business services are grouped for readability.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Payroll change by industry</h3>
              <p className={styles.panelSub}>3-month average monthly change, thousands · latest month in the table</p>
              <div className={styles.contributionChart}>
                <Bar data={sectorBarData} options={sectorBarOptions} />
              </div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Wage level and wage growth by industry</h3>
              <p className={styles.panelSub}>
                Average hourly earnings and Y/Y change · all private {valid(model.overallWage.level) ? `$${model.overallWage.level.toFixed(2)}` : '—'}, {percent(model.overallWage.yoy, 2)} · government not covered
              </p>
              <div className={styles.contributionChart}>
                <Scatter data={scatterData} options={scatterOptions} plugins={[scatterLabels]} />
              </div>
            </div>
          </div>
          <div className={`${styles.panel} ${styles.detailPanel}`}>
            <div className={styles.tableHead}>
              <div>
                <h3 className={styles.panelTitle}>Industry detail</h3>
                <p className={styles.panelSub}>Employment, monthly change and wages · {latestMonth}</p>
              </div>
              <a className={styles.sourceLink} href="https://www.bls.gov/news.release/empsit.t17.htm" target="_blank" rel="noreferrer">BLS Table B-1 ↗</a>
            </div>
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.categoryTable}`}>
                <thead>
                  <tr><th>Industry</th><th>Jobs</th><th>Share</th><th>Latest</th><th>3M avg</th><th>Jobs Y/Y</th><th>AHE</th><th>AHE Y/Y</th></tr>
                </thead>
                <tbody>
                  {model.sectorTable.map(row => (
                    <tr key={row.key}>
                      <td style={row.top ? undefined : { paddingLeft: 24 }}>
                        <span className={styles.categoryName} style={row.top ? undefined : { fontWeight: 500 }}>
                          <i style={{ backgroundColor: familyColor(row.family) }} />{row.label}
                        </span>
                      </td>
                      <td>{valid(row.level) ? `${(row.level / 1000).toFixed(1)}M` : '—'}</td>
                      <td>{percent(row.share)}</td>
                      <td className={tone(row.change)}>{thousands(row.change)}</td>
                      <td className={tone(row.avg3)}>{thousands(row.avg3)}</td>
                      <td className={tone(row.yoy, { digits: 1 })}>{signed(row.yoy, 1, '%')}</td>
                      <td>{valid(row.ahe) ? `$${row.ahe.toFixed(2)}` : '—'}</td>
                      <td>{percent(row.aheYoy, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {warnings.length ? (
          <div className={styles.notice}>
            <div className={styles.noticeIcon}>!</div>
            <div>
              <strong>Some series are unavailable</strong>
              <p>{warnings.join(' · ')}. Affected cells show “—”; nothing is filled in.</p>
            </div>
          </div>
        ) : null}

        <footer className={styles.footer}>
          <div>
            Source: <a className={styles.sourceLink} href="https://www.bls.gov/news.release/empsit.htm" target="_blank" rel="noreferrer">BLS Employment Situation</a>,
            {' '}Federal Reserve Bank of Atlanta, FOMC Summary of Economic Projections, via{' '}
            <a className={styles.sourceLink} href="https://fred.stlouisfed.org/" target="_blank" rel="noreferrer">FRED</a> and ALFRED. Values are revised.
          </div>
          <div>Supersector grouping, private ex health care, revisions and wage rates are derived from official observations.</div>
        </footer>
      </div>
    </main>
  )
}
