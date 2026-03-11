import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';

interface EditShipmentModalProps {
  shipment: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditShipmentModal({ shipment, onClose, onSuccess }: EditShipmentModalProps) {
  const [formData, setFormData] = useState({
    bl_number: '',
    client: '',
    container_number: '',
    carrier: '',
    origin: '',
    destination: '',
    cargo_type: '',
    cargo_weight: '',
    cargo_value: '',
    incoterm: '',
    customer_ref: '',
    status: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (shipment) {
      setFormData({
        bl_number: shipment.bl_number || '',
        client: shipment.client || '',
        container_number: shipment.container_number || '',
        carrier: shipment.carrier || '',
        origin: shipment.origin || '',
        destination: shipment.destination || '',
        cargo_type: shipment.cargo_type || '',
        cargo_weight: shipment.cargo_weight || '',
        cargo_value: shipment.cargo_value || '',
        incoterm: shipment.incoterm || '',
        customer_ref: shipment.customer_ref || '',
        status: shipment.status || ''
      });
    }
  }, [shipment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/shipments/injected/${shipment.bl_number}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update shipment');
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800">
          <h2 className="text-lg font-bold text-slate-100 font-mono tracking-wider uppercase">Edit Shipment {shipment.bl_number}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded text-sm border bg-rose-500/10 border-rose-500/20 text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 uppercase mb-1">Client</label>
              <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:border-cyan-500 outline-none" 
                value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 uppercase mb-1">Container Number</label>
              <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:border-cyan-500 outline-none" 
                value={formData.container_number} onChange={e => setFormData({...formData, container_number: e.target.value})} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 uppercase mb-1">Carrier</label>
              <select className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:border-cyan-500 outline-none"
                value={formData.carrier} onChange={e => setFormData({...formData, carrier: e.target.value})}>
                <option value="Hapag-Lloyd">Hapag-Lloyd</option>
                <option value="Maersk">Maersk</option>
                <option value="CMA CGM">CMA CGM</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 uppercase mb-1">Status</label>
              <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:border-cyan-500 outline-none" 
                value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} />
            </div>
            
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 uppercase mb-1">Origin</label>
              <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:border-cyan-500 outline-none" 
                value={formData.origin} onChange={e => setFormData({...formData, origin: e.target.value})} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-400 uppercase mb-1">Destination</label>
              <input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:border-cyan-500 outline-none" 
                value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} />
            </div>

            <div className="col-span-2 flex justify-end mt-4 pt-4 border-t border-slate-800">
              <button type="button" onClick={onClose} className="mr-3 text-slate-400 hover:text-white text-sm uppercase tracking-wider">Cancel</button>
              <button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded font-medium uppercase tracking-wider text-sm transition-colors disabled:opacity-50 flex items-center">
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
