import { ImageResponse } from 'next/og'

export const alt = 'Macro Data Monitor'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: 56,
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#1c2023',
          color: '#f5f7f8',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 70,
              height: 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f08a24',
              color: '#181818',
              fontSize: 27,
              fontWeight: 800,
            }}
          >
            MD
          </div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>
            Macro Data Monitor
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: '#f08a24', fontSize: 20, letterSpacing: 4 }}>
            JAPAN + UNITED STATES
          </div>
          <div style={{ display: 'flex', maxWidth: 980, marginTop: 18, fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>
            Official-source macro data, built for fast analysis.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b9c0c4', fontSize: 20 }}>
          <div style={{ display: 'flex' }}>Inflation · Growth · Labor · Consumption · Policy</div>
          <div style={{ display: 'flex', color: '#6abf91' }}>japanpulse.vercel.app</div>
        </div>
      </div>
    ),
    size,
  )
}
