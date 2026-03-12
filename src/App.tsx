import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ApiDocs from './pages/ApiDocs';
import Admin from './pages/Admin';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import { FiltersProvider } from './context/FiltersContext';

// Simple authentication check component
function RequireAuth({ children }: { children: JSX.Element }) {
  // In a real app, you would check actual auth state
  // For now, we'll simulate an unauthenticated state
  const isAuthenticated = false; // Replace with real auth check
  
  if (!isAuthenticated) {
    // Redirect to login page if not authenticated
    window.location.href = '/login';
    return null;
  }
  
  return children;
}

export default function App() {
  return (
    <FiltersProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route 
            path="/admin" 
            element={
              <RequireAuth>
                <Admin />
              </RequireAuth>
            } 
          />
          <Route 
            path="/analytics" 
            element={
              <RequireAuth>
                <Analytics />
              </RequireAuth>
            } 
          />
          <Route 
            path="/reports" 
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            } 
          />
          <Route path="/login" element={<div>Login Page Content Would Go Here</div>} />
        </Routes>
      </Router>
    </FiltersProvider>
  );
}
