import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-bg-secondary rounded-lg border border-grid-line shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-grid-line">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">{title}</h2>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-lg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">✕</button>
          </div>
        )}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
