const User = require("../models/user");
const Service = require("../models/service");
const jwt = require("jsonwebtoken");

const ROLE_MAP = {
  1: "SUPER_ADMIN",
  2: "DOCTOR",
  3: "NURSE",
  4: "RECEPTIONIST",
  5: "USER",
  6: "GUEST",
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
    console.log(admin);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
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
    const {
      title,
      slug,
      shortDescription,
      features,
      content,
      faqs,
      seo,
    } = req.body;

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
