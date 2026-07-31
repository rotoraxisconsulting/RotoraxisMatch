import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { isValidUrl, normalizeUrl } from '../utils/urlValidation';

/**
 * Enlace a una URL externa declarada por un usuario (website de empresa,
 * enlaces del tecnico). No lo uses para rutas internas — eso es expo-router.
 *
 * Revalida ANTES de abrir aunque el valor venga de la base de datos. La
 * validacion del formulario y el CHECK de Postgres ya deberian bastar, pero
 * esto es lo unico que esta entre un dato guardado y un openURL: filas
 * anteriores al CHECK, o escritas por otra via, no han pasado por ninguno de
 * los dos. Si no valida, se pinta como texto plano y no se abre nada.
 */
export function ExternalLink({
  url,
  color,
  style,
}: {
  url: string;
  color: string;
  style?: object;
}) {
  const safe = isValidUrl(url);
  const href = normalizeUrl(url);
  // El esquema es ruido para el usuario; el valor que se abre es el completo.
  const display = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  if (!safe) {
    return <Text style={[styles.plain, { color }, style]}>{display}</Text>;
  }

  return (
    <TouchableOpacity onPress={() => Linking.openURL(href)} activeOpacity={0.7}>
      <Text style={[styles.link, { color }, style]} numberOfLines={1}>
        {display}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  plain: {
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
