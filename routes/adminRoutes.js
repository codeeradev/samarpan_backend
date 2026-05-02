const express = require("express");
const permisson = require("../constants/permisson");
const verifyToken = require("../middleware/verifyToken");
const upload = require("../middleware/multer");
const checkPermission = require("../middleware/checkPermisson");
const checkAdmin = require("../middleware/checkAdmin");
const router = express.Router();

const {
  adminLogin,

  addService,
  getAllServices,
  updateService,
  deleteService,

  addDoctor,
  getAllDoctors,
  updateDoctor,
  deleteDoctor,

  getAppointments,
  updateAppointment,

  addShort,
  getAllShorts,
  updateShort,
  deleteShort,

  addBlog,
  getAllBlogs,
  updateBlog,
  deleteBlog,

  addGallery,
  getAllGallery,
  deleteGallery,

  addCareer,
  getAllCareers,
  updateCareer,
  deleteCareer,

  getContentByModelKey,
  upsertContent,

  addPage,
  getAllPages,
  updatePage,
  deletePage,

  getSettings,
  updateSettings,

  updateAdminAccount,

  addStaff,
  getAdminStaff,
  updateStaffRoleAndPermissions,
  deleteStaff,

  getAllPatients,
  updatePatient,
  dischargePatient,

  getDashboard,

  addSpecialization,
  updateSpecialization,
  deleteSpecialization,
  getAllSpecializations,
} = require("../controllers/adminControler");

router.post("/admin-login", adminLogin)
router.post("/add-service", verifyToken, checkPermission(permisson.MANAGE_SERVICES), upload, addService);
router.get("/get-all-services", verifyToken, checkPermission(permisson.VIEW_SERVICES), getAllServices);
router.post("/delete-service/:id", verifyToken, checkPermission(permisson.MANAGE_SERVICES), deleteService);
router.post("/update-services/:id", verifyToken, checkPermission(permisson.MANAGE_SERVICES), upload, updateService);
router.post("/add-doctor", verifyToken, checkAdmin, upload, addDoctor);
router.get("/get-all-doctors", verifyToken, checkPermission(permisson.VIEW_DOCTORS), getAllDoctors);
router.post("/update-doctor/:id", verifyToken, checkAdmin, upload, updateDoctor);
router.post("/delete-doctor/:id", verifyToken, checkAdmin, deleteDoctor);
router.get("/get-appointments", verifyToken, getAppointments);
router.post("/update-appointment/:id", verifyToken, updateAppointment);
router.get("/get-dashboard", verifyToken, getDashboard);
router.post("/add-short", verifyToken, checkPermission(permisson.MANAGE_SHORTS), addShort);
router.get("/get-all-shorts", verifyToken, checkPermission(permisson.VIEW_SHORTS), getAllShorts);
router.post("/update-short/:id", verifyToken, checkPermission(permisson.MANAGE_SHORTS), updateShort);
router.post("/delete-short/:id", verifyToken, checkPermission(permisson.MANAGE_SHORTS), deleteShort);
router.post("/add-blog", verifyToken, checkPermission(permisson.MANAGE_BLOGS), upload, addBlog);
router.get("/get-all-blogs", verifyToken, checkPermission(permisson.VIEW_BLOGS), getAllBlogs);
router.post("/update-blog/:id", verifyToken, checkPermission(permisson.MANAGE_BLOGS), upload, updateBlog);
router.post("/delete-blog/:id", verifyToken, checkPermission(permisson.MANAGE_BLOGS), deleteBlog);
router.post("/add-gallery", verifyToken, checkPermission(permisson.MANAGE_GALLERY), upload, addGallery);
router.get("/get-all-gallery", verifyToken, checkPermission(permisson.VIEW_GALLERY), getAllGallery);
router.post("/delete-gallery/:id", verifyToken, checkPermission(permisson.MANAGE_GALLERY), deleteGallery);
router.post("/add-career", verifyToken, checkAdmin, addCareer);
router.get("/get-all-careers", verifyToken, checkAdmin, getAllCareers);
router.post("/update-career/:id", verifyToken, checkAdmin, updateCareer);
router.post("/delete-career/:id", verifyToken, checkAdmin, deleteCareer);
router.post("/add-page", verifyToken, checkAdmin, addPage);
router.get("/get-all-pages", verifyToken, checkAdmin, getAllPages);
router.post("/update-page/:id", verifyToken, checkAdmin, updatePage);
router.post("/delete-page/:id", verifyToken, checkAdmin, deletePage);
router.get("/get-content/:modelKey", verifyToken, checkAdmin, getContentByModelKey);
router.post("/upsert-content", verifyToken, checkAdmin, upload.any, upsertContent);
router.get("/get-settings", verifyToken, checkPermission(permisson.VIEW_SETTINGS), checkAdmin, getSettings);
router.post("/update-settings", verifyToken, checkPermission(permisson.MANAGE_SETTINGS), checkAdmin, updateSettings);
router.post("/update-admin-account", verifyToken, updateAdminAccount);
router.post("/add-staff", verifyToken, checkPermission(permisson.MANAGE_ADMIN_STAFF), checkAdmin, addStaff);
router.get("/get-admin-staff", verifyToken, checkPermission(permisson.VIEW_ADMIN_STAFF), checkAdmin, getAdminStaff);
router.post("/update-staff/:id", verifyToken, checkPermission(permisson.MANAGE_ADMIN_STAFF), checkAdmin, updateStaffRoleAndPermissions);
router.post("/delete-staff/:id", verifyToken, checkPermission(permisson.MANAGE_ADMIN_STAFF), checkAdmin, deleteStaff);
router.get("/get-all-patients", verifyToken, checkPermission(permisson.VIEW_USERS), getAllPatients);
router.post("/update-patient/:id", verifyToken, checkPermission(permisson.MANAGE_USERS), updatePatient);
router.post("/discharge-patient/:id", verifyToken, checkPermission(permisson.MANAGE_USERS), dischargePatient);

router.post("/add-specialization", verifyToken, checkAdmin, addSpecialization);
router.post("/update-specialization/:id", verifyToken, checkAdmin, updateSpecialization);
router.post("/delete-specialization/:id", verifyToken, checkAdmin, deleteSpecialization);
router.get("/get-all-specializations", verifyToken, checkAdmin, getAllSpecializations);

module.exports = router;
