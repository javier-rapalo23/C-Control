import { z } from 'zod';
import { BANK_EXPENSE_CATEGORY, MANUAL_EXPENSE_CATEGORIA_VALUES } from '@/lib/expenses';
import { PAYMENT_METHOD_ENUM_VALUES } from '@/lib/payment-methods';

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
  // Opcional para no romper a los clientes que ya publicaban compras sin este
  // campo: ausente significa efectivo, que es como se contaban hasta ahora.
  metodoPago: z.enum(PAYMENT_METHOD_ENUM_VALUES).optional(),
  items: z.array(createPurchaseLineSchema).min(1),
});

export const createCashEntrySchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  descripcion: z.string().trim().min(1).max(250),
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

export const createBancoSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  activo: z.boolean().optional(),
});

export const updateBancoSchema = createBancoSchema.partial();

/**
 * La categoría sale del catálogo y excluye "Planilla": ese gasto lo escribe el
 * módulo Personal junto al pago o anticipo que lo origina, y uno creado a mano
 * quedaría sin esa contrapartida.
 *
 * `bancoId` se exige solo en "Pago banco" y se rechaza en el resto, para que no
 * queden pagos de banco sin banco ni gasolina colgando de uno.
 */
export const createExpenseSchema = z
  .object({
    businessDate: businessDateField,
    sucursalId: z.string().min(1).optional(),
    categoria: z.enum(MANUAL_EXPENSE_CATEGORIA_VALUES),
    bancoId: z.string().min(1).nullable().optional(),
    descripcion: z.string().trim().min(2).max(250),
    monto: z.number().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.categoria === BANK_EXPENSE_CATEGORY && !value.bancoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bancoId'],
        message: 'Seleccione el banco al que corresponde el pago',
      });
      return;
    }

    if (value.categoria !== BANK_EXPENSE_CATEGORY && value.bancoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bancoId'],
        message: `Solo los gastos de "${BANK_EXPENSE_CATEGORY}" llevan banco`,
      });
    }
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
  sucursalId: z.string().min(1).optional(),
  nombre: z.string().trim().min(2).max(120),
  puesto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(50).optional(),
  /** Pago por día trabajado; es la base del cálculo de planilla. */
  salarioDiario: z.number().positive().optional(),
  fechaIngreso: businessDateField.optional(),
  activo: z.boolean().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const createEmployeePaymentSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
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
  sucursalId: z.string().min(1).optional(),
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

export const openCashSessionSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  montoApertura: z.number().min(0),
  notas: z.string().trim().max(300).optional(),
});

export const closeCashSessionSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
  montoContado: z.number().min(0),
  notas: z.string().trim().max(300).optional(),
});

export const reopenCashSessionSchema = z.object({
  businessDate: businessDateField,
  sucursalId: z.string().min(1).optional(),
});

export const payrollPreviewSchema = z.object({
  from: businessDateField,
  to: businessDateField,
  sucursalId: z.string().min(1).optional(),
});

export const confirmPayrollSchema = z.object({
  from: businessDateField,
  to: businessDateField,
  sucursalId: z.string().min(1).optional(),
  /** Fecha en que se paga; por defecto el fin del período. */
  businessDate: businessDateField.optional(),
  employeeIds: z.array(z.string().min(1)).min(1),
});
