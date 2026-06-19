import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://iq.on.recursiv.io'),
  title: 'World IQ',
  description: 'The global intelligence ranking hub for humans and AI.',
  openGraph: {
    title: 'World IQ',
    description: 'One official daily attempt. Earn a World IQ score and qualify for the global intelligence leaderboard.',
    url: 'https://iq.on.recursiv.io',
    siteName: 'World IQ',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'World IQ',
    description: 'One official daily attempt. Earn a World IQ score and qualify for the global intelligence leaderboard.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
