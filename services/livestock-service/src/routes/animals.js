const express = require("express");
const { pool } = require("../db");
const { asyncHandler } = require("../utils/async-handler");
const { HttpError } = require("../utils/http-error");
const {
  isUuid,
  isNonEmptyString,
  isDateOnly,
  parsePositiveInteger
} = require("../utils/validation");

const router = express.Router();

const ANIMAL_SELECT = `
  SELECT a.animal_id, a.barn_id, b.barn_name, a.tag_code, a.species,
         a.breed, a.sex, a.birth_date, a.status, a.notes,
         a.created_at, a.updated_at
  FROM animals a
  LEFT JOIN barns b ON b.barn_id = a.barn_id
`;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, barn_id, status } = req.query;
    const limit = parsePositiveInteger(req.query.limit, 50, 100);
    const offset = req.query.offset === undefined ? 0 : Number.parseInt(req.query.offset, 10);

    if (limit === null) throw new HttpError(400, "limit harus berupa bilangan bulat positif maksimal 100.");
    if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset tidak valid.");
    if (barn_id && !isUuid(barn_id)) throw new HttpError(400, "barn_id tidak valid.");
    if (status && !["active", "inactive", "sold", "deceased"].includes(status)) {
      throw new HttpError(400, "Status ternak tidak valid.");
    }

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(a.tag_code ILIKE $${params.length} OR a.species ILIKE $${params.length} OR a.breed ILIKE $${params.length})`);
    }
    if (barn_id) {
      params.push(barn_id);
      conditions.push(`a.barn_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const result = await pool.query(
      `${ANIMAL_SELECT} ${where}
       ORDER BY a.created_at DESC
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
    const { barn_id, tag_code, species, breed, sex, birth_date, notes } = req.body;

    if (!isUuid(barn_id)) throw new HttpError(400, "barn_id wajib diisi dengan UUID yang valid.");
    if (!isNonEmptyString(tag_code)) throw new HttpError(400, "tag_code wajib diisi.");
    if (!isNonEmptyString(species)) throw new HttpError(400, "species wajib diisi.");
    if (sex !== undefined && !["male", "female", "unknown"].includes(sex)) {
      throw new HttpError(400, "sex harus male, female, atau unknown.");
    }
    if (birth_date && !isDateOnly(birth_date)) {
      throw new HttpError(400, "birth_date harus menggunakan format YYYY-MM-DD.");
    }

    const barn = await pool.query(
      "SELECT barn_id FROM barns WHERE barn_id = $1 AND status = 'active'",
      [barn_id]
    );
    if (barn.rowCount === 0) throw new HttpError(400, "Kandang tidak ditemukan atau tidak aktif.");

    const result = await pool.query(
      `INSERT INTO animals (barn_id, tag_code, species, breed, sex, birth_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING animal_id, barn_id, tag_code, species, breed, sex, birth_date, status, notes, created_at`,
      [
        barn_id,
        tag_code.trim(),
        species.trim(),
        breed?.trim() || null,
        sex || "unknown",
        birth_date || null,
        notes?.trim() || null
      ]
    );

    res.status(201).json({ data: result.rows[0] });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID ternak tidak valid.");

    const result = await pool.query(`${ANIMAL_SELECT} WHERE a.animal_id = $1`, [req.params.id]);
    if (result.rowCount === 0) throw new HttpError(404, "Ternak tidak ditemukan.");

    res.json({ data: result.rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID ternak tidak valid.");

    const allowed = ["barn_id", "tag_code", "species", "breed", "sex", "birth_date", "status", "notes"];
    const updates = [];
    const values = [];

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      const value = req.body[field];

      if (field === "barn_id") {
        if (!isUuid(value)) throw new HttpError(400, "barn_id tidak valid.");
        const barn = await pool.query(
          "SELECT barn_id FROM barns WHERE barn_id = $1 AND status = 'active'",
          [value]
        );
        if (barn.rowCount === 0) throw new HttpError(400, "Kandang tidak ditemukan atau tidak aktif.");
      }
      if (["tag_code", "species"].includes(field) && !isNonEmptyString(value)) {
        throw new HttpError(400, `${field} tidak boleh kosong.`);
      }
      if (field === "sex" && !["male", "female", "unknown"].includes(value)) {
        throw new HttpError(400, "sex harus male, female, atau unknown.");
      }
      if (field === "birth_date" && value !== null && !isDateOnly(value)) {
        throw new HttpError(400, "birth_date harus menggunakan format YYYY-MM-DD atau null.");
      }
      if (field === "status" && !["active", "inactive", "sold", "deceased"].includes(value)) {
        throw new HttpError(400, "Status ternak tidak valid.");
      }

      let normalized = value;
      if (["tag_code", "species", "breed", "notes"].includes(field)) {
        normalized = typeof value === "string" ? (value.trim() || null) : value;
      }
      values.push(normalized);
      updates.push(`${field} = $${values.length}`);
    }

    if (updates.length === 0) throw new HttpError(400, "Tidak ada field yang diperbarui.");

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE animals SET ${updates.join(", ")}, updated_at = NOW()
       WHERE animal_id = $${values.length}
       RETURNING animal_id, barn_id, tag_code, species, breed, sex, birth_date, status, notes, updated_at`,
      values
    );

    if (result.rowCount === 0) throw new HttpError(404, "Ternak tidak ditemukan.");
    res.json({ data: result.rows[0] });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "ID ternak tidak valid.");

    const result = await pool.query(
      `UPDATE animals SET status = 'inactive', updated_at = NOW()
       WHERE animal_id = $1
       RETURNING animal_id, tag_code, status`,
      [req.params.id]
    );

    if (result.rowCount === 0) throw new HttpError(404, "Ternak tidak ditemukan.");
    res.json({ data: result.rows[0], message: "Ternak dinonaktifkan." });
  })
);

module.exports = router;
