import { jwtVerify, errors as joseErrors } from "jose";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class TokenExpiredError extends UnauthorizedError {
  constructor(message = "Token expired") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

export async function requireAuth(headers: Headers) {
  const auth = headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new UnauthorizedError();

  const secret = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as {
      sub: string;
      email?: string;
      name?: string;
    };
  } catch (err: any) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new TokenExpiredError();
    }
    throw new UnauthorizedError();
  }
}
