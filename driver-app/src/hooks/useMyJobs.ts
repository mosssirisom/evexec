'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Booking } from '@/lib/types';

export function useMyJobs(driverId: string) {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetch() {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .eq('assigned_driver_id', driverId)
        .in('status', ['accepted', 'en_route', 'arrived', 'active'])
        .order('travel_date', { ascending: true });
      setJobs((data as Booking[]) ?? []);
      setLoading(false);
    }

    fetch();

    const channel = supabase
      .channel(`hook-my-jobs-${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `assigned_driver_id=eq.${driverId}` },
        () => fetch()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driverId]);

  return { jobs, loading };
}
