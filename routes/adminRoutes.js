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
  addDoctor,
  getAllDoctors,
  updateDoctor,
  deleteDoctor,
  getAppointments,
  updateAppointment,
  addReview,
  getAllReviews,
  updateReview,
  deleteReview,
  addShort,
  getAllShorts,
  updateShort,
  deleteShort,
} = require("../controllers/adminControler");

router.post("/admin-login", adminLogin)
router.post("/add-service", verifyToken, checkPermission(permisson.MANAGE_SERVICES), upload, addService);
router.get("/get-all-services", verifyToken, checkPermission(permisson.VIEW_SERVICES), getAllServices);
router.post("/update-services/:id", verifyToken, checkPermission(permisson.MANAGE_SERVICES), upload, updateService);
router.post("/add-doctor", verifyToken, checkAdmin, upload, addDoctor);
router.get("/get-all-doctors", verifyToken, checkPermission(permisson.VIEW_DOCTORS), getAllDoctors);
router.post("/update-doctor/:id", verifyToken, checkAdmin, upload, updateDoctor);
router.post("/delete-doctor/:id", verifyToken, checkAdmin, deleteDoctor);
router.get("/get-appointments", verifyToken, getAppointments);
router.post("/update-appointment/:id", verifyToken, updateAppointment);
router.post("/add-review", verifyToken, checkPermission(permisson.MANAGE_REVIEWS), addReview);
router.get("/get-all-reviews", verifyToken, checkPermission(permisson.VIEW_REVIEWS), getAllReviews);
router.post("/update-review/:id", verifyToken, checkPermission(permisson.MANAGE_REVIEWS), updateReview);
router.post("/delete-review/:id", verifyToken, checkPermission(permisson.MANAGE_REVIEWS), deleteReview);
router.post("/add-short", verifyToken, checkPermission(permisson.MANAGE_SHORTS), addShort);
router.get("/get-all-shorts", verifyToken, checkPermission(permisson.VIEW_SHORTS), getAllShorts);
router.post("/update-short/:id", verifyToken, checkPermission(permisson.MANAGE_SHORTS), updateShort);
router.post("/delete-short/:id", verifyToken, checkPermission(permisson.MANAGE_SHORTS), deleteShort);

module.exports = router;
