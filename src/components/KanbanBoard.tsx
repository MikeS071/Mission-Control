'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Task = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  goal: string;
  assignedAgent: string | null;
};

type ApiTask = Task & { assigned_agent?: string | null };
type GatewayPayload = Record<string, unknown>;

type TaskForm = {
  title: string;
  description: string;
  goal: string;
  priority: string;
  status: string;
  assignedAgent: string;
};

const STATUS_COLUMNS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS: Record<string, string> = { todo: 'Todo', in_progress: 'In Progress', done: 'Done' };
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const AGENTS = ['Unassigned', 'Navi (main)', 'Sub-agent 1', 'Sub-agent 2'];
const GOALS = ['Goal 1', 'Goal 2', 'Goal 3', 'Goal 4', 'Goal 5'];
const emptyForm: TaskForm = { title: '', description: '', goal: 'Goal 1', priority: 'Medium', status: 'todo', assignedAgent: 'Unassigned' };

function normalizeStatus(status: string) {
  const value = (status || '').toLowerCase();
  if (['done', 'complete', 'completed'].includes(value)) return 'done';
  if (['in_progress', 'in progress', 'assigned', 'review'].includes(value)) return 'in_progress';
  return 'todo';
}

function mapTask(t: ApiTask): Task {
  return {
    ...t,
    status: normalizeStatus(t.status),
    assignedAgent: t.assignedAgent ?? t.assigned_agent ?? null,
    priority: t.priority || 'Medium',
    goal: t.goal || 'Goal 1',
  };
}

function StatsTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`w-44 h-32 rounded-lg border-2 ${color} bg-gray-900 flex flex-col items-center justify-center p-3`}>
      <div className="text-2xl font-bold text-white text-center">{value}</div>
      <div className="text-xs text-gray-400 mt-2 text-center">{label}</div>
    </div>
  );
}

function TaskFormFields({ value, onChange }: { value: TaskForm; onChange: (next: TaskForm) => void }) {
  return (
    <div className="space-y-3">
      <input className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" placeholder="Title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      <textarea className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" rows={3} placeholder="Description" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value.goal} onChange={(e) => onChange({ ...value, goal: e.target.value })}>{GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}</select>
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })}>{STATUS_COLUMNS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value.assignedAgent} onChange={(e) => onChange({ ...value, assignedAgent: e.target.value })}>{AGENTS.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select>
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newTask, setNewTask] = useState<TaskForm>(emptyForm);
  const [editTask, setEditTask] = useState<TaskForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stats, setStats] = useState({ tokens: '--', cost: '--', agents: '--', taskSummary: '--' });

  const load = useCallback(async () => {
    const data = (await fetch('/api/tasks').then((r) => r.json())) as ApiTask[];
    setTasks(data.map(mapTask));
  }, []);

  const loadStats = useCallback(async () => {
    let tokens = '--';
    let cost = '--';
    let agents = '--';
    try {
      const [rootRes, statusRes] = await Promise.all([fetch('/api/gateway', { cache: 'no-store' }), fetch('/api/gateway/status', { cache: 'no-store' })]);
      const rootData = (rootRes.ok ? await rootRes.json() : {}) as GatewayPayload;
      const statusData = (statusRes.ok ? await statusRes.json() : {}) as GatewayPayload;
      const merged = { ...rootData, ...statusData };
      const tokenVal = Number(merged.totalTokens ?? merged.tokensConsumed ?? merged.tokens ?? 0);
      const costVal = Number(merged.estimatedCost ?? merged.cost ?? 0);
      const activeVal = merged.activeAgents ?? merged.active_agents ?? merged.sessionsActive;
      if (tokenVal) tokens = tokenVal.toLocaleString();
      if (costVal) cost = `$${costVal.toFixed(4)}`;
      if (activeVal !== undefined && activeVal !== null) agents = String(activeVal);
    } catch {
      // graceful fallback
    }
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'done').length;
    setStats({ tokens, cost, agents, taskSummary: `${total} / ${completed}` });
  }, [tasks]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    const es = new EventSource('/api/tasks/stream');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as ApiTask[];
      setTasks(data.map(mapTask));
    };
    return () => {
      clearTimeout(t);
      es.close();
    };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadStats();
    }, 0);
    const interval = setInterval(() => {
      void loadStats();
    }, 30000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [loadStats]);

  const grouped = useMemo(() => STATUS_COLUMNS.map((col) => ({ col, items: tasks.filter((t) => t.status === col) })), [tasks]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const id = Number(result.draggableId);
    const status = result.destination.droppableId;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
  };

  const onInlinePriorityChange = async (task: Task, e: ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const priority = e.target.value;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, priority } : t)));
    await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priority }) });
  };

  const createTask = async () => {
    await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...newTask, assignedAgent: newTask.assignedAgent === 'Unassigned' ? null : newTask.assignedAgent }) });
    setNewTask(emptyForm);
    setIsAddOpen(false);
    void load();
  };

  const saveTask = async () => {
    if (!editingId) return;
    await fetch(`/api/tasks/${editingId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...editTask, assignedAgent: editTask.assignedAgent === 'Unassigned' ? null : editTask.assignedAgent }) });
    setIsEditOpen(false);
    setEditingId(null);
    void load();
  };

  const deleteTask = async () => {
    if (!editingId) return;
    await fetch(`/api/tasks/${editingId}`, { method: 'DELETE' });
    setIsEditOpen(false);
    setEditingId(null);
    void load();
  };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTask({ title: task.title, description: task.description, goal: task.goal, priority: task.priority, status: task.status, assignedAgent: task.assignedAgent || 'Unassigned' });
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 overflow-x-auto pb-1">
          <StatsTile label="Session Tokens" value={stats.tokens} color="border-blue-700" />
          <StatsTile label="Estimated Cost" value={stats.cost} color="border-emerald-700" />
          <StatsTile label="Active Agents" value={stats.agents} color="border-purple-700" />
          <StatsTile label="Tasks (Total / Done)" value={stats.taskSummary} color="border-orange-700" />
        </div>
        <Button onClick={() => setIsAddOpen(true)}>Add Task</Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {grouped.map(({ col, items }) => (
            <div key={col} className="flex-shrink-0 w-72">
              <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">{STATUS_LABELS[col]}</h3>
              <Droppable droppableId={col}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-40 rounded-lg p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-gray-800' : 'bg-gray-900'}`}>
                    {items.map((task, i) => (
                      <Draggable key={task.id} draggableId={String(task.id)} index={i}>
                        {(p, s) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} onClick={() => openEdit(task)} className={`cursor-pointer bg-gray-800 rounded p-3 border border-gray-700 ${s.isDragging ? 'shadow-lg border-blue-500' : ''}`}>
                            <p className="text-sm font-medium text-white">{task.title}</p>
                            {task.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.description}</p>}
                            <div className="flex gap-1 mt-2 flex-wrap items-center">
                              <select value={task.priority} onClick={(e) => e.stopPropagation()} onChange={(e) => onInlinePriorityChange(task, e)} className="text-xs rounded px-2 py-1 border border-gray-600 bg-gray-950">
                                {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                              </select>
                              <Badge variant="outline" className="text-xs">{task.goal}</Badge>
                              {task.assignedAgent && <Badge className="text-xs">{task.assignedAgent}</Badge>}
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

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader><DialogTitle>Add Task</DialogTitle><DialogDescription>Create a new card on the board.</DialogDescription></DialogHeader>
          <TaskFormFields value={newTask} onChange={setNewTask} />
          <DialogFooter><Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button onClick={createTask}>Create Task</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle><DialogDescription>Update task details, status, or assignment.</DialogDescription></DialogHeader>
          <TaskFormFields value={editTask} onChange={setEditTask} />
          <DialogFooter className="justify-between"><Button variant="destructive" onClick={deleteTask}>Delete</Button><div className="flex gap-2"><Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button onClick={saveTask}>Save</Button></div></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
