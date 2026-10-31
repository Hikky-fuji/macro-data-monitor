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

const valid = value => Number.isFinite(value)
const last = values => values?.length ? values.at(-1) : null
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

function seriesTransform(observations, periods) {
  const values = clean(observations)
  return values.map((point, index) => ({
    date: point.date,
    value: index >= periods ? change(point.value, values[index - periods].value) : null,
  }))
}

function chartOptions({ percentAxis = true } = {}) {
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
          label: context => `${context.dataset.label}: ${context.parsed.y?.toFixed(2)}${percentAxis ? '%' : ''}`,
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
        ticks: {
          color: COLORS.muted,
          font: { size: 9 },
          callback: value => `${value}${percentAxis ? '%' : ''}`,
        },
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

export default function ConsumptionDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-consumption', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load PCE data.')
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
    const source = payload.series
    const maps = Object.fromEntries(
      Object.entries(source).map(([key, definition]) => [key, byMonth(definition.observations)]),
    )
    const requiredKeys = [
      'headlinePce',
      'corePce',
      'realPce',
      'realDisposableIncome',
      'realGoods',
      'realServices',
      'savingRate',
    ]
    const commonMonth = [...maps.headlinePce.keys()]
      .filter(month => requiredKeys.every(key => maps[key]?.has(month)))
      .sort()
      .at(-1)
    if (!commonMonth) return null

    const months = [...maps.headlinePce.keys()].filter(month => month <= commonMonth).sort()
    const currentIndex = months.indexOf(commonMonth)
    const value = (key, offset = 0) => maps[key]?.get(months[currentIndex - offset])
    const headlineYoy = change(value('headlinePce'), value('headlinePce', 12))
    const coreYoy = change(value('corePce'), value('corePce', 12))
    const headlineMom = change(value('headlinePce'), value('headlinePce', 1))
    const coreMom = change(value('corePce'), value('corePce', 1))
    const headline3m = annualizedChange(value('headlinePce'), value('headlinePce', 3), 3)
    const core3m = annualizedChange(value('corePce'), value('corePce', 3), 3)
    const realPceMom = change(value('realPce'), value('realPce', 1))
    const realPceYoy = change(value('realPce'), value('realPce', 12))
    const incomeMom = change(value('realDisposableIncome'), value('realDisposableIncome', 1))
    const incomeYoy = change(value('realDisposableIncome'), value('realDisposableIncome', 12))
    const goodsYoy = change(value('realGoods'), value('realGoods', 12))
    const servicesYoy = change(value('realServices'), value('realServices', 12))
    const savingRate = value('savingRate')
    const savingChange = savingRate - value('savingRate', 12)

    const diningMonths = maps.restaurantSales && maps.foodAwayCpi
      ? [...maps.restaurantSales.keys()]
          .filter(month => maps.foodAwayCpi.has(month))
          .sort()
      : []
    const diningMonth = diningMonths.at(-1) || null
    const diningIndex = diningMonth ? diningMonths.length - 1 : -1
    const diningValue = (key, offset = 0) => maps[key]?.get(diningMonths[diningIndex - offset])
    const realDiningLevel = offset => {
      const sales = diningValue('restaurantSales', offset)
      const prices = diningValue('foodAwayCpi', offset)
      return valid(sales) && valid(prices) && prices !== 0 ? sales / prices : null
    }
    const restaurantSalesMom = change(diningValue('restaurantSales'), diningValue('restaurantSales', 1))
    const restaurantSalesYoy = change(diningValue('restaurantSales'), diningValue('restaurantSales', 12))
    const diningPriceYoy = change(diningValue('foodAwayCpi'), diningValue('foodAwayCpi', 12))
    const realDiningMom = change(realDiningLevel(0), realDiningLevel(1))
    const realDiningYoy = change(realDiningLevel(0), realDiningLevel(12))
    const realDining3m = annualizedChange(realDiningLevel(0), realDiningLevel(3), 3)
    const diningState = !valid(realDiningYoy)
      ? { label: 'Source unavailable', tone: 'neutralText' }
      : realDining3m > 2
        ? { label: 'Dining demand accelerating', tone: 'positiveText' }
        : realDining3m < 0
          ? { label: 'Dining demand cooling', tone: 'warningText' }
          : { label: 'Dining demand steady', tone: 'neutralText' }

    const chartMonths = months.slice(-60)
    const labels = chartMonths.map(month => monthLabel(`${month}-01`))
    const yoyData = key => {
      const transformed = byMonth(seriesTransform(source[key].observations, 12))
      return chartMonths.map(month => transformed.get(month) ?? null)
    }
    const threeMonthData = key => chartMonths.map((month, index) => {
      if (index < 3) return null
      return annualizedChange(maps[key].get(month), maps[key].get(chartMonths[index - 3]), 3)
    })
    const indexStart = chartMonths.at(0)
    const indexed = key => {
      const base = maps[key].get(indexStart)
      return chartMonths.map(month => valid(base) ? maps[key].get(month) / base * 100 : null)
    }

    const inflationState = core3m > coreYoy + .3
      ? { label: 'Re-accelerating', tone: 'negativeText' }
      : core3m < coreYoy - .3
        ? { label: 'Disinflation', tone: 'positiveText' }
        : { label: 'Broadly steady', tone: 'neutralText' }
    const consumerState = realPceYoy > incomeYoy + .5
      ? { label: 'Spending leads income', tone: 'warningText' }
      : incomeYoy > realPceYoy + .5
        ? { label: 'Income cushion building', tone: 'positiveText' }
        : { label: 'Income and spending aligned', tone: 'neutralText' }

    const diningChartMonths = diningMonths.slice(-60)
    const diningMonthIndex = new Map(diningMonths.map((month, index) => [month, index]))
    const diningGrowth = (kind, periods = 12) => diningChartMonths.map(month => {
      const index = diningMonthIndex.get(month)
      if (!Number.isInteger(index) || index < periods) return null
      if (kind === 'real') {
        const currentSales = maps.restaurantSales.get(month)
        const currentPrices = maps.foodAwayCpi.get(month)
        const previousMonth = diningMonths[index - periods]
        const previousSales = maps.restaurantSales.get(previousMonth)
        const previousPrices = maps.foodAwayCpi.get(previousMonth)
        return change(currentSales / currentPrices, previousSales / previousPrices)
      }
      return change(maps[kind].get(month), maps[kind].get(diningMonths[index - periods]))
    })

    return {
      commonMonth,
      headlineYoy,
      coreYoy,
      headlineMom,
      coreMom,
      headline3m,
      core3m,
      realPceMom,
      realPceYoy,
      incomeMom,
      incomeYoy,
      goodsYoy,
      servicesYoy,
      savingRate,
      savingChange,
      diningMonth,
      restaurantSalesMom,
      restaurantSalesYoy,
      diningPriceYoy,
      realDiningMom,
      realDiningYoy,
      realDining3m,
      diningState,
      inflationState,
      consumerState,
      labels,
      inflationChart: {
        labels,
        datasets: [
          { label: 'Headline PCE YoY', data: yoyData('headlinePce'), borderColor: COLORS.orange, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Core PCE YoY', data: yoyData('corePce'), borderColor: COLORS.blue, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Core PCE 3M annualized', data: threeMonthData('corePce'), borderColor: COLORS.violet, backgroundColor: 'transparent', borderDash: [5, 4], tension: .25, pointRadius: 0, borderWidth: 1.7 },
        ],
      },
      capacityChart: {
        labels,
        datasets: [
          { label: 'Real PCE', data: indexed('realPce'), borderColor: COLORS.orange, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Real disposable income', data: indexed('realDisposableIncome'), borderColor: COLORS.green, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
        ],
      },
      mixChart: {
        labels,
        datasets: [
          { label: 'Real goods YoY', data: yoyData('realGoods'), borderColor: COLORS.blue, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
          { label: 'Real services YoY', data: yoyData('realServices'), borderColor: COLORS.green, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2 },
        ],
      },
      diningChart: diningMonth ? {
        labels: diningChartMonths.map(month => monthLabel(`${month}-01`)),
        datasets: [
          { label: 'Nominal restaurant sales YoY', data: diningGrowth('restaurantSales'), borderColor: COLORS.orange, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 1.8 },
          { label: 'Approx. real restaurant sales YoY', data: diningGrowth('real'), borderColor: COLORS.green, backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderWidth: 2.2 },
          { label: 'Food away from home CPI YoY', data: diningGrowth('foodAwayCpi'), borderColor: COLORS.violet, backgroundColor: 'transparent', borderDash: [5, 4], tension: .25, pointRadius: 0, borderWidth: 1.7 },
        ],
      } : null,
    }
  }, [payload])

  if (error) return <main className={styles.page}><div className={styles.error}>{error}</div></main>
  if (!model) return <main className={styles.page}><div className={styles.loading}>Loading Personal Income and Outlays…</div></main>

  const updated = new Date(payload.fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="BEA / Census / BLS · FRED" />
        <nav className={styles.topbar}>
          <Link href="/#united-states">← US Macro Dashboard</Link>
          <span>PRICES + PRIVATE CONSUMPTION / MONTHLY</span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.eyebrow}>US / PERSONAL INCOME & OUTLAYS</div>
          <h1>PCE Inflation & Consumer Pulse</h1>
          <p>
            The Fed&apos;s preferred inflation gauge paired with real spending, disposable income,
            the goods-services mix and the household saving buffer.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Auto-updated from FRED</span>
            <span>Common reference month: {monthLabel(`${model.commonMonth}-01`)}</span>
            <span>Fetched: {updated}</span>
          </div>
        </header>

        <section className={styles.metricGridFive}>
          <MetricCard label="Headline PCE" value={pct(model.headlineYoy)} period="YoY" tone="warning" rows={[
            { label: 'MoM', value: signedPct(model.headlineMom, 2) },
            { label: '3M ann.', value: pct(model.headline3m) },
          ]} />
          <MetricCard label="Core PCE" value={pct(model.coreYoy)} period="YoY" tone="violet" rows={[
            { label: 'MoM', value: signedPct(model.coreMom, 2) },
            { label: '3M ann.', value: pct(model.core3m) },
          ]} />
          <MetricCard label="Real Consumption" value={signedPct(model.realPceMom, 2)} period="MoM" tone="positive" rows={[
            { label: 'YoY', value: signedPct(model.realPceYoy) },
            { label: 'Real DPI YoY', value: signedPct(model.incomeYoy) },
          ]} />
          <MetricCard label="Personal Saving Rate" value={pct(model.savingRate)} period="of DPI" rows={[
            { label: 'YoY change', value: `${model.savingChange > 0 ? '+' : ''}${model.savingChange.toFixed(1)} pt` },
            { label: 'Reference', value: monthLabel(`${model.commonMonth}-01`) },
          ]} />
          <MetricCard label="Dining Demand" value={signedPct(model.realDiningYoy)} period="approx. real YoY" tone="positive" rows={[
            { label: '3M ann.', value: signedPct(model.realDining3m) },
            { label: 'Nominal YoY', value: signedPct(model.restaurantSalesYoy) },
          ]} />
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>01 / INFLATION PULSE</span><h2>Headline, core and near-term momentum</h2></div>
            <p>YoY trends are slow moving; the 3-month annualized core rate highlights turning points sooner.</p>
          </header>
          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div><h3>PCE inflation momentum</h3><p>Percent change · 5-year window</p></div>
                <span className={styles.tag}>{model.inflationState.label}</span>
              </div>
              <div className={styles.chart}><Line data={model.inflationChart} options={chartOptions()} /></div>
            </article>
            <aside className={styles.analysis}>
              <div>
                <div className={styles.analysisKicker}>INFLATION READ</div>
                <div className={styles.analysisScore}>
                  <div><strong className={styles[model.inflationState.tone]}>{model.inflationState.label}</strong><small>Core 3M vs Core YoY</small></div>
                  <b>{pct(model.core3m)}</b>
                </div>
                <ul>
                  <li><span>Underlying pressure</span><b>Core {pct(model.coreYoy)} YoY</b></li>
                  <li><span>Short-run impulse</span><b className={styles[model.inflationState.tone]}>{pct(model.core3m)} annualized</b></li>
                  <li><span>Headline-core gap</span><b>{(model.headlineYoy - model.coreYoy).toFixed(1)} pt</b></li>
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>02 / CONSUMER CAPACITY</span><h2>Spending versus real income</h2></div>
            <p>Indexed to 100 at the start of the displayed window to make the cumulative gap comparable.</p>
          </header>
          <div className={styles.equalGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Real PCE vs real disposable income</h3><p>Indexed · 5-year window</p></div></div>
              <div className={styles.chartSmall}><Line data={model.capacityChart} options={chartOptions({ percentAxis: false })} /></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeading}><div><h3>Real spending mix</h3><p>Goods and services · YoY</p></div></div>
              <div className={styles.chartSmall}><Line data={model.mixChart} options={chartOptions()} /></div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>03 / DINING DEMAND</span><h2>Restaurant spending after menu-price inflation</h2></div>
            <p>Official restaurant sales are divided by the food-away-from-home CPI to approximate real dining demand.</p>
          </header>
          {model.diningChart ? (
            <div className={styles.mainGrid}>
              <article className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div><h3>Dining demand pulse</h3><p>YoY percent · official Census and BLS series</p></div>
                  <span className={styles.tag}>{model.diningState.label}</span>
                </div>
                <div className={styles.chartSmall}><Line data={model.diningChart} options={chartOptions()} /></div>
              </article>
              <aside className={styles.analysis}>
                <div>
                  <div className={styles.analysisKicker}>SUPPORTING / OFFICIAL</div>
                  <div className={styles.analysisScore}>
                    <div><strong className={styles[model.diningState.tone]}>{model.diningState.label}</strong><small>Real-sales proxy · {monthLabel(`${model.diningMonth}-01`)}</small></div>
                    <b>{signedPct(model.realDiningYoy)}</b>
                  </div>
                  <ul>
                    <li><span>Nominal restaurant sales</span><b>{signedPct(model.restaurantSalesYoy)} YoY</b></li>
                    <li><span>Menu-price inflation</span><b>{pct(model.diningPriceYoy)} YoY</b></li>
                    <li><span>Real-demand momentum</span><b className={styles[model.diningState.tone]}>{signedPct(model.realDining3m)} 3M ann.</b></li>
                    <li><span>Latest monthly impulse</span><b>{signedPct(model.realDiningMom, 2)} MoM</b></li>
                  </ul>
                </div>
              </aside>
            </div>
          ) : (
            <article className={styles.panel}>Dining feeds are temporarily unavailable; the PCE dashboard remains fully usable.</article>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div><span>04 / MONTHLY SCORECARD</span><h2>Household demand and buffer</h2></div>
            <p>Every comparison below uses {monthLabel(`${model.commonMonth}-01`)} to avoid mixing release months.</p>
          </header>
          <article className={styles.panel}>
            <div className={styles.tableWrap}>
              <table className={styles.matrix}>
                <thead><tr><th>Signal</th><th>MoM</th><th>YoY</th><th>Interpretation</th></tr></thead>
                <tbody>
                  <tr><td>Real consumption</td><td>{signedPct(model.realPceMom, 2)}</td><td>{signedPct(model.realPceYoy)}</td><td className={styles[model.consumerState.tone]}>{model.consumerState.label}</td></tr>
                  <tr><td>Real disposable income</td><td>{signedPct(model.incomeMom, 2)}</td><td>{signedPct(model.incomeYoy)}</td><td>Purchasing-power capacity</td></tr>
                  <tr><td>Real goods demand</td><td>—</td><td>{signedPct(model.goodsYoy)}</td><td>More cyclical spending</td></tr>
                  <tr><td>Real services demand</td><td>—</td><td>{signedPct(model.servicesYoy)}</td><td>Broader, stickier demand</td></tr>
                  <tr><td>Saving rate</td><td>—</td><td>{model.savingChange > 0 ? '+' : ''}{model.savingChange.toFixed(1)} pt</td><td>Household shock absorber</td></tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <footer className={styles.methodology}>
          <strong>Methodology.</strong> PCE inflation is calculated from the BEA chain-type price indexes.
          Real spending and income are seasonally adjusted annual rates; MoM changes are calculated from
          the level series, not annualized. All headline comparisons use the latest month available across
          the seven PCE and income series. The dining proxy divides seasonally adjusted Census restaurant
          sales by the seasonally adjusted food-away-from-home CPI; it is an approximation, and the advance
          sales estimate is revised. Sources: <a href="https://fred.stlouisfed.org/release?rid=54" target="_blank" rel="noreferrer">BEA Personal Income and Outlays</a>,{' '}
          <a href="https://fred.stlouisfed.org/series/RSFSDP" target="_blank" rel="noreferrer">Census restaurant sales</a> and{' '}
          <a href="https://fred.stlouisfed.org/series/CUSR0000SEFV" target="_blank" rel="noreferrer">BLS food-away-from-home CPI</a> via FRED.
        </footer>
      </div>
    </main>
  )
}
