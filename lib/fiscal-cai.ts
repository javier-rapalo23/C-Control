import { Prisma, PrismaClient } from '@prisma/client';
import { toBusinessDateString } from '@/lib/business-date';
import { evaluarCai, formatNumeroFiscal, motivoNoEmitible, tipoDocumentoLabel } from '@/lib/fiscal';
import type { FiscalCaiDTO } from '@/types/domain';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Lo que hace falta para armar el DTO: el CAI y cuántos documentos lleva emitidos. */
export const fiscalCaiInclude = {
  _count: { select: { documentos: true } },
} as const;

type FiscalCaiRow = {
  id: string;
  tipoDocumento: string;
  codigo: string;
  codigoEstablecimiento: string;
  codigoPuntoEmision: string;
  codigoTipoDocumento: string;
  rangoDesde: number;
  rangoHasta: number;
  fechaLimite: Date;
  modo: string;
  estado: string;
  ultimoCorrelativo: number;
  alertaPorcentaje: number;
  alertaDiasPrevios: number;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { documentos: number };
};

/**
 * El estado del rango se **deriva** en cada lectura y no se guarda: si "agotado" o
 * "vencido" vivieran en una columna, quedarían desactualizados el día que pasa la
 * fecha límite sin que nadie escriba nada.
 */
export function mapFiscalCai(cai: FiscalCaiRow): FiscalCaiDTO {
  const estadoRango = evaluarCai(cai);
  const siguienteNumero =
    estadoRango.siguienteCorrelativo === null
      ? null
      : formatNumeroFiscal({
          codigoEstablecimiento: cai.codigoEstablecimiento,
          codigoPuntoEmision: cai.codigoPuntoEmision,
          codigoTipoDocumento: cai.codigoTipoDocumento,
          correlativo: estadoRango.siguienteCorrelativo,
        });

  return {
    id: cai.id,
    tipoDocumento: cai.tipoDocumento,
    tipoDocumentoLabel: tipoDocumentoLabel(cai.tipoDocumento),
    codigo: cai.codigo,
    codigoEstablecimiento: cai.codigoEstablecimiento,
    codigoPuntoEmision: cai.codigoPuntoEmision,
    codigoTipoDocumento: cai.codigoTipoDocumento,
    rangoDesde: cai.rangoDesde,
    rangoHasta: cai.rangoHasta,
    fechaLimite: toBusinessDateString(cai.fechaLimite),
    modo: cai.modo,
    estado: cai.estado,
    ultimoCorrelativo: cai.ultimoCorrelativo,
    alertaPorcentaje: cai.alertaPorcentaje,
    alertaDiasPrevios: cai.alertaDiasPrevios,
    notas: cai.notas,
    documentosEmitidos: cai._count.documentos,
    createdAt: cai.createdAt.toISOString(),
    updatedAt: cai.updatedAt.toISOString(),
    estadoRango: {
      ...estadoRango,
      siguienteNumero,
      motivoNoEmitible: motivoNoEmitible(estadoRango, cai.estado === 'activo'),
    },
  };
}

export async function listFiscalCais(db: DbClient): Promise<FiscalCaiDTO[]> {
  const cais = await db.fiscalCai.findMany({
    orderBy: [{ tipoDocumento: 'asc' }, { createdAt: 'desc' }],
    include: fiscalCaiInclude,
  });
  return cais.map(mapFiscalCai);
}
