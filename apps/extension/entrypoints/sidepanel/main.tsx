import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ProfileExporterPanel } from "../../src/components/profile-exporter-panel";
import "../../src/styles.css";
import { useProfileExporterController } from "../../src/use-profile-exporter-controller";

function SidePanelApp() {
  const controller = useProfileExporterController();

  return (
    <>
      <ProfileExporterPanel
        busy={controller.busy}
        extractionError={controller.extractionError}
        extractionStatus={controller.extractionStatus}
        fallbackText={controller.fallbackText}
        onClear={() => void controller.clearLocal()}
        onDeliver={() => void controller.deliverCurrentProfile()}
        onDeliveryModeChange={(deliveryMode) => void controller.updateDeliveryMode(deliveryMode)}
        onExtract={() => void controller.extract()}
        onRefresh={() =>
          void controller.extract({ preferCachedProfile: false, refreshPolicy: "force-refresh" })
        }
        onToggleFormat={(format) => void controller.toggleFormat(format)}
        profile={controller.profile}
        readiness={controller.readiness}
        settings={controller.settings}
        surface="sidepanel"
      />
      <Toaster position="top-center" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>
);
