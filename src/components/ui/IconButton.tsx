import type { ReactNode } from 'react';

interface IconButtonProps {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}

export function IconButton({ onClick, title, disabled = false, children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-2 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
