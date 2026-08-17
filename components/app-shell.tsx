'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  Users,
  UserCog,
  BarChart3,
  Settings,
  Store,
  Menu,
  LogOut,
  ChevronDown,
  Building2,
} from 'lucide-react';
import { PosAgent } from '@/components/pos-agent';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'POS Terminal', icon: ShoppingCart },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/sales', label: 'Sales', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/staff', label: 'Staff', icon: UserCog, roles: ['owner', 'manager'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['owner', 'manager'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['owner', 'manager'] },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { activeRole } = useAuth();

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {navItems
        .filter((item) => !item.roles || (activeRole && item.roles.includes(activeRole)))
        .map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-white shadow-sm'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground'
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: '1.125rem', height: '1.125rem' }} />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

function CompanySwitcher() {
  const { companies, activeCompany, setActiveCompanyId } = useAuth();

  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent/20">
          <Store className="h-5 w-5 text-sidebar-accent" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {activeCompany?.name || 'No company'}
          </p>
          <p className="text-xs text-sidebar-foreground/50">Workspace</p>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 px-4 py-3 hover:bg-sidebar-foreground/10 transition-colors">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent/20">
            <Store className="h-5 w-5 text-sidebar-accent" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {activeCompany?.name || 'Select company'}
            </p>
            <p className="text-xs text-sidebar-foreground/50">Switch workspace</p>
          </div>
          <ChevronDown className="h-4 w-4 text-sidebar-foreground/50 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your companies</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => setActiveCompanyId(c.id)}
            className={cn(
              'flex items-center gap-2 cursor-pointer',
              c.id === activeCompany?.id && 'bg-accent/10'
            )}
          >
            <Building2 className="h-4 w-4" />
            <span className="truncate">{c.name}</span>
            {c.id === activeCompany?.id && (
              <Badge variant="secondary" className="ml-auto text-xs">Active</Badge>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, activeRole, signOut } = useAuth();
  if (!user) return null;

  const initials = (user.email || '?').substring(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium leading-none truncate max-w-[160px]">{user.email}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{activeRole || 'member'}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive cursor-pointer">
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { activeCompany } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar fixed inset-y-0 left-0 z-30">
        <div className="border-b border-sidebar-foreground/10">
          <Link href="/dashboard" className="flex items-center gap-2.5 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-accent shadow-lg shadow-sidebar-accent/20">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-sidebar-foreground">RetailPOS</p>
              <p className="text-xs text-sidebar-foreground/50">Point of Sale</p>
            </div>
          </Link>
        </div>
        <CompanySwitcher />
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-foreground/10 p-3">
          <div className="flex items-center gap-2 px-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sidebar-accent/20 text-sidebar-accent text-xs font-semibold">
                {activeCompany?.name?.substring(0, 2).toUpperCase() || '??'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{activeCompany?.name}</p>
              <p className="text-xs text-sidebar-foreground/50">{activeCompany?.currency}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="border-b border-sidebar-foreground/10">
            <Link href="/dashboard" className="flex items-center gap-2.5 px-4 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-accent">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-sidebar-foreground">RetailPOS</p>
                <p className="text-xs text-sidebar-foreground/50">Point of Sale</p>
              </div>
            </Link>
          </div>
          <CompanySwitcher />
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 backdrop-blur px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
      <PosAgent />
    </div>
  );
}
