'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

interface OnlineToggleProps {
  driverId: string;
  initialOnline: boolean;
}

export default function OnlineToggle({ driverId, initialOnline }: OnlineToggleProps) {
  const [isOnline, setIsOnline] = useState(initialOnline);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('drivers')
      .update({ is_online: !isOnline })
      .eq('id', driverId);
    if (!error) setIsOnline((v) => !v);
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative w-12 h-6 rounded-full transition-colors duration-300 disabled:opacity-60 focus:outline-none ${
          isOnline ? 'bg-green-500' : 'bg-white/15'
        }`}
        aria-label={isOnline ? 'Go offline' : 'Go online'}
      >
        {loading ? (
          <Loader2 size={12} className="absolute inset-0 m-auto text-white animate-spin" />
        ) : (
          <div
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
              isOnline ? 'left-[calc(100%-22px)]' : 'left-0.5'
            }`}
          />
        )}
      </button>
      <span className={`text-[10px] font-medium ${isOnline ? 'text-green-400' : 'text-white/30'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}
