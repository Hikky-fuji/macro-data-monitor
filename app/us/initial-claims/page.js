'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardFreshness } from '../../components/DashboardStatus'
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
  blue: '#42a9bc',
  orange: '#f08a24',
  green: '#60d4af',
  red: '#ff6b6b',
  violet: '#a99af0',
  grid: '#4a5258',
  muted: '#c7cdd1',
}

const valid = value => Number.isFinite(value)
const last = values => values?.length ? values[values.length - 1] : null
const compactClaims = value => valid(value)
  ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  : '—'
const signedClaims = value => valid(value)
  ? `${value > 0 ? '+' : ''}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`
  : '—'
const signedPercent = value => valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : '—'
const percent = value => valid(value) ? `${value.toFixed(1)}%` : '—'

function weekLabel(date, withYear = false) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function movingAverage(observations, windowSize) {
  return observations.map((point, index) => {
    if (index < windowSize - 1) return null
    const window = observations.slice(index - windowSize + 1, index + 1)
    if (window.some(item => !valid(item.value))) return null
    return window.reduce((sum, item) => sum + item.value, 0) / windowSize
  })
}

function valueWeeksAgo(observations, weeks) {
  return observations.length > weeks ? observations.at(-1 - weeks)?.value : null
}

function yearAgoValue(observations, latestDate) {
  if (!latestDate) return null
  const target = new Date(`${latestDate}T00:00:00Z`)
  target.setUTCFullYear(target.getUTCFullYear() - 1)
  const targetTime = target.getTime()

  return observations.reduce((closest, point) => {
    if (!valid(point.value)) return closest
    const distance = Math.abs(new Date(`${point.date}T00:00:00Z`).getTime() - targetTime)
    return !closest || distance < closest.distance ? { value: point.value, distance } : closest
  }, null)?.value ?? null
}

function percentileRank(values, current) {
  const clean = values.filter(valid)
  if (!clean.length || !valid(current)) return null
  return clean.filter(value => value <= current).length / clean.length * 100
}

function regimeFor({ percentile, momentum13, continuedYoy }) {
  let score = 0
  if (percentile >= 80) score += 2
  else if (percentile >= 60) score += 1
  if (momentum13 >= 15) score += 2
  else if (momentum13 >= 5) score += 1
  if (continuedYoy >= 10) score += 2
  else if (continuedYoy >= 3) score += 1

  if (score >= 5) return { label: 'High stress', tone: 'danger', score }
  if (score >= 3) return { label: 'Elevated', tone: 'warning', score }
  if (score >= 1) return { label: 'Normalizing', tone: 'neutral', score }
  return { label: 'Low stress', tone: 'positive', score }
}

function baseChartOptions({ rightAxis = false, bar = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: bar ? 'rectRounded' : 'circle',
          boxWidth: 8,
          color: COLORS.muted,
          font: { size: 10 },
        },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          label: context => {
            const suffix = context.dataset.yAxisID === 'rate' ? '%' : ''
            return `${context.dataset.label}: ${context.parsed.y?.toLocaleString('en-US')}${suffix}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 12, color: COLORS.muted, font: { size: 9 } },
      },
      claims: {
        position: 'left',
        grid: { color: COLORS.grid },
        ticks: {
          color: COLORS.muted,
          font: { size: 9 },
          callback: value => compactClaims(value),
        },
      },
      ...(rightAxis ? {
        rate: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: COLORS.violet,
            font: { size: 9 },
            callback: value => `${value}%`,
          },
        },
      } : {}),
    },
  }
}

function MetricCard({ label, value, period, rows, tone = 'neutral' }) {
  return (
    <article className={`${styles.metricCard} ${styles[tone]}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricHeadline}>
        <strong>{value}</strong>
        <span>{period}</span>
      </div>
      <div className={styles.metricRows}>
        {rows.map(row => (
          <div key={row.label}>
            <span>{row.label}</span>
            <b>{row.value}</b>
          </div>
        ))}
      </div>
    </article>
  )
}

export default function InitialClaimsDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/us-initial-claims', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load claims data.')
        return body
      })
      .then(setPayload)
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      })

    return () => controller.abort()
  }, [])

  const model = useMemo(() => {
    if (!payload) return null

    const initial = payload.series.initialClaims.observations.filter(point => valid(point.value))
    const continued = payload.series.continuedClaims.observations.filter(point => valid(point.value))
    const insuredRate = payload.series.insuredRate.observations.filter(point => valid(point.value))
    const initialLatest = last(initial)
    const continuedLatest = last(continued)
    const rateLatest = last(insuredRate)
    const initial4wValues = movingAverage(initial, 4)
    const latest4w = last(initial4wValues)
    const prior4w = initial4wValues.at(-2)
    const thirteenWeeksAgo4w = initial4wValues.at(-14)
    const initialYearAgo = yearAgoValue(initial, initialLatest?.date)
    const continuedYearAgo = yearAgoValue(continued, continuedLatest?.date)
    const yearWindow = initial.slice(-52).map(point => point.value)
    const percentile = percentileRank(yearWindow, initialLatest?.value)
    const momentum13 = valid(latest4w) && valid(thirteenWeeksAgo4w)
      ? (latest4w / thirteenWeeksAgo4w - 1) * 100
      : null
    const continuedYoy = valid(continuedYearAgo)
      ? (continuedLatest.value / continuedYearAgo - 1) * 100
      : null
    const initialYoy = valid(initialYearAgo)
      ? (initialLatest.value / initialYearAgo - 1) * 100
      : null
    const regime = regimeFor({ percentile, momentum13, continuedYoy })

    const threeYearsAgo = new Date(`${initialLatest.date}T00:00:00Z`)
    threeYearsAgo.setUTCFullYear(threeYearsAgo.getUTCFullYear() - 3)
    const trendStart = threeYearsAgo.toISOString().slice(0, 10)
    const trendInitial = initial.filter(point => point.date >= trendStart)
    const initialMap = new Map(initial.map((point, index) => [point.date, {
      value: point.value,
      average: initial4wValues[index],
    }]))

    const continuedStart = continuedLatest
      ? new Date(`${continuedLatest.date}T00:00:00Z`)
      : new Date()
    continuedStart.setUTCFullYear(continuedStart.getUTCFullYear() - 3)
    const continuedTrend = continued.filter(point => point.date >= continuedStart.toISOString().slice(0, 10))
    const rateMap = new Map(insuredRate.map(point => [point.date, point.value]))
    const recent = initial.slice(-13)

    return {
      initialLatest,
      continuedLatest,
      rateLatest,
      latest4w,
      prior4w,
      percentile,
      momentum13,
      continuedYoy,
      initialYoy,
      regime,
      yearLow: Math.min(...yearWindow),
      yearHigh: Math.max(...yearWindow),
      trendData: {
        labels: trendInitial.map(point => weekLabel(point.date, true)),
        datasets: [
          {
            label: 'Initial claims',
            data: trendInitial.map(point => point.value),
            borderColor: COLORS.blue,
            backgroundColor: 'rgba(66, 169, 188, .12)',
            fill: true,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: .18,
            yAxisID: 'claims',
          },
          {
            label: '4-week average',
            data: trendInitial.map(point => initialMap.get(point.date)?.average ?? null),
            borderColor: COLORS.orange,
            backgroundColor: COLORS.orange,
            borderWidth: 2.4,
            pointRadius: 0,
            tension: .18,
            yAxisID: 'claims',
          },
        ],
      },
      persistenceData: {
        labels: continuedTrend.map(point => weekLabel(point.date, true)),
        datasets: [
          {
            label: 'Continued claims',
            data: continuedTrend.map(point => point.value),
            borderColor: COLORS.green,
            backgroundColor: 'rgba(96, 212, 175, .1)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            tension: .18,
            yAxisID: 'claims',
          },
          {
            label: 'Insured unemployment rate',
            data: continuedTrend.map(point => rateMap.get(point.date) ?? null),
            borderColor: COLORS.violet,
            backgroundColor: COLORS.violet,
            borderWidth: 1.8,
            pointRadius: 0,
            spanGaps: true,
            tension: .18,
            yAxisID: 'rate',
          },
        ],
      },
      changeData: {
        labels: recent.map(point => weekLabel(point.date)),
        datasets: [{
          label: 'Weekly change',
          data: recent.map((point, index) => {
            const globalIndex = initial.length - recent.length + index
            return globalIndex > 0 ? point.value - initial[globalIndex - 1].value : null
          }),
          backgroundColor: recent.map((point, index) => {
            const globalIndex = initial.length - recent.length + index
            const change = globalIndex > 0 ? point.value - initial[globalIndex - 1].value : 0
            return change > 0 ? 'rgba(255, 107, 107, .78)' : 'rgba(96, 212, 175, .78)'
          }),
          borderRadius: 2,
          yAxisID: 'claims',
        }],
      },
      recentRows: initial.slice(-8).reverse().map((point, reverseIndex) => {
        const index = initial.length - 1 - reverseIndex
        const previous = initial[index - 1]
        const avg = initial4wValues[index]
        return {
          date: point.date,
          value: point.value,
          change: previous ? point.value - previous.value : null,
          average: avg,
        }
      }),
    }
  }, [payload])

  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <h1>Claims data is temporarily unavailable</h1>
          <p>{error}</p>
        </div>
      </main>
    )
  }

  if (!model) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <h1>Loading weekly claims…</h1>
          <p>Connecting to the latest seasonally adjusted FRED series.</p>
        </div>
      </main>
    )
  }

  const weeklyChange = model.initialLatest.value - valueWeeksAgo(
    payload.series.initialClaims.observations.filter(point => valid(point.value)),
    1,
  )
  const continuedChange = model.continuedLatest.value - valueWeeksAgo(
    payload.series.continuedClaims.observations.filter(point => valid(point.value)),
    1,
  )
  const rising = model.momentum13 > 0

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="ETA · FRED" />
        <nav className={styles.topbar}>
          <div><Link href="/">Macro Data Monitor</Link> / <Link href="/#united-states">US Macro</Link> / Initial Claims</div>
          <Link href="/#united-states">← US dashboard</Link>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>United States · Weekly Labor Signal</div>
          <h1>Initial Jobless Claims</h1>
          <p>
            A high-frequency read on layoffs, re-employment friction and the persistence of
            insured unemployment—updated automatically from official weekly claims data.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Latest initial claims: {weekLabel(model.initialLatest.date, true)}</span>
            <span>Weekly · Seasonally adjusted</span>
            <span>FRED / U.S. Employment and Training Administration</span>
          </div>
        </header>

        <section className={styles.metricGrid} aria-label="Latest claims readings">
          <MetricCard
            label="Initial claims"
            value={compactClaims(model.initialLatest.value)}
            period={weekLabel(model.initialLatest.date)}
            tone={weeklyChange > 0 ? 'negative' : 'positive'}
            rows={[
              { label: 'W/W', value: signedClaims(weeklyChange) },
              { label: 'Y/Y', value: signedPercent(model.initialYoy) },
            ]}
          />
          <MetricCard
            label="4-week average"
            value={compactClaims(model.latest4w)}
            period="noise-adjusted"
            tone={model.latest4w > model.prior4w ? 'negative' : 'positive'}
            rows={[
              { label: 'W/W', value: signedClaims(model.latest4w - model.prior4w) },
              { label: '13W pulse', value: signedPercent(model.momentum13) },
            ]}
          />
          <MetricCard
            label="Continued claims"
            value={compactClaims(model.continuedLatest.value)}
            period={weekLabel(model.continuedLatest.date)}
            tone={continuedChange > 0 ? 'negative' : 'positive'}
            rows={[
              { label: 'W/W', value: signedClaims(continuedChange) },
              { label: 'Y/Y', value: signedPercent(model.continuedYoy) },
            ]}
          />
          <MetricCard
            label="Insured unemployment"
            value={percent(model.rateLatest.value)}
            period={weekLabel(model.rateLatest.date)}
            tone={model.rateLatest.value >= 2 ? 'negative' : 'neutral'}
            rows={[
              { label: 'Claims 52W rank', value: `${model.percentile.toFixed(0)}th pct.` },
              { label: 'Regime', value: model.regime.label },
            ]}
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Layoff pulse</span>
              <h2>Initial claims and the 4-week signal</h2>
            </div>
            <p>Weekly filings with the official noise-reducing four-week moving average.</p>
          </div>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h3>Three-year claims trend</h3>
                  <p>Seasonally adjusted claims</p>
                </div>
                <span className={`${styles.regime} ${styles[model.regime.tone]}`}>{model.regime.label}</span>
              </div>
              <div className={styles.chart}>
                <Line data={model.trendData} options={baseChartOptions()} />
              </div>
            </article>

            <aside className={styles.analysis}>
              <div className={styles.analysisHeader}>
                <span>Claims stress monitor</span>
                <strong>{model.regime.score}/6</strong>
              </div>
              <div className={styles.range}>
                <div className={styles.rangeLabels}>
                  <span>52W low {compactClaims(model.yearLow)}</span>
                  <span>52W high {compactClaims(model.yearHigh)}</span>
                </div>
                <div className={styles.rangeTrack}>
                  <i style={{ left: `${Math.min(100, Math.max(0, model.percentile))}%` }} />
                </div>
              </div>
              <ul>
                <li>
                  <span>Layoff momentum</span>
                  <strong className={rising ? styles.bad : styles.good}>
                    {rising ? 'Rising' : 'Cooling'} · {signedPercent(model.momentum13)}
                  </strong>
                </li>
                <li>
                  <span>Initial claims Y/Y</span>
                  <strong className={model.initialYoy > 0 ? styles.bad : styles.good}>
                    {signedPercent(model.initialYoy)}
                  </strong>
                </li>
                <li>
                  <span>Continued claims Y/Y</span>
                  <strong className={model.continuedYoy > 0 ? styles.bad : styles.good}>
                    {signedPercent(model.continuedYoy)}
                  </strong>
                </li>
              </ul>
              <p className={styles.analysisNote}>
                The monitor is descriptive, not a recession forecast. A high reading requires
                broad confirmation from payrolls, unemployment and hiring indicators.
              </p>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Persistence</span>
              <h2>How long unemployment is lasting</h2>
            </div>
            <p>Continued claims show whether displaced workers are being absorbed quickly.</p>
          </div>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h3>Continued claims & insured unemployment rate</h3>
                  <p>Three-year view · dual axis</p>
                </div>
              </div>
              <div className={styles.chartSmall}>
                <Line data={model.persistenceData} options={baseChartOptions({ rightAxis: true })} />
              </div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h3>Weekly change in initial claims</h3>
                  <p>Latest 13 releases · increase means more layoff pressure</p>
                </div>
              </div>
              <div className={styles.chartSmall}>
                <Bar data={model.changeData} options={baseChartOptions({ bar: true })} />
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>Release tape</span>
              <h2>Latest weekly observations</h2>
            </div>
            <p>Four-week average is calculated from the official ICSA observations.</p>
          </div>
          <article className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Week ending</th>
                    <th>Initial claims</th>
                    <th>W/W change</th>
                    <th>4-week average</th>
                  </tr>
                </thead>
                <tbody>
                  {model.recentRows.map(row => (
                    <tr key={row.date}>
                      <td>{weekLabel(row.date, true)}</td>
                      <td>{row.value.toLocaleString('en-US')}</td>
                      <td className={row.change > 0 ? styles.bad : styles.good}>{signedClaims(row.change)}</td>
                      <td>{Math.round(row.average).toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <footer className={styles.methodology}>
          <div>
            <strong>Methodology</strong>
            <p>
              Initial claims measure new applications after job separation. Continued claims
              measure people remaining on insured unemployment. Series can be revised.
            </p>
          </div>
          <div>
            <strong>Official series</strong>
            <p>
              <a href="https://fred.stlouisfed.org/series/ICSA" target="_blank" rel="noreferrer">ICSA</a>
              {' · '}
              <a href="https://fred.stlouisfed.org/series/CCSA" target="_blank" rel="noreferrer">CCSA</a>
              {' · '}
              <a href="https://fred.stlouisfed.org/series/IURSA" target="_blank" rel="noreferrer">IURSA</a>
            </p>
          </div>
        </footer>
      </div>
    </main>
  )
}
