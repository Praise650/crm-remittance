// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const {
    createAdminUser,
    createFellowshipPresident,
    getUsers,
    getUserById,
    updateUserProfile,
    deleteUser,
    getUserProfile,
    updateUserProfilePicture, // Make sure this is imported from userController
} = require('../controllers/userController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// --- Routes ---

// @desc    Admin/Super Admin create other Admin roles
router.post('/create-admin-user', protect, authorizeRoles('administrator', 'super_admin'), createAdminUser);

// @desc    Zonal Coordinator creates Fellowship Presidents
router.post('/create-fellowship-president', protect, authorizeRoles('zonal_coordinator'), createFellowshipPresident);

// @desc    Get all users (Admin/Super Admin can see all, Zonal Coord filtered)
router.get('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'zonal_coordinator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach'
), getUsers);

// @desc    Get current user profile (for logged-in user)
// @access  Private (requires token)
router.get('/profile', protect, getUserProfile); // Good addition!

// @desc    Get specific user profile by ID
router.get('/:id', protect, getUserById); // Authorization handled in controller

// @desc    Update user profile (for name, email, etc.)
router.put('/:id', protect, updateUserProfile); // Authorization handled in controller

// @desc    Delete a user
router.delete('/:id', protect, authorizeRoles('administrator', 'super_admin'), deleteUser);

module.exports = router;