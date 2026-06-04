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

export interface AirportOption {
  id: string;
  country_name: string;
  city: string;
  airport: string;
  iata: string | null;
  icao: string;
}

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

export function useAirports() {
  const [airports, setAirports] = useState<AirportOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('location_airports')
      .select('id, country_name, city, airport, iata, icao')
      .eq('is_active', true)
      .order('country_name')
      .then(({ data }) => {
        if (data) setAirports(data as AirportOption[]);
        setLoading(false);
      });
  }, []);

  return { airports, loading };
}
