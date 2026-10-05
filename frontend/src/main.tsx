import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { getRouter } from "./router";
import { AppearanceProvider } from "./components/appearance-provider";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se encontro el contenedor principal de la app desktop.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppearanceProvider>
      <RouterProvider router={getRouter()} />
    </AppearanceProvider>
  </StrictMode>,
);
