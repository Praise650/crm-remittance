// backend/routes/activityReportRoutes.js
const express = require('express');
const router = express.Router();
const {
    submitActivityReport,
    getActivityReports,
    getActivityReportById,
    updateActivityReport,
    approveRejectActivityReport,
    deleteActivityReport,
} = require('../controllers/activityReportController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Accessible by: Fellowship President, Super Admin, Administrator.
router.post('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'fellowship_president_rcf',
	'fellowship_president_rccf'
), submitActivityReport);

// Accessible by: All roles with viewing permissions for reports.
router.get('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'accountant',
    'assistant_national_coordinator_secondary_school_outreach', // Can view general activity data
    'zonal_coordinator',
    'fellowship_president_rcf',
	'fellowship_president_rccf'
), getActivityReports);

// GET /api/activity/reports/:id
// Get a single activity report by ID.
// Accessible by: Same roles as GET /api/activity/reports.
router.get('/:id', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'accountant',
    'assistant_national_coordinator_secondary_school_outreach',
    'zonal_coordinator',
    'fellowship_president_rcf',
	'fellowship_president_rccf'
), getActivityReportById);

// PUT /api/activity/reports/:id
// Update an existing activity report.
// Authorization handled within the controller: only if pending, by original submitter, or by Admin/Super Admin.
router.put('/:id', protect, updateActivityReport);

// PUT /api/activity/reports/:id/approve-reject
// Approve or reject an activity report.
// Accessible by: Super Admin, Administrator, National Coordinator, Zonal Coordinator.
router.put('/:id/approve-reject', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'national_coordinator',
    'zonal_coordinator' // Zonal coordinators approve reports from their zone's fellowships
), approveRejectActivityReport);

// DELETE /api/activity/reports/:id
// Delete an activity report.
// Authorization handled within the controller.
router.delete('/:id', protect, deleteActivityReport);


module.exports = router;