import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { CompanyCard, CompanyChip, companyUi } from './CompanyUI';
import { LicenseCode } from '../../types/catalog';
import { OfferProductType } from '../../types/offer';
import { LICENSE_CATEGORIES } from '../../constants/licenses';
import { isLicenseCompatibleWithProductType } from '../../utils/licenseCategoryProductType';

interface Props {
  // Fase 6 tanda D: UNA licencia por oferta, no un conjunto. `undefined`
  // mientras la empresa no ha elegido — el guardado lo exige (el CHECK de la
  // migración 053 lo ata a requiresCertification).
  licenseCode?: LicenseCode;
  onChangeLicense: (next: LicenseCode) => void;
  // Migración 047 — la licencia se acota por el producto declarado por la
  // oferta. Una oferta de helicópteros no puede pedir B1.1.
  productType: OfferProductType;
}

// Fase 6 tanda D — de "Required licenses" (un conjunto) a "Licence" (una).
//
// Pedir B1.3 y B2 a la vez era pedir un mecánico y un aviónico en el mismo
// anuncio: dos profesiones, dos puestos, dos ofertas. Misma regla que ya rige
// el tipo de perfil (tanda C) y el producto (migración 047).
//
// Con ello desaparece también el plegado del bloque. Existía porque la
// licencia era la vía APROXIMADA de puntuación y quedaba anulada en cuanto
// había requisitos exactos ("el exacto ANULA al amplio"), así que competía por
// atención sin puntuar. Ahora la licencia no es una vía alternativa: es el eje
// con el que se cruza cada aeronave, y se usa SIEMPRE.
export function RequiredLicensesSection({ licenseCode, onChangeLicense, productType }: Props) {
  const categories = useMemo(
    () => LICENSE_CATEGORIES.filter((l) => isLicenseCompatibleWithProductType(l.code as LicenseCode, productType)),
    [productType],
  );

  return (
    <CompanyCard style={styles.card}>
      <Text style={styles.title}>Licence</Text>
      <Text style={styles.subtitle}>
        One per offer. Every aircraft you add below is required under this licence — two licences would be two
        different jobs.
      </Text>

      <View style={styles.chipRow}>
        {categories.map((l) => (
          <CompanyChip
            key={l.code}
            label={l.code}
            selected={licenseCode === l.code}
            onPress={() => onChangeLicense(l.code as LicenseCode)}
          />
        ))}
      </View>

      {!licenseCode ? (
        <Text style={styles.inlineHint}>Pick the licence this role certifies under.</Text>
      ) : null}
    </CompanyCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginBottom: spacing.md },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: companyUi.text },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: companyUi.textSoft },
  inlineHint: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    fontStyle: 'italic',
    color: companyUi.amber,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
