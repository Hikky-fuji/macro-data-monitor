'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Line, Scatter } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { DashboardFreshness, DashboardState } from '../components/DashboardStatus'
import styles from './page.module.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const COLORS = {
  orange: '#f08a24',
  blue: '#42a9bc',
  green: '#6abf91',
  violet: '#a99af0',
  red: '#ff6b6b',
  muted: '#aeb7bd',
  grid: 'rgba(157, 169, 176, .16)',
  text: '#dce2e5',
}

const localLinkBySource = {
  'Output gap': '/boj-policy#activity',
  'Labor tightness': '/tankan',
  Wages: '/wages',
  'Underlying prices': '/cpi',
  'External costs': '/ppi',
}

function last(series) {
  return Array.isArray(series) && series.length ? series.at(-1) : null
}

function previous(series, distance = 1) {
  return Array.isArray(series) && series.length > distance ? series.at(-(distance + 1)) : null
}

function format(value, suffix = '%', digits = 1) {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${suffix}`
}

function difference(series, distance = 1) {
  const current = last(series)?.value
  const prior = previous(series, distance)?.value
  return Number.isFinite(current) && Number.isFinite(prior) ? current - prior : null
}

function indexYoY(series) {
  if (!Array.isArray(series) || series.length < 13) return null
  const current = series.at(-1)?.value
  const prior = series.at(-13)?.value
  return Number.isFinite(current) && Number.isFinite(prior) && prior !== 0
    ? (current / prior - 1) * 100
    : null
}

function inflationDirection(series) {
  const latest = last(series)?.value
  const change = difference(series, 3)
  if (!Number.isFinite(latest) || !Number.isFinite(change)) return { label: 'Awaiting signal', tone: 'neutral' }
  if (Math.abs(change) < 0.15) return { label: 'Broadly stable', tone: 'neutral' }
  if (change > 0) return { label: 'Accelerating', tone: 'hot' }
  return { label: latest < 0 ? 'Deflationary' : 'Decelerating', tone: 'cool' }
}

function gapRegime(value) {
  if (!Number.isFinite(value)) return { label: 'Awaiting estimate', tone: 'neutral' }
  if (value > 0.35) return { label: 'Demand above capacity', tone: 'hot' }
  if (value < -0.35) return { label: 'Demand slack', tone: 'cool' }
  return { label: 'Near balance', tone: 'neutral' }
}

function laborRegime(value) {
  if (!Number.isFinite(value)) return { label: 'Awaiting signal', tone: 'neutral' }
  if (value < -8) return { label: 'Labor shortage', tone: 'hot' }
  if (value > 8) return { label: 'Labor surplus', tone: 'cool' }
  return { label: 'Near balance', tone: 'neutral' }
}

function wageRegime(value) {
  if (!Number.isFinite(value)) return { label: 'Awaiting signal', tone: 'neutral' }
  if (value >= 2) return { label: 'Firm wage growth', tone: 'hot' }
  if (value > 0) return { label: 'Moderate wage growth', tone: 'neutral' }
  return { label: 'Wage contraction', tone: 'cool' }
}

function costRegime(value) {
  if (!Number.isFinite(value)) return { label: 'Awaiting signal', tone: 'neutral' }
  if (value > 2) return { label: 'External cost pressure', tone: 'hot' }
  if (value < -2) return { label: 'External cost relief', tone: 'cool' }
  return { label: 'Limited cost impulse', tone: 'neutral' }
}

function quarterFor(period) {
  const monthly = String(period ?? '').match(/^(\d{4})\/(\d{2})$/)
  if (monthly) return `${monthly[1]}/Q${Math.ceil(Number(monthly[2]) / 3)}`
  const quarterly = String(period ?? '').match(/^(\d{4})\/Q([1-4])$/)
  return quarterly ? period : null
}

function alignQuarterly(xSeries, ySeries) {
  const monthlyByQuarter = new Map()
  for (const item of ySeries || []) {
    const quarter = quarterFor(item.date)
    if (quarter) monthlyByQuarter.set(quarter, item)
  }
  return (xSeries || []).map(item => {
    const price = monthlyByQuarter.get(quarterFor(item.date))
    return price ? { x: item.value, y: price.value, date: quarterFor(item.date) } : null
  }).filter(Boolean).slice(-32)
}

function lineOptions(unit = '%', zeroLine = true) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: COLORS.text, boxWidth: 12, boxHeight: 2, padding: 16, font: { size: 10 } },
      },
      tooltip: { backgroundColor: '#15191b', borderColor: '#59636a', borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: COLORS.muted, maxTicksLimit: 9, font: { size: 9 } }, grid: { display: false } },
      y: {
        ticks: { color: COLORS.muted, callback: value => `${value}${unit}`, font: { size: 9 } },
        grid: { color: context => zeroLine && context.tick.value === 0 ? 'rgba(240,138,36,.55)' : COLORS.grid },
      },
    },
  }
}

function Metric({ label, value, period, detail, tone = 'neutral' }) {
  return (
    <article className={`${styles.metric} ${styles[`metric_${tone}`]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <time>{period || 'Latest official reading'}</time>
    </article>
  )
}

export default function BojPolicyMonitor() {
  const [bundle, setBundle] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const paths = ['boj', 'cpi', 'wages', 'tankan', 'ppi']
    const urls = ['/api/boj-policy', '/api/cpi', '/api/wages', '/api/tankan', '/api/ppi']

    Promise.allSettled(urls.map(url => fetch(url, { signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || `${url} returned HTTP ${response.status}`)
      return data
    }))).then(results => {
      const next = {}
      const failures = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[paths[index]] = result.value
        else failures.push(result.reason?.message || urls[index])
      })
      if (!next.boj) throw new Error(failures[0] || 'BOJ policy data are unavailable')
      next.failures = failures
      setBundle(next)
    }).catch(fetchError => {
      if (fetchError.name !== 'AbortError') setError(fetchError.message)
    })

    return () => controller.abort()
  }, [])

  const view = useMemo(() => {
    if (!bundle) return null
    const core = bundle.boj.coreInflation || {}
    const activity = bundle.boj.activity || {}
    const trimmed = core.trimmedMean || []
    const weighted = core.weightedMedian || []
    const mode = core.mode || []
    const adjustedCore = core.exFreshEnergyInstitutional?.length
      ? core.exFreshEnergyInstitutional
      : core.exFoodEnergyInstitutional || []
    const gap = activity.outputGap || []
    const laborDi = activity.tankanEmploymentDI || []
    const scheduled = bundle.wages?.scheduled_same?.length
      ? bundle.wages.scheduled_same
      : bundle.wages?.scheduled || []
    const importPrice = indexYoY(bundle.ppi?.import_ppi)

    const signals = {
      inflation: inflationDirection(trimmed),
      gap: gapRegime(last(gap)?.value),
      labor: laborRegime(last(laborDi)?.value),
      wage: wageRegime(last(scheduled)?.yoy),
      cost: costRegime(importPrice),
    }

    return {
      core,
      activity,
      trimmed,
      weighted,
      mode,
      adjustedCore,
      gap,
      laborDi,
      scheduled,
      importPrice,
      signals,
      phillips: alignQuarterly(gap, trimmed),
    }
  }, [bundle])

  if (error) return <DashboardState type="error" message={error} />
  if (!view) return <DashboardState />

  const underlyingLabels = [...new Set([
    ...view.trimmed.map(item => item.date),
    ...view.weighted.map(item => item.date),
    ...view.mode.map(item => item.date),
  ])].sort().slice(-72)
  const byDate = series => new Map(series.map(item => [item.date, item.value]))
  const trimmedMap = byDate(view.trimmed)
  const weightedMap = byDate(view.weighted)
  const modeMap = byDate(view.mode)
  const adjustedMap = byDate(view.adjustedCore)

  const underlyingChart = {
    labels: underlyingLabels,
    datasets: [
      { label: 'Trimmed mean', data: underlyingLabels.map(date => trimmedMap.get(date) ?? null), borderColor: COLORS.orange, borderWidth: 2.4, pointRadius: 0, tension: .24 },
      { label: 'Weighted median', data: underlyingLabels.map(date => weightedMap.get(date) ?? null), borderColor: COLORS.green, borderWidth: 2, pointRadius: 0, tension: .24 },
      { label: 'Mode', data: underlyingLabels.map(date => modeMap.get(date) ?? null), borderColor: COLORS.violet, borderWidth: 1.7, pointRadius: 0, borderDash: [5, 4], tension: .24 },
      { label: 'CPI ex. institutional factors', data: underlyingLabels.map(date => adjustedMap.get(date) ?? null), borderColor: COLORS.blue, borderWidth: 1.6, pointRadius: 0, borderDash: [2, 3], tension: .24 },
    ],
  }

  const activityLabels = view.gap.slice(-64).map(item => item.date)
  const capitalMap = byDate(view.activity.capitalInputGap || [])
  const laborGapMap = byDate(view.activity.laborInputGap || [])
  const activityChart = {
    labels: activityLabels,
    datasets: [
      { label: 'Output gap', data: view.gap.slice(-64).map(item => item.value), borderColor: COLORS.orange, backgroundColor: 'rgba(240,138,36,.10)', fill: true, borderWidth: 2.4, pointRadius: 0, tension: .2 },
      { label: 'Labor input gap', data: activityLabels.map(date => laborGapMap.get(date) ?? null), borderColor: COLORS.green, borderWidth: 1.7, pointRadius: 0, tension: .2 },
      { label: 'Capital input gap', data: activityLabels.map(date => capitalMap.get(date) ?? null), borderColor: COLORS.blue, borderWidth: 1.7, pointRadius: 0, tension: .2 },
    ],
  }

  const breadth = view.core.diffusionIndex || []
  const increasingMap = byDate(view.core.shareIncreasing || [])
  const decreasingMap = byDate(view.core.shareDecreasing || [])
  const breadthLabels = breadth.slice(-60).map(item => item.date)
  const breadthChart = {
    labels: breadthLabels,
    datasets: [
      { label: 'Diffusion index', data: breadth.slice(-60).map(item => item.value), borderColor: COLORS.orange, borderWidth: 2.4, pointRadius: 0, tension: .2 },
      { label: 'Share increasing', data: breadthLabels.map(date => increasingMap.get(date) ?? null), borderColor: COLORS.green, borderWidth: 1.7, pointRadius: 0, tension: .2 },
      { label: 'Share decreasing', data: breadthLabels.map(date => decreasingMap.get(date) ?? null), borderColor: COLORS.red, borderWidth: 1.7, pointRadius: 0, tension: .2 },
    ],
  }

  const phillipsLatest = view.phillips.at(-1)
  const phillipsChart = {
    datasets: [
      {
        label: 'Quarterly path',
        data: view.phillips,
        parsing: false,
        showLine: true,
        borderColor: 'rgba(66,169,188,.55)',
        backgroundColor: 'rgba(66,169,188,.70)',
        pointRadius: 3.5,
        borderWidth: 1.4,
        tension: .12,
      },
      {
        label: phillipsLatest ? `Latest · ${phillipsLatest.date}` : 'Latest',
        data: phillipsLatest ? [phillipsLatest] : [],
        parsing: false,
        backgroundColor: COLORS.orange,
        borderColor: '#fff',
        borderWidth: 1.5,
        pointRadius: 7,
      },
    ],
  }

  const phillipsOptions = {
    ...lineOptions('%'),
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      ...lineOptions('%').plugins,
      tooltip: {
        backgroundColor: '#15191b',
        borderColor: '#59636a',
        borderWidth: 1,
        callbacks: { label: context => `${context.raw.date}: gap ${format(context.raw.x)}, trimmed mean ${format(context.raw.y)}` },
      },
    },
    scales: {
      x: { type: 'linear', title: { display: true, text: 'Output gap (%)', color: COLORS.muted }, ticks: { color: COLORS.muted }, grid: { color: COLORS.grid } },
      y: { type: 'linear', title: { display: true, text: 'Trimmed mean CPI (Y/Y %)', color: COLORS.muted }, ticks: { color: COLORS.muted }, grid: { color: COLORS.grid } },
    },
  }

  const latestGap = last(view.gap)
  const latestTrimmed = last(view.trimmed)
  const latestMedian = last(view.weighted)
  const latestLabor = last(view.laborDi)
  const latestWage = last(view.scheduled)
  const latestDiffusion = last(view.core.diffusionIndex || [])
  const transmission = [
    { step: '01', label: 'External costs', value: format(view.importPrice), signal: view.signals.cost },
    { step: '02', label: 'Corporate pricing', value: bundle.tankan?.large_nonmfg?.at(-1) ? `${format(bundle.tankan.large_nonmfg.at(-1).value, '', 0)} DI` : '—', signal: { label: 'Tankan business conditions', tone: 'neutral' } },
    { step: '03', label: 'Wages & labor', value: format(latestWage?.yoy), signal: view.signals.wage },
    { step: '04', label: 'Demand balance', value: format(latestGap?.value), signal: view.signals.gap },
    { step: '05', label: 'Underlying CPI', value: format(latestTrimmed?.value), signal: view.signals.inflation },
  ]

  const evidence = [
    { dimension: 'Output gap', value: format(latestGap?.value), period: latestGap?.date, signal: view.signals.gap, note: 'Estimated economy-wide demand relative to productive capacity.' },
    { dimension: 'Labor tightness', value: Number.isFinite(latestLabor?.value) ? `${format(latestLabor.value, '', 0)} DI` : '—', period: latestLabor?.date, signal: view.signals.labor, note: 'Tankan employment DI is inverted economically: a more negative reading means a larger labor shortage.' },
    { dimension: 'Wages', value: format(latestWage?.yoy), period: latestWage?.date, signal: view.signals.wage, note: 'Scheduled cash earnings, same-establishment Y/Y when available.' },
    { dimension: 'Underlying prices', value: format(latestTrimmed?.value), period: latestTrimmed?.date, signal: view.signals.inflation, note: 'Trimmed mean reduces the influence of unusually large item-level price changes.' },
    { dimension: 'External costs', value: format(view.importPrice), period: bundle.ppi?.import_ppi?.at(-1)?.date, signal: view.signals.cost, note: 'Import price index Y/Y; a pipeline input rather than domestic persistence by itself.' },
  ]

  return (
    <main className={`dashboard-page ${styles.page}`}>
      <DashboardFreshness data={bundle.boj} source="BOJ research data · official workbooks" />

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>JP / POLICY TRANSMISSION / ★★★ CORE</p>
          <h1>BOJ Policy Monitor</h1>
          <p className={styles.lede}>From external costs and wages to demand pressure and underlying inflation.</p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/">← Japan workspace</Link>
          <Link href="/cpi">CPI detail</Link>
          <Link href="/tankan">Tankan detail</Link>
        </div>
      </header>

      <section className={styles.frameworkNote}>
        <span>FRAMEWORK / 2023 → DATA / CURRENT</span>
        <p>
          The 2023 MUMSS material informs the analytical sequence only. Historical forecasts, policy assumptions and point-in-time conclusions are not carried forward; all readings below come from current official feeds.
        </p>
      </section>

      <section className={styles.metrics} aria-label="Latest BOJ policy indicators">
        <Metric label="Output gap" value={format(latestGap?.value)} period={latestGap?.date} detail={view.signals.gap.label} tone={view.signals.gap.tone} />
        <Metric label="Trimmed mean CPI" value={format(latestTrimmed?.value)} period={latestTrimmed?.date} detail={view.signals.inflation.label} tone={view.signals.inflation.tone} />
        <Metric label="Weighted median CPI" value={format(latestMedian?.value)} period={latestMedian?.date} detail="Persistent center of distribution" tone="neutral" />
        <Metric label="Tankan employment DI" value={Number.isFinite(latestLabor?.value) ? format(latestLabor.value, '', 0) : '—'} period={latestLabor?.date} detail={view.signals.labor.label} tone={view.signals.labor.tone} />
        <Metric label="Scheduled wages" value={format(latestWage?.yoy)} period={latestWage?.date} detail={view.signals.wage.label} tone={view.signals.wage.tone} />
        <Metric label="CPI diffusion" value={format(latestDiffusion?.value, 'pp')} period={latestDiffusion?.date} detail="Breadth of item-level increases" tone="neutral" />
      </section>

      <section className={styles.transmission} aria-labelledby="transmission-title">
        <header>
          <p>POLICY TRANSMISSION MAP</p>
          <h2 id="transmission-title">Read the chain, not one release</h2>
        </header>
        <div className={styles.transmissionGrid}>
          {transmission.map((item, index) => (
            <article key={item.step}>
              <span>{item.step}</span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <em className={styles[`signal_${item.signal.tone}`]}>{item.signal.label}</em>
              {index < transmission.length - 1 ? <b aria-hidden="true">→</b> : null}
            </article>
          ))}
        </div>
        <p className={styles.disclaimer}>Analytical monitoring sequence—not a mechanical BOJ reaction function or rate forecast.</p>
      </section>

      <section className={styles.chartGrid} id="activity">
        <article className={`${styles.panel} ${styles.panelWide}`}>
          <header><span>01 / UNDERLYING INFLATION</span><h2>Persistence beyond temporary and institutional factors</h2></header>
          <div className={styles.chart}><Line data={underlyingChart} options={lineOptions('%')} /></div>
          <p>Use the trimmed mean, weighted median and mode together. No single statistic fully identifies underlying inflation.</p>
        </article>

        <article className={styles.panel}>
          <header><span>02 / DEMAND BALANCE</span><h2>Output gap and its input components</h2></header>
          <div className={styles.chart}><Line data={activityChart} options={lineOptions('%')} /></div>
          <p>BOJ estimates are revised and should be read with a range, not as directly observed facts.</p>
        </article>

        <article className={styles.panel}>
          <header><span>03 / PRICE BREADTH</span><h2>How widely price changes are spreading</h2></header>
          <div className={styles.chart}><Line data={breadthChart} options={lineOptions('')} /></div>
          <p>Diffusion shows breadth; it does not measure the size of each price change.</p>
        </article>

        <article className={`${styles.panel} ${styles.panelWide}`}>
          <header><span>04 / PHILLIPS VIEW</span><h2>Demand pressure versus trimmed-mean inflation</h2></header>
          <div className={styles.chart}><Scatter data={phillipsChart} options={phillipsOptions} /></div>
          <p>Quarterly output-gap observations are paired with the latest monthly trimmed-mean reading in each quarter. The path is descriptive, not a causal estimate.</p>
        </article>
      </section>

      <section className={styles.evidence}>
        <header>
          <div><span>POLICY EVIDENCE MATRIX</span><h2>What each block says now</h2></div>
          <p>Direction labels describe momentum or pressure; they are not investment recommendations.</p>
        </header>
        <div className={styles.evidenceRows}>
          {evidence.map(item => (
            <Link href={localLinkBySource[item.dimension]} key={item.dimension}>
              <strong>{item.dimension}</strong>
              <b>{item.value}</b>
              <time>{item.period || '—'}</time>
              <em className={styles[`signal_${item.signal.tone}`]}>{item.signal.label}</em>
              <p>{item.note}</p>
              <span>Open detail →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.methodology}>
        <article>
          <span>DATA GOVERNANCE</span>
          <h2>What is live</h2>
          <p>BOJ core-inflation workbooks update monthly; output-gap and labor-market workbooks update quarterly. Wages, Tankan and producer prices are joined from existing Macro Data Monitor official-source APIs.</p>
          {bundle.boj.meta?.coreCpiBases?.length > 1 ? (
            <p>
              Core CPI measures link the BOJ’s published y/y columns by CPI base:{' '}
              {bundle.boj.meta.coreCpiBases.map(base => `${base.baseYear} base ${base.start}–${base.end}`).join(' · ')}.
              Rates are not rebased across the break.
            </p>
          ) : null}
        </article>
        <article>
          <span>INTERPRETATION</span>
          <h2>What is estimated</h2>
          <p>Output gap, potential growth and BOJ core indicators are staff estimates and can be revised. Macro Data Monitor preserves the source distinction and avoids presenting them as observed releases.</p>
        </article>
        <article>
          <span>SCOPE</span>
          <h2>What the 2023 paper contributes</h2>
          <p>Only the monitoring architecture: imported inflation → corporate behavior → labor and wages → demand → underlying inflation → policy assessment.</p>
        </article>
      </section>

      {bundle.failures?.length || bundle.boj.meta?.warnings?.length ? (
        <aside className={styles.warning}>
          Partial feed warning: {[...(bundle.failures || []), ...(bundle.boj.meta?.warnings || [])].join(' · ')}
        </aside>
      ) : null}

      <footer className={styles.sources}>
        <span>SOURCES</span>
        <a href="https://www.boj.or.jp/en/research/research_data/cpi/index.htm" rel="noreferrer" target="_blank">BOJ Indicators for Core CPI ↗</a>
        <a href="https://www.boj.or.jp/en/research/research_data/gap/index.htm" rel="noreferrer" target="_blank">BOJ Output Gap & Labor Indicators ↗</a>
        <Link href="/status">Data status →</Link>
      </footer>
    </main>
  )
}
