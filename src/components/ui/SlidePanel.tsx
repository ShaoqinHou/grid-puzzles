import { useEffect, type ReactNode } from 'react';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SlidePanel({ open, onClose, title, children }: SlidePanelProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 top-[49px] bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-80 bg-bg-secondary border-l border-grid-line z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-grid-line shrink-0">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">{title}</h2>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-lg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">✕</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </>
  );
}
