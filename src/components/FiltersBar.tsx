import { useEffect, useMemo } from 'react';
import { useFilters } from '../context/FiltersContext';
import { Filter } from 'lucide-react';

interface FiltersBarProps {
  carriers: string[];
  statuses: string[];
  onChange?: () => void;
}

export default function FiltersBar({ carriers, statuses, onChange }: FiltersBarProps) {
  const { filters, setFilters } = useFilters();

  const uniqueCarriers = useMemo(() => Array.from(new Set(carriers || [])), [carriers]);
  const uniqueStatuses = useMemo(() => Array.from(new Set(statuses || [])), [statuses]);

  useEffect(() => { onChange && onChange(); }, [filters, onChange]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
      <div className="flex items-center text-gray-500 text-xs uppercase font-semibold gap-2">
        <Filter className="h-4 w-4" /> Filters
      </div>
      <input
        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder="Origin port"
        value={filters.origin || ''}
        onChange={(e) => setFilters({ ...filters, origin: e.target.value || undefined })}
      />
      <input
        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder="Destination port"
        value={filters.destination || ''}
        onChange={(e) => setFilters({ ...filters, destination: e.target.value || undefined })}
      />
      <input
        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder="Container #"
        value={filters.container || ''}
        onChange={(e) => setFilters({ ...filters, container: e.target.value || undefined })}
      />
      <input
        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder="Booking #"
        value={filters.booking || ''}
        onChange={(e) => setFilters({ ...filters, booking: e.target.value || undefined })}
      />
      <select
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
        value={filters.carrier || ''}
        onChange={(e) => setFilters({ ...filters, carrier: e.target.value || undefined })}
      >
        <option value="">All carriers</option>
        {uniqueCarriers.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
        value={filters.status || ''}
        onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
      >
        <option value="">All statuses</option>
        {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
