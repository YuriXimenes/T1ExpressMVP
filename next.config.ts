import type { NextConfig } from "next";

// Logos de loja enviados pelo admin ficam no bucket público `store-logos` do
// Supabase; o next/image só exibe imagem externa de origem liberada aqui.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseUrl
      ? [
          new URL(
            `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/store-logos/**`,
          ),
        ]
      : [],
  },
  // react-leaflet inicializa o mapa de forma imperativa e não lida bem com o
  // duplo mount/unmount do Strict Mode em dev (erro "Map container is being
  // reused by another instance"). Só afeta o ambiente de desenvolvimento —
  // Strict Mode não roda em builds de produção de qualquer forma.
  reactStrictMode: false,
};

export default nextConfig;
