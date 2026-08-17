export type UserRole = 'owner' | 'manager' | 'cashier';

export interface Company {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  currency: string;
  tax_rate: number;
  receipt_footer: string | null;
  created_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  tax_rate: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  company_id: string;
  cashier_id: string;
  customer_id: string | null;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  status: 'completed' | 'refunded' | 'voided';
  sale_number: number | null;
  note: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface InventoryAdjustment {
  id: string;
  company_id: string;
  product_id: string;
  quantity_change: number;
  reason: string;
  user_id: string;
  created_at: string;
}

export interface SaleWithItems extends Sale {
  sale_items: SaleItem[];
  customers: Pick<Customer, 'name'> | null;
}

export interface ProductWithCategory extends Product {
  categories: Pick<Category, 'name'> | null;
}

export interface MemberWithProfile extends CompanyMember {
  profiles: { email: string } | null;
}
