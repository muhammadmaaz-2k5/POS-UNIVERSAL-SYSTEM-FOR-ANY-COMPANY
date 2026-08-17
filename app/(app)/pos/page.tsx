'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import type { Product, Category, Customer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard,
  Banknote, Wallet, X, ScanLine, UserPlus, Receipt as ReceiptIcon, Loader2, CheckCircle2,
} from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
}

export default function PosTerminalPage() {
  const { activeCompany, user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [discount, setDiscount] = useState('0');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    (async () => {
      const [prodRes, catRes, custRes] = await Promise.all([
        supabase.from('products').select('*').eq('company_id', activeCompany.id).eq('is_active', true).order('name'),
        supabase.from('categories').select('*').eq('company_id', activeCompany.id).order('name'),
        supabase.from('customers').select('*').eq('company_id', activeCompany.id).order('name'),
      ]);
      setProducts((prodRes.data as Product[]) || []);
      setCategories((catRes.data as Category[]) || []);
      setCustomers((custRes.data as Customer[]) || []);
      setLoading(false);
    })();
  }, [activeCompany]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeCategory !== 'all') {
      result = result.filter((p) => p.category_id === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, activeCategory, search]);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const setQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: qty } : item
        )
      );
    }
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId(null);
    setDiscount('0');
  };

  const subtotal = useMemo(() =>
    cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [cart]);

  const taxAmount = useMemo(() =>
    cart.reduce((sum, item) => {
      const taxRate = item.product.tax_rate || activeCompany?.tax_rate || 0;
      return sum + (item.product.price * item.quantity * taxRate) / 100;
    }, 0), [cart, activeCompany]);

  const discountAmount = useMemo(() => {
    const d = parseFloat(discount) || 0;
    return Math.min(d, subtotal + taxAmount);
  }, [discount, subtotal, taxAmount]);

  const total = Math.max(0, subtotal + taxAmount - discountAmount);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const product = products.find((p) => p.barcode === barcodeInput.trim());
    if (product) {
      addToCart(product);
      setBarcodeInput('');
    } else {
      toast({ title: 'Product not found', description: `No product with barcode ${barcodeInput}`, variant: 'destructive' });
    }
  };

  const handleAddCustomer = async () => {
    if (!activeCompany || !newCustomerName.trim()) return;
    const { data, error } = await supabase
      .from('customers')
      .insert({ company_id: activeCompany.id, name: newCustomerName, phone: newCustomerPhone || null })
      .select()
      .single();
    if (error) {
      toast({ title: 'Failed to add customer', variant: 'destructive' });
      return;
    }
    setCustomers((prev) => [...prev, data]);
    setSelectedCustomerId(data.id);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerOpen(false);
    toast({ title: 'Customer added' });
  };

  const completeSale = async () => {
    if (!activeCompany || !user || cart.length === 0) return;
    setProcessing(true);

    const tendered = paymentMethod === 'cash' ? (parseFloat(amountTendered) || 0) : total;
    const change = paymentMethod === 'cash' ? Math.max(0, tendered - total) : 0;

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        company_id: activeCompany.id,
        cashier_id: user.id,
        customer_id: selectedCustomerId,
        subtotal: Math.round(subtotal * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        discount: Math.round(discountAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        payment_method: paymentMethod,
        amount_tendered: tendered,
        change_due: change,
        status: 'completed',
      })
      .select()
      .single();

    if (saleError || !sale) {
      toast({ title: 'Failed to process sale', description: saleError?.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    const saleItems = cart.map((item) => ({
      sale_id: sale.id,
      product_id: item.product.id,
      name: item.product.name,
      quantity: item.quantity,
      unit_price: item.product.price,
      total: Math.round(item.product.price * item.quantity * 100) / 100,
    }));

    const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);

    if (itemsError) {
      toast({ title: 'Sale recorded but items failed', variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // Decrement stock
    for (const item of cart) {
      await supabase
        .from('products')
        .update({ stock_quantity: Math.max(0, item.product.stock_quantity - item.quantity) })
        .eq('id', item.product.id);
    }

    // Fetch the complete receipt
    const { data: fullSale } = await supabase
      .from('sales')
      .select(`
        *, sale_items(*), customers(name, email)
      `)
      .eq('id', sale.id)
      .single();

    setReceipt(fullSale);
    setPaymentOpen(false);
    setProcessing(false);
    clearCart();
    setAmountTendered('');
    setPaymentMethod('cash');
  };

  const changeDue = paymentMethod === 'cash'
    ? Math.max(0, (parseFloat(amountTendered) || 0) - total)
    : 0;

  const canComplete = paymentMethod !== 'cash' || (parseFloat(amountTendered) || 0) >= total;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      {/* Product selection side */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="space-y-3 mb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products by name, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Scan barcode"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="pl-9 w-40"
                />
              </div>
            </form>
          </div>

          {/* Category filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
            <Button
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory('all')}
              className="shrink-0"
            >
              All Products
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
                className="shrink-0"
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredProducts.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground py-20">
              {products.length === 0
                ? 'No products yet. Add products from the Products page.'
                : 'No products match your search.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="group flex flex-col rounded-lg border bg-card p-3 text-left hover:border-primary hover:shadow-md transition-all"
                >
                  <div className="mb-2 flex aspect-square items-center justify-center rounded-md bg-muted overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <p className="text-sm font-medium line-clamp-2 leading-tight">{product.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">
                      {formatCurrency(product.price, activeCompany?.currency)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {product.stock_quantity} in stock
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart side */}
      <Card className="lg:w-[400px] flex flex-col h-full">
        <CardContent className="flex flex-col h-full p-4">
          {/* Cart header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Current Sale</h2>
              {cart.length > 0 && (
                <Badge variant="secondary">{cart.reduce((s, i) => s + i.quantity, 0)} items</Badge>
              )}
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Customer selector */}
          <div className="flex gap-2 mb-3">
            <Select
              value={selectedCustomerId || 'none'}
              onValueChange={(v) => setSelectedCustomerId(v === 'none' ? null : v)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Walk-in customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Walk-in customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => setNewCustomerOpen(true)}>
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>

          <Separator className="mb-2" />

          {/* Cart items */}
          <ScrollArea className="flex-1 min-h-0">
            {cart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center py-10">
                <div>
                  <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Tap a product to start a sale</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.product.price, activeCompany?.currency)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.product.id, parseInt(e.target.value) || 0)}
                        className="w-12 h-7 text-center px-1"
                      />
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-semibold w-16 text-right">
                      {formatCurrency(item.product.price * item.quantity, activeCompany?.currency)}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.product.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Totals */}
          {cart.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Discount amount"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatCurrency(discountAmount, activeCompany?.currency)} off
                </span>
              </div>
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal, activeCompany?.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">{formatCurrency(taxAmount, activeCompany?.currency)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount, activeCompany?.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5">
                  <span className="font-semibold text-base">Total</span>
                  <span className="font-bold text-lg text-primary">
                    {formatCurrency(total, activeCompany?.currency)}
                  </span>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full text-base"
                onClick={() => setPaymentOpen(true)}
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Charge {formatCurrency(total, activeCompany?.currency)}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>Total: {formatCurrency(total, activeCompany?.currency)}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Payment method</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash', label: 'Cash', icon: Banknote },
                  { value: 'card', label: 'Card', icon: CreditCard },
                  { value: 'other', label: 'Other', icon: Wallet },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setPaymentMethod(m.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
                        paymentMethod === m.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-sm font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Amount tendered</p>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2 flex-wrap">
                  {[total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20].map((amt, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmountTendered(amt.toFixed(2))}
                    >
                      {formatCurrency(amt, activeCompany?.currency)}
                    </Button>
                  ))}
                </div>
                {parseFloat(amountTendered) > 0 && (
                  <div className="flex justify-between rounded-md bg-muted p-3">
                    <span className="text-sm font-medium">Change due</span>
                    <span className="text-sm font-bold text-success">
                      {formatCurrency(changeDue, activeCompany?.currency)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {paymentMethod !== 'cash' && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Mark payment as received via {paymentMethod}. No change calculation needed.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={completeSale} disabled={processing || !canComplete}>
              {processing ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Complete Sale</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New customer dialog */}
      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
            <DialogDescription>Create a new customer for this sale</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone (optional)</label>
              <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer} disabled={!newCustomerName.trim()}>Add Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5 text-primary" />
              Sale Complete
            </DialogTitle>
            <DialogDescription>Receipt #{receipt?.sale_number}</DialogDescription>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3">
              <div className="text-center pb-3 border-b">
                <p className="font-bold text-lg">{activeCompany?.name}</p>
                {activeCompany?.address && <p className="text-xs text-muted-foreground">{activeCompany.address}</p>}
                {activeCompany?.phone && <p className="text-xs text-muted-foreground">{activeCompany.phone}</p>}
              </div>
              <div className="text-xs text-muted-foreground text-center">
                {new Date(receipt.created_at).toLocaleString()}
              </div>
              <Separator />
              <div className="space-y-1.5">
                {receipt.sale_items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span>{formatCurrency(Number(item.total), activeCompany?.currency)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{formatCurrency(Number(receipt.subtotal), activeCompany?.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span><span>{formatCurrency(Number(receipt.tax_amount), activeCompany?.currency)}</span>
                </div>
                {Number(receipt.discount) > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span><span>-{formatCurrency(Number(receipt.discount), activeCompany?.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>Total</span><span>{formatCurrency(Number(receipt.total), activeCompany?.currency)}</span>
                </div>
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span className="capitalize">{receipt.payment_method}</span>
                  <span>{formatCurrency(Number(receipt.amount_tendered), activeCompany?.currency)}</span>
                </div>
                {Number(receipt.change_due) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Change</span><span>{formatCurrency(Number(receipt.change_due), activeCompany?.currency)}</span>
                  </div>
                )}
              </div>
              {activeCompany?.receipt_footer && (
                <>
                  <Separator />
                  <p className="text-center text-xs text-muted-foreground">{activeCompany.receipt_footer}</p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
            <Button onClick={() => setReceipt(null)}>New Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
