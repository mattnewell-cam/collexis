'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Communication } from '@/types/communication';
import { DocumentRecord } from '@/types/document';
import { parseCommunicationDate } from '@/lib/communicationDates';
import { toUserFacingErrorMessage } from '@/lib/userFacingError';
import { getCategoryDef, getRecipientLabel, getSenderLabel, getSubtypeLabel } from './categoryConfig';

interface Props {
  comm: Communication;
  documents: DocumentRecord[];
  onEdit: (comm: Communication) => void;
  onDelete: (comm: Communication) => void;
  onLinkDocument: (comm: Communication, documentId: string) => Promise<void>;
  onUploadDocuments: (comm: Communication, files: FileList) => Promise<void>;
}

function documentDisplayName(document: DocumentRecord) {
  return document.title.trim() || document.originalFilename;
}

function documentStatusTone(status: DocumentRecord['status']) {
  if (status === 'failed') return 'text-rose-600';
  if (status === 'ready') return 'text-emerald-600';
  return 'text-amber-600';
}

function isManuallyEditable(comm: Communication) {
  if (comm.sender === 'collexis' || comm.recipient === 'collexis') return false;
  if (comm.category === 'due-date' || comm.category === 'handover-letter' || comm.category === 'letter') return false;
  return true;
}

export default function TimelineItem({
  comm,
  documents,
  onEdit,
  onDelete,
  onLinkDocument,
  onUploadDocuments,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [documentsExpanded, setDocumentsExpanded] = useState(false);
  const [pickerExpanded, setPickerExpanded] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsMenuRef = useRef<HTMLDivElement>(null);
  const catDef = getCategoryDef(comm.category);
  const timelineLabelLines = comm.subtype
    ? [catDef.label, getSubtypeLabel(comm.subtype)]
    : catDef.timelineLabelLines ?? [catDef.label];
  const linkedDocumentIds = useMemo(() => comm.linkedDocumentIds ?? [], [comm.linkedDocumentIds]);
  const relatedDocuments = useMemo(
    () => linkedDocumentIds
      .map(documentId => documents.find(document => document.id === documentId))
      .filter((document): document is DocumentRecord => document !== undefined),
    [documents, linkedDocumentIds],
  );
  const availableDocuments = useMemo(
    () => documents.filter(document => !linkedDocumentIds.includes(document.id)),
    [documents, linkedDocumentIds],
  );

  const parsedDate = parseCommunicationDate(comm.date);
  const canEdit = isManuallyEditable(comm);
  const dateStr = parsedDate
    ? parsedDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : comm.date;

  useEffect(() => {
    if (!documentsExpanded) {
      setPickerExpanded(false);
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!documentsMenuRef.current?.contains(event.target as Node)) {
        setDocumentsExpanded(false);
        setPickerExpanded(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [documentsExpanded]);

  useEffect(() => {
    setDocumentsError(null);
  }, [comm.linkedDocumentIds]);

  const handleLinkDocument = async (documentId: string) => {
    setDocumentsError(null);
    setIsLinking(true);
    try {
      await onLinkDocument(comm, documentId);
      setPickerExpanded(false);
      setDocumentsExpanded(true);
    } catch (error) {
      setDocumentsError(toUserFacingErrorMessage(error, 'Could not relate document.'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUploadedFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setDocumentsError(null);
    setIsUploading(true);
    try {
      await onUploadDocuments(comm, files);
      setDocumentsExpanded(true);
    } catch (error) {
      setDocumentsError(toUserFacingErrorMessage(error, 'Could not upload documents.'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex group">
      {/* Interval label spacer */}
      <div className="w-8 shrink-0" />

      {/* Category label on the line — full-height line, badge centred vertically */}
      <div className="w-32 shrink-0 self-stretch relative">
        {/* Full-height line */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-gray-200" />
        {/* Badge centred vertically */}
        <div className="absolute inset-0 grid place-items-center z-10">
          <span className={`inline-grid justify-items-center gap-0.5 px-2.5 py-1 rounded-full text-sm font-medium text-center leading-tight ${comm.subtype ? 'min-w-[6rem]' : ''} ${catDef.timelineBadgeClass ?? ''} ${catDef.color}`}>
            {timelineLabelLines.map((line, index) => (
              <span
                key={line}
                className={comm.subtype && index === 1 ? 'font-normal italic' : undefined}
              >
                {line}
              </span>
            ))}
          </span>
        </div>
      </div>

      {/* Card — py-3 gives breathing room so line extends slightly beyond card edges */}
      <div className="flex-1 py-1.5 pl-3 min-w-0">
        <div className="relative overflow-visible rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-medium text-gray-500">{dateStr}</span>
                {comm.sender && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-gray-500 bg-gray-100">
                    {getSenderLabel(comm.sender)}
                  </span>
                )}
                {comm.recipient && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-gray-500 bg-gray-100">
                    {getRecipientLabel(comm.recipient)}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800">{comm.shortDescription}</p>
              {comm.details && expanded && (
                <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed">
                  {comm.details}
                </pre>
              )}

            </div>

            {/* Actions */}
            {canEdit ? (
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => onEdit(comm)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Edit"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(comm)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="Delete"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-1 flex items-start gap-2">
            {comm.details && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-[#1e9bb8] hover:opacity-80 transition-opacity"
              >
                {expanded ? 'Hide details' : 'Show details'}
              </button>
            )}

            <div ref={documentsMenuRef} className="relative ml-auto self-end shrink-0">
              <button
                type="button"
                onClick={() => setDocumentsExpanded(current => !current)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100"
                aria-expanded={documentsExpanded}
              >
                <span>{linkedDocumentIds.length} related documents</span>
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${documentsExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {documentsExpanded && (
                <div className="absolute right-0 top-full z-20 mt-2 w-[22rem] rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-lg shadow-slate-200/70">
                  <div className="space-y-2">
                    {relatedDocuments.length > 0 ? (
                      relatedDocuments.map(document => (
                        <div
                          key={document.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-gray-700">
                              {documentDisplayName(document)}
                            </p>
                            <p className="truncate text-[11px] text-gray-400">
                              {document.originalFilename}
                            </p>
                          </div>
                          <span className={`shrink-0 text-[11px] font-medium ${documentStatusTone(document.status)}`}>
                            {document.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">
                        No related documents yet.
                      </p>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerExpanded(current => !current)}
                      disabled={isLinking || isUploading}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLinking ? 'Relating...' : 'Relate existing documents'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLinking || isUploading}
                      className="w-full rounded-lg px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
                    >
                      {isUploading ? 'Uploading...' : 'Add documents'}
                    </button>
                  </div>

                  {pickerExpanded && (
                    <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-white p-2">
                      {availableDocuments.length > 0 ? (
                        availableDocuments.map(document => (
                          <button
                            key={document.id}
                            type="button"
                            onClick={() => { void handleLinkDocument(document.id); }}
                            disabled={isLinking || isUploading}
                            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-gray-700">
                                {documentDisplayName(document)}
                              </p>
                              <p className="truncate text-[11px] text-gray-400">
                                {document.originalFilename}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium text-[#1e9bb8]">
                              Attach
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-1 text-xs text-gray-400">
                          No other documents are available for this job.
                        </p>
                      )}
                    </div>
                  )}

                  {documentsError ? (
                    <p className="mt-2 text-xs text-rose-600">{documentsError}</p>
                  ) : null}

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={event => {
                      void handleUploadedFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
