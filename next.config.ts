import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-tenant CRM data rendered at request time. Cache Components is left off on
  // purpose so no school's data is ever prerendered or cached across tenants.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["embedded-postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // The lead form at /embed/* is meant to be framed by schools' websites; nothing else is.
        source: "/((?!embed/).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        // Tenant pages and API responses must not be stored by browsers or proxies.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
