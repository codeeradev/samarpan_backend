const mongoose = require("mongoose");

const appointmentSlotSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    doctorName: {
      type: String,
      trim: true,
      required: true,
    },
    departmentName: {
      type: String,
      trim: true,
      required: true,
    },
    weekdays: {
      type: [Number],
      required: true,
      validate: {
        validator: function(arr) {
          return arr.length > 0 && arr.every(day => day >= 0 && day <= 6);
        },
        message: 'Weekdays must be an array of numbers between 0-6'
      }
    },
    startTime: {
      type: String,
      trim: true,
      required: true,
    },
    endTime: {
      type: String,
      trim: true,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Indexes
appointmentSlotSchema.index({ doctorId: 1, departmentName: 1 });
appointmentSlotSchema.index({ departmentName: 1 });

module.exports = mongoose.model("AppointmentSlot", appointmentSlotSchema);
