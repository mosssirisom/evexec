import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import JobCard from '@/components/JobCard';
import type { Booking, Driver } from '@/lib/types';
import { CalendarClock, Briefcase, TrendingUp } from 'lucide-react';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', user.id)
    .single();

  const today = new Date().toISOString().split('T')[0];

  const [{ data: todayJobs }, { count: availableCount }, { data: completedJobs }] =
    await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('assigned_driver_id', user.id)
        .eq('travel_date', today)
        .eq('status', 'accepted')
        .order('travel_time', { ascending: true }),

      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .is('assigned_driver_id', null)
        .in('status', ['pending', 'accepted']),

      supabase
        .from('bookings')
        .select('quoted_price')
        .eq('assigned_driver_id', user.id)
        .eq('status', 'completed')
        .gte('travel_date', getWeekStart()),
    ]);

  const weeklyEarnings = completedJobs?.reduce((s, j) => s + (j.quoted_price ?? 0), 0) ?? 0;
  const d = driver as Driver | null;
  const firstName = d?.full_name?.split(' ')[0] ?? 'Driver';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <AppHeader
        title={`${greeting}, ${firstName}`}
        subtitle={d?.vehicle_model ?? 'EV Exec Driver'}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-5 mb-6">
        {[
          { icon: <CalendarClock size={17} />, value: todayJobs?.length ?? 0, label: 'Today', href: undefined },
          { icon: <Briefcase size={17} />, value: availableCount ?? 0, label: 'Available', href: '/jobs' },
          { icon: <TrendingUp size={17} />, value: `£${weeklyEarnings}`, label: 'This week', href: undefined },
        ].map(({ icon, value, label, href }) => {
          const inner = (
            <>
              <div className="text-[#d5a538] mb-2">{icon}</div>
              <p className="text-2xl font-bold text-white leading-none">{value}</p>
              <p className="text-[10px] text-white/35 mt-1 uppercase tracking-widest">{label}</p>
            </>
          );
          return href ? (
            <Link
              key={label}
              href={href}
              className="bg-[#0B1525] border border-white/8 hover:border-[#d5a538]/25 rounded-2xl p-4 text-center transition-colors"
            >
              {inner}
            </Link>
          ) : (
            <div key={label} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 text-center">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Today's jobs */}
      <div className="px-5">
        <h2 className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-3">
          Today's Schedule
        </h2>

        {!todayJobs?.length ? (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-10 text-center">
            <CalendarClock size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/35 text-sm">No trips scheduled for today</p>
            <Link
              href="/jobs"
              className="inline-block mt-4 text-[#d5a538] text-sm font-medium underline underline-offset-4"
            >
              Browse available jobs →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {todayJobs.map((job) => (
              <JobCard key={job.id} booking={job as Booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
