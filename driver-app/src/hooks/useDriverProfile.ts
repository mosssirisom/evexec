'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Driver } from '@/lib/types';

export function useDriverProfile(driverId: string) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('drivers')
      .select('*')
      .eq('id', driverId)
      .single()
      .then(({ data }) => {
        setDriver(data as Driver | null);
        setLoading(false);
      });
  }, [driverId]);

  return { driver, loading };
}
