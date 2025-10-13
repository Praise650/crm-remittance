// backend/controllers/activityReportController.js
const asyncHandler = require('express-async-handler');
const ActivityReport = require('../models/activityReportModel');
const Fellowship = require('../models/fellowshipModel'); // To check if fellowship exists and for Zonal access

// Helper Date Functions (Standard Calendar Month)
const getStartOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getMonthlyPeriodDates = (year, monthIndex) => {
  const periodStartDate = new Date(year, monthIndex, 1); // 1st of month
  const periodEndDate = new Date(year, monthIndex + 1, 0); // Last day of month

  periodStartDate.setHours(0, 0, 0, 0);
  periodEndDate.setHours(23, 59, 59, 999);

  return { periodStartDate, periodEndDate };
};
// End Helper Date Functions

// @desc    Submit a new activity report
// @route   POST /api/activity/reports
// @access  Private/Fellowship President (or Super Admin/Admin)
const submitActivityReport = asyncHandler(async (req, res) => {
  const {
    fellowshipId,
    reportingMonth, // 'YYYY-MM-DD' (any day of the month)
    totalAttendance,
    totalNewConverts,
    totalProgramsHeld,
    outreachActivitiesConducted,
    basicOutreachSynopsis,
    challenges,
    successStories,
  } = req.body;

  const submittedBy = req.user._id;
  const userRole = req.user.role;
  const userFellowship = req.user.fellowship;

  if (
    !fellowshipId ||
    !reportingMonth ||
    totalAttendance === undefined ||
    totalNewConverts === undefined ||
    totalProgramsHeld === undefined
  ) {
    res.status(400);
    throw new Error(
      'Please provide fellowshipId, reportingMonth, totalAttendance, totalNewConverts, and totalProgramsHeld.'
    );
  }

  const isFellowshipPresident = userRole.includes('fellowship_president');
  const isAdminOrSuperAdmin =
    userRole.includes('super_admin') || userRole.includes('administrator');

  if (isFellowshipPresident && userFellowship && userFellowship.toString() !== fellowshipId) {
    res.status(403);
    throw new Error(
      'Fellowship President can only submit reports for their assigned fellowship.'
    );
  } else if (!isFellowshipPresident && !isAdminOrSuperAdmin) {
    res.status(403);
    throw new Error('Not authorized to submit activity reports.');
  }

  const fellowshipExists = await Fellowship.findById(fellowshipId);
  if (!fellowshipExists) {
    res.status(404);
    throw new Error('Fellowship not found.');
  }

  const reportDateInput = new Date(reportingMonth);
  if (isNaN(reportDateInput.getTime())) {
    res.status(400);
    throw new Error(
      'Invalid reportingMonth format. Please use ISO format (YYYY-MM-DD).'
    );
  }
  const reportCalendarMonth = getStartOfMonth(reportDateInput);

  const existingReport = await ActivityReport.findOne({
    fellowship: fellowshipId,
    reportingMonth: reportCalendarMonth,
  });
  if (existingReport) {
    res.status(400);
    throw new Error(
      `An activity report for ${fellowshipExists.name} for ${reportCalendarMonth.toDateString()} already exists.`
    );
  }

  const report = await ActivityReport.create({
    fellowship: fellowshipId,
    reportingMonth: reportCalendarMonth,
    totalAttendance,
    totalNewConverts,
    totalProgramsHeld,
    outreachActivitiesConducted,
    basicOutreachSynopsis,
    challenges,
    successStories,
    submittedBy,
    status: 'pending',
  });

  if (report) {
    const { periodStartDate, periodEndDate } = getMonthlyPeriodDates(
      reportCalendarMonth.getFullYear(),
      reportCalendarMonth.getMonth()
    );
    res.status(201).json({
      ...report.toObject(),
      fellowshipName: fellowshipExists.name,
      periodStartDate,
      periodEndDate,
    });
  } else {
    res.status(400);
    throw new Error('Invalid activity report data.');
  }
});

// @desc    Get all activity reports
// @route   GET /api/activity/reports
// @access  Private
const getActivityReports = asyncHandler(async (req, res) => {
  const { month, year, status, fellowshipId, submittedBy, zoneId } = req.query;
  const user = req.user;

  let query = {};
  let reports = [];

  const baseQuery = ActivityReport.find(query)
    .populate('fellowship', 'name zone')
    .populate('submittedBy', 'name email role')
    .populate('approvedBy', 'name email role');

  if (
    user.role.includes('super_admin') ||
    user.role.includes('administrator') ||
    user.role.includes('national_coordinator') ||
    user.role.includes('assistant_national_coordinator_finance') ||
    user.role.includes('assistant_national_coordinator_secondary_school_outreach')
  ) {
    if (status) query.status = status;
    if (fellowshipId) query.fellowship = fellowshipId;
    if (submittedBy) query.submittedBy = submittedBy;

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      query.reportingMonth = { $gte: startDate, $lt: endDate };
    }
    reports = await baseQuery.find(query).sort({ reportingMonth: -1, 'fellowship.name': 1 });
  } else if (user.role.includes('zonal_coordinator')) {
    if (!user.zone) {
      res.status(403);
      throw new Error('User is a Zonal Coordinator but not assigned to a zone.');
    }
    const fellowshipsInZone = await Fellowship.find({ zone: user.zone }).select('_id');
    const fellowshipIdsInZone = fellowshipsInZone.map((f) => f._id);

    if (fellowshipIdsInZone.length === 0) {
      return res.status(200).json([]);
    }

    query.fellowship = { $in: fellowshipIdsInZone };
    if (status) query.status = status;
    if (submittedBy) query.submittedBy = submittedBy;

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      query.reportingMonth = { $gte: startDate, $lt: endDate };
    }
    reports = await baseQuery.find(query).sort({ reportingMonth: -1, 'fellowship.name': 1 });
  } else if (user.role.includes('fellowship_president')) {
    if (!user.fellowship) {
      res.status(403);
      throw new Error('User is a Fellowship President but not assigned to a fellowship.');
    }
    query.fellowship = user.fellowship;
    query.submittedBy = user._id;

    if (status) query.status = status;
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      query.reportingMonth = { $gte: startDate, $lt: endDate };
    }
    reports = await baseQuery.find(query).sort({ reportingMonth: -1 });
  } else {
    res.status(403);
    throw new Error('Not authorized to view activity reports.');
  }

  if (
    zoneId &&
    (user.role.includes('super_admin') ||
      user.role.includes('administrator') ||
      user.role.includes('national_coordinator') ||
      user.role.includes('assistant_national_coordinator_finance') ||
      user.role.includes('assistant_national_coordinator_secondary_school_outreach'))
  ) {
    reports = reports.filter(
      (report) =>
        report.fellowship &&
        report.fellowship.zone &&
        report.fellowship.zone.toString() === zoneId
    );
  }

  const reportsWithPeriodDates = reports.map((report) => {
    const reportCalendarMonth = report.reportingMonth;
    const { periodStartDate, periodEndDate } = getMonthlyPeriodDates(
      reportCalendarMonth.getFullYear(),
      reportCalendarMonth.getMonth()
    );
    return {
      ...report.toObject(),
      periodStartDate,
      periodEndDate,
    };
  });

  res.status(200).json(reportsWithPeriodDates);
});

// @desc    Get a single activity report by ID
// @route   GET /api/activity/reports/:id
const getActivityReportById = asyncHandler(async (req, res) => {
  const reportId = req.params.id;
  const user = req.user;

  const report = await ActivityReport.findById(reportId)
    .populate('fellowship', 'name zone')
    .populate('submittedBy', 'name email role')
    .populate('approvedBy', 'name email role');

  if (!report) {
    res.status(404);
    throw new Error('Activity report not found.');
  }

  let authorized = false;
  if (
    user.role.includes('super_admin') ||
    user.role.includes('administrator') ||
    user.role.includes('national_coordinator') ||
    user.role.includes('assistant_national_coordinator_finance') ||
    user.role.includes('assistant_national_coordinator_secondary_school_outreach')
  ) {
    authorized = true;
  } else if (user.role.includes('zonal_coordinator')) {
    if (
      user.zone &&
      report.fellowship &&
      report.fellowship.zone &&
      user.zone.equals(report.fellowship.zone)
    ) {
      authorized = true;
    }
  } else if (user.role.includes('fellowship_president')) {
    if (
      user.fellowship &&
      report.fellowship &&
      user.fellowship.equals(report.fellowship._id) &&
      user._id.equals(report.submittedBy._id)
    ) {
      authorized = true;
    }
  }

  if (!authorized) {
    res.status(403);
    throw new Error('Not authorized to view this activity report.');
  }

  const reportCalendarMonth = report.reportingMonth;
  const { periodStartDate, periodEndDate } = getMonthlyPeriodDates(
    reportCalendarMonth.getFullYear(),
    reportCalendarMonth.getMonth()
  );

  res.status(200).json({
    ...report.toObject(),
    periodStartDate,
    periodEndDate,
  });
});

// @desc    Update an activity report
// @route   PUT /api/activity/reports/:id
const updateActivityReport = asyncHandler(async (req, res) => {
  const reportId = req.params.id;
  const user = req.user;
  const {
    totalAttendance,
    totalNewConverts,
    totalProgramsHeld,
    outreachActivitiesConducted,
    basicOutreachSynopsis,
    challenges,
    successStories,
  } = req.body;

  const report = await ActivityReport.findById(reportId);

  if (!report) {
    res.status(404);
    throw new Error('Activity report not found.');
  }

  const canUpdateAnyStatus = ['super_admin', 'administrator'].includes(user.role);
  const canUpdateOwnPending =
    user.role.includes('fellowship_president') &&
    report.submittedBy.equals(user._id) &&
    report.status === 'pending';

  if (!canUpdateAnyStatus && !canUpdateOwnPending) {
    res.status(403);
    throw new Error(
      'Not authorized to update this report, or report is not in pending status.'
    );
  }

  report.totalAttendance =
    totalAttendance !== undefined ? totalAttendance : report.totalAttendance;
  report.totalNewConverts =
    totalNewConverts !== undefined ? totalNewConverts : report.totalNewConverts;
  report.totalProgramsHeld =
    totalProgramsHeld !== undefined ? totalProgramsHeld : report.totalProgramsHeld;
  report.outreachActivitiesConducted =
    outreachActivitiesConducted !== undefined
      ? outreachActivitiesConducted
      : report.outreachActivitiesConducted;
  report.basicOutreachSynopsis =
    basicOutreachSynopsis !== undefined
      ? basicOutreachSynopsis
      : report.basicOutreachSynopsis;
  report.challenges = challenges !== undefined ? challenges : report.challenges;
  report.successStories =
    successStories !== undefined ? successStories : report.successStories;

  const updatedReport = await report.save();

  const { periodStartDate, periodEndDate } = getMonthlyPeriodDates(
    updatedReport.reportingMonth.getFullYear(),
    updatedReport.reportingMonth.getMonth()
  );

  res.status(200).json({
    ...updatedReport.toObject(),
    periodStartDate,
    periodEndDate,
  });
});

// @desc    Approve/Reject an activity report
// @route   PUT /api/activity/reports/:id/approve-reject
const approveRejectActivityReport = asyncHandler(async (req, res) => {
  const reportId = req.params.id;
  const { status, rejectionReason } = req.body;
  const approvedBy = req.user._id;
  const approverRole = req.user.role;
  const approverZone = req.user.zone;

  if (!['approved', 'rejected'].includes(status)) {
    res.status(400);
    throw new Error('Invalid status. Must be "approved" or "rejected".');
  }

  const report = await ActivityReport.findById(reportId).populate('fellowship', 'zone');

  if (!report) {
    res.status(404);
    throw new Error('Activity report not found.');
  }

  if (report.status !== 'pending') {
    res.status(400);
    throw new Error(`Report is already ${report.status}. Cannot change status.`);
  }

  const authorizedToApprove =
    ['super_admin', 'administrator', 'national_coordinator'].includes(approverRole) ||
    (approverRole.includes('zonal_coordinator') &&
      report.fellowship &&
      report.fellowship.zone &&
      approverZone.equals(report.fellowship.zone));

  if (!authorizedToApprove) {
    res.status(403);
    throw new Error('Not authorized to approve/reject this activity report.');
  }

  report.status = status;
  report.approvedBy = approvedBy;
  report.approvalDate = new Date();

  if (status === 'rejected') {
    if (!rejectionReason) {
      res.status(400);
      throw new Error('Rejection reason is required for rejected reports.');
    }
    report.rejectionReason = rejectionReason;
  } else {
    report.rejectionReason = undefined;
  }

  const updatedReport = await report.save();

  const { periodStartDate, periodEndDate } = getMonthlyPeriodDates(
    updatedReport.reportingMonth.getFullYear(),
    updatedReport.reportingMonth.getMonth()
  );

  res.status(200).json({
    ...updatedReport.toObject(),
    periodStartDate,
    periodEndDate,
  });
});

// @desc    Delete an activity report
// @route   DELETE /api/activity/reports/:id
const deleteActivityReport = asyncHandler(async (req, res) => {
  const reportId = req.params.id;
  const user = req.user;

  const report = await ActivityReport.findById(reportId);

  if (!report) {
    res.status(404);
    throw new Error('Activity report not found.');
  }

  const canDeleteAny = ['super_admin', 'administrator'].includes(user.role);
  const canDeleteOwnPending =
    user.role.includes('fellowship_president') &&
    report.submittedBy.equals(user._id) &&
    report.status === 'pending';

  if (!canDeleteAny && !canDeleteOwnPending) {
    res.status(403);
    throw new Error('Not authorized to delete this report.');
  }

  await report.deleteOne();

  res.status(200).json({ message: 'Activity report removed.' });
});

module.exports = {
  submitActivityReport,
  getActivityReports,
  getActivityReportById,
  updateActivityReport,
  approveRejectActivityReport,
  deleteActivityReport,
};
