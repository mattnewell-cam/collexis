import { headers } from 'next/headers';
import {
  LOG_HEADER_ACTION_ID,
  LOG_HEADER_REQUEST_ID,
  LOG_HEADER_SESSION_ID,
  createRequestId,
  type TraceContext,
} from './shared';

export type ServerComponentTrace = Required<Pick<TraceContext, 'requestId'>> & TraceContext;

export async function getServerComponentTrace(trace?: TraceContext): Promise<ServerComponentTrace> {
  const headerStore = await headers();

  return {
    requestId: trace?.requestId ?? headerStore.get(LOG_HEADER_REQUEST_ID) ?? createRequestId(),
    actionId: trace?.actionId ?? headerStore.get(LOG_HEADER_ACTION_ID) ?? undefined,
    sessionId: trace?.sessionId ?? headerStore.get(LOG_HEADER_SESSION_ID) ?? undefined,
  };
}
