import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ITINERARY_CATEGORIES = ['flight', 'lodging', 'activity', 'dining', 'transit'];
export const ITINERARY_STATUSES = ['planned', 'booked', 'cancelled'];

export const itineraryItemSchema = new Schema(
  {
    tripId: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      required: [true, 'tripId reference is required'],
      immutable: true,
    },
    dayNumber: {
      type: Number,
      required: [true, 'dayNumber is required'],
      min: [1, 'dayNumber must be >= 1'],
      max: [90, 'dayNumber must be <= 90'],
      validate: {
        validator: Number.isInteger,
        message: 'dayNumber must be an integer',
      },
    },
    sortOrder: {
      type: Number,
      required: true,
      min: [0, 'sortOrder must be >= 0'],
      validate: {
        validator: Number.isInteger,
        message: 'sortOrder must be an integer',
      },
    },
    category: {
      type: String,
      enum: {
        values: ITINERARY_CATEGORIES,
        message: 'category must be one of flight, lodging, activity, dining, transit',
      },
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Activity title is required'],
      trim: true,
      minlength: [2, 'Activity title must be at least 2 characters'],
      maxlength: [120, 'Activity title must be at most 120 characters'],
    },
    startTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be 24-hour HH:MM format'],
    },
    locationName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    estimatedCostCents: {
      type: Number,
      default: 0,
      min: [0, 'estimatedCostCents cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'estimatedCostCents must be an integer',
      },
    },
    status: {
      type: String,
      enum: ITINERARY_STATUSES,
      default: 'planned',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: [true, 'createdBy userId is required'],
      immutable: true,
    },
    lastEditedBy: {
      type: Schema.Types.ObjectId,
      required: [true, 'lastEditedBy userId is required'],
    },
  },
  {
    collection: 'itinerary_items',
    timestamps: true,
  }
);

// Index 2: Ordered day-by-day itinerary retrieval for a trip (supports prefix query by tripId or tripId + dayNumber).
itineraryItemSchema.index(
  { tripId: 1, dayNumber: 1, sortOrder: 1 },
  { name: 'idx_trip_day_order' }
);

export const ItineraryItem =
  mongoose.models.ItineraryItem || mongoose.model('ItineraryItem', itineraryItemSchema);
