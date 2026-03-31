import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import JobDocumentsView from '@/components/JobDocumentsView';
import { findJobById } from '@/lib/jobStore';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = findJobById(id, await cookies());

  if (!job) notFound();

  return <JobDocumentsView jobId={id} />;
}
