'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Loader2, Building2, Receipt, Percent } from 'lucide-react';

export default function SettingsPage() {
  const { activeCompany, refreshCompanies } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '', currency: 'USD', tax_rate: '0', receipt_footer: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    if (!activeCompany) return;
    setForm({
      name: activeCompany.name || '',
      address: activeCompany.address || '',
      phone: activeCompany.phone || '',
      email: activeCompany.email || '',
      currency: activeCompany.currency || 'USD',
      tax_rate: String(activeCompany.tax_rate || 0),
      receipt_footer: activeCompany.receipt_footer || '',
    });
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    if (!activeCompany) return;
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        currency: form.currency,
        tax_rate: parseFloat(form.tax_rate) || 0,
        receipt_footer: form.receipt_footer.trim() || null,
      })
      .eq('id', activeCompany.id);

    if (error) {
      toast({ title: 'Failed to save settings', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved' });
      await refreshCompanies();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your company profile and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Company Profile
          </CardTitle>
          <CardDescription>This information appears on receipts and reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Business name</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" /> Tax & Currency
          </CardTitle>
          <CardDescription>Set your default tax rate and currency</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="USD">USD — US Dollar ($)</option>
                <option value="EUR">EUR — Euro (€)</option>
                <option value="GBP">GBP — British Pound (£)</option>
                <option value="CAD">CAD — Canadian Dollar (C$)</option>
                <option value="AUD">AUD — Australian Dollar (A$)</option>
                <option value="JPY">JPY — Japanese Yen (¥)</option>
                <option value="INR">INR — Indian Rupee (₹)</option>
                <option value="PHP">PHP — Philippine Peso (₱)</option>
                <option value="AED">AED — UAE Dirham (د.إ)</option>
                <option value="PKR">PKR — Pakistani Rupee (Rs)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax_rate">Default tax rate (%)</Label>
              <Input id="tax_rate" type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Individual products can override this with their own tax rate.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Receipt Customization
          </CardTitle>
          <CardDescription>Add a custom footer message to your receipts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="receipt_footer">Receipt footer message</Label>
            <Textarea id="receipt_footer" value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} rows={2} placeholder="Thank you for your business!" />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !form.name.trim()} size="lg">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Changes</>}
        </Button>
      </div>
    </div>
  );
}
