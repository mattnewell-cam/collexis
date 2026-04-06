'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loggedFetch } from '@/lib/logging/fetch';
import type { Job } from '@/types/job';

type FieldStatus = 'known' | 'not_yet_known' | 'skipped';

interface IntakeChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface IntakeChatApiResponse {
  field_statuses: Record<string, FieldStatus>;
  field_summaries: Record<string, string>;
  current_field: string | null;
  assistant_message: string;
  all_complete: boolean;
  context_summary: string;
}

interface IntakeChatProps {
  job: Job;
  onComplete: (contextSummary: string) => void;
  onCancel: () => void;
}

export default function IntakeChat({ job, onComplete, onCancel }: IntakeChatProps) {
  const [messages, setMessages] = useState<IntakeChatMessage[]>([]);
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, FieldStatus>>({});
  const [currentField, setCurrentField] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initCalledRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendToBackend = useCallback(async (
    chatMessages: IntakeChatMessage[],
    statuses: Record<string, FieldStatus>,
  ): Promise<IntakeChatApiResponse> => {
    const response = await loggedFetch(`/api/jobs/${job.id}/intake-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
        field_statuses: statuses,
      }),
    }, {
      name: 'intake_chat.send',
      context: { jobId: job.id },
    });
    if (!response.ok) {
      throw new Error('Failed to get response from intake chat.');
    }
    return response.json() as Promise<IntakeChatApiResponse>;
  }, [job.id]);

  // Initialize: send empty message to get first question
  useEffect(() => {
    if (initCalledRef.current) return;
    initCalledRef.current = true;

    async function init() {
      setLoading(true);
      try {
        const result = await sendToBackend([], {});
        setFieldStatuses(result.field_statuses);
        setCurrentField(result.current_field);
        if (result.all_complete) {
          onComplete(result.context_summary);
          return;
        }
        setMessages([{ role: 'assistant', content: result.assistant_message }]);
        setInitialized(true);
      } catch {
        setError('Could not start intake chat.');
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [sendToBackend, onComplete]);

  useEffect(() => {
    if (initialized && !loading) {
      inputRef.current?.focus();
    }
  }, [initialized, loading, messages]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: IntakeChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const result = await sendToBackend(nextMessages, fieldStatuses);
      setFieldStatuses(result.field_statuses);
      setCurrentField(result.current_field);

      if (result.all_complete) {
        setMessages(prev => [...prev, { role: 'assistant', content: result.assistant_message }]);
        // Short delay so user sees the final message
        setTimeout(() => onComplete(result.context_summary), 1200);
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: result.assistant_message }]);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, fieldStatuses, sendToBackend, onComplete]);

  const handleSkip = useCallback(async () => {
    if (!currentField || loading) return;

    const nextStatuses = { ...fieldStatuses, [currentField]: 'skipped' as FieldStatus };
    const skipMessage: IntakeChatMessage = { role: 'user', content: '[Skipped]' };
    const nextMessages = [...messages, skipMessage];
    setMessages(nextMessages);
    setLoading(true);
    setError(null);

    try {
      const result = await sendToBackend(nextMessages, nextStatuses);
      setFieldStatuses(result.field_statuses);
      setCurrentField(result.current_field);

      if (result.all_complete) {
        setMessages(prev => [...prev, { role: 'assistant', content: result.assistant_message }]);
        setTimeout(() => onComplete(result.context_summary), 1200);
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: result.assistant_message }]);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [currentField, loading, messages, fieldStatuses, sendToBackend, onComplete]);

  const knownCount = Object.values(fieldStatuses).filter(s => s === 'known').length;
  const totalFields = Object.keys(fieldStatuses).length || 10;
  const skippedCount = Object.values(fieldStatuses).filter(s => s === 'skipped').length;
  const progressPercent = totalFields > 0 ? Math.round(((knownCount + skippedCount) / totalFields) * 100) : 0;

  return (
    <div className="flex h-full max-h-[28rem] flex-col">
      {/* Progress bar */}
      <div className="mb-3 px-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)',
            }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-1">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-[#2abfaa] to-[#1e9bb8] text-white'
                  : msg.content === '[Skipped]'
                    ? 'bg-gray-100 text-gray-400 italic'
                    : 'border border-gray-150 bg-white text-gray-700 shadow-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-gray-150 bg-white px-4 py-2.5 text-sm text-gray-400 shadow-sm">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error ? (
        <p className="mt-2 px-1 text-xs text-red-500">{error}</p>
      ) : null}

      {/* Input area */}
      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          disabled={loading || !initialized}
          placeholder="Type your answer..."
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-slate-50 px-4 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => { void handleSend(); }}
          disabled={loading || !input.trim() || !initialized}
          className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
        >
          Send
        </button>
        {currentField ? (
          <button
            type="button"
            onClick={() => { void handleSkip(); }}
            disabled={loading}
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Skip
          </button>
        ) : null}
      </div>

      {/* Cancel link */}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-400 transition-colors hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
