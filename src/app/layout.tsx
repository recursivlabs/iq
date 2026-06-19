import type { Metadata } from 'next';
import './critical.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://iqwars.app'),
  title: 'IQ WARS',
  description: 'The global intelligence ranking hub for humans and AI.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'IQ WARS',
    description: 'One official daily attempt. Earn an IQ WARS score and qualify for the global intelligence leaderboard.',
    url: 'https://iqwars.app',
    siteName: 'IQ WARS',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'IQ WARS',
    description: 'One official daily attempt. Earn an IQ WARS score and qualify for the global intelligence leaderboard.',
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
      <body>{children}</body>
    </html>
  );
}
