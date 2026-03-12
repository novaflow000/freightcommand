import { useMemo, useState } from 'react';
import { Search, Plus, Upload, Download, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface OperationsPanelProps {
  shipments: any[];
  onSelectShipment: (shipment: any) => void;
  onAddShipment: () => void;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  onRefresh: (ids: string[], mode: 'reapply' | 'api' | 'full') => void;
}

export default function OperationsPanel({ 
  shipments, 
  onSelectShipment, 
  onAddShipment, 
  onUpload,
  onDownloadTemplate,
  onRefresh,
}: OperationsPanelProps) {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [refreshMode, setRefreshMode] = useState<'reapply' | 'api' | 'full'>('api');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const normalizeStatus = (status: string) =>
    (status || '').toUpperCase().replace(/[\s-]+/g, '_');
  const humanStatus = (status: string) => {
    const s = normalizeStatus(status);
    if (s === 'IN_TRANSIT') return 'In Transit';
    if (s === 'DELIVERED' || s === 'ARRIVED') return 'Delivered';
    if (s === 'DELAYED' || s === 'EXCEPTION' || s === 'HOLD') return 'Delayed';
    return 'Unknown';
  };

  const filteredShipments = useMemo(() => shipments.filter(s => {
    const matchesSearch = 
      s.bl_number.toLowerCase().includes(filter.toLowerCase()) ||
      s.client.toLowerCase().includes(filter.toLowerCase()) ||
      s.container_number.toLowerCase().includes(filter.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || humanStatus(s.current_status) === statusFilter;
    
    return matchesSearch && matchesStatus;
  }), [shipments, filter, statusFilter]);

  const getStatusColor = (status: string) => {
    const s = normalizeStatus(status);
    if (s === 'DELIVERED' || s === 'ARRIVED') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (s === 'IN_TRANSIT') return 'text-blue-700 bg-blue-50 border-blue-200';
    if (s === 'DELAYED' || s === 'EXCEPTION' || s === 'HOLD') return 'text-rose-700 bg-rose-50 border-rose-200';
    return 'text-gray-600 bg-gray-100 border-gray-200';
  };

  return (
    <div className="h-full flex flex-col w-full">
      {/* Header & Actions */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">Operations</h2>
          <div className="flex space-x-2">
            <button 
              onClick={onAddShipment}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors shadow-sm"
              title="Add Shipment"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button 
              onClick={onUpload}
              className="p-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-md transition-colors shadow-sm"
              title="Upload CSV"
            >
              <Upload className="h-4 w-4" />
            </button>
            <button 
              onClick={onDownloadTemplate}
              className="p-1.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-md transition-colors shadow-sm"
              title="Download Template"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              value={refreshMode}
              onChange={(e) => setRefreshMode(e.target.value as any)}
            >
              <option value="reapply">Re-apply mappings</option>
              <option value="api">Refresh from provider</option>
              <option value="full">Full re-sync</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRefresh(Array.from(selected), refreshMode)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-gray-200 rounded-md hover:bg-gray-50"
              disabled={selected.size === 0}
            >
              <RefreshCw className="h-4 w-4" /> Refresh selected ({selected.size})
            </button>
            <button
              onClick={() => onRefresh(filteredShipments.map((s) => s.bl_number), refreshMode)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-indigo-50 border border-indigo-200 rounded-md text-indigo-700 hover:bg-indigo-100"
              disabled={filteredShipments.length === 0}
            >
              <RefreshCw className="h-4 w-4" /> Refresh all filtered
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search BL, Container, Client..." 
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-400 transition-all"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 overflow-x-auto pb-1 scrollbar-hide">
          {['All', 'In Transit', 'Delivered', 'Delayed', 'Unknown'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-3 py-1 text-[10px] uppercase tracking-wider rounded-full border transition-all whitespace-nowrap font-medium",
                statusFilter === status 
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredShipments.map((shipment) => {
          const checked = selected.has(shipment.bl_number);
          return (
          <div 
            key={shipment.bl_number}
            onClick={() => onSelectShipment(shipment)}
            className="group bg-white hover:bg-gray-50 border border-gray-200 hover:border-indigo-200 p-3 rounded-lg cursor-pointer transition-all shadow-sm hover:shadow-md"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    e.stopPropagation();
                    const next = new Set(selected);
                    if (e.target.checked) next.add(shipment.bl_number);
                    else next.delete(shipment.bl_number);
                    setSelected(next);
                  }}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {shipment.bl_number}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                    {shipment.carrier}
                  </div>
                </div>
              </div>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wider font-medium", getStatusColor(shipment.current_status))}>
                {humanStatus(shipment.current_status)}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 mb-2">
              <div>
                <span className="text-gray-400 block text-[9px] uppercase font-semibold">Origin</span>
                {shipment.origin}
              </div>
              <div className="text-right">
                <span className="text-gray-400 block text-[9px] uppercase font-semibold">Destination</span>
                {shipment.destination}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-[10px] text-gray-400 font-medium">
                ETA: {shipment.eta || 'TBD'}
              </span>
              <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                {shipment.cargo_type}
              </span>
            </div>
          </div>
        );
        })}
        
        {filteredShipments.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-xs">
            No shipments found matching criteria.
          </div>
        )}
      </div>
    </div>
  );
}
