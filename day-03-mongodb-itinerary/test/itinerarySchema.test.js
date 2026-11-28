import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ItineraryItem } from '../src/models/ItineraryItem.js';
import { Trip } from '../src/models/Trip.js';

describe('Travel Itinerary MongoDB Schemas & Indexes', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const editorId = new mongoose.Types.ObjectId();

  it('validates a valid shared Trip and referenced ItineraryItem', async () => {
    const trip = new Trip({
      title: 'Kyoto Autumn Rail & Temples',
      destination: { city: 'Kyoto', countryCode: 'jp' },
      startDate: new Date('2026-11-10T00:00:00Z'),
      endDate: new Date('2026-11-16T00:00:00Z'),
      ownerId,
      visibility: 'shared',
      collaborators: [{ userId: editorId, role: 'editor' }],
    });
    await trip.validate();
    assert.equal(trip.destination.countryCode, 'JP');

    const item = new ItineraryItem({
      tripId: trip._id,
      dayNumber: 1,
      sortOrder: 0,
      category: 'lodging',
      title: 'Check in at Machiya Ryokan',
      startTime: '15:00',
      estimatedCostCents: 24000,
      createdBy: editorId,
      lastEditedBy: editorId,
    });
    await item.validate();
    assert.equal(String(item.tripId), String(trip._id));
  });

  it('rejects invalid date range, ISO country code, collaborator role, and bad itinerary time', async () => {
    const badTrip = new Trip({
      title: 'Broken Trip',
      destination: { city: 'Rome', countryCode: 'ITA' },
      startDate: new Date('2026-10-12T00:00:00Z'),
      endDate: new Date('2026-10-10T00:00:00Z'),
      ownerId,
      collaborators: [{ userId: editorId, role: 'superadmin' }],
    });

    await assert.rejects(
      () => badTrip.validate(),
      (err) => {
        assert.ok(err.errors['destination.countryCode']);
        assert.ok(err.errors.endDate);
        assert.ok(err.errors['collaborators.0.role']);
        return true;
      }
    );

    const badItem = new ItineraryItem({
      tripId: new mongoose.Types.ObjectId(),
      dayNumber: 0,
      sortOrder: -1,
      category: 'teleport',
      title: 'A',
      startTime: '25:99',
      estimatedCostCents: -100,
      createdBy: editorId,
      lastEditedBy: editorId,
    });

    await assert.rejects(
      () => badItem.validate(),
      (err) => {
        assert.ok(err.errors.dayNumber);
        assert.ok(err.errors.sortOrder);
        assert.ok(err.errors.category);
        assert.ok(err.errors.startTime);
        assert.ok(err.errors.estimatedCostCents);
        return true;
      }
    );
  });

  it('defines the two compound indexes on Trip and ItineraryItem', () => {
    const tripIndexes = Trip.schema.indexes();
    assert.deepEqual(tripIndexes[0][0], {
      'collaborators.userId': 1,
      isArchived: 1,
      startDate: -1,
    });
    assert.equal(tripIndexes[0][1].name, 'idx_collaborator_active_trips');

    const itemIndexes = ItineraryItem.schema.indexes();
    assert.deepEqual(itemIndexes[0][0], {
      tripId: 1,
      dayNumber: 1,
      sortOrder: 1,
    });
    assert.equal(itemIndexes[0][1].name, 'idx_trip_day_order');
  });
});
