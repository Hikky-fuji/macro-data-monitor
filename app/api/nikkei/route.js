export const revalidate = 900
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?interval=1mo&range=5y',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MacroDataMonitor/1.0)' },
        next: { revalidate },
      }
    )
    if (!res.ok) throw new Error(`Yahoo Finance responded with ${res.status}`)
    const json = await res.json()

    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No chart result from Yahoo Finance')

    const timestamps = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []

    const series = timestamps
      .map((ts, i) => {
        if (closes[i] == null) return null
        const d = new Date(ts * 1000)
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
        return { date: `${d.getUTCFullYear()}/${mm}`, value: Math.round(closes[i]) }
      })
      .filter(Boolean)

    return Response.json({ series })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
