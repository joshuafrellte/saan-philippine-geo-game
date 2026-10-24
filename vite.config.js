import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "geojson",
      enforce: "pre",
      transform(code, id) {
        const file = id.split("?")[0];
        if (!file.endsWith(".geojson")) return null;
        return { code: `export default ${code.trim()}\n`, map: { mappings: "" } };
      },
    },
  ],
  test: {
    environment: "node",
  },
});
