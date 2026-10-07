'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { ClientDTO } from '@/types/domain';

/** Sin tildes ni mayúsculas: "Pérez" se encuentra escribiendo "perez". */
function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function etiqueta(client: ClientDTO) {
  return client.esGeneral ? `${client.nombre} (general)` : client.nombre;
}

type Props = {
  clients: ClientDTO[];
  value: string;
  onChange: (clientId: string) => void;
};

/**
 * Selector de cliente con buscador, en lugar del `<select>`: con cientos de productores
 * buscar en la lista desplegable era bajar a ojo. Busca por nombre y por apellido, en
 * cualquier orden y sin importar tildes ("perez juan" encuentra a "Juan Pérez").
 */
export default function ClientSearchSelect({ clients, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const seleccionado = clients.find((client) => client.id === value) ?? null;

  const resultados = useMemo(() => {
    const palabras = normalizar(query).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return clients;
    return clients.filter((client) => {
      const texto = normalizar([client.nombre, client.nombres, client.apellidos].filter(Boolean).join(' '));
      return palabras.every((palabra) => texto.includes(palabra));
    });
  }, [clients, query]);

  function elegir(client: ClientDTO) {
    onChange(client.id);
    setQuery('');
    setAbierto(false);
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAbierto(true);
      setActivo((indice) => Math.min(indice + 1, resultados.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActivo((indice) => Math.max(indice - 1, 0));
    } else if (event.key === 'Enter') {
      // Enter elige y no envía el formulario que lo contenga.
      if (abierto && resultados[activo]) {
        event.preventDefault();
        elegir(resultados[activo]);
      }
    } else if (event.key === 'Escape') {
      setQuery('');
      setAbierto(false);
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        // Cerrado muestra el cliente elegido; al escribir, lo escrito.
        value={abierto ? query : seleccionado ? etiqueta(seleccionado) : ''}
        placeholder={seleccionado ? etiqueta(seleccionado) : 'Buscar por nombre o apellido'}
        onFocus={() => {
          setQuery('');
          setActivo(0);
          setAbierto(true);
        }}
        // El retraso deja que el clic en una opción llegue antes de cerrar la lista.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActivo(0);
          setAbierto(true);
        }}
        onKeyDown={onKeyDown}
        style={{ width: '100%' }}
      />
      {abierto ? (
        <ul
          id={listaId}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 260,
            overflowY: 'auto',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
          }}
        >
          {resultados.length === 0 ? (
            <li style={{ padding: '8px 10px', color: 'var(--text-soft)', fontSize: 14 }}>Sin resultados</li>
          ) : (
            resultados.map((client, indice) => (
              <li
                key={client.id}
                role="option"
                aria-selected={client.id === value}
                // `onMouseDown` y no `onClick`: el clic llegaría después del blur.
                onMouseDown={(event) => {
                  event.preventDefault();
                  elegir(client);
                }}
                onMouseEnter={() => setActivo(indice)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: client.id === value ? 600 : 400,
                  background: indice === activo ? 'var(--ring-soft)' : 'transparent',
                }}
              >
                {etiqueta(client)}
                {client.claveIhcafe ? (
                  <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-soft)' }}>
                    IHCAFE {client.claveIhcafe}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
