const mongoose = require("mongoose");

const careerApplicationSchema = new mongoose.Schema(
  {
    careerId: { type: mongoose.Schema.Types.ObjectId, ref: "career" },
    fullName: String,
    email: String,
    phone: String,
    message: String,
    resume: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("career_application", careerApplicationSchema);
