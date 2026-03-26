-- 018: Habilitar Realtime para tablas de billetera
-- Permite que el saldo del driver se actualice en tiempo real sin polling.
ALTER PUBLICATION supabase_realtime ADD TABLE driver_wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE recharge_requests;
