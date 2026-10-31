import Link from 'next/link'

export const metadata = {
  title: 'Changelog',
  description: 'Material data, methodology, reliability and interface changes to Macro Data Monitor.',
  alternates: { canonical: '/changelog' },
}

const releases = [
  {
    date: 'October 2026',
    title: 'Core monitoring set and new name',
    items: [
      'Renamed the site and repository from JapanPulse to Macro Data Monitor and moved it to macro-data-monitor.vercel.app; former addresses redirect.',
      'Focused both workspaces on a core set: Japan prices, wages and BOJ policy; US CPI, employment, PCE, manufacturing, rates and Fed policy.',
      'Moved other dashboards to a collapsed Archive that stays routed and monitored but no longer gates data-quality checks.',
      'Merged the Japan and US workspaces into one overview page, US first, with Tokyo and New York clocks; /us now redirects there.',
      'Linked BOJ core-CPI measures across CPI base years and added retry and fallback delivery to every core feed.',
    ],
  },
  {
    date: 'August 2026',
    title: 'Retail, housing and official-source traceability',
    items: [
      'Added a dedicated US Retail Demand Monitor with advance sales, real demand and common-month category breadth.',
      'Added US and Japan housing dashboards covering construction, demand, financing and tenure-level momentum.',
      'Added page-level links to primary official releases across every indicator dashboard.',
      'Separated retail sales from the GDP dashboard and expanded navigation, release calendars and data-health coverage.',
    ],
  },
  {
    date: 'August 2026',
    title: 'Reliability and analytical consistency',
    items: [
      'Added edge-aggregated workspace data with progressive card-level fallback and cached snapshots.',
      'Added a common analysis guide covering signal interpretation, market relevance, caveats and related indicators.',
      'Added an official-data Dining Demand Pulse using Census restaurant sales and BLS menu-price inflation.',
      'Expanded retrieval timestamps, data-health monitoring and automated integrity checks.',
      'Expanded US CPI into weighted non-overlapping categories and conditional inflation paths.',
    ],
  },
  {
    date: 'July–August 2026',
    title: 'Japan and US macro workspace expansion',
    items: [
      'Unified Japan and US navigation, macro significance and status conventions.',
      'Added US employment, claims, JOLTS, PPI, PCE, manufacturing surveys, rates and policy-rule analysis.',
      'Added Japan producer prices, BOJ policy, yen transmission and inbound-tourism analysis.',
      'Introduced official release calendars and feed-level Current, Reference, Stale and Failed states.',
    ],
  },
  {
    date: 'Initial release',
    title: 'JapanPulse foundation',
    items: [
      'Published official-source Japan dashboards for prices, growth, business activity, consumption, labor and trade.',
      'Established Next.js and Vercel deployment with e-Stat, BOJ, government-published files and FRED data pipelines.',
    ],
  },
]

export default function ChangelogPage() {
  return (
    <main className="about-page">
      <section className="about-page__hero">
        <div className="about-page__eyebrow">RELEASE NOTES / AUDIT TRAIL</div>
        <h1>Changelog.</h1>
        <p>
          Material changes to data coverage, methodology, reliability and presentation are recorded here.
          Routine observation updates are visible on the <Link href="/status">Data Status monitor</Link>.
        </p>
      </section>

      <section className="about-page__grid">
        {releases.map(release => (
          <article className="is-wide" key={`${release.date}-${release.title}`}>
            <div className="about-page__eyebrow">{release.date}</div>
            <h2>{release.title}</h2>
            <ul>
              {release.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
        <article className="is-wide about-page__notice">
          <h2>Source and change history</h2>
          <p>
            The code and full change history are public in the{' '}
            <a href="https://github.com/Hikky-fuji/macro-data-monitor" rel="noreferrer" target="_blank">
              GitHub repository ↗
            </a>{' '}
            so the work can be checked.
          </p>
        </article>
      </section>
    </main>
  )
}
