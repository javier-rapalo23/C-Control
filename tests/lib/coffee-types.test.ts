import { COFFEE_TYPES, COFFEE_TYPE_NOMBRES, findCoffeeType } from '@/lib/coffee-types';
import { isCafeCategoria } from '@/lib/producto-groups';
import type { ProductoDTO } from '@/types/domain';

function producto(nombre: string, categoria: ProductoDTO['categoria'] = null): ProductoDTO {
  return {
    id: nombre,
    nombre,
    categoria,
    taraPorSaco: null,
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
  // No lo son: son tipos por su cuenta.
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

describe('isCafeCategoria', () => {
  // El rendimiento se captura para todo el café, sin importar la categoría.
  it('habilita el modo oro también para la categoría "otros"', () => {
    expect(isCafeCategoria(producto('Guacuco', 'otros'))).toBe(true);
  });

  it('no lo habilita para un producto sin categoría', () => {
    expect(isCafeCategoria(producto('Sin categoría'))).toBe(false);
  });
});
