import { browser } from "wxt/browser";
import { ProfileExporterPanel } from "../../src/components/profile-exporter-panel";
import { useProfileExporterController } from "../../src/use-profile-exporter-controller";

export function PopupApp() {
  const controller = useProfileExporterController();

  async function openSettings() {
    await browser.tabs.create({ url: browser.runtime.getURL("/options.html") });
  }

  return (
    <ProfileExporterPanel
      busy={controller.busy}
      extractionError={controller.extractionError}
      extractionStatus={controller.extractionStatus}
      fallbackText={controller.fallbackText}
      onClear={() => void controller.clearLocal()}
      onDeliver={() => void controller.deliverCurrentProfile()}
      onDeliveryModeChange={(deliveryMode) => void controller.updateDeliveryMode(deliveryMode)}
      onExtract={() => void controller.extract()}
      onOpenSettings={() => void openSettings()}
      onToggleFormat={(format) => void controller.toggleFormat(format)}
      profile={controller.profile}
      readiness={controller.readiness}
      settings={controller.settings}
      surface="popup"
    />
  );
}
