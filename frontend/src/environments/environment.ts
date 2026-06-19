export const environment = {
  // Same-origin relative API path: the frontend's nginx proxies /api/ to the
  // backend (see frontend/nginx.conf), so this works on localhost, a LAN IP, a
  // tunnel (cloudflared/ngrok), or a real domain — no per-host rebuild, no CORS.
  production: false,
  apiUrl: '/api/v1'
};
