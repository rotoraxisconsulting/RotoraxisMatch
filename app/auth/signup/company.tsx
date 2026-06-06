import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useCompanyTypes, useAirports, AirportOption } from '../../../src/auth/useCatalogOptions';
import { AuthPickerField, PickerOption } from '../../../src/components/auth/AuthPickerField';
import { Button } from '../../../src/components/Button';
import { colors, spacing } from '../../../src/theme';

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default function CompanySignupScreen() {
  const router = useRouter();
  const { options: companyTypes, loading: typesLoading } = useCompanyTypes();
  const { airports, loading: airportsLoading } = useAirports();

  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [locationCityId, setLocationCityId] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const companyTypeOptions: PickerOption[] = companyTypes.map((t) => ({
    value: t.code,
    label: t.label,
  }));

  const airportOptions: PickerOption[] = useMemo(
    () =>
      airports.map((a: AirportOption) => ({
        value: a.id,
        label: `${a.city}${a.iata ? ` (${a.iata})` : ` (${a.icao})`}`,
        subtitle: a.country_name,
      })),
    [airports]
  );

  function validate(): string | null {
    if (!companyName.trim()) return 'Company name is required.';
    if (!companyType) return 'Select a company type.';
    if (!isValidEmail(email)) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!locationCityId) return 'Select your main base airport.';
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setLoading(true);

    // Step 1: Create auth user — trigger auto-creates profiles row
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          role: 'company_user',
          company_name: companyName.trim(),
          company_type: companyType,
          location_city_id: locationCityId,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Step 2: Create company + company_member via SECURITY DEFINER RPC
    if (data.session) {
      const { error: rpcError } = await supabase.rpc('signup_company', {
        p_company_name: companyName.trim(),
        p_company_type: companyType,
        p_location_city_id: locationCityId,
      });

      if (rpcError) {
        setError(
          'Account created but company setup failed. Error: ' + rpcError.message
        );
        setLoading(false);
        return;
      }
    }

    router.replace('/auth/pending-verification' as any);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Company account</Text>
            <Text style={styles.subtitle}>
              Register your organisation. All fields are required.{'\n'}
              Your account will be verified before full access is granted.
            </Text>
          </View>

          <View style={styles.form}>
            {/* Company name */}
            <FormField label="Company name">
              <TextInput
                style={styles.input}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Acme Aviation MRO"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </FormField>

            {/* Company type */}
            <AuthPickerField
              label="Company type"
              placeholder="Select company type..."
              value={companyType}
              onChange={setCompanyType}
              options={companyTypeOptions}
              loading={typesLoading}
              modalTitle="Select company type"
            />

            {/* Base airport */}
            <AuthPickerField
              label="Main base airport"
              placeholder="Search airports..."
              value={locationCityId}
              onChange={setLocationCityId}
              options={airportOptions}
              loading={airportsLoading}
              searchable
              searchPlaceholder="City, airport, IATA code..."
              modalTitle="Select main base airport"
            />

            {/* Email */}
            <FormField label="Contact email">
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="hr@company.com"
                placeholderTextColor={colors.textMuted}
                autoComplete="email"
                returnKeyType="next"
              />
            </FormField>

            {/* Password */}
            <FormField label="Password">
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Min 8 characters"
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
              />
            </FormField>

            <FormField label="Confirm password">
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Repeat password"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </FormField>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            label="Create company account"
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.btn}
          />

          <Text style={styles.footerNote}>
            You will be registered as the account administrator.{'\n'}
            Additional team members can be invited after verification.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  back: { paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  backText: { color: colors.cyanLight, fontSize: 14, fontWeight: '500' },
  header: { marginBottom: spacing.lg },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  subtitle: { fontSize: 13, color: colors.cyanLight, lineHeight: 19 },
  form: {
    backgroundColor: colors.navyLight,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.cyanLight,
    marginBottom: 2,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: colors.white,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  btn: { marginBottom: spacing.md },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
});
