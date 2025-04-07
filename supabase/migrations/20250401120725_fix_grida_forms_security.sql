------------------------------------------------------------------------------------------------------------------------

-- 
-- [FIX SECURITY] for "grida_forms.response" table
-- 


-- drop policy
DROP POLICY IF EXISTS "Enable delete" ON grida_forms.response;
DROP POLICY IF EXISTS "REMOVEME - Enable read access for all users" ON grida_forms.response;


-- revoke anon access
REVOKE ALL ON TABLE grida_forms.response FROM "anon";


-- New policy for full access based on rls_project:
CREATE POLICY "Allow all with form access"
ON grida_forms.response
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND grida_forms.rls_form(response.form_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND grida_forms.rls_form(response.form_id)
);


------------------------------------------------------------------------------------------------------------------------

-- 
-- [FIX SECURITY] for "grida_forms.response_field" table
-- 


-- drop policy
DROP POLICY IF EXISTS "REMOVEME - Enable read access for all users" ON grida_forms.response_field;
DROP POLICY IF EXISTS "REMOVEME: Enable update for all" ON grida_forms.response_field;


-- revoke anon access
REVOKE ALL ON TABLE grida_forms.response_field FROM "anon";


-- New policy for full access based on rls_project:
CREATE POLICY "Allow all with form access"
ON grida_forms.response_field
FOR ALL
USING (
  auth.uid() IS NOT NULL
  AND grida_forms.rls_form(response_field.form_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND grida_forms.rls_form(response_field.form_id)
);


------------------------------------------------------------------------------------------------------------------------

-- 
-- [FIX SECURITY] for "grida_forms.response_session" table
-- 

-- drop policy
DROP POLICY IF EXISTS "Allow insert (public)" ON grida_forms.response_session;
DROP POLICY IF EXISTS "REMOVEME: Enable read access for all users" ON grida_forms.response_session;

-- revoke anon access
REVOKE ALL ON TABLE grida_forms.response_session FROM "anon";
REVOKE ALL ON TABLE grida_forms.response_session FROM "authenticated";

-- grant read for authenticated
GRANT SELECT ON TABLE grida_forms.response_session TO "authenticated";

CREATE POLICY "Allow read with form access"
ON grida_forms.response_session
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND grida_forms.rls_form(form_id)
);
