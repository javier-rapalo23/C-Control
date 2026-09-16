import { COFFEE_TYPES, COFFEE_TYPE_NOMBRES, esCategoriaFacturable, findCoffeeType } from '@/lib/coffee-types';
import { isCafeCategoria } from '@/lib/producto-groups';
import type { ProductoDTO } from '@/types/domain';

function producto(nombre: string, categoria: ProductoDTO['categoria'] = null): ProductoDTO {
  return {
    id: nombre,
    nombre,
    categoria,
    taraPorSaco: null,
    facturable: esCategoriaFacturable(categoria),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('catálogo de tipos de café', () => {
  it('tiene los ocho tipos que compra el negocio', () => {
    expect(COFFEE_TYPE_NOMBRES).toEqual([
      'Pergamino húmedo',
      'Pergamino mojado',
      'Pergamino seco',
      'Uva',
      'Requema',
      'Verde',
      'Guacuco',
      'Repaso',
    ]);
  });

  // Antes la clasificación por palabras clave metía estos cuatro dentro de "uva".
  // No lo son: son tipos por su cuenta y no se facturan.
  it.each(['Requema', 'Verde', 'Guacuco', 'Repaso'])('%s es de categoría otros', (nombre) => {
    expect(findCoffeeType(nombre)?.categoria).toBe('otros');
  });

  it('el pergamino tiene sus tres estados y todos son pergamino', () => {
    const pergaminos = COFFEE_TYPES.filter((tipo) => tipo.categoria === 'pergamino');
    expect(pergaminos.map((tipo) => tipo.nombre)).toEqual([
      'Pergamino húmedo',
      'Pergamino mojado',
      'Pergamino seco',
    ]);
  });

  it('busca por nombre sin distinguir mayúsculas ni espacios de sobra', () => {
    expect(findCoffeeType('  pergamino SECO ')?.nombre).toBe('Pergamino seco');
    expect(findCoffeeType('Café Pergamino')).toBeUndefined();
  });
});

describe('esCategoriaFacturable', () => {
  it('solo uva y pergamino entran en la facturación de temporada', () => {
    const facturables = COFFEE_TYPES.filter((tipo) => esCategoriaFacturable(tipo.categoria));
    expect(facturables.map((tipo) => tipo.nombre)).toEqual([
      'Pergamino húmedo',
      'Pergamino mojado',
      'Pergamino seco',
      'Uva',
    ]);
  });

  it('un producto sin categoría no se factura', () => {
    expect(esCategoriaFacturable(null)).toBe(false);
  });
});

describe('isCafeCategoria', () => {
  // El rendimiento se captura para todo el café, incluido lo que no se factura:
  // quien decide qué entra en la facturación es esCategoriaFacturable.
  it('habilita el modo oro también para los tipos que no se facturan', () => {
    expect(isCafeCategoria(producto('Guacuco', 'otros'))).toBe(true);
    expect(esCategoriaFacturable('otros')).toBe(false);
  });

  it('no lo habilita para un producto sin categoría', () => {
    expect(isCafeCategoria(producto('Sin categoría'))).toBe(false);
  });
});
