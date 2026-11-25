-- Jalankan pada database livestock_db.
-- PostgreSQL 13+ menyediakan gen_random_uuid() secara bawaan.

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(60) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('manager', 'barn_staff', 'veterinarian', 'feed_staff')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barns (
    barn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barn_name VARCHAR(120) NOT NULL,
    location TEXT,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS animals (
    animal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barn_id UUID NOT NULL REFERENCES barns(barn_id),
    tag_code VARCHAR(60) NOT NULL UNIQUE,
    species VARCHAR(80) NOT NULL,
    breed VARCHAR(100),
    sex VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (sex IN ('male', 'female', 'unknown')),
    birth_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'sold', 'deceased')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_records (
    feed_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id UUID NOT NULL REFERENCES animals(animal_id),
    recorded_by UUID REFERENCES users(user_id),
    feed_type VARCHAR(120) NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL,
    feeding_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_animals_barn_id ON animals(barn_id);
CREATE INDEX IF NOT EXISTS idx_animals_status ON animals(status);
CREATE INDEX IF NOT EXISTS idx_feed_records_animal_id ON feed_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_feed_records_feeding_date ON feed_records(feeding_date DESC);
