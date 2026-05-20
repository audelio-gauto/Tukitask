-- Migration 071: RLS para negociaciones del TukiBot
-- Permite que cada vendedor autenticado vea solo sus negociaciones.

ALTER TABLE tukibot_negotiations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tukibot_negotiations_select_own ON tukibot_negotiations;
CREATE POLICY tukibot_negotiations_select_own
ON tukibot_negotiations
FOR SELECT
TO authenticated
USING (vendor_id = auth.uid()::text);

-- Escritura permanece reservada al backend (service_role),
-- no se habilitan policies de INSERT/UPDATE para clientes.
