const Service = require("../models/service");
const User = require("../models/user");
const Review = require("../models/review");
const Short = require("../models/short");
const Blog = require("../models/blog");
const Appointment = require("../models/appointment");
const ROLES = require("../constants/roles");
const mongoose = require("mongoose");

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const parseAppointmentDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const resolveServiceDetails = async (serviceInput) => {
  const serviceValue = normalizeText(serviceInput);

  if (!serviceValue) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(serviceValue)) {
    const service = await Service.findOne({
      $or: [{ title: serviceValue }, { slug: serviceValue.toLowerCase() }],
      isActive: { $ne: false },
    });

    if (service) {
      return {
        serviceId: service._id,
        serviceName: service.title,
      };
    }

    return {
      serviceId: null,
      serviceName: serviceValue,
    };
  }

  const service = await Service.findById(serviceValue);

  if (!service) {
    return { notFound: true };
  }

  return {
    serviceId: service._id,
    serviceName: service.title,
  };
};

const resolveDoctorDetails = async (doctorInput) => {
  const doctorValue = normalizeText(doctorInput);

  if (!doctorValue) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(doctorValue)) {
    const doctor = await User.findOne({
      name: doctorValue,
      roleId: ROLES.DOCTOR,
      status: { $ne: false },
      isActive: { $ne: false },
    });

    if (doctor) {
      return {
        doctorId: doctor._id,
        doctorName: doctor.name,
      };
    }

    return {
      doctorId: null,
      doctorName: doctorValue,
    };
  }

  const doctor = await User.findOne({
    _id: doctorValue,
    roleId: ROLES.DOCTOR,
    status: { $ne: false },
    isActive: { $ne: false },
  });

  if (!doctor) {
    return { notFound: true };
  }

  return {
    doctorId: doctor._id,
    doctorName: doctor.name,
  };
};

exports.submitAppointment = async (req, res) => {
  try {
    const fullName = normalizeText(req.body.fullName || req.body.name);
    const email = normalizeText(req.body.email).toLowerCase();
    const phoneNumber = normalizeText(req.body.phoneNumber || req.body.phone);
    const serviceInput = req.body.serviceId || req.body.service;
    const doctorInput = req.body.doctorId || req.body.doctor;
    const preferredDate = parseAppointmentDate(
      req.body.preferredDate ||
        req.body.appointmentDate ||
        req.body.scheduledAt ||
        req.body.date,
    );
    const reason = normalizeText(req.body.reason || req.body.message);
    const notes = normalizeText(req.body.notes);

    if (
      !fullName ||
      !phoneNumber ||
      !serviceInput ||
      !doctorInput ||
      !preferredDate
    ) {
      return res.status(400).json({
        message:
          "Full name, phone number, service, doctor and preferred date are required",
      });
    }

    const [serviceDetails, doctorDetails] = await Promise.all([
      resolveServiceDetails(serviceInput),
      resolveDoctorDetails(doctorInput),
    ]);

    if (serviceDetails?.notFound) {
      return res.status(404).json({ message: "Selected service not found" });
    }

    if (doctorDetails?.notFound) {
      return res.status(404).json({ message: "Selected doctor not found" });
    }

    const appointment = await Appointment.create({
      fullName,
      email,
      phoneNumber,
      serviceId: serviceDetails?.serviceId || null,
      serviceName: serviceDetails?.serviceName || normalizeText(serviceInput),
      doctorId: doctorDetails?.doctorId || null,
      doctorName: doctorDetails?.doctorName || normalizeText(doctorInput),
      preferredDate,
      appointmentDate: preferredDate,
      reason,
      notes,
      status: "pending",
    });

    return res.status(201).json({
      message: "Appointment request submitted successfully",
      appointment,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getServices = async (req, res) => {
  try {
    const services = await Service.find({ isActive: true });
    return res
      .status(200)
      .json({ message: "Services retrieved successfully", services });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getDoctors = async (req, res) => {
  try {
    const doctors = await User.find({
      roleId: ROLES.DOCTOR,
      status: { $ne: false },
      isActive: { $ne: false },
      specialization: { $exists: true, $ne: "" },
    }).select(
      "name image specialization description experience qualification expertise isActive createdAt updatedAt",
    );
    return res
      .status(200)
      .json({ message: "Doctors retrieved successfully", doctors });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ isActive: true }).sort({
      sortOrder: 1,
      createdAt: -1,
    });
    return res
      .status(200)
      .json({ message: "Reviews retrieved successfully", reviews });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getShorts = async (req, res) => {
  try {
    const shorts = await Short.find({ isActive: true }).sort({
      sortOrder: 1,
      createdAt: -1,
    });
    return res
      .status(200)
      .json({ message: "Shorts retrieved successfully", shorts });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getBlogs = async (req, res) => {
  try {
    const { slug } = req.query;

    const filter = { isActive: true };
    if (slug) {
      filter.slug = slug;
    }
    const blogs = await Blog.find(filter).sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ message: "Blogs retrieved successfully", blogs });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
