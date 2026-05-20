'use client';

import { useEffect, useState } from 'react';
import { Trash2, UserPlus, ShieldCheck, User, Loader2, X } from 'lucide-react';
import { useSession } from 'next-auth/react';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'user' | 'admin'>('user');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function fetchUsers() {
    setLoading(true);
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formEmail, name: formName, password: formPassword, role: formRole }),
    });

    const data = await res.json();
    setFormLoading(false);

    if (!res.ok) {
      setFormError(data.error || 'Chyba při přidávání uživatele');
      return;
    }

    setFormEmail(''); setFormName(''); setFormPassword(''); setFormRole('user');
    setShowForm(false);
    fetchUsers();
  }

  async function handleDelete(id: string) {
    setDeleteId(id);
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    setDeleteId(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Chyba při mazání');
      return;
    }
    fetchUsers();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('cs-CZ', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Správa uživatelů</h1>
          <p className="text-sm text-gray-500 mt-0.5">Přidávejte a spravujte přístupy do reportingu</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(''); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <UserPlus size={16} />
          Přidat uživatele
        </button>
      </div>

      {/* Add user form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nový uživatel</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jméno</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  placeholder="Jan Novák"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  required
                  placeholder="jan@shoptet.cz"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heslo</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 znaků"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value as 'user' | 'admin')}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="user">Uživatel</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {formLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                  Přidat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            Načítám...
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <User size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Zatím žádní uživatelé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-5 py-3.5">Jméno</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-5 py-3.5">Email</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-5 py-3.5">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-5 py-3.5">Přidán</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                        style={{ backgroundColor: user.role === 'admin' ? '#1e3a5f' : '#6b7280' }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-5 py-4">
                    {user.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        <ShieldCheck size={12} />
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <User size={12} />
                        Uživatel
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-4 text-right">
                    {user.id !== session?.user?.id && (
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={deleteId === user.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        title="Smazat uživatele"
                      >
                        {deleteId === user.id
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Trash2 size={16} />
                        }
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Přihlášen jako <strong>{session?.user?.email}</strong>
      </p>
    </div>
  );
}
