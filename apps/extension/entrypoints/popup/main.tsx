const rootElement = requireRootElement();

requestAnimationFrame(() => {
  void bootPopup().catch(() => {
    const status = rootElement.querySelector(".popup-boot__status span:last-child");
    const copy = rootElement.querySelector(".popup-boot__copy");
    if (status) status.textContent = "Still loading";
    if (copy) copy.textContent = "Reopen the popup if this does not finish.";
  });
});

async function bootPopup(): Promise<void> {
  const [react, reactDom, , module] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("../../src/styles.css"),
    import("./popup-app")
  ]);
  const { createElement, StrictMode } = react;
  const { createRoot } = reactDom;
  const { PopupApp } = module;

  createRoot(rootElement).render(createElement(StrictMode, null, createElement(PopupApp)));
}

function requireRootElement(): HTMLElement {
  const element = document.getElementById("root");
  if (!element) throw new Error("Popup root element missing");
  return element;
}
