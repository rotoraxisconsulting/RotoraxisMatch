# V2-S0B H4 — Map Match % Context Fix Report

**Date:** 2026-05-31  
**Finding:** H4 — Map marker popups displayed "X% match" using `scoreMapMatch()`, a filter-alignment score with no offerId. This violated the product rule: no match percentage may be shown without a specific Offer + Technician context.  
**Status:** Resolved. Match % removed from marker popups. Send-direct-offer offer list remains unchanged.

---

## 1. What Was Wrong

`useMapTechnicians.ts` computed a `scoreMapMatch()` value for each technician based on which map filters were active (licenses, aircraft types, verification status, availability). This number was set as `technician.matchingScore` and passed to the map components.

Both map implementations displayed it as `"X% match"` in the marker popup without any offer involved:

**Native (WebView Leaflet HTML):**
```javascript
var scoreHtml = (m.matchingScore != null)
  ? '<div ...>' + m.matchingScore + '% match</div>'
  : '';
```

**Web (react-leaflet Popup JSX):**
```jsx
{t.matchingScore !== undefined && (
  <div style={{ color: scoreColor(t.matchingScore) }}>
    {t.matchingScore}% match
  </div>
)}
```

With no filters active, every popup showed "0% match" (or "10% match" for verified technicians). With filters active, the popup showed a filter-relevance percentage labeled identically to offer-specific match scores. Both cases violated the product rule.

---

## 2. What Was Correct (unchanged)

The send-direct-offer flow in the map was already offer-specific and is untouched:

- `app/map.tsx` calls `getOfferMatchesForTechnician(technician.id)` per technician.
- `getOfferMatchesForTechnician` calls `calculateOfferTechnicianMatch(offer, technician)` for each published offer.
- Each entry in `offerMatchesByTechnician[techId]` carries `offerId`, `score`, and `label`.
- The `OfferSelectionSheet` (native) and `PopupOfferSelector` (Leaflet) render `option.score%` tied to a specific named offer.
- This is correct and compliant — the score is offer-specific.

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/components/TechnicianMap.native.tsx` | Removed `scoreColor()` JS function from Leaflet HTML string; removed `scoreHtml` variable and its `+scoreHtml+` insertion in `buildPopup()` |
| `src/components/TechnicianMapLeafletImpl.tsx` | Removed `scoreColor()` TypeScript function (now dead code); removed `{t.matchingScore !== undefined && <div>X% match</div>}` block from the CircleMarker Popup |
| `src/state/useMapTechnicians.ts` | Added comment clarifying `scoreMapMatch` is internal filter-relevance scoring for result ordering only, never displayed in UI |

---

## 4. scoreMapMatch Status

`scoreMapMatch()` **remains in `useMapTechnicians.ts`** and continues to be used for sorting the filtered result list:

```typescript
.map((technician) => ({
  ...technician,
  matchingScore: scoreMapMatch(technician, selected),  // internal sort key
}))
.sort((a, b) => (b.matchingScore ?? 0) - (a.matchingScore ?? 0));
```

This sort is valid: when filters are active, more-relevant technicians float to the top. The `matchingScore` field is set on the `SafeTechnicianView` objects in memory, but is no longer rendered in any UI element. It is now a purely internal ordering signal.

---

## 5. Match % Compliance — Final State

| Location | Offer context? | Shows match %? | Compliant? |
|----------|---------------|----------------|------------|
| Map marker popup | ❌ None | **No** (removed) | ✅ Yes |
| Map "Send direct offer" sheet — per-offer rows | ✅ Per offer | Yes — `option.score%` | ✅ Yes |
| Company search — no offer selected | ❌ None | No ("Select an offer") | ✅ Yes |
| Company search — offer selected | ✅ Per offer | Yes — `score.total%` | ✅ Yes |
| Offer detail ranked technician list | ✅ Per offer | Yes | ✅ Yes |
| Technician browse offers — per offer card | ✅ Per offer | Yes | ✅ Yes |

---

## 6. QA Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `node scripts/validateSeeds.js` | ✅ 0 errors, 0 warnings |
| `npx expo export --platform web` | ✅ 36 routes exported |

**H4 is fully resolved.**
