import type { Metadata } from 'next';
import './critical.css';

const firstPaintCss = 'html,body{min-height:100%;margin:0;background:#060708;color:#e9ebec;}body{overflow-x:hidden;}main{min-height:100svh;background:#060708;color:#e9ebec;}';

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
  const adsenseClient = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT;
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#060708" />
        <style data-iqwars-critical dangerouslySetInnerHTML={{ __html: firstPaintCss }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        {adsenseClient ? (
          <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`} crossOrigin="anonymous" />
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
