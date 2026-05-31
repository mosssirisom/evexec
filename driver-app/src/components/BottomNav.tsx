'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, Car, TrendingUp, User } from 'lucide-react';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home'     },
  { href: '/jobs',      icon: Briefcase,       label: 'Board'    },
  { href: '/my-jobs',   icon: Car,             label: 'Active'   },
  { href: '/earnings',  icon: TrendingUp,      label: 'Earnings' },
  { href: '/profile',   icon: User,            label: 'Me'       },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/8 pb-safe"
      style={{ background: '#0B1525' }}
    >
      <div className="flex items-center justify-around h-16 max-w-sm mx-auto px-1">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 flex-1 py-2 rounded-xl transition-colors ${
                active ? 'text-[#d5a538]' : 'text-white/30 hover:text-white/55'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[9px] font-medium tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
