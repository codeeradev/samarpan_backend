const mongoose = require("mongoose");

const analyticsVisitorSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, trim: true, unique: true },
    totalPageViews: { type: Number, default: 0 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true, index: true },
  },
  { versionKey: false },
);

module.exports = mongoose.model("AnalyticsVisitor", analyticsVisitorSchema);
