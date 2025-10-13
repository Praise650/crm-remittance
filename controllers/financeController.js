// backend/controllers/financeController.js
const asyncHandler = require('express-async-handler');
const FinancialReport = require('../models/financialReportModel');
const Fellowship = require('../models/fellowshipModel');
const User = require('../models/User');
const mongoose = require('mongoose');

// --- Helper Date Functions ---

// Get the start of a calendar month
const getStartOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

// Function to find the Nth occurrence of a day of the week in a month
// dayOfWeek: 0 (Sunday) to 6 (Saturday)
// occurrence: 1 for 1st, 2 for 2nd, etc.
// year, month (0-indexed)
const getNthDayOfMonth = (year, month, dayOfWeek, occurrence) => {
    let date = new Date(year, month, 1);
    let count = 0;
    while (date.getMonth() === month) {
        if (date.getDay() === dayOfWeek) {
            count++;
            if (count === occurrence) {
                // Return a new Date object to avoid reference issues
                return new Date(date.getFullYear(), date.getMonth(), date.getDate());
            }
        }
        date.setDate(date.getDate() + 1);
    }
    return null; // Not found
};

// Function to get the custom reporting period dates for a given calendar month
const getCustomReportingPeriodDates = (year, monthIndex) => { // monthIndex is 0-indexed (Jan=0, Feb=1)
    // Previous month's 3rd Sunday
    let prevMonthIndex = monthIndex - 1;
    let prevMonthYear = year;
    if (prevMonthIndex < 0) {
        prevMonthIndex = 11; // December
        prevMonthYear--;
    }
    const periodStartDate = getNthDayOfMonth(prevMonthYear, prevMonthIndex, 0, 3); // 0 for Sunday, 3 for 3rd

    // Current month's 2nd Sunday
    const periodEndDate = getNthDayOfMonth(year, monthIndex, 0, 2); // 0 for Sunday, 2 for 2nd

    if (!periodStartDate || !periodEndDate) {
        // Fallback for edge cases (e.g., very early dates where 3rd Sunday of prev month doesn't exist)
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

// @desc    Submit a new financial report for a fellowship
// @route   POST /api/finance/reports
// @access  Private/Fellowship President RCF/RCCF
const submitFinancialReport = asyncHandler(async (req, res) => {
    const {
        fellowshipId,
        reportingMonth, // Expected format: 'YYYY-MM-DD' (any day of the month)
        tithe,
        offering,
        projectDonation,
        otherIncome,
        fellowshipProgramExpense,
        welfareExpense,
        adminExpense,
        outreachExpense,
    } = req.body;

    const submittedBy = req.user._id; // Authenticated user
    const userRole = req.user.role;
    const userFellowship = req.user.fellowship; // The fellowship ID associated with the president

    // 1. Basic Validation
    if (!fellowshipId || !reportingMonth || tithe === undefined || offering === undefined) {
        res.status(400);
        throw new Error('Please fill all required financial report fields (fellowshipId, reportingMonth, tithe, offering).');
    }

    // 2. Validate User Role and Fellowship Link
    if (!userRole.includes('fellowship_president')) {
        res.status(403);
        throw new Error('Only Fellowship Presidents can submit financial reports.');
    }
    if (!userFellowship || !userFellowship.equals(fellowshipId)) {
        res.status(403);
        throw new Error('You are not authorized to submit reports for this fellowship.');
    }

    // 3. Process Reporting Month (to represent the calendar month for the report)
    const reportDateInput = new Date(reportingMonth);
    if (isNaN(reportDateInput.getTime())) {
        res.status(400);
        throw new Error('Invalid reportingMonth format. Please use YYYY-MM-DD.');
    }
    const reportCalendarMonth = getStartOfMonth(reportDateInput); // This is the date stored in the model

    // 4. Check for existing report for this *calendar* month/fellowship (unique compound index will also catch this)
    const existingReport = await FinancialReport.findOne({
        fellowship: fellowshipId,
        reportingMonth: reportCalendarMonth,
    });
    if (existingReport) {
        res.status(400);
        throw new Error(`A financial report for fellowship ${fellowshipId} for ${reportCalendarMonth.toDateString()} already exists.`);
    }

    // 5. Calculate Balance Brought Down (from previous *calendar* month's APPROVED report)
    let balanceBroughtDown = 0;
    const previousCalendarMonth = new Date(reportCalendarMonth);
    previousCalendarMonth.setMonth(previousCalendarMonth.getMonth() - 1); // Go back one calendar month

    const prevApprovedReport = await FinancialReport.findOne({
        fellowship: fellowshipId,
        reportingMonth: getStartOfMonth(previousCalendarMonth),
        status: 'approved' // Only pull balance from APPROVED reports
    }).sort({ reportingMonth: -1 });

    if (prevApprovedReport) {
        balanceBroughtDown = prevApprovedReport.balanceCarriedForward;
    }

    // 6. Create the report
    const report = await FinancialReport.create({
        fellowship: fellowshipId,
        reportingMonth: reportCalendarMonth, // Store the start of the calendar month
        tithe,
        offering,
        projectDonation,
        otherIncome,
        fellowshipProgramExpense,
        welfareExpense,
        adminExpense,
        outreachExpense,
        balanceBroughtDown, // Set the calculated balance brought down
        submittedBy,
        status: 'pending', // Default status
    });

    if (report) {
        // Add custom period dates for response, but not stored in DB
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
        throw new Error('Invalid financial report data.');
    }
});


// @desc    Get financial reports (all, by fellowship, by zone, by month)
// @route   GET /api/finance/reports
// @access  Private (varies by role: Accountant, Zonal Coordinator, National Coordinator, Super Admin, Admin)
const getFinancialReports = asyncHandler(async (req, res) => {
    const { fellowshipId, zoneId, month, year, status } = req.query; // Query parameters
    const user = req.user;

    let query = {};
    let reports = [];

    // Base query for role-based access control
    if (user.role === 'super_admin' || user.role === 'administrator' || user.role === 'accountant' ||
        user.role === 'national_coordinator' || user.role === 'assistant_national_coordinator_secondary_school_outreach') {
        // These roles can view all reports (or filter by query)
        if (fellowshipId) query.fellowship = fellowshipId;
        if (status) query.status = status;
        if (month && year) {
            const startDate = new Date(year, month - 1, 1); // month is 0-indexed in JS Date
            const endDate = new Date(year, month, 1);
            query.reportingMonth = { $gte: startDate, $lt: endDate };
        }

        if (zoneId) {
            // Find all fellowships within this zone
            const fellowshipsInZone = await Fellowship.find({ zone: zoneId }).select('_id');
            const fellowshipIds = fellowshipsInZone.map(f => f._id);
            query.fellowship = { $in: fellowshipIds };
        }
        reports = await FinancialReport.find(query)
            .populate('fellowship', 'name zone')
            .populate('submittedBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ reportingMonth: -1 });

    } else if (user.role === 'zonal_coordinator') {
        // Zonal coordinator can only see reports from fellowships in their assigned zone
        if (!user.zone) {
            res.status(400);
            throw new Error('Zonal coordinator not assigned to a zone.');
        }
        const fellowshipsInZone = await Fellowship.find({ zone: user.zone }).select('_id');
        const fellowshipIds = fellowshipsInZone.map(f => f._id);

        query.fellowship = { $in: fellowshipIds };
        if (status) query.status = status;
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 1);
            query.reportingMonth = { $gte: startDate, $lt: endDate };
        }

        reports = await FinancialReport.find(query)
            .populate('fellowship', 'name zone')
            .populate({
                path: 'fellowship',
                select: 'name zone',
                populate: { path: 'zone', select: 'name' } // Populate zone name within fellowship
            })
            .populate('submittedBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ reportingMonth: -1 });

    } else if (user.role.includes('fellowship_president')) {
        // Fellowship President can only see reports from their own fellowship
        if (!user.fellowship) {
            res.status(400);
            throw new Error('Fellowship President not assigned to a fellowship.');
        }
        query.fellowship = user.fellowship;
        if (status) query.status = status;
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 1);
            query.reportingMonth = { $gte: startDate, $lt: endDate };
        }

        reports = await FinancialReport.find(query)
            .populate('fellowship', 'name zone')
            .populate('submittedBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ reportingMonth: -1 });

    } else {
        res.status(403);
        throw new Error('Not authorized to view financial reports.');
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


// @desc    Get a single financial report by ID
// @route   GET /api/finance/reports/:id
// @access  Private (role-based)
const getFinancialReportById = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const user = req.user;

    const report = await FinancialReport.findById(reportId)
        .populate({
            path: 'fellowship',
            select: 'name zone',
            populate: { path: 'zone', select: 'name' } // Populate zone name within fellowship
        })
        .populate('submittedBy', 'name email')
        .populate('approvedBy', 'name email');

    if (!report) {
        res.status(404);
        throw new Error('Financial report not found.');
    }

    // Authorization check
    let authorized = false;
    if (user.role === 'super_admin' || user.role === 'administrator' || user.role === 'accountant' ||
        user.role === 'national_coordinator' || user.role === 'assistant_national_coordinator_secondary_school_outreach') {
        authorized = true;
    } else if (user.role === 'zonal_coordinator' && user.zone && report.fellowship && report.fellowship.zone && user.zone.equals(report.fellowship.zone._id)) {
        authorized = true;
    } else if (user.role.includes('fellowship_president') && user.fellowship && user.fellowship.equals(report.fellowship._id)) {
        authorized = true;
    }

    if (!authorized) {
        res.status(403);
        throw new Error('Not authorized to view this financial report.');
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


// @desc    Approve/Reject a financial report
// @route   PUT /api/finance/reports/:id/approve-reject
// @access  Private/Accountant
const approveRejectFinancialReport = asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const { status, rejectionReason } = req.body; // status: 'approved' or 'rejected'
    const approvedBy = req.user._id;

    if (!['approved', 'rejected'].includes(status)) {
        res.status(400);
        throw new Error('Invalid status. Must be "approved" or "rejected".');
    }

    const report = await FinancialReport.findById(reportId);

    if (!report) {
        res.status(404);
        throw new Error('Financial report not found.');
    }

    if (report.status !== 'pending') {
        res.status(400);
        throw new Error(`Report is already ${report.status}. Cannot change status.`);
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
        report.approvedByAccountant = false; // Explicitly set false if rejected
    } else { // status === 'approved'
        report.approvedByAccountant = true;
        report.rejectionReason = undefined; // Clear rejection reason if approved
    }

    const updatedReport = await report.save();

    res.status(200).json(updatedReport);
});

// Future: Update existing report (only if status is pending and by original submitter)
// const updateFinancialReport = asyncHandler(async (req, res) => { ... });

module.exports = {
    submitFinancialReport,
    getFinancialReports,
    getFinancialReportById,
    approveRejectFinancialReport,
    // Export helper functions for testing if needed, but typically kept internal
    // getNthDayOfMonth,
    // getCustomReportingPeriodDates
};