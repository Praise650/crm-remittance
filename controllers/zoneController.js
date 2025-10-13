// backend/controllers/zoneController.js
const asyncHandler = require('express-async-handler');
const Zone = require('../models/zoneModel');
const User = require('../models/User');

// @desc    Create a new zone
// @route   POST /api/zones
// @access  Private/Administrator
const createZone = asyncHandler(async (req, res) => {
    // Only Administrator can create zones for now.
    // This will be enforced by middleware later.
    const { name, officeAddress } = req.body;

    if (!name) {
        res.status(400);
        throw new Error('Please enter zone name');
    }

    // Check if zone with this name already exists
    const zoneExists = await Zone.findOne({ name });
    if (zoneExists) {
        res.status(400);
        throw new Error('Zone with this name already exists');
    }

    const zone = await Zone.create({
        name,
        officeAddress,
    });

    if (zone) {
        res.status(201).json(zone);
    } else {
        res.status(400);
        throw new Error('Invalid zone data');
    }
});

// @desc    Get all zones
// @route   GET /api/zones
// @access  Private (all roles that need to see zones)
const getZones = asyncHandler(async (req, res) => {
    const zones = await Zone.find({}).populate('coordinator', 'name email');
    res.status(200).json(zones);
});

// @desc    Get single zone by ID
// @route   GET /api/zones/:id
// @access  Private (varies by role)
const getZoneById = asyncHandler(async (req, res) => {
    const zone = await Zone.findById(req.params.id).populate('coordinator', 'name email');

    if (zone) {
        res.status(200).json(zone);
    } else {
        res.status(404);
        throw new Error('Zone not found');
    }
});

// @desc    Update a zone
// @route   PUT /api/zones/:id
// @access  Private/Administrator
const updateZone = asyncHandler(async (req, res) => {
    const { name, officeAddress, averageTithe, averageAttendance } = req.body;

    const zone = await Zone.findById(req.params.id);

    if (zone) {
        zone.name = name || zone.name;
        zone.officeAddress = officeAddress || zone.officeAddress;
        zone.averageTithe = averageTithe !== undefined ? averageTithe : zone.averageTithe;
        zone.averageAttendance = averageAttendance !== undefined ? averageAttendance : zone.averageAttendance;

        const updatedZone = await zone.save();
        res.status(200).json(updatedZone);
    } else {
        res.status(404);
        throw new Error('Zone not found');
    }
});

// @desc    Delete a zone
// @route   DELETE /api/zones/:id
// @access  Private/Administrator (or Super Admin)
const deleteZone = asyncHandler(async (req, res) => {
    const zone = await Zone.findById(req.params.id);

    if (zone) {
        // Before deleting a zone, you might want to handle associated fellowships
        // e.g., delete them, reassign them, or prevent deletion if fellowships exist.
        // For simplicity now, we just delete the zone.
        await Zone.deleteOne({ _id: zone._id });
        res.status(200).json({ message: 'Zone removed' });
    } else {
        res.status(404);
        throw new Error('Zone not found');
    }
});

module.exports = {
    createZone,
    getZones,
    getZoneById,
    updateZone,
    deleteZone,
};