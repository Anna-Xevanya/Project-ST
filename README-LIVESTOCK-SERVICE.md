# Livestock Service (Node.js)

Service pertama untuk Distributed Livestock Management System.

## Fitur pada versi ini

- REST API pengelolaan kandang (CRUD dasar; delete berarti menonaktifkan).
- REST API pengelolaan ternak (CRUD dasar; delete berarti menonaktifkan).
- REST API pencatatan pakan.
- gRPC server `GetAnimalDetails` untuk dipanggil oleh Health Service.
- PostgreSQL sebagai database milik Livestock Service.

> Login/JWT, role-based authorization, Health Service, RabbitMQ, dan Notification Service belum termasuk dalam tahap kode ini.

## 1. Prasyarat

- Node.js 20 atau lebih baru
- npm
- Docker Desktop
- PostgreSQL dan RabbitMQ berjalan melalui Docker Compose proyek utama

Pastikan `docker-compose.yml` proyek utama menjalankan PostgreSQL dengan:
- database: `livestock_db`
- user: `postgres`
- password: `postgres`
- port: `5432`

## 2. Terapkan schema database

Dari folder utama proyek:

```powershell
docker cp .\database\livestock-schema.sql livestock-postgres:/tmp/livestock-schema.sql
docker exec -it livestock-postgres psql -U postgres -d livestock_db -f /tmp/livestock-schema.sql
```

Jika container PostgreSQL belum berjalan, jalankan dulu:

```powershell
docker compose up -d postgres rabbitmq
```

Jika nama container berbeda, cek dengan `docker ps` dan sesuaikan nama `livestock-postgres`.

## 3. Siapkan environment

Masuk ke folder service:

```powershell
cd .\services\livestock-service
Copy-Item .env.example .env
```

Isi `.env` sesuai konfigurasi PostgreSQL lokal. Default yang disediakan:

```env
NODE_ENV=development
PORT=3001
GRPC_BIND=0.0.0.0:50051
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/livestock_db
```

## 4. Instal dependency dan jalankan

```powershell
npm install
npm run dev
```

Jika berhasil, terminal menampilkan:
- PostgreSQL terhubung
- HTTP pada `http://localhost:3001`
- gRPC pada port `50051`

Tes health check:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

## 5. Endpoint REST API

### Barns

| Method | Endpoint | Kegunaan |
|---|---|---|
| GET | `/api/barns` | Daftar kandang |
| POST | `/api/barns` | Tambah kandang |
| GET | `/api/barns/:id` | Detail kandang |
| PATCH | `/api/barns/:id` | Ubah kandang |
| DELETE | `/api/barns/:id` | Nonaktifkan kandang |

Contoh tambah kandang:

```powershell
$barnBody = @{
  barn_name = "Kandang A"
  location = "Jember"
  capacity = 50
} | ConvertTo-Json

$barn = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3001/api/barns" `
  -ContentType "application/json" `
  -Body $barnBody

$barn.data
```

Simpan ID kandang untuk membuat ternak:

```powershell
$barnId = $barn.data.barn_id
```

### Animals

| Method | Endpoint | Kegunaan |
|---|---|---|
| GET | `/api/animals` | Daftar ternak |
| POST | `/api/animals` | Tambah ternak |
| GET | `/api/animals/:id` | Detail ternak |
| PATCH | `/api/animals/:id` | Ubah ternak |
| DELETE | `/api/animals/:id` | Nonaktifkan ternak |

Contoh tambah ternak:

```powershell
$animalBody = @{
  barn_id = $barnId
  tag_code = "SAPI-001"
  species = "Sapi"
  breed = "Limousin"
  sex = "female"
  birth_date = "2024-01-15"
  notes = "Contoh data awal"
} | ConvertTo-Json

$animal = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3001/api/animals" `
  -ContentType "application/json" `
  -Body $animalBody

$animal.data
```

Simpan ID ternak:

```powershell
$animalId = $animal.data.animal_id
```

### Feed records

| Method | Endpoint | Kegunaan |
|---|---|---|
| GET | `/api/feed-records` | Daftar pencatatan pakan |
| POST | `/api/feed-records` | Tambah pencatatan pakan |
| GET | `/api/feed-records/:id` | Detail pencatatan pakan |
| PATCH | `/api/feed-records/:id` | Ubah pencatatan pakan |

Contoh tambah pakan:

```powershell
$feedBody = @{
  animal_id = $animalId
  feed_type = "Rumput"
  quantity = 5
  unit = "kg"
  notes = "Pemberian pakan pagi"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3001/api/feed-records" `
  -ContentType "application/json" `
  -Body $feedBody
```

Filter daftar ternak:

```powershell
Invoke-RestMethod "http://localhost:3001/api/animals?status=active"
```

Filter riwayat pakan:

```powershell
Invoke-RestMethod "http://localhost:3001/api/feed-records?animal_id=$animalId"
```

## 6. Uji gRPC

gRPC server aktif di `localhost:50051`. Kontraknya ada di `proto/livestock.proto`.

Method:
- Service: `livestock.LivestockService`
- RPC: `GetAnimalDetails`
- Request: `animal_id`
- Response: identitas ternak, kandang, dan status.

Health Service Python nantinya akan menjadi client yang memanggil method tersebut.

## 7. Catatan pengembangan

- Jangan menghapus data ternak secara fisik; endpoint DELETE mengubah status menjadi `inactive`.
- Semua query SQL menggunakan parameter untuk mengurangi risiko SQL injection.
- `animal_id` yang dikirim ke service lain adalah ID referensi lintas-service. Health Service tidak boleh membaca tabel Livestock secara langsung.
- Jangan gunakan kredensial contoh untuk deployment publik.
