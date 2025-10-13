// backend/models/activityReportModel.js
const mongoose = require('mongoose');

const activityReportSchema = mongoose.Schema(
    {
        reportingMonth: {
            type: Date, // Represents the calendar month (e.g., new Date('2025-07-01'))
            required: true,
        },
        fellowship: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Fellowship',
            required: true,
        },
        // The actual reporting period (3rd Sun prev month to 2nd Sun current month)
        // will be calculated dynamically for display, consistent with other reports.

        totalAttendance: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        totalNewConverts: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        totalProgramsHeld: { // e.g., Bible studies, evangelism, prayer meetings
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        // Basic outreach summary for this report (more detailed in FellowshipOutreachReport)
        outreachActivitiesConducted: { // Number of separate outreach events (e.g., school visits, street evangelism)
            type: Number,
            default: 0,
            min: 0,
        },
        basicOutreachSynopsis: { // Short text summary of general outreach activities
            type: String,
            trim: true,
        },
        challenges: {
            type: String,
        },
        successStories: {
            type: String,
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        approvalDate: {
            type: Date,
        },
        rejectionReason: {
            type: String,
        }
    },
    {
        timestamps: true,
    }
);

// Compound unique index: One activity report per fellowship per calendar month
activityReportSchema.index({ fellowship: 1, reportingMonth: 1 }, { unique: true });

const ActivityReport = mongoose.model('ActivityReport', activityReportSchema);

module.exports = ActivityReport;