const Service = require("../models/service");

exports.getServices = async (req, res) => {
    try {
        const services = await Service.find({ isActive: true });
        return res.status(200).json({ message: "Services retrieved successfully", services });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};