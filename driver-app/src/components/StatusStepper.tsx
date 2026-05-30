'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Booking, BookingStatus } from '@/lib/types';
import { Loader2, Navigation, MapPin, Users, CheckCircle, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

interface Step {
  from: BookingStatus;
  to: BookingStatus;
  label: string;
  icon: ReactNode;
  hint: string;
}

const STEPS: Step[] = [
  { from: 'accepted', to: 'en_route',  label: 'Start Journey',      icon: <Navigation size={17} />, hint: 'Heading to pickup location' },
  { from: 'en_route', to: 'arrived',   label: 'Arrived at Pickup',  icon: <MapPin size={17} />,     hint: 'Waiting for passenger' },
  { from: 'arrived',  to: 'active',    label: 'Passenger On Board', icon: <Users size={17} />,      hint: 'Journey in progress' },
  { from: 'active',   to: 'completed', label: 'Complete Trip',      icon: <CheckCircle size={17} />, hint: 'Destination reached' },
];

const ORDER: BookingStatus[] = ['accepted', 'en_route', 'arrived', 'active', 'completed'];

interface StatusStepperProps {
  booking: Booking;
  driverId: string;
}

export default function StatusStepper({ booking, driverId }: StatusStepperProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<BookingStatus>(booking.status);

  const step = STEPS.find((s) => s.from === status);
  const idx  = ORDER.indexOf(status);

  async function advance() {
    if (!step) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc('driver_update_status', {
      p_booking_id: booking.id,
      p_status:     step.to,
      p_driver_id:  driverId,
    });

    if (rpcErr || !data?.success) {
      setError(data?.error ?? rpcErr?.message ?? 'Update failed. Please try again.');
      setLoading(false);
      return;
    }

    setStatus(step.to);
    setLoading(false);
    router.refresh();
  }

  if (status === 'completed') {
    return (
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-8 text-center">
        <CheckCircle size={38} className="text-green-400 mx-auto mb-3" />
        <p className="text-white font-semibold text-base mb-1">Trip Completed</p>
        <p className="text-white/35 text-sm">Great work — journey finished.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress track */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl px-5 py-4">
        <div className="flex gap-1.5 mb-2">
          {ORDER.slice(0, ORDER.length - 1).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                i < idx ? 'bg-[#d5a538]' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <p className="text-[11px] text-white/30 text-center">
          Step {idx + 1} of {ORDER.length - 1}
        </p>
      </div>

      {/* Action button */}
      {step && (
        <>
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <button
            onClick={advance}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : step.icon}
            {loading ? 'Updating…' : step.label}
          </button>
          <p className="text-center text-[11px] text-white/25">{step.hint}</p>
        </>
      )}
    </div>
  );
}
