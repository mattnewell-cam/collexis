'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { PostNowStep } from '@/types/postNowPlan';
import { getSenderLabel } from './categoryConfig';
import {
  clampPostNowDelay,
  POST_NOW_STEP_DEFINITIONS,
  getPostNowStepDefinition,
  buildPostNowStep,
} from './postNowPlannerConfig';

interface Props {
  steps: PostNowStep[];
  defaultSender: 'you' | 'collexis';
  onDelayChange: (id: string, delayDays: number) => void;
  onSenderChange: (id: string, sender: 'you' | 'collexis') => void;
  onInsertStep: (index: number, step: PostNowStep) => void;
}

function useDismissOpenMenu(
  refs: RefObject<HTMLElement | null>[],
  onDismiss: () => void,
) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const clickedInside = refs.some(ref => ref.current?.contains(target));
      if (!clickedInside) onDismiss();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onDismiss, refs]);
}

function InsertMenu({
  index,
  defaultSender,
  onInsertStep,
  onClose,
}: {
  index: number;
  defaultSender: 'you' | 'collexis';
  onInsertStep: (index: number, step: PostNowStep) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute left-3 top-1/2 z-20 w-[14rem] -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.35)]"
    >
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        Add step
      </p>
      <div className="grid gap-1">
        {POST_NOW_STEP_DEFINITIONS.map(definition => (
          <button
            key={definition.kind}
            type="button"
            onClick={() => {
              onInsertStep(index, buildPostNowStep(definition.kind, defaultSender));
              onClose();
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${definition.dotClassName}`} />
            <span className={`text-sm font-medium ${definition.textClassName}`}>
              {definition.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InsertionPoint({
  value,
  index,
  isOpen,
  defaultSender,
  onChange,
  onToggle,
  onInsertStep,
  showHint = false,
  showDelay = true,
}: {
  value: number;
  index: number;
  isOpen: boolean;
  defaultSender: 'you' | 'collexis';
  onChange: (value: number) => void;
  onToggle: () => void;
  onInsertStep: (index: number, step: PostNowStep) => void;
  showHint?: boolean;
  showDelay?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuWrapperRef = useRef<HTMLDivElement>(null);

  useDismissOpenMenu(
    isOpen ? [buttonRef, menuWrapperRef] : [],
    isOpen ? onToggle : () => {},
  );

  return (
    <div className="relative flex h-10">
      <div className="w-8 shrink-0" />
      <div className="relative w-32 shrink-0">
        <div className="absolute left-1/2 h-full w-px -translate-x-px bg-gray-200" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <button
            ref={buttonRef}
            type="button"
            onClick={onToggle}
            className={`flex h-6 w-6 items-center justify-center rounded-full border bg-white text-sm leading-none shadow-sm transition-colors ${
              isOpen
                ? 'border-[#2abfaa] text-[#1e9bb8]'
                : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
            }`}
            aria-label="Add future step"
            aria-expanded={isOpen}
          >
            +
          </button>
        </div>
        {showDelay ? (
          <div className="absolute right-1/2 top-1/2 -translate-y-1/2 pr-6">
            <label className="inline-flex items-center gap-0.5 text-sm text-gray-400 whitespace-nowrap">
              <input
                type="number"
                min={0}
                max={365}
                value={value}
                onChange={event => onChange(clampPostNowDelay(Number(event.target.value)))}
                className="w-[2.15rem] rounded-md border border-gray-200 bg-white px-1 py-0.5 text-right text-sm text-gray-500 shadow-sm outline-none transition-colors [appearance:textfield] focus:border-[#2abfaa] focus:ring-1 focus:ring-[#2abfaa] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Delay in days"
              />
              <span>d</span>
            </label>
          </div>
        ) : null}
      </div>
      <div className="relative flex-1">
        {isOpen ? (
          <div ref={menuWrapperRef}>
            <InsertMenu
              index={index}
              defaultSender={defaultSender}
              onInsertStep={onInsertStep}
              onClose={onToggle}
            />
          </div>
        ) : null}
        {showHint ? (
          <div className="flex h-full items-center pl-3">
            <p className="text-sm text-gray-400">Use the + button to add the first future step.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FutureStep({
  step,
  onSenderChange,
}: {
  step: PostNowStep;
  onSenderChange: (id: string, sender: 'you' | 'collexis') => void;
}) {
  const definition = getPostNowStepDefinition(step.kind);
  const timelineLabelLines = definition.timelineLabelLines ?? [definition.label];
  const senderLabel = getSenderLabel(step.sender);
  const plannedDescription =
    step.kind === 'legal-escalation'
      ? 'Planned legal escalation'
      : `Planned ${definition.label.toLowerCase()} follow-up`;

  return (
    <div className="flex">
      <div className="w-8 shrink-0" />
      <div className="relative w-32 shrink-0 self-stretch">
        <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-px bg-gray-200" />
        <div className="absolute inset-0 grid place-items-center z-10">
          <span className={`inline-grid justify-items-center gap-0.5 px-2.5 py-1 rounded-full text-sm font-medium text-center leading-tight ${definition.timelineBadgeClassName ?? ''} ${definition.color}`}>
            {timelineLabelLines.map(line => (
              <span key={line}>{line}</span>
            ))}
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-3 pl-3">
        <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Planned</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-gray-500 bg-gray-100">
                  {senderLabel}
                </span>
              </div>
              <p className="text-sm text-gray-800">{plannedDescription}</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                type="button"
                onClick={() =>
                  onSenderChange(
                    step.id,
                    step.sender === 'you' ? 'collexis' : 'you',
                  )
                }
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label={`Switch sender from ${senderLabel}`}
                title={`Switch sender from ${senderLabel}`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 7h11" />
                  <path d="m14 4 4 3-4 3" />
                  <path d="M17 17H6" />
                  <path d="m10 14-4 3 4 3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomInsertionPoint({
  index,
  isOpen,
  defaultSender,
  onToggle,
  onInsertStep,
}: {
  index: number;
  isOpen: boolean;
  defaultSender: 'you' | 'collexis';
  onToggle: () => void;
  onInsertStep: (index: number, step: PostNowStep) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuWrapperRef = useRef<HTMLDivElement>(null);
  useDismissOpenMenu(
    isOpen ? [buttonRef, menuWrapperRef] : [],
    isOpen ? onToggle : () => {},
  );

  return (
    <div className="relative flex h-12">
      <div className="w-8 shrink-0" />
      <div className="relative w-32 shrink-0">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-gray-200" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <button
            ref={buttonRef}
            type="button"
            onClick={onToggle}
            className={`flex h-6 w-6 items-center justify-center rounded-full border bg-white text-sm leading-none shadow-sm transition-colors ${
              isOpen
                ? 'border-[#2abfaa] text-[#1e9bb8]'
                : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
            }`}
            aria-label="Add future step at the end"
            aria-expanded={isOpen}
          >
            +
          </button>
        </div>
      </div>
      <div className="relative flex-1">
        {isOpen ? (
          <div ref={menuWrapperRef}>
            <InsertMenu
              index={index}
              defaultSender={defaultSender}
              onInsertStep={onInsertStep}
              onClose={onToggle}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PostNowTimeline({
  steps,
  defaultSender,
  onDelayChange,
  onSenderChange,
  onInsertStep,
}: Props) {
  const [openInsertIndex, setOpenInsertIndex] = useState<number | null>(null);

  return (
    <div className="pt-2">
      {steps.length === 0 ? (
        <InsertionPoint
          value={3}
          index={0}
          isOpen={openInsertIndex === 0}
          defaultSender={defaultSender}
          onChange={() => {}}
          onToggle={() => setOpenInsertIndex(current => (current === 0 ? null : 0))}
          onInsertStep={onInsertStep}
          showHint
          showDelay={false}
        />
      ) : null}
      {steps.map((step, index) => (
        <div key={step.id}>
          <InsertionPoint
            value={step.delayDays}
            index={index}
            isOpen={openInsertIndex === index}
            defaultSender={defaultSender}
            onChange={delayDays => onDelayChange(step.id, delayDays)}
            onToggle={() => setOpenInsertIndex(current => (current === index ? null : index))}
            onInsertStep={onInsertStep}
          />
          <FutureStep
            step={step}
            onSenderChange={onSenderChange}
          />
        </div>
      ))}
      {steps.length > 0 ? (
        <BottomInsertionPoint
          index={steps.length}
          isOpen={openInsertIndex === steps.length}
          defaultSender={defaultSender}
          onToggle={() =>
            setOpenInsertIndex(current => (current === steps.length ? null : steps.length))
          }
          onInsertStep={onInsertStep}
        />
      ) : null}
    </div>
  );
}
