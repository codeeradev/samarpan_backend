const Appointment = require("../models/appointment");
const {
  createAppointmentSlot,
  deleteAppointmentSlot,
  getAvailableSlotsForBooking,
  getAppointmentSlots,
  updateAppointmentSlot,
  verifyRazorpaySignature,
} = require("../services/appointmentBookingService");

exports.getAvailableAppointmentSlots = async (req, res) => {
  try {
    const slots = await getAvailableSlotsForBooking({
      doctorId: req.query.doctorId || req.query.doctor_id,
      date: req.query.date || req.query.appointment_date,
    });

    return res.status(200).json({
      message: "Appointment slots retrieved successfully",
      slots,
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message });
  }
};

exports.getAppointmentSlots = async (req, res) => {
  try {
    const slots = await getAppointmentSlots(req.query);
    return res.status(200).json({
      message: "Appointment slots retrieved successfully",
      slots,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.createAppointmentSlot = async (req, res) => {
  try {
    const slot = await createAppointmentSlot(req.body || {}, req.user?._id);
    return res.status(201).json({
      message: "Appointment slot created successfully",
      slot,
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message });
  }
};

exports.updateAppointmentSlot = async (req, res) => {
  try {
    const slot = await updateAppointmentSlot(
      req.params.id,
      req.body || {},
      req.user?._id,
    );

    if (!slot) {
      return res.status(404).json({ message: "Appointment slot not found" });
    }

    return res.status(200).json({
      message: "Appointment slot updated successfully",
      slot,
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message });
  }
};

exports.deleteAppointmentSlot = async (req, res) => {
  try {
    const slot = await deleteAppointmentSlot(req.params.id);

    if (!slot) {
      return res.status(404).json({ message: "Appointment slot not found" });
    }

    return res.status(200).json({
      message: "Appointment slot deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.verifyAppointmentPayment = async (req, res) => {
  try {
    const {
      appointmentId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (
      !appointment.payment?.razorpayOrderId ||
      appointment.payment.razorpayOrderId !== razorpay_order_id
    ) {
      return res.status(400).json({ message: "Invalid payment order" });
    }

    const verified = await verifyRazorpaySignature({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    if (!verified) {
      appointment.payment.status = "failed";
      await appointment.save();
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const shouldConfirmAppointment = appointment.status === "confirmed";

    appointment.status = shouldConfirmAppointment ? "confirmed" : "pending";
    appointment.approvedAt = shouldConfirmAppointment
      ? appointment.approvedAt || new Date()
      : null;
    appointment.payment.status = "paid";
    appointment.payment.razorpayPaymentId = razorpay_payment_id;
    appointment.payment.verifiedAt = new Date();
    await appointment.save();

    return res.status(200).json({
      message: shouldConfirmAppointment
        ? "Payment received and appointment confirmed"
        : "Payment received. Appointment is waiting for approval",
      appointment,
      autoConfirmed: shouldConfirmAppointment,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
