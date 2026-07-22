import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import {
  BriefcaseBusiness,
  Clock,
  Lock,
  MapPin,
  Radar,
  Search,
  Send,
} from 'lucide-react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MatchBadge } from '../../src/components/MatchBadge';
import {
  CompanyBadge,
  CompanyCard,
  CompanyChip,
  CompanyPageHeader,
  CompanyScreen,
  EmptyPanel,
  IconBox,
  InitialAvatar,
  companyStyles,
  companyUi,
} from '../../src/components/company/CompanyUI';
import { useTechnicianSearch } from '../../src/state/useTechnicianSearch';
import { useCompanySession } from '../../src/state/SessionContext';
import { canSendDirectOffers } from '../../src/utils/companyPermissionsV2';
import { isOfferOpenForTechnicians, offerRepository } from '../../src/repositories/v2/offerRepository';
import { offerRequestRepository } from '../../src/repositories/v2/offerRequestRepository';
import { technicianRepositoryV2 } from '../../src/repositories/v2/technicianRepositoryV2';
import { calculateOfferTechnicianMatch } from '../../src/utils/matchingV2';
import { useAircraftTypeRatingsCatalog } from '../../src/state/useAircraftTypeRatingsCatalog';
import { AircraftRatingIndex } from '../../src/constants/aircraftTypeRatings';
import { AircraftFamilyPicker } from '../../src/components/AircraftFamilyPicker';
import { LICENSE_CATEGORIES } from '../../src/constants/licenses';
import { TECHNICIAN_TYPES } from '../../src/constants/technicianTypes';
import { OfferWithRequirements } from '../../src/types/offer';
import { SafeTechnicianView } from '../../src/types';
import { MatchScore } from '../../src/types/matching';
import { SafeTechnicianPreview } from '../../src/types/privacy';
import { OfferRequest } from '../../src/types/offerRequest';
import { TechnicianHabilitation } from '../../src/types/technician';
import { AircraftTypeRatingCatalog } from '../../src/types/catalog';

type PreviewMap = Record<string, SafeTechnicianPreview>;
type ScoreMap = Record<string, MatchScore>;

function labelize(value?: string): string {
  if (!value) return 'Not specified';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function availabilityLabel(tech: SafeTechnicianView): string {
  const status = tech.availability.status;
  if (status === 'available') return 'Available now';
  if (status === 'open_to_offers') {
    return tech.availability.availableFrom ? `Available ${tech.availability.availableFrom}` : 'Open to offers';
  }
  if (status === 'unavailable') return 'Unavailable';
  if (tech.availability.immediately) return 'Available now';
  if (tech.availability.availableFrom) return `Available ${tech.availability.availableFrom}`;
  return 'Open to offers';
}

function verificationTone(status: string) {
  return status === 'verified' ? 'success' : 'warning';
}

function offerRequestBadgeTone(status: string): 'success' | 'warning' | 'muted' {
  if (status === 'accepted') return 'success';
  if (status === 'pending') return 'warning';
  return 'muted';
}

function offerRequestBadgeLabel(status: string): string {
  if (status === 'pending') return 'Pending response';
  if (status === 'accepted') return 'Offer accepted';
  return 'Already sent';
}

// Fase 3b screen 3 — "Type ratings" chips (renamed from "Aircraft", matching
// the rename already applied elsewhere — see docs/MISSION_PART66.md) show
// each EXACT rating's displayName from the catalog, never a family/legacy
// code string. Legacy habilitations (aircraftTypeCode only, no rating id)
// have no exact rating to show and are skipped here — same as
// TypeRatingRequirementsEditor/HabilitationsEditor.
function resolveTypeRatingLabels(habilitations: TechnicianHabilitation[], ratingIndex: AircraftRatingIndex): string[] {
  const labels = new Set<string>();
  habilitations.forEach((h) => {
    if (!h.aircraftTypeRatingId) return;
    const rating = ratingIndex.get(h.aircraftTypeRatingId);
    if (rating) labels.add(rating.displayName);
  });
  return [...labels];
}

// Airplane/Helicopter/Mixed badge, derived from the 606-row catalog's own
// productType field — never the legacy hardcoded aircraft category lookup.
// A habilitation with no resolvable rating, or a rating whose productType
// hasn't been backfilled, contributes nothing (never guessed).
function resolveTechnicianProductTypes(
  habilitations: TechnicianHabilitation[],
  ratingIndex: AircraftRatingIndex,
): Set<NonNullable<AircraftTypeRatingCatalog['productType']>> {
  const types = new Set<NonNullable<AircraftTypeRatingCatalog['productType']>>();
  habilitations.forEach((h) => {
    if (!h.aircraftTypeRatingId) return;
    const productType = ratingIndex.get(h.aircraftTypeRatingId)?.productType;
    if (productType) types.add(productType);
  });
  return types;
}

export default function TechnicianSearchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const { results, filters, loading, hasSearched, updateFilter, clearFilters, search } =
    useTechnicianSearch();
  const { ratingIndex } = useAircraftTypeRatingsCatalog();
  const { companyId, companyMemberRole } = useCompanySession();
  const canSendRole = canSendDirectOffers(companyMemberRole);
  const { offerId: preselectedOfferId } = useLocalSearchParams<{ offerId?: string }>();

  const [offers, setOffers] = useState<OfferWithRequirements[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(preselectedOfferId ?? null);
  const [previews, setPreviews] = useState<PreviewMap>({});
  const [scores, setScores] = useState<ScoreMap>({});
  const [offerRequests, setOfferRequests] = useState<OfferRequest[]>([]);
  const [sendingTechId, setSendingTechId] = useState<string | null>(null);

  const loadOfferRequests = useCallback(async () => {
    const reqs = await offerRequestRepository.getForCompany(companyId);
    setOfferRequests(reqs);
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      if (hasSearched) search();
      loadOfferRequests();
    }, [hasSearched, search, loadOfferRequests]),
  );

  const autoSearched = useRef(false);
  useEffect(() => {
    if (preselectedOfferId && !autoSearched.current) {
      autoSearched.current = true;
      setSelectedOfferId(preselectedOfferId);
      search();
    }
  }, [preselectedOfferId, search]);

  useEffect(() => {
    loadOfferRequests();
  }, [loadOfferRequests]);

  useEffect(() => {
    let active = true;
    offerRepository.getAllWithRequirements().then((all) => {
      if (!active) return;
      setOffers(all.filter((offer) => offer.companyId === companyId && isOfferOpenForTechnicians(offer)));
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [offers, selectedOfferId],
  );

  useEffect(() => {
    let active = true;

    async function loadPreviewData() {
      if (!results.length) {
        setPreviews({});
        setScores({});
        return;
      }

      const previewEntries = await Promise.all(
        results.map(async (tech) => {
          const preview = await technicianRepositoryV2.getSafeView(tech.id);
          return [tech.id, preview] as const;
        }),
      );

      const nextPreviews: PreviewMap = {};
      previewEntries.forEach(([id, preview]) => {
        if (preview) nextPreviews[id] = preview;
      });

      const nextScores: ScoreMap = {};
      if (selectedOffer) {
        const scoreEntries = await Promise.all(
          results.map(async (tech) => {
            const full = await technicianRepositoryV2.getWithRelations(tech.id);
            if (!full) return [tech.id, null] as const;
            return [tech.id, calculateOfferTechnicianMatch(selectedOffer, full, ratingIndex)] as const;
          }),
        );
        scoreEntries.forEach(([id, score]) => {
          if (score) nextScores[id] = score;
        });
      }

      if (!active) return;
      setPreviews(nextPreviews);
      setScores(nextScores);
    }

    loadPreviewData();
    return () => {
      active = false;
    };
  }, [results, selectedOffer, ratingIndex]);

  async function handleSearch() {
    await search();
  }

  function handleClearFilters() {
    clearFilters();
    setScores({});
    setPreviews({});
  }

  function getActiveOfferRequest(techId: string): OfferRequest | undefined {
    if (!selectedOfferId) return undefined;
    return offerRequests.find(
      (r) => r.technicianId === techId && r.offerId === selectedOfferId,
    );
  }

  async function handleSendOffer(techId: string) {
    if (!selectedOfferId) return;
    setSendingTechId(techId);
    try {
      await offerRequestRepository.create({
        companyId,
        technicianId: techId,
        offerId: selectedOfferId,
      });
      await loadOfferRequests();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to send the direct offer. Please try again.');
    } finally {
      setSendingTechId(null);
    }
  }

  return (
    <CompanyScreen>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[companyStyles.content, isWide && companyStyles.contentWide]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <CompanyPageHeader
              eyebrow="Search"
              title="Search technicians"
              subtitle="Find privacy-safe technician profiles and calculate match quality only against a selected offer."
              onBack={() => router.back()}
            />

            <CompanyCard style={styles.searchPanel}>
              <View style={styles.panelHeader}>
                <IconBox icon={Radar} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
                <View style={styles.panelCopy}>
                  <Text style={styles.panelTitle}>Search criteria</Text>
                  <Text style={styles.panelSub}>Use a few high-signal filters, then review profiles below.</Text>
                </View>
              </View>

              <View style={styles.fieldGrid}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Country</Text>
                  <TextInput
                    value={filters.country ?? ''}
                    onChangeText={(value) => updateFilter('country', value || undefined)}
                    placeholder="Any country"
                    placeholderTextColor={companyUi.textMuted}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>City</Text>
                  <TextInput
                    value={filters.city ?? ''}
                    onChangeText={(value) => updateFilter('city', value || undefined)}
                    placeholder="Any city"
                    placeholderTextColor={companyUi.textMuted}
                    style={styles.input}
                  />
                </View>
              </View>

              <FilterGroup label="Availability">
                <CompanyChip
                  label="Any"
                  selected={!filters.availabilityStatus}
                  onPress={() => updateFilter('availabilityStatus', undefined)}
                />
                <CompanyChip
                  label="Available now"
                  selected={filters.availabilityStatus === 'available'}
                  onPress={() => updateFilter('availabilityStatus', 'available')}
                />
              </FilterGroup>

              <FilterGroup label="Verification">
                <CompanyChip
                  label="Any"
                  selected={!filters.verificationStatus}
                  onPress={() => updateFilter('verificationStatus', undefined)}
                />
                <CompanyChip
                  label="Verified only"
                  selected={filters.verificationStatus === 'verified'}
                  onPress={() => updateFilter('verificationStatus', 'verified')}
                />
              </FilterGroup>

              <FilterGroup label="License">
                <CompanyChip
                  label="Any"
                  selected={!filters.licenseCategory}
                  onPress={() => updateFilter('licenseCategory', undefined)}
                />
                {LICENSE_CATEGORIES.map((license) => (
                  <CompanyChip
                    key={license.code}
                    label={license.code}
                    selected={filters.licenseCategory === license.code}
                    onPress={() => updateFilter('licenseCategory', license.code)}
                  />
                ))}
              </FilterGroup>

              <CollapsibleAircraftFilter
                selectedKeys={filters.aircraftFamilyKeys ?? []}
                onChange={(next) => updateFilter('aircraftFamilyKeys', next.length ? next : undefined)}
              />

              <View style={styles.searchActions}>
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={handleClearFilters}
                  activeOpacity={0.75}
                >
                  <Text style={styles.secondaryActionText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryAction}
                  onPress={handleSearch}
                  activeOpacity={0.75}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={companyUi.surface} />
                  ) : (
                    <>
                      <Search color={companyUi.surface} size={16} strokeWidth={2} />
                      <Text style={styles.primaryActionText}>Search technicians</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </CompanyCard>

            <CompanyCard style={styles.offerPanel}>
              <View style={styles.panelHeader}>
                <IconBox icon={BriefcaseBusiness} color={companyUi.blue} backgroundColor={companyUi.blueSoft} />
                <View style={styles.panelCopy}>
                  <Text style={styles.panelTitle}>Select offer to send</Text>
                  <Text style={styles.panelSub}>
                    Select a published offer to calculate match scores and send direct offers to technicians.
                  </Text>
                </View>
              </View>
              <View style={styles.chipWrap}>
                <CompanyChip
                  label="No offer selected"
                  selected={!selectedOfferId}
                  onPress={() => setSelectedOfferId(null)}
                />
                {offers.map((offer) => (
                  <CompanyChip
                    key={offer.id}
                    label={offer.title}
                    selected={selectedOfferId === offer.id}
                    onPress={() => setSelectedOfferId(offer.id)}
                  />
                ))}
              </View>
              {offers.length === 0 && (
                <Text style={styles.noOffersHint}>
                  No published offers found. Create and publish an offer to send direct offers to technicians.
                </Text>
              )}
            </CompanyCard>

            {hasSearched && !loading ? (
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>
                  {results.length} {results.length === 1 ? 'result' : 'results'}
                </Text>
                <Text style={styles.resultSub}>
                  {selectedOffer
                    ? `Match shown for "${selectedOffer.title}". Select a technician to send a direct offer.`
                    : 'Select an offer above to calculate match scores and send direct offers.'}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            hasSearched ? (
              <EmptyPanel
                title="No technicians found"
                subtitle="Adjust filters or clear the criteria to broaden the search."
              />
            ) : (
              <EmptyPanel
                title="Start with search criteria"
                subtitle="Search results will appear here as privacy-safe technician cards."
              />
            )
          ) : null
        }
        renderItem={({ item }) => (
          <TechnicianResultCard
            technician={item}
            preview={previews[item.id]}
            selectedOffer={selectedOffer}
            score={scores[item.id]}
            activeOfferRequest={getActiveOfferRequest(item.id)}
            onSendOffer={() => handleSendOffer(item.id)}
            sendingThis={sendingTechId === item.id}
            canSendRole={canSendRole}
            ratingIndex={ratingIndex}
          />
        )}
      />
    </CompanyScreen>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

// Fase 3b screen 3 — collapsed by default, showing only a one-line summary
// of the active selection (same pattern the mission plan sets for map/
// search filters); tap to expand into the shared AircraftFamilyPicker
// (search + tabs + results, getFamilies() over the 606-row catalog — same
// options/labels as screens 1-2, never a hardcoded aircraft list).
function CollapsibleAircraftFilter({
  selectedKeys,
  onChange,
}: {
  selectedKeys: string[];
  onChange: (next: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = selectedKeys.length === 0 ? 'Any aircraft' : `${selectedKeys.length} famil${selectedKeys.length === 1 ? 'y' : 'ies'} selected`;

  return (
    <View style={styles.filterGroup}>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        accessibilityRole="button"
      >
        <Text style={styles.filterLabel}>Aircraft type</Text>
        <View style={styles.collapsibleSummaryRow}>
          <Text style={styles.collapsibleSummary}>{summary}</Text>
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </View>
      </TouchableOpacity>
      {expanded ? <AircraftFamilyPicker selectedKeys={selectedKeys} onChange={onChange} /> : null}
    </View>
  );
}

/**
 * TechnicianResultCard renders a company-safe technician preview card.
 *
 * Identity privacy: `fullName` is only present when canRevealIdentity() is true
 * (accepted offer_request or offer_application for this company+technician pair).
 * The `preview` prop (SafeTechnicianPreview) always stays anonymous.
 *
 * Send offer logic:
 * - No selectedOffer → button disabled, "Select an offer first"
 * - selectedOffer + no activeOfferRequest → "Send offer" (active)
 * - activeOfferRequest pending → "Pending response" (static)
 * - activeOfferRequest accepted → "Offer accepted" (static)
 * - activeOfferRequest other → "Already sent" (static)
 * Duplicate detection is by company_id + technician_id + offer_id.
 */
function TechnicianResultCard({
  technician,
  preview,
  selectedOffer,
  score,
  activeOfferRequest,
  onSendOffer,
  sendingThis,
  canSendRole,
  ratingIndex,
}: {
  technician: SafeTechnicianView;
  preview?: SafeTechnicianPreview;
  selectedOffer: OfferWithRequirements | null;
  score?: MatchScore;
  activeOfferRequest: OfferRequest | undefined;
  onSendOffer: () => void;
  sendingThis: boolean;
  canSendRole: boolean;
  ratingIndex: AircraftRatingIndex;
}) {
  const displayName = technician.fullName ?? technician.anonymousCode;
  const technicianType = preview?.technicianType
    ? TECHNICIAN_TYPES.find((type) => type.code === preview.technicianType)?.label ?? labelize(preview.technicianType)
    : 'Technician';
  const licenseChips = preview?.licenses?.length ? preview.licenses : technician.licenseCategories;
  const typeRatingChips = preview?.habilitations?.length ? resolveTypeRatingLabels(preview.habilitations, ratingIndex) : [];
  const productTypes = preview?.habilitations?.length ? resolveTechnicianProductTypes(preview.habilitations, ratingIndex) : new Set<NonNullable<AircraftTypeRatingCatalog['productType']>>();
  const aircraftCat = productTypes.size > 1 ? 'mixed' : productTypes.size === 1 ? [...productTypes][0] : null;

  // Footer button state — role gates the send action entirely
  const canSend = canSendRole && selectedOffer !== null && !activeOfferRequest && !sendingThis;

  return (
    <CompanyCard style={styles.resultCard}>
      <View style={styles.resultTop}>
        <InitialAvatar label={displayName} color={technician.fullName ? companyUi.accent : companyUi.navy} />
        <View style={styles.resultInfo}>
          <View style={styles.resultNameRow}>
            <Text style={styles.techName} numberOfLines={1}>
              {displayName}
            </Text>
            {selectedOffer && activeOfferRequest ? (
              <CompanyBadge
                label={offerRequestBadgeLabel(activeOfferRequest.status)}
                tone={offerRequestBadgeTone(activeOfferRequest.status)}
                small
              />
            ) : null}
          </View>
          <Text style={styles.techType}>{technicianType}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MapPin color={companyUi.textMuted} size={13} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>
                {technician.city}, {technician.country}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Clock color={companyUi.textMuted} size={13} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>
                {availabilityLabel(technician)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.badgeLine}>
        <CompanyBadge
          label={labelize(technician.verificationStatus)}
          tone={verificationTone(technician.verificationStatus)}
          small
        />
        <CompanyBadge label={`${technician.yearsExperience} years experience`} tone="muted" small />
        {aircraftCat === 'Aeroplane' && <CompanyBadge label="Airplane" tone="info" small />}
        {aircraftCat === 'Helicopter' && <CompanyBadge label="Helicopter" tone="info" small />}
        {aircraftCat === 'mixed' && <CompanyBadge label="Mixed" tone="warning" small />}
        {!technician.fullName ? (
          <View style={styles.lockBadge}>
            <Lock color={companyUi.textSoft} size={12} strokeWidth={2} />
            <Text style={styles.lockText}>Identity locked</Text>
          </View>
        ) : (
          <CompanyBadge label="Identity unlocked" tone="success" small />
        )}
      </View>

      <View style={styles.chipBlock}>
        <Text style={styles.smallLabel}>Licenses</Text>
        <View style={styles.chipWrap}>
          {licenseChips.length ? (
            licenseChips.slice(0, 5).map((license) => <CompanyChip key={license} label={license} />)
          ) : (
            <Text style={styles.mutedText}>No licenses listed</Text>
          )}
        </View>
      </View>

      <View style={styles.chipBlock}>
        <Text style={styles.smallLabel}>Type ratings</Text>
        <View style={styles.chipWrap}>
          {typeRatingChips.length ? (
            typeRatingChips.slice(0, 5).map((rating) => <CompanyChip key={rating} label={rating} />)
          ) : (
            <Text style={styles.mutedText}>No type ratings listed</Text>
          )}
        </View>
      </View>

      <View style={styles.resultFooter}>
        <View style={styles.matchArea}>
          {selectedOffer ? (
            score ? (
              <MatchBadge score={score.total} context="for selected offer" />
            ) : (
              <Text style={styles.matchHint}>Calculating match...</Text>
            )
          ) : (
            <Text style={styles.matchHint}>Select an offer to calculate match.</Text>
          )}
        </View>
        {canSend ? (
          <TouchableOpacity
            style={styles.requestButton}
            onPress={onSendOffer}
            activeOpacity={0.75}
          >
            {sendingThis ? (
              <ActivityIndicator size="small" color={companyUi.surface} />
            ) : (
              <>
                <Send color={companyUi.surface} size={15} strokeWidth={2} />
                <Text style={styles.requestButtonText}>Send offer</Text>
              </>
            )}
          </TouchableOpacity>
        ) : activeOfferRequest ? (
          <View style={styles.requestStatic}>
            <Text style={styles.requestStaticText}>{offerRequestBadgeLabel(activeOfferRequest.status)}</Text>
          </View>
        ) : canSendRole ? (
          <View style={[styles.requestStatic, styles.requestStaticDimmed]}>
            <Text style={styles.requestStaticText}>Select an offer first</Text>
          </View>
        ) : null}
      </View>
    </CompanyCard>
  );
}

const styles = StyleSheet.create({
  headerStack: { gap: 14, marginBottom: 14 },
  searchPanel: { gap: 16 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  panelCopy: { flex: 1, minWidth: 0 },
  panelTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: companyUi.text,
  },
  panelSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  fieldGrid: {
    gap: 10,
  },
  field: { gap: 7 },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: companyUi.border,
    borderRadius: 15,
    paddingHorizontal: 13,
    fontSize: 14,
    fontWeight: '600',
    color: companyUi.text,
    backgroundColor: companyUi.surfaceSoft,
  },
  filterGroup: { gap: 8 },
  filterLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  collapsibleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapsibleSummary: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.textMuted,
  },
  chevron: {
    fontSize: 14,
    fontWeight: '700',
    color: companyUi.textMuted,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  searchActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surface,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: companyUi.accent,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: companyUi.surface,
  },
  offerPanel: { gap: 14 },
  noOffersHint: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textMuted,
    fontStyle: 'italic',
  },
  resultHeader: { gap: 2 },
  resultTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: companyUi.text,
  },
  resultSub: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  resultCard: {
    gap: 14,
    marginBottom: 12,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  resultInfo: { flex: 1, minWidth: 0 },
  resultNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  techName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: companyUi.text,
  },
  techType: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  metaRow: {
    marginTop: 9,
    gap: 7,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  badgeLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  lockBadge: {
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lockText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  chipBlock: { gap: 7 },
  smallLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: companyUi.textMuted,
  },
  mutedText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: companyUi.textMuted,
  },
  resultFooter: {
    borderTopWidth: 1,
    borderTopColor: companyUi.borderSoft,
    paddingTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  matchArea: { flex: 1, minWidth: 0 },
  matchHint: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  requestButton: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: companyUi.accent,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  requestButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: companyUi.surface,
  },
  requestStatic: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: companyUi.surfaceSoft,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  requestStaticDimmed: {
    opacity: 0.6,
  },
  requestStaticText: {
    fontSize: 13,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
});
