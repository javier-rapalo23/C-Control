import { createClientSchema } from '@/lib/validations';
import { failure, handleApiError, success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

function mapClient(client: {
  id: string;
  nombre: string;
  nombres: string | null;
  apellidos: string | null;
  claveIhcafe: string | null;
  nombreFinca: string | null;
  telefono: string | null;
  direccion: string | null;
  rtn: string | null;
  cuentaBancaria: string | null;
  registroExonerado: string | null;
  registroSag: string | null;
  notas: string | null;
  esGeneral: boolean;
  esCompra: boolean;
  esVenta: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...client,
    nombres: client.nombres ?? null,
    apellidos: client.apellidos ?? null,
    claveIhcafe: client.claveIhcafe ?? null,
    nombreFinca: client.nombreFinca ?? null,
    telefono: client.telefono ?? null,
    direccion: client.direccion ?? null,
    rtn: client.rtn ?? null,
    cuentaBancaria: client.cuentaBancaria ?? null,
    registroExonerado: client.registroExonerado ?? null,
    registroSag: client.registroSag ?? null,
    notas: client.notas ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

async function ensureGeneralClient() {
  const existing = await prisma.client.findFirst({ where: { esGeneral: true } });
  if (existing) {
    return existing;
  }

  return prisma.client.create({
    data: {
      nombre: 'General',
      esGeneral: true,
      esCompra: true,
      esVenta: true,
    },
  });
}

export async function GET() {
  try {
    await ensureGeneralClient();
    const clients = await prisma.client.findMany({
      orderBy: [{ esGeneral: 'desc' }, { createdAt: 'asc' }],
    });

    return success(clients.map(mapClient));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createClientSchema.parse(await request.json());
    const nombre = `${payload.nombres} ${payload.apellidos}`.trim();
    // Sin indicar nada es de compra, que es para lo que se venían creando.
    const esCompra = payload.esCompra ?? !payload.esVenta;
    const esVenta = payload.esVenta ?? false;
    if (!esCompra && !esVenta) {
      return failure('VALIDATION_ERROR', 'El cliente debe ser de compra, de venta o de ambos', 400);
    }

    const client = await prisma.client.create({
      data: {
        nombre,
        nombres: payload.nombres,
        apellidos: payload.apellidos,
        claveIhcafe: payload.claveIhcafe,
        nombreFinca: payload.nombreFinca,
        telefono: payload.telefono,
        direccion: payload.direccion,
        rtn: payload.rtn,
        cuentaBancaria: payload.cuentaBancaria,
        registroExonerado: payload.registroExonerado,
        registroSag: payload.registroSag,
        notas: payload.notas,
        esCompra,
        esVenta,
      },
    });

    return success(mapClient(client), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
