import { renderAdminPage, renderLiveLogPage } from "./ui.js";

function createAdminUiApi({ adminRoot }) {
  function handleAdminPage() {
    return renderAdminPage(adminRoot);
  }

  function handleLiveLogPage() {
    return renderLiveLogPage(adminRoot);
  }

  return {
    handleAdminPage,
    handleLiveLogPage,
  };
}

export { createAdminUiApi };
