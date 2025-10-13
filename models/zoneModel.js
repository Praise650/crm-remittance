// backend/models/zoneModel.js
const mongoose = require('mongoose');

const zoneSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true, // Zone names should be unique
        },
        officeAddress: {
            type: String,
        },
        averageTithe: {
            type: Number,
            default: 0, // Calculated from all fellowships in the zone
        },
        averageAttendance: {
            type: Number,
            default: 0, // Calculated from all fellowships in the zone
        },
        rankAmongZones: {
            type: Number,
            default: 0, // Calculated later
        },
        // Reference to the Zonal Coordinator user
        coordinator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            unique: true, // One coordinator per zone, one zone per coordinator
            required: false // Can be null initially until a coordinator user is assigned
        }
    },
    {
        timestamps: true,
    }
);

const Zone = mongoose.model('Zone', zoneSchema);

module.exports = Zone;