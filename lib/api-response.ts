import { NextResponse } from 'next/server';
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

export function handleApiError(error: unknown): NextResponse<ApiError> {
  if (error instanceof ZodError) {
    return failure('VALIDATION_ERROR', 'Invalid request payload', 400, error.flatten());
  }

  // 409 y no 400: el payload es válido; lo que impide la operación es el estado de
  // la caja. El cliente necesita distinguirlo para ofrecer "solicitar reapertura".
  if (error instanceof CashClosedError) {
    return failure('CASH_CLOSED', error.message, 409, { businessDate: error.businessDate });
  }

  if (error instanceof Error) {
    return failure('BAD_REQUEST', error.message, 400);
  }

  return failure('INTERNAL_ERROR', 'Unexpected server error', 500);
}