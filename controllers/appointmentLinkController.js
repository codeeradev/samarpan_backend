const AppointmentLink = require("../models/appointmentLink");
const User = require("../models/user");

// Get All Appointment Links (Admin)
exports.getAppointmentLinks = async (req, res) => {
  try {
    const { doctorId, isActive } = req.query;

    const query = {};
    if (doctorId) query.doctorId = doctorId;
    if (isActive !== undefined) query.isActive = isActive === "true";

    const appointmentLinks = await AppointmentLink.find(query)
      .populate("doctorId", "name specialization")
      .sort({ createdAt: -1 });

    const links = appointmentLinks.map((link) => {
      const linkObj = link.toObject();
      if (link.doctorId && !linkObj.doctorName) {
        linkObj.doctorName = link.doctorId.name;
      }
      return linkObj;
    });

    res.status(200).json({
      success: true,
      appointmentLinks: links,
    });
  } catch (error) {
    console.error("Error fetching appointment links:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointment links",
      error: error.message,
    });
  }
};

// Add Appointment Link (Admin)
exports.addAppointmentLink = async (req, res) => {
  try {
    const { title, subtitle, link, doctorId, isActive } = req.body;

    if (!title || !link || !doctorId) {
      return res.status(400).json({
        success: false,
        message: "Title, link, and doctorId are required",
      });
    }

    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(link)) {
      return res.status(400).json({
        success: false,
        message: "Link must be a valid URL starting with http:// or https://",
      });
    }

    const doctor = await User.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const appointmentLink = new AppointmentLink({
      title: title.trim(),
      subtitle: subtitle?.trim() || undefined,
      link: link.trim(),
      doctorId,
      doctorName: doctor.name,
      isActive: isActive !== undefined ? isActive : true,
    });

    await appointmentLink.save();
    await appointmentLink.populate("doctorId", "name specialization");

    res.status(201).json({
      success: true,
      message: "Appointment link created successfully",
      appointmentLink,
    });
  } catch (error) {
    console.error("Error adding appointment link:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create appointment link",
      error: error.message,
    });
  }
};

// Update Appointment Link (Admin)
exports.updateAppointmentLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, link, doctorId, isActive } = req.body;

    const appointmentLink = await AppointmentLink.findById(id);
    if (!appointmentLink) {
      return res.status(404).json({
        success: false,
        message: "Appointment link not found",
      });
    }

    if (!title || !link || !doctorId) {
      return res.status(400).json({
        success: false,
        message: "Title, link, and doctorId are required",
      });
    }

    const urlPattern = /^https?:\/\/.+/;
    if (!urlPattern.test(link)) {
      return res.status(400).json({
        success: false,
        message: "Link must be a valid URL starting with http:// or https://",
      });
    }

    if (doctorId !== appointmentLink.doctorId.toString()) {
      const doctor = await User.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor not found",
        });
      }
      appointmentLink.doctorName = doctor.name;
    }

    appointmentLink.title = title.trim();
    appointmentLink.subtitle = subtitle?.trim() || undefined;
    appointmentLink.link = link.trim();
    appointmentLink.doctorId = doctorId;
    appointmentLink.isActive = isActive !== undefined ? isActive : appointmentLink.isActive;

    await appointmentLink.save();
    await appointmentLink.populate("doctorId", "name specialization");

    res.status(200).json({
      success: true,
      message: "Appointment link updated successfully",
      appointmentLink,
    });
  } catch (error) {
    console.error("Error updating appointment link:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update appointment link",
      error: error.message,
    });
  }
};

// Delete Appointment Link (Admin)
exports.deleteAppointmentLink = async (req, res) => {
  try {
    const { id } = req.params;

    const appointmentLink = await AppointmentLink.findByIdAndDelete(id);
    if (!appointmentLink) {
      return res.status(404).json({
        success: false,
        message: "Appointment link not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Appointment link deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting appointment link:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete appointment link",
      error: error.message,
    });
  }
};

// Get Appointment Links for Website (Public)
exports.getAppointmentLinksForWebsite = async (req, res) => {
  try {
    const { doctorId } = req.query;

    const query = { isActive: true };
    if (doctorId) query.doctorId = doctorId;

    const appointmentLinks = await AppointmentLink.find(query)
      .populate("doctorId", "name specialization image")
      .sort({ createdAt: -1 });

    const links = appointmentLinks.map((link) => ({
      _id: link._id,
      title: link.title,
      subtitle: link.subtitle,
      link: link.link,
      doctorId: link.doctorId._id,
      doctorName: link.doctorName || link.doctorId.name,
      doctorSpecialization: link.doctorId.specialization,
    }));

    res.status(200).json({
      success: true,
      appointmentLinks: links,
    });
  } catch (error) {
    console.error("Error fetching appointment links for website:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointment links",
      error: error.message,
    });
  }
};
