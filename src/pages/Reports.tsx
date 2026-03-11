import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { FileText, Download, Filter } from 'lucide-react';

interface ReportRow {
  id: number;
  name: string;
  date: string;
  type: string;
  size: string;
}

export default function Reports() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/reports');
        if (res.ok) {
          setReports(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch reports', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-sans overflow-auto">
      <AppHeader />
      
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Generated Reports</h1>
              <p className="text-gray-500 mt-1">Access and download your scheduled reports.</p>
            </div>
            <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
              <Filter className="h-4 w-4" />
              Filter
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Loading reports…</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wider">Report Name</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wider">Date Generated</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wider">Type</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wider">Size</th>
                    <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <FileText className="h-5 w-5" />
                          </div>
                          <span className="font-medium text-gray-900">{report.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{report.date}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {report.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{report.size}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-indigo-600 hover:text-indigo-800 font-medium text-sm inline-flex items-center gap-1">
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
