const mongoose = require("mongoose");

const metaLeadSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    leadId: { type: String, required: true },
    formId: { type: String, required: true },
    formName: { type: String, default: "" },
    pageId: { type: String, required: true },
    platform: { type: String, enum: ["Facebook"], default: "Facebook" },
    createdTime: { type: Date, required: true },
    fullName: { type: String, default: "" },
    email: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
    fieldData: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "closed"],
      default: "new",
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

metaLeadSchema.index({ adminId: 1, leadId: 1 }, { unique: true });
metaLeadSchema.index({ adminId: 1, createdTime: -1 });
metaLeadSchema.index({ adminId: 1, status: 1 });

module.exports = mongoose.model("MetaLead", metaLeadSchema);