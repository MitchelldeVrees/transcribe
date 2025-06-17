import { clerkMiddleware } from "@clerk/nextjs/server";

export const middleware = clerkMiddleware(); // ✅ dit is correct

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)", // alles behalve statische bestanden
    "/",                          // home route
    "/api/(.*)",                  // api routes
    "/transcripts/(.*)",          // jouw pagina's
  ],
};
