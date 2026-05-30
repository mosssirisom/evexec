'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Booking } from '@/lib/types';

export function useAvailableJobs() {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetch() {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .is('assigned_driver_id', null)
        .in('status', ['pending', 'accepted'])
        .order('travel_date', { ascending: true });
      setJobs((data as Booking[]) ?? []);
      setLoading(false);
    }

    fetch();

    const channel = supabase
      .channel('hook-available-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { jobs, loading };
}
