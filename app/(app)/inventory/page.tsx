'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Boxes, Search, AlertTriangle, TrendingUp, TrendingDown, Plus, Minus, History, Loader2 } from 'lucide-react';

export default function InventoryPage() {
  const { activeCompany, user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('restock');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const [prodRes, adjRes] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', activeCompany.id).order('name'),
      supabase
        .from('inventory_adjustments')
        .select('*, products(name)')
        .eq('company_id', activeCompany.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setProducts((prodRes.data as Product[]) || []);
    setAdjustments(adjRes.data || []);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = products.filter((p) => {
    if (!search.trim() || p.name.toLowerCase().includes(search.toLowerCase())) {
      if (filter === 'low') return p.stock_quantity <= p.low_stock_threshold && p.stock_quantity > 0;
      if (filter === 'out') return p.stock_quantity <= 0;
      return true;
    }
    return false;
  });

  const totalValue = products.reduce((sum, p) => sum + p.cost * p.stock_quantity, 0);
  const lowStockCount = products.filter((p) => p.stock_quantity <= p.low_stock_threshold && p.stock_quantity > 0).length;
  const outOfStockCount = products.filter((p) => p.stock_quantity <= 0).length;

  const openAdjust = (product: Product) => {
    setAdjustProduct(product);
    setAdjustQty('');
    setAdjustReason('restock');
    setAdjustOpen(true);
  };

  const handleAdjust = async () => {
    if (!activeCompany || !user || !adjustProduct || !adjustQty) return;
    setSaving(true);
    const qty = parseFloat(adjustQty);
    const change = adjustReason === 'correction' || adjustReason === 'damaged' || adjustReason === 'loss' ? -Math.abs(qty) : Math.abs(qty);

    const { error: adjError } = await supabase.from('inventory_adjustments').insert({
      company_id: activeCompany.id,
      product_id: adjustProduct.id,
      quantity_change: change,
      reason: adjustReason,
      user_id: user.id,
    });

    if (adjError) { toast({ title: 'Failed to record adjustment', variant: 'destructive' }); setSaving(false); return; }

    const { error: prodError } = await supabase
      .from('products')
      .update({ stock_quantity: Math.max(0, adjustProduct.stock_quantity + change) })
      .eq('id', adjustProduct.id);

    if (prodError) { toast({ title: 'Failed to update stock', variant: 'destructive' }); setSaving(false); return; }

    toast({ title: 'Stock adjusted', description: `${adjustProduct.name}: ${change > 0 ? '+' : ''}${change}` });
    setSaving(false);
    setAdjustOpen(false);
    loadData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-1">Track stock levels and make adjustments</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Inventory Value</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalValue, activeCompany?.currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">At cost price</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Boxes className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-bold mt-1 text-warning">{lowStockCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Need restocking soon</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Out of Stock</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{outOfStockCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Cannot be sold</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Boxes className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filter.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => {
                  const lowStock = product.stock_quantity <= product.low_stock_threshold;
                  const outOfStock = product.stock_quantity <= 0;
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-right font-medium">{product.stock_quantity}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(product.cost, activeCompany?.currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.cost * product.stock_quantity, activeCompany?.currency)}</TableCell>
                      <TableCell>
                        {outOfStock ? (
                          <Badge variant="destructive">Out of stock</Badge>
                        ) : lowStock ? (
                          <Badge className="bg-warning text-warning-foreground">Low stock</Badge>
                        ) : (
                          <Badge variant="secondary">In stock</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openAdjust(product)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent adjustments */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Recent Stock Adjustments</h3>
          </div>
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No adjustments recorded yet</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((adj) => (
                <div key={adj.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${adj.quantity_change > 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
                      {adj.quantity_change > 0 ? (
                        <TrendingUp className="h-4 w-4 text-success" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{adj.products?.name || 'Unknown product'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{adj.reason} — {formatDateTime(adj.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${adj.quantity_change > 0 ? 'text-success' : 'text-destructive'}`}>
                    {adj.quantity_change > 0 ? '+' : ''}{adj.quantity_change}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>{adjustProduct?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              Current stock: <span className="font-bold">{adjustProduct?.stock_quantity}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={adjustReason} onValueChange={setAdjustReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="restock">Restock (add)</SelectItem>
                  <SelectItem value="correction">Correction (remove)</SelectItem>
                  <SelectItem value="damaged">Damaged (remove)</SelectItem>
                  <SelectItem value="loss">Loss (remove)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" type="number" step="0.001" placeholder="0" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={saving || !adjustQty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
