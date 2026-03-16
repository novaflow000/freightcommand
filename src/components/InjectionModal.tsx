import { X, Upload, FileText, Check } from 'lucide-react';
import { useState } from 'react';

interface InjectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InjectionModal({ isOpen, onClose, onSuccess }: InjectionModalProps) {
  const carrierOptions = [
    'MSC',
    'Maersk',
    'CMA CGM',
    'Hapag-Lloyd',
    'COSCO',
    'Evergreen',
    'ONE',
    'Yang Ming',
    'ZIM',
    'HMM',
    'PIL',
    'Wan Hai',
    'OOCL',
    'Matson',
    'Seaboard Marine',
    'Hamburg Süd',
    'Sinokor',
    'TS Lines',
    'KMTC',
    'SITC',
    'Gold Star Line',
    'Ark Shipping',
    'Unifeeder',
  ];
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  const [formData, setFormData] = useState({
    bl_number: '',
    booking_number: '',
    client: '',
    container_number: '',
    carrier: '',
    origin: '',
    destination: '',
    origin_port: '',
    destination_port: '',
    cargo_type: '',
    cargo_weight: '',
    cargo_value: '',
    incoterm: '',
    customer_ref: '',
    tracking_provider: 'ShipsGo'
  });
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<Array<{bl_number: string; booking_number: string; container_number: string; carrier: string; client: string}>>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  if (!isOpen) return null;

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!formData.container_number && !formData.bl_number && !formData.booking_number) {
        throw new Error('Provide at least one of BL, Booking, or Container number');
      }
      const res = await fetch('/api/v1/shipments/injected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error('Failed to add shipment');
      
      setMessage({ type: 'success', text: 'Shipment injected successfully' });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setMessage(null);

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const rows = await parseExcel(file);
        await submitJsonRows(rows);
      } else {
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        const res = await fetch('/api/v1/shipments/injected/upload', { method: 'POST', body: formDataUpload });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        setMessage({ type: 'success', text: `Processed: ${data.stats.success} success, ${data.stats.failed} failed` });
      }
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitJsonRows = async (rows: any[]) => {
    const res = await fetch('/api/v1/shipments/injected/bulk-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'Bulk import failed');
    }
    const data = await res.json();
    setMessage({ type: 'success', text: `Processed: ${data.stats.success} success, ${data.stats.failed} failed` });
  };

  const parseExcel = async (f: File) => {
    // lazy-load SheetJS from CDN
    if (!(window as any).XLSX) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load XLSX parser'));
        document.body.appendChild(script);
      });
    }
    const XLSX = (window as any).XLSX;
    const buffer = await f.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return rows;
  };

  const handleFileSelect = (selected: File | null) => {
    setFile(selected);
    setPreviewRows([]);
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      const lines = text.split(/\\r?\\n/).filter(Boolean);
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const get = (row: string, key: string) => {
        const cols = row.split(',');
        const idx = headers.indexOf(key);
        return idx >= 0 ? (cols[idx] || '').trim() : '';
      };
      const rows = lines.slice(1, 6).map(line => ({
        bl_number: get(line, 'bl_number') || get(line, 'bl number'),
        booking_number: get(line, 'booking_number') || get(line, 'booking'),
        container_number: get(line, 'container_number') || get(line, 'container'),
        carrier: get(line, 'carrier'),
        client: get(line, 'client'),
      })).filter(r => r.bl_number || r.booking_number || r.container_number);
      setPreviewRows(rows);
    };
    reader.readAsText(selected);
  };

  const downloadTemplate = () => {
    window.location.href = '/api/v1/shipments/injected/template';
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Inject Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button 
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'manual' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
            onClick={() => setActiveTab('manual')}
          >
            Manual Entry
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
            onClick={() => setActiveTab('upload')}
          >
            CSV / Excel Upload
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          {activeTab === 'manual' ? (
            <form onSubmit={handleManualSubmit} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">BL Number</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" 
                  placeholder="e.g. 265507346 (Maersk)"
                  value={formData.bl_number} onChange={e => setFormData({...formData, bl_number: e.target.value})} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Booking Number</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" 
                  placeholder="e.g. CSA0418719 (CMA CGM)"
                  value={formData.booking_number} onChange={e => setFormData({...formData, booking_number: e.target.value})} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Container Number</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" 
                  placeholder="e.g. CMAU1234567 (4 letters + 7 digits)"
                  value={formData.container_number} onChange={e => setFormData({...formData, container_number: e.target.value})} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Carrier *</label>
                <select required className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  value={formData.carrier} onChange={e => setFormData({...formData, carrier: e.target.value})}
                  title="Required for BL-only tracking. Pick the actual shipping line (e.g. Maersk for BL 265507346).">
                  <option value="">Select Carrier</option>
                  {carrierOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Client</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" 
                  value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Origin Port</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  value={formData.origin_port} onChange={e => setFormData({...formData, origin_port: e.target.value})} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Destination Port</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  value={formData.destination_port} onChange={e => setFormData({...formData, destination_port: e.target.value})} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tracking Provider</label>
                <select className="w-full bg-white border border-gray-200 rounded-lg p-2 text-gray-900 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  value={formData.tracking_provider} onChange={e => setFormData({...formData, tracking_provider: e.target.value})}>
                  <option value="ShipsGo">ShipsGo</option>
                  <option value="Vizion">Vizion</option>
                  <option value="SeaRates">SeaRates</option>
                  <option value="Terminal49">Terminal49</option>
                </select>
              </div>
              {/* Additional fields simplified for brevity */}
              <div className="col-span-2 flex justify-end mt-4">
                <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 shadow-sm">
                  {loading ? 'Injecting...' : 'Inject Shipment'}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 mb-6 hover:border-indigo-300 hover:bg-gray-50 transition-all">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium mb-2">Drag and drop CSV file here</p>
                <p className="text-gray-500 text-sm mb-4">or click to browse</p>
                <input type="file" accept=".csv" onChange={e => handleFileSelect(e.target.files?.[0] || null)} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="bg-white hover:bg-gray-50 text-indigo-600 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium border border-gray-200 shadow-sm">
                  Select File
                </label>
                {file && <p className="mt-4 text-emerald-600 text-sm flex items-center justify-center font-medium"><Check className="h-4 w-4 mr-1"/> {file.name}</p>}
              </div>
              
              {previewRows.length > 0 && (
                <div className="mt-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Preview</div>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">BL</th>
                          <th className="px-3 py-2 text-left">Booking</th>
                          <th className="px-3 py-2 text-left">Container</th>
                          <th className="px-3 py-2 text-left">Carrier</th>
                          <th className="px-3 py-2 text-left">Client</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-semibold text-gray-900">{row.bl_number || '—'}</td>
                            <td className="px-3 py-2 text-gray-700">{row.booking_number || '—'}</td>
                            <td className="px-3 py-2 text-gray-700">{row.container_number || '—'}</td>
                            <td className="px-3 py-2 text-gray-700">{row.carrier || '—'}</td>
                            <td className="px-3 py-2 text-gray-700">{row.client || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center mt-4">
                <button onClick={downloadTemplate} className="text-gray-500 hover:text-indigo-600 text-sm flex items-center transition-colors font-medium">
                  <FileText className="h-4 w-4 mr-2" /> Download Template
                </button>
                <button onClick={handleUpload} disabled={!file || loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 shadow-sm">
                  {loading ? 'Uploading...' : 'Upload & Process'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
