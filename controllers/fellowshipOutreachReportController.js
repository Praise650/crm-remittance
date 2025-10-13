// backend/controllers/fellowshipOutreachReportController.js
const asyncHandler = require('express-async-handler');
const FellowshipOutreachReport = require('../models/fellowshipOutreachReportModel');
const Fellowship = require('../models/fellowshipModel'); // To populate fellowship details
const User = require('../models/User'); // To populate submittedBy/approvedBy details

// --- Helper Date Functions (Modified for consistency with activityReportController) ---
const getStartOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getNthDayOfMonth = (year, month, dayOfWeek, occurrence) => {
    let date = new Date(year, month, 1);
    let count = 0;
    while (date.getMonth() === month) {
        if (date.getDay() === dayOfWeek) {
            count++;
            if (count === occurrence) {
                return new Date(date.getFullYear(), date.getMonth(), date.getDate());
            }
        }
        date.setDate(date.getDate() + 1);
    }
    return null;
};

const getCustomReportingPeriodDates = (year, monthIndex) => {
    let prevMonthIndex = monthIndex - 1;
    let prevMonthYear = year;
    if (prevMonthIndex < 0) {
        prevMonthIndex = 11; // December
        prevMonthYear--;
    }

    // 1. Get the 2nd Sunday of the Previous Month
    const secondSundayPrevMonth = getNthDayOfMonth(prevMonthYear, prevMonthIndex, 0, 2); // 0 for Sunday, 2 for 2nd occurrence

    if (!secondSundayPrevMonth) {
        throw new Error('Could not determine the second Sunday of the previous month for outreach report.');
    }

    // 2. Calculate the Monday after the 2nd Sunday of the Previous Month
    const periodStartDate = new Date(secondSundayPrevMonth);
    periodStartDate.setDate(periodStartDate.getDate() + 1); // Add 1 day to get the next Monday

    // 3. Get the 3rd Sunday of the Current Month
    const periodEndDate = getNthDayOfMonth(year, monthIndex, 0, 3); // 0 for Sunday, 3 for 3rd occurrence

    if (!periodEndDate) {
        throw new Error('Could not determine the third Sunday of the current month for outreach report.');
    }

    // Set time to start of day for start date, end of day for end date (for inclusive range)
    periodStartDate.setHours(0, 0, 0, 0);
    periodEndDate.setHours(23, 59, 59, 999);

    return {
        periodStartDate,
        periodEndDate
    };
};
// --- End Helper Date Functions ---

// @desc    Submit a new detailed fellowship outreach report
// @route   POST /api/fellowship-outreach/reports
// @access  Private/Fellowship President, Super Admin, Administrator
const submitFellowshipOutreachReport = asyncHandler(async (req, res) => {
    const {
        fellowshipId,
        reportingMonth, // 'YYYY-MM-DD' (any day of the month)
        detailsOfVisits, // Array of objects, each with { schoolName, studentsReached, newConverts, materialsDistributed, challenges, successStories }
        totalSchoolsVisited, // These will be calculated by pre-save hook, but can be provided
        totalStudentsReached,
        totalNewConverts,
        totalMaterialsDistributed,
    } = req.body;

    const submittedBy = req.user._id;
    const userRole = req.user.role;
    const userFellowship = req.user.fellowship;

    // 1. Basic validation
    if (!fellowshipId || !reportingMonth || !detailsOfVisits || !Array.isArray(detailsOfVisits)) {
        res.status(400);
        throw new Error('Please provide fellowshipId, reportingMonth, and detailsOfVisits (array).');
    }

    // 2. Validate User Role for Submission
    const isFellowshipPresident = userRole.includes('fellowship_president');
    const isAdminOrSuperAdmin = userRole.includes('super_admin') || userRole.includes('administrator');

    if (isFellowshipPresident && userFellowship && userFellowship.toString() !== fellowshipId) {
        res.status(403);
        throw new Error('Fellowship President can only submit reports for their assigned fellowship.');
    } else if (!isFellowshipPresident && !isAdminOrSuperAdmin) {
        res.status(403);
        throw new Error('Not authorized to submit outreach reports.');
    }

    // 3. Ensure Fellowship exists
    const fellowshipExists = await Fellowship.findById(fellowshipId);
    if (!fellowshipExists) {
        res.status(404);
        throw new Error('Fellowship not found.');
    }

    // 4. Process Reporting Month (always store as 1st of the month for consistent indexing)
    const reportDateInput = new Date(reportingMonth);
    if (isNaN(reportDateInput.getTime())) {
        res.status(400);
        throw new Error('Invalid reportingMonth format. Please use ISO format (YYYY-MM-DD).');
    }
    const reportCalendarMonth = getStartOfMonth(reportDateInput);

    // 5. Check for existing report for this *fellowship* for this *calendar* month
    const existingReport = await FellowshipOutreachReport.findOne({
        fellowship: fellowshipId,
        reportingMonth: reportCalendarMonth,
    });
    if (existingReport) {
        res.status(400);
        throw new Error(`A detailed outreach report for ${fellowshipExists.name} for ${reportCalendarMonth.toDateString()} already exists.`);
    }

    // 6. Create the report
    const report = await FellowshipOutreachReport.create({
        fellowship: fellowshipId,
        reportingMonth: reportCalendarMonth, // Stored as 1st of the month for indexing
        detailsOfVisits,
        totalSchoolsVisited, // These will be overwritten by pre-save hook, but for schema validation
        totalStudentsReached,
        totalNewConverts,
        totalMaterialsDistributed,
        submittedBy,
        status: 'pending', // Default status
    });

    if (report) {
        // Augment report with custom period dates and fellowship name for response
        const { periodStartDate, periodEndDate } = getCustomReportingPeriodDates(
            reportCalendarMonth.getFullYear(),
            reportCalendarMonth.getMonth()
        );
        res.status(201).json({
            ...report.toObject(),
            fellowshipName: fellowshipExists.name,
            periodStartDate,
            periodEndDate
        });
    } else {
        res.status(400);
        throw new Error('Invalid detailed outreach report data.');
    }
});

// @desc    Get all detailed fellowship outreach reports (with filtering and role-based access)
// @route   GET /api/fellowship-outreach/reports
// @access  Private (various roles)
const getFellowshipOutreachReports = asyncHandler(async (req, res) => {
    const { month, year, status, fellowshipId, submittedBy, zoneId } = req.query;
    const user = req.user;

    let query = {};
    let reports = [];

    const baseQuery = FellowshipOutreachReport.find(query)
        .populate('fellowship', 'name zone')
        .populate('submittedBy', 'name email role')
        .populate('approvedBy', 'name email role');

    // Role-based access control
    if (user.role.includes('super_admin') || user.role.includes('administrator') || user.role.includes('national_coordinator') || user.role.includes('assistant_national_coordinator_secondary_school_outreach')) {
        // These roles can see all reports
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
        // Zonal Coordinator can only see reports from fellowships in their zone
        if (!user.zone) {
            res.status(403);
            throw new Error('User is a Zonal Coordinator but not assigned to a zone.');
        }
        const fellowshipsInZone = await Fellowship.find({ zone: user.zone }).select('_id');
        const fellowshipIdsInZone = fellowshipsInZone.map(f => f._id);

        if (fellowshipIdsInZone.length === 0) {
            return res.status(200).json([]); // No fellowships in their zone, return empty array
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
        // Fellowship President can only see their own reports
        if (!user.fellowship) {
            res.status(403);
            throw new Error('User is a Fellowship President but not assigned to a fellowship.');
        }
        query.fellowship = user.fellowship;
        query.submittedBy = user._id; // Ensure they only see their own reports

        if (status) query.status = status;
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 1);
            query.reportingMonth = { $gte: startDate, $lt: endDate };
        }
        reports = await baseQuery.find(query).sort({ reportingMonth: -1 });

    } else {
        res.status(403);
        throw new Error('Not authorized to view detailed outreach reports.');
    }

    // Filter by zoneId if provided in query and user is authorized to see other zones
    if (zoneId && (user.role.includes('super_admin') || user.role.includes('administrator') || user.role.includes('national_coordinator') || user.role.includes('assistant_national_coordinator_secondary_school_outreach'))) {
        reports = reports.filter(report => report.fellowship && report.fellowship.zone && report.fellowship.zone.toString() === zoneId);
    }

    // Augment reports with calculated custom period dates before sending
    const reportsWithPeriodDates = reports.map(report => {
        const reportCalendarMonth = report.reportingMonth;
        const { periodStartDate, periodEndDate } = getCustomReportingPeriodDates(
            reportCalendarMonth.getFullYear(),
            reportCalendarMonth.getMonth()
        );
        return {
            ...report.toObject(),
            periodStartDate,
            periodEndDate
        };
    });

    res.status(200).json(reportsWithPeriodDates);
});

// @desc    Get a single detailed fellowship outreach report by ID
// @route   GET /api/fellowship-outreach/reports/:id
// @access  Private (role-based)
const getFellowshipOutreachReportById = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const user = req.user;

    const report = await FellowshipOutreachReport.findById(reportId)
        .populate('fellowship', 'name zone')
        .populate('submittedBy', 'name email role')
        .populate('approvedBy', 'name email role');

    if (!report) {
        res.status(404);
        throw new Error('Fellowship outreach report not found.');
    }

    // Authorization check
    let authorized = false;
    if (user.role.includes('super_admin') || user.role.includes('administrator') || user.role.includes('national_coordinator') || user.role.includes('assistant_national_coordinator_secondary_school_outreach')) {
        authorized = true;
    } else if (user.role.includes('zonal_coordinator')) {
        if (user.zone && report.fellowship && report.fellowship.zone && user.zone.equals(report.fellowship.zone)) {
            authorized = true;
        }
    } else if (user.role.includes('fellowship_president')) {
        if (user.fellowship && report.fellowship && user.fellowship.equals(report.fellowship._id) && user._id.equals(report.submittedBy._id)) {
            authorized = true;
        }
    }

    if (!authorized) {
        res.status(403);
        throw new Error('Not authorized to view this detailed outreach report.');
    }

    // Augment report with calculated custom period dates before sending
    const reportCalendarMonth = report.reportingMonth;
    const { periodStartDate, periodEndDate } = getCustomReportingPeriodDates(
        reportCalendarMonth.getFullYear(),
        reportCalendarMonth.getMonth()
    );

    res.status(200).json({
        ...report.toObject(),
        periodStartDate,
        periodEndDate
    });
});

// @desc    Update an existing detailed fellowship outreach report
// @route   PUT /api/fellowship-outreach/reports/:id
// @access  Private/Fellowship President (if pending), Super Admin, Administrator
const updateFellowshipOutreachReport = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const user = req.user;
    const {
        detailsOfVisits,
        // totalSchoolsVisited, // These are calculated by pre-save hook
        // totalStudentsReached,
        // totalNewConverts,
        // totalMaterialsDistributed,
    } = req.body;

    const report = await FellowshipOutreachReport.findById(reportId);

    if (!report) {
        res.status(404);
        throw new Error('Fellowship outreach report not found.');
    }

    // Authorization for update
    const canUpdateAnyStatus = ['super_admin', 'administrator'].includes(user.role);
    const canUpdateOwnPending = user.role.includes('fellowship_president') && report.submittedBy.equals(user._id) && report.status === 'pending';

    if (!canUpdateAnyStatus && !canUpdateOwnPending) {
        res.status(403);
        throw new Error('Not authorized to update this report, or report is not in pending status.');
    }

    // Update fields
    if (detailsOfVisits !== undefined) {
        report.detailsOfVisits = detailsOfVisits;
    }

    const updatedReport = await report.save(); // Pre-save hook will recalculate summary totals

    const { periodStartDate, periodEndDate } = getCustomReportingPeriodDates(
        updatedReport.reportingMonth.getFullYear(),
        updatedReport.reportingMonth.getMonth()
    );

    res.status(200).json({
        ...updatedReport.toObject(),
        periodStartDate,
        periodEndDate
    });
});


// @desc    Approve or reject a detailed fellowship outreach report
// @route   PUT /api/fellowship-outreach/reports/:id/approve-reject
// @access  Private/Zonal Coordinator, National Coordinator, Super Admin, Administrator
const approveRejectFellowshipOutreachReport = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const { status, rejectionReason } = req.body; // status: 'approved' or 'rejected'
    const approvedBy = req.user._id;
    const approverRole = req.user.role;
    const approverZone = req.user.zone; // Zonal Coordinator's zone

    if (!['approved', 'rejected'].includes(status)) {
        res.status(400);
        throw new Error('Invalid status. Must be "approved" or "rejected".');
    }

    const report = await FellowshipOutreachReport.findById(reportId).populate('fellowship', 'zone');

    if (!report) {
        res.status(404);
        throw new Error('Fellowship outreach report not found.');
    }

    if (report.status !== 'pending') {
        res.status(400);
        throw new Error(`Report is already ${report.status}. Cannot change status.`);
    }

    // Authorization for approval
    const authorizedToApprove = ['super_admin', 'administrator', 'national_coordinator'].includes(approverRole) ||
                                 (approverRole.includes('zonal_coordinator') && report.fellowship && report.fellowship.zone && approverZone.equals(report.fellowship.zone));

    if (!authorizedToApprove) {
        res.status(403);
        throw new Error('Not authorized to approve/reject this detailed outreach report.');
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
    } else { // status === 'approved'
        report.rejectionReason = undefined; // Clear rejection reason if approved
    }

    const updatedReport = await report.save();

    const { periodStartDate, periodEndDate } = getCustomReportingPeriodDates(
        updatedReport.reportingMonth.getFullYear(),
        updatedReport.reportingMonth.getMonth()
    );

    res.status(200).json({
        ...updatedReport.toObject(),
        periodStartDate,
        periodEndDate
    });
});


// @desc    Delete a fellowship outreach report
// @route   DELETE /api/fellowship-outreach/reports/:id
// @access  Private/Admin, Super Admin, or Fellowship President (if pending and submitted by them)
const deleteFellowshipOutreachReport = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const user = req.user;

    const report = await FellowshipOutreachReport.findById(reportId);

    if (!report) {
        res.status(404);
        throw new Error('Fellowship outreach report not found.');
    }

    // Authorization for deletion
    const canDeleteAny = ['super_admin', 'administrator'].includes(user.role);
    const canDeleteOwnPending = user.role.includes('fellowship_president') && report.submittedBy.equals(user._id) && report.status === 'pending';

    if (!canDeleteAny && !canDeleteOwnPending) {
        res.status(403);
        throw new Error('Not authorized to delete this report.');
    }

    await report.deleteOne(); // Use deleteOne() for Mongoose 6+

    res.status(200).json({ message: 'Fellowship outreach report removed.' });
});


module.exports = {
    submitFellowshipOutreachReport,
    getFellowshipOutreachReports,
    getFellowshipOutreachReportById,
    updateFellowshipOutreachReport,
    approveRejectFellowshipOutreachReport,
    deleteFellowshipOutreachReport,
};