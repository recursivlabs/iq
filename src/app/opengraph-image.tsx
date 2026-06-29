import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'IQ WARS daily scorecard challenge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const cells = Array.from({ length: 12 }, (_, index) => index);
  const gridLines = Array.from({ length: 12 }, (_, index) => index);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#060708',
          color: '#f4f5f6',
          fontFamily: 'Arial, Helvetica, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {gridLines.map((line) => (
          <div
            key={`v-${line}`}
            style={{
              position: 'absolute',
              left: 70 + line * 86,
              top: 0,
              width: 1,
              height: '100%',
              backgroundColor: 'rgba(255,255,255,.05)',
            }}
          />
        ))}
        {gridLines.slice(0, 7).map((line) => (
          <div
            key={`h-${line}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 56 + line * 82,
              width: '100%',
              height: 1,
              backgroundColor: 'rgba(255,255,255,.04)',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            right: 74,
            top: 56,
            borderRadius: 520,
            border: '1px solid rgba(255,255,255,.18)',
            backgroundColor: '#111417',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 180,
            height: 180,
            right: 368,
            top: 94,
            borderRadius: 180,
            backgroundColor: 'rgba(255,255,255,.16)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 164,
            top: 178,
            display: 'flex',
            flexWrap: 'wrap',
            width: 264,
            gap: 16,
            transform: 'rotate(-12deg)',
          }}
        >
          {cells.map((cell) => (
            <div
              key={cell}
              style={{
                width: 54,
                height: 54,
                border: '1px solid rgba(255,255,255,.22)',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cell % 5 === 0 ? '#33383d' : '#171a1d',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {Array.from({ length: cell % 3 === 0 ? 3 : cell % 3 === 1 ? 2 : 1 }, (_, dot) => (
                  <span
                    key={dot}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 7,
                      backgroundColor: '#f4f5f6',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '72px 78px 64px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 12 }}>IQ WARS</div>
            <div style={{ fontSize: 22, letterSpacing: 6, color: '#9da3a8' }}>001 / 012</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 620 }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 82, lineHeight: .92, fontWeight: 800, letterSpacing: -3 }}>
              <span>12 QUESTIONS.</span>
              <span>1 ATTEMPT.</span>
            </div>
            <div style={{ fontSize: 30, color: '#c4c8cc', lineHeight: 1.25 }}>
              Beat your friends on the daily reasoning board.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, color: '#9da3a8', fontSize: 24, letterSpacing: 4 }}>
            <span>TODAY</span>
            <span>GLOBAL</span>
            <span>ROOMS</span>
            <span>PROOFED</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
