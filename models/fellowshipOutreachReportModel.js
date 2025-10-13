// backend/models/fellowshipOutreachReportModel.js
const mongoose = require('mongoose');

const fellowshipOutreachReportSchema = mongoose.Schema(
    {
        reportingMonth: {
            type: Date, // Represents the calendar month (e.g., new Date('2025-07-01'))
            required: true,
        },
        fellowship: { // Key field: links report to a specific fellowship
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Fellowship',
            required: true,
        },
        // The actual reporting period (3rd Sun prev month to 2nd Sun current month)
        // will be calculated dynamically for display, consistent with other reports.

        // Outreach Activity Details (summary fields)
        totalSchoolsVisited: {
            type: Number,
            required: true, // Will be calculated by pre-save hook
            min: 0,
            default: 0,
        },
        totalStudentsReached: {
            type: Number,
            required: true, // Will be calculated by pre-save hook
            min: 0,
            default: 0,
        },
        totalNewConverts: {
            type: Number,
            required: true, // Will be calculated by pre-save hook
            min: 0,
            default: 0,
        },
        totalMaterialsDistributed: { // e.g., Bibles, tracts, flyers
            type: Number,
            default: 0, // Will be calculated by pre-save hook
            min: 0,
        },
        testimoniesRecorded: { // Number of notable testimonies from outreach
            type: Number,
            default: 0,
            min: 0,
        },
        
        // Detailed breakdown of each school visit
        detailsOfVisits: [
            {
                schoolName: { type: String, required: true },
                visitDate: { type: Date, required: true },
                studentsReached: { type: Number, default: 0, min: 0 },
                newConverts: { type: Number, default: 0, min: 0 },
                materialsDistributed: { type: Number, default: 0, min: 0 },
                contactPerson: { type: String }, // Key person in the school
                contactDetails: { type: String }, // e.g., phone, email of contact person
                remarks: { type: String },
            },
        ],
        challengesFaced: { // Narrative text for challenges
            type: String,
        },
        lessonsLearned: { // Narrative text for lessons learned
            type: String,
        },
        recommendations: { // Narrative text for recommendations
            type: String,
        },

        // Status and Submission Workflow
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true, // This will be the Fellowship President
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Likely Zonal Coordinator, National Coordinator, or Super Admin
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

// Compound unique index: One detailed outreach report per fellowship per calendar month
fellowshipOutreachReportSchema.index({ fellowship: 1, reportingMonth: 1 }, { unique: true });

// Pre-save hook to calculate summary fields from `detailsOfVisits`
fellowshipOutreachReportSchema.pre('save', function (next) {
    if (this.isModified('detailsOfVisits') || this.isNew) {
        this.totalSchoolsVisited = this.detailsOfVisits.length;
        this.totalStudentsReached = this.detailsOfVisits.reduce((sum, visit) => sum + (visit.studentsReached || 0), 0);
        this.totalNewConverts = this.detailsOfVisits.reduce((sum, visit) => sum + (visit.newConverts || 0), 0);
        this.totalMaterialsDistributed = this.detailsOfVisits.reduce((sum, visit) => sum + (visit.materialsDistributed || 0), 0);
    }
    next();
});

const FellowshipOutreachReport = mongoose.model('FellowshipOutreachReport', fellowshipOutreachReportSchema);

module.exports = FellowshipOutreachReport;