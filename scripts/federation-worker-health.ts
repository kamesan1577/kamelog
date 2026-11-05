import { workerIsLive } from "../server/federation-worker-liveness.ts";

process.exitCode = workerIsLive() ? 0 : 1;
