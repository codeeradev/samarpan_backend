const ROLES = require("../constants/roles");

const checkAdmin = (req, res, next) => {
  if (req.user.roleId !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({
      message: "Only admin can access this route",
    });
  }

  next();
};

module.exports = checkAdmin;
