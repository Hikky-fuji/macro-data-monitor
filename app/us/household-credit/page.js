'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { DashboardFreshness } from '../../components/DashboardStatus'
import styles from '../analysis-dashboard.module.css'

ChartJS.register(CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip)

const COLORS = {
  orange: '#f08a24',
  blue: '#42a9bc',
  green: '#60d4af',
  red: '#ff6b6b',
  violet: '#a99af0',
  muted: '#c7cdd1',
  grid: '#4a5258',
}

const valid = value => Number.isFinite(value)
const pct = (value, digits = 1) => valid(value) ? `${value.toFixed(digits)}%` : '—'
const trillions = value => valid(value) ? `$${value.toFixed(2)}tn` : '—'
const pointChange = (current, previous) => valid(current) && valid(previous) ? current - previous : null
const signedPoint = (value, digits = 1) => valid(value)
  ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}pp`
  : '—'

function seriesValue(series, offset = 0) {
  const point = series?.at(-(offset + 1))
  return point?.value ?? null
}

function chartOptions({ percent = true } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: COLORS.muted, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: { label: context => `${context.dataset.label}: ${context.parsed.y?.toFixed(2)}${percent ? '%' : ' tn'}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.muted, maxTicksLimit: 12, font: { size: 9 } } },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.muted, font: { size: 9 }, callback: value => `${value}${percent ? '%' : ''}` },
      },
    },
  }
}

function MetricCard({ label, value, period, rows, tone = '' }) {
  return (
    <article className={`${styles.metricCard} ${tone ? styles[tone] : ''}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricHeadline}><strong>{value}</strong><span>{period}</span></div>
      <div className={styles.metricRows}>
        {rows.map(row => <div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>)}
      </div>
    </article>
  )
}

export default function HouseholdCreditDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-household-credit', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load household credit data.')
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
    const s = payload.series
    const latest = key => seriesValue(s[key])
    const qoq = key => pointChange(latest(key), seriesValue(s[key], 1))
    const yoy = key => pointChange(latest(key), seriesValue(s[key], 4))
    const debtQoq = valid(latest('totalDebt')) && valid(seriesValue(s.totalDebt, 1))
      ? (latest('totalDebt') / seriesValue(s.totalDebt, 1) - 1) * 100
      : null

    const stressKeys = ['creditCardSeriousFlow', 'autoSeriousFlow', 'mortgageSeriousFlow']
    const risingYoY = stressKeys.filter(key => yoy(key) > 0.05).length
    const stressState = risingYoY >= 2
      ? { label: 'Broad stress above year ago', tone: 'warningText' }
      : risingYoY === 0
        ? { label: 'Broad stress not worsening', tone: 'positiveText' }
        : { label: 'Mixed household stress', tone: 'neutralText' }

    const history = s.creditCardSeriousFlow.slice(-48)
    const periods = history.map(point => point.period.replace('-', ' '))
    const aligned = key => {
      const map = new Map(s[key].map(point => [point.period, point.value]))
      return history.map(point => map.get(point.period) ?? null)
    }

    return {
      latest: payload.latestQuarter,
      debtQoq,
      risingYoY,
      stressState,
      values: Object.fromEntries(Object.keys(s).map(key => [key, latest(key)])),
      qoq: Object.fromEntries(Object.keys(s).map(key => [key, qoq(key)])),
      yoy: Object.fromEntries(Object.keys(s).map(key => [key, yoy(key)])),
      flowChart: {
        labels: periods,
        datasets: [
          { label: 'Credit card', data: aligned('creditCardSeriousFlow'), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 2.2, tension: .2 },
          { label: 'Auto loan', data: aligned('autoSeriousFlow'), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 2, tension: .2 },
          { label: 'Mortgage', data: aligned('mortgageSeriousFlow'), borderColor: COLORS.green, pointRadius: 0, borderWidth: 2, tension: .2 },
        ],
      },
      stockChart: {
        labels: periods,
        datasets: [
          { label: 'Credit card 90+', data: aligned('creditCard90Balance'), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 2.2, tension: .2 },
          { label: 'Auto 90+', data: aligned('auto90Balance'), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 2, tension: .2 },
          { label: 'Mortgage 90+', data: aligned('mortgage90Balance'), borderColor: COLORS.green, pointRadius: 0, borderWidth: 2, tension: .2 },
        ],
      },
      balanceChart: {
        labels: periods,
        datasets: [
          { label: 'Credit card', data: aligned('creditCardBalance'), borderColor: COLORS.orange, pointRadius: 0, borderWidth: 2.2, tension: .2 },
          { label: 'Auto loan', data: aligned('autoBalance'), borderColor: COLORS.blue, pointRadius: 0, borderWidth: 2, tension: .2 },
          { label: 'Student loan', data: aligned('studentBalance'), borderColor: COLORS.violet, pointRadius: 0, borderWidth: 2, tension: .2 },
          { label: 'HELOC', data: aligned('helocBalance'), borderColor: COLORS.green, pointRadius: 0, borderWidth: 2, tension: .2 },
        ],
      },
    }
  }, [payload])

  if (error) return <main className={styles.page}><div className={styles.error}>{error}</div></main>
  if (!model) return <main className={styles.page}><div className={styles.loading}>Loading NY Fed household credit data…</div></main>

  const updated = new Date(payload.fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="NY Fed Consumer Credit Panel / Equifax" />
        <nav className={styles.topbar}>
          <Link href="/us">← US Macro Dashboard</Link>
          <span>HOUSEHOLD CREDIT / QUARTERLY</span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>US / HOUSEHOLD BALANCE SHEETS</div>
          <h1>Household Credit Stress</h1>
          <p>
            Actual household borrowing and delinquency outcomes from anonymized credit records.
            New serious-delinquency flows separate fresh stress from the accumulated stock of late debt.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Auto-updated from the latest NY Fed workbook</span>
            <span>Latest observation: {model.latest.replace('-', ' ')}</span>
            <span>Fetched: {updated}</span>
          </div>
        </header>

        <section className={styles.metricGridFive}>
          <MetricCard label="Credit Card Stress" value={pct(model.values.creditCardSeriousFlow)} period="new 90+ flow" tone="warning" rows={[
            { label: 'QoQ', value: signedPoint(model.qoq.creditCardSeriousFlow) },
            { label: 'YoY', value: signedPoint(model.yoy.creditCardSeriousFlow) },
          ]} />
          <MetricCard label="Auto Loan Stress" value={pct(model.values.autoSeriousFlow)} period="new 90+ flow" rows={[
            { label: 'QoQ', value: signedPoint(model.qoq.autoSeriousFlow) },
            { label: 'YoY', value: signedPoint(model.yoy.autoSeriousFlow) },
          ]} />
          <MetricCard label="Mortgage Stress" value={pct(model.values.mortgageSeriousFlow)} period="new 90+ flow" tone="positive" rows={[
            { label: 'QoQ', value: signedPoint(model.qoq.mortgageSeriousFlow) },
            { label: 'YoY', value: signedPoint(model.yoy.mortgageSeriousFlow) },
          ]} />
          <MetricCard label="All Delinquent Debt" value={pct(model.values.aggregateDelinquency)} period="stock share" tone="violet" rows={[
            { label: 'QoQ', value: signedPoint(model.qoq.aggregateDelinquency) },
            { label: 'YoY', value: signedPoint(model.yoy.aggregateDelinquency) },
          ]} />
          <MetricCard label="Total Household Debt" value={trillions(model.values.totalDebt)} period="nominal balance" rows={[
            { label: 'QoQ', value: pct(model.debtQoq, 2) },
            { label: 'Quarter', value: model.latest.replace('-', ' ') },
          ]} />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>01 / FRESH STRESS</span><h2>Transitions into serious delinquency</h2></div>
            <p>NY Fed-published four-quarter moving sums; they are not annualized here or converted to a 3-month moving average.</p>
          </header>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div><h3>Newly 90+ days delinquent balances</h3><p>Percent of balance · 12-year window</p></div>
                <span className={styles.tag}>{model.stressState.label}</span>
              </div>
              <div className={styles.chart}><Line data={model.flowChart} options={chartOptions()} /></div>
            </article>
            <aside className={styles.analysis}>
              <div>
                <div className={styles.analysisKicker}>HOUSEHOLD STRESS READ</div>
                <div className={styles.analysisScore}>
                  <div><strong className={styles[model.stressState.tone]}>{model.stressState.label}</strong><small>YoY breadth across card, auto and mortgage</small></div>
                  <b>{model.risingYoY}/3 rising</b>
                </div>
                <ul>
                  <li><span>Credit cards<small>Unsecured and most cyclical</small></span><b>{pct(model.values.creditCardSeriousFlow)}</b></li>
                  <li><span>Auto loans<small>Household payment pressure</small></span><b>{pct(model.values.autoSeriousFlow)}</b></li>
                  <li><span>Mortgages<small>Housing-credit transmission</small></span><b>{pct(model.values.mortgageSeriousFlow)}</b></li>
                  <li><span>Signal rule<small>YoY rise greater than 0.05pp</small></span><b>{model.risingYoY}/3</b></li>
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>02 / STOCK VS FLOW</span><h2>Accumulated delinquency is not new stress</h2></div>
            <p>The stock chart shows balances already 90+ days late; the first chart measures balances newly entering that state.</p>
          </header>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Balances 90+ days delinquent</h3><p>Percent of each loan type</p></div></div>
              <div className={styles.chartSmall}><Line data={model.stockChart} options={chartOptions()} /></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Non-mortgage debt balances</h3><p>Nominal trillions of dollars</p></div></div>
              <div className={styles.chartSmall}><Line data={model.balanceChart} options={chartOptions({ percent: false })} /></div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>03 / CREDIT SCORECARD</span><h2>Latest household balance-sheet readings</h2></div>
            <p>Point changes compare like-for-like published rates; dollar balances are not treated as stress signals by themselves.</p>
          </header>
          <article className={styles.panel}>
            <div className={styles.tableWrap}>
              <table className={styles.matrix}>
                <thead><tr><th>Signal</th><th>Latest</th><th>QoQ</th><th>YoY</th><th>Interpretation</th></tr></thead>
                <tbody>
                  <tr><td>Credit-card new serious delinquency</td><td>{pct(model.values.creditCardSeriousFlow)}</td><td>{signedPoint(model.qoq.creditCardSeriousFlow)}</td><td>{signedPoint(model.yoy.creditCardSeriousFlow)}</td><td>Fresh unsecured-credit stress</td></tr>
                  <tr><td>Auto-loan new serious delinquency</td><td>{pct(model.values.autoSeriousFlow)}</td><td>{signedPoint(model.qoq.autoSeriousFlow)}</td><td>{signedPoint(model.yoy.autoSeriousFlow)}</td><td>Vehicle-payment pressure</td></tr>
                  <tr><td>Mortgage new serious delinquency</td><td>{pct(model.values.mortgageSeriousFlow)}</td><td>{signedPoint(model.qoq.mortgageSeriousFlow)}</td><td>{signedPoint(model.yoy.mortgageSeriousFlow)}</td><td>Secured household-credit stress</td></tr>
                  <tr><td>All balances in delinquency</td><td>{pct(model.values.aggregateDelinquency)}</td><td>{signedPoint(model.qoq.aggregateDelinquency)}</td><td>{signedPoint(model.yoy.aggregateDelinquency)}</td><td>Accumulated stock, all stages</td></tr>
                  <tr><td>New foreclosures</td><td>{model.values.foreclosure?.toFixed(0)}k</td><td>{model.qoq.foreclosure?.toFixed(0)}k</td><td>{model.yoy.foreclosure?.toFixed(0)}k</td><td>Quarterly consumer count</td></tr>
                  <tr><td>New bankruptcies</td><td>{model.values.bankruptcy?.toFixed(0)}k</td><td>{model.qoq.bankruptcy?.toFixed(0)}k</td><td>{model.yoy.bankruptcy?.toFixed(0)}k</td><td>Quarterly consumer count</td></tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <footer className={styles.methodology}>
          <strong>Methodology.</strong> Values are read directly from the latest official NY Fed Household Debt and Credit Excel workbook.
          Serious-delinquency flows are the NY Fed&apos;s published four-quarter moving sum of balances newly becoming 90+ days late;
          Macro Data Monitor does not annualize or smooth them again. “All delinquent debt” equals 100 minus the workbook&apos;s current-balance share.
          QoQ and YoY are percentage-point differences for rates. Credit-score charts are excluded because the source changed from Equifax
          Risk Score 3.0 to VantageScore 4.0 in 2026Q1. Source: <a href="https://www.newyorkfed.org/microeconomics/hhdc" target="_blank" rel="noreferrer">New York Fed Consumer Credit Panel / Equifax</a>.
        </footer>
      </div>
    </main>
  )
}
