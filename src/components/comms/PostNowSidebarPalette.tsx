'use client';

import { useDraggable } from '@dnd-kit/core';
import { PostNowStepKind } from '@/types/postNowPlan';
import {
  POST_NOW_STEP_DEFINITIONS,
  PostNowStepCard,
  type PostNowDragData,
} from './postNowPlannerConfig';

function PaletteItem({ kind }: { kind: PostNowStepKind }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${kind}`,
    data: { source: 'palette', kind } satisfies PostNowDragData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${isDragging ? 'scale-[1.02] opacity-60' : ''}`}
      {...attributes}
      {...listeners}
    >
      <PostNowStepCard kind={kind} compact />
    </div>
  );
}

export default function PostNowSidebarPalette() {
  return (
    <div className="px-5 py-4">
      <div className="grid gap-3">
        {POST_NOW_STEP_DEFINITIONS.map(step => (
          <PaletteItem key={step.kind} kind={step.kind} />
        ))}
      </div>
    </div>
  );
}
