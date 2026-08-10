import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { notify } from '../utils/platformAlert';
import { TechnicianTypeOption } from '../auth/useCatalogOptions';

/**
 * Selección MÚLTIPLE de tipos de perfil de técnico (Fase 6 tanda A).
 *
 * Un único componente para el alta (`app/auth/signup/technician.tsx`) y para
 * el perfil (`app/technician/profile.tsx`), a propósito: son el mismo campo
 * en dos momentos distintos, y cuando cada pantalla tenía su propio control
 * (picker de un solo valor en el alta, chips en el perfil) también tenían su
 * propia idea de qué es válido. La regla del mínimo de uno vive AQUÍ DENTRO,
 * no en cada pantalla, para que no pueda divergir.
 *
 * Sin restricción de mezcla: se puede ser aviónico y pintor a la vez. Y sin
 * relación con las licencias — un tipo no habilita ni impide declarar nada
 * (ver la nota de getProfileCompletenessWeights); el eje Part-66 se muestra
 * siempre, tenga el técnico los tipos que tenga.
 *
 * La `palette` es el mismo patrón que DateField: el alta es tema oscuro
 * (navy) y el perfil claro, y un componente compartido no puede traer sus
 * propios colores sin desentonar en uno de los dos.
 */

export interface TechnicianTypeSelectorPalette {
  text: string;
  muted: string;
  border: string;
  surface: string;
  accent: string;
  accentText: string;
  accentSurface: string;
}

export const DEFAULT_TECHNICIAN_TYPE_PALETTE: TechnicianTypeSelectorPalette = {
  text: '#1A2332',
  muted: '#94A3B8',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  accent: '#2563EB',
  accentText: '#2563EB',
  accentSurface: '#2563EB1A',
};

export interface TechnicianTypeSelectorProps {
  options: TechnicianTypeOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
  palette?: Partial<TechnicianTypeSelectorPalette>;
}

export function TechnicianTypeSelector({
  options,
  selected,
  onChange,
  loading = false,
  palette,
}: TechnicianTypeSelectorProps) {
  const p = { ...DEFAULT_TECHNICIAN_TYPE_PALETTE, ...palette };

  function toggle(code: string) {
    const isSelected = selected.includes(code);
    if (!isSelected) {
      onChange([...selected, code]);
      return;
    }
    // Mínimo uno. Se avisa en vez de dejar el toque sin efecto: un chip que
    // no responde parece la app rota, no una regla.
    if (selected.length === 1) {
      notify(
        'Keep at least one profile type',
        'Your profile needs at least one type. Select another one first, then remove this.',
      );
      return;
    }
    onChange(selected.filter((c) => c !== code));
  }

  if (loading) {
    return <Text style={[styles.note, { color: p.muted }]}>Loading profile types...</Text>;
  }

  // Catálogo vacío = fallo de carga, no "no hay tipos". Decirlo importa: sin
  // esto la pantalla enseña un hueco silencioso y el técnico no sabe si el
  // campo es opcional o está roto.
  if (options.length === 0) {
    return (
      <Text style={[styles.note, { color: p.muted }]}>
        Could not load the profile types. Check your connection and reload.
      </Text>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        {options.map((opt) => {
          const isSelected = selected.includes(opt.code);
          return (
            <TouchableOpacity key={opt.code} onPress={() => toggle(opt.code)} activeOpacity={0.75}>
              <View
                style={[
                  styles.chip,
                  { borderColor: p.border, backgroundColor: p.surface },
                  isSelected && { borderColor: p.accent, backgroundColor: p.accentSurface },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: p.muted },
                    isSelected && { color: p.accentText, fontWeight: '700' },
                  ]}
                >
                  {opt.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.note, { color: p.muted }]}>
        Select every type that describes your work — you can pick more than one. This does not
        limit what you can declare: licences and type ratings are always available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 17, marginTop: 8 },
});
