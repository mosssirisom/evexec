'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface AcceptJobButtonProps {
  bookingId: string;
  driverId: string;
}

type State = 'idle' | 'loading' | 'success' | 'error';

export default function AcceptJobButton({ bookingId, driverId }: AcceptJobButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleAccept() {
    setState('loading');
    setErrorMsg('');

    const supabase = createClient();
    const { data, error } = await supabase.rpc('driver_accept_booking', {
      p_booking_id: bookingId,
      p_driver_id:  driverId,
    });

    if (error || !data?.success) {
      setErrorMsg(data?.error ?? error?.message ?? 'Failed to accept job. Please try again.');
      setState('error');
      return;
    }

    setState('success');
    setTimeout(() => router.refresh(), 900);
  }

  if (state === 'success') {
    return (
      <div className="flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/25 text-green-400 rounded-2xl p-5 text-sm font-semibold">
        <CheckCircle size={18} />
        Job accepted — customer has been notified.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state === 'error' && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={state === 'loading'}
        className="w-full py-4 rounded-2xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
        style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
      >
        {state === 'loading' && <Loader2 size={17} className="animate-spin" />}
        {state === 'loading' ? 'Claiming job…' : 'Accept This Job'}
      </button>
    </div>
  );
}
