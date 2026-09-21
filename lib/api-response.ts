import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { CashClosedError } from '@/lib/cash-session';
import type { ApiError, ApiResponse, ApiSuccess } from '@/types/api';

export function success<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data } satisfies ApiResponse<T>, { status });
}

export function failure(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, details },
    } satisfies ApiError,
    { status },
  );
}

const PRISMA_MESSAGES: Record<string, { code: string; message: string; status: number }> = {
  // Transacción vencida o sin conexión disponible: nada se guardó, reintentar es seguro.
  P2024: { code: 'DATABASE_BUSY', message: 'La base de datos está ocupada. Intenta de nuevo en unos segundos.', status: 503 },
  P2028: { code: 'DATABASE_TIMEOUT', message: 'La operación tardó demasiado y no se guardó. Intenta de nuevo.', status: 503 },
  P2002: { code: 'CONFLICT', message: 'Ya existe un registro con esos datos.', status: 409 },
  P2003: { code: 'CONFLICT', message: 'No se puede completar: hay registros relacionados que lo impiden.', status: 409 },
  P2025: { code: 'NOT_FOUND', message: 'El registro ya no existe.', status: 404 },
};

export function handleApiError(error: unknown): NextResponse<ApiError> {
  if (error instanceof ZodError) {
    return failure('VALIDATION_ERROR', 'Invalid request payload', 400, error.flatten());
  }

  // 409 y no 400: el payload es válido; lo que impide la operación es el estado de
  // la caja. El cliente necesita distinguirlo para ofrecer "solicitar reapertura".
  if (error instanceof CashClosedError) {
    return failure('CASH_CLOSED', error.message, 409, { businessDate: error.businessDate });
  }

  // Los mensajes de Prisma son técnicos y en inglés; el usuario solo necesita
  // saber qué pasó y si puede reintentar.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const friendly = PRISMA_MESSAGES[error.code];
    if (friendly) {
      return failure(friendly.code, friendly.message, friendly.status);
    }
    console.error(error);
    return failure('DATABASE_ERROR', 'No se pudo completar la operación en la base de datos. Intenta de nuevo.', 500);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error(error);
    return failure('DATABASE_UNAVAILABLE', 'No hay conexión con la base de datos. Intenta de nuevo en unos segundos.', 503);
  }

  if (error instanceof Error) {
    return failure('BAD_REQUEST', error.message, 400);
  }

  return failure('INTERNAL_ERROR', 'Unexpected server error', 500);
}