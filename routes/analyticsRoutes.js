// backend/routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const {
    getOverallSummary,
    getMonthlyTrends,
} = require('../controllers/analyticsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Define roles that can access general analytics.
// Most roles that can view reports should be able to view analytics derived from them.
const ANALYTICS_VIEW_ROLES = [
    'super_admin',
    'administrator',
    'national_coordinator',
    'accountant',
    'assistant_national_coordinator_secondary_school_outreach',
    'zonal_coordinator',
    'fellowship_president_rcf',
	'fellowship_president_rccf',
];

// GET /api/analytics/summary
// Get overall aggregated summary for a specific month/year, filtered by user's role/scope.
router.get('/summary', protect, authorizeRoles(...ANALYTICS_VIEW_ROLES), getOverallSummary);

// GET /api/analytics/monthly-trends
// Get monthly trends for key metrics over a year, filtered by user's role/scope.
router.get('/monthly-trends', protect, authorizeRoles(...ANALYTICS_VIEW_ROLES), getMonthlyTrends);

module.exports = router;