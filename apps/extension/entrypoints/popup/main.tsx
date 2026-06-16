import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "../../src/styles.css";
import { PopupApp } from "./popup-app";

const client = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <PopupApp />
      <Toaster position="top-center" />
    </QueryClientProvider>
  </StrictMode>
);
