const express = require("express");
require("dotenv").config();
const connectDb = require("./database");
const http = require("http");
const cors = require("cors");
const path = require("path");

connectDb();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const server = http.createServer(app);

const adminRoutes = require("./routes/adminRoutes");
const websiteRoutes = require("./routes/websiteRoutes");

app.get("/", (req, res) => {
  res.send("Samarpan api is running ...");
});

app.use("/assets", express.static(path.join(__dirname, "assets")));

app.use("/", websiteRoutes);
app.use("/admin", adminRoutes);

const startServer = async () => {
  await connectDb();

  const PORT = process.env.PORT || 9010;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
