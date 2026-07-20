const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    serviceName: {
      type: String,
      trim: true,
      default: "",
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    doctorName: {
      type: String,
      trim: true,
      default: "",
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    appointmentDate: {
      type: Date,
      required: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AppointmentSlot",
      default: null,
    },
    slotType: {
      type: String,
      enum: ["daily", "weekly", null],
      default: null,
    },
    slotLabel: {
      type: String,
      trim: true,
      default: "",
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    age: {
      type: Number,
      default: null,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", null],
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    bloodGroup: {
      type: String,
      trim: true,
      default: "",
    },
    medicalHistory: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    rescheduleReason: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "rescheduled",
        "completed",
        "rejected",
        "cancelled",
      ],
      default: "pending",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rescheduledAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
    dischargedAt: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    payment: {
      provider: { type: String, trim: true, default: "" },
      status: {
        type: String,
        enum: ["not_required", "pending", "paid", "failed", ""],
        default: "not_required",
      },
      amount: { type: Number, default: 0 },
      currency: { type: String, trim: true, default: "INR" },
      razorpayOrderId: { type: String, trim: true, default: "" },
      razorpayPaymentId: { type: String, trim: true, default: "" },
      verifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
