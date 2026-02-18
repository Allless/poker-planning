import { defineConfig } from "vite";
import { resolve } from "path";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/poker-planning",
  root: "src",
  plugins: [preact()],
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        room: resolve(__dirname, "src/room.html"),
        "404": resolve(__dirname, "src/404.html"),
      },
    },
  },
  test: {
    root: ".",
  },
});
