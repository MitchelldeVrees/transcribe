// lib/requireAuth.ts (illustrative)
import { jwtVerify } from "jose";

export async function requireAuth(headers: Headers) {
  const auth = headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const secret = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret); // consider .issuer, .aud if you set them

  // payload.sub === Google OIDC sub (stable)
  return payload as {
    sub: string;          // stable Google id
    email?: string;
    name?: string;
  };
}
