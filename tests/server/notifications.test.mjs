import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import {
  clearNotificationWebhook,
  notificationSettings,
  reportNotification,
  updateNotificationSettings,
  validateWebhookUrl,
} from "../../server/notifications.mjs";
import { inferenceSecretBox } from "../../server/inference/secret.mjs";

const encryptionKey = randomBytes(32).toString("base64url");
const fakeUrl = "https://alerts.example.net/ingest";

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-notification-"));
  const store = new Store(directory);
  try {
    await run(store, directory);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("notification configuration is disabled by default and webhook stays encrypted", async () => {
  await withStore(async (store, directory) => {
    assert.deepEqual(notificationSettings(store, encryptionKey), {
      enabled: false,
      provider: "discord",
      minimumLevel: "error",
      services: ["api", "activitypub", "process"],
      webhookConfigured: false,
      encryptionAvailable: true,
    });
    const settings = updateNotificationSettings(store, encryptionKey, {
      enabled: true,
      provider: "generic",
      minimumLevel: "warn",
      services: ["api", "process"],
      webhookUrl: fakeUrl,
    });
    assert.equal(settings.webhookConfigured, true);
    assert.equal(JSON.stringify(settings).includes(fakeUrl), false);
    const encrypted = store.get("settings", "notifications:webhook");
    assert.ok(encrypted);
    assert.equal(encrypted.provider, "generic");
    assert.doesNotMatch(encrypted.encrypted, /alerts\.example\.net/);
    assert.equal(inferenceSecretBox(encryptionKey).decrypt(encrypted.encrypted), fakeUrl);
    store.close();
    const reopened = new Store(directory);
    try {
      assert.equal(notificationSettings(reopened, encryptionKey).enabled, true);
      assert.equal(notificationSettings(reopened, encryptionKey).minimumLevel, "warn");
    } finally {
      reopened.close();
    }
  });
});

test("invalid destination URLs are rejected and never change stored configuration", async () => {
  await withStore(async (store) => {
    const urls = [
      "http://alerts.example.net/hook",
      "https://127.0.0.1/hook",
      "https://localhost/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://name:secret@alerts.example.net/hook",
      "https://alerts.example.net:8443/hook",
      "https://alerts.example.net/hook#fragment",
    ];
    for (const url of urls) {
      assert.throws(() => validateWebhookUrl(url, "generic"), TypeError);
    }
    assert.throws(() => validateWebhookUrl(fakeUrl, "discord"), TypeError);
    assert.throws(() => validateWebhookUrl(fakeUrl, "slack"), TypeError);
    assert.throws(() => updateNotificationSettings(store, "", {
      provider: "generic", webhookUrl: fakeUrl,
    }), TypeError);
    assert.throws(() => updateNotificationSettings(store, encryptionKey, {
      enabled: true,
    }), TypeError);
    assert.equal(store.get("settings", "notifications:webhook"), null);
    assert.equal(notificationSettings(store, encryptionKey).enabled, false);
  });
});

test("threshold, service and enabled filters govern sanitized delivery", async () => {
  await withStore(async (store) => {
    const sent = [];
    const send = async (url, payload) => {
      sent.push({ url, payload });
      return true;
    };
    const event = { service: "api", level: "error", code: "unexpected_failure",
      message: "do not publish raw exception or request secrets" };
    assert.equal(await reportNotification(store, encryptionKey, event, { send }), false);
    updateNotificationSettings(store, encryptionKey, {
      enabled: true,
      provider: "generic",
      minimumLevel: "critical",
      services: ["process"],
      webhookUrl: fakeUrl,
    });
    assert.equal(await reportNotification(store, encryptionKey, event, { send }), false);
    updateNotificationSettings(store, encryptionKey, {
      minimumLevel: "error", services: ["api"],
    });
    assert.equal(await reportNotification(store, encryptionKey, event, { send }), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, fakeUrl);
    assert.equal(sent[0].payload.service, "api");
    assert.equal(sent[0].payload.code, "unexpected_failure");
    assert.equal(JSON.stringify(sent).includes(event.message), false);
    assert.equal(await reportNotification(store, encryptionKey, event, { send }), false);
    updateNotificationSettings(store, encryptionKey, { enabled: false });
    assert.equal(await reportNotification(store, encryptionKey, event, { send }), false);
  });
});

test("failed webhook delivery is isolated and clearing it disables notifications", async () => {
  await withStore(async (store) => {
    updateNotificationSettings(store, encryptionKey, {
      enabled: true, provider: "generic", webhookUrl: fakeUrl,
    });
    const sent = await reportNotification(store, encryptionKey,
      { service: "activitypub", level: "critical", code: "delivery_failure" },
      { send: async () => { throw new Error("secret response from receiver"); } });
    assert.equal(sent, false);
    const cleared = clearNotificationWebhook(store, encryptionKey);
    assert.equal(cleared.enabled, false);
    assert.equal(cleared.webhookConfigured, false);
    assert.equal(store.get("settings", "notifications:webhook"), null);
  });
});
