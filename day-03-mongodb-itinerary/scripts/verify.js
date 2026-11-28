import mongoose from 'mongoose';
import { ItineraryItem } from '../src/models/ItineraryItem.js';
import { Trip } from '../src/models/Trip.js';

const ownerId = new mongoose.Types.ObjectId();
const collaboratorId = new mongoose.Types.ObjectId();

const trip = new Trip({
  title: 'Kyoto Autumn Rail & Temples',
  destination: { city: 'Kyoto', countryCode: 'jp' },
  startDate: new Date('2026-11-10T00:00:00Z'),
  endDate: new Date('2026-11-16T00:00:00Z'),
  ownerId,
  visibility: 'shared',
  collaborators: [{ userId: collaboratorId, role: 'editor' }],
});

await trip.validate();

const item = new ItineraryItem({
  tripId: trip._id,
  dayNumber: 2,
  sortOrder: 1,
  category: 'activity',
  title: 'Fushimi Inari early hike',
  startTime: '06:30',
  locationName: 'Fushimi Inari Taisha',
  estimatedCostCents: 0,
  status: 'planned',
  createdBy: collaboratorId,
  lastEditedBy: collaboratorId,
});

await item.validate();

console.log('=== VALIDATED TRIP DOCUMENT ===');
console.log(JSON.stringify(trip.toObject(), null, 2));

console.log('\n=== VALIDATED ITINERARY ITEM DOCUMENT ===');
console.log(JSON.stringify(item.toObject(), null, 2));

console.log('\n=== DEFINED INDEXES ===');
console.log('Trip indexes:', JSON.stringify(Trip.schema.indexes()));
console.log('ItineraryItem indexes:', JSON.stringify(ItineraryItem.schema.indexes()));

const invalidTrip = new Trip({
  title: 'Bad',
  destination: { city: 'Paris', countryCode: 'FRA' },
  startDate: new Date('2026-12-10T00:00:00Z'),
  endDate: new Date('2026-12-05T00:00:00Z'),
  ownerId,
  collaborators: [{ userId: collaboratorId, role: 'admin' }],
});

try {
  await invalidTrip.validate();
} catch (err) {
  console.log('\n=== EXPECTED VALIDATION ERRORS ON INVALID TRIP ===');
  for (const [field, detail] of Object.entries(err.errors)) {
    console.log(`- ${field}: ${detail.message}`);
  }
}
