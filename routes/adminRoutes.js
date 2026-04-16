const express = require("express");
const permisson = require("../constants/permisson");
const verifyToken = require("../middleware/verifyToken");
const upload = require("../middleware/multer");
const checkPermission = require("../middleware/checkPermisson");
const router = express.Router();

const { adminLogin, addService, getAllServices, updateService } = require("../controllers/adminControler");

router.post("/admin-login", adminLogin)
router.post("/add-service", verifyToken, checkPermission(permisson.MANAGE_SERVICES), upload, addService);
router.get("/get-all-services", verifyToken, checkPermission(permisson.VIEW_SERVICES), getAllServices);
router.post("/update-services/:id", verifyToken, checkPermission(permisson.MANAGE_SERVICES), upload, updateService);

module.exports = router;
