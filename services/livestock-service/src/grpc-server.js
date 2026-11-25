const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { pool } = require("./db");
const { isUuid } = require("./utils/validation");

const protoPath =
  process.env.PROTO_PATH || path.resolve(__dirname, "../../../proto/livestock.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const livestockProto = grpc.loadPackageDefinition(packageDefinition).livestock;

async function getAnimalDetails(call, callback) {
  const animalId = call.request.animal_id;

  if (!isUuid(animalId)) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: "animal_id harus berupa UUID yang valid."
    });
  }

  try {
    const result = await pool.query(
      `SELECT a.animal_id, a.tag_code, a.species, a.breed, a.barn_id,
              b.barn_name, a.status
       FROM animals a
       LEFT JOIN barns b ON b.barn_id = a.barn_id
       WHERE a.animal_id = $1`,
      [animalId]
    );

    if (result.rowCount === 0) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: "Ternak tidak ditemukan."
      });
    }

    const animal = result.rows[0];

    callback(null, {
      animal_id: animal.animal_id,
      tag_code: animal.tag_code,
      species: animal.species,
      breed: animal.breed || "",
      barn_id: animal.barn_id || "",
      barn_name: animal.barn_name || "",
      status: animal.status
    });
  } catch (error) {
    console.error("[gRPC] GetAnimalDetails error:", error);
    callback({
      code: grpc.status.INTERNAL,
      message: "Gagal mengambil detail ternak."
    });
  }
}

function startGrpcServer() {
  const server = new grpc.Server();

  server.addService(livestockProto.LivestockService.service, {
    getAnimalDetails
  });

  const bindAddress = process.env.GRPC_BIND || "0.0.0.0:50051";

  server.bindAsync(
    bindAddress,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error("[gRPC] Gagal menjalankan server:", error);
        process.exitCode = 1;
        return;
      }
      server.start();
      console.log(`[gRPC] Livestock Service berjalan pada port ${port}`);
    }
  );

  return server;
}

module.exports = { startGrpcServer };
