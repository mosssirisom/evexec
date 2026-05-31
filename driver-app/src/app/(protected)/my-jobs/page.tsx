'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppHeader from '@/components/AppHeader';
import JobCard from '@/components/JobCard';
import SkeletonCard from '@/components/SkeletonCard';
import type { Booking } from '@/lib/types';
import { Car } from 'lucide-react';
import Link from 'next/link';

export default function MyJobsPage() {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cleanup: (() => void) | undefined;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      async function load() {
        const { data } = await supabase
          .from('bookings')
          .select('*')
          .eq('assigned_driver_id', user!.id)
          .in('status', ['accepted', 'en_route', 'arrived', 'active'])
          .order('travel_date', { ascending: true })
          .order('travel_time', { ascending: true });
        setJobs((data as Booking[]) ?? []);
        setLoading(false);
      }

      await load();

      const channel = supabase
        .channel(`my-jobs-page-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `assigned_driver_id=eq.${user.id}`,
          },
          load
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => { cleanup?.(); };
  }, []);

  return (
    <div>
      <AppHeader title="My Jobs" subtitle="Active and upcoming trips" />
      <div className="px-5">
        {loading ? (
          <div className="space-y-3 mt-2">
            {[1, 2].map((n) => <SkeletonCard key={n} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center mt-2">
            <Car size={34} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/35 text-sm font-medium">No active jobs</p>
            <p className="text-white/20 text-xs mt-1">
              Accept a job from the board to see it here
            </p>
            <Link
              href="/jobs"
              className="inline-block mt-4 text-[#d5a538] text-sm font-medium underline underline-offset-4"
            >
              Browse available jobs &#8594;
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} booking={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
