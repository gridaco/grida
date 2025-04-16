
---------------------------------------------------------------------
-- [Prevents direct delete of the subdocument (add this as trigger)] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_orphan_document_subtype()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document WHERE id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot delete document subtype directly. Delete the associated document instead.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;


---------------------------------------------------------------------
-- [prevent orphan : grida_west_referral.campaign] --
---------------------------------------------------------------------
CREATE TRIGGER trg_prevent_orphan_document_subtype BEFORE DELETE ON grida_west_referral.campaign FOR EACH ROW EXECUTE FUNCTION public.prevent_orphan_document_subtype();