'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppHeader from '@/components/AppHeader';
import JobCard from '@/components/JobCard';
import SkeletonCard from '@/components/SkeletonCard';
import type { Booking } from '@/lib/types';
import { Zap } from 'lucide-react';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const initialLoad = useRef(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchJobs() {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .is('assigned_driver_id', null)
        .in('status', ['pending', 'accepted'])
        .order('travel_date', { ascending: true })
        .order('travel_time', { ascending: true });

      setJobs((data as Booking[]) ?? []);
      setLoading(false);
    }

    fetchJobs();

    const channel = supabase
      .channel('available-jobs-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setJobs((prev) => prev.filter((j) => j.id !== (payload.old as Booking).id));
          return;
        }

        const updated = payload.new as Booking;
        const isAvailable = !updated.assigned_driver_id && ['pending', 'accepted'].includes(updated.status);

        setJobs((prev) => {
          const exists = prev.some((j) => j.id === updated.id);
          if (isAvailable) {
            if (exists) return prev.map((j) => (j.id === updated.id ? updated : j));
            if (!initialLoad.current) {
              setPulse(true);
              setTimeout(() => setPulse(false), 3500);
            }
            return [updated, ...prev].sort((a, b) =>
              a.travel_date.localeCompare(b.travel_date) ||
              (a.travel_time ?? '').localeCompare(b.travel_time ?? '')
            );
          }
          return prev.filter((j) => j.id !== updated.id);
        });

        initialLoad.current = false;
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div>
      <AppHeader title="Available Jobs" subtitle="New jobs appear in real time" />

      {pulse && (
        <div className="mx-5 mb-4 flex items-center gap-2 bg-[#d5a538]/10 border border-[#d5a538]/25 text-[#d5a538] rounded-xl px-4 py-3 text-sm font-medium">
          <Zap size={15} />
          New job just posted!
        </div>
      )}

      <div className="px-5">
        {loading ? (
          <div className="space-y-3 mt-2">
            {[1, 2, 3].map((n) => <SkeletonCard key={n} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center mt-2">
            <Zap size={34} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/35 text-sm font-medium">No jobs available right now</p>
            <p className="text-white/20 text-xs mt-1">New jobs will appear here automatically</p>
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
