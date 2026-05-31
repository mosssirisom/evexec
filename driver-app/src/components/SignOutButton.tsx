'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full flex items-center justify-center gap-2 py-4 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/15 rounded-2xl text-white/45 hover:text-white/65 text-sm font-medium transition-all"
    >
      <LogOut size={15} />
      Sign Out
    </button>
  );
}
