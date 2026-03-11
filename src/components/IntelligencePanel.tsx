import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { AlertTriangle, TrendingDown } from 'lucide-react';

interface IntelligencePanelProps {
  shipments: any[];
}

export default function IntelligencePanel({ shipments }: IntelligencePanelProps) {
  // Calculate carrier distribution
  const carrierCounts = shipments.reduce((acc: any, curr: any) => {
    const carrier = curr.carrier || 'Unknown';
    acc[carrier] = (acc[carrier] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(carrierCounts).map(key => ({
    name: key,
    value: carrierCounts[key]
  }));

  const COLORS = ['#4f46e5', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Mock performance data
  const performanceData = [
    { name: 'Hapag', onTime: 85, delayed: 15 },
    { name: 'Maersk', onTime: 92, delayed: 8 },
    { name: 'CMA CGM', onTime: 78, delayed: 22 },
  ];

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-sm font-bold text-gray-900 tracking-tight flex items-center">
          <TrendingDown className="h-4 w-4 mr-2 text-indigo-600" />
          Intelligence
        </h2>
      </div>

      {/* Fleet Distribution */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">Fleet Distribution</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="#ffffff" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                itemStyle={{ color: '#1e293b' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {pieData.map((entry, index) => (
            <div key={index} className="flex items-center text-xs text-gray-600">
              <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="truncate">{entry.name}</span>
              <span className="ml-auto font-medium text-gray-900">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Critical Alerts */}
      <div className="p-4 border-b border-gray-100 flex-1">
        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider flex items-center">
          <AlertTriangle className="h-3 w-3 mr-1 text-rose-500" />
          Critical Alerts
        </h3>
        <div className="space-y-3">
          {shipments.filter(s => s.current_status === 'Delayed' || s.current_status === 'Exception').map((s, idx) => (
            <div key={idx} className="bg-rose-50 border border-rose-100 p-3 rounded-lg text-xs">
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-rose-700">{s.bl_number}</span>
                <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-medium">{s.current_status}</span>
              </div>
              <p className="text-gray-500 truncate">{s.origin} → {s.destination}</p>
            </div>
          ))}
          {shipments.filter(s => s.current_status === 'Delayed' || s.current_status === 'Exception').length === 0 && (
            <div className="text-center py-8 text-gray-400 text-xs italic">
              No critical alerts detected.
            </div>
          )}
        </div>
      </div>

      {/* Carrier Performance */}
      <div className="p-4 h-64">
        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">Carrier Performance</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={performanceData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={60} tick={{fill: '#64748b', fontSize: 10}} />
            <Tooltip 
              cursor={{fill: 'rgba(0,0,0,0.05)'}}
              contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
            />
            <Bar dataKey="onTime" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
            <Bar dataKey="delayed" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
