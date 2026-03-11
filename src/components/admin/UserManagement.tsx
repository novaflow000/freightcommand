import { useState, useEffect, useMemo } from 'react';
import { User, Plus, Edit, Trash2, CheckCircle, XCircle, Search, Shield, Mail, AlertTriangle } from 'lucide-react';

interface UserManagementProps {
  addLog: (msg: string) => void;
}

export default function UserManagement({ addLog }: UserManagementProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', email: '', role: 'user', status: 'active' });
  const [filter, setFilter] = useState('');
  const apiBase = typeof window !== 'undefined'
    ? window.location.origin.replace('127.0.0.1:4173', 'localhost:3000').replace('5173', '3000')
    : '';

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/users`);
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      addLog('Error fetching users');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = editingUser ? `/api/v1/admin/users/${editingUser.id}` : '/api/v1/admin/users';
      const endpoint = `${apiBase}${url}`;
      const method = editingUser ? 'PUT' : 'POST';
      
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        addLog(editingUser ? 'User updated' : 'User created');
        setShowModal(false);
        setEditingUser(null);
        fetchUsers();
      } else {
        throw new Error('Failed to save user');
      }
    } catch (err) {
      addLog('Error saving user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try {
      await fetch(`${apiBase}/api/v1/admin/users/${id}`, { method: 'DELETE' });
      addLog('User deleted');
      fetchUsers();
    } catch (err) {
      addLog('Error deleting user');
    }
  };

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.name.toLowerCase().includes(filter.toLowerCase()) ||
          u.email.toLowerCase().includes(filter.toLowerCase()) ||
          u.role.toLowerCase().includes(filter.toLowerCase()),
      ),
    [users, filter],
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-1 tracking-tight">
            <User className="h-6 w-6 text-indigo-600" /> Identity & Access
          </h2>
          <p className="text-gray-500 text-sm">Role governance, status, and last activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name/email/role"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
            />
          </div>
          <button 
            onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', role: 'user', status: 'active' }); setShowModal(true); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" /> Invite User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-medium">
            <tr>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Last Login</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredUsers.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{user.name}</td>
                <td className="px-6 py-4 text-gray-600">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    user.role === 'admin' 
                      ? 'bg-purple-50 text-purple-700 border-purple-200' 
                      : 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {user.status === 'active' ? (
                    <span className="flex items-center text-emerald-600 text-xs font-medium gap-1.5">
                      <CheckCircle className="h-4 w-4" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-400 text-xs font-medium gap-1.5">
                      <XCircle className="h-4 w-4" /> Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => { setEditingUser(user); setFormData(user); setShowModal(true); }}
                      className="text-gray-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-indigo-50 transition-colors"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(user.id)}
                      className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-6">
              {editingUser ? 'Edit User' : 'Add New User'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Full Name</label>
                <input required className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email Address</label>
                <input required type="email" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Role</label>
                  <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Status</label>
                  <select className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-gray-900 text-sm focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700 text-sm font-medium px-4 py-2">Cancel</button>
                <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 shadow-sm">
                  {loading ? 'Saving...' : 'Save User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
