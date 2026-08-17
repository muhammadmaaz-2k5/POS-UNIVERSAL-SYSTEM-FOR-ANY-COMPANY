'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, ShoppingCart, DollarSign, Package, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

interface DashboardStats {
  todaySales: number;
  todayCount: number;
  weekSales: number;
  monthSales: number;
  lowStockCount: number;
  totalProducts: number;
  totalCustomers: number;
}

interface DailyRevenue {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export default function DashboardPage() {
  const { activeCompany } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);

    (async () => {
      const companyId = activeCompany.id;
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Today's sales
      const { data: todayData } = await supabase
        .from('sales')
        .select('total, created_at')
        .eq('company_id', companyId)
        .eq('status', 'completed')
        .gte('created_at', startToday);

      const todaySales = todayData?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
      const todayCount = todayData?.length || 0;

      // Week's sales
      const { data: weekData } = await supabase
        .from('sales')
        .select('total')
        .eq('company_id', companyId)
        .eq('status', 'completed')
        .gte('created_at', startWeek);

      const weekSales = weekData?.reduce((sum, s) => sum + Number(s.total), 0) || 0;

      // Month's sales
      const { data: monthData } = await supabase
        .from('sales')
        .select('total')
        .eq('company_id', companyId)
        .eq('status', 'completed')
        .gte('created_at', startMonth);

      const monthSales = monthData?.reduce((sum, s) => sum + Number(s.total), 0) || 0;

      // Products & low stock
      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const { data: lowStockProducts } = await supabase
        .from('products')
        .select('name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .filter('stock_quantity', 'lte', 'low_stock_threshold');

      // Customers
      const { count: totalCustomers } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      setStats({
        todaySales,
        todayCount,
        weekSales,
        monthSales,
        lowStockCount: lowStockProducts?.length || 0,
        totalProducts: totalProducts || 0,
        totalCustomers: totalCustomers || 0,
      });

      // Daily revenue for last 7 days
      const days: DailyRevenue[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
        const { data: dayData } = await supabase
          .from('sales')
          .select('total')
          .eq('company_id', companyId)
          .eq('status', 'completed')
          .gte('created_at', dayStart.toISOString())
          .lt('created_at', dayEnd.toISOString());

        const revenue = dayData?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
        days.push({
          date: dayStart.toISOString(),
          label: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue,
          orders: dayData?.length || 0,
        });
      }
      setDailyRevenue(days);

      // Top products
      const { data: saleItemsData } = await supabase
        .from('sale_items')
        .select(`
          name, quantity, total,
          sales!inner(company_id, status, created_at)
        `)
        .eq('sales.company_id', companyId)
        .eq('sales.status', 'completed')
        .gte('sales.created_at', startWeek);

      const productMap = new Map<string, { quantity: number; revenue: number }>();
      saleItemsData?.forEach((item: any) => {
        const existing = productMap.get(item.name) || { quantity: 0, revenue: 0 };
        existing.quantity += Number(item.quantity);
        existing.revenue += Number(item.total);
        productMap.set(item.name, existing);
      });

      const top = Array.from(productMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      setTopProducts(top);

      // Recent sales
      const { data: recent } = await supabase
        .from('sales')
        .select(`
          id, sale_number, total, payment_method, status, created_at,
          customers(name)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentSales(recent || []);
      setLoading(false);
    })();
  }, [activeCompany]);

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const cards = [
    {
      title: "Today's Revenue",
      value: formatCurrency(stats.todaySales, activeCompany?.currency),
      subtitle: `${stats.todayCount} transactions`,
      icon: DollarSign,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      title: 'This Week',
      value: formatCurrency(stats.weekSales, activeCompany?.currency),
      subtitle: 'Last 7 days',
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'This Month',
      value: formatCurrency(stats.monthSales, activeCompany?.currency),
      subtitle: 'Last 30 days',
      icon: ShoppingCart,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      title: 'Low Stock Items',
      value: String(stats.lowStockCount),
      subtitle: `${stats.totalProducts} total products`,
      icon: AlertTriangle,
      color: stats.lowStockCount > 0 ? 'text-destructive' : 'text-muted-foreground',
      bg: stats.lowStockCount > 0 ? 'bg-destructive/10' : 'bg-muted',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeCompany?.name} — overview of your business performance
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold mt-2">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue — Last 7 Days</CardTitle>
            <CardDescription>Daily revenue from completed sales</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                  formatter={(value: number) => [formatCurrency(value, activeCompany?.currency), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Products — This Week</CardTitle>
            <CardDescription>Best sellers by revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No sales data yet this week
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'revenue') return [formatCurrency(value, activeCompany?.currency), 'Revenue'];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent sales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
          <CardDescription>Latest sales at your register</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSales.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No transactions yet. Make your first sale from the POS Terminal.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Sale #{sale.sale_number}
                        {sale.customers?.name && (
                          <span className="text-muted-foreground font-normal"> — {sale.customers.name}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(sale.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={sale.status === 'completed' ? 'default' : sale.status === 'refunded' ? 'destructive' : 'secondary'}
                      className="capitalize"
                    >
                      {sale.status}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {formatCurrency(Number(sale.total), activeCompany?.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
