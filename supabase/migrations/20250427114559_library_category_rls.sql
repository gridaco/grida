ALTER TABLE grida_library.category ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON grida_library.category FOR SELECT TO public USING (true);