import { AircraftTypeRatingCatalog } from '../types/catalog';
import { filterAircraftTypeRatings, sortAircraftTypeRatings } from './aircraftTypeRatings';

// Fase 3b — the single source of UI-facing "views" over an already-loaded
// aircraft_type_ratings snapshot (from aircraftTypeRatingsCache /
// useAircraftTypeRatingsCatalog). NO fetching logic lives here — every
// function takes the ratings array the caller already has, same contract as
// aircraftTypeRatings.ts. This is the layer the offer form, technician
// profile, company search and map screens are meant to import for anything
// catalog-derived (family grouping, product-type facets, search) instead of
// each rolling its own filter/hardcoded list.
//
// aircraftTypeRatings.ts stays the matching-engine-facing home for the
// lower-level primitives (search ranking, sort order) — this module is a
// thin, UI-shaped layer on top of those, not a reimplementation.

// A broad/approximate grouping for filters that operate at the family level
// (no engine) — e.g. an offer's "Approximate filter" chips, or a collapsed
// map/search filter section. Never used for exact type-rating requirements,
// which always reference a single rating id.
//
// Grouped by manufacturer + aircraftFamily together, never aircraftFamily
// alone — the same compound key areRatingsRelated() uses, so two
// unrelated ratings that happen to share a family string across
// manufacturers are never folded into one group.
export interface AircraftFamilyGroup {
  key: string;
  manufacturer: string;
  aircraftFamily: string;
  // Computed, not a catalog column — aircraftFamily has no single-engine
  // displayName of its own to reuse. "<aircraftFamily> family" verbatim
  // (e.g. "A318/A319/A320/A321 family"), deliberately not shortened to a
  // single model — every family member is a real, distinct catalog value
  // and dropping some from the label would misrepresent what the filter
  // actually covers. Confirmed over the Fase 3 reference mockup's
  // shortened "A320 family" chip — accuracy over brevity.
  displayName: string;
  ratings: AircraftTypeRatingCatalog[]; // every rating (any engine) in this family, sorted
}

export function getFamilies(ratings: AircraftTypeRatingCatalog[]): AircraftFamilyGroup[] {
  const groups = new Map<string, AircraftFamilyGroup>();

  for (const rating of ratings) {
    const key = `${rating.manufacturer}::${rating.aircraftFamily}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ratings.push(rating);
    } else {
      groups.set(key, {
        key,
        manufacturer: rating.manufacturer,
        aircraftFamily: rating.aircraftFamily,
        displayName: `${rating.aircraftFamily} family`,
        ratings: [rating],
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, ratings: sortAircraftTypeRatings(group.ratings) }))
    .sort((a, b) => {
      const priorityDiff = (b.ratings[0]?.priority ?? 0) - (a.ratings[0]?.priority ?? 0);
      return priorityDiff !== 0 ? priorityDiff : a.displayName.localeCompare(b.displayName);
    });
}

// Ratings matching a specific productType facet (the Airplanes/Helicopters
// tabs, Fase 3b.4). A rating with productType undefined (not backfilled)
// matches NO facet — never guessed into one — so it simply won't appear
// under either tab; it still appears everywhere the caller shows the
// unfiltered catalog (e.g. plain search with no facet selected).
export function getByProductType(
  ratings: AircraftTypeRatingCatalog[],
  productType: NonNullable<AircraftTypeRatingCatalog['productType']>,
): AircraftTypeRatingCatalog[] {
  return ratings.filter((rating) => rating.productType === productType);
}

// Centralized catalog search — every screen with a rating search box
// imports this rather than rolling its own filter. Pass-through to
// filterAircraftTypeRatings (aircraftTypeRatings.ts already owns the actual
// ranking logic: manufacturer/family/engine/EASA denomination/displayName/
// aliases, exact > starts-with > contains, tie-broken by priority) — kept as
// its own named export so UI code has one obvious "search the catalog"
// entry point under the views module, not the matching-engine one.
export function searchRatings(ratings: AircraftTypeRatingCatalog[], query: string): AircraftTypeRatingCatalog[] {
  return filterAircraftTypeRatings(ratings, query);
}
