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
  },
  { timestamps: true },
);

module.exports = mongoose.model("user", userSchema);
