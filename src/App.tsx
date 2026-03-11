import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ApiDocs from './pages/ApiDocs';
import Admin from './pages/Admin';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import { FiltersProvider } from './context/FiltersContext';

export default function App() {
  return (
    <FiltersProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </Router>
    </FiltersProvider>
  );
}
