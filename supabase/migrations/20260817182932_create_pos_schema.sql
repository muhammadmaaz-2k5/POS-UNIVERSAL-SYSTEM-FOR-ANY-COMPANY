/*
# POS System - Core Database Schema

## Overview
Creates the complete schema for a professional multi-company Point of Sale (POS) system.
Each company (tenant) has its own products, categories, customers, sales, and staff,
fully isolated by row-level security. Users can belong to one or more companies with
different roles (owner, manager, cashier).

## New Tables
1. companies - Each business/tenant
2. company_members - Maps users to companies with a role
3. categories - Product groupings per company
4. products - Items sold at the register
5. customers - Customer directory per company
6. sales - Header record for each transaction
7. sale_items - Line items belonging to a sale
8. inventory_adjustments - Log of manual stock changes

## Security
- RLS enabled on every table.
- All access scoped to authenticated users who are members of the owning company.
- Policies check membership via company_members table.

## Important Notes
1. All tables created first, then policies added (avoids forward-reference errors).
2. cashier_id on sales defaults to auth.uid().
3. sale_number is per-company sequential via trigger.
*/

-- ============ COMPANIES ============
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  logo_url text,
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  receipt_footer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ COMPANY MEMBERS ============
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner','manager','cashier')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

-- ============ CATEGORIES ============
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ PRODUCTS ============
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text,
  barcode text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  stock_quantity numeric(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CUSTOMERS ============
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ SALES ============
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cashier_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  amount_tendered numeric(12,2) NOT NULL DEFAULT 0,
  change_due numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','voided')),
  sale_number integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ SALE ITEMS ============
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0
);

-- ============ INVENTORY ADJUSTMENTS ============
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_change numeric(12,3) NOT NULL,
  reason text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ ENABLE RLS ON ALL TABLES ============
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES: COMPANIES ============
DROP POLICY IF EXISTS "select_own_companies" ON companies;
CREATE POLICY "select_own_companies" ON companies FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = companies.id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_companies" ON companies;
CREATE POLICY "insert_own_companies" ON companies FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_companies" ON companies;
CREATE POLICY "update_own_companies" ON companies FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = companies.id AND company_members.user_id = auth.uid() AND company_members.role IN ('owner','manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = companies.id AND company_members.user_id = auth.uid() AND company_members.role IN ('owner','manager'))
  );

-- ============ POLICIES: COMPANY MEMBERS ============
DROP POLICY IF EXISTS "select_own_memberships" ON company_members;
CREATE POLICY "select_own_memberships" ON company_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_memberships" ON company_members;
CREATE POLICY "insert_own_memberships" ON company_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','manager'))
  );

DROP POLICY IF EXISTS "update_own_memberships" ON company_members;
CREATE POLICY "update_own_memberships" ON company_members FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role = 'owner')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role = 'owner')
  );

DROP POLICY IF EXISTS "delete_own_memberships" ON company_members;
CREATE POLICY "delete_own_memberships" ON company_members FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role = 'owner')
  );

-- ============ POLICIES: CATEGORIES ============
DROP POLICY IF EXISTS "select_company_categories" ON categories;
CREATE POLICY "select_company_categories" ON categories FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = categories.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_company_categories" ON categories;
CREATE POLICY "insert_company_categories" ON categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = categories.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_company_categories" ON categories;
CREATE POLICY "update_company_categories" ON categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = categories.company_id AND company_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = categories.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_company_categories" ON categories;
CREATE POLICY "delete_company_categories" ON categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = categories.company_id AND company_members.user_id = auth.uid())
  );

-- ============ POLICIES: PRODUCTS ============
DROP POLICY IF EXISTS "select_company_products" ON products;
CREATE POLICY "select_company_products" ON products FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = products.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_company_products" ON products;
CREATE POLICY "insert_company_products" ON products FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = products.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_company_products" ON products;
CREATE POLICY "update_company_products" ON products FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = products.company_id AND company_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = products.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_company_products" ON products;
CREATE POLICY "delete_company_products" ON products FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = products.company_id AND company_members.user_id = auth.uid())
  );

-- ============ POLICIES: CUSTOMERS ============
DROP POLICY IF EXISTS "select_company_customers" ON customers;
CREATE POLICY "select_company_customers" ON customers FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = customers.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_company_customers" ON customers;
CREATE POLICY "insert_company_customers" ON customers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = customers.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_company_customers" ON customers;
CREATE POLICY "update_company_customers" ON customers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = customers.company_id AND company_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = customers.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_company_customers" ON customers;
CREATE POLICY "delete_company_customers" ON customers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = customers.company_id AND company_members.user_id = auth.uid())
  );

-- ============ POLICIES: SALES ============
DROP POLICY IF EXISTS "select_company_sales" ON sales;
CREATE POLICY "select_company_sales" ON sales FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = sales.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_company_sales" ON sales;
CREATE POLICY "insert_company_sales" ON sales FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = sales.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_company_sales" ON sales;
CREATE POLICY "update_company_sales" ON sales FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = sales.company_id AND company_members.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = sales.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_company_sales" ON sales;
CREATE POLICY "delete_company_sales" ON sales FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = sales.company_id AND company_members.user_id = auth.uid())
  );

-- ============ POLICIES: SALE ITEMS ============
DROP POLICY IF EXISTS "select_company_sale_items" ON sale_items;
CREATE POLICY "select_company_sale_items" ON sale_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sales
      JOIN company_members ON company_members.company_id = sales.company_id
      WHERE sales.id = sale_items.sale_id AND company_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_company_sale_items" ON sale_items;
CREATE POLICY "insert_company_sale_items" ON sale_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      JOIN company_members ON company_members.company_id = sales.company_id
      WHERE sales.id = sale_items.sale_id AND company_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_company_sale_items" ON sale_items;
CREATE POLICY "update_company_sale_items" ON sale_items FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sales
      JOIN company_members ON company_members.company_id = sales.company_id
      WHERE sales.id = sale_items.sale_id AND company_members.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      JOIN company_members ON company_members.company_id = sales.company_id
      WHERE sales.id = sale_items.sale_id AND company_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_company_sale_items" ON sale_items;
CREATE POLICY "delete_company_sale_items" ON sale_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM sales
      JOIN company_members ON company_members.company_id = sales.company_id
      WHERE sales.id = sale_items.sale_id AND company_members.user_id = auth.uid()
    )
  );

-- ============ POLICIES: INVENTORY ADJUSTMENTS ============
DROP POLICY IF EXISTS "select_company_adjustments" ON inventory_adjustments;
CREATE POLICY "select_company_adjustments" ON inventory_adjustments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = inventory_adjustments.company_id AND company_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_company_adjustments" ON inventory_adjustments;
CREATE POLICY "insert_company_adjustments" ON inventory_adjustments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM company_members WHERE company_members.company_id = inventory_adjustments.company_id AND company_members.user_id = auth.uid())
  );

-- ============ SALE NUMBER SEQUENCE ============
CREATE OR REPLACE FUNCTION assign_sale_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(sale_number), 0) + 1 INTO next_num
  FROM sales WHERE company_id = NEW.company_id;
  NEW.sale_number := next_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_assign_sale_number ON sales;
CREATE TRIGGER trg_assign_sale_number
  BEFORE INSERT ON sales
  FOR EACH ROW EXECUTE FUNCTION assign_sale_number();

-- ============ UPDATED_AT TRIGGER FOR PRODUCTS ============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_company ON sales(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_categories_company ON categories(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product ON inventory_adjustments(product_id);