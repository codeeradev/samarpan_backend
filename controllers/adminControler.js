const User = require("../models/user");
const Service = require("../models/service");
const Review = require("../models/review");
const Short = require("../models/short");
const Blog = require("../models/blog");
const Gallery = require("../models/gallery");
const Content = require("../models/content");
const Career = require("../models/career");
const Page = require("../models/page");
const Setting = require("../models/setting");
const Appointment = require("../models/appointment");
const Specialization = require("../models/specialization");
const Honor = require("../models/honor");
const jwt = require("jsonwebtoken");
const ROLES = require("../constants/roles");
const permisson = require("../constants/permisson");
const { sendMail } = require("../config/nodemailer");
const { fetchGoogleReviews } = require("../utils/googleReviews");

const ROLE_MAP = {
  1: "SUPER_ADMIN",
  2: "DOCTOR",
  3: "NURSE",
  4: "RECEPTIONIST",
  5: "USER",
  6: "GUEST",
};

const ADMIN_STAFF_ROLE_IDS = [
  ROLES.SUPER_ADMIN,
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.RECEPTIONIST,
];

const ADDABLE_STAFF_ROLE_IDS = [ROLES.NURSE, ROLES.RECEPTIONIST];

const ALLOWED_APPOINTMENT_STATUSES = new Set([
  "pending",
  "confirmed",
  "rescheduled",
  "completed",
  "rejected",
  "cancelled",
]);

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) : undefined;
};

const parseBoolean = (value) => {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }

  return undefined;
};

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const normalizePageStatus = (value) => {
  const status = normalizeText(value).toLowerCase();

  if (status === "draft" || status === "published") {
    return status;
  }

  return undefined;
};

const normalizeCareerStatus = (value) => {
  const status = normalizeText(value).toLowerCase();

  if (status === "draft" || status === "open" || status === "closed") {
    return status;
  }

  return undefined;
};

const serializeUser = (value) => {
  if (!value) {
    return value;
  }

  const user = typeof value.toObject === "function" ? value.toObject() : value;

  if (user.password) {
    delete user.password;
  }

  return {
    ...user,
    role: ROLE_MAP[user.roleId] || "UNKNOWN",
  };
};

const serializeStaff = serializeUser;

const mergeUploadedFilesIntoContent = (content, files) => {
  const mergedContent = { ...(content || {}) };

  for (const file of files || []) {
    if (!file?.fieldname || !file?.filename) {
      continue;
    }

    mergedContent[file.fieldname] = `/assets/uploads/${file.filename}`;
  }

  return mergedContent;
};

const dischargePatientFromAppointment = async (
  appointment,
  dischargedAt = new Date(),
) => {
  if (!appointment?._id) {
    return null;
  }

  return Appointment.findByIdAndUpdate(
    appointment._id,
    {
      $set: {
        status: "completed",
        completedAt: dischargedAt,
        dischargedAt,
      },
    },
    { new: true },
  );
};

const parseAppointmentDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const parseJson = (value) => {
  if (!value) return undefined;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  const parsedValue = parseJson(value);
  if (Array.isArray(parsedValue)) {
    return parsedValue.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return [];
};

const normalizeSortOrder = (value) => {
  const parsedValue = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
};

const formatAppointmentDate = (value) => {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.MAIL_TIMEZONE || "Asia/Kolkata",
  }).format(new Date(value));
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const hasAppointmentPermission = (user, permissionKey) => {
  if (!user?.permissions || !permissionKey) {
    return false;
  }

  if (typeof user.permissions.get === "function") {
    return Boolean(user.permissions.get(permissionKey));
  }

  return Boolean(user.permissions[permissionKey]);
};

const canViewAppointments = (user) =>
  Boolean(
    user &&
    (user.roleId === ROLES.SUPER_ADMIN ||
      user.roleId === ROLES.DOCTOR ||
      hasAppointmentPermission(user, permisson.VIEW_APPOINTMENTS) ||
      hasAppointmentPermission(user, permisson.MANAGE_APPOINTMENTS)),
  );

const canManageAppointments = (user, appointment) => {
  if (!user || !appointment) {
    return false;
  }

  if (
    user.roleId === ROLES.SUPER_ADMIN ||
    hasAppointmentPermission(user, permisson.MANAGE_APPOINTMENTS)
  ) {
    return true;
  }

  if (user.roleId === ROLES.DOCTOR) {
    return (
      String(appointment.doctorId || "") === String(user._id) ||
      (!appointment.doctorId &&
        normalizeText(appointment.doctorName).toLowerCase() ===
          normalizeText(user.name).toLowerCase())
    );
  }

  return false;
};

const buildAppointmentScopeFilter = (user) => {
  if (user?.roleId === ROLES.DOCTOR) {
    return {
      $or: [{ doctorId: user._id }, { doctorId: null, doctorName: user.name }],
    };
  }

  return {};
};

const buildDayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.MAIL_TIMEZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const buildMonthKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.MAIL_TIMEZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(date);

const getStartOfWeek = (base = new Date()) => {
  const d = new Date(base);
  const day = d.getDay(); // 0=Sun
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
};

const getEndOfDay = (base = new Date()) => {
  const d = new Date(base);
  d.setHours(23, 59, 59, 999);
  return d;
};

const buildRescheduleMail = (appointment) => {
  const appointmentDate = formatAppointmentDate(appointment.appointmentDate);
  const doctorName = appointment.doctorName || "Assigned Doctor";
  const serviceName = appointment.serviceName || "Consultation";
  const rescheduleReason = appointment.rescheduleReason
    ? escapeHtml(appointment.rescheduleReason)
    : "Please contact the hospital if you need any clarification.";

  return {
    subject: "Appointment Rescheduled - Samarpan Hospital",
    text: [
      `Hello ${appointment.fullName},`,
      "",
      "Your appointment has been rescheduled.",
      `Doctor: ${doctorName}`,
      `Service: ${serviceName}`,
      `New date and time: ${appointmentDate}`,
      `Reason: ${appointment.rescheduleReason || "Not provided"}`,
      "",
      "Thank you,",
      "Samarpan Hospital",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">Appointment Rescheduled</h2>
        <p>Hello ${escapeHtml(appointment.fullName)},</p>
        <p>Your appointment has been rescheduled. Please find the updated details below:</p>
        <p><strong>Doctor:</strong> ${escapeHtml(doctorName)}</p>
        <p><strong>Service:</strong> ${escapeHtml(serviceName)}</p>
        <p><strong>New date and time:</strong> ${escapeHtml(appointmentDate)}</p>
        <p><strong>Reason:</strong> ${rescheduleReason}</p>
        <p>If you have any questions, please contact Samarpan Hospital.</p>
        <p>Thank you,<br />Samarpan Hospital</p>
      </div>
    `,
  };
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const admin = await User.findOne({ email, roleId: { $nin: [5, 6] } });
    if (!admin) {
      return res.status(404).json({ message: "User not found" });
    }

    if (password !== admin.password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { _id: admin._id, roleId: admin.roleId },
      process.env.JWT_SECRET,
    );

    const role = ROLE_MAP[admin.roleId] || "UNKNOWN";

    return res
      .status(200)
      .json({ message: "Admin logged in successfully", token, admin, role });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addService = async (req, res) => {
  try {
    const { title, slug, shortDescription, features, content, faqs, seo } =
      req.body;

    const image = req.files?.image?.[0]?.filename
      ? `/assets/uploads/${req.files.image[0].filename}`
      : null;

    const icon = req.files?.icon?.[0]?.filename
      ? `/assets/uploads/${req.files.icon[0].filename}`
      : null;

    const service = await Service.create({
      title,
      slug,
      shortDescription,
      image,
      icon,
      features: features ? JSON.parse(features) : [],
      content,
      faqs: faqs ? JSON.parse(faqs) : [],
      seo: seo ? JSON.parse(seo) : {},
    });

    return res.status(201).json({
      message: "Service added successfully",
      service,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.find();
    return res
      .status(200)
      .json({ message: "Services retrieved successfully", services });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, slug, shortDescription, features, content, faqs, seo } =
      req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (slug) updateData.slug = slug;
    if (shortDescription) updateData.shortDescription = shortDescription;
    if (req.files?.image)
      updateData.image = `/assets/uploads/${req.files.image[0].filename}`;

    if (req.files?.icon)
      updateData.icon = `/assets/uploads/${req.files.icon[0].filename}`;
    if (features) updateData.features = JSON.parse(features);
    if (faqs) updateData.faqs = JSON.parse(faqs);
    if (seo) updateData.seo = JSON.parse(seo);
    if (content) updateData.content = content;

    const service = await Service.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    return res
      .status(200)
      .json({ message: "Service updated successfully", service });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findByIdAndDelete(id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    return res
      .status(200)
      .json({ message: "Service deleted successfully", service });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addDoctor = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      specialization,
      description,
      experience,
      qualification,
      expertise,
      permissions,
      status,
      isActive,
    } = req.body;

    const image = req.files?.image?.[0]?.filename
      ? `/assets/uploads/${req.files.image[0].filename}`
      : null;

    if (
      !name ||
      !email ||
      !password ||
      !specialization ||
      !description ||
      !experience ||
      !qualification ||
      !image
    ) {
      return res.status(400).json({
        message: "Name, email, password, image and doctor details are required",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const doctor = await User.create({
      name,
      email,
      password,
      phone,
      roleId: ROLES.DOCTOR,
      permissions: permissions ? JSON.parse(permissions) : {},
      status: status !== undefined ? status : true,
      specialization,
      description,
      image,
      experience,
      qualification,
      expertise: expertise ? JSON.parse(expertise) : [],
      isActive: isActive !== undefined ? isActive : true,
    });

    const doctorData = doctor.toObject();
    delete doctorData.password;

    return res.status(201).json({
      message: "Doctor added successfully",
      doctor: doctorData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.getAllDoctors = async (req, res) => {
  try {
    const doctors = await User.find({ roleId: ROLES.DOCTOR }).select(
      "-password",
    );
    return res
      .status(200)
      .json({ message: "Doctors retrieved successfully", doctors });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      password,
      phone,
      specialization,
      description,
      experience,
      qualification,
      expertise,
      permissions,
      status,
      isActive,
    } = req.body;

    const updateData = {};
    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: id },
      });

      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.password = password;
    if (phone) updateData.phone = phone;
    if (specialization) updateData.specialization = specialization;
    if (description) updateData.description = description;
    if (experience) updateData.experience = experience;
    if (qualification) updateData.qualification = qualification;
    if (req.files?.image)
      updateData.image = `/assets/uploads/${req.files.image[0].filename}`;
    if (expertise) updateData.expertise = JSON.parse(expertise);
    if (permissions) updateData.permissions = JSON.parse(permissions);
    if (status !== undefined) updateData.status = status;
    if (isActive !== undefined) updateData.isActive = isActive;

    const doctor = await User.findOneAndUpdate(
      { _id: id, roleId: ROLES.DOCTOR },
      updateData,
      {
        new: true,
      },
    ).select("-password");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    return res
      .status(200)
      .json({ message: "Doctor updated successfully", doctor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await User.findOneAndDelete({
      _id: id,
      roleId: ROLES.DOCTOR,
    });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    return res.status(200).json({ message: "Doctor deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllPatients = async (req, res) => {
  try {
    const appointments = await Appointment.find({
      status: { $in: ["confirmed", "rescheduled", "completed"] },
    })
      .sort({ createdAt: -1, updatedAt: -1 })
      .select(
        "_id fullName phoneNumber email appointmentDate age gender address bloodGroup medicalHistory status dischargedAt createdAt updatedAt",
      );

    const patients = appointments.map((appointment) => ({
      _id: appointment._id,
      name: appointment.fullName,
      phone: appointment.phoneNumber,
      email: appointment.email,
      age: appointment.age ?? null,
      gender: appointment.gender ?? null,
      address: appointment.address ?? "",
      bloodGroup: appointment.bloodGroup ?? "",
      medicalHistory: appointment.medicalHistory ?? "",
      status: appointment.status !== "completed",
      isActive: appointment.status !== "completed",
      dischargedAt: appointment.dischargedAt || appointment.completedAt || null,
      appointmentDate: appointment.appointmentDate,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    }));

    return res.status(200).json({
      message: "Patients retrieved successfully",
      patients,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const name = normalizeText(req.body.name);
    const phone = normalizePhone(req.body.phone);
    const age = Number(req.body.age);
    const gender = normalizeText(req.body.gender).toLowerCase();
    const address = normalizeText(req.body.address);
    const bloodGroup = normalizeText(req.body.bloodGroup);
    const medicalHistory = normalizeText(req.body.medicalHistory);

    if (!name || !phone || !address || !bloodGroup || !gender) {
      return res.status(400).json({
        message: "Name, phone, address, blood group and gender are required",
      });
    }

    if (!["male", "female", "other"].includes(gender)) {
      return res.status(400).json({ message: "Invalid gender" });
    }

    if (Number.isNaN(age) || age < 1 || age > 150) {
      return res.status(400).json({
        message: "Age must be between 1 and 150",
      });
    }

    const patient = await Appointment.findByIdAndUpdate(
      id,
      {
        fullName: name,
        phoneNumber: String(phone),
        age,
        gender,
        address,
        bloodGroup,
        medicalHistory,
      },
      {
        new: true,
      },
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    return res.status(200).json({
      message: "Patient updated successfully",
      patient: {
        _id: patient._id,
        name: patient.fullName,
        phone: patient.phoneNumber,
        email: patient.email,
        age: patient.age ?? null,
        gender: patient.gender ?? null,
        address: patient.address ?? "",
        bloodGroup: patient.bloodGroup ?? "",
        medicalHistory: patient.medicalHistory ?? "",
        status: patient.status !== "completed",
        isActive: patient.status !== "completed",
        dischargedAt: patient.dischargedAt || patient.completedAt || null,
        appointmentDate: patient.appointmentDate,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.dischargePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const dischargedAt = new Date();

    const patient = await Appointment.findByIdAndUpdate(
      id,
      {
        status: "completed",
        completedAt: dischargedAt,
        dischargedAt,
      },
      {
        new: true,
      },
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const appointment = patient;

    return res.status(200).json({
      message: "Patient discharged successfully",
      patient: {
        _id: patient._id,
        name: patient.fullName,
        phone: patient.phoneNumber,
        email: patient.email,
        age: patient.age ?? null,
        gender: patient.gender ?? null,
        address: patient.address ?? "",
        bloodGroup: patient.bloodGroup ?? "",
        medicalHistory: patient.medicalHistory ?? "",
        status: false,
        isActive: false,
        dischargedAt:
          patient.dischargedAt || patient.completedAt || dischargedAt,
        appointmentDate: patient.appointmentDate,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
      appointment,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    if (!canViewAppointments(req.user)) {
      return res.status(403).json({
        message: "You do not have permission to view appointments",
      });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      100,
    );
    const skip = (page - 1) * limit;
    const status = normalizeText(req.query.status).toLowerCase();
    const search = normalizeText(req.query.search);

    const filterConditions = [];
    const scopeFilter = buildAppointmentScopeFilter(req.user);

    if (Object.keys(scopeFilter).length) {
      filterConditions.push(scopeFilter);
    }

    if (status && status !== "all") {
      if (!ALLOWED_APPOINTMENT_STATUSES.has(status)) {
        return res.status(400).json({ message: "Invalid appointment status" });
      }

      filterConditions.push({ status });
    }

    if (search) {
      filterConditions.push({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { doctorName: { $regex: search, $options: "i" } },
          { serviceName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { reason: { $regex: search, $options: "i" } },
        ],
      });
    }

    const filter =
      filterConditions.length > 0 ? { $and: filterConditions } : {};

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .sort({ appointmentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Appointment.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Appointments retrieved successfully",
      appointments,
      total,
      page,
      limit,
      scope: req.user.roleId === ROLES.DOCTOR ? "doctor" : "admin",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /admin/get-dashboard
exports.getDashboard = async (req, res) => {
  try {
    const scopeFilter = buildAppointmentScopeFilter(req.user);
    const hasScope = Object.keys(scopeFilter).length > 0;
    const appointmentScopeFilter = hasScope ? scopeFilter : {};

    const now = new Date();
    const weekStart = getStartOfWeek(now);
    const weekEnd = getEndOfDay(now);

    const last7Start = new Date(now);
    last7Start.setDate(now.getDate() - 6);
    last7Start.setHours(0, 0, 0, 0);

    const last6MonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    last6MonthsStart.setHours(0, 0, 0, 0);

    const patientStatusFilter = {
      status: { $in: ["confirmed", "rescheduled", "completed"] },
    };
    const patientScopeFilter = hasScope
      ? { $and: [scopeFilter, patientStatusFilter] }
      : patientStatusFilter;

    const [
      totalDoctors,
      totalServices,
      totalBlogs,
      totalGallery,
      totalReviews,
      totalShorts,
      totalPatients,
      totalAppointments,
      appointmentsThisWeek,
      statusCounts,
      recentAppointments,
      apptByDayRaw,
      patientsByMonthRaw,
    ] = await Promise.all([
      User.countDocuments({
        roleId: ROLES.DOCTOR,
        status: { $ne: false },
        isActive: { $ne: false },
      }),
      Service.countDocuments({}),
      Blog.countDocuments({}),
      Gallery.countDocuments({}),
      fetchGoogleReviews()
        .then((payload) => payload.reviews.length)
        .catch(() => 0),
      Short.countDocuments({}),
      Appointment.countDocuments(patientScopeFilter),
      Appointment.countDocuments(appointmentScopeFilter),
      Appointment.countDocuments({
        ...(hasScope ? scopeFilter : {}),
        appointmentDate: { $gte: weekStart, $lte: weekEnd },
      }),
      Appointment.aggregate([
        ...(hasScope ? [{ $match: scopeFilter }] : []),
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Appointment.find(appointmentScopeFilter)
        .sort({ appointmentDate: -1, createdAt: -1 })
        .limit(5)
        .select(
          "_id fullName email phoneNumber doctorName doctorId serviceName serviceId appointmentDate reason status createdAt updatedAt",
        ),
      Appointment.aggregate([
        ...(hasScope ? [{ $match: scopeFilter }] : []),
        { $match: { appointmentDate: { $gte: last7Start, $lte: weekEnd } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$appointmentDate",
                timezone: process.env.MAIL_TIMEZONE || "Asia/Kolkata",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Appointment.aggregate([
        ...(hasScope ? [{ $match: scopeFilter }] : []),
        {
          $match: {
            ...patientStatusFilter,
            createdAt: { $gte: last6MonthsStart, $lte: weekEnd },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m",
                date: "$createdAt",
                timezone: process.env.MAIL_TIMEZONE || "Asia/Kolkata",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const countsByStatus = statusCounts.reduce((acc, item) => {
      const key = String(item._id || "").toLowerCase();
      if (!key) return acc;
      acc[key] = item.count;
      return acc;
    }, {});

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const appointmentCountByDayKey = apptByDayRaw.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const appointmentsLast7Days = last7Days.map((d) => {
      const key = buildDayKey(d); // YYYY-MM-DD
      return { day: key, count: appointmentCountByDayKey[key] || 0 };
    });

    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const patientCountByMonthKey = patientsByMonthRaw.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const patientsLast6Months = last6Months.map((d) => {
      const key = buildMonthKey(d); // YYYY-MM
      return { month: key, count: patientCountByMonthKey[key] || 0 };
    });

    return res.status(200).json({
      message: "Dashboard retrieved successfully",
      scope: req.user?.roleId === ROLES.DOCTOR ? "doctor" : "admin",
      totals: {
        totalPatients,
        totalAppointments,
        appointmentsThisWeek,
        totalDoctors,
        totalServices,
        totalBlogs,
        totalGallery,
        totalReviews,
        totalShorts,
      },
      appointmentsByStatus: {
        pending: countsByStatus.pending || 0,
        confirmed: countsByStatus.confirmed || 0,
        rescheduled: countsByStatus.rescheduled || 0,
        completed: countsByStatus.completed || 0,
        rejected: countsByStatus.rejected || 0,
        cancelled: countsByStatus.cancelled || 0,
      },
      charts: {
        appointmentsLast7Days,
        patientsLast6Months,
      },
      recentAppointments,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (!canManageAppointments(req.user, appointment)) {
      return res.status(403).json({
        message: "You do not have permission to update this appointment",
      });
    }

    const action = normalizeText(req.body.action).toLowerCase();
    const requestedStatus = normalizeText(req.body.status).toLowerCase();
    const notes = normalizeText(req.body.notes);
    const rescheduleReason = normalizeText(
      req.body.rescheduleReason ||
        (action === "reschedule" ? req.body.reason : ""),
    );
    const rejectionReason = normalizeText(
      req.body.rejectionReason || (action === "reject" ? req.body.reason : ""),
    );
    const nextAppointmentDate = parseAppointmentDate(
      req.body.appointmentDate ||
        req.body.scheduledAt ||
        req.body.preferredDate ||
        req.body.date,
    );
    const shouldApprove =
      action === "approve" || requestedStatus === "confirmed";
    const shouldReject = action === "reject" || requestedStatus === "rejected";
    const shouldMarkCompleted =
      action === "complete" ||
      action === "completed" ||
      requestedStatus === "completed" ||
      req.body.markAsComplete === true ||
      req.body.markAsComplete === "true";
    const shouldReschedule =
      action === "reschedule" || Boolean(nextAppointmentDate);

    if (requestedStatus && !ALLOWED_APPOINTMENT_STATUSES.has(requestedStatus)) {
      return res.status(400).json({ message: "Invalid appointment status" });
    }

    if (shouldReschedule && !nextAppointmentDate) {
      return res.status(400).json({
        message: "New appointment date is required to reschedule",
      });
    }

    if (
      !shouldApprove &&
      !shouldReject &&
      !shouldMarkCompleted &&
      !shouldReschedule &&
      !requestedStatus &&
      !notes
    ) {
      return res.status(400).json({
        message:
          "Nothing to update. Send status, notes, or a new appointment date",
      });
    }

    const updateData = {
      updatedBy: req.user?._id || null,
    };

    if (notes) {
      updateData.notes = notes;
    }

    let emailNotification = {
      attempted: false,
      sent: false,
      reason: "No email was triggered",
    };

    if (shouldMarkCompleted) {
      updateData.status = "completed";
      updateData.completedAt = new Date();
      updateData.dischargedAt = updateData.completedAt;
    } else if (shouldApprove) {
      updateData.status = "confirmed";
      updateData.approvedAt = new Date();
      updateData.rejectedAt = null;
      updateData.rejectionReason = "";
      updateData.dischargedAt = null;
    } else if (shouldReject) {
      updateData.status = "rejected";
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = rejectionReason;
      updateData.approvedAt = null;
      updateData.completedAt = null;
      updateData.dischargedAt = null;
    } else if (shouldReschedule) {
      updateData.appointmentDate = nextAppointmentDate;
      updateData.status =
        requestedStatus &&
        requestedStatus !== "completed" &&
        requestedStatus !== "rejected"
          ? requestedStatus
          : "rescheduled";
      updateData.rescheduleReason = rescheduleReason;
      updateData.rescheduledAt = new Date();
      updateData.completedAt = null;
      updateData.dischargedAt = null;
    } else if (requestedStatus) {
      updateData.status = requestedStatus;
      if (requestedStatus === "confirmed") {
        updateData.approvedAt = new Date();
        updateData.rejectedAt = null;
        updateData.rejectionReason = "";
      }
      if (requestedStatus === "rejected") {
        updateData.rejectedAt = new Date();
        updateData.rejectionReason = rejectionReason;
        updateData.approvedAt = null;
      }
      if (requestedStatus !== "completed") {
        updateData.completedAt = null;
        updateData.dischargedAt = null;
      } else {
        updateData.completedAt = new Date();
        updateData.dischargedAt = updateData.completedAt;
      }
    }

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );

    if (updatedAppointment && updatedAppointment.status === "completed") {
      await dischargePatientFromAppointment(
        updatedAppointment,
        updateData.completedAt || new Date(),
      );
    }

    if (shouldReschedule) {
      if (!updatedAppointment.email) {
        emailNotification = {
          attempted: false,
          sent: false,
          reason: "Appointment email is missing",
        };
      } else {
        try {
          const mailResponse = await sendMail({
            to: updatedAppointment.email,
            ...buildRescheduleMail(updatedAppointment),
          });

          emailNotification = mailResponse.skipped
            ? {
                attempted: false,
                sent: false,
                reason: mailResponse.reason,
              }
            : {
                attempted: true,
                sent: true,
                messageId: mailResponse.info?.messageId || null,
              };
        } catch (mailError) {
          console.error("Reschedule email error:", mailError);
          emailNotification = {
            attempted: true,
            sent: false,
            reason: mailError.message,
          };
        }
      }
    }

    let successMessage = "Appointment updated successfully";

    if (shouldMarkCompleted) {
      successMessage = "Appointment marked as completed successfully";
    } else if (shouldApprove) {
      successMessage = "Appointment approved successfully";
    } else if (shouldReject) {
      successMessage = "Appointment rejected successfully";
    } else if (shouldReschedule) {
      successMessage = "Appointment rescheduled successfully";
    }

    return res.status(200).json({
      message: successMessage,
      appointment: updatedAppointment,
      emailNotification,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addReview = async (req, res) => {
  try {
    const { name, review, location, treatment, rating, sortOrder, isActive } =
      req.body;

    if (!name || !review) {
      return res.status(400).json({
        message: "Name and review are required",
      });
    }

    const reviewData = await Review.create({
      name,
      review,
      location,
      treatment,
      rating: rating !== undefined ? rating : 5,
      sortOrder: sortOrder !== undefined ? sortOrder : 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      message: "Review added successfully",
      review: reviewData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, review, location, treatment, rating, sortOrder, isActive } =
      req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (review) updateData.review = review;
    if (location) updateData.location = location;
    if (treatment) updateData.treatment = treatment;
    if (rating !== undefined) updateData.rating = rating;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const reviewData = await Review.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!reviewData) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.status(200).json({
      message: "Review updated successfully",
      review: reviewData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findByIdAndDelete(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addShort = async (req, res) => {
  try {
    const { title, shortUrl, thumbnail, sortOrder, isActive } = req.body;

    if (!title || !shortUrl) {
      return res.status(400).json({
        message: "Title and short url are required",
      });
    }

    const short = await Short.create({
      title,
      shortUrl,
      thumbnail,
      sortOrder: sortOrder !== undefined ? sortOrder : 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      message: "Short added successfully",
      short,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.getAllShorts = async (req, res) => {
  try {
    const shorts = await Short.find().sort({ sortOrder: 1, createdAt: -1 });

    return res
      .status(200)
      .json({ message: "Shorts retrieved successfully", shorts });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateShort = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, shortUrl, thumbnail, sortOrder, isActive } = req.body;

    const updateData = {};

    if (title) updateData.title = title;
    if (shortUrl) updateData.shortUrl = shortUrl;
    if (thumbnail) updateData.thumbnail = thumbnail;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const short = await Short.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!short) {
      return res.status(404).json({ message: "Short not found" });
    }

    return res.status(200).json({
      message: "Short updated successfully",
      short,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteShort = async (req, res) => {
  try {
    const { id } = req.params;

    const short = await Short.findByIdAndDelete(id);

    if (!short) {
      return res.status(404).json({ message: "Short not found" });
    }

    return res.status(200).json({ message: "Short deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addBlog = async (req, res) => {
  try {
    const { title, serviceId, shortDescription, content, seo, status } =
      req.body;

    const image = req.files?.image?.[0]?.filename
      ? `/assets/uploads/${req.files.image[0].filename}`
      : null;

    const newBlog = await Blog.create({
      title,
      serviceId,
      image,
      shortDescription,
      content,
      seo: parseJson(seo),
      status: status || "published",
    });

    return res.status(201).json({
      message: "Blog added successfully",
      blog: newBlog,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);

      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    // duplicate slug error
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Slug already exists",
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Blogs retrieved successfully",
      blogs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, serviceId, shortDescription, content, seo, status } =
      req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (serviceId) updateData.serviceId = serviceId;
    if (req.files?.image?.[0]?.filename) {
      updateData.image = `/assets/uploads/${req.files.image[0].filename}`;
    }
    if (shortDescription) updateData.shortDescription = shortDescription;
    if (content) updateData.content = content;
    if (seo) updateData.seo = parseJson(seo);
    if (status) updateData.status = status;

    const updatedBlog = await Blog.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedBlog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    return res.status(200).json({
      message: "Blog updated successfully",
      blog: updatedBlog,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);

      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedBlog = await Blog.findByIdAndDelete(id);

    if (!deletedBlog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    return res.status(200).json({
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addGallery = async (req, res) => {
  try {
    const image = req.files?.image?.[0]?.filename
      ? `/assets/uploads/${req.files.image[0].filename}`
      : null;

    if (!image) {
      return res.status(400).json({ message: "Gallery image is required" });
    }

    const galleryItem = await Gallery.create({ image });

    return res.status(201).json({
      message: "Gallery image added successfully",
      gallery: galleryItem,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllGallery = async (req, res) => {
  try {
    const galleryItems = await Gallery.find().sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Gallery items retrieved successfully",
      gallery: galleryItems,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteGallery = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedGallery = await Gallery.findByIdAndDelete(id);

    if (!deletedGallery) {
      return res.status(404).json({ message: "Gallery image not found" });
    }

    return res.status(200).json({
      message: "Gallery image deleted successfully",
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

    const content = await Content.findOne({ modelKey });

    return res.status(200).json({
      message: "Content retrieved successfully",
      content,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.upsertContent = async (req, res) => {
  try {
    const modelKey = normalizeText(req.body.modelKey).toLowerCase();
    const title = normalizeText(req.body.title);
    const parsedContent = parseJson(req.body.content);
    const isActive = parseBoolean(req.body.isActive);

    if (!modelKey) {
      return res.status(400).json({ message: "modelKey is required" });
    }

    if (
      parsedContent !== undefined &&
      (typeof parsedContent !== "object" || Array.isArray(parsedContent))
    ) {
      return res.status(400).json({
        message: "content must be a valid JSON object",
      });
    }

    const existingContent = await Content.findOne({ modelKey });
    const baseContent =
      existingContent?.content &&
      typeof existingContent.content === "object" &&
      !Array.isArray(existingContent.content)
        ? existingContent.content
        : {};

    const mergedContent = mergeUploadedFilesIntoContent(
      {
        ...baseContent,
        ...(parsedContent || {}),
      },
      req.files || [],
    );

    const updateData = {
      modelKey,
      content: mergedContent,
    };

    if (title) {
      updateData.title = title;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const content = await Content.findOneAndUpdate({ modelKey }, updateData, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return res.status(200).json({
      message: "Content saved successfully",
      content,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addPage = async (req, res) => {
  try {
    const title = normalizeText(req.body.title);
    const rawSlug = normalizeText(req.body.slug).toLowerCase();
    const slug = rawSlug || slugify(title);
    const content =
      typeof req.body.content === "string" ? req.body.content : "";
    const seoInput = parseJson(req.body.seo) || req.body.seo || {};
    const status =
      normalizePageStatus(req.body.status) ||
      (parseBoolean(req.body.isActive) === false ? "draft" : "published");
    const metaTitle = normalizeText(req.body.metaTitle || seoInput.metaTitle);
    const metaDescription = normalizeText(
      req.body.metaDescription || seoInput.metaDescription,
    );

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!slug) {
      return res.status(400).json({ message: "Slug is required" });
    }

    const existingPage = await Page.findOne({ slug });
    if (existingPage) {
      return res
        .status(400)
        .json({ message: "A page with this slug already exists" });
    }

    const page = await Page.create({
      title,
      slug,
      content,
      status,
      isActive: status === "published",
      seo: {
        metaTitle,
        metaDescription,
      },
    });

    return res.status(201).json({
      message: "Page created successfully",
      page,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllPages = async (req, res) => {
  try {
    const pages = await Page.find().sort({ updatedAt: -1 });
    return res.status(200).json({
      message: "Pages retrieved successfully",
      pages,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const title = normalizeText(req.body.title);
    const rawSlug = normalizeText(req.body.slug).toLowerCase();
    const slug = rawSlug || slugify(title);
    const seoInput = parseJson(req.body.seo) || req.body.seo || {};
    const requestedStatus = normalizePageStatus(req.body.status);
    const isActive = parseBoolean(req.body.isActive);

    const existingPage = await Page.findById(id);
    if (!existingPage) {
      return res.status(404).json({ message: "Page not found" });
    }

    const status =
      requestedStatus ||
      (isActive !== undefined
        ? isActive
          ? "published"
          : "draft"
        : existingPage.status ||
          (existingPage.isActive === false ? "draft" : "published"));
    const content =
      typeof req.body.content === "string"
        ? req.body.content
        : existingPage.content;
    const metaTitle = normalizeText(
      req.body.metaTitle || seoInput.metaTitle || existingPage.seo?.metaTitle,
    );
    const metaDescription = normalizeText(
      req.body.metaDescription ||
        seoInput.metaDescription ||
        existingPage.seo?.metaDescription,
    );

    if (slug && slug !== existingPage.slug) {
      const duplicateSlug = await Page.findOne({ slug });
      if (duplicateSlug) {
        return res
          .status(400)
          .json({ message: "A page with this slug already exists" });
      }
    }

    existingPage.title = title || existingPage.title;
    existingPage.slug = slug || existingPage.slug;
    existingPage.content = content;
    existingPage.status = status;
    existingPage.isActive = status === "published";
    existingPage.seo = {
      metaTitle,
      metaDescription,
    };

    const page = await existingPage.save();

    return res.status(200).json({
      message: "Page updated successfully",
      page,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedPage = await Page.findByIdAndDelete(id);
    if (!deletedPage) {
      return res.status(404).json({ message: "Page not found" });
    }

    return res.status(200).json({
      message: "Page deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addCareer = async (req, res) => {
  try {
    const title = normalizeText(req.body.title);
    const rawSlug = normalizeText(req.body.slug).toLowerCase();
    const slug = rawSlug || slugify(title);
    const status =
      normalizeCareerStatus(req.body.status) ||
      (parseBoolean(req.body.isActive) === false ? "draft" : "open");

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!slug) {
      return res.status(400).json({ message: "Slug is required" });
    }

    const existingCareer = await Career.findOne({ slug });
    if (existingCareer) {
      return res
        .status(400)
        .json({ message: "A career with this slug already exists" });
    }

    const career = await Career.create({
      title,
      slug,
      department: normalizeText(req.body.department),
      location: normalizeText(req.body.location),
      employmentType: normalizeText(req.body.employmentType),
      experience: normalizeText(req.body.experience),
      summary: normalizeText(req.body.summary),
      description: normalizeText(req.body.description),
      requirements: normalizeStringArray(req.body.requirements),
      responsibilities: normalizeStringArray(req.body.responsibilities),
      applyEmail: normalizeText(req.body.applyEmail),
      applyLink: normalizeText(req.body.applyLink),
      status,
      sortOrder: normalizeSortOrder(req.body.sortOrder),
      isActive: status !== "draft",
    });

    return res.status(201).json({
      message: "Career created successfully",
      career,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllCareers = async (req, res) => {
  try {
    const careers = await Career.find().sort({
      sortOrder: 1,
      updatedAt: -1,
      createdAt: -1,
    });

    return res.status(200).json({
      message: "Careers retrieved successfully",
      careers,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateCareer = async (req, res) => {
  try {
    const { id } = req.params;
    const existingCareer = await Career.findById(id);

    if (!existingCareer) {
      return res.status(404).json({ message: "Career not found" });
    }

    const hasField = (fieldName) =>
      Object.prototype.hasOwnProperty.call(req.body, fieldName);

    const title = hasField("title")
      ? normalizeText(req.body.title)
      : existingCareer.title;
    const rawSlug = hasField("slug")
      ? normalizeText(req.body.slug).toLowerCase()
      : existingCareer.slug;
    const slug = rawSlug || slugify(title);
    const requestedStatus = normalizeCareerStatus(req.body.status);
    const isActive = parseBoolean(req.body.isActive);
    const status =
      requestedStatus ||
      (isActive !== undefined
        ? isActive
          ? "open"
          : "draft"
        : existingCareer.status || "open");

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!slug) {
      return res.status(400).json({ message: "Slug is required" });
    }

    if (slug !== existingCareer.slug) {
      const duplicateCareer = await Career.findOne({ slug });
      if (duplicateCareer) {
        return res
          .status(400)
          .json({ message: "A career with this slug already exists" });
      }
    }

    existingCareer.title = title;
    existingCareer.slug = slug;
    existingCareer.department = hasField("department")
      ? normalizeText(req.body.department)
      : existingCareer.department;
    existingCareer.location = hasField("location")
      ? normalizeText(req.body.location)
      : existingCareer.location;
    existingCareer.employmentType = hasField("employmentType")
      ? normalizeText(req.body.employmentType)
      : existingCareer.employmentType;
    existingCareer.experience = hasField("experience")
      ? normalizeText(req.body.experience)
      : existingCareer.experience;
    existingCareer.summary = hasField("summary")
      ? normalizeText(req.body.summary)
      : existingCareer.summary;
    existingCareer.description = hasField("description")
      ? normalizeText(req.body.description)
      : existingCareer.description;
    existingCareer.requirements = hasField("requirements")
      ? normalizeStringArray(req.body.requirements)
      : existingCareer.requirements;
    existingCareer.responsibilities = hasField("responsibilities")
      ? normalizeStringArray(req.body.responsibilities)
      : existingCareer.responsibilities;
    existingCareer.applyEmail = hasField("applyEmail")
      ? normalizeText(req.body.applyEmail)
      : existingCareer.applyEmail;
    existingCareer.applyLink = hasField("applyLink")
      ? normalizeText(req.body.applyLink)
      : existingCareer.applyLink;
    existingCareer.status = status;
    existingCareer.sortOrder = hasField("sortOrder")
      ? normalizeSortOrder(req.body.sortOrder)
      : existingCareer.sortOrder;
    existingCareer.isActive = status !== "draft";

    const career = await existingCareer.save();

    return res.status(200).json({
      message: "Career updated successfully",
      career,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteCareer = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCareer = await Career.findByIdAndDelete(id);
    if (!deletedCareer) {
      return res.status(404).json({ message: "Career not found" });
    }

    return res.status(200).json({
      message: "Career deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// post /admin/update-settings
exports.updateSettings = async (req, res) => {
  try {
    const {
      name,
      email,
      inquiry_email,
      mobile_number,
      inquiry_mobile_number,
      whatsapp_number,
      address,
      working_hours,
      password,
      contact_us,
      term_and_condition,
      privacy_policy,
      about_us,
      google_reviews,
      social_links,
    } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (inquiry_email) updateData.inquiry_email = inquiry_email;
    if (mobile_number) updateData.mobile_number = mobile_number;
    if (inquiry_mobile_number)
      updateData.inquiry_mobile_number = inquiry_mobile_number;
    if (whatsapp_number) updateData.whatsapp_number = whatsapp_number;
    if (address) updateData.address = address;
    if (working_hours) updateData.working_hours = working_hours;
    if (password) updateData.password = password;
    if (contact_us) updateData.contact_us = contact_us;
    if (term_and_condition) updateData.term_and_condition = term_and_condition;
    if (privacy_policy) updateData.privacy_policy = privacy_policy;
    if (about_us) updateData.about_us = about_us;
    if (google_reviews) updateData.google_reviews = parseJson(google_reviews);
    if (social_links) updateData.social_links = parseJson(social_links);
    const settings = await Setting.findOneAndUpdate(
      {},

      updateData,
      { new: true, runValidators: true },
    );

    return res.status(200).json({
      success: true,
      message: "Settings updated",
      data: settings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating settings",
      error: error.message,
    });
  }
};
// GET /admin/get-settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await Setting.findOne();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching settings",
      error: error.message,
    });
  }
};

exports.updateAdminAccount = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const updateData = {};

    const normalizedName = normalizeText(name);
    const normalizedEmail = normalizeText(email).toLowerCase();
    const normalizedPassword = normalizeText(password);

    if (name !== undefined) {
      if (!normalizedName) {
        return res.status(400).json({ message: "Name is required" });
      }

      updateData.name = normalizedName;
    }

    if (email !== undefined) {
      if (!normalizedEmail) {
        return res.status(400).json({ message: "Email is required" });
      }

      const existingUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.user._id },
      });

      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      updateData.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);

      if (normalizedPhone) {
        updateData.phone = normalizedPhone;
      }
    }

    if (password !== undefined) {
      if (!normalizedPassword || normalizedPassword.length < 8) {
        return res.status(400).json({
          message: "Password must be at least 8 characters long",
        });
      }

      updateData.password = normalizedPassword;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const admin = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
    }).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin account not found" });
    }

    return res.status(200).json({
      message: "Admin account updated successfully",
      admin: serializeStaff(admin),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addStaff = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      roleId,
      permissions,
      status,
      isActive,
    } = req.body;

    const normalizedName = normalizeText(name);
    const normalizedEmail = normalizeText(email).toLowerCase();
    const normalizedPassword = normalizeText(password);
    const parsedRoleId = Number(roleId);

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (normalizedPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    if (!ADDABLE_STAFF_ROLE_IDS.includes(parsedRoleId)) {
      return res.status(400).json({
        message: "Only nurse and receptionist accounts can be added here",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const staff = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: normalizedPassword,
      phone: normalizePhone(phone),
      roleId: parsedRoleId,
      permissions: parseJson(permissions) || {},
      status: status !== undefined ? status : true,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      message: "Staff member added successfully",
      staff: serializeStaff(staff),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAdminStaff = async (req, res) => {
  try {
    const staff = await User.find({
      roleId: { $nin: [ROLES.USER, ROLES.GUEST] },
    })
      .sort({ createdAt: -1 })
      .select("-password");

    return res.status(200).json({
      message: "Staff retrieved successfully",
      staff: staff.map(serializeStaff),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateStaffRoleAndPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleId, permissions } = req.body;

    if (String(req.user._id) === String(id)) {
      return res.status(400).json({
        message: "You cannot update your own role or permissions here",
      });
    }

    const parsedRoleId =
      roleId !== undefined && roleId !== null ? Number(roleId) : undefined;

    if (
      parsedRoleId !== undefined &&
      !ADMIN_STAFF_ROLE_IDS.includes(parsedRoleId)
    ) {
      return res.status(400).json({ message: "Invalid roleId" });
    }

    const updateData = {};
    if (parsedRoleId !== undefined) updateData.roleId = parsedRoleId;
    if (permissions !== undefined)
      updateData.permissions = parseJson(permissions);

    const staff = await User.findOneAndUpdate(
      { _id: id, roleId: { $nin: [ROLES.USER, ROLES.GUEST] } },
      updateData,
      { new: true },
    ).select("-password");

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    return res.status(200).json({
      message: "Staff role and permissions updated successfully",
      staff: serializeStaff(staff),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(req.user._id) === String(id)) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account here" });
    }

    const staff = await User.findOneAndDelete({
      _id: id,
      roleId: { $nin: [ROLES.USER, ROLES.GUEST] },
    });

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    return res
      .status(200)
      .json({ message: "Staff member deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addSpecialization = async (req, res) => {
  try {
    const { name, sortOrder, isActive } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const specialization = await Specialization.create({
      name,
      sortOrder: sortOrder !== undefined ? sortOrder : 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      message: "Specialization added successfully",
      specialization,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllSpecializations = async (req, res) => {
  try {
    const { isActive } = req.query;
    const filter = isActive !== undefined ? { isActive: isActive } : {};
    const specializations = await Specialization.find(filter).sort({ sortOrder: 1 });

    return res.status(200).json({
      message: "Specializations retrieved successfully",
      specializations,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateSpecialization = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sortOrder, isActive } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const specialization = await Specialization.findByIdAndUpdate(id, updateData, { new: true });

    if (!specialization) {
      return res.status(404).json({ message: "Specialization not found" });
    }

    return res.status(200).json({
      message: "Specialization updated successfully",
      specialization,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteSpecialization = async (req, res) => {
  try {
    const { id } = req.params;

    const specialization = await Specialization.findByIdAndDelete(id);

    if (!specialization) {
      return res.status(404).json({ message: "Specialization not found" });
    }

    return res.status(200).json({ message: "Specialization deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addHonor = async (req, res) => {
  try {
    const title = normalizeText(req.body.title);
    const organization = normalizeText(req.body.organization);
    const year = normalizeText(req.body.year);
    const description = normalizeText(req.body.description);
    const sortOrder =
      req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : 0;
    const isActive = parseBoolean(req.body.isActive);

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (Number.isNaN(sortOrder) || sortOrder < 0) {
      return res
        .status(400)
        .json({ message: "Sort order must be 0 or greater" });
    }

    const honor = await Honor.create({
      title,
      organization,
      year,
      description,
      sortOrder,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      message: "Honor added successfully",
      honor,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllHonors = async (req, res) => {
  try {
    const isActive = parseBoolean(req.query.isActive);
    const filter = isActive !== undefined ? { isActive } : {};
    const honors = await Honor.find(filter).sort({
      sortOrder: 1,
      updatedAt: -1,
      createdAt: -1,
    });

    return res.status(200).json({
      message: "Honors retrieved successfully",
      honors,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateHonor = async (req, res) => {
  try {
    const { id } = req.params;

    const updateData = {};

    if (req.body.title !== undefined) {
      const title = normalizeText(req.body.title);

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      updateData.title = title;
    }

    if (req.body.organization !== undefined) {
      updateData.organization = normalizeText(req.body.organization);
    }

    if (req.body.year !== undefined) {
      updateData.year = normalizeText(req.body.year);
    }

    if (req.body.description !== undefined) {
      updateData.description = normalizeText(req.body.description);
    }

    if (req.body.sortOrder !== undefined) {
      const sortOrder = Number(req.body.sortOrder);

      if (Number.isNaN(sortOrder) || sortOrder < 0) {
        return res
          .status(400)
          .json({ message: "Sort order must be 0 or greater" });
      }

      updateData.sortOrder = sortOrder;
    }

    const isActive = parseBoolean(req.body.isActive);
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const honor = await Honor.findByIdAndUpdate(id, updateData, { new: true });

    if (!honor) {
      return res.status(404).json({ message: "Honor not found" });
    }

    return res.status(200).json({
      message: "Honor updated successfully",
      honor,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteHonor = async (req, res) => {
  try {
    const { id } = req.params;

    const honor = await Honor.findByIdAndDelete(id);

    if (!honor) {
      return res.status(404).json({ message: "Honor not found" });
    }

    return res.status(200).json({ message: "Honor deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
