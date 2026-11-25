require("dotenv").config();

const app = require("./app");
const { pool } = require("./db");
const { startGrpcServer } = require("./grpc-server");

const PORT = Number(process.env.PORT || 3001);

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("[PostgreSQL] Database terhubung.");

    const httpServer = app.listen(PORT, () => {
      console.log(`[HTTP] Livestock Service berjalan pada http://localhost:${PORT}`);
    });

    const grpcServer = startGrpcServer();

    const shutdown = () => {
      console.log("\nMenutup Livestock Service...");
      httpServer.close(async () => {
        grpcServer.tryShutdown(async () => {
          await pool.end();
          console.log("Semua koneksi ditutup.");
          process.exit(0);
        });
      });

      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Gagal menjalankan Livestock Service:", error);

    if (error.code === "28P01") {
      console.error(
        "\n[Hint] Login PostgreSQL ditolak. Periksa:\n" +
        "  1. Nilai user dan password di DATABASE_URL pada file .env.\n" +
        "  2. Apakah PostgreSQL di port 5432 adalah container Docker (livestock-postgres),\n" +
        "     bukan instalasi PostgreSQL lokal Windows. Cek dengan: netstat -ano | findstr :5432\n" +
        "  3. Jika user/password di docker-compose.yml pernah diubah, volume lama masih memakai nilai lama.\n" +
        "     Reset dengan: docker compose down -v && docker compose up -d postgres rabbitmq\n"
      );
    }

    process.exit(1);
  }
}

start();
