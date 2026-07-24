import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@bills/shared",
    "@bills/db",
    "@bills/channel",
    "@bills/category-packs",
    "@bills/llm",
    "@bills/pipeline",
  ],
  // Node runtime everywhere (crypto, postgres); no edge runtime routes.
  serverExternalPackages: ["postgres"],
  // Workspace packages use NodeNext ".js" import specifiers on TS sources.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;
