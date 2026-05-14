const Service = require("../models/service");
const ServiceFeature = require("../models/serviceFeatures");
const User = require("../models/user");
const Short = require("../models/short");
const Blog = require("../models/blog");
const Appointment = require("../models/appointment");
const Content = require("../models/content");
const Career = require("../models/career");
const Page = require("../models/page");
const Setting = require("../models/setting");
const Honor = require("../models/honor");
const ROLES = require("../constants/roles");
const mongoose = require("mongoose");
const Gallery = require("../models/gallery");
const Procedure = require("../models/cosmeticProcedure");
const { fetchGoogleReviews } = require("../utils/googleReviews");
const Theme = require("../models/theme");
const CareerEnquiry = require("../models/jobApplication");
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
    const fullName = normalizeText(req.body.full_name || req.body.name);
    const email = normalizeText(req.body.email).toLowerCase();
    const phoneNumber = normalizeText(req.body.phone_number || req.body.phone);
    const serviceInput = req.body.service_id || req.body.service;
    const doctorInput = req.body.doctor_id || req.body.doctor;
    const preferredDate = parseAppointmentDate(
      req.body.preferred_date ||
        req.body.appointment_date ||
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
    const { slug } = req.query;

    const filter = { isActive: true };
    if (slug) {
      filter.slug = slug;
    }

    // 👉 SINGLE SERVICE
    if (slug) {
      const service = await Service.findOne(filter).select("-__v -isActive");

      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }

      return res
        .status(200)
        .json({ message: "Service retrieved successfully", service });
    }

    const services = await Service.find(filter)
      .select("-__v -isActive -content -faqs -seo")
      .sort({ createdAt: -1 });
    return res
      .status(200)
      .json({ message: "Services retrieved successfully", services });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getServicesFeatures = async (req, res) => {
  try {
    const { serviceSlug, featureSlug } = req.query;

    // ─────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────

    if (!serviceSlug) {
      return res.status(400).json({
        message: "serviceSlug is required",
      });
    }

    // ─────────────────────────────────────────────
    // FIND SERVICE
    // ─────────────────────────────────────────────

    const service = await Service.findOne({
      slug: serviceSlug,
      isActive: true,
    }).select("_id title slug");

    if (!service) {
      return res.status(404).json({
        message: "Service not found",
      });
    }

    if (featureSlug) {
      const feature = await ServiceFeature.findOne({
        slug: featureSlug,
        serviceId: service._id,
      })
        .populate("serviceId", "title slug")
        .select("-__v -createdAt -updatedAt");

      if (!feature) {
        return res.status(404).json({
          message: "Service feature not found",
        });
      }

      return res.status(200).json({
        message: "Service feature retrieved successfully",
        feature,
      });
    }

    const features = await ServiceFeature.find({
      serviceId: service._id,
    })
      .populate("serviceId", "title slug")
      .select("title slug serviceId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Service features retrieved successfully",
      features,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
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
    const reviewsPayload = await fetchGoogleReviews();
    return res.status(200).json({
      message: "Google reviews retrieved successfully",
      ...reviewsPayload,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getShorts = async (req, res) => {
  try {
    const shorts = await Short.find({ isActive: true })
      .select("-__v -isActive")
      .sort({
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
    const { slug, type } = req.query;

    const filter = { status: "published" };
    let limit = 0;
    if (slug) {
      filter.slug = slug;
    }

    if (type === "home") {
      limit = 6;
    }

    // 👉 SINGLE BLOG
    if (slug) {
      const blog = await Blog.findOne(filter)
        .populate("serviceId", "title")
        .select("-__v");

      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }

      return res.status(200).json({
        message: "Blog retrieved successfully",
        blog,
      });
    }

    // 👉 ALL BLOGS
    const blogs = await Blog.find(filter)
      .populate("serviceId", "title")
      .limit(limit)
      .select("-__v")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Blogs retrieved successfully",
      blogs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getGallery = async (req, res) => {
  try {
    const { type } = req.query;

    if (type === "home") {
      limit = 12;
    } else {
      limit = 0;
    }

    const galleryItems = await Gallery.find()
      .select("-__v")
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Gallery items retrieved successfully",
      gallery: galleryItems,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getCareers = async (req, res) => {
  try {
    const slug = normalizeText(req.query.slug).toLowerCase();

    const filter = {
      isActive: { $ne: false },
      status: { $ne: "draft" },
    };

    if (slug) {
      filter.slug = slug;
    }

    if (slug) {
      const career = await Career.findOne(filter).select("-__v");

      if (!career) {
        return res.status(404).json({ message: "Career not found" });
      }

      return res.status(200).json({
        message: "Career retrieved successfully",
        career,
      });
    }

    const careers = await Career.find(filter)
      .select("-__v")
      .sort({ sortOrder: 1, updatedAt: -1, createdAt: -1 });

    return res.status(200).json({
      message: "Careers retrieved successfully",
      careers,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getHonors = async (req, res) => {
  try {
    const honors = await Honor.find({ isActive: true })
      .select("title image")
      .sort({ sortOrder: 1, updatedAt: -1, createdAt: -1 });

    return res.status(200).json({
      message: "Honors retrieved successfully",
      honors,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getContentByModelKey = async (req, res) => {
  try {
    const modelKey = normalizeText(req.params.modelKey).toLowerCase();

    if (!modelKey) {
      return res.status(400).json({ message: "modelKey is required" });
    }

    const content = await Content.findOne({
      modelKey,
      isActive: { $ne: false },
    });

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    return res.status(200).json({
      message: "Content retrieved successfully",
      content,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getPageBySlug = async (req, res) => {
  try {
    const slug = normalizeText(req.params.slug).toLowerCase();

    if (!slug) {
      return res.status(400).json({ message: "Slug is required" });
    }

    const page = await Page.findOne({
      slug,
      isActive: { $ne: false },
      status: { $ne: "draft" },
    });

    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    return res.status(200).json({
      message: "Page retrieved successfully",
      page,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await Setting.findOne()
      .select(
        "inquiry_email inquiry_mobile_number address working_hours social_links whatsapp_number website_logo",
      )
      .lean();
    return res
      .status(200)
      .json({ message: "Settings retrieved successfully", settings });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getTheme = async (req, res) => {
  try {
    const themes = await Theme.findOne({ name: "website" });

    return res.status(200).json({
      message: "Themes retrieved successfully",
      themes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getActiveProcedure = async (req, res) => {
  try {
    const slug = normalizeText(req.query.slug).toLowerCase();

    const { type } = req.query;

    if (type === "home") {
      limit = 6;
    } else {
      limit = 0;
    }

    if (slug) {
      const Procedures = await Procedure.findOne({
        isActive: { $ne: false },
      }).sort({
        createdAt: -1,
      });

      return res.status(200).json({
        message: "Procedures retrieved successfully",
        Procedures,
      });
    }

    const Procedures = await Procedure.find({ isActive: { $ne: false } })
      .limit(limit)
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      message: "Procedures retrieved successfully",
      Procedures,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.submitCarrerForm = async (req, res) => {
  try {
    const { careerId, fullName, email, phone, message } = req.body;

    const resume = req.files?.resume?.[0]?.filename
      ? `/assets/uploads/${req.files.resume[0].filename}`
      : null;

    await CareerEnquiry.create({
      careerId,
      fullName,
      email,
      phone,
      message,
      resume,
    });

    return res.status(200).json({ message: "Enquiry Submited successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
