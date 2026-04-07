import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { ActivityDataPoint } from '@/types';

interface Props {
  data: ActivityDataPoint[];
  color?: string;
  height?: number;
}

export function ActivitySparkline({ data, color = '210 80% 55%', height = 28 }: Props) {
  if (data.length === 0) return null;

  const hslColor = `hsl(${color})`;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sparkFill-${color.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hslColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={hslColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke={hslColor}
            strokeWidth={1.5}
            fill={`url(#sparkFill-${color.replace(/\s/g, '')})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
