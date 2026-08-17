'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Search, Eye, RotateCcw, Loader2, CreditCard, Banknote, Wallet } from 'lucide-react';

const paymentIcons: Record<string, any> = { cash: Banknote, card: CreditCard, other: Wallet };

export default function SalesPage() {
  const { activeCompany } = useAuth();
  const { toast } = useToast();
  const [sales, setSales] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [viewSale, setViewSale] = useState<any | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSale, setRefundSale] = useState<any | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadSales = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales')
      .select(`*, customers(name), sale_items(*)`)
      .eq('company_id', activeCompany.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setSales(data || []);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const filtered = sales.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return String(s.sale_number).includes(q) || s.customers?.name?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleRefund = async () => {
    if (!refundSale) return;
    setProcessing(true);
    const { error } = await supabase
      .from('sales')
      .update({ status: 'refunded' })
      .eq('id', refundSale.id);
    if (error) { toast({ title: 'Failed to process refund', variant: 'destructive' }); setProcessing(false); return; }

    // Restore stock
    for (const item of refundSale.sale_items || []) {
      if (item.product_id) {
        const { data: prod } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
        if (prod) {
          await supabase.from('products').update({ stock_quantity: prod.stock_quantity + item.quantity }).eq('id', item.product_id);
        }
      }
    }

    toast({ title: 'Sale refunded', description: `Sale #${refundSale.sale_number} has been refunded` });
    setProcessing(false);
    setRefundOpen(false);
    setRefundSale(null);
    loadSales();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground mt-1">View transaction history and process refunds</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by sale number or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sales</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No sales found</p>
              <p className="text-sm text-muted-foreground mt-1">Sales will appear here once you start using the POS terminal.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sale) => {
                  const PayIcon = paymentIcons[sale.payment_method] || Wallet;
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">#{sale.sale_number}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(sale.created_at)}</TableCell>
                      <TableCell>{sale.customers?.name || 'Walk-in'}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm capitalize">
                          <PayIcon className="h-3.5 w-3.5" /> {sale.payment_method}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sale.status === 'completed' ? 'default' : sale.status === 'refunded' ? 'destructive' : 'secondary'}
                          className="capitalize"
                        >
                          {sale.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(Number(sale.total), activeCompany?.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewSale(sale)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {sale.status === 'completed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => { setRefundSale(sale); setRefundOpen(true); }}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View sale dialog */}
      <Dialog open={!!viewSale} onOpenChange={(open) => !open && setViewSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sale #{viewSale?.sale_number}</DialogTitle>
            <DialogDescription>{viewSale && formatDateTime(viewSale.created_at)}</DialogDescription>
          </DialogHeader>
          {viewSale && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {viewSale.sale_items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span>{formatCurrency(Number(item.total), activeCompany?.currency)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{formatCurrency(Number(viewSale.subtotal), activeCompany?.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span><span>{formatCurrency(Number(viewSale.tax_amount), activeCompany?.currency)}</span>
                </div>
                {Number(viewSale.discount) > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span><span>-{formatCurrency(Number(viewSale.discount), activeCompany?.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>Total</span><span>{formatCurrency(Number(viewSale.total), activeCompany?.currency)}</span>
                </div>
              </div>
              <div className="border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground capitalize">Paid via {viewSale.payment_method}</span>
                  <span>{formatCurrency(Number(viewSale.amount_tendered), activeCompany?.currency)}</span>
                </div>
                {Number(viewSale.change_due) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Change</span><span>{formatCurrency(Number(viewSale.change_due), activeCompany?.currency)}</span>
                  </div>
                )}
              </div>
              <Badge
                variant={viewSale.status === 'completed' ? 'default' : viewSale.status === 'refunded' ? 'destructive' : 'secondary'}
                className="capitalize"
              >
                {viewSale.status}
              </Badge>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => window.print()}>Print Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>This will reverse the sale and restore stock</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Sale #{refundSale?.sale_number} — {formatCurrency(Number(refundSale?.total || 0), activeCompany?.currency)}</p>
            <p className="text-muted-foreground">The sale will be marked as refunded and stock will be restored. This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefund} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
