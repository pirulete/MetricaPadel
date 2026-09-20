import { handlers } from "@/auth";

// Requerido porque Auth.js usa crypto de Node.js
export const runtime = "nodejs";

export const { GET, POST } = handlers;
