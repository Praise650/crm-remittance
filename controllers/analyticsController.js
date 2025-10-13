// backend/controllers/analyticsController.js
const asyncHandler = require('express-async-handler');
const ActivityReport = require('../models/activityReportModel');
const FinancialReport = require('../models/financialReportModel');
const FellowshipOutreachReport = require('../models/fellowshipOutreachReportModel');
const Fellowship = require('../models/fellowshipModel'); // For filtering by zone later

// --- Helper Date Functions (Consistent across reporting modules) ---
const getStartOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getMonthlyPeriodDates = (year, monthIndex) => {
  const periodStartDate = new Date(year, monthIndex, 1);
  const periodEndDate = new Date(year, monthIndex + 1, 0);

  periodStartDate.setHours(0, 0, 0, 0);
  periodEndDate.setHours(23, 59, 59, 999);

  return { periodStartDate, periodEndDate };
};
// --- End Helper Date Functions ---

/**
 * Helper to build common match stages for aggregation pipelines based on user roles and query filters.
 * Ensures only approved reports within the date range are considered.
 */
const buildCommonMatchStages = async (user, month, year, specificFellowshipId, specificZoneId) => {
  const matchStages = [];

  // Date Range Match (by reportingMonth field)
  const { periodStartDate, periodEndDate } = getMonthlyPeriodDates(year, month);

  matchStages.push({
    $match: {
      reportingMonth: { $gte: periodStartDate, $lte: periodEndDate },
      status: 'approved'
    }
  });

  // Role-based access control
  const userRole = user.role;
  const userFellowship = user.fellowship;
  const userZone = user.zone;

  const isAdminOrSuperAdmin = userRole.includes('super_admin') || userRole.includes('administrator');
  const isNationalCoordinator = userRole.includes('national_coordinator');
  const isFinanceCoordinator = userRole.includes('assistant_national_coordinator_finance');
  const isSecondaryOutreachCoordinator = userRole.includes('assistant_national_coordinator_secondary_school_outreach');
  const isZonalCoordinator = userRole.includes('zonal_coordinator');
  const isFellowshipPresident = userRole.includes('fellowship_president');

  let fellowshipFilterIds = [];

  if (isFellowshipPresident && userFellowship) {
    fellowshipFilterIds = [userFellowship];
  } else if (isZonalCoordinator && userZone) {
    const fellowshipsInZone = await Fellowship.find({ zone: userZone }).select('_id');
    fellowshipFilterIds = fellowshipsInZone.map(f => f._id);
    if (fellowshipFilterIds.length === 0) return null;
  } else if (isAdminOrSuperAdmin || isNationalCoordinator || isFinanceCoordinator || isSecondaryOutreachCoordinator) {
    if (specificFellowshipId) {
      fellowshipFilterIds = [specificFellowshipId];
    } else if (specificZoneId) {
      const fellowshipsInSpecificZone = await Fellowship.find({ zone: specificZoneId }).select('_id');
      fellowshipFilterIds = fellowshipsInSpecificZone.map(f => f._id);
      if (fellowshipFilterIds.length === 0) return null;
    } else {
      fellowshipFilterIds = null; // No filter → all fellowships
    }
  } else {
    return null; // Unauthorized
  }

  if (fellowshipFilterIds && fellowshipFilterIds.length > 0) {
    matchStages.push({ $match: { fellowship: { $in: fellowshipFilterIds } } });
  }

  return matchStages;
};

// @desc    Get overall summary of metrics for a given month/year
// @route   GET /api/analytics/summary?month=<MM>&year=<YYYY>&fellowshipId=<ID>&zoneId=<ID>
const getOverallSummary = asyncHandler(async (req, res) => {
  const { month, year, fellowshipId, zoneId } = req.query;
  const user = req.user;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const queryYear = parseInt(year) || currentYear;
  const queryMonth = (parseInt(month) - 1) || currentMonth;

  const commonMatchStages = await buildCommonMatchStages(user, queryMonth, queryYear, fellowshipId, zoneId);

  if (commonMatchStages === null) {
    return res.status(200).json({
      totalAttendance: 0,
      totalNewConverts: 0,
      totalProgramsHeld: 0,
      totalIncome: 0,
      totalExpenditure: 0,
      balance: 0,
      totalFellowshipSchoolsVisited: 0,
      totalFellowshipStudentsReached: 0,
      totalFellowshipNewConverts: 0,
      totalFellowshipMaterialsDistributed: 0,
      summaryFor: `${new Date(queryYear, queryMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
    });
  }

  // --- Aggregate Activity Reports ---
  const activityResults = await ActivityReport.aggregate([
    ...commonMatchStages,
    {
      $group: {
        _id: null,
        totalAttendance: { $sum: "$totalAttendance" },
        totalNewConverts: { $sum: "$totalNewConverts" },
        totalProgramsHeld: { $sum: "$totalProgramsHeld" }
      }
    },
    { $project: { _id: 0 } }
  ]);
  const activitySummary = activityResults[0] || {};

  // --- Aggregate Financial Reports ---
  const financialResults = await FinancialReport.aggregate([
    ...commonMatchStages,
    {
      $group: {
        _id: null,
        totalIncome: { $sum: "$totalIncome" },
        totalExpenditure: { $sum: "$totalExpenditure" }
      }
    },
    { $project: { _id: 0 } }
  ]);
  const financialSummary = financialResults[0] || {};
  const balance = (financialSummary.totalIncome || 0) - (financialSummary.totalExpenditure || 0);

  // --- Aggregate Fellowship Outreach Reports ---
  const fellowshipOutreachResults = await FellowshipOutreachReport.aggregate([
    ...commonMatchStages,
    {
      $group: {
        _id: null,
        totalFellowshipSchoolsVisited: { $sum: "$totalSchoolsVisited" },
        totalFellowshipStudentsReached: { $sum: "$totalStudentsReached" },
        totalFellowshipNewConverts: { $sum: "$totalNewConverts" },
        totalFellowshipMaterialsDistributed: { $sum: "$totalMaterialsDistributed" }
      }
    },
    { $project: { _id: 0 } }
  ]);
  const fellowshipOutreachSummary = fellowshipOutreachResults[0] || {};

  res.status(200).json({
    totalAttendance: activitySummary.totalAttendance || 0,
    totalNewConverts: activitySummary.totalNewConverts || 0,
    totalProgramsHeld: activitySummary.totalProgramsHeld || 0,
    totalIncome: financialSummary.totalIncome || 0,
    totalExpenditure: financialSummary.totalExpenditure || 0,
    balance,
    totalFellowshipSchoolsVisited: fellowshipOutreachSummary.totalFellowshipSchoolsVisited || 0,
    totalFellowshipStudentsReached: fellowshipOutreachSummary.totalFellowshipStudentsReached || 0,
    totalFellowshipNewConverts: fellowshipOutreachSummary.totalFellowshipNewConverts || 0,
    totalFellowshipMaterialsDistributed: fellowshipOutreachSummary.totalFellowshipMaterialsDistributed || 0,
    summaryFor: `${new Date(queryYear, queryMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
  });
});

// @desc    Get monthly trends for key metrics over a year
// @route   GET /api/analytics/monthly-trends?year=<YYYY>&fellowshipId=<ID>&zoneId=<ID>
const getMonthlyTrends = asyncHandler(async (req, res) => {
  const { year, fellowshipId, zoneId } = req.query;
  const user = req.user;

  const currentYear = new Date().getFullYear();
  const queryYear = parseInt(year) || currentYear;

  // Initialize array for 12 months
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: new Date(queryYear, i).toLocaleString('en-US', { month: 'short' }),
    totalAttendance: 0,
    totalNewConverts: 0,
    totalProgramsHeld: 0,
    totalIncome: 0,
    totalExpenditure: 0,
    totalFellowshipSchoolsVisited: 0,
    totalFellowshipStudentsReached: 0,
    totalFellowshipNewConverts: 0,
    totalFellowshipMaterialsDistributed: 0,
  }));

  // Role-based filter setup
  const globalMatchStages = [];
  const userRole = user.role;
  const userFellowship = user.fellowship;
  const userZone = user.zone;

  const isAdminOrSuperAdmin = userRole.includes('super_admin') || userRole.includes('administrator');
  const isNationalCoordinator = userRole.includes('national_coordinator');
  const isFinanceCoordinator = userRole.includes('assistant_national_coordinator_finance');
  const isSecondaryOutreachCoordinator = userRole.includes('assistant_national_coordinator_secondary_school_outreach');
  const isZonalCoordinator = userRole.includes('zonal_coordinator');
  const isFellowshipPresident = userRole.includes('fellowship_president');

  let fellowshipFilterIds = [];

  if (isFellowshipPresident && userFellowship) {
    fellowshipFilterIds = [userFellowship];
  } else if (isZonalCoordinator && userZone) {
    const fellowshipsInZone = await Fellowship.find({ zone: userZone }).select('_id');
    fellowshipFilterIds = fellowshipsInZone.map(f => f._id);
    if (fellowshipFilterIds.length === 0) return res.status(200).json(monthlyData);
  } else if (isAdminOrSuperAdmin || isNationalCoordinator || isFinanceCoordinator || isSecondaryOutreachCoordinator) {
    if (fellowshipId) {
      fellowshipFilterIds = [fellowshipId];
    } else if (zoneId) {
      const fellowshipsInSpecificZone = await Fellowship.find({ zone: zoneId }).select('_id');
      fellowshipFilterIds = fellowshipsInSpecificZone.map(f => f._id);
      if (fellowshipFilterIds.length === 0) return res.status(200).json(monthlyData);
    } else {
      fellowshipFilterIds = null;
    }
  } else {
    return res.status(403).json({ message: 'Not authorized to view analytics trends.' });
  }

  // Always include year + status
  globalMatchStages.push({
    $match: {
      reportingMonth: {
        $gte: new Date(queryYear, 0, 1),
        $lt: new Date(queryYear + 1, 0, 1)
      },
      status: 'approved'
    }
  });

  if (fellowshipFilterIds && fellowshipFilterIds.length > 0) {
    globalMatchStages.push({ $match: { fellowship: { $in: fellowshipFilterIds } } });
  }

  // --- Activity Reports ---
  const activityTrends = await ActivityReport.aggregate([
    ...globalMatchStages,
    {
      $group: {
        _id: { month: { $month: "$reportingMonth" } },
        totalAttendance: { $sum: "$totalAttendance" },
        totalNewConverts: { $sum: "$totalNewConverts" },
        totalProgramsHeld: { $sum: "$totalProgramsHeld" }
      }
    },
    { $sort: { "_id.month": 1 } }
  ]);
  activityTrends.forEach(data => {
    const monthIndex = data._id.month - 1;
    monthlyData[monthIndex].totalAttendance = data.totalAttendance;
    monthlyData[monthIndex].totalNewConverts = data.totalNewConverts;
    monthlyData[monthIndex].totalProgramsHeld = data.totalProgramsHeld;
  });

  // --- Financial Reports ---
  const financialTrends = await FinancialReport.aggregate([
    ...globalMatchStages,
    {
      $group: {
        _id: { month: { $month: "$reportingMonth" } },
        totalIncome: { $sum: "$totalIncome" },
        totalExpenditure: { $sum: "$totalExpenditure" }
      }
    },
    { $sort: { "_id.month": 1 } }
  ]);
  financialTrends.forEach(data => {
    const monthIndex = data._id.month - 1;
    monthlyData[monthIndex].totalIncome = data.totalIncome;
    monthlyData[monthIndex].totalExpenditure = data.totalExpenditure;
  });

  // --- Fellowship Outreach Reports ---
  const fellowshipOutreachTrends = await FellowshipOutreachReport.aggregate([
    ...globalMatchStages,
    {
      $group: {
        _id: { month: { $month: "$reportingMonth" } },
        totalFellowshipSchoolsVisited: { $sum: "$totalSchoolsVisited" },
        totalFellowshipStudentsReached: { $sum: "$totalStudentsReached" },
        totalFellowshipNewConverts: { $sum: "$totalNewConverts" },
        totalFellowshipMaterialsDistributed: { $sum: "$totalMaterialsDistributed" }
      }
    },
    { $sort: { "_id.month": 1 } }
  ]);
  fellowshipOutreachTrends.forEach(data => {
    const monthIndex = data._id.month - 1;
    monthlyData[monthIndex].totalFellowshipSchoolsVisited = data.totalFellowshipSchoolsVisited;
    monthlyData[monthIndex].totalFellowshipStudentsReached = data.totalFellowshipStudentsReached;
    monthlyData[monthIndex].totalFellowshipNewConverts = data.totalFellowshipNewConverts;
    monthlyData[monthIndex].totalFellowshipMaterialsDistributed = data.totalFellowshipMaterialsDistributed;
  });

  res.status(200).json(monthlyData);
});

module.exports = {
  getOverallSummary,
  getMonthlyTrends,
};
