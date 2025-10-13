// backend/controllers/outreachReportController.js
const asyncHandler = require('express-async-handler');
const OutreachReport = require('../models/outreachReportModel');
const User = require('../models/User'); // To populate submittedBy/approvedBy details

// --- Helper Date Functions (Copied for consistency across reporting modules) ---
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
        prevMonthIndex = 11;
        prevMonthYear--;
    }
    const periodStartDate = getNthDayOfMonth(prevMonthYear, prevMonthIndex, 0, 3);
    const periodEndDate = getNthDayOfMonth(year, monthIndex, 0, 2);

    if (!periodStartDate || !periodEndDate) {
        throw new Error('Could not determine custom reporting period dates for the given month.');
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


// @desc    Submit a new outreach report
// @route   POST /api/outreach/reports
// @access  Private/Assistant National Coordinator Secondary School Outreach (or Super Admin/Admin)
const submitOutreachReport = asyncHandler(async (req, res) => {
    const {
        reportingMonth, // 'YYYY-MM-DD' (any day of the month)
        detailsOfVisits, // Array of school visit details
        challengesFaced,
        lessonsLearned,
        recommendations,
        testimoniesRecorded // Optional
    } = req.body;

    const submittedBy = req.user._id;
    const userRole = req.user.role;

    // 1. Basic Validation
    if (!reportingMonth || !detailsOfVisits || !Array.isArray(detailsOfVisits)) {
        res.status(400);
        throw new Error('Please provide reportingMonth and detailsOfVisits (as an array) for the outreach report.');
    }
    if (detailsOfVisits.length === 0) {
         res.status(400);
         throw new Error('At least one school visit detail is required.');
    }
    // Basic validation for each visit detail
    for (const visit of detailsOfVisits) {
        if (!visit.schoolName || !visit.visitDate) {
            res.status(400);
            throw new Error('Each school visit must have a schoolName and visitDate.');
        }
    }

    // 2. Validate User Role for Submission
    if (!userRole.includes('assistant_national_coordinator_secondary_school_outreach') &&
        !userRole.includes('super_admin') && !userRole.includes('administrator')) {
        res.status(403);
        throw new Error('Only Assistant National Coordinator Secondary School Outreach, Super Admin, or Administrator can submit outreach reports.');
    }

    // 3. Process Reporting Month
    const reportDateInput = new Date(reportingMonth);
    if (isNaN(reportDateInput.getTime())) {
        res.status(400);
        throw new Error('Invalid reportingMonth format. Please use ISO format (YYYY-MM-DD).');
    }
    const reportCalendarMonth = getStartOfMonth(reportDateInput);

    // 4. Check for existing report for this *calendar* month/submitting user
    const existingReport = await OutreachReport.findOne({
        submittedBy: submittedBy,
        reportingMonth: reportCalendarMonth,
    });
    if (existingReport) {
        res.status(400);
        throw new Error(`An outreach report for this user for ${reportCalendarMonth.toDateString()} already exists.`);
    }

    // 5. Create the report
    const report = await OutreachReport.create({
        reportingMonth: reportCalendarMonth,
        detailsOfVisits,
        challengesFaced,
        lessonsLearned,
        recommendations,
        testimoniesRecorded, // Optional, can be undefined if not provided
        submittedBy,
        status: 'pending', // Default status
    });

    if (report) {
        // Augment report with custom period dates for response, but not stored in DB
        const { periodStartDate, periodEndDate } = getCustomReportingPeriodDates(
            reportCalendarMonth.getFullYear(),
            reportCalendarMonth.getMonth()
        );
        res.status(201).json({
            ...report.toObject(), // Convert mongoose document to plain object
            periodStartDate,
            periodEndDate
        });
    } else {
        res.status(400);
        throw new Error('Invalid outreach report data.');
    }
});


// @desc    Get all outreach reports (with filtering and role-based access)
// @route   GET /api/outreach/reports
// @access  Private (various roles: National/Asst. National Coord, Zonal Coord, Admin, Super Admin)
const getOutreachReports = asyncHandler(async (req, res) => {
    const { month, year, status, submittedBy } = req.query; // submittedBy query param to filter by specific coordinator
    const user = req.user;

    let query = {};
    let reports = [];

    // Define roles allowed to view all outreach reports
    const allowedToViewAll = ['super_admin', 'administrator', 'national_coordinator', 'assistant_national_coordinator_secondary_school_outreach', 'zonal_coordinator'];

    if (!allowedToViewAll.includes(user.role)) {
        res.status(403);
        throw new Error('Not authorized to view outreach reports.');
    }

    if (status) query.status = status;
    if (month && year) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        query.reportingMonth = { $gte: startDate, $lt: endDate };
    }
    if (submittedBy) query.submittedBy = submittedBy; // Filter by submitting user ID

    reports = await OutreachReport.find(query)
        .populate('submittedBy', 'name email role')
        .populate('approvedBy', 'name email role')
        .sort({ reportingMonth: -1 });

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


// @desc    Get a single outreach report by ID
// @route   GET /api/outreach/reports/:id
// @access  Private (role-based)
const getOutreachReportById = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const user = req.user;

    const report = await OutreachReport.findById(reportId)
        .populate('submittedBy', 'name email role')
        .populate('approvedBy', 'name email role');

    if (!report) {
        res.status(404);
        throw new Error('Outreach report not found.');
    }

    // Authorization check (same as getOutreachReports for consistency)
    let authorized = false;
    const allowedToView = ['super_admin', 'administrator', 'national_coordinator', 'assistant_national_coordinator_secondary_school_outreach', 'zonal_coordinator'];

    if (allowedToView.includes(user.role)) {
        authorized = true;
    }

    if (!authorized) {
        res.status(403);
        throw new Error('Not authorized to view this outreach report.');
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


// @desc    Update an outreach report (only if pending, by original submitter, or Admin/Super Admin)
// @route   PUT /api/outreach/reports/:id
// @access  Private/Assistant National Coordinator Secondary School Outreach (pending), Admin/Super Admin (any)
const updateOutreachReport = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const user = req.user;
    const {
        detailsOfVisits,
        challengesFaced,
        lessonsLearned,
        recommendations,
        testimoniesRecorded
    } = req.body;

    const report = await OutreachReport.findById(reportId);

    if (!report) {
        res.status(404);
        throw new Error('Outreach report not found.');
    }

    // Authorization for update
    const canUpdateAnyStatus = ['super_admin', 'administrator'].includes(user.role);
    const canUpdateOwnPending = user.role.includes('assistant_national_coordinator_secondary_school_outreach') && report.submittedBy.equals(user._id) && report.status === 'pending';

    if (!canUpdateAnyStatus && !canUpdateOwnPending) {
        res.status(403);
        throw new Error('Not authorized to update this report, or report is not in pending status.');
    }

    // Update fields (only if provided in request body)
    if (detailsOfVisits !== undefined) {
        if (!Array.isArray(detailsOfVisits) || detailsOfVisits.length === 0) {
            res.status(400);
            throw new Error('detailsOfVisits must be a non-empty array.');
        }
        for (const visit of detailsOfVisits) {
            if (!visit.schoolName || !visit.visitDate) {
                res.status(400);
                throw new Error('Each school visit must have a schoolName and visitDate.');
            }
        }
        report.detailsOfVisits = detailsOfVisits; // This will trigger pre-save hook
    }
    
    report.challengesFaced = challengesFaced !== undefined ? challengesFaced : report.challengesFaced;
    report.lessonsLearned = lessonsLearned !== undefined ? lessonsLearned : report.lessonsLearned;
    report.recommendations = recommendations !== undefined ? recommendations : report.recommendations;
    report.testimoniesRecorded = testimoniesRecorded !== undefined ? testimoniesRecorded : report.testimoniesRecorded;

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


// @desc    Approve/Reject an outreach report
// @route   PUT /api/outreach/reports/:id/approve-reject
// @access  Private/National Coordinator, Super Admin, Administrator
const approveRejectOutreachReport = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const { status, rejectionReason } = req.body; // status: 'approved' or 'rejected'
    const approvedBy = req.user._id;
    const approverRole = req.user.role;

    if (!['approved', 'rejected'].includes(status)) {
        res.status(400);
        throw new Error('Invalid status. Must be "approved" or "rejected".');
    }

    const report = await OutreachReport.findById(reportId);

    if (!report) {
        res.status(404);
        throw new Error('Outreach report not found.');
    }

    if (report.status !== 'pending') {
        res.status(400);
        throw new Error(`Report is already ${report.status}. Cannot change status.`);
    }

    // Authorization for approval
    const authorizedToApprove = ['super_admin', 'administrator', 'national_coordinator'].includes(approverRole);

    if (!authorizedToApprove) {
        res.status(403);
        throw new Error('Not authorized to approve/reject this outreach report.');
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


module.exports = {
    submitOutreachReport,
    getOutreachReports,
    getOutreachReportById,
    updateOutreachReport,
    approveRejectOutreachReport,
};