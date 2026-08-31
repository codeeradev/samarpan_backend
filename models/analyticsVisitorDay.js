const mongoose = require("mongoose");

const analyticsVisitorDaySchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, trim: true },
    day: { type: String, required: true, index: true },
    pageViews: { type: Number, default: 0 },
    firstSeenAt: { type: Date, required: true },
    // The dashboard only needs recent windows, so old daily rows expire automatically.
    lastSeenAt: { type: Date, required: true, expires: 45 * 24 * 60 * 60 },
  },
  { versionKey: false },
);

analyticsVisitorDaySchema.index({ visitorId: 1, day: 1 }, { unique: true });
analyticsVisitorDaySchema.index({ day: 1, visitorId: 1 });

module.exports = mongoose.model("AnalyticsVisitorDay", analyticsVisitorDaySchema);
