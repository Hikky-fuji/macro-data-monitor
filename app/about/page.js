import Link from 'next/link'

export const metadata = {
  title: 'About & Methodology',
  description:
    'Macro Data Monitor purpose, data sources, update methodology, limitations, attribution and research disclaimer.',
  alternates: {
    canonical: '/about',
  },
}

export default function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-page__hero">
        <div className="about-page__eyebrow">ABOUT / METHODOLOGY</div>
        <h1>Built to make macro data faster to read.</h1>
        <p>
          Macro Data Monitor is a personal research tool, built as a course project, that brings the
          Japan and United States macroeconomic indicators its owner follows into a consistent,
          high-density dashboard. It is designed for monitoring direction, momentum and
          cross-indicator context—not for replacing the underlying official releases.
        </p>
        <p>
          It is built only from public official data. The site is published so that its sources,
          calculations and data status can be checked, not as a service for other users. Every
          dashboard keeps its official source one click away.
        </p>
      </section>

      <section className="about-page__grid">
        <article>
          <h2>Data sources</h2>
          <ul>
            <li>Japan: e-Stat, Bank of Japan, Cabinet Office, METI, MHLW and Japan Customs.</li>
            <li>United States: BLS, BEA, Census, Federal Reserve, U.S. Treasury and Chicago Fed data via FRED.</li>
            <li>Every dashboard identifies its source and latest available observation.</li>
          </ul>
        </article>

        <article>
          <h2>Update policy</h2>
          <p>
            Data is retrieved from official APIs or published files and cached to reduce load.
            Release timing differs by indicator, so “latest” means the newest official
            observation available for that series—not a common calendar month across all pages.
          </p>
          <p>
            Workspace summaries use an edge-cached aggregate endpoint and automatically fall
            back to independent card-level requests when a source is slow. Cached browser
            snapshots can preserve the last complete workspace while a refresh is incomplete.
          </p>
          <p>
            The <Link href="/status">Data Status monitor</Link> identifies current, reference,
            stale and failed feeds and separates live data from preserved snapshots.
          </p>
        </article>

        <article>
          <h2>Methodology</h2>
          <p>
            Growth rates, annualized momentum and contributions are calculated from published
            index levels where noted. Seasonal-adjustment status and transformation definitions
            are shown on individual dashboards. Survey and hard-data indicators remain
            separated to avoid false comparability.
          </p>
          <p>
            Market-implied measures such as Treasury breakevens are treated as pricing signals,
            not pure forecasts. They can include risk, liquidity and term premia in addition to
            expectations.
          </p>
          <p>
            Yen pass-through views distinguish a higher USD/JPY rate (yen depreciation) from
            higher BOJ effective exchange-rate indices (yen appreciation). Co-movement with
            import or consumer prices is descriptive and is not presented as a causal estimate.
          </p>
          <p>
            CPI scenario paths compound the selected constant monthly rate from the latest
            seasonally adjusted official index and compare each projected level with its actual
            year-ago index. They are conditional arithmetic paths—not forecasts—and missing
            official comparison months are not interpolated.
          </p>
          <p>
            The US dining-demand proxy divides seasonally adjusted Census restaurant sales by
            the BLS food-away-from-home CPI. Its growth rate is an approximate real-spending
            signal, not a chain-weighted BEA consumption measure, and the advance sales estimate
            is subject to revision.
          </p>
          <p>
            Retail-sales headlines use one common advance-release month, while category breadth
            retains the latest common month from the revised Monthly Retail Trade Survey. Housing
            cards retain their individual weekly, monthly or quarterly observation dates rather
            than presenting different frequencies as if they were a single-period comparison.
          </p>
        </article>

        <article id="macro-significance">
          <h2>Macro significance</h2>
          <p>
            Dashboard stars are an editorial monitoring hierarchy—not a rating of data quality,
            reliability or forecast accuracy. <strong>★★★ Core</strong> indicators have broad
            cycle, policy or market relevance. <strong>★★ Supporting</strong> indicators add
            timely confirmation, leading detail or a transmission channel. <strong>★ Specialized</strong>
            indicators answer a narrower sector question and are best read with broader data.
          </p>
        </article>

        <article>
          <h2>Known limitations</h2>
          <ul>
            <li>Official data can be revised after initial publication.</li>
            <li>Some source files do not expose stable API identifiers and are labeled as reference snapshots.</li>
            <li>Series can have different release lags, base years and seasonal-adjustment methods.</li>
            <li>Mechanical scenarios do not incorporate energy shocks, policy reactions or changing category weights.</li>
          </ul>
        </article>

        <article className="is-wide about-page__notice">
          <h2>FRED attribution and disclaimer</h2>
          <p>
            This product uses the FRED® API but is not endorsed or certified by the Federal
            Reserve Bank of St. Louis. Source attribution on US dashboards identifies both the
            original publisher and FRED. Use of FRED data is subject to the{' '}
            <a href="https://fred.stlouisfed.org/docs/api/terms_of_use.html" rel="noreferrer" target="_blank">
              FRED API Terms of Use
            </a>.
          </p>
        </article>

        <article className="is-wide about-page__notice">
          <h2>Statistics Dashboard API credit</h2>
          <p>
            This service uses the API feature of Statistics Dashboard, but the contents of this
            service are not guaranteed by the Statistics Bureau of Japan. Japan housing data is
            sourced from the Ministry of Land, Infrastructure, Transport and Tourism through that API.
          </p>
        </article>

        <article className="is-wide">
          <h2>Research disclaimer & verification</h2>
          <p>
            Macro Data Monitor is provided for informational and educational purposes only. It does not
            constitute investment, legal, tax or other professional advice. Verify important
            figures against the linked official release before making decisions.
          </p>
          <div className="about-page__actions">
            <a href="https://github.com/Hikky-fuji/macro-data-monitor" rel="noreferrer" target="_blank">
              View source code ↗
            </a>
            <Link href="/status">Check data status</Link>
          </div>
        </article>
      </section>
    </main>
  )
}
