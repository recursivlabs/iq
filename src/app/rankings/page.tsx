import Home from '../IqApp';

export default function RankingsPage({ searchParams }: { searchParams?: { g?: string } }) {
  return <Home initialView="rankings" initialGroupCode={searchParams?.g || ''} />;
}
