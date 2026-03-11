import { Bell, Search, Ship, HelpCircle, Settings, FileCode } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useEffect, useRef, useState } from 'react';

export default function AppHeader() {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    const run = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      const res = await fetch(`/api/v1/canonical/search?q=${encodeURIComponent(query)}`);
      if (res.ok) setResults(await res.json());
      setOpen(true);
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [query]);

  const isActive = (path: string) => {
    return location.pathname === path ? "text-indigo-600 bg-indigo-50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50";
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="bg-indigo-600 p-1.5 rounded-lg group-hover:bg-indigo-700 transition-colors">
            <Ship className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">Freight Command</span>
        </Link>
        
        <div className="h-6 w-px bg-gray-200"></div>
        
        <nav className="flex items-center gap-1">
          <Link 
            to="/" 
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all", isActive('/'))}
          >
            Dashboard
          </Link>
          <Link 
            to="/analytics" 
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all", isActive('/analytics'))}
          >
            Analytics
          </Link>
          <Link 
            to="/reports" 
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-all", isActive('/reports'))}
          >
            Reports
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block" ref={wrapperRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search shipments..." 
            className="bg-gray-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-lg pl-9 pr-4 py-1.5 text-sm w-64 transition-all outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setOpen(true)}
          />
          {open && results.length > 0 && (
            <div className="absolute left-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
              <ul className="max-h-72 overflow-auto divide-y divide-gray-100">
                {results.map((r, idx) => (
                  <li key={idx} className="px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                    <div className="text-xs uppercase text-gray-400">{r.type}</div>
                    <div className="font-medium text-gray-900">{r.label}</div>
                    {r.bl_number && <div className="text-xs text-gray-500">BL: {r.bl_number}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>

        <Link to="/api-docs" title="API Documentation" className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          <FileCode className="h-5 w-5" />
        </Link>

        <Link to="/admin" title="Admin Settings" className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          <Settings className="h-5 w-5" />
        </Link>
        
        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        
        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          <HelpCircle className="h-5 w-5" />
        </button>

        <div className="h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center border border-indigo-200 text-indigo-700 font-medium text-sm cursor-pointer hover:bg-indigo-200 transition-colors">
          OP
        </div>
      </div>
    </header>
  );
}
