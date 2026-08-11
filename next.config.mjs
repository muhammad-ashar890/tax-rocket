/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfkit"],
    // Tax documents can be up to 10 MB; keep a small margin above the
    // application-level upload limit in app/actions/documents.ts.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
