'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Eye, EyeOff, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function ResetPasswordPage() {
  const router  = useRouter();
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState('');
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(!!data.session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message || 'Failed to update password. The link may have expired.');
      return;
    }

    setDone(true);
    setTimeout(() => router.push('/dashboard'), 2500);
  }

  if (sessionReady === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020813]">
        <Loader2 size={26} className="text-white/20 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#020813]">
      <div className="mb-10 text-center">
        <Image src="/logo.jpg" alt="EV Exec" width={120} height={120} className="mx-auto mb-2" priority />
        <p className="text-white/40 tracking-widest uppercase text-xs">Driver Portal</p>
      </div>

      <div className="w-full max-w-sm bg-[#0B1525] border border-white/8 rounded-2xl p-6 shadow-2xl">
        {done ? (
          <div className="text-center py-4">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
              style={{ background: 'rgba(213,165,56,0.12)', border: '1px solid rgba(213,165,56,0.25)' }}
            >
              <ShieldCheck size={26} className="text-[#d5a538]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Password updated</h2>
            <p className="text-sm text-white/40">Redirecting you to the dashboard…</p>
          </div>
        ) : !sessionReady ? (
          <div className="text-center py-4">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle size={26} className="text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Link expired</h2>
            <p className="text-sm text-white/40 leading-relaxed mb-6">
              This reset link is no longer valid. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block w-full py-3.5 rounded-xl font-semibold text-[#020813] text-sm text-center"
              style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
            >
              Request New Link
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white mb-1">Set new password</h2>
            <p className="text-sm text-white/40 mb-6">Choose a strong password for your account.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-white/40 mb-2 uppercase tracking-widest">
                  New password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min. 8 characters"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-white/40 mb-2 uppercase tracking-widest">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Repeat password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity mt-2"
                style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
              >
                {loading && <Loader2 size={17} className="animate-spin" />}
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
