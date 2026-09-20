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

test("notification settings persist with an encrypted destination", async () => {
  await withStore(async (store, directory) => {
    assert.equal(notificationSettings(store, encryptionKey).enabled, false);
    assert.equal(
      notificationSettings(store, encryptionKey).webhookConfigured,
      false,
    );
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
    assert.equal(encrypted.provider, "generic");
    assert.doesNotMatch(encrypted.encrypted, /alerts\.example\.net/);
    assert.equal(
      inferenceSecretBox(encryptionKey).decrypt(encrypted.encrypted),
      fakeUrl,
    );
    const reopened = new Store(directory);
    try {
      assert.equal(notificationSettings(reopened, encryptionKey).enabled, true);
      assert.equal(
        notificationSettings(reopened, encryptionKey).minimumLevel,
        "warn",
      );
    } finally {
      reopened.close();
    }
  });
});

test("unsafe destination URLs and missing keys are rejected without changes", async () => {
  await withStore(async (store) => {
    for (const url of [
      "http://alerts.example.net/hook",
      "https://127.0.0.1/hook",
      "https://localhost/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://name:secret@alerts.example.net/hook",
      "https://alerts.example.net:8443/hook",
      "https://alerts.example.net/hook#fragment",
    ]) {
      assert.throws(() => validateWebhookUrl(url, "generic"), TypeError);
    }
    assert.throws(() => validateWebhookUrl(fakeUrl, "discord"), TypeError);
    assert.throws(() => validateWebhookUrl(fakeUrl, "slack"), TypeError);
    assert.throws(
      () =>
        updateNotificationSettings(store, "", {
          provider: "generic",
          webhookUrl: fakeUrl,
        }),
      TypeError,
    );
    assert.throws(
      () => updateNotificationSettings(store, encryptionKey, { enabled: true }),
      TypeError,
    );
    assert.equal(store.get("settings", "notifications:webhook"), null);
    assert.equal(notificationSettings(store, encryptionKey).enabled, false);
  });
});

test("level and service filters deliver only safe messages and deduplicate", async () => {
  await withStore(async (store) => {
    const sent = [];
    const send = async (url, payload) => {
      sent.push({ url, payload });
      return true;
    };
    const event = {
      service: "api",
      level: "error",
      code: "unexpected_failure",
      message: "never publish arbitrary exception and request secrets",
    };
    assert.equal(
      await reportNotification(store, encryptionKey, event, { send }),
      false,
    );
    updateNotificationSettings(store, encryptionKey, {
      enabled: true,
      provider: "generic",
      minimumLevel: "critical",
      services: ["process"],
      webhookUrl: fakeUrl,
    });
    assert.equal(
      await reportNotification(store, encryptionKey, event, { send }),
      false,
    );
    updateNotificationSettings(store, encryptionKey, {
      minimumLevel: "error",
      services: ["api"],
    });
    assert.equal(
      await reportNotification(store, encryptionKey, event, { send }),
      true,
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, fakeUrl);
    assert.equal(sent[0].payload.service, "api");
    assert.equal(JSON.stringify(sent).includes(event.message), false);
    assert.equal(
      await reportNotification(store, encryptionKey, event, { send }),
      false,
    );
    updateNotificationSettings(store, encryptionKey, { enabled: false });
    assert.equal(
      await reportNotification(store, encryptionKey, event, { send }),
      false,
    );
  });
});

test("notification delivery errors are isolated and deleting a webhook disables alerts", async () => {
  await withStore(async (store) => {
    updateNotificationSettings(store, encryptionKey, {
      enabled: true,
      provider: "generic",
      webhookUrl: fakeUrl,
    });
    const delivered = await reportNotification(
      store,
      encryptionKey,
      { service: "activitypub", level: "critical", code: "delivery_failure" },
      {
        send: async () => {
          throw new Error("private remote response");
        },
      },
    );
    assert.equal(delivered, false);
    const cleared = clearNotificationWebhook(store, encryptionKey);
    assert.equal(cleared.enabled, false);
    assert.equal(cleared.webhookConfigured, false);
    assert.equal(store.get("settings", "notifications:webhook"), null);
  });
});

test("test notifications return only approved failure reasons", async () => {
  await withStore(async (store) => {
    const event = { service: "api", level: "info", code: "test" };
    const reasons = [];
    const options = {
      force: true,
      onFailure: (reason) => reasons.push(reason),
    };
    assert.equal(
      await reportNotification(store, encryptionKey, event, options),
      false,
    );
    assert.deepEqual(reasons, ["not_configured"]);
    updateNotificationSettings(store, encryptionKey, {
      provider: "generic",
      webhookUrl: fakeUrl,
    });
    assert.equal(
      await reportNotification(
        store,
        randomBytes(32).toString("base64url"),
        event,
        options,
      ),
      false,
    );
    assert.equal(reasons.at(-1), "credential_unreadable");
    assert.equal(
      await reportNotification(store, encryptionKey, event, {
        ...options,
        send: async () => {
          throw Object.assign(new Error("private body and webhook URL"), {
            notificationReason: "remote_not_found",
          });
        },
      }),
      false,
    );
    assert.equal(reasons.at(-1), "remote_not_found");
    assert.equal(
      await reportNotification(store, encryptionKey, event, {
        ...options,
        send: async () => {
          throw Object.assign(new Error("private body and webhook URL"), {
            notificationReason: "private body and webhook URL",
          });
        },
      }),
      false,
    );
    assert.equal(reasons.at(-1), "network_failed");
    assert.equal(JSON.stringify(reasons).includes(fakeUrl), false);
  });
});
