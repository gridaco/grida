-- Function: rls_via_customer
-- Purpose: Row-Level Security helper function to determine if the authenticated user
--          has access to operate on a specific customer (by customer UID).
-- Returns: TRUE if the current user (auth.uid()) is linked to the customer (via user_id),
--          FALSE otherwise.
-- Notes:
--   - This function returns false if the customer.user_id is null.
--   - Designed to be used in RLS policies to restrict access to resources
--     that are scoped to specific customers.
CREATE OR REPLACE FUNCTION public.rls_via_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.customer c
        WHERE c.uid = p_customer_id
          AND c.user_id IS NOT NULL
          AND c.user_id = auth.uid()
    );
END;
$$;