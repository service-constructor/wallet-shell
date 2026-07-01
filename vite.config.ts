import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The cabinet SPA stays same-origin via a proxy to its own BFF:
//   /api/* -> the cabinet BFF (auth-backed session, accounts, pay)
// The BFF holds the user's JWT in an httpOnly cookie so the SPA never touches
// the token directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    proxy: {
      "/api": {
        target: "http://localhost:4200",
        changeOrigin: true,
      },
    },
  },
});
