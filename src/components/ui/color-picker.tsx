import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PROJECT_COLORS } from '../../../shared/project-colors';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="h-5 w-5 rounded-full border border-white/20 shrink-0 transition-shadow hover:shadow-[0_0_8px_currentColor] disabled:opacity-50"
          style={{ backgroundColor: `hsl(${value})` }}
          title="Change color"
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-2">
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onChange(color)}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                color === value
                  ? 'border-white shadow-[0_0_8px_hsl(var(--primary))]'
                  : 'border-transparent hover:border-white/40',
              )}
              style={{ backgroundColor: `hsl(${color})` }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
