// backend/routes/financeRoutes.js
const express = require('express');
const router = express.Router();
const {
    submitFinancialReport,
    getFinancialReports,
    getFinancialReportById,
    approveRejectFinancialReport,
} = require('../controllers/financeController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Routes for Financial Reports
// Submit a report (only by Fellowship President for their assigned fellowship)
router.post('/', protect, authorizeRoles('fellowship_president_rcf', 'fellowship_president_rccf'), submitFinancialReport);

// Get all/filtered reports (access based on role in controller)
router.get('/', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'accountant',
    'zonal_coordinator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach',
    'fellowship_president_rcf',
    'fellowship_president_rccf'
), getFinancialReports);

// Get single report by ID (access based on role in controller)
router.get('/:id', protect, authorizeRoles(
    'super_admin',
    'administrator',
    'accountant',
    'zonal_coordinator',
    'national_coordinator',
    'assistant_national_coordinator_secondary_school_outreach',
    'fellowship_president_rcf',
    'fellowship_president_rccf'
), getFinancialReportById);

// Approve/Reject report (only by Accountant)
router.put('/:id/approve-reject', protect, authorizeRoles('accountant'), approveRejectFinancialReport);

module.exports = router;