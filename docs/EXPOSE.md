# Exposing EspritConnect for others to test

The whole stack runs from `docker compose up`. The frontend's nginx already
proxies `/api/` to the backend, and the SPA now calls the API at the relative
path `/api/v1` — so whatever URL the frontend is reached on, the API works on
the same origin (no CORS setup needed).

Pick the option that fits.

---

## Option 1 — Cloudflare Quick Tunnel (fastest, free, HTTPS, no account)

Best for "send a link so people can try it" without a server.

```bash
# one-time: install cloudflared
#   Debian/Kali:  sudo apt install cloudflared   (or download from Cloudflare)
docker compose up -d                 # make sure the app is running
cloudflared tunnel --url http://localhost:4200
```
It prints a public URL like `https://random-words.trycloudflare.com` — share it.
The SPA + API both work through it (same origin).

Notes:
- The URL changes every time you restart the tunnel (quick tunnels are ephemeral).
  For a stable URL, set up a named tunnel with a Cloudflare account + your domain.
- Your machine must stay on and connected.

## Option 2 — ngrok (similar, needs a free account/token)

```bash
ngrok http 4200
```
Share the `https://….ngrok-free.app` URL it prints.

## Option 3 — Same network (LAN) — colleagues in the same office/Wi-Fi

```bash
hostname -I        # find your LAN IP, e.g. 192.168.1.50
```
Others open `http://192.168.1.50:4200`. (Ports are already published on 0.0.0.0;
allow 4200 in your firewall if needed.)

## Option 4 — A real server (VPS / cloud VM) — most permanent

1. Put the repo on a VM with a public IP, install Docker + Compose.
2. Point a domain's A record at the VM.
3. Run `docker compose up -d --build`.
4. Terminate TLS in front (recommended): add Caddy or Traefik, or an nginx +
   Let's Encrypt, proxying `:443 -> frontend:80`. (Caddy is one line per domain.)
5. Open ports 80/443 in the VM firewall/security group.

---

## What testers should know

- **Logging in:** real sign-up needs SMTP (a 6-digit email code). Unless you've
  configured `MAIL_USERNAME`/`MAIL_PASSWORD` in `.env`, testers should use the
  **seeded demo accounts** — password **`Test@1234`**, e.g.
  `admin@esprit.tn`, `mehdi.jlassi@…` (alumni), `amine.toumi@…` (mentor),
  `david.lemoine@vincit.ai` (recruiter), `sami.bouaziz@…` (student).
  To allow real sign-ups, set the Gmail SMTP vars in `.env` (see `.env.example`).

- **Images:** the seeded photos/banners/covers are bundled in the app, so they
  show everywhere. Files a tester *uploads* (avatar, CV, post media) go to MinIO
  at `STORAGE_PUBLIC_ENDPOINT` (default `http://localhost:9000`), which a remote
  browser can't reach — so their own uploads won't display unless you also expose
  MinIO (see below). Core testing (feed, directory, jobs, events, groups, AI,
  chat) works fully without that.

- **To also support uploaded media remotely:** expose MinIO too (e.g. a second
  tunnel for port 9000, or publish it on the VM) and set
  `STORAGE_PUBLIC_ENDPOINT` in `.env` to that public URL, then
  `docker compose up -d backend`.

---

## Getting a STABLE URL (for a printed QR code)

The quick tunnel (`--url`) gives a new random link every restart. For a fixed
URL you can print, use a **named** tunnel.

### A. Cloudflare named tunnel (recommended; needs a domain on Cloudflare — free plan is fine)
1. Cloudflare **Zero Trust** dashboard → **Networks → Tunnels → Create a tunnel** (choose "Cloudflared").
2. Add a **Public Hostname**: e.g. `app.yourdomain.com` → **Service** `http://frontend:80`.
3. Copy the tunnel **token** and put it in `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token...
   ```
4. Start it with the stack:
   ```bash
   docker compose --profile tunnel up -d
   ```
The container connects to the `frontend` service over the compose network, and
`https://app.yourdomain.com` stays the same forever → safe for a QR code. It
also auto-restarts with the stack.
(No domain yet? A domain is ~a few $/yr; add it to Cloudflare's free plan, then
follow the steps above.)

### B. No domain — ngrok free static domain
ngrok's free plan includes **one reserved domain** that doesn't change:
1. Sign up at ngrok.com, claim your static domain in the dashboard
   (e.g. `your-name.ngrok-free.app`), add your authtoken.
2. ```bash
   ngrok http 4200 --url https://your-name.ngrok-free.app
   ```
Stable URL, but free ngrok shows a one-time "visit site" interstitial.

### C. No domain, no signup hassle — Tailscale Funnel
```bash
# install tailscale, then:
sudo tailscale up
sudo tailscale funnel 4200
```
Gives a stable `https://<machine>.<tailnet>.ts.net` URL (no interstitial, free).

### Make the QR code
```bash
sudo apt install qrencode
qrencode -o espritconnect-qr.png "https://app.yourdomain.com"
```
(or any online QR generator).

> ⚠️ A tunnel from this machine only works while **this machine is on, online,
> and the stack + tunnel are running**. For a QR people scan days later, that's
> fragile — for an always-on link, deploy on a small VPS (Option 4 above) with
> the named tunnel or a domain + Caddy, so it survives your laptop being closed.

## Heads-up (this is a test/demo setup, not hardened prod)

- It ships with **seeded demo accounts** and a known admin password — fine for a
  test, change before any real launch.
- The backend runs with `SPRING_PROFILES_ACTIVE=dev` (verbose SQL logging) and
  dev secrets (`JWT_SECRET`, DB password). For a public/long-lived deployment,
  set strong secrets in `.env` and switch to a prod profile.
- Tokens last 2h (access) / 30 days (refresh) and auto-refresh, so test sessions
  stay logged in.
