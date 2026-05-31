import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AcceptJobButton from '@/components/AcceptJobButton';
import StatusStepper from '@/components/StatusStepper';
import DriverNotesInput from '@/components/DriverNotesInput';
import type { Booking } from '@/lib/types';
import { ArrowLeft, Clock, Users, Plane, Phone, MessageSquare, Car, RotateCcw, Navigation } from 'lucide-react';
import type { ReactNode } from 'react';

function fmtDate(d: string) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return d; }
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-white/5 last:border-0">
      <div className="text-white/25 mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-sm text-white font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (!booking) notFound();

  const b = booking as Booking;
  const isAssignedToMe = b.assigned_driver_id === user.id;
  const isAvailable    = !b.assigned_driver_id && ['pending', 'accepted'].includes(b.status);

  const from =
    b.journey_type === 'From Airport'
      ? b.airport || 'Airport'
      : b.pickup_location || 'Pickup';
  const to =
    b.journey_type === 'From Airport'
      ? b.dropoff_address || 'Destination'
      : b.airport || 'Airport';

  // Address the driver should navigate to, context-aware by status
  const pickupAddr = b.journey_type === 'To Airport' ? b.pickup_location : b.airport;
  const dropoffAddr = b.journey_type === 'To Airport' ? b.airport : b.dropoff_address;
  const navAddr = ['accepted', 'en_route', 'arrived'].includes(b.status)
    ? pickupAddr
    : b.status === 'active'
    ? dropoffAddr
    : null;
  const navLabel = ['accepted', 'en_route', 'arrived'].includes(b.status)
    ? 'Directions to Pickup'
    : 'Directions to Dropoff';

  return (
    <div className="pb-6">
      {/* Back */}
      <div className="flex items-center gap-2 px-5 pt-12 pb-4">
        <Link href="/jobs" className="text-white/35 hover:text-white/65 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <span className="text-sm text-white/35">Job Details</span>
      </div>

      {/* Price hero */}
      {b.quoted_price != null && (
        <div className="mx-5 mb-4 bg-[#0B1525] border border-[#d5a538]/15 rounded-2xl py-5 text-center">
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Transfer value</p>
          <p className="font-serif text-5xl font-bold text-[#d5a538]">£{b.quoted_price}</p>
        </div>
      )}

      {/* Route visual */}
      <div className="mx-5 mb-4 bg-[#0B1525] border border-white/8 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#d5a538] flex-shrink-0" />
          <p className="text-white font-semibold text-sm">{from}</p>
        </div>
        <div className="w-px h-8 bg-gradient-to-b from-[#d5a538]/40 to-white/10 ml-[4px] my-0.5" />
        <div className="flex items-center gap-3 mt-2">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-white/30 flex-shrink-0" />
          <p className="text-white/60 text-sm">{to}</p>
        </div>
      </div>

      {/* Details */}
      <div className="mx-5 mb-4 bg-[#0B1525] border border-white/8 rounded-2xl px-5 py-1">
        <DetailRow
          icon={<Clock size={15} />}
          label="Pickup time"
          value={`${fmtDate(b.travel_date)}${b.travel_time ? ' at ' + b.travel_time : ''}`}
        />
        <DetailRow
          icon={<Users size={15} />}
          label="Passengers"
          value={`${b.passengers} passenger${b.passengers !== 1 ? 's' : ''}${b.luggage ? ' · ' + b.luggage : ''}`}
        />
        {b.flight_number && (
          <DetailRow icon={<Plane size={15} />} label="Flight" value={b.flight_number} />
        )}
        <DetailRow icon={<Car size={15} />} label="Journey type" value={b.journey_type} />
        {b.return_journey && b.return_date && (
          <DetailRow
            icon={<RotateCcw size={15} />}
            label="Return journey"
            value={`${fmtDate(b.return_date)}${b.return_time ? ' at ' + b.return_time : ''}`}
          />
        )}
      </div>

      {/* Directions — only for assigned driver, context-aware */}
      {isAssignedToMe && navAddr && (
        <div className="mx-5 mb-4">
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(navAddr)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#0B1525] border border-white/8 hover:border-[#d5a538]/30 rounded-2xl py-4 text-sm text-white/60 hover:text-white/80 font-medium transition-all"
          >
            <Navigation size={15} className="text-[#d5a538]" />
            {navLabel}
          </a>
        </div>
      )}

      {/* Customer contact — only after accepting */}
      {isAssignedToMe && (
        <div className="mx-5 mb-4 bg-[#0B1525] border border-white/8 rounded-2xl px-5 py-1">
          <div className="py-3.5 border-b border-white/5">
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">Customer</p>
            <p className="text-sm text-white font-medium">{b.customer_name}</p>
          </div>
          {b.customer_phone && (
            <div className="flex gap-3 py-4">
              <a
                href={`tel:${b.customer_phone}`}
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl py-3 text-sm text-white/60 font-medium transition-colors"
              >
                <Phone size={14} />
                Call
              </a>
              <a
                href={`https://wa.me/${b.customer_phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl py-3 text-sm text-white/60 font-medium transition-colors"
              >
                <MessageSquare size={14} />
                WhatsApp
              </a>
            </div>
          )}
        </div>
      )}

      {/* Driver notes — private, only visible to assigned driver */}
      {isAssignedToMe && (
        <DriverNotesInput bookingId={b.id} initialNotes={b.driver_notes} />
      )}

      {/* CTA / stepper */}
      <div className="px-5">
        {isAssignedToMe ? (
          <StatusStepper booking={b} driverId={user.id} />
        ) : isAvailable ? (
          <AcceptJobButton bookingId={b.id} driverId={user.id} />
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center text-white/30 text-sm">
            This job is no longer available
          </div>
        )}
      </div>
    </div>
  );
}
