import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import type { Booking } from '@/lib/types';
import { TrendingUp, MapPin, ArrowRight } from 'lucide-react';

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

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

export default async function EarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: weekJobs }, { data: monthJobs }, { data: allJobs }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .eq('status', 'completed')
      .gte('travel_date', getWeekStart())
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false }),
    supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .eq('status', 'completed')
      .gte('travel_date', getMonthStart())
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false }),
    supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .eq('status', 'completed')
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false }),
  ]);

  const weekEarnings = weekJobs?.reduce((s, j) => s + (j.quoted_price ?? 0), 0) ?? 0;
  const monthEarnings = monthJobs?.reduce((s, j) => s + (j.quoted_price ?? 0), 0) ?? 0;
  const allEarnings = allJobs?.reduce((s, j) => s + (j.quoted_price ?? 0), 0) ?? 0;

  return (
    <div>
      <AppHeader title="Earnings" subtitle="Completed trip history" />

      <div className="grid grid-cols-3 gap-3 px-5 mb-6">
        {[
          { label: 'This Week',  value: `£${weekEarnings}`,  count: weekJobs?.length  ?? 0 },
          { label: 'This Month', value: `£${monthEarnings}`, count: monthJobs?.length ?? 0 },
          { label: 'All Time',   value: `£${allEarnings}`,   count: allJobs?.length   ?? 0 },
        ].map(({ label, value, count }) => (
          <div key={label} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 text-center">
            <div className="text-[#d5a538] mb-2">
              <TrendingUp size={17} className="mx-auto" />
            </div>
            <p className="text-xl font-bold text-white leading-none">{value}</p>
            <p className="text-[9px] text-white/25 mt-1">{count} trips</p>
            <p className="text-[9px] text-white/35 mt-0.5 uppercase tracking-widest">{label}</p>
          </div>
        ))}
      </div>

      <div className="px-5">
        <h2 className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-3">
          Trip History
        </h2>

        {!allJobs?.length ? (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-10 text-center">
            <TrendingUp size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/35 text-sm">No completed trips yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(allJobs as Booking[]).map((job) => {
              const from =
                job.journey_type === 'From Airport'
                  ? job.airport || 'Airport'
                  : job.pickup_location || 'Pickup';
              const to =
                job.journey_type === 'From Airport'
                  ? job.dropoff_address || 'Destination'
                  : job.airport || 'Airport';
              const time = fmtTime(job.travel_time);
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden hover:border-[#d5a538]/30 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between px-4 pt-4 pb-3.5 border-b border-white/6">
                    <span className="text-[13px] font-semibold text-white/80 tracking-wide">
                      {fmtDate(job.travel_date)}
                    </span>
                    {job.quoted_price != null && (
                      <span className="text-[#d5a538] font-bold text-lg">
                        £{job.quoted_price}
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={13} className="text-white/30 flex-shrink-0" />
                      <span className="text-white text-sm font-medium truncate max-w-[38%]">{from}</span>
                      <ArrowRight size={12} className="text-white/20 flex-shrink-0 mx-0.5" />
                      <span className="text-white/60 text-sm truncate">{to}</span>
                    </div>
                    {time && (
                      <p className="text-[11px] text-white/30">{time}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
