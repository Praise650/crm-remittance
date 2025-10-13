// backend/models/fellowshipModel.js
const mongoose = require('mongoose');

const fellowshipSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true, // Fellowship names should be unique
        },
        address: {
            type: String,
            required: true,
        },
        // Link to the Zone it belongs to (Zonal Coordinator's zone)
        zone: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Zone', // Will link to a 'Zone' model later
            required: true, // A fellowship must belong to a zone
        },
        // Other profile details for the fellowship
        averageMonthlyAttendance: {
            type: Number,
            default: 0,
        },
        averageTithe: {
            type: Number,
            default: 0,
        },
        rankInZone: {
            type: Number,
            default: 0, // This will be calculated later
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        presidentPhoneNumber: {
            type: String,
            required: true,
        },
        // Reference to the actual user who is the president
        president: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            unique: true, // One president per fellowship, one fellowship per president
            required: false // Can be null initially until a president user is assigned
        }
    },
    {
        timestamps: true, // Adds createdAt and updatedAt fields
    }
);

const Fellowship = mongoose.model('Fellowship', fellowshipSchema);

module.exports = Fellowship;