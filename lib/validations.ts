import { z } from 'zod';

const businessDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'businessDate must use YYYY-MM-DD',
});

export const createProductoSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  precioPorLibra: z.number().positive(),
});

export const createClientSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().trim().min(2).max(50).optional(),
  direccion: z.string().trim().min(2).max(250).optional(),
  rtn: z.string().trim().min(2).max(50).optional(),
  cuentaBancaria: z.string().trim().min(2).max(120).optional(),
  notas: z.string().trim().max(500).optional(),
});

export const setInitialBalanceSchema = z.object({
  businessDate: businessDateField,
  saldoInicial: z.number(),
});

export const createPurchaseSchema = z.object({
  businessDate: businessDateField,
  productoId: z.string().min(1),
  libras: z.number().positive(),
  precioPorLibra: z.number().positive().optional(),
});

export const createPurchaseLineSchema = z.object({
  productoId: z.string().min(1),
  libras: z.number().positive(),
  precioPorLibra: z.number().positive().optional(),
});

export const createPurchaseTransactionSchema = z.object({
  businessDate: businessDateField,
  clientId: z.string().min(1),
  items: z.array(createPurchaseLineSchema).min(1),
});

export const createSaleSchema = z.object({
  businessDate: businessDateField,
  descripcion: z.string().trim().min(2).max(250),
  monto: z.number().positive(),
});

export const createExpenseSchema = z.object({
  businessDate: businessDateField,
  categoria: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().min(2).max(250),
  monto: z.number().positive(),
});

export const updateProductoSchema = createProductoSchema.partial();

export const updateClientSchema = createClientSchema.partial();

export const companySettingsSchema = z.object({
  nombre: z.string().trim().max(200).optional(),
  rtn: z.string().trim().max(50).optional(),
  telefono: z.string().trim().max(50).optional(),
  direccion: z.string().trim().max(300).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal('')),
  printerIp: z.string().trim().max(100).optional().or(z.literal('')),
  printerPort: z.number().int().min(1).max(65535).optional(),
});

export const createUserSchema = z.object({
  userId: z.string().trim().min(2).max(60),
  nombre: z.string().trim().max(120).optional(),
  password: z.string().min(4).max(100),
  role: z.enum(['viewer', 'editor', 'admin', 'comprador']),
});

export const updateUserSchema = z.object({
  nombre: z.string().trim().max(120).optional(),
  password: z.string().min(4).max(100).optional(),
  role: z.enum(['viewer', 'editor', 'admin', 'comprador']).optional(),
  activo: z.boolean().optional(),
});