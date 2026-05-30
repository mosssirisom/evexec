import Link from 'next/link';
import type { Booking, BookingStatus } from '@/lib/types';
import { MapPin, Clock, Users, ArrowRight, Plane } from 'lucide-react';

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

  return (
    <Link
      href={`/jobs/${booking.id}`}
      className="block bg-[#0B1525] border border-white/8 rounded-2xl p-4 hover:border-[#d5a538]/30 transition-all active:scale-[0.99]"
    >
      {/* Top row: status pill + price */}
      <div className="flex items-center justify-between mb-3">
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
      <div className="flex items-center gap-1.5 mb-3 min-w-0">
        <MapPin size={13} className="text-white/30 flex-shrink-0" />
        <span className="text-white text-sm font-medium truncate max-w-[35%]">{from}</span>
        <ArrowRight size={13} className="text-white/20 flex-shrink-0 mx-0.5" />
        <span className="text-white/60 text-sm truncate">{to}</span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {fmtDate(booking.travel_date)}
          {booking.travel_time ? ` · ${booking.travel_time}` : ''}
        </span>
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

      {/* Customer name separator */}
      <div className="mt-3 pt-2.5 border-t border-white/5 text-[11px] text-white/25">
        {booking.customer_name}
      </div>
    </Link>
  );
}
