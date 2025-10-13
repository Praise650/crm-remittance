// backend/routes/fellowshipRoutes.js
const express = require('express');
const router = express.Router();
const {
    createFellowship,
    getFellowships,
    getFellowshipById,
    updateFellowship,
    deleteFellowship,
} = require('../controllers/fellowshipController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware'); // For protecting routes

// Routes for Fellowships
// Zonal Coordinator (or Admin/Super Admin) can create
router.post('/', protect, authorizeRoles('zonal_coordinator', 'administrator', 'super_admin'), createFellowship);
router.get('/', protect, getFellowships); // Everyone authenticated can potentially list (with filters)
router.get('/:id', protect, getFellowshipById);
router.put('/:id', protect, authorizeRoles('zonal_coordinator', 'administrator', 'super_admin'), updateFellowship);
router.delete('/:id', protect, authorizeRoles('administrator', 'super_admin'), deleteFellowship);

module.exports = router;