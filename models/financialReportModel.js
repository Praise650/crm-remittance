// backend/models/financialReportModel.js
const mongoose = require('mongoose');

const financialReportSchema = mongoose.Schema(
    {
        fellowship: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Fellowship',
            required: true,
        },
        reportingMonth: {
            type: Date, // Store as a Date object, typically the first day of the month (e.g., new Date('2024-06-01'))
            required: true,
            unique: true, // Ensures only one report per fellowship per month
            // To ensure uniqueness across fellowship and month, we'll use a compound index later
        },
        // Income Section
        tithe: {
            type: Number,
            required: true,
            default: 0,
        },
        offering: {
            type: Number,
            required: true,
            default: 0,
        },
        projectDonation: {
            type: Number,
            default: 0,
        },
        otherIncome: {
            type: Number,
            default: 0,
        },
        // Expense Section
        fellowshipProgramExpense: {
            type: Number,
            default: 0,
        },
        welfareExpense: {
            type: Number,
            default: 0,
        },
        adminExpense: {
            type: Number,
            default: 0,
        },
        outreachExpense: {
            type: Number,
            default: 0,
        },
        zonalLevy: { // This will be calculated, not directly input
            type: Number,
            default: 0,
        },
        nationalLevy: { // This will be calculated, not directly input
            type: Number,
            default: 0,
        },
        // Calculated fields
        totalIncome: {
            type: Number,
            default: 0,
        },
        totalExpense: {
            type: Number,
            default: 0,
        },
        balanceCarriedForward: { // Closing balance for the current month
            type: Number,
            default: 0,
        },
        balanceBroughtDown: { // Opening balance from previous month
            type: Number,
            default: 0,
            required: true, // This will be 0 for the very first report, but typically required
        },
        approvedByAccountant: {
            type: Boolean,
            default: false,
        },
        // Reference to the user who submitted the report (Fellowship President)
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Reference to the user who approved the report (Accountant)
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        approvalDate: {
            type: Date,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        rejectionReason: {
            type: String,
        }
    },
    {
        timestamps: true,
    }
);

// Compound unique index to ensure only one report per fellowship per month
financialReportSchema.index({ fellowship: 1, reportingMonth: 1 }, { unique: true });


// Pre-save hook to calculate total income, total expense, and balance carried forward
// And to potentially auto-calculate zonal/national levy based on rules
financialReportSchema.pre('save', async function (next) {
    // Only calculate if these fields are modified or if it's a new document
    if (this.isModified('tithe') || this.isModified('offering') || this.isModified('projectDonation') ||
        this.isModified('otherIncome') || this.isModified('fellowshipProgramExpense') ||
        this.isModified('welfareExpense') || this.isModified('adminExpense') ||
        this.isModified('outreachExpense') || this.isNew) {

        this.totalIncome = this.tithe + this.offering + this.projectDonation + this.otherIncome;
        
        // Temporarily calculate total expenses *without* levies for now.
        // Levies will be added to totalExpense later after their calculation.
        let baseExpenses = this.fellowshipProgramExpense + this.welfareExpense + this.adminExpense + this.outreachExpense;
        this.totalExpense = baseExpenses; // Initial assignment

        // Calculate levies based on business rules (e.g., % of total income or tithe)
        // For example, let's assume 10% of tithe for Zonal Levy, and 5% of tithe for National Levy
        // These percentages should ideally be configurable (e.g., in a settings document)
        const ZONAL_LEVY_PERCENT = 0.10; // 10%
        const NATIONAL_LEVY_PERCENT = 0.05; // 5%

        this.zonalLevy = this.tithe * ZONAL_LEVY_PERCENT;
        this.nationalLevy = this.tithe * NATIONAL_LEVY_PERCENT;

        // Add levies to total expenses
        this.totalExpense = baseExpenses + this.zonalLevy + this.nationalLevy;
        
        // Calculate balance carried forward including the balance brought down
        this.balanceCarriedForward = this.balanceBroughtDown + this.totalIncome - this.totalExpense;
    }
    next();
});

const FinancialReport = mongoose.model('FinancialReport', financialReportSchema);

module.exports = FinancialReport;