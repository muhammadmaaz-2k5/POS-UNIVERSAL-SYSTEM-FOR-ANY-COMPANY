'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { formatDate } from '@/lib/format';
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
import { UserCog, UserPlus, Trash2, Loader2, Shield, Crown, User } from 'lucide-react';

const roleConfig = {
  owner: { label: 'Owner', icon: Crown, color: 'text-warning', bg: 'bg-warning/10' },
  manager: { label: 'Manager', icon: Shield, color: 'text-primary', bg: 'bg-primary/10' },
  cashier: { label: 'Cashier', icon: User, color: 'text-muted-foreground', bg: 'bg-muted' },
};

export default function StaffPage() {
  const { activeCompany, activeRole, user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    const { data } = await supabase
      .from('company_members')
      .select('*, profiles(email)')
      .eq('company_id', activeCompany.id)
      .order('created_at', { ascending: true });
    // profiles may not exist; fallback to auth lookup via user_id
    // We'll show user_id truncated if no email
    setMembers(data || []);
    setLoading(false);
  }, [activeCompany]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const canManage = activeRole === 'owner' || activeRole === 'manager';

  const handleInvite = async () => {
    if (!activeCompany || !inviteEmail.trim()) return;
    setSaving(true);

    // Look up user by email
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', inviteEmail.trim().toLowerCase())
      .maybeSingle();

    if (!existingUser) {
      toast({ title: 'User not found', description: 'The user must create an account first before being added as staff.', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('company_members')
      .select('id')
      .eq('company_id', activeCompany.id)
      .eq('user_id', existingUser.id)
      .maybeSingle();

    if (existing) {
      toast({ title: 'Already a member', description: 'This user is already part of your company.', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('company_members').insert({
      company_id: activeCompany.id,
      user_id: existingUser.id,
      role: inviteRole,
    });

    if (error) {
      toast({ title: 'Failed to add staff member', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff member added', description: `${existingUser.email} added as ${inviteRole}` });
      setAddOpen(false);
      setInviteEmail('');
      setInviteRole('cashier');
      loadMembers();
    }
    setSaving(false);
  };

  const handleRemove = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from your company?`)) return;
    const { error } = await supabase.from('company_members').delete().eq('id', memberId);
    if (error) { toast({ title: 'Failed to remove member', variant: 'destructive' }); return; }
    toast({ title: 'Member removed' });
    loadMembers();
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase.from('company_members').update({ role: newRole }).eq('id', memberId);
    if (error) { toast({ title: 'Failed to update role', variant: 'destructive' }); return; }
    toast({ title: 'Role updated' });
    loadMembers();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage team members and their roles</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Staff
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserCog className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No staff members</p>
              <p className="text-sm text-muted-foreground mt-1">Add staff to your company to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const role = roleConfig[member.role as keyof typeof roleConfig] || roleConfig.cashier;
                  const RoleIcon = role.icon;
                  const isSelf = member.user_id === user?.id;
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                            {(member.profiles?.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{member.profiles?.email || 'Unknown user'}</p>
                            {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManage && !isSelf ? (
                          <Select value={member.role} onValueChange={(v) => handleChangeRole(member.id, v)}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">Owner</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="cashier">Cashier</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="capitalize">
                            <RoleIcon className="h-3 w-3 mr-1" /> {role.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(member.created_at)}</TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemove(member.id, member.profiles?.email || 'this member')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add staff dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>The person must already have an account with this email</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input type="email" placeholder="staff@business.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager — manage products, inventory, staff, settings</SelectItem>
                  <SelectItem value="cashier">Cashier — process sales only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={saving || !inviteEmail.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add to Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
