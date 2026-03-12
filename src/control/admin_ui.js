import { renderAdminPage, renderLiveLogPage, renderReactAdminPage } from "./ui.js";

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

  return {
    handleAdminPage,
    handleLiveLogPage,
    handleReactAdminPage,
  };
}

export { createAdminUiApi };
