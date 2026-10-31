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
  empire: '#42a9bc',
  philly: '#a99af0',
  ism: '#f08a24',
  green: '#60d4af',
  red: '#ff6b6b',
  muted: '#c7cdd1',
  grid: '#4a5258',
}

const valid = value => Number.isFinite(value)
const last = values => values?.length ? values[values.length - 1] : null
const signed = (value, digits = 1) => valid(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}` : '—'
const monthLabel = date => date
  ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${date}T00:00:00Z`))
  : '—'

function pointChange(values, periods = 1) {
  if (!values || values.length <= periods) return null
  return values.at(-1).value - values.at(-1 - periods).value
}

function latestByMonth(observations) {
  return new Map(
    (observations || [])
      .filter(point => valid(point.value))
      .map(point => [point.date.slice(0, 7), point.value]),
  )
}

function observationsThroughMonth(observations, month) {
  if (!month) return observations || []
  return (observations || []).filter(point => point.date.slice(0, 7) <= month)
}

function pointForMonth(observations, month) {
  if (!month) return null
  return last((observations || []).filter(point => point.date.slice(0, 7) === month))
}

function thirdThursday(year, monthIndex) {
  const date = new Date(Date.UTC(year, monthIndex, 1))
  const offset = (4 - date.getUTCDay() + 7) % 7
  date.setUTCDate(1 + offset + 14)
  return date
}

function nextWeekday(year, monthIndex) {
  const date = new Date(Date.UTC(year, monthIndex, 1))
  if (date.getUTCDay() === 6) date.setUTCDate(3)
  if (date.getUTCDay() === 0) date.setUTCDate(2)
  return date
}

function releaseDates(referenceDate) {
  if (!referenceDate) return {}
  const [year, month] = referenceDate.slice(0, 7).split('-').map(Number)
  const empire = new Date(Date.UTC(year, month - 1, 15))
  while (empire.getUTCDay() === 0 || empire.getUTCDay() === 6) {
    empire.setUTCDate(empire.getUTCDate() + 1)
  }
  const philly = thirdThursday(year, month - 1)
  const ism = nextWeekday(year, month)
  const format = date => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  return { empire: format(empire), philly: format(philly), ism: format(ism) }
}

function signalFor(value, neutral = 0) {
  if (!valid(value)) return { label: 'No data', tone: 'neutral' }
  const distance = value - neutral
  if (distance >= 5) return { label: 'Expansion', tone: 'positive' }
  if (distance > 0) return { label: 'Slight expansion', tone: 'positive' }
  if (distance <= -5) return { label: 'Contraction', tone: 'negative' }
  if (distance < 0) return { label: 'Slight contraction', tone: 'negative' }
  return { label: 'Neutral', tone: 'neutral' }
}

function SurveyCard({ label, role, importance, value, neutral, date, change, color, description, comparisonMonth }) {
  const signal = signalFor(value, neutral)
  return (
    <article className={styles.surveyCard} style={{ '--accent': color }}>
      <div className={styles.cardTopline}>
        <span>{role}</span>
        <b>{importance}</b>
      </div>
      <h3>{label}</h3>
      <p>{description}</p>
      <div className={styles.cardValue}>
        <strong>{valid(value) ? value.toFixed(1) : '—'}</strong>
        <div>
          <span className={styles[signal.tone]}>{signal.label}</span>
          <small>{monthLabel(date)}</small>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <span>1M change through {monthLabel(`${comparisonMonth}-01`)}</span>
        <b className={change >= 0 ? styles.positive : styles.negative}>{signed(change)} pt</b>
      </div>
    </article>
  )
}

function chartOptions({ neutralLabel = 'Neutral', bar = false } = {}) {
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
          pointStyle: bar ? 'rectRounded' : 'circle',
          boxWidth: 8,
          font: { size: 10 },
        },
      },
      tooltip: {
        backgroundColor: '#142b3c',
        padding: 10,
        callbacks: {
          label: context => `${context.dataset.label}: ${signed(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: COLORS.muted, maxTicksLimit: 12, font: { size: 9 } },
      },
      y: {
        grid: {
          color: context => context.tick.value === 0 ? '#899197' : COLORS.grid,
          lineWidth: context => context.tick.value === 0 ? 1.5 : 1,
        },
        ticks: { color: COLORS.muted, font: { size: 9 } },
        title: {
          display: true,
          text: neutralLabel,
          color: COLORS.muted,
          font: { size: 9 },
        },
      },
    },
  }
}

export default function ManufacturingMomentumPage() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/us-manufacturing', { signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok || body.error) throw new Error(body.error || 'Unable to load manufacturing data.')
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

    const empire = payload.regional.empire.series
    const philly = payload.regional.philly.series
    const empireHeadline = empire.headline.observations.filter(point => valid(point.value))
    const phillyHeadline = philly.headline.observations.filter(point => valid(point.value))
    const ismHeadline = payload.ism.headline.filter(point => valid(point.value))
    const empireLatest = last(empireHeadline)
    const phillyLatest = last(phillyHeadline)
    const ismLatest = last(ismHeadline)
    const referenceDate = [empireLatest?.date, phillyLatest?.date].filter(Boolean).sort().at(-1)
    const releases = releaseDates(referenceDate)

    const start = empireHeadline.at(-36)?.date?.slice(0, 7) || '2023-01'
    const months = [...new Set([
      ...empireHeadline.map(point => point.date.slice(0, 7)),
      ...phillyHeadline.map(point => point.date.slice(0, 7)),
      ...ismHeadline.map(point => point.date.slice(0, 7)),
    ])].filter(month => month >= start).sort()
    const empireMap = latestByMonth(empireHeadline)
    const phillyMap = latestByMonth(phillyHeadline)
    const ismMap = latestByMonth(ismHeadline)
    const comparisonMonth = months
      .filter(month => empireMap.has(month) && phillyMap.has(month) && ismMap.has(month))
      .at(-1) || [empireLatest, phillyLatest, ismLatest]
        .filter(Boolean)
        .map(point => point.date.slice(0, 7))
        .sort()
        .at(0)
    const empireComparison = pointForMonth(empireHeadline, comparisonMonth)
    const phillyComparison = pointForMonth(phillyHeadline, comparisonMonth)
    const ismComparison = pointForMonth(ismHeadline, comparisonMonth)
    const empireAligned = observationsThroughMonth(empireHeadline, comparisonMonth)
    const phillyAligned = observationsThroughMonth(phillyHeadline, comparisonMonth)
    const ismAligned = observationsThroughMonth(ismHeadline, comparisonMonth)

    const subindices = [
      { key: 'headline', label: 'Headline / Activity', ismKey: 'headline' },
      { key: 'newOrders', label: 'New Orders', ismKey: 'newOrders' },
      { key: 'employment', label: 'Employment', ismKey: 'employment' },
      { key: 'pricesPaid', label: 'Prices Paid', ismKey: 'pricesPaid' },
    ].map(row => {
      const empireObs = (empire[row.key]?.observations || []).filter(point => valid(point.value))
      const phillyObs = (philly[row.key]?.observations || []).filter(point => valid(point.value))
      const empireObsAligned = observationsThroughMonth(empireObs, comparisonMonth)
      const phillyObsAligned = observationsThroughMonth(phillyObs, comparisonMonth)
      return {
        ...row,
        empire: pointForMonth(empireObs, comparisonMonth)?.value,
        empireChange: pointChange(empireObsAligned),
        philly: pointForMonth(phillyObs, comparisonMonth)?.value,
        phillyChange: pointChange(phillyObsAligned),
        ism: ismLatest?.date.slice(0, 7) === comparisonMonth
          ? payload.ism.latest[row.ismKey]
          : null,
      }
    })

    const regionalDirection = [empireComparison?.value, phillyComparison?.value].filter(valid)
    const positiveRegional = regionalDirection.filter(value => value > 0).length
    const leadLabel = positiveRegional === 2
      ? 'Regional signals agree on expansion'
      : positiveRegional === 0
        ? 'Regional signals agree on contraction'
        : 'Regional signals are mixed'
    const ismSignal = signalFor(ismComparison?.value, 50)
    const latestReleases = [
      { key: 'empire', label: 'New York', point: empireLatest, neutral: 0 },
      { key: 'philly', label: 'Philadelphia', point: phillyLatest, neutral: 0 },
      { key: 'ism', label: 'ISM', point: ismLatest, neutral: 50 },
    ]
    const hasNewerRelease = latestReleases.some(
      release => release.point?.date.slice(0, 7) !== comparisonMonth,
    )

    return {
      empire,
      philly,
      empireHeadline,
      phillyHeadline,
      ismHeadline,
      empireLatest,
      phillyLatest,
      ismLatest,
      empireComparison,
      phillyComparison,
      ismComparison,
      comparisonMonth,
      latestReleases,
      hasNewerRelease,
      releases,
      subindices,
      leadLabel,
      ismSignal,
      comparisonData: {
        labels: months.map(month => monthLabel(`${month}-01`)),
        datasets: [
          {
            label: 'New York (0 = neutral)',
            data: months.map(month => empireMap.get(month) ?? null),
            borderColor: COLORS.empire,
            backgroundColor: `${COLORS.empire}22`,
            borderWidth: 2,
            pointRadius: 0,
            tension: .24,
          },
          {
            label: 'Philadelphia (0 = neutral)',
            data: months.map(month => phillyMap.get(month) ?? null),
            borderColor: COLORS.philly,
            backgroundColor: `${COLORS.philly}22`,
            borderWidth: 2,
            pointRadius: 0,
            tension: .24,
          },
          {
            label: 'ISM distance from 50',
            data: months.map(month => valid(ismMap.get(month)) ? ismMap.get(month) - 50 : null),
            borderColor: COLORS.ism,
            backgroundColor: `${COLORS.ism}22`,
            borderWidth: 3,
            pointRadius: 2,
            tension: .24,
            spanGaps: false,
          },
        ],
      },
      momentumData: {
        labels: ['New York', 'Philadelphia', 'ISM'],
        datasets: [
          {
            label: '1M change (points)',
            data: [
              pointChange(empireAligned),
              pointChange(phillyAligned),
              pointChange(ismAligned),
            ],
            backgroundColor: [COLORS.empire, COLORS.philly, COLORS.ism],
            borderRadius: 3,
          },
          {
            label: '3M change (points)',
            data: [
              pointChange(empireAligned, 3),
              pointChange(phillyAligned, 3),
              pointChange(ismAligned, 3),
            ],
            backgroundColor: [`${COLORS.empire}66`, `${COLORS.philly}66`, `${COLORS.ism}66`],
            borderRadius: 3,
          },
        ],
      },
    }
  }, [payload])

  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <h1>Manufacturing data unavailable</h1>
          <p>{error}</p>
          <Link href="/#united-states">Return to US Macro</Link>
        </div>
      </main>
    )
  }

  if (!model) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>
          <h1>Loading manufacturing surveys…</h1>
          <p>Connecting to regional Federal Reserve survey data.</p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DashboardFreshness data={payload} source="NY Fed · Philadelphia Fed · ISM" />
        <div className={styles.topbar}>
          <Link href="/#united-states">← US Macro Dashboard</Link>
          <span>NY FED → PHILLY FED → ISM</span>
        </div>

        <section className={styles.hero}>
          <div className={styles.eyebrow}>UNITED STATES / MANUFACTURING SURVEY CLOCK</div>
          <h1>Manufacturing Momentum</h1>
          <p>
            Follow the monthly information sequence from the first regional read to confirmation
            and finally the national ISM anchor. Importance is shown as a decision hierarchy—not
            as an arbitrary statistical weight.
          </p>
          <div className={styles.heroMeta}>
            <span><i />Regional data refreshes automatically via FRED</span>
            <span>Frequency: Monthly</span>
            <span>Neutral: 0 regional / 50 ISM</span>
          </div>
        </section>

        <section className={styles.clockSection}>
          <div className={styles.sectionHeader}>
            <div>
              <span>01 / RELEASE SEQUENCE</span>
              <h2>The manufacturing information clock</h2>
            </div>
            <p>Regional surveys describe the same month before ISM publishes its national reading the following month.</p>
          </div>

          <div className={styles.releaseClock}>
            {payload.cadence.map((stage, index) => (
              <article key={stage.key} className={`${styles.clockStep} ${styles[stage.key]}`}>
                <div className={styles.sequence}>{String(stage.sequence).padStart(2, '0')}</div>
                <div>
                  <span>{stage.importance}</span>
                  <h3>{stage.key === 'empire' ? 'New York Empire' : stage.key === 'philly' ? 'Philadelphia Fed' : 'ISM Manufacturing'}</h3>
                  <p>{stage.role}</p>
                </div>
                <div className={styles.timing}>
                  <strong>{stage.timing}</strong>
                  <span>{stage.time}</span>
                  <small>{model.releases[stage.key] || 'Cadence'}</small>
                </div>
                {index < payload.cadence.length - 1 && <b className={styles.arrow}>→</b>}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>02 / COMPARABLE SNAPSHOT</span>
              <h2>Lead, confirm, anchor — same survey month</h2>
            </div>
            <p>All three cards and momentum calculations are aligned to {monthLabel(`${model.comparisonMonth}-01`)}.</p>
          </div>

          <div className={styles.latestStrip}>
            <div className={styles.latestStripIntro}>
              <span>LATEST RELEASE SEQUENCE</span>
              <strong>Comparison month: {monthLabel(`${model.comparisonMonth}-01`)}</strong>
              <small>
                {model.hasNewerRelease
                  ? 'Newer releases stay visible here, but do not enter the cross-survey verdict until all three surveys catch up.'
                  : 'All three surveys currently refer to the same month.'}
              </small>
            </div>
            {model.latestReleases.map(release => {
              const releaseMonth = release.point?.date.slice(0, 7)
              const isAhead = releaseMonth !== model.comparisonMonth
              return (
                <div className={styles.latestRelease} key={release.key} style={{ '--release': COLORS[release.key] }}>
                  <span>{release.label}</span>
                  <strong>{valid(release.point?.value) ? release.point.value.toFixed(1) : '—'}</strong>
                  <small>{monthLabel(release.point?.date)} · {isAhead ? 'New lead' : 'Aligned'}</small>
                </div>
              )
            })}
          </div>

          <div className={styles.surveyGrid}>
            <SurveyCard
              label="New York Empire"
              role="First read"
              importance="Regional lead"
              value={model.empireComparison?.value}
              neutral={0}
              date={model.empireComparison?.date}
              change={pointChange(observationsThroughMonth(model.empireHeadline, model.comparisonMonth))}
              color={COLORS.empire}
              comparisonMonth={model.comparisonMonth}
              description="Fast but geographically narrow. Useful for direction, not a national conclusion."
            />
            <SurveyCard
              label="Philadelphia Fed"
              role="Second read"
              importance="Regional confirm"
              value={model.phillyComparison?.value}
              neutral={0}
              date={model.phillyComparison?.date}
              change={pointChange(observationsThroughMonth(model.phillyHeadline, model.comparisonMonth))}
              color={COLORS.philly}
              comparisonMonth={model.comparisonMonth}
              description="Long-running regional survey that confirms—or challenges—the first New York signal."
            />
            <SurveyCard
              label="ISM Manufacturing"
              role="Final anchor"
              importance="National"
              value={model.ismComparison?.value}
              neutral={50}
              date={model.ismComparison?.date}
              change={pointChange(observationsThroughMonth(model.ismHeadline, model.comparisonMonth))}
              color={COLORS.ism}
              comparisonMonth={model.comparisonMonth}
              description="The national benchmark. It carries the greatest decision weight in the sequence."
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>03 / MOMENTUM</span>
              <h2>Directional momentum across surveys</h2>
            </div>
            <p>Changes end in {monthLabel(`${model.comparisonMonth}-01`)}. Newer partial releases remain in the line chart only.</p>
          </div>

          <div className={styles.mainGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h3>Expansion distance</h3>
                  <p>Positive = expansion signal · Negative = contraction signal</p>
                </div>
                <span className={styles.liveBadge}>DIRECTIONAL</span>
              </div>
              <div className={styles.chart}>
                <Line data={model.comparisonData} options={chartOptions({ neutralLabel: 'Distance from neutral' })} />
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h3>Momentum change</h3>
                  <p>One- and three-month point change</p>
                </div>
              </div>
              <div className={styles.chart}>
                <Bar data={model.momentumData} options={chartOptions({ neutralLabel: 'Point change', bar: true })} />
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>04 / COMPONENT CHECK</span>
              <h2>What is driving the signal?</h2>
            </div>
            <p>Headline direction is cross-checked against demand, labor and the price pipeline.</p>
          </div>

          <div className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>NY · {monthLabel(`${model.comparisonMonth}-01`)}</th>
                    <th>NY 1M</th>
                    <th>Philly · {monthLabel(`${model.comparisonMonth}-01`)}</th>
                    <th>Philly 1M</th>
                    <th>ISM · {monthLabel(`${model.comparisonMonth}-01`)}</th>
                    <th>Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {model.subindices.map(row => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{signed(row.empire)}</td>
                      <td className={row.empireChange >= 0 ? styles.positive : styles.negative}>{signed(row.empireChange)}</td>
                      <td>{signed(row.philly)}</td>
                      <td className={row.phillyChange >= 0 ? styles.positive : styles.negative}>{signed(row.phillyChange)}</td>
                      <td>{row.ism?.toFixed(1) ?? '—'}</td>
                      <td>
                        {row.key === 'pricesPaid'
                          ? 'Higher = firmer input-cost pressure'
                          : row.key === 'employment'
                            ? 'Labor breadth / hiring direction'
                            : 'Demand and activity breadth'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={styles.readout}>
          <div>
            <span>Aligned readout · {monthLabel(`${model.comparisonMonth}-01`)}</span>
            <h2>{model.leadLabel}</h2>
            <p>
              The same-month national anchor is <strong className={styles[model.ismSignal.tone]}>{model.ismSignal.label.toLowerCase()}</strong>.
              Newer regional releases update the live sequence above without contaminating this horizontal comparison.
            </p>
          </div>
          <div className={styles.readoutRules}>
            <div><b>1</b><span>NY sets the first directional clue.</span></div>
            <div><b>2</b><span>Philly determines whether the clue has breadth.</span></div>
            <div><b>3</b><span>ISM resolves the national manufacturing signal.</span></div>
          </div>
        </section>

        <footer className={styles.methodology}>
          <div>
            <strong>Methodology</strong>
            <p>
              Regional diffusion indexes are not numerically interchangeable with ISM PMI.
              The comparison chart only aligns their neutral points to compare direction.
              “Lead / Confirm / Anchor” is an analytical hierarchy, not a fitted forecasting model.
            </p>
          </div>
          <div>
            <strong>Sources & update policy</strong>
            <p>
              New York and Philadelphia series update automatically from their Federal Reserve Banks via FRED.
              ISM is a compact, manually verified official snapshot because no public ISM API is available.
              <a href={payload.ism.sourceUrl} target="_blank" rel="noreferrer"> View the official ISM report ↗</a>
            </p>
          </div>
        </footer>
      </div>
    </main>
  )
}
