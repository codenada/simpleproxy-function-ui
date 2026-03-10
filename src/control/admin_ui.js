import { renderAdminPage, renderAdminPageScript } from "./ui.js";

function createAdminUiApi({ adminRoot }) {
  function handleAdminPage() {
    return renderAdminPage(adminRoot);
  }

  function handleAdminPageScriptAsset() {
    return new Response(renderAdminPageScript(adminRoot), {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return {
    handleAdminPage,
    handleAdminPageScriptAsset,
  };
}

export { createAdminUiApi };
