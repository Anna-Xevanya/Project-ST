function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} tidak ditemukan.`
    }
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let statusCode = error.statusCode || 500;
  let code = error.code || "INTERNAL_SERVER_ERROR";
  let message = error.message || "Terjadi kesalahan pada server.";

  // PostgreSQL constraint errors
  if (error.code === "23505") {
    statusCode = 409;
    code = "DUPLICATE_DATA";
    message = "Data dengan nilai unik tersebut sudah tersedia.";
  } else if (error.code === "23503") {
    statusCode = 400;
    code = "INVALID_REFERENCE";
    message = "Referensi data tidak ditemukan atau masih digunakan.";
  } else if (error.code === "23514" || error.code === "22P02") {
    statusCode = 400;
    code = "INVALID_DATA";
    message = "Nilai data tidak sesuai dengan ketentuan.";
  }

  if (statusCode >= 500) {
    console.error("[API Error]", error);
    if (process.env.NODE_ENV === "production") {
      message = "Terjadi kesalahan internal pada server.";
    }
  }

  res.status(statusCode).json({
    error: { code, message }
  });
}

module.exports = { notFoundHandler, errorHandler };
