'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

export function FileExplorer() {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch('/api/workspace/files').then(r => r.json()).then(setFiles); }, []);

  const open = (f: string) => {
    setSelected(f);
    fetch(`/api/workspace/file?name=${encodeURIComponent(f)}`).then(r => r.text()).then(setContent);
  };

  const save = async () => {
    await fetch('/api/workspace/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: selected, content }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex gap-4 h-[70vh]">
      <div className="w-48 flex-shrink-0 bg-gray-900 rounded p-2 overflow-y-auto">
        {files.map(f => (
          <button key={f} onClick={() => open(f)}
            className={`block w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-800 ${selected === f ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        {selected && <>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">{selected}</span>
            <Button size="sm" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</Button>
          </div>
          <div className="flex-1 overflow-auto" data-color-mode="dark">
            <MDEditor value={content} onChange={v => setContent(v || '')} height="100%" />
          </div>
        </>}
        {!selected && <div className="text-gray-600 text-sm mt-8 ml-4">Select a file to edit</div>}
      </div>
    </div>
  );
}
