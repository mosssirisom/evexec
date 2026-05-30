import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/AppHeader';
import OnlineToggle from '@/components/OnlineToggle';
import SignOutButton from '@/components/SignOutButton';
import type { Driver } from '@/lib/types';
import { User, Phone, Car, Hash, Award } from 'lucide-react';

function ProfileRow({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-white/5 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/25 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-sm text-white font-medium truncate">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', user.id)
    .single();

  const d = driver as Driver | null;

  return (
    <div>
      <AppHeader title="Profile" />

      {/* Avatar card */}
      <div className="mx-5 mb-5 bg-[#0B1525] border border-white/8 rounded-2xl p-5 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 font-serif text-xl font-bold text-[#d5a538]"
          style={{ background: 'rgba(213,165,56,0.1)', border: '1.5px solid rgba(213,165,56,0.2)' }}
        >
          {d?.full_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">{d?.full_name ?? 'Driver'}</p>
          <p className="text-white/35 text-xs mt-0.5 truncate">{user.email}</p>
        </div>
        {d && <OnlineToggle driverId={user.id} initialOnline={d.is_online} />}
      </div>

      {/* Details */}
      <div className="mx-5 mb-4 bg-[#0B1525] border border-white/8 rounded-2xl px-5 py-1">
        <ProfileRow icon={<User size={15} />}  label="Full Name"     value={d?.full_name} />
        <ProfileRow icon={<Phone size={15} />} label="Phone"         value={d?.phone} />
        <ProfileRow icon={<Car size={15} />}   label="Vehicle"       value={d?.vehicle_model} />
        <ProfileRow icon={<Hash size={15} />}  label="Registration"  value={d?.vehicle_registration} />
        <ProfileRow icon={<Award size={15} />} label="Driver ID"     value={user.id.slice(0, 8).toUpperCase()} />
      </div>

      {/* Sign out */}
      <div className="mx-5">
        <SignOutButton />
      </div>
    </div>
  );
}
