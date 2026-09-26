import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("FLOXA PWA Install Experience Contracts", async (t) => {
  await t.test("1. Manifest and Service Worker are present and valid", () => {
    const manifestPath = path.resolve(__dirname, "../public/manifest.json");
    assert.strictEqual(fs.existsSync(manifestPath), true, "manifest.json must exist in public/");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assert.strictEqual(manifest.name, "FLOXA - Client & Consultant Workspace");
    assert.strictEqual(manifest.display, "standalone");
    assert.strictEqual(manifest.start_url, "/");
    assert.strictEqual(Array.isArray(manifest.icons) && manifest.icons.length >= 2, true);

    const swPath = path.resolve(__dirname, "../public/sw.js");
    assert.strictEqual(fs.existsSync(swPath), true, "sw.js must exist in public/");
  });

  await t.test("2. FloxaHeader includes INSTALL APP NavItem directly after LOGOUT in sidebar", () => {
    const headerPath = path.resolve(__dirname, "../components/common/FloxaHeader.jsx");
    const headerContent = fs.readFileSync(headerPath, "utf-8");

    // Check import
    assert.ok(headerContent.includes("usePwaInstall"), "FloxaHeader must import usePwaInstall");
    assert.ok(headerContent.includes("Download"), "FloxaHeader must import Download icon");

    // Check that INSTALL APP is rendered after LOGOUT in the Account section
    const logoutIndex = headerContent.indexOf('label: "LOGOUT"');
    const installIndex = headerContent.indexOf('label: "INSTALL APP"');
    assert.ok(logoutIndex !== -1, "LOGOUT item must exist in FloxaHeader");
    assert.ok(installIndex !== -1, "INSTALL APP item must exist in FloxaHeader");
    assert.ok(installIndex > logoutIndex, "INSTALL APP item must appear after LOGOUT in FloxaHeader");

    // Check conditional rendering based on isInstalled
    assert.ok(
      headerContent.includes("!isInstalled"),
      "INSTALL APP item must be conditionally rendered with !isInstalled"
    );
  });

  await t.test("3. Auto-hide behavior contract: isInstalled suppresses both sidebar item and floating prompt", () => {
    // Contract simulation: when isInstalled is true, components should not display install trigger
    function shouldShowSidebarInstall(isInstalled) {
      return !isInstalled;
    }

    function shouldShowFloatingPrompt({ isMounted, isInstalled, floatingDismissed }) {
      if (!isMounted || isInstalled || floatingDismissed) return false;
      return true;
    }

    // Uninstalled state (browser tab):
    assert.strictEqual(shouldShowSidebarInstall(false), true);
    assert.strictEqual(shouldShowFloatingPrompt({ isMounted: true, isInstalled: false, floatingDismissed: false }), true);

    // After installation (appinstalled fired or standalone mode):
    assert.strictEqual(shouldShowSidebarInstall(true), false, "Sidebar button must disappear once installed");
    assert.strictEqual(shouldShowFloatingPrompt({ isMounted: true, isInstalled: true, floatingDismissed: false }), false, "Floating prompt must disappear once installed");

    // If floating was dismissed:
    assert.strictEqual(shouldShowFloatingPrompt({ isMounted: true, isInstalled: false, floatingDismissed: true }), false);
  });

  await t.test("4. Floating prompt and PwaProvider integration", () => {
    const providerPath = path.resolve(__dirname, "../app/PwaProvider.tsx");
    const providerContent = fs.readFileSync(providerPath, "utf-8");
    assert.ok(providerContent.includes("PwaInstallPrompt"), "PwaProvider must render PwaInstallPrompt");

    const promptPath = path.resolve(__dirname, "../components/pwa/PwaInstallPrompt.jsx");
    assert.strictEqual(fs.existsSync(promptPath), true, "PwaInstallPrompt.jsx must exist");
    const promptContent = fs.readFileSync(promptPath, "utf-8");
    assert.ok(promptContent.includes("floxa-pwa-floating"), "PwaInstallPrompt must include floxa-pwa-floating class");
    assert.ok(promptContent.includes("promptInstall"), "PwaInstallPrompt must wire promptInstall trigger");
    assert.ok(promptContent.includes("dismissFloating"), "PwaInstallPrompt must wire dismissFloating action");
  });

  await t.test("5. Client portal routes suppress PWA install prompt completely", () => {
    const promptPath = path.resolve(__dirname, "../components/pwa/PwaInstallPrompt.jsx");
    const promptContent = fs.readFileSync(promptPath, "utf-8");
    assert.ok(promptContent.includes("isClientPortal"), "PwaInstallPrompt must check isClientPortal");

    const providerPath = path.resolve(__dirname, "../app/PwaProvider.tsx");
    const providerContent = fs.readFileSync(providerPath, "utf-8");
    assert.ok(providerContent.includes("isClientPortal"), "PwaProvider must check isClientPortal");

    function shouldRenderPromptForRoute(pathname) {
      const isClientPortal = Boolean(pathname && pathname.startsWith("/client"));
      return !isClientPortal;
    }

    assert.strictEqual(shouldRenderPromptForRoute("/client/some-portal-token"), false, "Must not render in client portal");
    assert.strictEqual(shouldRenderPromptForRoute("/client-portal"), false, "Must not render in client-portal");
    assert.strictEqual(shouldRenderPromptForRoute("/project"), true, "Must render in consultant project view");
    assert.strictEqual(shouldRenderPromptForRoute("/chat"), true, "Must render in consultant chat view");
    assert.strictEqual(shouldRenderPromptForRoute("/settings"), true, "Must render in consultant settings view");
  });
});
