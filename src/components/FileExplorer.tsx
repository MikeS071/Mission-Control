'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';

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
      <FileText size={12} className="flex-shrink-0 text-blue-400" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function FileExplorer() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [contentError, setContentError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  const open = (filePath: string) => {
    setSelected(filePath);
    setContentError(null);
    fetch(`/api/workspace/file?name=${encodeURIComponent(filePath)}`)
      .then(r => {
        if (!r.ok) {
          return r.json().then(e => { throw new Error(e.error || 'Failed to load file'); });
        }
        return r.text();
      })
      .then(text => {
        setContent(text);
        setContentError(null);
      })
      .catch((err: Error) => {
        setContent('');
        setContentError(err.message ?? 'Could not load file content.');
      });
  };

  const save = async () => {
    if (!selected) return;
    await fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: selected, content }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex gap-4 h-[70vh]">
      {/* Sidebar: file tree */}
      <div className="w-56 flex-shrink-0 bg-gray-900 rounded p-2 overflow-y-auto">
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
              <span className="text-sm text-gray-400 truncate">{selected}</span>
              <Button size="sm" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</Button>
            </div>
            {contentError ? (
              <div className="text-sm text-red-400 mt-4 ml-1">{contentError}</div>
            ) : (
              <div className="flex-1 overflow-auto" data-color-mode="dark">
                <MDEditor value={content} onChange={v => setContent(v || '')} height="100%" />
              </div>
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
