-- SyncEvent se elimina junto con la lógica general de importación/exportación.
-- Nunca tuvo escritores: su único lector era `GET /api/export`, ya retirado, y la
-- tabla estaba vacía. Si más adelante se construye sincronización con la app
-- móvil, conviene modelarla partiendo de ese requisito y no de este vestigio.
DROP TABLE "SyncEvent";
