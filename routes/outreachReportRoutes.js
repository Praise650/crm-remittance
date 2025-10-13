// backend/routes/outreachReportRoutes.js
const express = require('express');
const router = express.Router();
const {
    submitOutreachReport,
    getOutreachReports,
    getOutreachReportById,
    updateOutreachReport,
    approveRejectOutreachReport,
} = require('../controllers/outreachReportController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Routes for Outreach Reports

// POST /api/outreach/reports
// Submit a new outreach report.
// Accessible by: Assistant National Coordinator Secondary School Outreach, Super Admin, Administrator.
router.post('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'assistant_national_coordinator_secondary_school_outreach'
), submitOutreachReport);

// GET /api/outreach/reports
// Get all or filtered outreach reports.
// Accessible by: Super Admin, Administrator, National Coordinator, Assistant National Coordinator Secondary School Outreach, Zonal Coordinator.
router.get('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach',
    'zonal_coordinator' // Zonal coordinators might need visibility into national outreach efforts
), getOutreachReports);

// GET /api/outreach/reports/:id
// Get a single outreach report by ID.
// Accessible by: Same roles as GET /api/outreach/reports.
router.get('/:id', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach',
    'zonal_coordinator'
), getOutreachReportById);

// PUT /api/outreach/reports/:id
// Update an existing outreach report.
// Authorization handled within the controller: only if pending, by original submitter, or by Admin/Super Admin.
router.put('/:id', protect, updateOutreachReport);

// PUT /api/outreach/reports/:id/approve-reject
// Approve or reject an outreach report.
// Accessible by: Super Admin, Administrator, National Coordinator.
router.put('/:id/approve-reject', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator'
), approveRejectOutreachReport);

module.exports = router;