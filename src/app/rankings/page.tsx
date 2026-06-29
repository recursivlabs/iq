import Home from '../IqApp';
import { loadInitialSocialBoards } from '../_lib/initialSocialBoards';

export default async function RankingsPage({ searchParams }: { searchParams?: { g?: string } }) {
  const initialSocialBoards = await loadInitialSocialBoards(searchParams?.g || '');
  return <Home initialView="rankings" initialGroupCode={searchParams?.g || ''} initialSocialBoards={initialSocialBoards} />;
}
