const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    roleId: Number,
    permissions: {
      type: Map,
      of: Boolean,
      default: {},
    },
    phone: Number,
    status: Boolean,
    email: String,
    email_verified_at: { type: Date, default: null },
    phone_verified_at: { type: Date, default: null },
    image: String,
    password: String,
    age: Number,
    gender: {
      type: String,
      enum: ["male", "female", "other", null],
      default: null,
    },
    address: String,
    bloodGroup: String,
    medicalHistory: String,
    specialization: String,
    description: String,
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
    },
    experience: String,
    qualification: String,
    expertise: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    dischargedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("user", userSchema);
