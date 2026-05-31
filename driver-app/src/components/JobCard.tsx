import Link from 'next/link';
import type { Booking, BookingStatus } from '@/lib/types';
import { MapPin, Users, ArrowRight, Plane } from 'lucide-react';

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending:   'Available',
  accepted:  'Assigned',
  en_route:  'En Route',
  arrived:   'At Pickup',
  active:    'On Board',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function fmtDate(d: string) {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch { return d; }
}

function fmtTime(t: string | null) {
  if (!t) return null;
  return t.slice(0, 5);
}

interface JobCardProps {
  booking: Booking;
  showStatus?: boolean;
}

export default function JobCard({ booking, showStatus = true }: JobCardProps) {
  const from =
    booking.journey_type === 'From Airport'
      ? booking.airport || 'Airport'
      : booking.pickup_location || 'Pickup';
  const to =
    booking.journey_type === 'From Airport'
      ? booking.dropoff_address || 'Destination'
      : booking.airport || 'Airport';

  const time = fmtTime(booking.travel_time);

  return (
    <Link
      href={`/jobs/${booking.id}`}
      className="block bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden hover:border-[#d5a538]/30 transition-all active:scale-[0.99]"
    >
      {/* Date / Time header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3.5 border-b border-white/6">
        <span className="text-[13px] font-semibold text-white/80 tracking-wide">
          {fmtDate(booking.travel_date)}
        </span>

        {time ? (
          <span
            className="text-[22px] font-bold tabular-nums leading-none"
            style={{ color: '#d5a538' }}
          >
            {time}
          </span>
        ) : (
          <span className="text-sm font-medium text-white/25 italic">Time TBC</span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Status + price */}
        <div className="flex items-center justify-between">
          {showStatus && (
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full status-${booking.status}`}>
              {STATUS_LABELS[booking.status]}
            </span>
          )}
          {booking.quoted_price != null && (
            <span className="text-[#d5a538] font-bold text-lg ml-auto">
              £{booking.quoted_price}
            </span>
          )}
        </div>

        {/* Route */}
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin size={13} className="text-white/30 flex-shrink-0" />
          <span className="text-white text-sm font-medium truncate max-w-[38%]">{from}</span>
          <ArrowRight size={12} className="text-white/20 flex-shrink-0 mx-0.5" />
          <span className="text-white/60 text-sm truncate">{to}</span>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {booking.passengers} pax
          </span>
          {booking.flight_number && (
            <span className="flex items-center gap-1">
              <Plane size={11} />
              {booking.flight_number}
            </span>
          )}
        </div>

        {/* Customer */}
        <div className="pt-2.5 border-t border-white/5 text-[11px] text-white/25">
          {booking.customer_name}
        </div>
      </div>
    </Link>
  );
}
