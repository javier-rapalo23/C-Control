'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';

const AUTO_CLOSE_MS = 8000;

type Props = {
  message: string | null;
  onClose: () => void;
};

/**
 * Aviso de error flotante. Sustituye al párrafo rojo dentro de la tarjeta, que
 * quedaba fuera de la vista cuando el error llegaba después de hacer scroll
 * (al guardar un carrito, por ejemplo) y el usuario creía que se había guardado.
 *
 * Se monta en `document.body` para que ningún contenedor lo recorte, y se
 * cierra solo a los pocos segundos; pasar el mouse encima lo mantiene abierto.
 */
export default function ErrorToast({ message, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Los paneles pasan `onClose` como flecha en línea: nueva en cada render. Si
  // fuera dependencia del temporizador, escribir en cualquier campo lo reiniciaría.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!message || hovered) return;
    const timer = window.setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [message, hovered]);

  if (!mounted || !message) return null;

  return createPortal(
    <div
      className="toast toast-error"
      role="alert"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <p className="toast-message">{message}</p>
      <button type="button" className="toast-close" onClick={onClose} aria-label="Cerrar aviso">
        <X size={16} aria-hidden="true" />
      </button>
    </div>,
    toastRegion(),
  );
}

/** Contenedor único para que varios avisos a la vez se apilen en vez de encimarse. */
function toastRegion() {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    document.body.appendChild(region);
  }
  return region;
}
