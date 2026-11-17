import { next } from "@vercel/functions";

export const config = { matcher: ["/", "/api/subtitles", "/api/subtitles/:path*", "/api/upload-token"] };

function equal(a, b) {
  if (a.length !== b.length) return false;
  let out = 0; for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
export function middleware(request) {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASSWORD || "";
  const auth = request.headers.get("authorization") || "";
  const match = /^Basic\s+(.+)$/i.exec(auth);
  let valid = false;
  if (match && pass.length >= 16) {
    try {
      const decoded = atob(match[1]);
      const i = decoded.indexOf(":");
      valid = i >= 0 && equal(decoded.slice(0, i), user) && equal(decoded.slice(i + 1), pass);
    } catch {}
  }
  if (valid) return next();
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PGS Subtitle Library", charset="UTF-8"', "Cache-Control": "no-store" }
  });
}
