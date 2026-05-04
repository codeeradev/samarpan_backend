const express = require("express");
const {
  submitAppointment,
  getServices,
  getDoctors,
  getReviews,
  getShorts,
  getBlogs,
  getGallery,
  getCareers,
  getHonors,
  getContentByModelKey,
  getPageBySlug,
  getSettings,
  getTheme
} = require("../controllers/websiteController");

const router = express.Router();

router.post("/submit-appointment", submitAppointment);
router.get("/get-services", getServices);
router.get("/get-doctors", getDoctors);
router.get("/get-reviews", getReviews);
router.get("/get-shorts", getShorts);
router.get("/get-blogs", getBlogs);
router.get("/get-gallery", getGallery);
router.get("/get-careers", getCareers);
router.get("/get-honors", getHonors);
router.get("/get-content/:modelKey", getContentByModelKey);
router.get("/get-page/:slug", getPageBySlug);
router.get("/get-settings", getSettings);
router.get("/get-theme", getTheme)
module.exports = router;
