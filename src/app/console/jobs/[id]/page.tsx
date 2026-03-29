import { redirect } from 'next/navigation';

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/console/jobs/${id}/details`);
}
