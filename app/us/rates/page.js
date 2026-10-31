'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardFreshness } from '../../components/DashboardStatus'
import { Line } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import styles from '../analysis-dashboard.module.css'

ChartJS.register(CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = {
  orange: '#f08a24',
  blue: '#42a9bc',
  green: '#60d4af',
  red: '#ff6b6b',
  violet: '#a99af0',
  muted: '#c7cdd1',
  grid: '#4a5258',
}

const finite = value => Number.isFinite(value)
const clean = series => (series?.observations || []).filter(point => finite(point.value))
const last = values => values?.length ? values.at(-1) : null

function percent(value, digits = 2) {
  return finite(value) ? `${value.toFixed(digits)}%` : '—'
}

function signed(value, digits = 0, suffix = '') {
  if (!finite(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`
}

function dateLabel(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}

function monthLabel(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}

function nearestByDate(series, dates) {
  const values = new Map(clean(series).map(point => [point.date, point.value]))
  return dates.map(date => values.get(date) ?? null)
}

function historyDates(series) {
  const all = clean(series)
  const latest = all.map(point => point.date).sort().at(-1)
  if (!latest) return []
  const start = new Date(`${latest}T12:00:00Z`)
  start.setUTCFullYear(start.getUTCFullYear() - 3)
  const cutoff = start.toISOString().slice(0, 10)
  return [...new Set(all.filter(point => point.date >= cutoff).map(point => point.date))].sort()
}

function rateRegime(model) {
  const signals = []
  const policyGap = model.policyGapToTwoYear
  const curve = model.spread2s10s?.value
  const real = model.real10y?.value
  const breakeven = model.breakeven5y?.value
  const nfci = model.nfci?.value

  signals.push({
    label: 'Front-end policy pricing',
    value: finite(policyGap)
      ? policyGap <= -25 ? 'Lower path priced' : policyGap >= 25 ? 'Higher path / term premium' : 'Near current policy rate'
      : 'Awaiting data',
    tone: finite(policyGap) && policyGap <= -25 ? 'positiveText' : finite(policyGap) && policyGap >= 25 ? 'negativeText' : 'neutralText',
    detail: finite(policyGap) ? `${signed(policyGap, 0, 'bp')} · 2Y minus effective fed funds` : 'No common observation',
  })
  signals.push({
    label: 'Yield-curve shape',
    value: finite(curve) ? curve < 0 ? 'Inverted' : curve < 0.5 ? 'Shallow positive' : 'Positive slope' : 'Awaiting data',
    tone: finite(curve) && curve < 0 ? 'warningText' : 'neutralText',
    detail: finite(curve) ? `${signed(curve * 100, 0, 'bp')} · 10Y minus 2Y` : 'No current spread',
  })
  signals.push({
    label: 'Long real-rate pressure',
    value: finite(real) ? real >= 2 ? 'High' : real >= 1 ? 'Restrictive' : 'Moderate' : 'Awaiting data',
    tone: finite(real) && real >= 2 ? 'negativeText' : finite(real) && real >= 1 ? 'warningText' : 'neutralText',
    detail: finite(real) ? `${percent(real)} · 10Y TIPS real yield` : 'No current real yield',
  })
  signals.push({
    label: 'Inflation compensation',
    value: finite(breakeven) ? breakeven > 2.5 ? 'Elevated' : breakeven < 1.5 ? 'Low' : 'Contained range' : 'Awaiting data',
    tone: finite(breakeven) && breakeven > 2.5 ? 'warningText' : 'neutralText',
    detail: finite(breakeven) ? `${percent(breakeven)} · 5Y breakeven` : 'No current breakeven',
  })
  signals.push({
    label: 'Broad financial conditions',
    value: finite(nfci) ? nfci > 0 ? 'Tighter than average' : nfci > -0.25 ? 'Near average' : 'Looser than average' : 'Awaiting data',
    tone: finite(nfci) && nfci > 0 ? 'negativeText' : finite(nfci) && nfci < -0.25 ? 'positiveText' : 'neutralText',
    detail: finite(nfci) ? `${nfci.toFixed(2)} · Chicago Fed NFCI` : 'No current NFCI',
  })

  const restrictive = signals.filter(signal => signal.tone === 'negativeText' || signal.tone === 'warningText').length
  const supportive = signals.filter(signal => signal.tone === 'positiveText').length
  return {
    label: restrictive >= 3 ? 'Restrictive transmission' : supportive >= 3 ? 'Supportive transmission' : 'Mixed transmission',
    summary: restrictive >= 3
      ? 'Rates and curve signals lean restrictive; confirm whether broader conditions are reinforcing or offsetting that restraint.'
      : supportive >= 3
        ? 'Market pricing and broad conditions lean supportive; watch whether inflation compensation remains contained.'
        : 'Policy pricing, the curve and broad conditions are not sending one uniform signal.',
    signals,
  }
}

function baseOptions({ percentAxis = true, zeroLine = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: COLORS.muted, usePointStyle: true, boxWidth: 8, font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          label: context => `${context.dataset.label}: ${finite(context.parsed.y) ? context.parsed.y.toFixed(2) : '—'}${percentAxis ? '%' : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.muted, maxTicksLimit: 10, font: { size: 9 } } },
      y: {
        grid: {
          color: context => zeroLine && context.tick.value === 0 ? '#8c969d' : COLORS.grid,
          lineWidth: context => zeroLine && context.tick.value === 0 ? 1.5 : 1,
        },
        ticks: {
          color: COLORS.muted,
          font: { size: 9 },
          callback: value => `${value}${percentAxis ? '%' : ''}`,
        },
      },
    },
  }
}

function MetricCard({ label, value, period, rows, tone = 'neutral' }) {
  return (
    <article className={`${styles.metricCard} ${styles[tone] || ''}`}>
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

export default function UsRatesDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-rates', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load rates data.')
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
    const { latest, series, curve } = payload
    const dates = historyDates(series.treasury10y)
    const inflationDates = historyDates(series.treasury10y)
    const spreadDates = historyDates(series.spread2s10s)
    const nfciSeries = clean(series.nfci).slice(-156)
    const currentCurve = curve.current.map(point => point.value)
    const priorCurve = curve.prior.map(point => point.value)

    const valueAt = (seriesKey, date) => {
      const values = clean(series[seriesKey])
      for (let index = values.length - 1; index >= 0; index -= 1) {
        if (values[index].date <= date) return values[index].value
      }
      return null
    }
    const monthAgo = latest.date ? new Date(`${latest.date}T12:00:00Z`) : null
    if (monthAgo) monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1)
    const tenYearMonthAgo = monthAgo ? valueAt('treasury10y', monthAgo.toISOString().slice(0, 10)) : null

    const prepared = {
      ...latest,
      curve,
      series,
      dates,
      inflationDates,
      spreadDates,
      nfciSeries,
      currentCurve,
      priorCurve,
      tenYearMonthChange: finite(latest.tenYear?.value) && finite(tenYearMonthAgo)
        ? (latest.tenYear.value - tenYearMonthAgo) * 100
        : null,
    }
    prepared.regime = rateRegime(prepared)
    return prepared
  }, [payload])

  if (error) {
    return <main className={styles.error}><strong>Rates data unavailable</strong><p>{error}</p></main>
  }
  if (!model) {
    return <main className={styles.loading}>Loading Treasury and financial-conditions data…</main>
  }

  const curveLabels = model.curve.current.map(point => point.maturity)
  const rateHistory = {
    labels: model.dates.map(monthLabel),
    datasets: [
      { label: 'Effective fed funds', data: nearestByDate(model.series.fedFunds, model.dates), borderColor: COLORS.orange, borderWidth: 2.2, pointRadius: 0, tension: 0.15 },
      { label: '2Y Treasury', data: nearestByDate(model.series.treasury2y, model.dates), borderColor: COLORS.blue, borderWidth: 1.8, pointRadius: 0, tension: 0.15 },
      { label: '10Y Treasury', data: nearestByDate(model.series.treasury10y, model.dates), borderColor: COLORS.green, borderWidth: 1.8, pointRadius: 0, tension: 0.15 },
    ],
  }
  const inflationDecomposition = {
    labels: model.inflationDates.map(monthLabel),
    datasets: [
      { label: '10Y nominal yield', data: nearestByDate(model.series.treasury10y, model.inflationDates), borderColor: COLORS.orange, borderWidth: 2.2, pointRadius: 0, tension: 0.15 },
      { label: '10Y real yield', data: nearestByDate(model.series.real10y, model.inflationDates), borderColor: COLORS.violet, borderWidth: 1.8, pointRadius: 0, tension: 0.15 },
      { label: '10Y breakeven', data: nearestByDate(model.series.breakeven10y, model.inflationDates), borderColor: COLORS.green, borderWidth: 1.8, pointRadius: 0, tension: 0.15 },
    ],
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="Federal Reserve · Treasury · FRED" />
        <div className={styles.topbar}>
          <Link href="/#united-states">← US workspace</Link>
          <span>Federal Reserve / U.S. Treasury / Chicago Fed via FRED</span>
        </div>

        <section className={styles.hero}>
          <div className={styles.eyebrow}>US / RATES &amp; FINANCIAL CONDITIONS / ★★★ CORE</div>
          <h1>Rates &amp; Financial Conditions</h1>
          <p>
            Connect the policy rate, Treasury curve, real yields, market inflation compensation
            and broad financial conditions into one transmission dashboard.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Updated automatically</span>
            <span>Latest common curve · {dateLabel(model.curve.date)}</span>
            <span>Daily rates · weekly NFCI</span>
          </div>
        </section>

        <section className={styles.metricGridFive} aria-label="Latest rates and conditions">
          <MetricCard
            label="Effective Fed Funds"
            value={percent(model.fedFunds?.value)}
            period={dateLabel(model.fedFunds?.date)}
            rows={[
              { label: '2Y minus policy', value: signed(model.policyGapToTwoYear, 0, 'bp') },
              { label: '2Y Treasury', value: percent(model.twoYear?.value) },
            ]}
            tone="violet"
          />
          <MetricCard
            label="10-Year Treasury"
            value={percent(model.tenYear?.value)}
            period={dateLabel(model.tenYear?.date)}
            rows={[
              { label: '1-week change', value: signed(model.changes?.tenYear?.oneWeekBp, 0, 'bp') },
              { label: '1-month change', value: signed(model.tenYearMonthChange, 0, 'bp') },
            ]}
          />
          <MetricCard
            label="2s10s Curve"
            value={signed(model.spread2s10s?.value * 100, 0, 'bp')}
            period={dateLabel(model.spread2s10s?.date)}
            rows={[
              { label: '3m10y', value: signed(model.spread3m10y?.value * 100, 0, 'bp') },
              { label: 'Shape', value: model.spread2s10s?.value < 0 ? 'Inverted' : 'Positive' },
            ]}
            tone={model.spread2s10s?.value < 0 ? 'warning' : 'positive'}
          />
          <MetricCard
            label="10-Year Real Yield"
            value={percent(model.real10y?.value)}
            period={dateLabel(model.real10y?.date)}
            rows={[
              { label: '5Y breakeven', value: percent(model.breakeven5y?.value) },
              { label: '10Y breakeven', value: percent(model.breakeven10y?.value) },
            ]}
            tone={model.real10y?.value >= 2 ? 'negative' : 'warning'}
          />
          <MetricCard
            label="Chicago Fed NFCI"
            value={finite(model.nfci?.value) ? model.nfci.value.toFixed(2) : '—'}
            period={dateLabel(model.nfci?.date)}
            rows={[
              { label: '4-week change', value: signed(model.nfciFourWeekChange, 2) },
              { label: 'Relative to avg.', value: model.nfci?.value > 0 ? 'Tighter' : 'Looser' },
            ]}
            tone={model.nfci?.value > 0 ? 'negative' : 'positive'}
          />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>01 / TRANSMISSION REGIME</span><h2>{model.regime.label}</h2></div>
            <p>{model.regime.summary}</p>
          </header>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div><h3>Treasury yield curve</h3><p>Latest common observation versus three months earlier</p></div>
                <b className={styles.tag}>{model.curve.date}</b>
              </div>
              <div className={styles.chart}>
                <Line
                  data={{
                    labels: curveLabels,
                    datasets: [
                      { label: `Latest · ${model.curve.date}`, data: model.currentCurve, borderColor: COLORS.orange, backgroundColor: 'rgba(240,138,36,.11)', borderWidth: 2.4, pointRadius: 3, tension: 0.18, fill: true },
                      { label: `3M earlier · ${model.curve.priorDate}`, data: model.priorCurve, borderColor: COLORS.blue, borderDash: [5, 4], borderWidth: 1.8, pointRadius: 2, tension: 0.18 },
                    ],
                  }}
                  options={baseOptions()}
                />
              </div>
            </article>
            <article className={styles.analysis}>
              <div>
                <div className={styles.analysisKicker}>SIGNAL MATRIX</div>
                <div className={styles.analysisScore}>
                  <div><strong>{model.regime.label}</strong><small>Descriptive, not a trade recommendation</small></div>
                </div>
                <ul>
                  {model.regime.signals.map(signal => (
                    <li key={signal.label}>
                      <span>{signal.label}<small>{signal.detail}</small></span>
                      <b className={styles[signal.tone]}>{signal.value}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>02 / POLICY &amp; CURVE</span><h2>Where rates sit across the transmission chain</h2></div>
            <p>The 2-year yield is policy-sensitive; the 10-year yield also embeds growth, inflation and term-premium forces.</p>
          </header>
          <div className={styles.panel}>
            <div className={styles.chart}>
              <Line data={rateHistory} options={baseOptions()} />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>03 / INFLATION PRICING</span><h2>Nominal yield, real yield and breakeven</h2></div>
            <p>Breakevens include inflation expectations plus risk and liquidity premia; they are not pure forecasts.</p>
          </header>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>10-year decomposition</h3><p>Daily market pricing · last three years</p></div></div>
              <div className={styles.chartSmall}>
                <Line data={inflationDecomposition} options={baseOptions()} />
              </div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Curve recession signals</h3><p>Zero line separates inversion from positive slope</p></div></div>
              <div className={styles.chartSmall}>
                <Line
                  data={{
                    labels: model.spreadDates.map(monthLabel),
                    datasets: [
                      { label: '10Y minus 2Y', data: nearestByDate(model.series.spread2s10s, model.spreadDates), borderColor: COLORS.blue, borderWidth: 2, pointRadius: 0, tension: 0.15 },
                      { label: '10Y minus 3M', data: nearestByDate(model.series.spread3m10y, model.spreadDates), borderColor: COLORS.violet, borderWidth: 1.8, pointRadius: 0, tension: 0.15 },
                    ],
                  }}
                  options={baseOptions({ zeroLine: true })}
                />
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>04 / BROAD CONDITIONS</span><h2>Chicago Fed National Financial Conditions Index</h2></div>
            <p>Positive values indicate tighter-than-average conditions; negative readings indicate looser-than-average conditions.</p>
          </header>
          <div className={styles.panel}>
            <div className={styles.chartSmall}>
              <Line
                data={{
                  labels: model.nfciSeries.map(point => monthLabel(point.date)),
                  datasets: [{
                    label: 'NFCI',
                    data: model.nfciSeries.map(point => point.value),
                    borderColor: COLORS.green,
                    backgroundColor: 'rgba(96,212,175,.10)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.16,
                    fill: 'origin',
                  }],
                }}
                options={baseOptions({ percentAxis: false, zeroLine: true })}
              />
            </div>
          </div>
        </section>

        <section className={styles.methodology}>
          <strong>Methodology &amp; source discipline.</strong>{' '}
          The curve is aligned to the latest date available across all displayed maturities. Treasury constant-maturity yields
          come from the Federal Reserve Board&apos;s H.15 release; TIPS yields, breakevens and the Chicago Fed NFCI are retrieved
          through FRED. Market-implied measures can move before macro releases and should be read as transmission signals,
          not official forecasts.{' '}
          <a href="https://fred.stlouisfed.org/release?rid=18" rel="noreferrer" target="_blank">H.15 release ↗</a>
          {' · '}
          <a href="https://fred.stlouisfed.org/series/NFCI" rel="noreferrer" target="_blank">NFCI definition ↗</a>
          {' · '}
          <Link href="/us-macro#fed-policy">Fed policy rules →</Link>
        </section>
      </div>
    </main>
  )
}
