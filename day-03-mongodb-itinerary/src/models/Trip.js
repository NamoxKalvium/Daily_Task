import mongoose from 'mongoose';

const { Schema } = mongoose;

const collaboratorSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Collaborator userId is required'],
    },
    role: {
      type: String,
      enum: {
        values: ['editor', 'viewer'],
        message: 'Collaborator role must be either editor or viewer',
      },
      required: true,
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

export const tripSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Trip title is required'],
      trim: true,
      minlength: [3, 'Trip title must be at least 3 characters'],
      maxlength: [100, 'Trip title must be at most 100 characters'],
    },
    destination: {
      city: {
        type: String,
        required: [true, 'Destination city is required'],
        trim: true,
        minlength: 2,
        maxlength: 80,
      },
      countryCode: {
        type: String,
        required: [true, 'ISO-3166 alpha-2 countryCode is required'],
        uppercase: true,
        match: [/^[A-Z]{2}$/, 'countryCode must be a 2-letter uppercase ISO code (e.g. JP, IT)'],
      },
    },
    startDate: {
      type: Date,
      required: [true, 'startDate is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'endDate is required'],
      validate: {
        validator(value) {
          return !this.startDate || value >= this.startDate;
        },
        message: 'endDate must be on or after startDate',
      },
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: [true, 'ownerId is required'],
      immutable: true,
    },
    collaborators: {
      type: [collaboratorSchema],
      default: [],
      validate: {
        validator(list) {
          return list.length <= 25;
        },
        message: 'A trip cannot have more than 25 collaborators',
      },
    },
    visibility: {
      type: String,
      enum: ['private', 'shared'],
      default: 'private',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'trips',
    timestamps: true,
  }
);

// Index 1: Dashboard query for active trips shared with a collaborator, sorted newest-first.
tripSchema.index(
  { 'collaborators.userId': 1, isArchived: 1, startDate: -1 },
  { name: 'idx_collaborator_active_trips' }
);

export const Trip = mongoose.models.Trip || mongoose.model('Trip', tripSchema);
