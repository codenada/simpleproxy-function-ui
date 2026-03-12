import {
  renderAdminPage,
  renderLiveLogPage,
  renderReactAdminPage,
  renderReactRuntimeAsset,
  renderReactDomRuntimeAsset,
} from "./ui.js";

function createAdminUiApi({ adminRoot }) {
  function handleAdminPage() {
    return renderAdminPage(adminRoot);
  }

  function handleLiveLogPage() {
    return renderLiveLogPage(adminRoot);
  }

  function handleReactAdminPage(loginRoot = "/_login") {
    return renderReactAdminPage({ adminApiRoot: adminRoot, loginRoot });
  }

  function handleReactRuntimeAsset() {
    return renderReactRuntimeAsset();
  }

  function handleReactDomRuntimeAsset() {
    return renderReactDomRuntimeAsset();
  }

  return {
    handleAdminPage,
    handleLiveLogPage,
    handleReactAdminPage,
    handleReactRuntimeAsset,
    handleReactDomRuntimeAsset,
  };
}

export { createAdminUiApi };
