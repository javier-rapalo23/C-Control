-- Diferencia del arqueo de caja, incorporada a la ecuación del saldo diario:
--
--   saldoActual = saldoInicial + ventas - compras - gastos + ajusteCaja
--
-- Con DEFAULT 0 las fechas ya registradas conservan exactamente su saldo: solo
-- cambia el de las fechas que se cierren con un conteo distinto al esperado.
ALTER TABLE "DailyBalance" ADD COLUMN "ajusteCaja" DECIMAL(12,2) NOT NULL DEFAULT 0;
