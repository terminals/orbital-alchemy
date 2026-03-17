import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onCheckedChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200',
        checked
          ? 'border-[rgba(0,188,212,0.4)] bg-[rgba(0,188,212,0.25)]'
          : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)]',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-full transition-all duration-200',
          checked
            ? 'translate-x-[18px] bg-[rgb(0,188,212)] shadow-[0_0_8px_rgba(0,188,212,0.5)]'
            : 'translate-x-[2px] bg-[rgba(255,255,255,0.4)]'
        )}
      />
    </button>
  );
}
