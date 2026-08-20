import { z } from 'zod';

const businessDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'businessDate must use YYYY-MM-DD',
});

export const createSucursalSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  direccion: z.string().trim().min(2).max(250).optional(),
  activo: z.boolean().optional(),
});

export const updateSucursalSchema = createSucursalSchema.partial();

export const productoCategoriaSchema = z.enum(['uva', 'pergamino']);

export const createProductoSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  categoria: productoCategoriaSchema.nullable().optional(),
  precioPorLibra: z.number().positive(),
  taraPorSaco: z.number().min(0).optional(),
  factorConversionOro: z.number().positive().optional(),
});

export const createClientSchema = z.object({
  nombres: z.string().trim().min(2).max(120),
  apellidos: z.string().trim().min(2).max(120),
  claveIhcafe: z.string().trim().min(2).max(30).optional(),
  telefono: z.string().trim().min(2).max(50).optional(),
  direccion: z.string().trim().min(2).max(250).optional(),
  rtn: z.string().trim().min(2).max(50).optional(),
  cuentaBancaria: z.string().trim().min(2).max(120).optional(),
  notas: z.string().trim().max(500).optional(),
});

export const createClienteOriginalSchema = z.object({
  nombres: z.string().trim().min(2).max(120),
  apellidos: z.string().trim().min(2).max(120),
  claveIhcafe: z.string().trim().min(2).max(30),
});

export const updateClienteOriginalSchema = createClienteOriginalSchema.partial();

export const setInitialBalanceSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  saldoInicial: z.number(),
});

export const createPurchaseSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  productoId: z.string().min(1),
  libras: z.number().positive(),
  precioPorLibra: z.number().positive().optional(),
});

export const createPurchaseLineSchema = z
  .object({
    productoId: z.string().min(1),
    precioPorLibra: z.number().positive().optional(),
    libras: z.number().positive().optional(),
    pesoBruto: z.number().positive().optional(),
    numeroSacos: z.number().int().min(0).optional(),
    taraPorSaco: z.number().min(0).optional(),
  })
  .refine((data) => data.libras !== undefined || data.pesoBruto !== undefined, {
    message: 'Debe indicar libras o peso bruto',
  });

export const createPurchaseTransactionSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  items: z.array(createPurchaseLineSchema).min(1),
});

export const createSaleSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  descripcion: z.string().trim().min(2).max(250),
  monto: z.number().positive(),
});

export const createSaleLineSchema = z
  .object({
    productoId: z.string().min(1),
    libras: z.number().positive(),
    precioPorLibra: z.number().positive().optional(),
    porcentajeOro: z.number().positive().max(99.9999).optional(),
    precioPorQuintalOro: z.number().positive().optional(),
  })
  .refine((data) => data.precioPorQuintalOro === undefined || data.porcentajeOro !== undefined, {
    message: 'porcentajeOro es requerido cuando se especifica precioPorQuintalOro',
  });

export const createSaleTransactionSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  items: z.array(createSaleLineSchema).min(1),
});

export const createExpenseSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
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
  // El login recorta la contraseña recibida, así que se recorta también al guardarla:
  // un espacio accidental produciría un hash que ya nunca se podría reproducir.
  password: z.string().trim().min(4).max(100),
  role: z.enum(['viewer', 'editor', 'admin', 'comprador']),
});

export const updateUserSchema = z.object({
  nombre: z.string().trim().max(120).optional(),
  password: z.string().trim().min(4).max(100).optional(),
  role: z.enum(['viewer', 'editor', 'admin', 'comprador']).optional(),
  activo: z.boolean().optional(),
});

export const createEmployeeSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  puesto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(50).optional(),
  salario: z.number().positive().optional(),
  fechaIngreso: businessDateField.optional(),
  activo: z.boolean().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const createEmployeePaymentSchema = z.object({
  businessDate: businessDateField,
  employeeId: z.string().min(1),
  concepto: z.string().trim().min(2).max(120),
  monto: z.number().positive(),
});

const timeField = z.string().regex(/^\d{2}:\d{2}$/, { message: 'time must use HH:MM' });

export const createAttendanceSchema = z.object({
  businessDate: businessDateField,
  employeeId: z.string().min(1),
  horaEntrada: timeField.optional(),
  horaSalida: timeField.optional(),
  notas: z.string().trim().max(250).optional(),
});

export const updateAttendanceSchema = z.object({
  horaEntrada: timeField.optional(),
  horaSalida: timeField.optional(),
  notas: z.string().trim().max(250).optional(),
});

export const createEmployeeAdvanceSchema = z.object({
  businessDate: businessDateField,
  employeeId: z.string().min(1),
  monto: z.number().positive(),
  motivo: z.string().trim().max(250).optional(),
});

export const updateModuleAccessSchema = z.object({
  modules: z.array(
    z.object({
      moduleKey: z.string().min(1),
      roles: z.array(z.enum(['editor', 'viewer', 'comprador'])),
    }),
  ),
});