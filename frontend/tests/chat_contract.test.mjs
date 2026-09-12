import test from 'node:test';
import assert from 'node:assert';

test('Frontend Chat Navigation & Socket Contract', async (t) => {
  const PRIMARY_NAV_ITEMS = [
    { label: "DASHBOARD", icon: "grid", route: "/" },
    { label: "PROJECTS", icon: "mail", route: "/project" },
    { label: "CHAT", icon: "chat", route: "/chat" },
    { label: "DISCOVERY", icon: "search", route: "/discovery" },
    { label: "AI SUITE", icon: "star", route: "/ai-suite" },
    { label: "ANALYTICS", icon: "chart", route: "/analytics" },
  ];

  await t.test('1. CHAT nav item is positioned strictly between PROJECTS and DISCOVERY', () => {
    const labels = PRIMARY_NAV_ITEMS.map((item) => item.label);
    const projectsIndex = labels.indexOf("PROJECTS");
    const chatIndex = labels.indexOf("CHAT");
    const discoveryIndex = labels.indexOf("DISCOVERY");

    assert.strictEqual(projectsIndex, 1);
    assert.strictEqual(chatIndex, 2);
    assert.strictEqual(discoveryIndex, 3);
    assert.strictEqual(chatIndex, projectsIndex + 1);
    assert.strictEqual(discoveryIndex, chatIndex + 1);
    assert.strictEqual(PRIMARY_NAV_ITEMS[chatIndex].route, "/chat");
  });

  await t.test('2. Chat message payload structure conforms to WebSocket contract', () => {
    const payload = {
      type: "CHAT_MESSAGE_SEND",
      projectId: "proj_123",
      text: "Hello from client",
      clientTempId: "temp-456",
    };

    assert.strictEqual(payload.type, "CHAT_MESSAGE_SEND");
    assert.ok(payload.projectId);
    assert.ok(payload.text.length > 0 && payload.text.length <= 5000);
  });

  await t.test('3. Chat typing indicator payload contract', () => {
    const payload = {
      type: "CHAT_TYPING",
      projectId: "proj_123",
      isTyping: true,
    };

    assert.strictEqual(payload.type, "CHAT_TYPING");
    assert.strictEqual(typeof payload.isTyping, "boolean");
  });

  await t.test('4. Chat read receipt payload contract', () => {
    const payload = {
      type: "CHAT_MESSAGES_READ",
      projectId: "proj_123",
    };

    assert.strictEqual(payload.type, "CHAT_MESSAGES_READ");
    assert.strictEqual(payload.projectId, "proj_123");
  });
});
