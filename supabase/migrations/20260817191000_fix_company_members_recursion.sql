/*
# Fix Infinite Recursion in RLS Policies

The original RLS policies for `company_members` had an infinite recursion issue because 
evaluating the policy required selecting from `company_members`, which triggered the policy again.

We fix this by using `SECURITY DEFINER` functions to safely check user memberships 
without triggering RLS in a loop.
*/

-- 1. Function to get user's companies securely (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION get_user_companies()
RETURNS SETOF uuid AS $$
BEGIN
  RETURN QUERY SELECT company_id FROM public.company_members WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Function to check if user has a specific role
CREATE OR REPLACE FUNCTION has_company_role(check_company_id uuid, required_role text)
RETURNS boolean AS $$
DECLARE
  has_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.company_members 
    WHERE company_id = check_company_id 
    AND user_id = auth.uid() 
    AND role = required_role
  ) INTO has_role;
  RETURN has_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Function to check if user has one of multiple roles
CREATE OR REPLACE FUNCTION has_company_role_in_list(check_company_id uuid, required_roles text[])
RETURNS boolean AS $$
DECLARE
  has_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.company_members 
    WHERE company_id = check_company_id 
    AND user_id = auth.uid() 
    AND role = ANY(required_roles)
  ) INTO has_role;
  RETURN has_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============ REPLACE COMPANY MEMBERS POLICIES ============

DROP POLICY IF EXISTS "select_own_memberships" ON company_members;
CREATE POLICY "select_own_memberships" ON company_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR company_id IN (SELECT get_user_companies())
  );

DROP POLICY IF EXISTS "insert_own_memberships" ON company_members;
CREATE POLICY "insert_own_memberships" ON company_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() OR has_company_role_in_list(company_id, ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "update_own_memberships" ON company_members;
CREATE POLICY "update_own_memberships" ON company_members FOR UPDATE
  TO authenticated USING (
    has_company_role(company_id, 'owner')
  ) WITH CHECK (
    has_company_role(company_id, 'owner')
  );

DROP POLICY IF EXISTS "delete_own_memberships" ON company_members;
CREATE POLICY "delete_own_memberships" ON company_members FOR DELETE
  TO authenticated USING (
    has_company_role(company_id, 'owner')
  );


-- ============ REPLACE OTHER POLICIES THAT CAUSE RECURSION ============

-- Update companies table policies to use the secure functions
DROP POLICY IF EXISTS "select_own_companies" ON companies;
CREATE POLICY "select_own_companies" ON companies FOR SELECT
  TO authenticated USING (
    id IN (SELECT get_user_companies())
  );

DROP POLICY IF EXISTS "update_own_companies" ON companies;
CREATE POLICY "update_own_companies" ON companies FOR UPDATE
  TO authenticated USING (
    has_company_role_in_list(id, ARRAY['owner', 'manager'])
  ) WITH CHECK (
    has_company_role_in_list(id, ARRAY['owner', 'manager'])
  );

