import { useState, useCallback, useId } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Minus, CheckSquare } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface ChecklistEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  confirmLevel: 'quick' | 'full';
}

// ─── Template Items ─────────────────────────────────────

const TEMPLATE_ITEMS = [
  'Implementation is complete and tested',
  'No merge conflicts with target branch',
  'Tests pass on source branch',
  'Code reviewed',
  'Documentation updated',
];

// ─── Component ──────────────────────────────────────────

export function ChecklistEditor({ items, onChange, confirmLevel }: ChecklistEditorProps) {
  const [newItem, setNewItem] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const itemIds = items.map((_, i) => `checklist-${i}`);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...items];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    onChange(next);
  }, [items, itemIds, onChange]);

  const addItem = useCallback(() => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setNewItem('');
  }, [newItem, items, onChange]);

  const removeItem = useCallback((idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
    if (editingIndex === idx) setEditingIndex(null);
  }, [items, onChange, editingIndex]);

  const startEditing = useCallback((idx: number) => {
    setEditingIndex(idx);
    setEditValue(items[idx]);
  }, [items]);

  const finishEditing = useCallback(() => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== items[editingIndex]) {
      const next = [...items];
      next[editingIndex] = trimmed;
      onChange(next);
    }
    setEditingIndex(null);
  }, [editingIndex, editValue, items, onChange]);

  const addTemplate = useCallback((template: string) => {
    if (items.includes(template)) return;
    onChange([...items, template]);
  }, [items, onChange]);

  return (
    <div className="space-y-2">
      {/* Items list */}
      {items.length > 0 ? (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {items.map((item, idx) => (
                <SortableChecklistItem
                  key={itemIds[idx]}
                  id={itemIds[idx]}
                  item={item}
                  index={idx}
                  isEditing={editingIndex === idx}
                  editValue={editValue}
                  onEditValueChange={setEditValue}
                  onStartEdit={startEditing}
                  onFinishEdit={finishEditing}
                  onRemove={removeItem}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded border border-dashed border-zinc-800 bg-zinc-950/30 px-3 py-4 text-center">
          <CheckSquare className="mx-auto mb-1.5 h-4 w-4 text-zinc-700" />
          <p className="text-[10px] text-zinc-600">
            No checklist items. Add items that must be acknowledged before this transition.
          </p>
        </div>
      )}

      {/* Add new item */}
      <div className="flex gap-1.5">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          placeholder="New item..."
        />
        <button
          onClick={addItem}
          disabled={!newItem.trim()}
          className="rounded bg-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Quick-add templates */}
      <div>
        <span className="mb-1 block text-[9px] font-medium text-zinc-600">Quick add:</span>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_ITEMS.filter((t) => !items.includes(t)).map((template) => (
            <button
              key={template}
              onClick={() => addTemplate(template)}
              className="rounded border border-zinc-800 bg-zinc-950/50 px-1.5 py-0.5 text-[9px] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
            >
              + {template.length > 30 ? `${template.slice(0, 30)}…` : template}
            </button>
          ))}
        </div>
      </div>

      {/* Preview hint */}
      {confirmLevel === 'full' && items.length > 0 && (
        <div className="rounded border border-violet-500/20 bg-violet-500/5 p-2">
          <span className="text-[9px] font-medium text-violet-400">Dispatch preview:</span>
          <ul className="mt-1 space-y-0.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                <span className="h-3 w-3 shrink-0 rounded border border-zinc-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Item ──────────────────────────────────────

function SortableChecklistItem({ id, item, index, isEditing, editValue, onEditValueChange, onStartEdit, onFinishEdit, onRemove }: {
  id: string;
  item: string;
  index: number;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: (idx: number) => void;
  onFinishEdit: () => void;
  onRemove: (idx: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950/30 px-1.5 py-1"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-0.5 text-zinc-700 hover:text-zinc-500 active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      {isEditing ? (
        <input
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onBlur={onFinishEdit}
          onKeyDown={(e) => e.key === 'Enter' && onFinishEdit()}
          className="flex-1 bg-transparent text-xs text-zinc-200 outline-none"
          autoFocus
        />
      ) : (
        <span
          onClick={() => onStartEdit(index)}
          className="flex-1 cursor-text truncate text-xs text-zinc-300"
        >
          {item}
        </span>
      )}
      <button
        onClick={() => onRemove(index)}
        className="rounded p-0.5 text-zinc-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        <Minus className="h-3 w-3" />
      </button>
    </div>
  );
}
