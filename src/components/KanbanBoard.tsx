'use client';
import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';

type Task = { id: number; title: string; description: string; status: string; agent: string; priority: string };

const COLUMNS = ['backlog', 'assigned', 'in_progress', 'review', 'done'];
const LABELS: Record<string, string> = { backlog: 'Backlog', assigned: 'Assigned', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const PRIORITY_COLOR: Record<string, string> = { high: 'destructive', medium: 'secondary', low: 'outline' };

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = () => fetch('/api/tasks').then(r => r.json()).then(setTasks);

  useEffect(() => {
    load();
    const es = new EventSource('/api/tasks/stream');
    es.onmessage = e => setTasks(JSON.parse(e.data));
    return () => es.close();
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const id = parseInt(draggableId);
    const status = destination.droppableId;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await fetch('/api/tasks', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map(col => (
          <div key={col} className="flex-shrink-0 w-64">
            <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">{LABELS[col]}</h3>
            <Droppable droppableId={col}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-32 rounded-lg p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-gray-800' : 'bg-gray-900'}`}
                >
                  {tasks.filter(t => t.status === col).map((task, i) => (
                    <Draggable key={task.id} draggableId={String(task.id)} index={i}>
                      {(p, s) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          {...p.dragHandleProps}
                          className={`bg-gray-800 rounded p-3 border border-gray-700 ${s.isDragging ? 'shadow-lg border-blue-500' : ''}`}
                        >
                          <p className="text-sm font-medium text-white">{task.title}</p>
                          {task.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.description}</p>}
                          <div className="flex gap-1 mt-2 flex-wrap">
                            <Badge variant={PRIORITY_COLOR[task.priority] as any} className="text-xs">{task.priority}</Badge>
                            {task.agent && <Badge variant="outline" className="text-xs">{task.agent}</Badge>}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
