import { classifyProducto, groupProductos, isCafeCategoria } from '@/lib/producto-groups';
import { COFFEE_TYPES, esCategoriaFacturable } from '@/lib/coffee-types';
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

describe('classifyProducto', () => {
  it('respeta la categoría cuando viene puesta', () => {
    expect(classifyProducto(producto('Cualquier cosa', 'pergamino'))).toBe('pergamino');
  });

  // Antes verde, requema, guacuco y repaso caían en "uva". No lo son: son tipos
  // por su cuenta y no se facturan.
  it.each(['Requema', 'Verde', 'Guacuco', 'Repaso'])('clasifica %s como otros, no como uva', (nombre) => {
    expect(classifyProducto(producto(nombre))).toBe('otros');
  });

  it('cada tipo del catálogo cae en su propia categoría sin depender del campo', () => {
    for (const tipo of COFFEE_TYPES) {
      expect(classifyProducto(producto(tipo.nombre))).toBe(tipo.categoria);
    }
  });

  // §17.14: el respaldo por nombre buscaba 'oriado' y un producto llamado
  // "Oreado" terminaba en Otros.
  it('reconoce "Oreado" del histórico como pergamino', () => {
    expect(classifyProducto(producto('Oreado'))).toBe('pergamino');
  });
});

describe('groupProductos', () => {
  it('omite los grupos vacíos y mantiene el orden uva, pergamino, otros', () => {
    const grupos = groupProductos([producto('Uva', 'uva'), producto('Repaso', 'otros')]);
    expect(grupos.map((grupo) => grupo.key)).toEqual(['uva', 'otros']);
  });
});

describe('isCafeCategoria', () => {
  // El rendimiento se captura para todo el café, incluido lo que no se factura:
  // lo que decide qué entra en la facturación es esCategoriaFacturable.
  it('habilita el modo oro también para los tipos que no se facturan', () => {
    expect(isCafeCategoria(producto('Guacuco', 'otros'))).toBe(true);
    expect(esCategoriaFacturable('otros')).toBe(false);
  });

  it('no lo habilita para un producto sin categoría', () => {
    expect(isCafeCategoria(producto('Sin categoría'))).toBe(false);
  });
});
