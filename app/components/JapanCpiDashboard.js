'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, Line } from 'react-chartjs-2'
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
import { DashboardFreshness, DashboardState } from './DashboardStatus'
import { JAPAN_CPI_WEIGHTS } from '../lib/japan-cpi-config.mjs'
import { bridgeStats, momentumSignal, saMomentum, yoyMomentum } from '../lib/japan-cpi-momentum.mjs'
// National, Tokyo and US CPI dashboards share one layout and stylesheet.
import styles from '../us/cpi/page.module.css'

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = {
  headline: '#2774ae',
  core: '#d97706',
  corecore: '#188977',
  national: '#8d99a3',
  trimmedMean: '#9fc46a',
  weightedMedian: '#4fa3d9',
  mode: '#c48bd6',
  food: '#5c8fd6',
  housing: '#e5ad16',
  utilities: '#e2703a',
  furniture: '#91b982',
  apparel: '#d98bb0',
  medical: '#8d7ed0',
  transport_comms: '#e56c62',
  education: '#44a99a',
  leisure: '#6f8fb0',
  miscellaneous: '#9aa3a8',
}

// Ten major groups: non-overlapping and summing to the 2025-base basket.
const CATEGORY_STRUCTURE = [
  { key: 'food', label: 'Food', weightKey: 'food', mm: 'food_total_mm', role: 'Largest block · rice and imports' },
  { key: 'housing', label: 'Housing', weightKey: 'housing', mm: 'housing_mm', role: 'Mostly imputed rent · slow' },
  { key: 'transport_comms', label: 'Transport & Comms', weightKey: 'transportComms', mm: 'transport_comms_mm', role: 'Fuel, fares, mobile fees' },
  { key: 'leisure', label: 'Leisure & Culture', weightKey: 'leisure', mm: 'leisure_mm', role: 'Travel and services demand' },
  { key: 'utilities', label: 'Utilities', weightKey: 'utilities', mm: 'utilities_mm', role: 'Energy subsidies swing it' },
  { key: 'miscellaneous', label: 'Miscellaneous', weightKey: 'miscellaneous', mm: 'miscellaneous_mm', role: 'Personal care, insurance' },
  { key: 'medical', label: 'Medical', weightKey: 'medical', mm: 'medical_mm', role: 'Administered fees' },
  { key: 'furniture', label: 'Furniture & Household', weightKey: 'furniture', mm: 'furniture_mm', role: 'Durables · yen pass-through' },
  { key: 'education', label: 'Education', weightKey: 'education', mm: 'education_mm', role: 'Policy-driven tuition' },
  { key: 'apparel', label: 'Apparel & Footwear', weightKey: 'apparel', mm: 'apparel_mm', role: 'Seasonal sales pattern' },
]

const DETAIL_GROUPS = [
  {
    title: 'Goods',
    rows: [
      { key: 'food_ex_fresh', mm: 'food_mm', label: 'Food (ex. Fresh)' },
      { key: 'energy', mm: 'energy_mm', label: 'Energy' },
      { key: 'goods_ex_fresh', mm: 'goods_mm', label: 'Goods (ex. Fresh Food)' },
      { key: 'furniture', mm: 'furniture_mm', label: 'Furniture & Household' },
      { key: 'apparel', mm: 'apparel_mm', label: 'Apparel & Footwear' },
    ],
  },
  {
    title: 'Services',
    rows: [
      { key: 'services', mm: 'services_mm', label: 'Services (ex. Imputed Rent)' },
      { key: 'housing', mm: 'housing_mm', label: 'Housing' },
      { key: 'medical', mm: 'medical_mm', label: 'Medical & Healthcare' },
      { key: 'transport', mm: 'transport_mm', label: 'Transport' },
      { key: 'comms', mm: 'comms_mm', label: 'Communications' },
      { key: 'education', mm: 'education_mm', label: 'Education' },
      { key: 'leisure', mm: 'leisure_mm', label: 'Leisure & Culture' },
      { key: 'eating_out', mm: 'eating_out_mm', label: 'Eating Out' },
    ],
  },
]

const SPOTLIGHT_GROUPS = [
  {
    id: 'policy',
    title: 'Policy-driven prices',
    sub: 'Subsidies, free tuition and fee policy move these mechanically',
    rows: [
      { key: 'electricity', label: 'Electricity' },
      { key: 'gas', label: 'Gas' },
      { key: 'water', label: 'Water & Sewerage' },
      { key: 'tuition', label: 'Tuition' },
      { key: 'childcare', label: 'Childcare Fees' },
      { key: 'mobile', label: 'Mobile Phone Charges' },
    ],
    note: 'Large Y/Y moves here often reflect policy timing rather than demand, including local measures such as municipal fee waivers. The BOJ ex-institutional measures on the national page remove the institutional part of these effects.',
  },
  {
    id: 'salience',
    title: 'Household-salience and demand items',
    sub: 'Items that shape inflation perceptions or track services demand',
    rows: [
      { key: 'rice', label: 'Rice' },
      { key: 'eating_out', label: 'Eating Out' },
      { key: 'private_rent', label: 'Private Rent' },
      { key: 'accommodation', label: 'Accommodation' },
    ],
    note: 'Monitored items only; they overlap the groups above and are never summed. Accommodation is sensitive to inbound tourism and holiday timing.',
  },
]

const VARIANTS = {
  national: {
    api: '/api/cpi',
    source: 'MIC · e-Stat',
    crumb: 'CPI',
    eyebrow: 'Japan · Prices · 2025 Base',
    title: 'Consumer Price Inflation',
    intro: 'Headline, core and core-core inflation from the MIC national CPI via e-Stat. Year-over-year rates are official; momentum uses MIC’s seasonally adjusted aggregates, which exist only for headline, core, core-core, goods and services.',
    sibling: { href: '/tokyo-cpi', label: 'Tokyo CPI · early read →' },
    loading: 'Fetching the latest national CPI from e-Stat.',
  },
  tokyo: {
    api: '/api/tokyo-cpi',
    source: 'MIC · e-Stat · Tokyo ward area',
    crumb: 'Tokyo CPI',
    eyebrow: 'Japan · Tokyo ward area · 2025 Base',
    title: 'Tokyo Consumer Prices',
    intro: 'The Tokyo ward-area CPI is published about three weeks before the national CPI for the same month, which makes it the first official read on Japanese inflation. Same layout and definitions as the national dashboard, plus a section comparing the early Tokyo release with the national one.',
    sibling: { href: '/cpi', label: 'National CPI →' },
    loading: 'Fetching the latest Tokyo CPI from e-Stat.',
  },
}

const valid = value => Number.isFinite(value)
const signed = (value, digits = 1, suffix = '%') =>
  valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}` : '—'
const percent = (value, digits = 1) => valid(value) ? `${value.toFixed(digits)}%` : '—'

function monthLabel(date, includeYear = false) {
  if (!date) return '—'
  const [year, month] = date.split('/').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function seriesOn(series, dates) {
  const map = new Map((series || []).map(point => [point.date, point.value]))
  return dates.map(date => (valid(map.get(date)) ? map.get(date) : null))
}

function KpiCard({ label, note, stats, momentum }) {
  return (
    <article className={styles.kpiCard}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.kpiTop}>
        <div className={styles.kpiValue}>{percent(stats.yoy)}</div>
        <div className={styles.kpiUnit}>Y/Y · {monthLabel(stats.date, true)}</div>
      </div>
      <div className={styles.metricRow}>
        <div><span>M/M SA</span><strong>{signed(momentum.mom)}</strong></div>
        <div><span>3M ann.</span><strong>{percent(momentum.annualized3m)}</strong></div>
        <div><span>6M ann.</span><strong>{percent(momentum.annualized6m)}</strong></div>
        <div><span>Y/Y Δ</span><strong>{signed(stats.yoyChange, 1, 'pp')}</strong></div>
      </div>
      {note ? <div className={styles.panelSub} style={{ margin: '11px 0 0' }}>{note}</div> : null}
    </article>
  )
}

function chartOptions({ stacked = false, unit = '%' } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, color: '#c7cdd1', font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          // Horizontal bars carry the value on x; y is the category index.
          label: context => {
            const value = context.chart.options.indexAxis === 'y' ? context.parsed.x : context.parsed.y
            return `${context.dataset.label}: ${valid(value) ? value.toFixed(2) : '—'}${unit}`
          },
        },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        ticks: { maxTicksLimit: 12, color: '#bac1c6', font: { size: 9 } },
      },
      y: {
        stacked,
        grid: { color: '#495157' },
        ticks: { color: '#bac1c6', font: { size: 9 }, callback: value => `${value}${unit}` },
      },
    },
  }
}

function ComponentTable({ rows }) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.compactTable}`}>
        <thead><tr><th>Item</th><th>M/M NSA</th><th>3MMA</th><th>Y/Y Δ</th><th>Y/Y</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key}>
              <td><span className={styles.tableName}>{row.label}</span></td>
              <td>{signed(row.stats.monthlyNsa)}</td>
              <td>{percent(row.stats.mma3)}</td>
              <td>{signed(row.stats.yoyChange, 1, 'pp')}</td>
              <td>{percent(row.stats.yoy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function JapanCpiDashboard({ variant = 'national' }) {
  const config = VARIANTS[variant]
  const isTokyo = variant === 'tokyo'
  const [data, setData] = useState(null)
  const [boj, setBoj] = useState(null)
  const [national, setNational] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(config.api)
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load CPI.')
        return body
      })
      .then(setData)
      .catch(fetchError => setError(fetchError.message))
    // Secondary feeds: BOJ underlying measures (national) or the national CPI
    // for group comparisons (Tokyo). The page renders without them.
    const optional = (path, accept, set) => fetch(path)
      .then(response => (response.ok ? response.json() : null))
      .then(body => set(accept(body) ? body : null))
      .catch(() => set(null))
    if (isTokyo) optional('/api/cpi', body => body?.headline?.length, setNational)
    else optional('/api/boj-policy', body => body?.coreInflation, setBoj)
  }, [config.api, isTokyo])

  const model = useMemo(() => {
    if (!data?.headline?.length) return null
    const stats = key => yoyMomentum(data[key], data[`${key}_mm`])
    const headlineStats = stats('headline')
    const coreStats = stats('core')
    const corecoreStats = stats('corecore')
    const servicesStats = yoyMomentum(data.services_total)
    const momentum = {
      headline: saMomentum(data.headline_sa, data.headline_sa_mm),
      core: saMomentum(data.core_sa, data.core_sa_mm),
      corecore: saMomentum(data.corecore_sa, data.corecore_sa_mm),
      services: saMomentum(data.services_sa, data.services_sa_mm),
    }

    const trendDates = data.headline.map(point => point.date)
    const exImputedStats = stats('services')

    const latestDates = trendDates.slice(-12)
    const contributions = Object.fromEntries(CATEGORY_STRUCTURE.map(category => [
      category.key,
      seriesOn(data.contrib?.[category.key], latestDates),
    ]))
    const categoryRows = CATEGORY_STRUCTURE.map(category => {
      const weight = JAPAN_CPI_WEIGHTS[category.weightKey] / 10000
      const rowStats = yoyMomentum(data[category.key], data[category.mm])
      // Tokyo: compare with the national rate for the same month (national
      // publishes about three weeks later, so its latest month may lag).
      const nationalSeries = national?.[category.key] || []
      const nationalPoint = nationalSeries.find(point => point.date === rowStats.date) || nationalSeries.at(-1)
      return {
        ...category,
        weight,
        importance: weight >= 0.2 ? 'Critical weight' : weight >= 0.08 ? 'High weight' : 'Medium weight',
        stats: rowStats,
        contribution: valid(rowStats.yoy) ? rowStats.yoy * weight : null,
        nationalYoy: valid(nationalPoint?.value) ? nationalPoint.value : null,
        nationalDate: nationalPoint?.date ?? null,
      }
    })
    const comparisonDate = categoryRows.find(row => row.nationalDate)?.nationalDate ?? null
    const tokyoOnDate = (key, date) => (data[key] || []).find(point => point.date === date)?.value ?? null

    const bridgeRows = isTokyo && data.history ? [
      { key: 'headline', label: 'Headline' },
      { key: 'core', label: 'Core (ex. Fresh Food)' },
      { key: 'corecore', label: 'Core-Core (ex. Fresh Food & Energy)' },
    ].map(row => ({ ...row, stats: bridgeStats(data.history.tokyo?.[row.key], data.history.national?.[row.key]) }))
      .filter(row => row.stats) : []
    const bridgeDates = isTokyo && data.history?.tokyo?.core?.length
      ? data.history.tokyo.core.map(point => point.date)
      : []

    const detailRows = DETAIL_GROUPS.flatMap(group => group.rows.map(row => ({
      ...row,
      group: group.title,
      stats: yoyMomentum(data[row.key], data[row.mm]),
    })))
    const largestShift = [...detailRows]
      .filter(row => valid(row.stats.yoyChange))
      .sort((a, b) => Math.abs(b.stats.yoyChange) - Math.abs(a.stats.yoyChange))[0]

    const spotlight = SPOTLIGHT_GROUPS.map(group => ({
      ...group,
      rows: group.rows.map(row => ({ ...row, stats: yoyMomentum(data[row.key], data[`${row.key}_mm`]) })),
    }))

    const underlyingSeries = boj?.coreInflation || {}
    const underlyingRows = [
      { key: 'core', label: 'Core (ex. Fresh Food)', publisher: 'MIC', basis: 'Reference', series: data.core },
      { key: 'exFreshInstitutional', label: 'Core ex. Institutional Factors', publisher: 'BOJ', basis: 'Removes policy-driven price changes', series: underlyingSeries.exFreshInstitutional },
      { key: 'exFreshEnergyInstitutional', label: 'Core-Core ex. Institutional', publisher: 'BOJ', basis: 'Ex. fresh food, energy, institutional', series: underlyingSeries.exFreshEnergyInstitutional },
      { key: 'trimmedMean', label: 'Trimmed Mean', publisher: 'BOJ', basis: 'Drops the 10% tails each side', series: underlyingSeries.trimmedMean },
      { key: 'weightedMedian', label: 'Weighted Median', publisher: 'BOJ', basis: 'Middle of the price-change distribution', series: underlyingSeries.weightedMedian },
      { key: 'mode', label: 'Mode', publisher: 'BOJ', basis: 'Most frequent price change', series: underlyingSeries.mode },
    ]
      .filter(row => row.series?.length)
      .map(row => ({ ...row, stats: yoyMomentum(row.series) }))
    const diffusion = underlyingSeries.diffusionIndex?.length ? {
      date: underlyingSeries.diffusionIndex.at(-1).date,
      value: underlyingSeries.diffusionIndex.at(-1).value,
      rising: underlyingSeries.shareIncreasing?.at(-1)?.value,
      falling: underlyingSeries.shareDecreasing?.at(-1)?.value,
    } : null

    return {
      headlineStats,
      coreStats,
      corecoreStats,
      servicesStats,
      exImputedStats,
      momentum,
      categoryRows,
      detailRows,
      largestShift,
      spotlight,
      underlyingRows,
      diffusion,
      bridgeRows,
      comparisonDate,
      comparisonData: comparisonDate ? {
        labels: CATEGORY_STRUCTURE.map(category => category.label),
        datasets: [
          { label: `Tokyo · ${monthLabel(comparisonDate, true)}`, data: CATEGORY_STRUCTURE.map(category => tokyoOnDate(category.key, comparisonDate)), backgroundColor: COLORS.headline },
          { label: `National · ${monthLabel(comparisonDate, true)}`, data: categoryRows.map(row => row.nationalYoy), backgroundColor: COLORS.national },
        ].map(dataset => ({ ...dataset, borderWidth: 0, borderRadius: 2 })),
      } : null,
      bridgeData: bridgeDates.length ? {
        labels: bridgeDates.map(date => monthLabel(date, true)),
        datasets: [
          { label: 'Tokyo core', data: seriesOn(data.history.tokyo.core, bridgeDates), borderColor: COLORS.core, backgroundColor: COLORS.core, borderWidth: 2.3 },
          { label: 'National core', data: seriesOn(data.history.national?.core, bridgeDates), borderColor: COLORS.national, backgroundColor: COLORS.national, borderWidth: 2 },
        ].map(dataset => ({ ...dataset, pointRadius: 0, spanGaps: false })),
      } : null,
      trendData: {
        labels: trendDates.map(date => monthLabel(date, true)),
        datasets: [
          { label: 'Headline', data: seriesOn(data.headline, trendDates), borderColor: COLORS.headline, backgroundColor: COLORS.headline },
          { label: 'Core (ex. Fresh Food)', data: seriesOn(data.core, trendDates), borderColor: COLORS.core, backgroundColor: COLORS.core },
          { label: 'Core-Core (ex. Fresh Food & Energy)', data: seriesOn(data.corecore, trendDates), borderColor: COLORS.corecore, backgroundColor: COLORS.corecore },
        ].map(dataset => ({ ...dataset, borderWidth: 2.3, pointRadius: 0, spanGaps: false })),
      },
      underlyingData: {
        labels: trendDates.map(date => monthLabel(date, true)),
        datasets: [
          { label: 'Core', data: seriesOn(data.core, trendDates), borderColor: COLORS.core, backgroundColor: COLORS.core },
          { label: 'Trimmed Mean', data: seriesOn(underlyingSeries.trimmedMean, trendDates), borderColor: COLORS.trimmedMean, backgroundColor: COLORS.trimmedMean },
          { label: 'Weighted Median', data: seriesOn(underlyingSeries.weightedMedian, trendDates), borderColor: COLORS.weightedMedian, backgroundColor: COLORS.weightedMedian },
          { label: 'Mode', data: seriesOn(underlyingSeries.mode, trendDates), borderColor: COLORS.mode, backgroundColor: COLORS.mode },
        ].map(dataset => ({ ...dataset, borderWidth: 2, pointRadius: 0, spanGaps: false })),
      },
      contributionData: {
        labels: latestDates.map(date => monthLabel(date)),
        datasets: CATEGORY_STRUCTURE.map(category => ({
          label: category.label,
          data: contributions[category.key],
          backgroundColor: COLORS[category.key],
          borderWidth: 0,
          borderRadius: 2,
        })),
      },
    }
  }, [data, boj, national, isTokyo])

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
        <DashboardState message={config.loading} />
      </div>
    )
  }

  const latestMonth = monthLabel(model.headlineStats.date, true)
  const direction = momentumSignal(model.coreStats.mma3Change)
  const directionClass = direction === 'Cooling' ? styles.cool : direction === 'Accelerating' ? styles.hot : ''

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={data} source={config.source} />
        <nav className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <Link href="/">Macro Data Monitor</Link> / <Link href="/#japan">Japan</Link> / {config.crumb}
          </div>
          <Link className={styles.backLink} href="/#japan">← Japan dashboard</Link>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>{config.eyebrow}</div>
          <h1>{config.title}</h1>
          <p>{config.intro}</p>
          <div className={styles.heroMeta}>
            <span><i className={styles.statusDot} />Latest observation: {latestMonth}</span>
            <span>Monthly · official Y/Y · SA momentum for aggregates</span>
            {data.meta?.partial ? <span>Partial category coverage</span> : <span>Official feed complete</span>}
            <Link className={styles.sourceLink} href={config.sibling.href}>{config.sibling.label}</Link>
          </div>
        </header>

        <nav className={styles.sectionNav} aria-label="CPI analysis sections">
          <a href="#inflation-trend">Inflation trend</a>
          {isTokyo ? <a href="#leading">Lead on national</a> : <a href="#underlying">Underlying</a>}
          <a href="#composition">Composition</a>
          <a href="#spotlight">Policy &amp; salience watch</a>
        </nav>

        <section className={styles.kpiGrid} aria-label="Latest CPI readings">
          <KpiCard label="Headline CPI" stats={model.headlineStats} momentum={model.momentum.headline} />
          <KpiCard label="Core CPI" stats={model.coreStats} momentum={model.momentum.core} note="Excludes fresh food · BOJ's reference measure" />
          <KpiCard label="Core-Core CPI" stats={model.corecoreStats} momentum={model.momentum.corecore} note="Excludes fresh food and energy" />
          <KpiCard label="Services" stats={model.servicesStats} momentum={model.momentum.services} note="All services incl. imputed rent (matches the SA series)" />
        </section>

        <section className={styles.section} id="inflation-trend">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Inflation trend</div><h2>Direction and persistence</h2></div>
            <p>Official year-over-year rates. The 2% line is the BOJ price-stability target.</p>
          </div>
          <div className={styles.twoCol}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Headline, core and core-core</h3>
              <p className={styles.panelSub}>Year-over-year change · latest 24 months</p>
              <div className={styles.chart}>
                <Line
                  data={{
                    ...model.trendData,
                    datasets: [
                      ...model.trendData.datasets,
                      {
                        label: '2% target',
                        data: model.trendData.labels.map(() => 2),
                        borderColor: '#626b71',
                        borderDash: [5, 5],
                        borderWidth: 1,
                        pointRadius: 0,
                      },
                    ],
                  }}
                  options={chartOptions()}
                />
              </div>
            </div>
            <aside className={styles.insight}>
              <h3>Latest read</h3>
              <ul className={styles.insightList}>
                <li>
                  <strong className={directionClass}>Core trend is {direction.toLowerCase()}</strong>
                  <span>Core 3MMA {percent(model.coreStats.mma3, 2)}, {signed(model.coreStats.mma3Change, 2, 'pp')} versus the prior month.</span>
                </li>
                <li>
                  <strong>Core-core momentum</strong>
                  <span>Seasonally adjusted core-core is running at {percent(model.momentum.corecore.annualized3m)} three-month and {percent(model.momentum.corecore.annualized6m)} six-month annualized.</span>
                </li>
                <li>
                  <strong>Largest Y/Y shift</strong>
                  <span>{model.largestShift?.label}: {signed(model.largestShift?.stats.yoyChange, 1, 'pp')} to {percent(model.largestShift?.stats.yoy)} Y/Y.</span>
                </li>
                <li>
                  <strong>Services ex. imputed rent</strong>
                  <span>{percent(model.exImputedStats.yoy)} Y/Y, 3MMA {percent(model.exImputedStats.mma3)}: the market-priced part of services.</span>
                </li>
              </ul>
            </aside>
          </div>
        </section>

        {isTokyo ? (
        <section className={styles.section} id="leading">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Leading indicator</div><h2>What Tokyo says before the national release</h2></div>
            <p>Tokyo is published about three weeks ahead of the national CPI for the same month. The record below is descriptive, not a forecast.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Tokyo core and national core</h3>
              <p className={styles.panelSub}>Year-over-year change · Tokyo extends one month further when national is pending</p>
              {model.bridgeData ? (
                <div className={styles.chart}>
                  <Line data={model.bridgeData} options={chartOptions()} />
                </div>
              ) : <p className={styles.panelSub}>History is temporarily unavailable.</p>}
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Gap and direction record</h3>
              <p className={styles.panelSub}>Gap = national − Tokyo, same month · direction = share of months Tokyo&apos;s Y/Y change had the same sign as national&apos;s</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Measure</th><th>Tokyo</th><th>National</th><th>Gap</th><th>3Y avg gap</th><th>Same direction</th></tr></thead>
                  <tbody>
                    {model.bridgeRows.map(row => (
                      <tr key={row.key}>
                        <td>
                          <span className={styles.tableName}>{row.label}</span>
                          <span className={styles.seriesId}>
                            Tokyo {monthLabel(row.stats.tokyoLatest.date, true)} {signed(row.stats.tokyoChange, 1, 'pp')} m/m · national {monthLabel(row.stats.nationalLatest.date, true)}
                          </span>
                        </td>
                        <td>{percent(row.stats.tokyoLatest.value)}</td>
                        <td>{percent(row.stats.nationalLatest.value)}</td>
                        <td>{signed(row.stats.gapLatest?.value, 1, 'pp')}</td>
                        <td>{signed(row.stats.gapMean, 2, 'pp')} <span className={styles.seriesId}>σ {valid(row.stats.gapSd) ? row.stats.gapSd.toFixed(2) : '—'}</span></td>
                        <td>{valid(row.stats.directionMatch) ? `${Math.round(row.stats.directionMatch * 100)}%` : '—'} <span className={styles.seriesId}>n={row.stats.directionSample}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.chartFootnote}>
                Direction uses the latest 60 months in which Tokyo&apos;s Y/Y changed; the gap uses the latest 36 overlapping months. Tokyo weights rent more and energy less than the national basket, and local policies (for example free childcare or water-fee waivers) can open temporary gaps. The national CPI remains the official measure.
              </p>
            </div>
          </div>
        </section>
        ) : (
        <section className={styles.section} id="underlying">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Underlying inflation</div><h2>Is the pressure broad or narrow?</h2></div>
            <p>BOJ measures that remove institutional factors, trim outliers or track the centre of the price-change distribution.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Core CPI and BOJ underlying measures</h3>
              <p className={styles.panelSub}>Year-over-year change · latest 24 months</p>
              <div className={styles.chart}>
                <Line data={model.underlyingData} options={chartOptions()} />
              </div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Latest readings</h3>
              <p className={styles.panelSub}>Year-over-year rates · BOJ publishes no seasonally adjusted momentum for these</p>
              {model.underlyingRows.length > 1 ? (
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.compactTable}`}>
                    <thead><tr><th>Measure</th><th>3MMA</th><th>3MMA Δ</th><th>Y/Y Δ</th><th>Y/Y</th></tr></thead>
                    <tbody>
                      {model.underlyingRows.map(row => (
                        <tr key={row.key}>
                          <td>
                            <span className={styles.tableName}>{row.label}</span>
                            <span className={styles.seriesId}>{row.publisher} · {row.basis} · {monthLabel(row.stats.date, true)}</span>
                          </td>
                          <td>{percent(row.stats.mma3, 2)}</td>
                          <td>{signed(row.stats.mma3Change, 2, 'pp')}</td>
                          <td>{signed(row.stats.yoyChange, 1, 'pp')}</td>
                          <td>{percent(row.stats.yoy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.panelSub}>BOJ underlying measures are temporarily unavailable.</p>
              )}
              <p className={styles.chartFootnote}>
                {model.diffusion
                  ? `Diffusion index ${model.diffusion.value.toFixed(1)} (${monthLabel(model.diffusion.date, true)}): ${percent(model.diffusion.rising)} of items rising minus ${percent(model.diffusion.falling)} falling. `
                  : ''}
                Source: <a className={styles.sourceLink} href="https://www.boj.or.jp/en/research/research_data/cpi/index.htm" target="_blank" rel="noreferrer">BOJ Measures of Underlying Inflation ↗</a>. BOJ links its per-base columns without rebasing earlier periods.
              </p>
            </div>
          </div>
        </section>
        )}

        <section className={styles.section} id="composition">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Composition</div><h2>What is driving inflation?</h2></div>
            <p>
              {isTokyo
                ? 'Ten non-overlapping major groups. Tokyo weights are not delivered through the e-Stat API, so groups are compared with national rates instead of summed into contributions.'
                : 'Ten non-overlapping major groups using official 2025-base weights (per 10,000).'}
            </p>
          </div>
          {isTokyo ? (
            <div className={styles.compositionGrid}>
              <div className={styles.panel}>
                <h3 className={styles.panelTitle}>Tokyo vs national by major group</h3>
                <p className={styles.panelSub}>Year-over-year change for the latest month both areas have published</p>
                {model.comparisonData ? (
                  <div className={styles.contributionChart}>
                    <Bar data={model.comparisonData} options={{ ...chartOptions(), indexAxis: 'y', interaction: { mode: 'index', axis: 'y', intersect: false }, scales: { x: { grid: { color: '#495157' }, ticks: { color: '#bac1c6', font: { size: 9 }, callback: value => `${value}%` } }, y: { grid: { display: false }, ticks: { color: '#bac1c6', font: { size: 9 } } } } }} />
                  </div>
                ) : <p className={styles.panelSub}>National comparison is temporarily unavailable.</p>}
              </div>
              <div className={styles.panel}>
                <h3 className={styles.panelTitle}>Tokyo group momentum</h3>
                <p className={styles.panelSub}>Official Y/Y · M/M is not seasonally adjusted · national column shows its latest published month</p>
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.categoryTable}`}>
                    <thead><tr><th>Group</th><th>M/M NSA</th><th>3MMA</th><th>Y/Y</th><th>National</th><th>Role</th></tr></thead>
                    <tbody>
                      {model.categoryRows.map(row => (
                        <tr key={row.key}>
                          <td>
                            <span className={styles.categoryName}><i style={{ backgroundColor: COLORS[row.key] }} />{row.label}</span>
                            <span className={styles.seriesId}>Tokyo · {monthLabel(row.stats.date, true)}</span>
                          </td>
                          <td className={row.stats.monthlyNsa >= 0 ? styles.positive : styles.negative}>{signed(row.stats.monthlyNsa)}</td>
                          <td>{percent(row.stats.mma3)}</td>
                          <td>{percent(row.stats.yoy)}</td>
                          <td>{percent(row.nationalYoy)}<span className={styles.seriesId}>{monthLabel(row.nationalDate, true)}</span></td>
                          <td><span className={styles.roleBadge}>{row.role}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Contribution by major group</h3>
              <p className={styles.panelSub}>Approximate percentage points to year-over-year headline CPI</p>
              <div className={styles.contributionChart}>
                <Bar data={model.contributionData} options={chartOptions({ stacked: true, unit: 'pp' })} />
              </div>
              <p className={styles.chartFootnote}>
                Group Y/Y × fixed base-year weight; it differs from MIC&apos;s official contribution table as relative prices drift.
              </p>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Weight, inflation speed and role</h3>
              <p className={styles.panelSub}>Official Y/Y · M/M is not seasonally adjusted · contribution is approximate</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.categoryTable}`}>
                  <thead><tr><th>Group</th><th>Weight</th><th>M/M NSA</th><th>3MMA</th><th>Y/Y</th><th>Contribution</th><th>Role</th></tr></thead>
                  <tbody>
                    {model.categoryRows.map(row => (
                      <tr key={row.key}>
                        <td>
                          <span className={styles.categoryName}><i style={{ backgroundColor: COLORS[row.key] }} />{row.label}</span>
                          <span className={styles.seriesId}>{row.importance}</span>
                        </td>
                        <td>
                          <span className={styles.weightValue}>{percent(row.weight * 100, 1)}</span>
                          <span className={styles.weightTrack}><i style={{ width: `${Math.min(100, row.weight / 0.28 * 100)}%` }} /></span>
                        </td>
                        <td className={row.stats.monthlyNsa >= 0 ? styles.positive : styles.negative}>{signed(row.stats.monthlyNsa)}</td>
                        <td>{percent(row.stats.mma3)}</td>
                        <td>{percent(row.stats.yoy)}</td>
                        <td>{signed(row.contribution, 2, 'pp')}</td>
                        <td><span className={styles.roleBadge}>{row.role}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )}
          <div className={`${styles.panel} ${styles.detailPanel}`}>
            <div className={styles.tableHead}>
              <div>
                <h3 className={styles.panelTitle}>Detailed component monitor</h3>
                <p className={styles.panelSub}>Diagnostic categories may overlap the major groups above and are not added together. 3MMA is the average of the latest three official Y/Y rates.</p>
              </div>
              <a className={styles.sourceLink} href="https://www.stat.go.jp/english/data/cpi/" target="_blank" rel="noreferrer">
                MIC CPI · 2025 Base ↗
              </a>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Group</th><th>Series</th><th>M/M NSA</th><th>3MMA</th><th>3MMA Δ</th><th>Y/Y</th></tr></thead>
                <tbody>
                  {model.detailRows.map(row => (
                    <tr key={row.key}>
                      <td><span className={styles.groupLabel}>{row.group}</span></td>
                      <td><span className={styles.tableName}>{row.label}</span></td>
                      <td className={row.stats.monthlyNsa >= 0 ? styles.positive : styles.negative}>{signed(row.stats.monthlyNsa)}</td>
                      <td>{percent(row.stats.mma3)}</td>
                      <td>{signed(row.stats.mma3Change, 2, 'pp')}</td>
                      <td>{percent(row.stats.yoy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={styles.section} id="spotlight">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Spotlight</div><h2>Policy and household-salience watch</h2></div>
            <p>Item monitors for Japan-specific drivers. They overlap the groups above and are never summed.</p>
          </div>
          <div className={styles.equalCol}>
            {model.spotlight.map(group => (
              <div className={styles.panel} key={group.id}>
                <h3 className={styles.panelTitle}>{group.title}</h3>
                <p className={styles.panelSub}>{group.sub}</p>
                <ComponentTable rows={group.rows} />
                <p className={styles.chartFootnote}>{group.note}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            Source: Ministry of Internal Affairs and Communications (MIC) via{' '}
            <a className={styles.sourceLink} href="https://www.e-stat.go.jp/" target="_blank" rel="noreferrer">e-Stat</a>{isTokyo ? ' · Tokyo ward area (preliminary each month; final with the national release)' : '; underlying measures from the Bank of Japan'}.
          </div>
          <div>Detailed series are not seasonally adjusted; no annualized rate is derived from them.</div>
        </footer>
      </div>
    </main>
  )
}
