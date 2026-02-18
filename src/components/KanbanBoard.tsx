'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { ChevronDown, ChevronRight, Clock3, Pencil, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EventItem, EventTimeline } from '@/components/EventTimeline';

type Task = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  goal: string;
  tags: string;
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
  tags: string;
  assignedAgent: string;
};

type Filters = {
  search: string;
  priority: string;
  goal: string;
  agent: string;
  tags: string;
};

const STATUS_COLUMNS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS: Record<string, string> = { todo: 'Todo', in_progress: 'In Progress', done: 'Done' };
const COLUMN_LABELS_KEY = 'mc-column-labels';
const COLUMN_COLLAPSED_KEY = 'mc-column-collapsed';
const WIP_LIMITS_KEY = 'mc-wip-limits';
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const AGENTS = ['Unassigned', 'Navi (main)', 'Sub-agent 1', 'Sub-agent 2'];
const GOALS = ['Goal 1', 'Goal 2', 'Goal 3', 'Goal 4', 'Goal 5'];
const FILTER_GOALS = ['All', 'Goal 1', 'Goal 2', 'Goal 3', 'Goal 4'];
const emptyForm: TaskForm = { title: '', description: '', goal: 'Goal 1', priority: 'Medium', status: 'todo', tags: '', assignedAgent: 'Unassigned' };
const emptyFilters: Filters = { search: '', priority: 'All', goal: 'All', agent: 'All', tags: '' };

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
    tags: t.tags || '',
  };
}

function StatsTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`h-32 w-44 rounded-lg border-2 ${color} bg-gray-900 p-3 flex flex-col items-center justify-center`}>
      <div className="text-2xl font-bold text-white text-center">{value}</div>
      <div className="mt-2 text-xs text-center text-gray-400">{label}</div>
    </div>
  );
}

function TaskFormFields({ value, onChange }: { value: TaskForm; onChange: (next: TaskForm) => void }) {
  return (
    <div className="space-y-3">
      <input className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" placeholder="Title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      <textarea className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" rows={3} placeholder="Description" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      <input className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" placeholder="Tags (comma separated)" value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} />
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
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [openHistoryTaskId, setOpenHistoryTaskId] = useState<number | null>(null);
  const [historyByTask, setHistoryByTask] = useState<Record<number, EventItem[]>>({});
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>(STATUS_LABELS);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});
  const [wipLimits, setWipLimits] = useState<Record<string, number | null>>({});
  const [editingWipColumn, setEditingWipColumn] = useState<string | null>(null);
  const [editingWipValue, setEditingWipValue] = useState('');

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedLabels = window.localStorage.getItem(COLUMN_LABELS_KEY);
      if (savedLabels) {
        setColumnLabels({ ...STATUS_LABELS, ...(JSON.parse(savedLabels) as Record<string, string>) });
      }
      const savedCollapsed = window.localStorage.getItem(COLUMN_COLLAPSED_KEY);
      if (savedCollapsed) {
        setCollapsedColumns(JSON.parse(savedCollapsed) as Record<string, boolean>);
      }
      const savedWip = window.localStorage.getItem(WIP_LIMITS_KEY);
      if (savedWip) {
        setWipLimits(JSON.parse(savedWip) as Record<string, number | null>);
      }
    } catch {
      // ignore invalid local storage values
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLUMN_LABELS_KEY, JSON.stringify(columnLabels));
  }, [columnLabels]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLUMN_COLLAPSED_KEY, JSON.stringify(collapsedColumns));
  }, [collapsedColumns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WIP_LIMITS_KEY, JSON.stringify(wipLimits));
  }, [wipLimits]);

  const agentOptions = useMemo(() => {
    const dynamicAgents = Array.from(new Set(tasks.map((t) => t.assignedAgent).filter((value): value is string => Boolean(value))));
    return ['All', ...dynamicAgents];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const search = filters.search.trim().toLowerCase();
      const tagSearch = filters.tags.trim().toLowerCase();
      const textMatch = search.length === 0 || task.title.toLowerCase().includes(search) || (task.description || '').toLowerCase().includes(search);
      const priorityMatch = filters.priority === 'All' || task.priority === filters.priority;
      const goalMatch = filters.goal === 'All' || task.goal === filters.goal;
      const agentMatch = filters.agent === 'All' || task.assignedAgent === filters.agent;
      const tagsMatch = tagSearch.length === 0 || (task.tags || '').toLowerCase().includes(tagSearch);
      return textMatch && priorityMatch && goalMatch && agentMatch && tagsMatch;
    });
  }, [tasks, filters]);

  const grouped = useMemo(() => STATUS_COLUMNS.map((col) => ({ col, items: filteredTasks.filter((t) => t.status === col) })), [filteredTasks]);

  const hasActiveFilters = filters.search !== '' || filters.priority !== 'All' || filters.goal !== 'All' || filters.agent !== 'All' || filters.tags !== '';
  const hiddenCount = tasks.length - filteredTasks.length;

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
    setEditTask({ title: task.title, description: task.description, goal: task.goal, priority: task.priority, status: task.status, tags: task.tags || '', assignedAgent: task.assignedAgent || 'Unassigned' });
    setIsEditOpen(true);
  };

  const loadHistory = useCallback(async (taskId: number) => {
    const response = await fetch(`/api/events?taskId=${taskId}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as EventItem[];
    setHistoryByTask((prev) => ({ ...prev, [taskId]: data }));
  }, []);

  const toggleHistory = async (taskId: number) => {
    const next = openHistoryTaskId === taskId ? null : taskId;
    setOpenHistoryTaskId(next);
    if (next !== null && !historyByTask[taskId]) {
      await loadHistory(taskId);
    }
  };

  const startEditingLabel = (column: string) => {
    setEditingColumn(column);
    setEditingLabelValue(columnLabels[column] || STATUS_LABELS[column] || column);
  };

  const saveColumnLabel = (column: string) => {
    const next = editingLabelValue.trim() || STATUS_LABELS[column] || column;
    setColumnLabels((prev) => ({ ...prev, [column]: next }));
    setEditingColumn(null);
  };

  const toggleColumnCollapsed = (column: string) => {
    setCollapsedColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const startWipEdit = (column: string) => {
    setEditingWipColumn(column);
    const current = wipLimits[column];
    setEditingWipValue(current && current > 0 ? String(current) : '');
  };

  const saveWipLimit = (column: string) => {
    const parsed = Number(editingWipValue);
    setWipLimits((prev) => ({ ...prev, [column]: Number.isFinite(parsed) && parsed > 0 ? parsed : null }));
    setEditingWipColumn(null);
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

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <input className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm" placeholder="Search title/description" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} />
          <select className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm" value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}>
            <option value="All">All priorities</option>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
          <select className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm" value={filters.goal} onChange={(e) => setFilters((prev) => ({ ...prev, goal: e.target.value }))}>
            {FILTER_GOALS.map((goal) => <option key={goal} value={goal}>{goal === 'All' ? 'All goals' : goal}</option>)}
          </select>
          <select className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm" value={filters.agent} onChange={(e) => setFilters((prev) => ({ ...prev, agent: e.target.value }))}>
            {agentOptions.map((agent) => <option key={agent} value={agent}>{agent === 'All' ? 'All agents' : agent}</option>)}
          </select>
          <input className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm" placeholder="Filter by tag" value={filters.tags} onChange={(e) => setFilters((prev) => ({ ...prev, tags: e.target.value }))} />
          <Button variant="outline" onClick={() => setFilters(emptyFilters)}>Clear filters</Button>
        </div>
        {hasActiveFilters && hiddenCount > 0 && <Badge variant="outline" className="mt-2">({hiddenCount} tasks hidden)</Badge>}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {grouped.map(({ col, items }) => {
            const isCollapsed = Boolean(collapsedColumns[col]);
            const limit = wipLimits[col];
            const isOverWip = typeof limit === 'number' && limit > 0 && items.length > limit;
            const titleColor = isOverWip ? 'text-amber-300' : 'text-gray-400';

            return (
              <div key={col} className="w-80 flex-shrink-0">
                <div className={`mb-2 rounded-md border px-2 py-1 ${isOverWip ? 'border-amber-600 bg-amber-950/30' : 'border-transparent bg-transparent'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${titleColor}`}>
                      <button type="button" onClick={() => toggleColumnCollapsed(col)} className="rounded p-0.5 hover:bg-gray-800" aria-label={isCollapsed ? 'Expand column' : 'Collapse column'}>
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      {editingColumn === col ? (
                        <input
                          autoFocus
                          value={editingLabelValue}
                          onChange={(e) => setEditingLabelValue(e.target.value)}
                          onBlur={() => saveColumnLabel(col)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveColumnLabel(col);
                            if (e.key === 'Escape') setEditingColumn(null);
                          }}
                          className="w-32 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs normal-case text-white"
                        />
                      ) : (
                        <span className="normal-case">{columnLabels[col] || STATUS_LABELS[col]}</span>
                      )}
                      <Badge variant="outline" className="text-[10px]">({items.length})</Badge>
                      {typeof limit === 'number' && limit > 0 && <Badge variant="outline" className="text-[10px]">WIP {limit}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => startEditingLabel(col)} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Edit column label">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => startWipEdit(col)} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Set WIP limit">
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {editingWipColumn === col && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        placeholder="No limit"
                        value={editingWipValue}
                        onChange={(e) => setEditingWipValue(e.target.value)}
                        onBlur={() => saveWipLimit(col)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveWipLimit(col);
                          if (e.key === 'Escape') setEditingWipColumn(null);
                        }}
                        className="w-24 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white"
                      />
                      <span className="text-[11px] text-gray-400">Set empty/0 to clear</span>
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  <Droppable droppableId={col}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-40 rounded-lg p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-gray-800' : 'bg-gray-900'}`}>
                        {items.map((task, i) => (
                          <Draggable key={task.id} draggableId={String(task.id)} index={i}>
                            {(p, s) => (
                              <div ref={p.innerRef} {...p.draggableProps} className={`rounded border border-gray-700 bg-gray-800 p-3 ${s.isDragging ? 'border-blue-500 shadow-lg' : ''}`}>
                                <div {...p.dragHandleProps} onClick={() => openEdit(task)} className="cursor-pointer">
                                  <p className="text-sm font-medium text-white">{task.title}</p>
                                  {task.description && <p className="mt-1 line-clamp-2 text-xs text-gray-400">{task.description}</p>}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1">
                                  <select value={task.priority} onClick={(e) => e.stopPropagation()} onChange={(e) => onInlinePriorityChange(task, e)} className="rounded border border-gray-600 bg-gray-950 px-2 py-1 text-xs">
                                    {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                                  </select>
                                  <Badge variant="outline" className="text-xs">{task.goal}</Badge>
                                  {task.assignedAgent && <Badge className="text-xs">{task.assignedAgent}</Badge>}
                                  {task.tags && <Badge variant="outline" className="text-xs">{task.tags}</Badge>}
                                </div>
                                <Button variant="outline" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => void toggleHistory(task.id)}>
                                  <Clock3 className="mr-1 h-3.5 w-3.5" />
                                  History
                                </Button>
                                {openHistoryTaskId === task.id && (
                                  <div className="mt-2 rounded border border-gray-700 bg-gray-900 p-2">
                                    <EventTimeline events={historyByTask[task.id] || []} />
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                )}
              </div>
            );
          })}
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
