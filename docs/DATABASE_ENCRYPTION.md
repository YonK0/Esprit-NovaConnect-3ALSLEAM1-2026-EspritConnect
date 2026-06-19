# Database encryption at rest

Postgres can't transparently encrypt its own files, so we encrypt the **storage**
the database writes to. The app/compose is unchanged except that the Postgres
data directory can be pointed at an encrypted mount via `PGDATA_DIR`.

There are two ways to get encryption at rest. Pick one.

---

## Option A — Encrypted volume just for the database (LUKS loopback file)

Self-contained; encrypts only the Postgres data. Good for a dev box / demo.

### 1. Create and open a LUKS-encrypted container (one time)
```bash
# 2 GB encrypted file (grow as needed)
sudo dd if=/dev/zero of=/opt/espritconnect/pgdata.luks bs=1M count=2048
sudo cryptsetup luksFormat /opt/espritconnect/pgdata.luks      # choose a strong passphrase
sudo cryptsetup luksOpen   /opt/espritconnect/pgdata.luks pgcrypt
sudo mkfs.ext4 /dev/mapper/pgcrypt
sudo mkdir -p /mnt/pgdata-enc
sudo mount /dev/mapper/pgcrypt /mnt/pgdata-enc
sudo chown 999:999 /mnt/pgdata-enc      # postgres uid/gid in the official image
```

### 2. Point Postgres at it
In `.env` (next to `docker-compose.yml`):
```
PGDATA_DIR=/mnt/pgdata-enc
```
Then (fresh DB — migrations re-run automatically):
```bash
docker compose up -d
```

### 3. After every reboot (the device must be unlocked before Docker starts)
```bash
sudo cryptsetup luksOpen /opt/espritconnect/pgdata.luks pgcrypt
sudo mount /dev/mapper/pgcrypt /mnt/pgdata-enc
docker compose up -d
```
> Tip: automate with `/etc/crypttab` + `/etc/fstab` (with a keyfile) if you want it
> to mount at boot. Otherwise it stays encrypted/locked until you unlock it.

### Verify it's encrypted
```bash
# locked (no passphrase) → unreadable:
sudo cryptsetup luksClose pgcrypt
sudo strings /opt/espritconnect/pgdata.luks | grep -i espritconnect   # → nothing
```

---

## Option B — Encrypt the whole Docker data root (simplest conceptually)

Encrypts **everything** Docker stores (all volumes, including Postgres), no
per-service config. Do this on a machine where you control the disk:

1. Put `/var/lib/docker` on a LUKS-encrypted partition/disk (or enable full-disk
   encryption when installing the OS).
2. Keep the default named volume (`pgdata`) — nothing in the repo changes.

This is the most robust ("disk is encrypted"), but it's an OS/provisioning task,
not something the repo can do.

---

---

## Encrypting the sensitive files (verification IDs & face images)

These files live in **MinIO**, not Postgres. We encrypt them at rest with
**SSE-S3** (server-side encryption). It's transparent — the admin "View chain"
and presigned downloads keep working; only the bytes on disk are ciphertext.

### Enable it
1. Generate a master key and add it to `.env`:
   ```bash
   echo "MINIO_KMS_SECRET_KEY=espritconnect-key:$(openssl rand -base64 32)" >> .env
   ```
2. Recreate MinIO + backend:
   ```bash
   docker compose up -d minio backend
   ```
   On startup the backend turns on **default SSE-S3** for the `verification`
   bucket (`StorageService.enableServerSideEncryption`), so every new ID
   document / face frame is encrypted. The backend log shows
   `SSE-S3 default encryption enabled on bucket 'verification'`.

> Encryption applies to **newly uploaded** objects. Files uploaded before you
> enabled it stay plaintext — re-run those verifications (or wipe the MinIO
> volume) if you need everything encrypted.

### Passwords
Already stored **bcrypt-hashed** (one-way) — no extra encryption needed.

### Other sensitive DB columns (optional)
The biometric `face_embedding` and OCR-extracted names are good candidates for
column-level AES (JPA `AttributeConverter`). Not enabled yet — ask if you want it.
Note: columns used in queries (email, headline, city) can't be encrypted without
breaking search/login.

---

## Notes
- Passwords are already stored **bcrypt-hashed** (not reversible), independent of this.
- This is encryption **at rest** (disk). For encryption **in transit** (app ↔ DB),
  add `?sslmode=require` to `DB_URL` and enable SSL on Postgres — ask and we'll wire it.
- The default (no `PGDATA_DIR`) keeps the portable named volume so teammates who
  don't need encryption are unaffected.
