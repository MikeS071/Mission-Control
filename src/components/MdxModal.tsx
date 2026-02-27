'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

type MdxModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  initialContent?: string;
  /** Static content for read-only preview (version history) */
  content?: string;
  readOnly?: boolean;
  onSave?: (content: string) => void | Promise<void>;
  /** URL to GET current version from before saving (stale-edit guard) */
  staleCheckUrl?: string;
  /** The prdVersion when the editor was opened */
  loadedVersion?: number;
};

export function MdxModal({ open, onOpenChange, title, initialContent, content: staticContent, readOnly, onSave, staleCheckUrl, loadedVersion }: MdxModalProps) {
  const [content, setContent] = useState(initialContent ?? staticContent ?? '');
  const [saving, setSaving] = useState(false);
  const [staleWarning, setStaleWarning] = useState<{ currentVersion: number } | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const loadedVersionRef = useRef(loadedVersion);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setContent(initialContent ?? staticContent ?? '');
      setStaleWarning(null);
      setShowOverwriteDialog(false);
      setSaving(false);
      loadedVersionRef.current = loadedVersion;
    }
  }, [open, initialContent, staticContent, loadedVersion]);

  const checkStale = useCallback(async (): Promise<boolean> => {
    if (!staleCheckUrl || loadedVersionRef.current == null) return false;
    try {
      const res = await fetch(staleCheckUrl, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = (await res.json()) as { prdVersion?: number };
      if (typeof data.prdVersion === 'number' && data.prdVersion !== loadedVersionRef.current) {
        setStaleWarning({ currentVersion: data.prdVersion });
        return true;
      }
    } catch {
      // Network error — allow save
    }
    return false;
  }, [staleCheckUrl]);

  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave?.(content);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }, [content, onSave, onOpenChange]);

  const handleSave = useCallback(async () => {
    const isStale = await checkStale();
    if (isStale) {
      setShowOverwriteDialog(true);
      return;
    }
    await doSave();
  }, [checkStale, doSave]);

  const handleOverwrite = useCallback(async () => {
    setShowOverwriteDialog(false);
    await doSave();
  }, [doSave]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title ?? (readOnly ? 'PRD Preview' : 'Edit PRD')}</DialogTitle>
            {!readOnly && <DialogDescription>Edit the markdown content below.</DialogDescription>}
          </DialogHeader>

          {staleWarning && !readOnly && (
            <div className="rounded border border-yellow-700 bg-yellow-950/40 px-3 py-1.5 text-xs text-yellow-200 flex items-center gap-1.5">
              ⚠️ Newer version available (v{loadedVersionRef.current} → v{staleWarning.currentVersion})
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto" data-color-mode="dark">
            {readOnly ? (
              <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono leading-relaxed p-3 rounded bg-gray-900 border border-gray-800">{content || '(empty)'}</pre>
            ) : (
              <MDEditor
                value={content}
                onChange={(val) => setContent(val ?? '')}
                height="100%"
                style={{ minHeight: 400 }}
                preview="edit"
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{readOnly ? 'Close' : 'Cancel'}</Button>
            {!readOnly && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stale overwrite confirmation dialog */}
      {!readOnly && (
        <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
          <DialogContent className="bg-gray-950 border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Stale version detected</DialogTitle>
              <DialogDescription>
                This PRD has been updated since you opened it (version {loadedVersionRef.current} → {staleWarning?.currentVersion}). Save anyway and overwrite, or cancel?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOverwriteDialog(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleOverwrite}>Overwrite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
