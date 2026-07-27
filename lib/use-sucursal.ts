'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@/types/api';
import type { SucursalDTO } from '@/types/domain';

const SUCURSAL_STORAGE_KEY = 'rcontrol_sucursal_id';

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

export function useSucursal() {
  const [allSucursales, setAllSucursales] = useState<SucursalDTO[]>([]);
  const [sucursalId, setSucursalIdState] = useState('');
  const [loading, setLoading] = useState(false);

  const sucursales = allSucursales.filter((s) => s.activo);

  const setSucursalId = useCallback((id: string) => {
    setSucursalIdState(id);
    localStorage.setItem(SUCURSAL_STORAGE_KEY, id);
  }, []);

  const fetchSucursales = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sucursales', { cache: 'no-store' });
      const data = await parseApiResponse<SucursalDTO[]>(response);
      setAllSucursales(data);

      const activos = data.filter((s) => s.activo);
      const saved = localStorage.getItem(SUCURSAL_STORAGE_KEY);
      const stillExists = saved && activos.some((s) => s.id === saved);

      if (stillExists) {
        setSucursalIdState(saved);
      } else if (activos.length > 0) {
        const principal = activos.find((s) => s.esPrincipal) ?? activos[0];
        setSucursalId(principal.id);
      }
    } finally {
      setLoading(false);
    }
  }, [setSucursalId]);

  useEffect(() => {
    void fetchSucursales();
  }, [fetchSucursales]);

  return { sucursales, sucursalId, setSucursalId, loading, refresh: fetchSucursales };
}
