const AppointmentSlot = require("../models/appointmentSlot");
const User = require("../models/user");
const mongoose = require("mongoose");

// Simple CRUD - No complex service needed

exports.getAppointmentSlots = async (req, res) => {
  try {
    const filter = { isActive: true };
    
    if (req.query.doctorId && mongoose.Types.ObjectId.isValid(req.query.doctorId)) {
      filter.doctorId = req.query.doctorId;
    }
    
    if (req.query.departmentName) {
      filter.departmentName = req.query.departmentName;
    }

    const slots = await AppointmentSlot.find(filter).sort({ startTime: 1 });
    
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
    const { doctorId, departmentName, weekdays, startTime, endTime, isActive } = req.body;

    // Validate required fields
    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID is required" });
    }
    
    if (!departmentName || !departmentName.trim()) {
      return res.status(400).json({ message: "Department name is required" });
    }
    
    if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
      return res.status(400).json({ message: "At least one weekday is required" });
    }
    
    // Validate each weekday is between 0-6
    if (!weekdays.every(day => typeof day === 'number' && day >= 0 && day <= 6)) {
      return res.status(400).json({ message: "All weekdays must be valid numbers (0-6)" });
    }
    
    if (!startTime || !endTime) {
      return res.status(400).json({ message: "Start time and end time are required" });
    }
    
    if (startTime >= endTime) {
      return res.status(400).json({ message: "End time must be after start time" });
    }

    // Verify doctor exists
    const doctor = await User.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Create slot with weekdays array
    const slot = await AppointmentSlot.create({
      doctorId,
      doctorName: doctor.name,
      departmentName: departmentName.trim(),
      weekdays: weekdays.map(d => Number(d)),
      startTime,
      endTime,
      isActive: isActive !== undefined ? isActive : true,
    });

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
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid slot ID" });
    }

    const slot = await AppointmentSlot.findById(id);
    if (!slot) {
      return res.status(404).json({ message: "Appointment slot not found" });
    }

    // Handle status toggle (partial update)
    if (Object.keys(req.body).length === 1 && 'isActive' in req.body) {
      slot.isActive = req.body.isActive;
      await slot.save();
      
      return res.status(200).json({
        message: "Appointment slot status updated successfully",
        slot,
      });
    }

    // Full update
    const { doctorId, departmentName, weekdays, startTime, endTime, isActive } = req.body;

    if (doctorId) {
      const doctor = await User.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }
      slot.doctorId = doctorId;
      slot.doctorName = doctor.name;
    }

    if (departmentName) slot.departmentName = departmentName.trim();
    if (weekdays && Array.isArray(weekdays)) {
      if (!weekdays.every(day => typeof day === 'number' && day >= 0 && day <= 6)) {
        return res.status(400).json({ message: "All weekdays must be valid numbers (0-6)" });
      }
      slot.weekdays = weekdays.map(d => Number(d));
    }
    if (startTime) slot.startTime = startTime;
    if (endTime) slot.endTime = endTime;
    if (isActive !== undefined) slot.isActive = isActive;

    // Validate times if both present
    if (slot.startTime >= slot.endTime) {
      return res.status(400).json({ message: "End time must be after start time" });
    }

    await slot.save();

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
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid slot ID" });
    }

    const slot = await AppointmentSlot.findByIdAndDelete(id);

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

// For website - public endpoint (no auth required)
exports.getAvailableAppointmentSlots = async (req, res) => {
  try {
    const filter = { isActive: true };
    
    if (req.query.doctorId && mongoose.Types.ObjectId.isValid(req.query.doctorId)) {
      filter.doctorId = req.query.doctorId;
    }
    
    if (req.query.departmentName) {
      filter.departmentName = req.query.departmentName;
    }

    const slots = await AppointmentSlot.find(filter).sort({ startTime: 1 });
    
    return res.status(200).json({
      message: "Available slots",
      slots,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      message: "Server error",
      slots: []
    });
  }
};

exports.verifyAppointmentPayment = async (req, res) => {
  return res.status(200).json({
    message: "Payment verification",
  });
};
