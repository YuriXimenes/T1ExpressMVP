import { Anton } from "next/font/google";

// Títulos do layout novo. Servida pelo próprio site (next/font), com alternativas
// definidas em --t1-font-display caso não carregue.
export const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-anton",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});
