import JobDocumentsView from '@/components/JobDocumentsView';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <JobDocumentsView jobId={id} />;
}
