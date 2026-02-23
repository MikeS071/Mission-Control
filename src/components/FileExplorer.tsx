'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, FileText, FileCode2, Folder, FolderOpen } from 'lucide-react';

const POLL_INTERVAL_MS = 3_000;

function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf('.'));
  if (['.json', '.yaml', '.yml'].includes(ext)) return <FileCode2 size={12} className="flex-shrink-0 text-yellow-500" />;
  return <FileText size={12} className="flex-shrink-0 text-blue-400" />;
}

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileEntry[];
};

interface TreeNodeProps {
  entry: FileEntry;
  selected: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}

function TreeNode({ entry, selected, onSelect, depth = 0 }: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0);

  if (entry.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-800 text-gray-400"
          style={{ paddingLeft: `${(depth + 1) * 8}px` }}
        >
          {open
            ? <ChevronDown size={12} className="flex-shrink-0 text-gray-500" />
            : <ChevronRight size={12} className="flex-shrink-0 text-gray-500" />}
          {open
            ? <FolderOpen size={12} className="flex-shrink-0 text-yellow-500" />
            : <Folder size={12} className="flex-shrink-0 text-yellow-500" />}
          <span className="truncate">{entry.name}</span>
        </button>
        {open && entry.children && entry.children.map(child => (
          <TreeNode
            key={child.path}
            entry={child}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={`flex items-center gap-1 w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-800 ${
        selected === entry.path ? 'bg-gray-700 text-white' : 'text-gray-400'
      }`}
      style={{ paddingLeft: `${(depth + 1) * 8}px` }}
    >
      {fileIcon(entry.name)}
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function FileExplorer() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [serverContent, setServerContent] = useState(''); // last fetched value — used to detect local edits
  const [contentError, setContentError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [liveSync, setLiveSync] = useState(false); // true when last poll matched
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/workspace/files')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setFiles(data);
          setFetchError(null);
        } else {
          setFiles([]);
          setFetchError('Memory files unavailable — workspace not mounted.');
        }
      })
      .catch(() => {
        setFiles([]);
        setFetchError('Memory files unavailable — workspace not mounted.');
      });
  }, []);

  const fetchContent = async (filePath: string, isInitial = false) => {
    try {
      const r = await fetch(`/api/workspace/file?name=${encodeURIComponent(filePath)}`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error ?? 'Failed to load file');
      }
      const text = await r.text();
      setServerContent(text);
      setContent(prev => {
        // On initial load always set; on poll only update if user has no unsaved edits
        if (isInitial || prev === text) {
          setLiveSync(true);
          return text;
        }
        setLiveSync(false); // user has local edits — skip overwrite
        return prev;
      });
      setContentError(null);
    } catch (err) {
      if (isInitial) {
        setContent('');
        setContentError((err as Error).message ?? 'Could not load file content.');
      }
    }
  };

  const open = (filePath: string) => {
    // Clear existing poll
    if (pollRef.current) clearInterval(pollRef.current);
    setSelected(filePath);
    setContentError(null);
    setLiveSync(false);
    void fetchContent(filePath, true);
    // Start polling
    pollRef.current = setInterval(() => void fetchContent(filePath, false), POLL_INTERVAL_MS);
  };

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Focus input when the create form appears
  useEffect(() => { if (creating) newFileInputRef.current?.focus(); }, [creating]);

  const refreshFiles = () => {
    fetch('/api/workspace/files')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setFiles(data); })
      .catch(() => {});
  };

  const confirmCreate = async () => {
    let name = newFileName.trim();
    if (!name) return;
    if (!name.endsWith('.md')) name = `${name}.md`;
    setCreateError(null);
    const res = await fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, content: '' }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({})) as { error?: string };
      setCreateError(e.error ?? 'Create failed');
      return;
    }
    setCreating(false);
    setNewFileName('');
    refreshFiles();
    open(name);
  };

  const isMd = (p: string) => p.endsWith('.md');

  const save = async () => {
    if (!selected || !isMd(selected)) return;
    await fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: selected, content }),
    });
    setServerContent(content); // mark local edits as saved
    setLiveSync(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex gap-4 h-[70vh]">
      {/* Sidebar: file tree */}
      <div className="w-56 flex-shrink-0 bg-gray-900 rounded p-2 overflow-y-auto flex flex-col gap-1">
        {/* New file button */}
        <button
          onClick={() => { setCreating(true); setCreateError(null); setNewFileName(''); }}
          className="flex items-center gap-1 w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300"
        >
          <span className="text-base leading-none">+</span> New file
        </button>

        {/* Inline create form */}
        {creating && (
          <div className="px-2 flex flex-col gap-1">
            <input
              ref={newFileInputRef}
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void confirmCreate();
                if (e.key === 'Escape') { setCreating(false); setNewFileName(''); setCreateError(null); }
              }}
              placeholder="filename.md"
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-gray-500"
            />
            {createError && <span className="text-[10px] text-red-400">{createError}</span>}
            <div className="flex gap-1">
              <button onClick={() => void confirmCreate()} className="text-[10px] text-emerald-400 hover:text-emerald-300">Create</button>
              <button onClick={() => { setCreating(false); setNewFileName(''); setCreateError(null); }} className="text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 my-1" />

        {fetchError ? (
          <div className="text-xs text-amber-400 px-2 py-3 leading-relaxed">{fetchError}</div>
        ) : files.length === 0 ? (
          <div className="text-xs text-gray-600 px-2 py-3">No memory files found.</div>
        ) : (
          files.map(entry => (
            <TreeNode
              key={entry.path}
              entry={entry}
              selected={selected}
              onSelect={open}
              depth={0}
            />
          ))
        )}
      </div>

      {/* Editor panel */}
      <div className="flex-1 flex flex-col gap-2">
        {selected && (
          <>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-sm text-gray-400 truncate">
                {selected}
                {liveSync
                  ? <span className="text-[10px] text-emerald-500 flex-shrink-0">● live</span>
                  : <span className="text-[10px] text-amber-500 flex-shrink-0">● unsaved</span>}
              </span>
              {isMd(selected) && (
                <Button size="sm" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</Button>
              )}
            </div>
            {contentError ? (
              <div className="text-sm text-red-400 mt-4 ml-1">{contentError}</div>
            ) : isMd(selected) ? (
              <div className="flex-1 overflow-auto" data-color-mode="dark">
                <MDEditor value={content} onChange={v => setContent(v || '')} height="100%" />
              </div>
            ) : (
              <pre className="flex-1 overflow-auto bg-gray-900 text-gray-300 text-xs rounded p-3 leading-relaxed whitespace-pre-wrap break-words">
                {content}
              </pre>
            )}
          </>
        )}
        {!selected && (
          <div className="text-gray-600 text-sm mt-8 ml-4">
            {fetchError ? fetchError : 'Select a file to edit'}
          </div>
        )}
      </div>
    </div>
  );
}
