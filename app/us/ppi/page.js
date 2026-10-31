'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardFreshness } from '../../components/DashboardStatus'
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
const signedPct = (value, digits = 1) => valid(value)
  ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
  : '—'

function monthLabel(date) {
  return date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${date}T00:00:00Z`))
    : '—'
}

function clean(observations) {
  return (observations || []).filter(point => valid(point.value))
}

function byMonth(observations) {
  return new Map(clean(observations).map(point => [point.date.slice(0, 7), point.value]))
}

function change(current, previous) {
  return valid(current) && valid(previous) && previous !== 0 ? (current / previous - 1) * 100 : null
}

function annualizedChange(current, previous, periods) {
  return valid(current) && valid(previous) && previous !== 0
    ? (Math.pow(current / previous, 12 / periods) - 1) * 100
    : null
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: COLORS.muted,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          font: { size: 10 },
        },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          label: context => `${context.dataset.label}: ${context.parsed.y?.toFixed(2)}%`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: COLORS.muted, maxTicksLimit: 12, font: { size: 9 } },
      },
      y: {
        grid: { color: COLORS.grid },
        ticks: { color: COLORS.muted, font: { size: 9 }, callback: value => `${value}%` },
      },
    },
  }
}

function MetricCard({ label, value, period, rows, tone = '' }) {
  return (
    <article className={`${styles.metricCard} ${tone ? styles[tone] : ''}`}>
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

function interpretation({ mom, threeMonth, yoy }) {
  if (!valid(mom) || !valid(threeMonth) || !valid(yoy)) return 'Insufficient history'
  if (threeMonth > yoy + 0.4) return 'Near-term acceleration'
  if (threeMonth < yoy - 0.4) return 'Disinflation'
  if (mom < 0 && yoy > 0) return 'Monthly decline; level still higher YoY'
  return 'Broadly steady'
}

export default function ProducerPriceDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-ppi', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load PPI data.')
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
    const maps = Object.fromEntries(
      Object.entries(payload.series).map(([key, definition]) => [key, byMonth(definition.observations)]),
    )
    const commonMonth = [...maps.headline.keys()]
      .filter(month => Object.values(maps).every(map => map.has(month)))
      .sort()
      .at(-1)
    if (!commonMonth) return null

    const months = [...maps.headline.keys()].filter(month => month <= commonMonth).sort()
    const currentIndex = months.indexOf(commonMonth)
    const value = (key, offset = 0) => maps[key].get(months[currentIndex - offset])
    const measure = key => ({
      mom: change(value(key), value(key, 1)),
      threeMonth: annualizedChange(value(key), value(key, 3), 3),
      yoy: change(value(key), value(key, 12)),
    })
    const headline = measure('headline')
    const core = measure('core')
    const coreExTrade = measure('coreExTrade')
    const goods = measure('goods')
    const services = measure('services')
    const energy = measure('energy')
    const tradeServices = measure('tradeServices')
    const chartMonths = months.slice(-60)
    const transform = (key, periods, annualized = false) => chartMonths.map(month => {
      const index = months.indexOf(month)
      const current = maps[key].get(month)
      const previous = maps[key].get(months[index - periods])
      return annualized
        ? annualizedChange(current, previous, periods)
        : change(current, previous)
    })
    let state = { label: 'Broadly steady', tone: 'neutralText' }
    if (coreExTrade.threeMonth > coreExTrade.yoy + 0.3) {
      state = { label: 'Re-accelerating', tone: 'warningText' }
    } else if (coreExTrade.threeMonth < coreExTrade.yoy - 0.3) {
      state = { label: 'Disinflation', tone: 'positiveText' }
    }

    const scorecard = [
      ['Headline final demand', headline],
      ['Core ex food & energy', core],
      ['Core ex food, energy & trade', coreExTrade],
      ['Final demand goods', goods],
      ['Final demand services', services],
      ['Energy', energy],
      ['Trade services', tradeServices],
    ].map(([label, values]) => ({
      label,
      ...values,
      read: interpretation(values),
    }))

    return {
      commonMonth,
      headline,
      core,
      coreExTrade,
      goods,
      services,
      energy,
      tradeServices,
      state,
      scorecard,
      inflationChart: {
        labels: chartMonths.map(month => monthLabel(`${month}-01`)),
        datasets: [
          { label: 'Headline PPI YoY', data: transform('headline', 12), borderColor: COLORS.orange, pointRadius: 0, tension: .25, borderWidth: 2 },
          { label: 'Core PPI YoY', data: transform('core', 12), borderColor: COLORS.blue, pointRadius: 0, tension: .25, borderWidth: 2 },
          { label: 'Core ex F/E/Trade YoY', data: transform('coreExTrade', 12), borderColor: COLORS.green, pointRadius: 0, tension: .25, borderWidth: 2 },
          { label: 'Core ex F/E/Trade 3M ann.', data: transform('coreExTrade', 3, true), borderColor: COLORS.violet, borderDash: [5, 4], pointRadius: 0, tension: .25, borderWidth: 1.7 },
        ],
      },
      demandChart: {
        labels: chartMonths.map(month => monthLabel(`${month}-01`)),
        datasets: [
          { label: 'Goods YoY', data: transform('goods', 12), borderColor: COLORS.blue, pointRadius: 0, tension: .25, borderWidth: 2 },
          { label: 'Services YoY', data: transform('services', 12), borderColor: COLORS.green, pointRadius: 0, tension: .25, borderWidth: 2 },
        ],
      },
      volatilityChart: {
        labels: chartMonths.map(month => monthLabel(`${month}-01`)),
        datasets: [
          { label: 'Energy MoM', data: transform('energy', 1), borderColor: COLORS.red, pointRadius: 0, tension: .2, borderWidth: 1.8 },
          { label: 'Trade services MoM', data: transform('tradeServices', 1), borderColor: COLORS.orange, pointRadius: 0, tension: .2, borderWidth: 1.8 },
        ],
      },
    }
  }, [payload])

  if (error) return <main className={styles.page}><div className={styles.error}>{error}</div></main>
  if (!model) return <main className={styles.page}><div className={styles.loading}>Loading Producer Price Index…</div></main>

  const updated = new Date(payload.fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="BLS · FRED" />
        <nav className={styles.topbar}>
          <Link href="/#united-states">← US Macro Dashboard</Link>
          <span>PRICES / PRODUCER PIPELINE / MONTHLY</span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>US / PRODUCER PRICE INDEX</div>
          <h1>PPI & Pipeline Inflation</h1>
          <p>
            A producer-price dashboard separating broad final demand, underlying core pressure,
            goods-services breadth and the volatile energy and trade-services channels.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Auto-updated from FRED</span>
            <span>Common reference month: {monthLabel(`${model.commonMonth}-01`)}</span>
            <span>Fetched: {updated}</span>
          </div>
        </header>

        <section className={styles.metricGrid}>
          <MetricCard label="Headline PPI" value={pct(model.headline.yoy)} period="YoY" tone="warning" rows={[
            { label: 'MoM', value: signedPct(model.headline.mom, 2) },
            { label: '3M ann.', value: pct(model.headline.threeMonth) },
          ]} />
          <MetricCard label="Core PPI" value={pct(model.core.yoy)} period="YoY" tone="violet" rows={[
            { label: 'MoM', value: signedPct(model.core.mom, 2) },
            { label: '3M ann.', value: pct(model.core.threeMonth) },
          ]} />
          <MetricCard label="Core ex F/E/Trade" value={pct(model.coreExTrade.yoy)} period="YoY" tone="positive" rows={[
            { label: 'MoM', value: signedPct(model.coreExTrade.mom, 2) },
            { label: '3M ann.', value: pct(model.coreExTrade.threeMonth) },
          ]} />
          <MetricCard label="Demand Mix" value={signedPct(model.services.yoy - model.goods.yoy)} period="services − goods" rows={[
            { label: 'Goods YoY', value: signedPct(model.goods.yoy) },
            { label: 'Services YoY', value: signedPct(model.services.yoy) },
          ]} />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>01 / UNDERLYING PRESSURE</span><h2>Final-demand inflation and near-term momentum</h2></div>
            <p>Three-month annualized momentum is compared with YoY inflation to identify acceleration or disinflation.</p>
          </header>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div><h3>PPI inflation trend</h3><p>Percent change · 5-year window</p></div>
                <span className={styles.tag}>{model.state.label}</span>
              </div>
              <div className={styles.chart}><Line data={model.inflationChart} options={chartOptions()} /></div>
            </article>
            <aside className={styles.analysis}>
              <div>
                <div className={styles.analysisKicker}>PIPELINE READ</div>
                <div className={styles.analysisScore}>
                  <div>
                    <strong className={styles[model.state.tone]}>{model.state.label}</strong>
                    <small>Core ex food, energy & trade</small>
                  </div>
                  <b>{pct(model.coreExTrade.threeMonth)}</b>
                </div>
                <ul>
                  <li><span>Underlying YoY pressure</span><b>{pct(model.coreExTrade.yoy)}</b></li>
                  <li><span>Near-term impulse</span><b className={styles[model.state.tone]}>{pct(model.coreExTrade.threeMonth)} annualized</b></li>
                  <li><span>Headline-core gap</span><b>{(model.headline.yoy - model.core.yoy).toFixed(1)} pt</b></li>
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>02 / BREADTH & VOLATILITY</span><h2>Goods, services and volatile channels</h2></div>
            <p>Goods-services breadth shows where pressure is concentrated; monthly energy and margins can move the headline sharply.</p>
          </header>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Final demand mix</h3><p>Goods and services · YoY</p></div></div>
              <div className={styles.chartSmall}><Line data={model.demandChart} options={chartOptions()} /></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Volatile monthly impulse</h3><p>Energy and trade services · MoM</p></div></div>
              <div className={styles.chartSmall}><Line data={model.volatilityChart} options={chartOptions()} /></div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>03 / SCORECARD</span><h2>Current-month cross-section</h2></div>
            <p>All rows use the same common reference month for a clean horizontal comparison.</p>
          </header>
          <article className={styles.panel}>
            <div className={styles.tableWrap}>
              <table className={styles.matrix}>
                <thead>
                  <tr><th>Series</th><th>MoM</th><th>3M annualized</th><th>YoY</th><th>Signal</th></tr>
                </thead>
                <tbody>
                  {model.scorecard.map(row => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{signedPct(row.mom, 2)}</td>
                      <td>{pct(row.threeMonth)}</td>
                      <td>{pct(row.yoy)}</td>
                      <td>{row.read}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <footer className={styles.methodology}>
          <strong>Methodology.</strong> All seven series are monthly and seasonally adjusted.
          YoY and MoM rates are calculated from index levels; 3M momentum is annualized.
          “Disinflation” means the positive inflation rate is slowing—it does not imply falling price levels.
          Source: U.S. Bureau of Labor Statistics via FRED.
          {' '}<a href="https://fred.stlouisfed.org/release?rid=46" rel="noreferrer" target="_blank">Official release ↗</a>
        </footer>
      </div>
    </main>
  )
}
