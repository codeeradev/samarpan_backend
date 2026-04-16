const ROLES = require("../constants/roles");

const checkPermission = (permissionKey) => {
  return (req, res, next) => {
    const user = req.user;

    // ✅ SUPER ADMIN → allow everything
    if (user.roleId === ROLES.SUPER_ADMIN) {
      return next();
    }

    // ✅ Check permission map
    const hasPermission = user.permissions?.get(permissionKey);

    if (!hasPermission) {
      return res.status(403).json({
        message: "Access denied. Permission required.",
      });
    }

    next();
  };
};

module.exports = checkPermission;