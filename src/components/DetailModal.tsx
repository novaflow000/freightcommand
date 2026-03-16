import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import ShipmentDetailCard from './ShipmentDetailCard';

interface DetailModalProps {
  shipment: any;
  onClose: () => void;
  onRefreshSuccess?: () => void;
}

export default function DetailModal({ shipment, onClose, onRefreshSuccess }: DetailModalProps) {
  if (!shipment) return null;
  const [mode, setMode] = useState<'reapply' | 'api' | 'full'>('api');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/v1/refresh-jobs/${jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setJobStatus(data.status);
      setJobError(data.error || null);
      if (data.status === 'success') {
        clearInterval(timer);
        onRefreshSuccess?.();
      } else if (data.status === 'failed') {
        clearInterval(timer);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [jobId, onRefreshSuccess]);

  const triggerRefresh = async () => {
    if (!shipment) return;
    setBusy(true);
    try {
      const id = shipment.bl_number || shipment.shipment?.shipment_id;
      const res = await fetch(`/api/v1/shipments/${id}/refresh`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      setJobId(data.job_id);
      setJobStatus(data.status);
      setJobError(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-end bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border-l border-gray-200 h-full w-full max-w-xl shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 p-6">
        <div className="mb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
              >
                <option value="reapply">Re-apply mappings</option>
                <option value="api">Refresh from provider</option>
                <option value="full">Full re-sync</option>
              </select>
              <button
                onClick={triggerRefresh}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
              </button>
              {jobStatus && <span className="text-[11px] text-gray-500">Job: {jobStatus}</span>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          {jobStatus === 'failed' && jobError && (
            <div className="mt-2 text-xs text-rose-600 p-2 bg-rose-50 rounded border border-rose-200">{jobError}</div>
          )}
        </div>
        <ShipmentDetailCard shipment={shipment} />
      </div>
    </div>
  );
}
