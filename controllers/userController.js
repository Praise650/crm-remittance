// backend/controllers/userController.js
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Fellowship = require('../models/fellowshipModel');
const Zone = require('../models/zoneModel');
const generateToken = require("../utils/generateToken");

// @desc    Admin/Super Admin creates new users (Admin, Accountant, Coordinators)
// @route   POST /api/users/create-admin-user
// @access  Private/Administrator, Super Admin
const createAdminUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, zoneId } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400);
    throw new Error("Please fill all required fields: name, email, password, role.");
  }

  const allowedRoles = [
    "administrator",
    "accountant",
    "zonal_coordinator",
    "national_coordinator",
    "assistant_national_coordinator_secondary_school_outreach",
  ];

  if (!allowedRoles.includes(role)) {
    res.status(400);
    throw new Error(`Cannot create user with role: ${role}. Allowed roles: ${allowedRoles.join(", ")}.`);
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists with that email.");
  }

  let userFields = { name, email, password, role };

  if (role === "zonal_coordinator") {
    if (!zoneId) {
      res.status(400);
      throw new Error("For zonal_coordinator role, zoneId is required.");
    }
    const zone = await Zone.findById(zoneId);
    if (!zone) {
      res.status(404);
      throw new Error("Zone not found for the provided zoneId.");
    }
    const existingCoordinator = await User.findOne({ zone: zoneId, role: "zonal_coordinator" });
    if (existingCoordinator) {
      res.status(400);
      throw new Error(`Zone '${zone.name}' already has a Zonal Coordinator.`);
    }
    userFields.zone = zoneId;
  }

  const user = await User.create(userFields);

  if (user) {
    if (role === "zonal_coordinator" && user.zone) {
      await Zone.findByIdAndUpdate(user.zone, { coordinator: user._id });
    }

    const populatedUser = await User.findById(user._id)
      .populate("zone", "name officeAddress")
      .populate("fellowship", "name address email");

    res.status(201).json({
      _id: populatedUser._id,
      name: populatedUser.name,
      email: populatedUser.email,
      role: populatedUser.role,
      zone: populatedUser.zone,
      fellowship: populatedUser.fellowship,
      token: generateToken(populatedUser._id, populatedUser.role), // ✅ unified
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data for creation.");
  }
});

// @desc    Get logged-in user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  if (req.user) {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("zone")
      .populate("fellowship");

    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        zone: user.zone,
        fellowship: user.fellowship,
      });
    } else {
      res.status(404);
      throw new Error("User not found");
    }
  } else {
    res.status(401);
    throw new Error("Not authorized, no user found after token verification");
  }
});

// @desc    Zonal Coordinator creates new Fellowship President user
// @route   POST /api/users/create-fellowship-president
// @access  Private/Zonal Coordinator
const createFellowshipPresident = asyncHandler(async (req, res) => {
  const { name, email, password, fellowshipId, role } = req.body;
  const zonalCoordinatorId = req.user._id;

  if (!name || !email || !password || !fellowshipId) {
    res.status(400);
    throw new Error("Please fill all required fields: name, email, password, fellowshipId.");
  }

  if (!["fellowship_president_rcf", "fellowship_president_rccf"].includes(role)) {
    res.status(400);
    throw new Error("Invalid role. Only fellowship president roles are allowed.");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists with that email.");
  }

  const fellowship = await Fellowship.findById(fellowshipId).populate("zone");
  if (!fellowship) {
    res.status(404);
    throw new Error("Fellowship not found.");
  }

  const zonalCoordinator = await User.findById(zonalCoordinatorId);
  if (!zonalCoordinator || zonalCoordinator.role !== "zonal_coordinator" || !zonalCoordinator.zone.equals(fellowship.zone._id)) {
    res.status(403);
    throw new Error("Not authorized to create a president for this fellowship.");
  }

  if (fellowship.president) {
    res.status(400);
    throw new Error(`Fellowship '${fellowship.name}' already has a president assigned.`);
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    fellowship: fellowshipId,
  });

  if (user) {
    await Fellowship.findByIdAndUpdate(fellowshipId, { president: user._id });

    const populatedUser = await User.findById(user._id)
      .populate("fellowship", "name address email")
      .populate("zone", "name officeAddress");

    res.status(201).json({
      _id: populatedUser._id,
      name: populatedUser.name,
      email: populatedUser.email,
      role: populatedUser.role,
      fellowship: populatedUser.fellowship,
      zone: populatedUser.zone,
      token: generateToken(populatedUser._id, populatedUser.role), // ✅ unified
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data for president creation.");
  }
});


// @desc    Get all users (Admin/Super Admin only, or filtered by zone for Zonal Coord)
// @route   GET /api/users
// @access  Private/Administrator, Super Admin, Zonal Coordinator
const getUsers = asyncHandler(async (req, res) => {
    let query = {};

    // Logic to filter users based on the requesting user's role
    if (req.user.role === 'zonal_coordinator') {
        // Zonal coordinator can only see users within their zone (including self, and fellowship presidents in their zone)
        // Find fellowships in their zone, then find presidents of those fellowships
        const fellowshipsInZone = await Fellowship.find({ zone: req.user.zone }).select('_id');
        const fellowshipIds = fellowshipsInZone.map(f => f._id);

        // Include the zonal coordinator themselves and fellowship presidents in their zone
        query = {
            $or: [
                { _id: req.user._id }, // Include themselves
                { fellowship: { $in: fellowshipIds }, role: { $in: ['fellowship_president_rcf', 'fellowship_president_rccf'] } }
            ]
        };
    } else if (req.user.role !== 'administrator' && req.user.role !== 'super_admin') {
        // For other roles, they can only see their own profile
        res.status(403);
        throw new Error('Not authorized to view other user profiles.');
    }
    // Admin/Super Admin can see all users (no specific query filtering by default)

    const users = await User.find(query)
        .select('-password') // Exclude password from response
        .populate('fellowship', 'name address email presidentPhoneNumber') // <-- ADDED: Populate fellowship details
        .populate('zone', 'name officeAddress'); // <-- ADDED: Populate zone details

    res.status(200).json(users);
});


// @desc    Get specific user profile
// @route   GET /api/users/:id
// @access  Private
const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('-password')
        .populate('fellowship', 'name address email presidentPhoneNumber') // <-- ADDED: Populate fellowship details
        .populate('zone', 'name officeAddress'); // <-- ADDED: Populate zone details

    if (!user) {
        res.status(404);
        throw new Error('User not found.');
    }

    // Authorization check:
    // Super Admin/Admin can see any user
    // Zonal Coordinator can see users in their zone (self, presidents in their zone)
    // Any other user can only see their own profile
    if (
        req.user.role === 'super_admin' ||
        req.user.role === 'administrator' ||
        (req.user.role === 'zonal_coordinator' &&
            (user._id.equals(req.user._id) || (user.fellowship && (await Fellowship.exists({ _id: user.fellowship, zone: req.user.zone }))))) || // Check if president's fellowship is in their zone
        user._id.equals(req.user._id)
    ) {
        res.json(user);
    } else {
        res.status(403); // Forbidden
        throw new Error('Not authorized to view this user profile.');
    }
});


// @desc    Update user profile
// @route   PUT /api/users/:id
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
    const userIdToUpdate = req.params.id; // User ID from URL parameter
    const { name, email, password, role, fellowship, zone, presidentPhoneNumber, averageMonthlyAttendance, averageTithe } = req.body;

    const user = await User.findById(userIdToUpdate);

    if (!user) {
        res.status(404);
        throw new Error('User not found.');
    }

    // --- Authorization Logic for Updating ---
    let isAuthorized = false;
    let allowedFields = ['email', 'password']; // Fields general users can update (email only if not unique violation)

    if (req.user.role === 'super_admin') {
        isAuthorized = true; // Super Admin can update anything
        allowedFields = ['name', 'email', 'password', 'role', 'fellowship', 'zone'];
    } else if (req.user.role === 'administrator') {
        // Admin can update certain roles, but not super_admin
        if (user.role === 'super_admin') {
            res.status(403);
            throw new Error('Administrator cannot update Super Admin profile.');
        }
        isAuthorized = true;
        allowedFields = ['name', 'email', 'password', 'role', 'fellowship', 'zone']; // Admin can update these for allowed roles
    } else if (req.user.role === 'zonal_coordinator') {
        // Zonal Coordinator can update:
        // 1. Their own profile
        // 2. Fellowship President's name within their zone (as per requirements)
        if (user._id.equals(req.user._id)) { // User is updating their own profile
            isAuthorized = true;
            allowedFields = ['name', 'email', 'password', 'officeAddress']; // Zonal Coord can update their name/email/pass
        } else if (user.role.includes('fellowship_president') && user.fellowship) {
            // Check if the fellowship belongs to the zonal coordinator's zone
            const fellowshipBelongsToZone = await Fellowship.exists({ _id: user.fellowship, zone: req.user.zone });
            if (fellowshipBelongsToZone) {
                isAuthorized = true;
                allowedFields = ['name', 'email', 'password', 'presidentPhoneNumber', 'averageMonthlyAttendance', 'averageTithe']; // Allowed fields for president profiles
            }
        }
    } else if (user._id.equals(req.user._id)) {
        isAuthorized = true; // Regular user can update their own profile
    }

    if (!isAuthorized) {
        res.status(403); // Forbidden
        throw new Error('Not authorized to update this user profile.');
    }

    // --- Apply Updates Based on Allowed Fields ---
    const updateData = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) { // Only update if the field is present in the request body
            if (field === 'email' && req.body.email !== user.email) {
                 // Check for email uniqueness if changed
                 const emailExists = await User.findOne({ email: req.body.email, _id: { $ne: user._id } });
                 if (emailExists) {
                     res.status(400);
                     throw new Error('Email is already taken by another user.');
                 }
            }
            updateData[field] = req.body[field];
        }
    }

    // Special handling for password: it will be hashed by the pre-save hook
    if (password) {
        user.password = password; // Mongoose pre-save hook will hash this
    }

    // Apply other updates
    Object.assign(user, updateData);

    const updatedUser = await user.save();

    // Re-populate after save if the populated fields might have changed (e.g., if fellowship/zone ID was updated)
    const finalUser = await User.findById(updatedUser._id)
        .populate('fellowship', 'name address email presidentPhoneNumber')
        .populate('zone', 'name officeAddress');

    res.json({
        _id: finalUser._id,
        name: finalUser.name,
        email: finalUser.email,
        role: finalUser.role,
        fellowship: finalUser.fellowship,
        zone: finalUser.zone,
        // Don't send password hash back
    });
});

// @desc    Delete a user (Super Admin/Admin only)
// @route   DELETE /api/users/:id
// @access  Private/Administrator, Super Admin
const deleteUser = asyncHandler(async (req, res) => {
    const userToDelete = await User.findById(req.params.id);

    if (!userToDelete) {
        res.status(404);
        throw new Error('User not found.');
    }

    // Prevent Admin from deleting Super Admin
    if (req.user.role === 'administrator' && userToDelete.role === 'super_admin') {
        res.status(403);
        throw new Error('Administrator cannot delete Super Admin.');
    }

    // If deleting a Zonal Coordinator, de-link from Zone
    if (userToDelete.role === 'zonal_coordinator' && userToDelete.zone) {
        await Zone.findByIdAndUpdate(userToDelete.zone, { coordinator: null });
    }

    // If deleting a Fellowship President, de-link from Fellowship
    if (userToDelete.role.includes('fellowship_president') && userToDelete.fellowship) {
        await Fellowship.findByIdAndUpdate(userToDelete.fellowship, { president: null });
    }

    await User.deleteOne({ _id: userToDelete._id });
    res.status(200).json({ message: 'User removed successfully.' });
});


module.exports = {
    createAdminUser,
    createFellowshipPresident,
    getUsers,
    getUserById,
    updateUserProfile,
    deleteUser,
    getUserProfile,
};