import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Controle de Presença - IASD Calçada",
    short_name: "IASD Calçada",
    description: "Controle de cultos, presenças, cadastros e acompanhamentos.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#fdf8f8",
    theme_color: "#8f0037",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
