// backend/routes/fellowshipOutreachReportRoutes.js
const express = require('express');
const router = express.Router();
const {
    submitFellowshipOutreachReport,
    getFellowshipOutreachReports,
    getFellowshipOutreachReportById,
    updateFellowshipOutreachReport,
    approveRejectFellowshipOutreachReport,
    deleteFellowshipOutreachReport,
} = require('../controllers/fellowshipOutreachReportController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Routes for Fellowship Outreach Reports

// POST /api/fellowship-outreach/reports
// Submit a new detailed fellowship outreach report.
// Accessible by: Fellowship President, Super Admin, Administrator.
router.post('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'fellowship_president_rcf',
	'fellowship_president_rccf'
), submitFellowshipOutreachReport);

// GET /api/fellowship-outreach/reports
// Get all or filtered detailed fellowship outreach reports.
// Accessible by: Super Admin, Administrator, National Coordinator, Assistant National Coordinator Secondary School Outreach, Zonal Coordinator, Fellowship President.
router.get('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach', // Can view these reports
    'zonal_coordinator',
    'fellowship_president_rcf',
	'fellowship_president_rccf'
), getFellowshipOutreachReports);

// GET /api/fellowship-outreach/reports/:id
// Get a single detailed fellowship outreach report by ID.
// Accessible by: Same roles as GET /api/fellowreach-outreach/reports.
router.get('/:id', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach', // Can view these reports
    'zonal_coordinator',
    'fellowship_president_rcf',
	'fellowship_president_rccf'
), getFellowshipOutreachReportById);

// PUT /api/fellowship-outreach/reports/:id
// Update an existing detailed fellowship outreach report.
// Authorization handled within the controller: only if pending, by original submitter, or by Admin/Super Admin.
router.put('/:id', protect, updateFellowshipOutreachReport);

// PUT /api/fellowship-outreach/reports/:id/approve-reject
// Approve or reject a detailed fellowship outreach report.
// Accessible by: Super Admin, Administrator, National Coordinator, Zonal Coordinator.
router.put('/:id/approve-reject', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'zonal_coordinator' // Zonal coordinators approve reports from their zone's fellowships
), approveRejectFellowshipOutreachReport);

// DELETE /api/fellowship-outreach/reports/:id
// Delete a detailed fellowship outreach report.
// Authorization handled within the controller.
router.delete('/:id', protect, deleteFellowshipOutreachReport);


module.exports = router;