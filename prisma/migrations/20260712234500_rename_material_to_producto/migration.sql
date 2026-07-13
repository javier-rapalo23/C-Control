-- RenameTable
ALTER TABLE "Material" RENAME TO "Producto";
ALTER TABLE "MaterialCarga" RENAME TO "ProductoCarga";

-- RenameColumn
ALTER TABLE "ProductoCarga" RENAME COLUMN "materialId" TO "productoId";
ALTER TABLE "ProductoCarga" RENAME COLUMN "materialNombre" TO "productoNombre";
ALTER TABLE "Purchase" RENAME COLUMN "materialId" TO "productoId";
ALTER TABLE "Purchase" RENAME COLUMN "materialNombre" TO "productoNombre";
