// backend/routes/zoneRoutes.js
const express = require('express');
const router = express.Router();
const {
    createZone,
    getZones,
    getZoneById,
    updateZone,
    deleteZone,
} = require('../controllers/zoneController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Routes for Zones
// Only Administrator (or Super Admin) can create, update, delete zones
router.post('/', protect, authorizeRoles('administrator', 'super_admin'), createZone);
router.get('/', protect, getZones); // Everyone authenticated can potentially list zones
router.get('/:id', protect, getZoneById);
router.put('/:id', protect, authorizeRoles('administrator', 'super_admin'), updateZone);
router.delete('/:id', protect, authorizeRoles('administrator', 'super_admin'), deleteZone);

module.exports = router;