'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ArrowLeft, CheckCircle, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setLoading(false);
    if (err) {
      setError('Something went wrong. Please try again.');
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#020813]">
      <div className="mb-10 text-center">
        <Image src="/logo.jpg" alt="EV Exec" width={120} height={120} className="mx-auto mb-2" priority />
        <p className="text-white/40 tracking-widest uppercase text-xs">Driver Portal</p>
      </div>

      <div className="w-full max-w-sm bg-[#0B1525] border border-white/8 rounded-2xl p-6 shadow-2xl">
        {sent ? (
          <div className="text-center py-4">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
              style={{ background: 'rgba(213,165,56,0.12)', border: '1px solid rgba(213,165,56,0.25)' }}
            >
              <CheckCircle size={26} className="text-[#d5a538]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
            <p className="text-sm text-white/40 leading-relaxed mb-6">
              We sent a password reset link to{' '}
              <span className="text-white/70 font-medium">{email}</span>. The link expires in 1 hour.
            </p>
            <Link
              href="/login"
              className="text-[#d5a538] text-sm font-medium underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <Link href="/login" className="text-white/30 hover:text-white/60 transition-colors">
                <ArrowLeft size={18} />
              </Link>
              <h2 className="text-lg font-semibold text-white">Reset password</h2>
            </div>

            <p className="text-sm text-white/40 mb-6 leading-relaxed">
              Enter your registered email address and we'll send you a secure reset link.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-white/40 mb-2 uppercase tracking-widest">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@evexec.co.uk"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
              >
                {loading && <Loader2 size={17} className="animate-spin" />}
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
