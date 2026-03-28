'use client';

import { useDraggable } from '@dnd-kit/core';
import { CATEGORIES, CategoryDef } from './categoryConfig';

function PaletteItem({ cat }: { cat: CategoryDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${cat.value}`,
    data: { source: 'palette', category: cat.value },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging
          ? 'opacity-50 shadow-lg scale-105'
          : 'hover:border-[#2abfaa] hover:shadow-sm'
      }`}
    >
      {/* Drag handle */}
      <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
      </svg>

      {/* Dot + label */}
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cat.dotColor}`} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-700">{cat.label}</span>
        {cat.subtypes && (
          <span className="text-xs text-gray-400 ml-1.5">
            ({cat.subtypes.length} types)
          </span>
        )}
      </div>
    </div>
  );
}

export default function SidebarPalette() {
  return (
    <div className="w-[240px] shrink-0">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Drag to add
      </h3>
      <div className="space-y-2">
        {CATEGORIES.map(cat => (
          <PaletteItem key={cat.value} cat={cat} />
        ))}
      </div>
    </div>
  );
}
