import Home from '../../IqApp';

export default function PublicProfilePage({ params }: { params: { profile: string } }) {
  return <Home initialView="profile" initialProfileSlug={params.profile} />;
}
