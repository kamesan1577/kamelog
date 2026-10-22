import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertVideo } from "../../server/media.mjs";

test("video probing rejects XML manifests before the DASH parser reads them", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-format-"));
  const originalPath = process.env.PATH;
  const originalProbe = process.env.KAMELOG_TEST_REAL_FFPROBE;
  const originalErrors = process.env.KAMELOG_TEST_PROBE_ERRORS;
  try {
    const realProbe = execFileSync("sh", ["-c", "command -v ffprobe"], {
      encoding: "utf8",
    }).trim();
    const errors = join(root, "probe-errors.txt");
    await writeFile(
      join(root, "ffprobe"),
      '#!/bin/sh\nexec "$KAMELOG_TEST_REAL_FFPROBE" "$@" 2>"$KAMELOG_TEST_PROBE_ERRORS"\n',
      { mode: 0o700 },
    );
    process.env.KAMELOG_TEST_REAL_FFPROBE = realProbe;
    process.env.KAMELOG_TEST_PROBE_ERRORS = errors;
    process.env.PATH = `${root}:${originalPath}`;
    const xml = Buffer.from(
      '<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT2S" minBufferTime="PT1S"><Period duration="PT2S"></Period></MPD>',
    );
    await assert.rejects(
      convertVideo(
        {
          directory: root,
          save() {
            throw new Error("must not store XML");
          },
        },
        xml,
        2,
      ),
      /Invalid or unsupported media/,
    );
    assert.match(await readFile(errors, "utf8"), /not on whitelist/i);
  } finally {
    for (const [name, value] of [
      ["PATH", originalPath],
      ["KAMELOG_TEST_REAL_FFPROBE", originalProbe],
      ["KAMELOG_TEST_PROBE_ERRORS", originalErrors],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
