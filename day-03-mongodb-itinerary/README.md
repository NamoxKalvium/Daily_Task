# Day 3 – MongoDB Schema & Indexes (Travel Itinerary Planner)

MongoDB/Mongoose schema design for a **travel itinerary planner** supporting **saved trips** and **real-time itinerary collaboration**.

## 2 Related Entities

1. **`Trip` (`src/models/Trip.js`, collection: `trips`)**:
   - Stores trip metadata (`title`, `destination.city`, `destination.countryCode`, `startDate`, `endDate`), `ownerId`, `visibility` (`private | shared`), `isArchived`, and bounded `collaborators` (`[{ userId, role: 'editor' | 'viewer', invitedAt }]`).
   - **Validation**: Title length (`3..100`), uppercase 2-letter ISO `countryCode`, `endDate >= startDate` date-range invariant, collaborator role enum, and `<= 25` collaborators cap.
2. **`ItineraryItem` (`src/models/ItineraryItem.js`, collection: `itinerary_items`)**:
   - Stores individual activities/bookings (`tripId`, `dayNumber`, `sortOrder`, `category`, `title`, `startTime`, `locationName`, `estimatedCostCents`, `status`, `createdBy`, `lastEditedBy`).
   - **Validation**: `tripId` required & immutable, `dayNumber` integer `1..90`, `sortOrder` non-negative integer, `category` enum (`flight | lodging | activity | dining | transit`), 24h `HH:MM` `startTime` regex, and integer non-negative `estimatedCostCents`.

## Relationship Strategy (Hybrid: Embed Collaborators, Reference Itinerary Items)

- **Embed `collaborators` inside `Trip`**: A trip has a small, bounded access-control list (`<= 25` members) needed on every authorization check. Embedding lets the API verify `editor`/`viewer` permissions in a single document read.
- **Reference `tripId` from `ItineraryItem` (`1:Many`)**: A collaborative multi-week trip can accumulate hundreds of items edited concurrently by multiple collaborators. Referencing `tripId` avoids MongoDB's 16 MB document limit, prevents array write-contention when two editors modify different days at the same time, and enables single-day queries without loading the full trip payload.

## Indexes, Queries Improved & Trade-Offs

### Index 1: `trips` — `{ "collaborators.userId": 1, isArchived: 1, startDate: -1 }` (`idx_collaborator_active_trips`)
- **Query improved**: Dashboard listing of active trips shared with a collaborator, sorted by newest `startDate`:
  ```js
  Trip.find({ 'collaborators.userId': userId, isArchived: false }).sort({ startDate: -1 });
  ```
  Eliminates a collection scan and blocking in-memory sort.
- **Trade-off**: Because `collaborators` is an array, MongoDB builds a **multikey index** with one index entry per collaborator per trip, increasing index storage and write amplification whenever collaborators are invited or removed.

### Index 2: `itinerary_items` — `{ tripId: 1, dayNumber: 1, sortOrder: 1 }` (`idx_trip_day_order`)
- **Query improved**: Chronological day-by-day schedule rendering for a trip (or a single day via left-prefix matching):
  ```js
  ItineraryItem.find({ tripId, dayNumber: 2 }).sort({ sortOrder: 1 });
  ```
  Returns items already ordered in B-tree leaf order with zero in-memory sort stage.
- **Trade-off**: Drag-and-drop reordering across a day updates `sortOrder` on multiple `ItineraryItem` documents, requiring index key updates and adding write overhead on bulk itinerary imports.

## Run & Verify

```bash
npm install
npm test
npm run verify
```

## Verification Output (`node --test` + `scripts/verify.js`)

- `npm test` (`test/itinerarySchema.test.js`): **3/3 tests passed** (`110.9ms`).
- `npm run verify` output:

```text
=== DEFINED INDEXES ===
Trip indexes: [[{"collaborators.userId":1,"isArchived":1,"startDate":-1},{"name":"idx_collaborator_active_trips","background":true}]]
ItineraryItem indexes: [[{"tripId":1,"dayNumber":1,"sortOrder":1},{"name":"idx_trip_day_order","background":true}]]

=== EXPECTED VALIDATION ERRORS ON INVALID TRIP ===
- destination.countryCode: countryCode must be a 2-letter uppercase ISO code (e.g. JP, IT)
- endDate: endDate must be on or after startDate
- collaborators.0.role: Collaborator role must be either editor or viewer
```
