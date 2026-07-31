import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { colors, spacing } from '../src/theme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.h1}>Privacy Policy</Text>
        <Text style={styles.meta}>Aviation Job Talent · Last updated: June 2025</Text>

        <Section title="1. Who we are">
          <P>
            Aviation Job Talent is operated by <Bold>[LEGAL_ENTITY_NAME]</Bold>, registered at
            {' '}<Bold>[LEGAL_ADDRESS]</Bold>. We connect aviation maintenance technicians with aviation companies, MROs, airlines, operators and recruiters.
          </P>
          <P>
            For privacy enquiries contact: <Bold>[PRIVACY_EMAIL]</Bold>
          </P>
        </Section>

        <Section title="2. Data we collect">
          <P><Bold>Technicians</Bold></P>
          <BulletList items={[
            'Full name, email address, date of birth (used for age verification; not shared).',
            'Professional information: technician type, location, availability, years of experience, licenses, aircraft type ratings.',
            'Documents you upload: aviation licences (EASA Part-66, FAA, etc.), medical certificates, training records, identity documents, resumes.',
            'Cover notes on job applications.',
            'Chat messages with companies after a connection is accepted.',
          ]} />
          <P><Bold>Company users</Bold></P>
          <BulletList items={[
            'Name, work email address.',
            'Company information: name, type, location.',
            'Job offers you publish.',
            'Chat messages with technicians after a connection is accepted.',
          ]} />
          <P><Bold>All users</Bold></P>
          <BulletList items={[
            'Authentication credentials (email, hashed password — managed by Supabase Auth).',
            'Timestamps of consent to these Terms and this Privacy Policy.',
            'App activity metadata (login events, offer views) for security and platform integrity.',
          ]} />
        </Section>

        <Section title="3. How we use your data">
          <BulletList items={[
            'To operate the matching platform: display anonymised technician profiles to companies and match them to job offers.',
            'To verify professional credentials via admin review.',
            'To facilitate communication between technicians and companies after an accepted connection.',
            'To enforce platform security (rate-limiting, fraud prevention).',
            'To comply with legal obligations.',
          ]} />
        </Section>

        <Section title="4. Privacy by default — technician identity">
          <P>
            Technician identity is <Bold>private by default</Bold>. Companies can only see an anonymous code, country, city, base airport, licences, aircraft types, availability, years of experience, verification status and match score.
          </P>
          <P>
            Full name, email address, phone number, professional links and identity documents are <Bold>never visible to companies</Bold> until both parties have accepted a connection (application accepted or direct offer accepted) and <Bold>identityRevealed = true</Bold>.
          </P>
          <P>
            Medical certificates and identity documents are <Bold>exclusively reviewed by our admin team</Bold> for verification purposes. They are never shared with companies in any form.
          </P>
        </Section>

        <Section title="5. Special categories — medical data (GDPR Art. 9)">
          <P>
            Medical certificates (EASA Class 1/2/3, FAA AME) constitute health data under GDPR Article 9. We process this data exclusively:
          </P>
          <BulletList items={[
            'On the basis of your explicit consent, given at the time of upload.',
            'For the purpose of professional licence verification by our admin team.',
            'The medical certificate file and its metadata are not accessible to companies.',
          ]} />
          <P>
            You may withdraw this consent at any time by deleting the document or deleting your account. Withdrawal does not affect verification decisions already made.
          </P>
        </Section>

        <Section title="6. Legal basis for processing (GDPR)">
          <BulletList items={[
            'Contract (Art. 6(1)(b)): to provide the platform service you signed up for.',
            'Legitimate interest (Art. 6(1)(f)): platform security, fraud prevention, service improvement.',
            'Legal obligation (Art. 6(1)(c)): compliance with applicable law.',
            'Explicit consent (Art. 9(2)(a)): medical data processing.',
          ]} />
        </Section>

        <Section title="7. Data sharing">
          <P>We do not sell your personal data. We share data only with:</P>
          <BulletList items={[
            'Supabase (infrastructure and authentication provider) — processors acting under our instructions.',
            'Companies: only the anonymised technician profile until identity is revealed post-acceptance.',
            'Legal authorities: only when required by law.',
          ]} />
        </Section>

        <Section title="8. Data retention">
          <BulletList items={[
            'Active accounts: data retained while your account is active.',
            'Deleted accounts: personal data (name, email, phone, documents) is erased or anonymised within 30 days of deletion. Anonymised records (message history, application history) may be retained for operational integrity.',
            'Documents: deleted from storage immediately on account deletion or on your request.',
          ]} />
        </Section>

        <Section title="9. Your rights (GDPR)">
          <P>If you are in the European Economic Area you have the right to:</P>
          <BulletList items={[
            'Access: request a copy of your personal data.',
            'Rectification: correct inaccurate data.',
            'Erasure: request deletion of your data ("right to be forgotten").',
            'Restriction: limit processing of your data.',
            'Portability: receive your data in a machine-readable format.',
            'Object: object to processing based on legitimate interests.',
            'Withdraw consent: withdraw consent for medical data processing at any time.',
          ]} />
          <P>
            To exercise any right, contact: <Bold>[PRIVACY_EMAIL]</Bold>{'\n'}
            You also have the right to lodge a complaint with your local supervisory authority.
          </P>
        </Section>

        <Section title="10. Account deletion">
          <P>
            You can delete your account at any time from <Bold>Settings → Delete account</Bold> inside the app. See also the <Bold>/delete-account</Bold> page for step-by-step instructions.
          </P>
        </Section>

        <Section title="11. Cookies and tracking">
          <P>
            The mobile app does not use cookies. The web version uses technically necessary cookies for session management only. No advertising or analytics cookies are used.
          </P>
        </Section>

        <Section title="12. Security">
          <P>
            Data is encrypted in transit (TLS) and at rest. Authentication is handled by Supabase Auth. We apply row-level security policies so users can only access data they are authorised to view.
          </P>
        </Section>

        <Section title="13. Changes to this policy">
          <P>
            We will notify registered users of material changes by email at least 14 days before they take effect. Continued use of the platform constitutes acceptance of the updated policy.
          </P>
        </Section>

        <Section title="14. Contact">
          <P>
            General support: <Bold>[SUPPORT_EMAIL]</Bold>{'\n'}
            Privacy enquiries: <Bold>[PRIVACY_EMAIL]</Bold>{'\n'}
            Legal entity: <Bold>[LEGAL_ENTITY_NAME]</Bold>{'\n'}
            Address: <Bold>[LEGAL_ADDRESS]</Bold>
          </P>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  scrollWide: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  back: { paddingVertical: spacing.sm, alignSelf: 'flex-start', marginBottom: spacing.sm },
  backText: { color: colors.blue, fontSize: 14, fontWeight: '500' },
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  section: { marginBottom: spacing.xl },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  p: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  bold: { fontWeight: '700', color: colors.text },
  bulletList: { gap: spacing.xs, marginBottom: spacing.sm },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  bulletDot: { color: colors.blue, fontSize: 14, width: 14, marginTop: 3 },
  bulletText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
});
