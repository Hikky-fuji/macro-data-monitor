'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, Line } from 'react-chartjs-2'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { DashboardFreshness, DashboardState } from '../../components/DashboardStatus'
import {
  weightedContribution,
  weightedResidual,
} from '../../lib/us-cpi-scenarios.mjs'
import {
  cpiMetrics,
  indexRates,
  supercoreMetrics,
  supercoreYoyPath,
  yoyPath,
} from '../../lib/us-cpi-metrics.mjs'
import CpiScenarioLab from './CpiScenarioLab'
import styles from './page.module.css'

ChartJS.register(
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
)

const COLORS = {
  headline: '#2774ae',
  core: '#d97706',
  servicesExShelter: '#188977',
  supercore: '#c2417a',
  median: '#4fa3d9',
  trimmedMean: '#9fc46a',
  stickyCore: '#c48bd6',
  food: '#5c8fd6',
  energy: '#e2703a',
  coreGoods: '#91b982',
  rentOfShelter: '#e5ad16',
  medicalServices: '#8d7ed0',
  transportation: '#e56c62',
  otherCoreServices: '#44a99a',
}

const CATEGORY_STRUCTURE = [
  { key: 'food', role: 'Household salience' },
  { key: 'energy', role: 'Volatile headline driver' },
  { key: 'coreGoods', role: 'Cyclical / supply chain' },
  { key: 'rentOfShelter', role: 'Largest persistent block' },
  { key: 'medicalServices', role: 'Sticky service costs' },
  { key: 'transportation', role: 'High-beta services' },
  { key: 'otherCoreServices', label: 'Other Core Services', role: 'Wage-sensitive residual', derived: true },
]

const DETAIL_GROUPS = [
  {
    title: 'Core goods',
    keys: ['vehicles', 'usedCars', 'furnishings', 'apparel'],
  },
  {
    title: 'Core services',
    keys: ['rentOfShelter', 'rent', 'oer', 'medicalServices', 'medical', 'education', 'transportation'],
  },
]

const SPOTLIGHT_GROUPS = [
  {
    id: 'pce-bridge',
    title: 'CPI items that steer core PCE',
    sub: 'Weights or source data differ most between CPI and PCE',
    keys: ['airfares', 'lodging', 'hospital', 'professionalMedical', 'vehicleRepair'],
    note: 'PCE weights these items differently and takes most medical prices from the PPI, so CPI moves here are a directional read on core PCE, not an estimate of it. Motor vehicle insurance and physicians’ services are not delivered through FRED and are omitted.',
  },
  {
    id: 'import-goods',
    title: 'Import-intensive goods',
    sub: 'Analyst grouping for tariff monitoring · not a BLS aggregate',
    keys: ['newVehicles', 'vehicleParts', 'furnishings', 'apparel', 'footwear', 'toys', 'videoAudio'],
    note: 'Components are shown individually and not summed. Price moves here are descriptive and do not by themselves establish tariff pass-through.',
  },
]

const valid = value => Number.isFinite(value)
const signed = (value, digits = 2, suffix = '%') =>
  valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}` : '—'
const percent = (value, digits = 1) => valid(value) ? `${value.toFixed(digits)}%` : '—'

function pointMap(series) {
  return new Map((series?.observations || []).map(point => [point.date, point.value]))
}

function latestValid(series) {
  const values = series?.observations || []
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (valid(values[index].value)) return values[index]
  }
  return null
}

const metrics = cpiMetrics

function monthLabel(date, includeYear = false) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function KpiCard({ label, note, stats }) {
  return (
    <article className={styles.kpiCard}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.kpiTop}>
        <div className={styles.kpiValue}>{percent(stats.yoy)}</div>
        <div className={styles.kpiUnit}>Y/Y{stats.yoyBasis === 'SA' ? ' (SA fallback)' : ''} · {monthLabel(stats.date, true)}</div>
      </div>
      <div className={styles.metricRow}>
        <div><span>M/M</span><strong>{signed(stats.mom)}</strong></div>
        <div><span>3M ann.</span><strong>{percent(stats.annualized3m)}</strong></div>
        <div><span>6M ann.</span><strong>{percent(stats.annualized6m)}</strong></div>
        <div><span>Y/Y Δ</span><strong>{signed(stats.yoyChange, 1, 'pp')}</strong></div>
      </div>
      {note ? <div className={styles.panelSub} style={{ margin: '11px 0 0' }}>{note}</div> : null}
    </article>
  )
}

function chartOptions({ stacked = false, percentAxis = true } = {}) {
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
          label: context => `${context.dataset.label}: ${percent(context.parsed.y, 2)}`,
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
        ticks: {
          color: '#bac1c6',
          font: { size: 9 },
          callback: value => percentAxis ? `${value}%` : value,
        },
      },
    },
  }
}

export default function USCpiDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/us-cpi')
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load CPI data.')
        return body
      })
      .then(setPayload)
      .catch(fetchError => setError(fetchError.message))
  }, [])

  const model = useMemo(() => {
    if (!payload) return null
    const { series } = payload
    const headlineStats = metrics(series.headline)
    const coreStats = metrics(series.core)
    const servicesStats = metrics(series.servicesExShelter)
    const supercoreStats = supercoreMetrics(series, payload.contributionWeights, payload.aggregateWeights)

    const trendDates = series.headline.observations
      .filter(point => point.date >= '2021-01-01')
      .map(point => point.date)
    const toYoy = key => yoyPath(series[key], trendDates)

    const latestDates = trendDates.slice(-12)
    const categorySeriesKeys = ['food', 'energy', 'coreGoods', 'coreServices', 'rentOfShelter', 'medicalServices', 'transportation']
    const categoryYoy = Object.fromEntries(categorySeriesKeys.map(key => [key, yoyPath(series[key], latestDates)]))
    const rateAt = (key, date) => categoryYoy[key]?.[latestDates.indexOf(date)] ?? null
    const residualAt = date => weightedResidual(
      rateAt('coreServices', date),
      payload.aggregateWeights.coreServices,
      [
        { rate: rateAt('rentOfShelter', date), weight: payload.contributionWeights.rentOfShelter },
        { rate: rateAt('medicalServices', date), weight: payload.contributionWeights.medicalServices },
        { rate: rateAt('transportation', date), weight: payload.contributionWeights.transportation },
      ],
    )
    const contributions = Object.fromEntries(CATEGORY_STRUCTURE.map(category => [
      category.key,
      latestDates.map(date => category.derived
        ? residualAt(date)?.contribution ?? null
        : weightedContribution(rateAt(category.key, date), payload.contributionWeights[category.key])),
    ]))

    const detailRows = DETAIL_GROUPS.flatMap(group => group.keys.map(key => ({
      group: group.title,
      key,
      series: series[key],
      stats: metrics(series[key]),
    })))

    const largestMover = [...detailRows]
      .filter(row => valid(row.stats.mom))
      .sort((a, b) => Math.abs(b.stats.mom) - Math.abs(a.stats.mom))[0]

    const directCategoryStats = Object.fromEntries(
      CATEGORY_STRUCTURE.filter(category => !category.derived).map(category => [category.key, metrics(series[category.key])]),
    )
    const residualMetric = metric => weightedResidual(
      metrics(series.coreServices)[metric],
      payload.aggregateWeights.coreServices,
      [
        { rate: directCategoryStats.rentOfShelter[metric], weight: payload.contributionWeights.rentOfShelter },
        { rate: directCategoryStats.medicalServices[metric], weight: payload.contributionWeights.medicalServices },
        { rate: directCategoryStats.transportation[metric], weight: payload.contributionWeights.transportation },
      ],
    )?.rate ?? null
    const residualStats = {
      date: metrics(series.coreServices).date,
      mom: residualMetric('mom'),
      annualized3m: residualMetric('annualized3m'),
      annualized6m: residualMetric('annualized6m'),
      yoy: residualMetric('yoy'),
      yoyChange: residualMetric('yoyChange'),
    }
    const categoryRows = CATEGORY_STRUCTURE.map(category => {
      const stats = category.derived ? residualStats : directCategoryStats[category.key]
      const weight = payload.contributionWeights[category.key]
      return {
        ...category,
        label: category.label || series[category.key]?.label || category.key,
        weight,
        importance: weight >= 0.25 ? 'Critical weight' : weight >= 0.10 ? 'High weight' : 'Medium weight',
        stats,
        contribution: weightedContribution(stats.yoy, weight),
      }
    })

    const spotlight = SPOTLIGHT_GROUPS.map(group => ({
      ...group,
      rows: group.keys.map(key => ({ key, series: series[key], stats: metrics(series[key]) })),
    }))

    const underlying = payload.underlying || {}
    const atlanta = (yoyKey, threeMonthKey) => {
      const yoySeries = underlying[yoyKey]?.observations || []
      const latest = [...yoySeries].reverse().find(point => valid(point.value))
      const threeMonth = (underlying[threeMonthKey]?.observations || []).find(point => point.date === latest?.date)
      return { date: latest?.date, annualized3m: threeMonth?.value ?? null, yoy: latest?.value ?? null }
    }
    const annualizedMonthly = rate => valid(rate) ? ((1 + rate / 100) ** 12 - 1) * 100 : null
    const underlyingRows = [
      { key: 'core', label: 'Core CPI', publisher: 'BLS', basis: 'Reference · Y/Y from NSA', stats: { ...coreStats, annualized1m: annualizedMonthly(coreStats.mom) } },
      { key: 'median', label: underlying.median?.label, publisher: underlying.median?.publisher, basis: 'Derived from index', sourceUrl: underlying.median?.sourceUrl, stats: indexRates(underlying.median?.observations) },
      { key: 'trimmedMean', label: underlying.trimmedMean?.label, publisher: underlying.trimmedMean?.publisher, basis: 'Derived from index', sourceUrl: underlying.trimmedMean?.sourceUrl, stats: indexRates(underlying.trimmedMean?.observations) },
      { key: 'stickyCore', label: underlying.stickyCoreYoy?.label, publisher: underlying.stickyCoreYoy?.publisher, basis: 'Published rates', sourceUrl: underlying.stickyCoreYoy?.sourceUrl, stats: atlanta('stickyCoreYoy', 'stickyCore3m') },
      { key: 'flexible', label: underlying.flexibleYoy?.label, publisher: underlying.flexibleYoy?.publisher, basis: 'Published rates · incl. food & energy', sourceUrl: underlying.flexibleYoy?.sourceUrl, stats: atlanta('flexibleYoy', 'flexible3m') },
    ].filter(row => row.label)
    const underlyingDates = trendDates
    const indexYoy = key => yoyPath({ observations: underlying[key]?.observations }, underlyingDates)
    const publishedYoy = key => {
      const map = pointMap(underlying[key])
      return underlyingDates.map(date => map.get(date) ?? null)
    }

    return {
      headlineStats,
      coreStats,
      servicesStats,
      supercoreStats,
      spotlight,
      underlyingRows,
      underlyingData: {
        labels: underlyingDates.map(date => monthLabel(date, true)),
        datasets: [
          { label: 'Core CPI', data: toYoy('core'), borderColor: COLORS.core, backgroundColor: COLORS.core },
          { label: 'Median CPI', data: indexYoy('median'), borderColor: COLORS.median, backgroundColor: COLORS.median },
          { label: '16% Trimmed Mean', data: indexYoy('trimmedMean'), borderColor: COLORS.trimmedMean, backgroundColor: COLORS.trimmedMean },
          { label: 'Sticky-Price Core', data: publishedYoy('stickyCoreYoy'), borderColor: COLORS.stickyCore, backgroundColor: COLORS.stickyCore },
        ].map(dataset => ({ ...dataset, borderWidth: 2, pointRadius: 0, spanGaps: false })),
      },
      largestMover,
      detailRows,
      categoryRows,
      trendData: {
        labels: trendDates.map(date => monthLabel(date, true)),
        datasets: [
          { label: 'Headline', data: toYoy('headline'), borderColor: COLORS.headline, backgroundColor: COLORS.headline, borderWidth: 2.3, pointRadius: 0, spanGaps: false },
          { label: 'Core', data: toYoy('core'), borderColor: COLORS.core, backgroundColor: COLORS.core, borderWidth: 2.3, pointRadius: 0, spanGaps: false },
          { label: 'Supercore', data: supercoreYoyPath(series, payload.contributionWeights, payload.aggregateWeights, trendDates), borderColor: COLORS.supercore, backgroundColor: COLORS.supercore, borderWidth: 2.3, pointRadius: 0, spanGaps: false },
        ],
      },
      contributionData: {
        labels: latestDates.map(date => monthLabel(date)),
        datasets: CATEGORY_STRUCTURE.map(category => ({
          label: category.label || series[category.key]?.label,
          data: contributions[category.key],
          backgroundColor: COLORS[category.key],
          borderWidth: 0,
          borderRadius: 2,
        })),
      },
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
        <DashboardState message="Fetching the latest seasonally adjusted CPI indices from FRED." />
      </div>
    )
  }

  const latestMonth = monthLabel(model.headlineStats.date, true)
  const disinflating = model.headlineStats.yoy >= 0 && model.headlineStats.yoyChange < -0.05
  const inflationDirection = model.headlineStats.yoy < 0
    ? 'in deflation'
    : disinflating
      ? 'disinflating'
      : model.headlineStats.yoyChange > 0.05
        ? 'accelerating'
        : 'broadly stable'
  const directionClass = disinflating
    ? styles.cool
    : model.headlineStats.yoyChange > 0.05
      ? styles.hot
      : ''

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="BLS · FRED" />
        <nav className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <Link href="/">Macro Data Monitor</Link> / <Link href="/#united-states">US Macro</Link> / CPI
          </div>
          <Link className={styles.backLink} href="/#united-states">← US dashboard</Link>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>United States · Prices</div>
          <h1>Consumer Price Inflation</h1>
          <p>
            A high-signal view of headline, core and services inflation built from BLS series
            delivered through FRED: momentum from seasonally adjusted indices, year-over-year from
            unadjusted indices as BLS publishes it.
          </p>
          <div className={styles.heroMeta}>
            <span><i className={styles.statusDot} />Latest observation: {latestMonth}</span>
            <span>Monthly · SA momentum · NSA Y/Y</span>
            <span>Updated {new Date(payload.fetchedAt).toLocaleString('en-US')}</span>
            {payload.sourceStatus?.incompleteSeries?.length ? <span>Partial category coverage</span> : <span>Official feed complete</span>}
          </div>
        </header>

        <nav className={styles.sectionNav} aria-label="CPI analysis sections">
          <a href="#inflation-pulse">Inflation pulse</a>
          <a href="#scenario-lab">Scenario lab</a>
          <a href="#underlying">Underlying</a>
          <a href="#composition">Composition</a>
          <a href="#spotlight">PCE &amp; tariff watch</a>
        </nav>

        <section className={styles.kpiGrid} aria-label="Latest CPI readings">
          <KpiCard label="Headline CPI" stats={model.headlineStats} />
          <KpiCard label="Core CPI" stats={model.coreStats} note="Excludes food and energy" />
          <KpiCard label="Supercore" stats={model.supercoreStats} note="Core services ex rent of shelter · derived residual with fixed weights" />
          <KpiCard label="Services ex Shelter" stats={model.servicesStats} note="BLS services less rent of shelter; includes energy services" />
        </section>

        <section className={styles.section} id="inflation-pulse">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Inflation pulse</div><h2>Direction and persistence</h2></div>
            <p>Year-over-year rates use unadjusted indices and preserve the official October 2025 gap. The 2% line is a policy reference, not a CPI target.</p>
          </div>
          <div className={styles.twoCol}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Headline, core and supercore</h3>
              <p className={styles.panelSub}>Year-over-year change · January 2021 to latest</p>
              <div className={styles.chart}>
                <Line
                  data={{
                    ...model.trendData,
                    datasets: [
                      ...model.trendData.datasets,
                      {
                        label: '2% reference',
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
                  <strong className={directionClass}>
                    Headline inflation is {inflationDirection}
                  </strong>
                  <span>{signed(model.headlineStats.yoyChange, 1, 'pp')} versus the prior month on a year-over-year basis.</span>
                </li>
                <li>
                  <strong>Core momentum</strong>
                  <span>Core CPI is running at {percent(model.coreStats.annualized3m)} three-month and {percent(model.coreStats.annualized6m)} six-month annualized.</span>
                </li>
                <li>
                  <strong>Largest monthly mover</strong>
                  <span>{model.largestMover?.series.label}: {signed(model.largestMover?.stats.mom)} M/M.</span>
                </li>
                <li>
                  <strong>Supercore</strong>
                  <span>Core services ex rent of shelter is {percent(model.supercoreStats.yoy)} Y/Y and {signed(model.supercoreStats.mom)} M/M (derived).</span>
                </li>
              </ul>
            </aside>
          </div>
          <div className={styles.notice}>
            <div className={styles.noticeIcon}>!</div>
            <div>
              <strong>October 2025 data gap</strong>
              <p>
                BLS did not publish the October 2025 CPI release because data collection was suspended
                during the lapse in federal appropriations. The gap is intentionally not interpolated.
              </p>
            </div>
          </div>
        </section>

        <CpiScenarioLab series={payload.series} />


        <section className={styles.section} id="underlying">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Underlying inflation</div><h2>Is the pressure broad or narrow?</h2></div>
            <p>Reserve Bank measures that trim outliers or split prices by how often they change. Published by the Cleveland and Atlanta Feds, delivered through FRED.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Core CPI and underlying measures</h3>
              <p className={styles.panelSub}>Year-over-year change · January 2021 to latest</p>
              <div className={styles.chart}>
                <Line data={model.underlyingData} options={chartOptions()} />
              </div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Latest readings</h3>
              <p className={styles.panelSub}>Annualized momentum and year-over-year · seasonally adjusted except Core CPI Y/Y</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Measure</th><th>1M ann.</th><th>3M ann.</th><th>6M ann.</th><th>Y/Y</th></tr></thead>
                  <tbody>
                    {model.underlyingRows.map(row => (
                      <tr key={row.key}>
                        <td>
                          <span className={styles.tableName}>
                            {row.sourceUrl ? <a className={styles.sourceLink} href={row.sourceUrl} target="_blank" rel="noreferrer">{row.label} ↗</a> : row.label}
                          </span>
                          <span className={styles.seriesId}>{row.publisher} · {row.basis} · {monthLabel(row.stats.date, true)}</span>
                        </td>
                        <td>{percent(row.stats.annualized1m)}</td>
                        <td>{percent(row.stats.annualized3m)}</td>
                        <td>{percent(row.stats.annualized6m)}</td>
                        <td>{percent(row.stats.yoy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.chartFootnote}>
                Median and trimmed-mean rates are computed from the Cleveland Fed indices. The Atlanta Fed publishes only selected horizons, so missing cells are left blank rather than estimated. Flexible-price CPI includes food and energy and is shown for contrast.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} id="composition">
          <div className={styles.sectionHeader}>
            <div><div className={styles.sectionKicker}>Composition</div><h2>What is driving inflation?</h2></div>
            <p>Seven non-overlapping blocks using December 2025 CPI-U relative-importance weights.</p>
          </div>
          <div className={styles.compositionGrid}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Contribution by non-overlapping category</h3>
              <p className={styles.panelSub}>Approximate percentage points to year-over-year CPI</p>
              <div className={styles.contributionChart}>
                <Bar data={model.contributionData} options={chartOptions({ stacked: true })} />
              </div>
              <p className={styles.chartFootnote}>
                Other core services is the implied residual after rent of shelter, medical and transportation services are removed from core services.
              </p>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Weight, inflation speed and macro role</h3>
              <p className={styles.panelSub}>Latest seasonally adjusted momentum · contribution is approximate</p>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.categoryTable}`}>
                  <thead><tr><th>Category</th><th>Weight</th><th>M/M</th><th>3M ann.</th><th>Y/Y</th><th>Contribution</th><th>Macro role</th></tr></thead>
                  <tbody>
                    {model.categoryRows.map(row => (
                      <tr key={row.key}>
                        <td>
                          <span className={styles.categoryName}><i style={{ backgroundColor: COLORS[row.key] }} />{row.label}</span>
                          <span className={styles.seriesId}>{row.importance}{row.derived ? ' · IMPLIED RESIDUAL' : ''}</span>
                        </td>
                        <td>
                          <span className={styles.weightValue}>{percent(row.weight * 100, 1)}</span>
                          <span className={styles.weightTrack}><i style={{ width: `${Math.min(100, row.weight / 0.36 * 100)}%` }} /></span>
                        </td>
                        <td className={row.stats.mom >= 0 ? styles.positive : styles.negative}>{signed(row.stats.mom)}</td>
                        <td>{percent(row.stats.annualized3m)}</td>
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
          <div className={`${styles.panel} ${styles.detailPanel}`}>
            <div className={styles.tableHead}>
              <div>
                <h3 className={styles.panelTitle}>Detailed component monitor</h3>
                <p className={styles.panelSub}>Diagnostic subcategories may overlap the non-overlapping blocks above and are not added together.</p>
              </div>
              <a className={styles.sourceLink} href={payload.weightSourceUrl} target="_blank" rel="noreferrer">
                BLS weights · {payload.weightAsOf} ↗
              </a>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Group</th><th>Series</th><th>M/M</th><th>3M ann.</th><th>6M ann.</th><th>Y/Y</th></tr></thead>
                <tbody>
                  {model.detailRows.map(row => (
                    <tr key={row.key}>
                      <td><span className={styles.groupLabel}>{row.group}</span></td>
                      <td>
                        <span className={styles.tableName}>{row.series.label}</span>
                        <span className={styles.seriesId}>{row.series.id}</span>
                      </td>
                      <td className={row.stats.mom >= 0 ? styles.positive : styles.negative}>{signed(row.stats.mom)}</td>
                      <td>{percent(row.stats.annualized3m)}</td>
                      <td>{percent(row.stats.annualized6m)}</td>
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
            <div><div className={styles.sectionKicker}>Spotlight</div><h2>Core PCE bridge and tariff watch</h2></div>
            <p>Component monitors used in CPI-day analysis. Overlap the blocks above and are never summed.</p>
          </div>
          <div className={styles.equalCol}>
            {model.spotlight.map(group => (
              <div className={styles.panel} key={group.id}>
                <h3 className={styles.panelTitle}>{group.title}</h3>
                <p className={styles.panelSub}>{group.sub}</p>
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.compactTable}`}>
                    <thead><tr><th>Item</th><th>M/M</th><th>3M ann.</th><th>6M ann.</th><th>Y/Y</th></tr></thead>
                    <tbody>
                      {group.rows.map(row => (
                        <tr key={row.key}>
                          <td>
                            <span className={styles.tableName}>{row.series?.label}</span>
                            <span className={styles.seriesId}>{row.series?.id}</span>
                          </td>
                          <td className={row.stats.mom >= 0 ? styles.positive : styles.negative}>{signed(row.stats.mom)}</td>
                          <td>{percent(row.stats.annualized3m)}</td>
                          <td>{percent(row.stats.annualized6m)}</td>
                          <td>{percent(row.stats.yoy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.chartFootnote}>{group.note}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            Source: <a className={styles.sourceLink} href="https://fred.stlouisfed.org/" target="_blank" rel="noreferrer">FRED</a>
            {' '}and U.S. Bureau of Labor Statistics. Values may be revised.
          </div>
          <div>Supercore and Services ex Shelter are CPI measures, not the Federal Reserve&apos;s PCE services-ex-housing measure.</div>
        </footer>
      </div>
    </main>
  )
}
