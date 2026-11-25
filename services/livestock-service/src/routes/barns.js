const express = require("express");
const { pool } = require("../db");
const { asyncHandler } = require("../utils/async-handler");
const { HttpError } = require("../utils/http-error");
const { isUuid, isNonEmptyString } = require("../utils/validation");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const params = [];
    let where = "";

    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        throw new HttpError(400, "Status kandang harus active atau inactive.");
      }
      params.push(status);
      where = "WHERE status = $1";
    }

    const result = await pool.query(
      `SELECT barn_id, barn_name, location, capacity, status, created_at, updated_at
       FROM barns ${where}
       ORDER BY created_at DESC`,
      params
    );

    res.json({ data: result.rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { barn_name, location, capacity } = req.body;

    if (!isNonEmptyString(barn_name)) {
      throw new HttpError(400, "barn_name wajib diisi.");
    }
    if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
      throw new HttpError(400, "capacity harus berupa bilangan bulat lebih dari 0.");
    }

    const result = await pool.query(
      `INSERT INTO barns (barn_name, location, capacity)
       VALUES ($1, $2, $3)
       RETURNING barn_id, barn_name, location, capacity, status, created_at, updated_at`,
      [barn_name.trim(), location?.trim() || null, Number(capacity)]
    );

    res.status(201).json({ data: result.rows[0] });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID kandang tidak valid.");

    const result = await pool.query(
      `SELECT barn_id, barn_name, location, capacity, status, created_at, updated_at
       FROM barns WHERE barn_id = $1`,
      [req.params.id]
    );

    if (result.rowCount === 0) throw new HttpError(404, "Kandang tidak ditemukan.");
    res.json({ data: result.rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID kandang tidak valid.");

    const allowed = ["barn_name", "location", "capacity", "status"];
    const updates = [];
    const values = [];

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      const value = req.body[field];

      if (field === "barn_name" && !isNonEmptyString(value)) {
        throw new HttpError(400, "barn_name tidak boleh kosong.");
      }
      if (field === "capacity" && (!Number.isInteger(Number(value)) || Number(value) < 1)) {
        throw new HttpError(400, "capacity harus berupa bilangan bulat lebih dari 0.");
      }
      if (field === "status" && !["active", "inactive"].includes(value)) {
        throw new HttpError(400, "Status kandang harus active atau inactive.");
      }

      values.push(field === "barn_name" || field === "location" ? (value?.trim() || null) :
        field === "capacity" ? Number(value) : value);
      updates.push(`${field} = $${values.length}`);
    }

    if (updates.length === 0) throw new HttpError(400, "Tidak ada field yang diperbarui.");

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE barns SET ${updates.join(", ")}, updated_at = NOW()
       WHERE barn_id = $${values.length}
       RETURNING barn_id, barn_name, location, capacity, status, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) throw new HttpError(404, "Kandang tidak ditemukan.");
    res.json({ data: result.rows[0] });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID kandang tidak valid.");

    const count = await pool.query(
      "SELECT COUNT(*)::int AS total FROM animals WHERE barn_id = $1 AND status = 'active'",
      [req.params.id]
    );
    if (count.rows[0].total > 0) {
      throw new HttpError(409, "Kandang masih memiliki ternak aktif. Pindahkan ternak terlebih dahulu.");
    }

    const result = await pool.query(
      `UPDATE barns SET status = 'inactive', updated_at = NOW()
       WHERE barn_id = $1
       RETURNING barn_id, barn_name, status`,
      [req.params.id]
    );

    if (result.rowCount === 0) throw new HttpError(404, "Kandang tidak ditemukan.");
    res.json({ data: result.rows[0], message: "Kandang dinonaktifkan." });
  })
);

module.exports = router;
