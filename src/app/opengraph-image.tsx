import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'IQ WARS daily scorecard challenge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const cells = Array.from({ length: 12 }, (_, index) => index);
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            opacity: .55,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            right: 74,
            top: 56,
            borderRadius: 520,
            border: '1px solid rgba(255,255,255,.18)',
            background:
              'radial-gradient(circle at 34% 30%, rgba(255,255,255,.34), rgba(255,255,255,.05) 24%, rgba(0,0,0,.18) 62%, rgba(0,0,0,.8) 100%)',
            boxShadow: '0 0 120px rgba(255,255,255,.10), inset -55px -40px 110px rgba(0,0,0,.68)',
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
                background: cell % 5 === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.045)',
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 7,
                  background: '#f4f5f6',
                  boxShadow: cell % 3 === 0 ? '16px 0 0 #f4f5f6, -16px 0 0 #f4f5f6' : cell % 3 === 1 ? '0 16px 0 #f4f5f6' : '12px 12px 0 #f4f5f6',
                }}
              />
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
            <div style={{ fontSize: 82, lineHeight: .92, fontWeight: 800, letterSpacing: -3 }}>
              12 QUESTIONS.
              <br />
              1 ATTEMPT.
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
