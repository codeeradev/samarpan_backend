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
    slotType: {
      type: String,
      enum: ["daily", "weekly"],
      required: true,
    },
    date: {
      type: Date,
      default: null,
    },
    weekday: {
      type: Number,
      min: 0,
      max: 6,
      default: null,
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
    maximumPatients: {
      type: Number,
      min: 1,
      required: true,
    },
    timeSlots: {
      type: [
        {
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
          maximumPatients: {
            type: Number,
            min: 1,
            required: true,
          },
        },
      ],
      default: [],
    },
    weeklyDays: {
      type: [
        {
          date: {
            type: Date,
            required: true,
          },
          weekday: {
            type: Number,
            min: 0,
            max: 6,
            required: true,
          },
          timeSlots: {
            type: [
              {
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
                maximumPatients: {
                  type: Number,
                  min: 1,
                  required: true,
                },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    appointmentPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    slotDurationMinutes: {
      type: Number,
      min: 1,
      default: 30,
    },
    bookingCloseMinutesBeforeEnd: {
      type: Number,
      min: 0,
      default: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
  },
  { timestamps: true },
);

appointmentSlotSchema.index({ doctorId: 1, slotType: 1, date: 1 });
appointmentSlotSchema.index({ doctorId: 1, slotType: 1, weekday: 1 });
appointmentSlotSchema.index({ doctorId: 1, slotType: 1, "weeklyDays.date": 1 });

module.exports = mongoose.model("AppointmentSlot", appointmentSlotSchema);
