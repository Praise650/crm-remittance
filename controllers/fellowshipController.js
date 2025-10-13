// backend/controllers/fellowshipController.js
const asyncHandler = require('express-async-handler');
const Fellowship = require('../models/fellowshipModel');
const User = require('../models/User'); // To potentially update user's fellowship
const Zone = require('../models/zoneModel'); // To check if zone exists

// @desc    Create a new fellowship
// @route   POST /api/fellowships
// @access  Private/Zonal Coordinator, Administrator, Super Admin
const createFellowship = asyncHandler(async (req, res) => {
    const { name, address, zoneId, email, presidentPhoneNumber } = req.body;
    const user = req.user; // This 'req.user' object is populated by your 'protect' middleware

    // 1. Basic input validation
    if (!name || !address || !zoneId || !email || !presidentPhoneNumber) {
        res.status(400);
        throw new Error('Please fill all required fellowship fields');
    }

    // 2. Check if the provided zoneId exists
    const zone = await Zone.findById(zoneId);
    if (!zone) {
        res.status(404); // Use 404 if the resource (zone) is not found
        throw new Error('Associated Zone not found');
    }

    // 3. --- CRUCIAL: Role-based Zone Authorization ---
    // If the authenticated user is a zonal_coordinator, ensure the submitted zoneId matches their assigned zone.
    if (user.role === 'zonal_coordinator') {
        // user.zone is the ObjectId of the zone assigned to the zonal coordinator
        // zoneId is the string ID from the request body
        if (!user.zone || user.zone.toString() !== zoneId.toString()) {
            res.status(403); // Forbidden: User is authenticated but not authorized for this specific action/resource
            throw new Error('As a Zonal Coordinator, you are only authorized to create fellowships within your assigned zone.');
        }
    }
    // For 'administrator' and 'super_admin' roles, the `authorizeRoles` middleware
    // already grants them permission to access this route, and they are allowed to
    // specify any valid zoneId.

    // 4. Check for duplicate fellowship name or email
    const fellowshipExists = await Fellowship.findOne({ $or: [{ name }, { email }] });
    if (fellowshipExists) {
        res.status(400);
        throw new Error('Fellowship with this name or email already exists');
    }

    // 5. Create the new fellowship
    const fellowship = await Fellowship.create({
        name,
        address,
        zone: zoneId, // Link to the Zone ObjectId
        email,
        presidentPhoneNumber,
    });

    // 6. Respond with the created fellowship or an error
    if (fellowship) {
        res.status(201).json(fellowship);
    } else {
        res.status(400);
        throw new Error('Invalid fellowship data'); // Generic error if Mongoose create fails unexpectedly
    }
});

// @desc    Get all fellowships (with optional filtering by zone)
// @route   GET /api/fellowships
// @access  Private (varies by role)
const getFellowships = asyncHandler(async (req, res) => {
    // Implement logic to filter based on user role and zone
    // For now, let's return all, or filter by a query parameter
    const { zoneId } = req.query; // e.g., /api/fellowships?zoneId=60f...
    const user = req.user; // Get user from middleware

    let query = {};

    // Filter by user's zone if they are a zonal coordinator
    if (user.role === 'zonal_coordinator' && user.zone) {
        query.zone = user.zone;
    } else if (zoneId) {
        // Allow filtering by zoneId if provided and user is not a zonal coordinator
        // (e.g., admin or super admin querying specific zones)
        query.zone = zoneId;
    }

    const fellowships = await Fellowship.find(query).populate('zone', 'name').populate('president', 'name email');
    res.status(200).json(fellowships);
});


// @desc    Get single fellowship by ID
// @route   GET /api/fellowships/:id
// @access  Private (varies by role)
const getFellowshipById = asyncHandler(async (req, res) => {
    const fellowship = await Fellowship.findById(req.params.id).populate('zone', 'name').populate('president', 'name email');
    const user = req.user; // Get user from middleware

    if (!fellowship) {
        res.status(404);
        throw new Error('Fellowship not found');
    }

    // Additional authorization for viewing a single fellowship
    // Zonal coordinator can only view fellowships in their zone
    if (user.role === 'zonal_coordinator') {
        if (!user.zone || fellowship.zone.toString() !== user.zone.toString()) {
            res.status(403);
            throw new Error('Not authorized to view this fellowship.');
        }
    }
    // Other roles (admin, super_admin, national_coordinator) can view all
    // Fellowship presidents can view their own fellowship (handled by frontend or specific route)

    res.status(200).json(fellowship);
});

// @desc    Update a fellowship
// @route   PUT /api/fellowships/:id
// @access  Private/Zonal Coordinator, Administrator, Super Admin
const updateFellowship = asyncHandler(async (req, res) => {
    const { name, address, email, presidentPhoneNumber, averageMonthlyAttendance, averageTithe, zoneId } = req.body; // Include zoneId in destructuring
    const user = req.user; // Get user from middleware

    const fellowship = await Fellowship.findById(req.params.id);

    if (!fellowship) {
        res.status(404);
        throw new Error('Fellowship not found');
    }

    // Authorization for updating: Zonal coordinator can only update fellowships in their zone
    if (user.role === 'zonal_coordinator') {
        if (!user.zone || fellowship.zone.toString() !== user.zone.toString()) {
            res.status(403);
            throw new Error('Not authorized to update fellowships outside your zone.');
        }
        // Zonal coordinators cannot change the zone of a fellowship
        if (zoneId && zoneId.toString() !== fellowship.zone.toString()) {
             res.status(403);
             throw new Error('Zonal Coordinators cannot change the assigned zone of a fellowship.');
        }
    }
    // Admin/Super Admin can update any fellowship and change its zone

    if (fellowship) {
        fellowship.name = name || fellowship.name;
        fellowship.address = address || fellowship.address;
        fellowship.email = email || fellowship.email;
        fellowship.presidentPhoneNumber = presidentPhoneNumber || fellowship.presidentPhoneNumber;
        fellowship.averageMonthlyAttendance = averageMonthlyAttendance !== undefined ? averageMonthlyAttendance : fellowship.averageMonthlyAttendance;
        fellowship.averageTithe = averageTithe !== undefined ? averageTithe : fellowship.averageTithe;
        // Only allow zone to be updated by roles that are not zonal_coordinator
        if (zoneId && user.role !== 'zonal_coordinator') {
            const newZone = await Zone.findById(zoneId);
            if (!newZone) {
                res.status(404);
                throw new Error('New Zone not found');
            }
            fellowship.zone = zoneId;
        }

        const updatedFellowship = await fellowship.save();
        res.status(200).json(updatedFellowship);
    } else {
        res.status(404);
        throw new Error('Fellowship not found');
    }
});


// @desc    Delete a fellowship
// @route   DELETE /api/fellowships/:id
// @access  Private/Administrator (or Super Admin)
const deleteFellowship = asyncHandler(async (req, res) => {
    const fellowship = await Fellowship.findById(req.params.id);
    const user = req.user; // Get user from middleware

    if (!fellowship) {
        res.status(404);
        throw new Error('Fellowship not found');
    }

    // Authorization for deletion: Zonal coordinator cannot delete fellowships
    // Only Admin or Super Admin can delete
    if (user.role === 'zonal_coordinator') {
        res.status(403);
        throw new Error('Zonal Coordinators are not authorized to delete fellowships.');
    }

    if (fellowship) {
        await Fellowship.deleteOne({ _id: fellowship._id }); // Mongoose 6+ uses deleteOne or deleteMany
        res.status(200).json({ message: 'Fellowship removed' });
    } else {
        res.status(404);
        throw new Error('Fellowship not found');
    }
});

module.exports = {
    createFellowship,
    getFellowships,
    getFellowshipById,
    updateFellowship,
    deleteFellowship,
};