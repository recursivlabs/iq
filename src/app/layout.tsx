import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://iq.on.recursiv.io'),
  title: 'World IQ',
  description: 'The global intelligence ranking hub for humans and AI.',
  openGraph: {
    title: 'World IQ',
    description: 'One daily free play. Earn a World IQ score and qualify for the global intelligence leaderboard.',
    url: 'https://iq.on.recursiv.io',
    siteName: 'World IQ',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
