'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, History, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MdxModal } from '@/components/MdxModal';

interface PrdVersion {
  id: number;
  versionNumber: number;
  path: string;
  source: string;
  isCurrent: boolean;
  createdAt: string;
  createdBy: string | null;
  changeNote: string | null;
}

interface VersionHistoryPanelProps {
  taskId: number;
  onRestored?: () => void;
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'generated': return 'Generated';
    case 'manual': return 'Manual';
    case 'restored': return 'Restored';
    case 'new_version': return 'Updated';
    default: return source;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function VersionHistoryPanel({ taskId, onRestored }: VersionHistoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<PrdVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<PrdVersion | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/prd/versions`);
      if (res.ok) {
        const data = (await res.json()) as { versions: PrdVersion[] };
        // newest first
        setVersions([...(data.versions ?? [])].reverse());
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (expanded) void fetchVersions();
  }, [expanded, fetchVersions]);

  const fetchVersionContent = async (version: PrdVersion): Promise<string> => {
    // Try reading the version file via workspace file API
    const res = await fetch(`/api/workspace/file?name=${encodeURIComponent(version.path)}`);
    if (res.ok) {
      const data = (await res.json()) as { content: string };
      return data.content ?? '';
    }
    // Fallback for current version: use PRD endpoint
    if (version.isCurrent) {
      const res2 = await fetch(`/api/tasks/${taskId}/prd`);
      if (res2.ok) {
        const data = (await res2.json()) as { content: string };
        return data.content ?? '';
      }
    }
    return '(Content unavailable)';
  };

  const openPreview = async (version: PrdVersion) => {
    setPreviewVersion(version);
    setPreviewContent('');
    setPreviewOpen(true);
    try {
      setPreviewContent(await fetchVersionContent(version));
    } catch {
      setPreviewContent('(Failed to load content)');
    }
  };

  const restoreVersion = async (version: PrdVersion) => {
    setRestoring(version.versionNumber);
    try {
      const content = await fetchVersionContent(version);
      if (!content || content === '(Content unavailable)') {
        setRestoring(null);
        return;
      }

      // Restore by writing as current PRD; backend creates a new version row.
      await fetch(`/api/tasks/${taskId}/prd`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          source: 'restored',
          changeNote: `Restored from v${version.versionNumber}`,
        }),
      });

      await fetchVersions();
      onRestored?.();
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 rounded border border-gray-700/60 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
      >
        <History className="h-3 w-3" />
        {expanded ? 'Hide Versions' : 'Version History'}
      </button>

      {expanded && (
        <div className="mt-2 rounded border border-gray-800 bg-gray-900/60 p-2 space-y-1.5 max-h-64 overflow-y-auto">
          {loading && <div className="text-[10px] text-gray-500 py-2 text-center">Loading…</div>}
          {!loading && versions.length === 0 && (
            <div className="text-[10px] text-gray-500 py-2 text-center">No versions yet</div>
          )}
          {!loading && versions.map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[10px] ${v.isCurrent ? 'bg-indigo-950/30 border border-indigo-700/40' : 'bg-gray-800/50 border border-gray-800'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-200">v{v.versionNumber}</span>
                  <span className="text-gray-500">{sourceLabel(v.source)}</span>
                  {v.isCurrent && <Badge className="bg-indigo-600/80 text-white text-[8px] px-1 py-0">Current</Badge>}
                </div>
                <div className="text-gray-600 truncate">
                  {formatDate(v.createdAt)}
                  {v.changeNote && <span className="ml-1.5 text-gray-500">— {v.changeNote}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-500 hover:text-gray-200"
                  onClick={() => void openPreview(v)}
                  title="Preview"
                >
                  <Eye className="h-3 w-3" />
                </Button>
                {!v.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-gray-500 hover:text-amber-300"
                    onClick={() => void restoreVersion(v)}
                    disabled={restoring !== null}
                    title="Restore this version"
                  >
                    <RotateCcw className={`h-3 w-3 ${restoring === v.versionNumber ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewOpen && previewVersion && (
        <MdxModal
          open={previewOpen}
          onOpenChange={(v) => { if (!v) { setPreviewOpen(false); setPreviewVersion(null); } }}
          content={previewContent}
          title={`Preview — Version ${previewVersion.versionNumber}`}
          readOnly
        />
      )}
    </div>
  );
}
