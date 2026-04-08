import { useState, useEffect, useCallback } from 'react';

interface ConfirmButtonProps {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  className?: string;
}

export function ConfirmButton({ onConfirm, label, confirmLabel = 'Confirm?', className = '' }: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timeout = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timeout);
  }, [confirming]);

  const handleClick = useCallback(() => {
    if (confirming) {
      setConfirming(false);
      onConfirm();
    } else {
      setConfirming(true);
    }
  }, [confirming, onConfirm]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`px-3 py-1.5 rounded text-sm transition-colors ${confirming ? 'bg-error text-white' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'} ${className}`}
    >
      {confirming ? confirmLabel : label}
    </button>
  );
}
