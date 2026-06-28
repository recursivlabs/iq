import IqApp from '../../IqApp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function GroupPage({ params }: { params: { group: string } }) {
  return <IqApp initialView="rankings" initialGroupCode={params.group} />;
}
