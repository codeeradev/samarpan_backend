const mongoose = require("mongoose");

const analyticsVisitorPageSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, trim: true },
    page: { type: String, required: true, trim: true },
    sectionKey: { type: String, default: null, index: true },
    pageViews: { type: Number, default: 0 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { versionKey: false },
);

analyticsVisitorPageSchema.index({ visitorId: 1, page: 1 }, { unique: true });
analyticsVisitorPageSchema.index({ page: 1 });

module.exports = mongoose.model("AnalyticsVisitorPage", analyticsVisitorPageSchema);
