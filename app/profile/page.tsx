'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function ProfilePage() {
  const { data: session } = useSession();

  const [current, setCurrent]     = useState('');
  const [newPwd, setNewPwd]       = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showCur, setShowCur]     = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const mismatch = confirm.length > 0 && newPwd !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/users/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Neznámá chyba');
      } else {
        setSuccess(true);
        setCurrent('');
        setNewPwd('');
        setConfirm('');
      }
    } catch {
      setError('Chyba připojení');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 py-2">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Profil</h1>
        {session?.user && (
          <p className="text-sm text-slate-500 mt-0.5">{session.user.name} · {session.user.email}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound size={17} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-700">Změna hesla</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current password */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Současné heslo</label>
            <div className="relative">
              <input
                type={showCur ? 'text' : 'password'}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCur(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCur ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nové heslo</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                required
                minLength={8}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                placeholder="Min. 8 znaků"
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {newPwd.length > 0 && newPwd.length < 8 && (
              <p className="text-xs text-amber-500 mt-1">Heslo musí mít alespoň 8 znaků</p>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Potvrzení nového hesla</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className={`w-full border rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                mismatch ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200'
              }`}
              placeholder="Zopakujte nové heslo"
            />
            {mismatch && (
              <p className="text-xs text-rose-500 mt-1">Hesla se neshodují</p>
            )}
          </div>

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              Heslo bylo úspěšně změněno.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || mismatch || newPwd.length < 8}
            className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Ukládám…' : 'Uložit nové heslo'}
          </button>
        </form>
      </div>
    </div>
  );
}
