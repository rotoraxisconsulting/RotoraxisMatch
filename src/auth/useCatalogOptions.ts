import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface TechnicianTypeOption {
  code: string;
  label: string;
}

export interface CompanyTypeOption {
  code: string;
  label: string;
}


// Fase 7 F2d: `useAirports` y `AirportOption` retirados. Cargaban el
// catalogo `location_airports` para los selectores de alta y perfil, que
// F2c sustituyo por `CountryCityPicker`. Se quedaron sin un solo
// consumidor, y mantener vivo el unico lector del catalogo habria
// bloqueado su DROP.

export function useTechnicianTypes() {
  const [options, setOptions] = useState<TechnicianTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('technician_types')
      .select('code, label')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setOptions(data as TechnicianTypeOption[]);
        setLoading(false);
      });
  }, []);

  return { options, loading };
}

export function useCompanyTypes() {
  const [options, setOptions] = useState<CompanyTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('company_types')
      .select('code, label')
      .order('sort_order')
      .then(({ data }) => {
        if (data) setOptions(data as CompanyTypeOption[]);
        setLoading(false);
      });
  }, []);

  return { options, loading };
}

