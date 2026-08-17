'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import type { Product, Category, ProductWithCategory } from '@/lib/types';
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
import {
  Plus, Search, Pencil, Trash2, Package, AlertTriangle, Loader2, Tag, X,
} from 'lucide-react';

export default function ProductsPage() {
  const { activeCompany } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', price: '', cost: '', tax_rate: '',
    stock_quantity: '', low_stock_threshold: '5', category_id: 'none', image_url: '',
  });

  const loadData = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').eq('company_id', activeCompany.id).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').eq('company_id', activeCompany.id).order('name'),
    ]);
    setProducts((prodRes.data as ProductWithCategory[]) || []);
    setCategories((catRes.data as Category[]) || []);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredProducts = products.filter((p) =>
    !search.trim() ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditingProduct(null);
    setForm({
      name: '', sku: '', barcode: '', price: '', cost: '', tax_rate: '',
      stock_quantity: '', low_stock_threshold: '5', category_id: 'none', image_url: '',
    });
    setEditOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      price: String(product.price),
      cost: String(product.cost),
      tax_rate: String(product.tax_rate),
      stock_quantity: String(product.stock_quantity),
      low_stock_threshold: String(product.low_stock_threshold),
      category_id: product.category_id || 'none',
      image_url: product.image_url || '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!activeCompany || !form.name.trim() || !form.price) return;
    setSaving(true);

    const payload = {
      company_id: activeCompany.id,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      tax_rate: parseFloat(form.tax_rate) || 0,
      stock_quantity: parseFloat(form.stock_quantity) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      category_id: form.category_id === 'none' ? null : form.category_id,
      image_url: form.image_url.trim() || null,
    };

    if (editingProduct) {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
      if (error) toast({ title: 'Failed to update product', variant: 'destructive' });
      else toast({ title: 'Product updated' });
    } else {
      const { error } = await supabase.from('products').insert(payload);
      if (error) toast({ title: 'Failed to create product', variant: 'destructive' });
      else toast({ title: 'Product created' });
    }

    setSaving(false);
    setEditOpen(false);
    loadData();
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) toast({ title: 'Failed to delete product', variant: 'destructive' });
    else { toast({ title: 'Product deleted' }); loadData(); }
  };

  const handleAddCategory = async () => {
    if (!activeCompany || !newCategoryName.trim()) return;
    const { error } = await supabase.from('categories').insert({
      company_id: activeCompany.id,
      name: newCategoryName.trim(),
    });
    if (error) { toast({ title: 'Failed to add category', variant: 'destructive' }); return; }
    setNewCategoryName('');
    setCategoryOpen(false);
    toast({ title: 'Category added' });
    loadData();
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"? Products in this category will be uncategorized.`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    if (error) { toast({ title: 'Failed to delete category', variant: 'destructive' }); return; }
    toast({ title: 'Category deleted' });
    loadData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your product catalog and categories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryOpen(true)}>
            <Tag className="h-4 w-4 mr-2" /> Categories
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Add Product
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No products yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first product to start selling.</p>
              <Button className="mt-4" onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Add Product
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const lowStock = product.stock_quantity <= product.low_stock_threshold;
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        {product.categories?.name ? (
                          <Badge variant="secondary">{product.categories.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{product.sku || '—'}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(product.price, activeCompany?.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center gap-1 ${lowStock ? 'text-destructive font-medium' : ''}`}>
                          {lowStock && <AlertTriangle className="h-3.5 w-3.5" />}
                          {product.stock_quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(product)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(product)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Product edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update product details' : 'Create a new product for your catalog'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Product name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Price *</Label>
              <Input id="price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost</Label>
              <Input id="cost" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax_rate">Tax rate (%)</Label>
              <Input id="tax_rate" type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock_quantity">Stock quantity</Label>
              <Input id="stock_quantity" type="number" step="0.001" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="low_stock_threshold">Low stock alert at</Label>
              <Input id="low_stock_threshold" type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="image_url">Image URL (optional)</Label>
              <Input id="image_url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.price}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category dialog */}
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Categories</DialogTitle>
            <DialogDescription>Organize your products into categories</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <Button onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
              ) : (
                categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between rounded-md border p-2.5">
                    <span className="text-sm font-medium">{cat.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteCategory(cat)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
