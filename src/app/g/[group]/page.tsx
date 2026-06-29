import IqApp from '../../IqApp';
import { loadInitialSocialBoards } from '../../_lib/initialSocialBoards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GroupPage({ params }: { params: { group: string } }) {
  const initialSocialBoards = await loadInitialSocialBoards(params.group);
  return <IqApp initialView="rankings" initialGroupCode={params.group} initialSocialBoards={initialSocialBoards} />;
}
