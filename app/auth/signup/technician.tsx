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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useTechnicianTypes, useAirports, AirportOption } from '../../../src/auth/useCatalogOptions';
import { AuthPickerField, PickerOption } from '../../../src/components/auth/AuthPickerField';
import { Button } from '../../../src/components/Button';
import { colors, spacing } from '../../../src/theme';

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function buildDate(y: string, m: string, d: string): string | null {
  const year = parseInt(y);
  const month = parseInt(m);
  const day = parseInt(d);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (year < 1930 || year > 2010) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function TechnicianSignupScreen() {
  const router = useRouter();
  const { options: techTypes, loading: typesLoading } = useTechnicianTypes();
  const { airports, loading: airportsLoading } = useAirports();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [technicianType, setTechnicianType] = useState('');
  const [locationCityId, setLocationCityId] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const techTypeOptions: PickerOption[] = techTypes.map((t) => ({
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
    if (!firstName.trim()) return 'First name is required.';
    if (!lastName.trim()) return 'Last name is required.';
    if (!isValidEmail(email)) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!birthYear || !birthMonth || !birthDay) return 'Date of birth is required.';
    if (!buildDate(birthYear, birthMonth, birthDay)) return 'Enter a valid date of birth.';
    if (!technicianType) return 'Select your technician type.';
    if (!locationCityId) return 'Select your base airport.';
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

    const birthDate = buildDate(birthYear, birthMonth, birthDay)!;

    // Step 1: Create auth user.
    // All form fields are stored in user_metadata so AuthContext can call
    // signup_technician() automatically after email confirmation if needed.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          role: 'technician',
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          birth_date: birthDate,
          technician_type: technicianType,
          location_city_id: locationCityId,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Step 2: If email confirmation is disabled (dev), session exists immediately.
    // Call the RPC now. When confirmation is enabled, session is null here and
    // AuthContext.ensureRoleProfile() will call the RPC after confirmation.
    if (data.session) {
      const { error: rpcError } = await supabase.rpc('signup_technician', {
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_birth_date: birthDate,
        p_technician_type: technicianType,
        p_location_city_id: locationCityId,
      });

      if (rpcError) {
        setError(
          'Account created but profile setup failed. Error: ' + rpcError.message
        );
        setLoading(false);
        return;
      }
    }

    // Step 3: Redirect to pending verification
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
            <Text style={styles.title}>Technician account</Text>
            <Text style={styles.subtitle}>
              All fields are required. Your profile will be reviewed before activation.
            </Text>
          </View>

          <View style={styles.form}>
            {/* Name */}
            <View style={styles.row}>
              <View style={styles.half}>
                <FormField label="First name">
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="John"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormField>
              </View>
              <View style={styles.half}>
                <FormField label="Last name">
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Smith"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormField>
              </View>
            </View>

            {/* Email */}
            <FormField label="Email">
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
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
                returnKeyType="next"
              />
            </FormField>

            {/* Date of birth */}
            <Text style={styles.sectionLabel}>Date of birth</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateDay}>
                <FormField label="Day">
                  <TextInput
                    style={styles.input}
                    value={birthDay}
                    onChangeText={setBirthDay}
                    placeholder="DD"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="next"
                  />
                </FormField>
              </View>
              <View style={styles.dateMonth}>
                <FormField label="Month">
                  <TextInput
                    style={styles.input}
                    value={birthMonth}
                    onChangeText={setBirthMonth}
                    placeholder="MM"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="next"
                  />
                </FormField>
              </View>
              <View style={styles.dateYear}>
                <FormField label="Year">
                  <TextInput
                    style={styles.input}
                    value={birthYear}
                    onChangeText={setBirthYear}
                    placeholder="YYYY"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="next"
                  />
                </FormField>
              </View>
            </View>

            {/* Technician type */}
            <AuthPickerField
              label="Technician type"
              placeholder="Select your type..."
              value={technicianType}
              onChange={setTechnicianType}
              options={techTypeOptions}
              loading={typesLoading}
              modalTitle="Select technician type"
            />

            {/* Base airport */}
            <AuthPickerField
              label="Base airport / Location"
              placeholder="Search airports..."
              value={locationCityId}
              onChange={setLocationCityId}
              options={airportOptions}
              loading={airportsLoading}
              searchable
              searchPlaceholder="City, airport, IATA code..."
              modalTitle="Select base airport"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            label="Create account"
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.btn}
          />

          <Text style={styles.footerNote}>
            By creating an account you agree to our Terms of Service.{'\n'}
            Your profile will be verified before you can access the platform.
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
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.cyanLight,
    marginBottom: -8,
  },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateDay: { width: 72 },
  dateMonth: { width: 72 },
  dateYear: { flex: 1 },
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
