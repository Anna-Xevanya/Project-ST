const express = require("express");
const { pool } = require("../db");
const { asyncHandler } = require("../utils/async-handler");
const { HttpError } = require("../utils/http-error");
const {
  isUuid,
  isNonEmptyString,
  isValidTimestamp,
  parsePositiveInteger
} = require("../utils/validation");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { animal_id } = req.query;
    const limit = parsePositiveInteger(req.query.limit, 50, 100);
    const offset = req.query.offset === undefined ? 0 : Number.parseInt(req.query.offset, 10);

    if (limit === null) throw new HttpError(400, "limit tidak valid.");
    if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset tidak valid.");
    if (animal_id && !isUuid(animal_id)) throw new HttpError(400, "animal_id tidak valid.");

    const params = [];
    let where = "";
    if (animal_id) {
      params.push(animal_id);
      where = "WHERE f.animal_id = $1";
    }
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT f.feed_id, f.animal_id, a.tag_code, f.recorded_by, f.feed_type,
              f.quantity, f.unit, f.feeding_date, f.notes, f.created_at
       FROM feed_records f
       JOIN animals a ON a.animal_id = f.animal_id
       ${where}
       ORDER BY f.feeding_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      data: result.rows,
      pagination: { limit, offset, returned: result.rowCount }
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { animal_id, recorded_by, feed_type, quantity, unit, feeding_date, notes } = req.body;

    if (!isUuid(animal_id)) throw new HttpError(400, "animal_id wajib berupa UUID yang valid.");
    if (recorded_by && !isUuid(recorded_by)) throw new HttpError(400, "recorded_by tidak valid.");
    if (!isNonEmptyString(feed_type)) throw new HttpError(400, "feed_type wajib diisi.");
    if (!isNonEmptyString(unit)) throw new HttpError(400, "unit wajib diisi.");
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      throw new HttpError(400, "quantity harus lebih besar dari 0.");
    }
    if (feeding_date && !isValidTimestamp(feeding_date)) {
      throw new HttpError(400, "feeding_date harus berupa tanggal/waktu yang valid.");
    }

    const animal = await pool.query(
      "SELECT animal_id FROM animals WHERE animal_id = $1 AND status = 'active'",
      [animal_id]
    );
    if (animal.rowCount === 0) throw new HttpError(400, "Ternak tidak ditemukan atau tidak aktif.");

    const result = await pool.query(
      `INSERT INTO feed_records
       (animal_id, recorded_by, feed_type, quantity, unit, feeding_date, notes)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7)
       RETURNING feed_id, animal_id, recorded_by, feed_type, quantity, unit, feeding_date, notes, created_at`,
      [
        animal_id,
        recorded_by || null,
        feed_type.trim(),
        Number(quantity),
        unit.trim(),
        feeding_date || null,
        notes?.trim() || null
      ]
    );

    res.status(201).json({ data: result.rows[0] });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID pencatatan pakan tidak valid.");

    const result = await pool.query(
      `SELECT f.feed_id, f.animal_id, a.tag_code, f.recorded_by, f.feed_type,
              f.quantity, f.unit, f.feeding_date, f.notes, f.created_at
       FROM feed_records f
       JOIN animals a ON a.animal_id = f.animal_id
       WHERE f.feed_id = $1`,
      [req.params.id]
    );

    if (result.rowCount === 0) throw new HttpError(404, "Catatan pakan tidak ditemukan.");
    res.json({ data: result.rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID pencatatan pakan tidak valid.");

    const allowed = ["feed_type", "quantity", "unit", "feeding_date", "notes"];
    const updates = [];
    const values = [];

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      const value = req.body[field];

      if (["feed_type", "unit"].includes(field) && !isNonEmptyString(value)) {
        throw new HttpError(400, `${field} tidak boleh kosong.`);
      }
      if (field === "quantity" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
        throw new HttpError(400, "quantity harus lebih besar dari 0.");
      }
      if (field === "feeding_date" && !isValidTimestamp(value)) {
        throw new HttpError(400, "feeding_date tidak valid.");
      }

      values.push(["feed_type", "unit", "notes"].includes(field) && typeof value === "string"
        ? (value.trim() || null)
        : field === "quantity" ? Number(value) : value);
      updates.push(`${field} = $${values.length}`);
    }

    if (updates.length === 0) throw new HttpError(400, "Tidak ada field yang diperbarui.");

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE feed_records SET ${updates.join(", ")}
       WHERE feed_id = $${values.length}
       RETURNING feed_id, animal_id, recorded_by, feed_type, quantity, unit, feeding_date, notes`,
      values
    );

    if (result.rowCount === 0) throw new HttpError(404, "Catatan pakan tidak ditemukan.");
    res.json({ data: result.rows[0] });
  })
);

module.exports = router;
