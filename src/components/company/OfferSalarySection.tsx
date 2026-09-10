import React from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Banknote } from 'lucide-react-native';
import { spacing } from '../../theme';
import { SALARY_CURRENCIES, SALARY_PERIODS } from '../../types/offerSalary';
import { formatOfferSalary, salaryFromForm, salaryFormError, SalaryFormValue } from '../../utils/offerSalary';
import { CompanyCard, CompanyChip, companyUi, IconBox } from './CompanyUI';

export function OfferSalarySection({ value, onChange, error }: {
  value: SalaryFormValue;
  onChange: (value: SalaryFormValue) => void;
  error?: string;
}) {
  const preview = value.enabled && !salaryFormError(value) ? formatOfferSalary(salaryFromForm(value)) : null;
  return (
    <CompanyCard style={styles.section}>
      <View style={styles.header}>
        <IconBox icon={Banknote} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
        <View style={styles.copy}>
          <Text style={styles.title}>Remuneration (optional)</Text>
          <Text style={styles.helper}>All amounts are gross, before taxes. You can publish without adding remuneration.</Text>
        </View>
      </View>
      <View style={styles.toggle}>
        <Text style={styles.label}>Add remuneration</Text>
        <Switch
          accessibilityLabel="Add gross remuneration"
          value={value.enabled}
          onValueChange={(enabled) => onChange({ ...value, enabled })}
          trackColor={{ false: companyUi.border, true: companyUi.accent }}
        />
      </View>
      {value.enabled && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Gross amount</Text>
            <TextInput
              accessibilityLabel="Gross amount"
              accessibilityHint="Use a dot or comma for decimals, without thousands separators"
              style={[styles.input, error && styles.inputError]}
              value={value.amount}
              onChangeText={(amount) => onChange({ ...value, amount })}
              keyboardType="decimal-pad"
              placeholder="e.g. 3500 or 35.50"
              placeholderTextColor={companyUi.textMuted}
              maxLength={24}
            />
            <Text style={styles.helper}>Use a dot or comma for decimals, without thousands separators.</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Currency</Text>
            <View style={styles.choices}>
              {SALARY_CURRENCIES.map((currency) => (
                <CompanyChip key={currency} label={currency} selected={currency === value.currency}
                  onPress={() => onChange({ ...value, currency })} />
              ))}
              <CompanyChip label="Other" selected={value.currency === 'other'}
                onPress={() => onChange({ ...value, currency: 'other' })} />
            </View>
            {value.currency === 'other' && (
              <View style={styles.field}>
                <Text style={styles.label}>Currency code</Text>
                <TextInput
                  accessibilityLabel="Currency code"
                  accessibilityHint="Enter a three-letter code, for example JPY or MXN"
                  style={styles.input}
                  value={value.customCurrency}
                  onChangeText={(customCurrency) => onChange({ ...value, customCurrency })}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="e.g. JPY or MXN"
                  placeholderTextColor={companyUi.textMuted}
                  maxLength={12}
                />
                <Text style={styles.helper}>Enter the three-letter currency code. It can differ from the offer country's currency.</Text>
              </View>
            )}
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Amount per</Text>
            <View style={styles.choices}>
              {SALARY_PERIODS.map((period) => (
                <CompanyChip key={period.code} label={period.label} selected={period.code === value.period}
                  onPress={() => onChange({ ...value, period: period.code })} />
              ))}
            </View>
          </View>
          {preview ? <Text style={styles.preview}>{preview}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </>
      )}
    </CompanyCard>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: companyUi.text },
  helper: { fontSize: 12, lineHeight: 17, color: companyUi.textSoft, marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { fontSize: 12, fontWeight: '700', color: companyUi.textSoft },
  field: { gap: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { minHeight: 46, borderWidth: 1, borderColor: companyUi.border, borderRadius: 14,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14,
    color: companyUi.text, backgroundColor: companyUi.surfaceSoft },
  inputError: { borderColor: companyUi.red },
  preview: { fontSize: 14, fontWeight: '700', color: companyUi.green },
  error: { fontSize: 12, lineHeight: 17, color: companyUi.red },
});
