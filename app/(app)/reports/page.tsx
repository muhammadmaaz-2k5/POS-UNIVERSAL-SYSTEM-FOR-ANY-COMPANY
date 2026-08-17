'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { BarChart3, TrendingUp, Download, Loader2 } from 'lucide-react';

const PIE_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function ReportsPage() {
  const { activeCompany } = useAuth();
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [paymentData, setPaymentData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalOrders: 0, avgOrder: 0, totalTax: 0, totalDiscount: 0 });

  const loadReport = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: sales } = await supabase
      .from('sales')
      .select('id, total, subtotal, tax_amount, discount, payment_method, status, created_at')
      .eq('company_id', activeCompany.id)
      .eq('status', 'completed')
      .gte('created_at', startDate)
      .order('created_at', { ascending: true });

    const completed = sales || [];

    setSummary({
      totalRevenue: completed.reduce((s, r) => s + Number(r.total), 0),
      totalOrders: completed.length,
      avgOrder: completed.length ? completed.reduce((s, r) => s + Number(r.total), 0) / completed.length : 0,
      totalTax: completed.reduce((s, r) => s + Number(r.tax_amount), 0),
      totalDiscount: completed.reduce((s, r) => s + Number(r.discount), 0),
    });

    // Daily revenue
    const dailyMap = new Map<string, { date: string; revenue: number; orders: number }>();
    completed.forEach((sale) => {
      const day = new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const existing = dailyMap.get(day) || { date: day, revenue: 0, orders: 0 };
      existing.revenue += Number(sale.total);
      existing.orders += 1;
      dailyMap.set(day, existing);
    });
    setDailyData(Array.from(dailyMap.values()));

    // Payment method breakdown
    const payMap = new Map<string, number>();
    completed.forEach((sale) => {
      payMap.set(sale.payment_method, (payMap.get(sale.payment_method) || 0) + Number(sale.total));
    });
    setPaymentData(Array.from(payMap.entries()).map(([name, value]) => ({ name, value })));

    // Top products
    const { data: items } = await supabase
      .from('sale_items')
      .select('name, quantity, total, sales!inner(company_id, status, created_at)')
      .eq('sales.company_id', activeCompany.id)
      .eq('sales.status', 'completed')
      .gte('sales.created_at', startDate);

    const prodMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    items?.forEach((item: any) => {
      const existing = prodMap.get(item.name) || { name: item.name, quantity: 0, revenue: 0 };
      existing.quantity += Number(item.quantity);
      existing.revenue += Number(item.total);
      prodMap.set(item.name, existing);
    });
    setTopProducts(Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10));

    setLoading(false);
  }, [activeCompany, period]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const exportCSV = () => {
    const rows = [['Date', 'Total', 'Subtotal', 'Tax', 'Discount', 'Payment Method', 'Status']];
    dailyData.forEach((d) => rows.push([d.date, String(d.revenue), '', '', '', '', '']));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${period}days.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Analyze your business performance</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Revenue', value: formatCurrency(summary.totalRevenue, activeCompany?.currency), icon: TrendingUp, color: 'text-success' },
          { label: 'Total Orders', value: String(summary.totalOrders), icon: BarChart3, color: 'text-primary' },
          { label: 'Avg Order Value', value: formatCurrency(summary.avgOrder, activeCompany?.currency), icon: TrendingUp, color: 'text-warning' },
          { label: 'Tax Collected', value: formatCurrency(summary.totalTax, activeCompany?.currency), icon: BarChart3, color: 'text-muted-foreground' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                    <p className="text-xl font-bold mt-1">{card.value}</p>
                  </div>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Trend</CardTitle>
            <CardDescription>Daily revenue over the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No sales data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }} formatter={(v: number) => [formatCurrency(v, activeCompany?.currency), 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Methods</CardTitle>
            <CardDescription>Revenue breakdown by payment type</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No payment data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry: any) => `${entry.name}: ${formatCurrency(entry.value, activeCompany?.currency)}`}>
                    {paymentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, activeCompany?.currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Products</CardTitle>
          <CardDescription>Best sellers by revenue in this period</CardDescription>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No product sales data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }} formatter={(v: number) => [formatCurrency(v, activeCompany?.currency), 'Revenue']} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
