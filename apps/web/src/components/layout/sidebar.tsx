'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Upload, FileText, Bell, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/students', label: 'Students', icon: Users },
  { href: '/students/upload', label: 'Bulk Upload', icon: Upload },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r bg-white h-screen sticky top-0 flex flex-col">
      <div className="p-4 border-b">
        <span className="font-semibold text-sm">Fee Recovery</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
