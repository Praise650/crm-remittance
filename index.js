// backend/index.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Import Routes ---
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const zoneRoutes = require("./routes/zoneRoutes");
const fellowshipRoutes = require("./routes/fellowshipRoutes");
const fellowshipOutreachReportRoutes = require("./routes/fellowshipOutreachReportRoutes");
const outreachReportRoutes = require("./routes/outreachReportRoutes");
const financeRoutes = require("./routes/financeRoutes");
const activityReportRoutes = require("./routes/activityReportRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

// --- Health Check ---

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get("/api/health", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// --- Mount Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/fellowships", fellowshipRoutes);
app.use("/api/fellowship-outreach", fellowshipOutreachReportRoutes);
app.use("/api/outreach", outreachReportRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/activity", activityReportRoutes);
app.use("/api/analytics", analyticsRoutes);

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(res.statusCode === 200 ? 500 : res.statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

// --- Connect to MongoDB ---
mongoose.set("strictQuery", true);

mongoose.connect(process.env.MONGODB_URI, { autoIndex: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1); // exit if cannot connect
  });

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
