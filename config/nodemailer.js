const nodemailer = require("nodemailer");

let transporter;

const isMailConfigured = () =>
  Boolean(
    process.env.MAIL_HOST &&
      process.env.MAIL_PORT &&
      process.env.MAIL_USER &&
      process.env.MAIL_PASSWORD,
  );

const getTransporter = () => {
  if (!isMailConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure:
        String(process.env.MAIL_SECURE || "false").toLowerCase() === "true",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  return transporter;
};

const sendMail = async (mailOptions) => {
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    return {
      skipped: true,
      reason: "Mail configuration is missing",
    };
  }

  const info = await activeTransporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    ...mailOptions,
  });

  return {
    skipped: false,
    info,
  };
};

module.exports = {
  isMailConfigured,
  sendMail,
};
