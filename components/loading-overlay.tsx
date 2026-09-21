'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Por debajo de esto no se muestra: evita el parpadeo en respuestas rápidas. */
const SHOW_DELAY_MS = 200;

type Props = {
  active: boolean;
  label?: string;
};

/**
 * Indicador de actividad a pantalla completa. Sustituye al "Sincronizando..."
 * al pie de cada panel, que no se veía y dejaba creer que la app no respondía.
 *
 * Además bloquea los clics mientras dura: contra la base remota una operación
 * tarda varios segundos, y volver a pulsar "Guardar" duplicaba el registro.
 */
export default function LoadingOverlay({ active, label = 'Procesando...' }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible) return null;

  return createPortal(
    <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-box">
        <span className="loading-spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>,
    document.body,
  );
}
