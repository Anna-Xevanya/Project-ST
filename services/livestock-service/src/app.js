const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const barnsRouter = require("./routes/barns");
const animalsRouter = require("./routes/animals");
const feedRecordsRouter = require("./routes/feed-records");
const { notFoundHandler, errorHandler } = require("./middleware/error-handler");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      service: "livestock-service",
      database: "connected"
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/barns", barnsRouter);
app.use("/api/animals", animalsRouter);
app.use("/api/feed-records", feedRecordsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
