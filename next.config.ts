import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-leaflet inicializa o mapa de forma imperativa e não lida bem com o
  // duplo mount/unmount do Strict Mode em dev (erro "Map container is being
  // reused by another instance"). Só afeta o ambiente de desenvolvimento —
  // Strict Mode não roda em builds de produção de qualquer forma.
  reactStrictMode: false,
};

export default nextConfig;
