'use client';

import type { ApiResponse } from '@/types/api';

/**
 * Descarga un archivo de la API sin navegar.
 *
 * Apuntar un enlace directo al endpoint sería más corto, pero si la petición falla —sin
 * permiso, rango inválido— el navegador reemplazaría la página por el JSON del error. Así
 * el fallo se puede mostrar en el mismo aviso que el resto del panel.
 *
 * Lanza `Error` con el mensaje de la API, para que quien llama decida dónde mostrarlo.
 */
export async function descargarArchivo(url: string, nombre: string): Promise<void> {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new Error(body && !body.ok ? body.error.message : 'No se pudo generar el archivo.');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = objectUrl;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(objectUrl);
}
