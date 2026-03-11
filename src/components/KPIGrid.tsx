import { Ship, Anchor, MapPin, Activity, DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface KPIGridProps {
  stats: {
    total: number;
    in_transit: number;
    arrived: number;
    delayed: number;
    exceptions: number;
    total_value?: number;
    performance?: number;
    last_updated: string;
  };
}

export default function KPIGrid({ stats }: KPIGridProps) {
  const kpis = [
    {
      label: 'TOTAL SHIPMENTS',
      value: stats.total,
      icon: Ship,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
    },
    {
      label: 'IN TRANSIT',
      value: stats.in_transit,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      label: 'DELIVERED',
      value: stats.arrived,
      icon: MapPin,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
    },
    {
      label: 'DELAYED / HOLD',
      value: stats.delayed,
      icon: Anchor,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
    },
    {
      label: 'TOTAL VALUE',
      value: stats.total_value ? `$${(stats.total_value / 1_000_000).toFixed(2)}M` : '—',
      icon: DollarSign,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
    {
      label: 'PERFORMANCE',
      value: stats.performance ? `${stats.performance}%` : '—',
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map((kpi, idx) => (
        <div 
          key={idx} 
          className={cn(
            "relative overflow-hidden rounded-xl border p-4 transition-all hover:shadow-md bg-white",
            kpi.border
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 font-mono">
              {kpi.label}
            </span>
            <div className={cn("p-1.5 rounded-md", kpi.bg)}>
              <kpi.icon className={cn("h-4 w-4", kpi.color)} />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 tracking-tight">
            {kpi.value}
          </div>
        </div>
      ))}
    </div>
  );
}
