import os from "node:os";
import process from "node:process";

import { ROOT_DIR } from "@/lib/constants";

export interface SystemSnapshot {
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  hostname: string;
  nodeVersion: string;
  cpus: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  cwd: string;
  homeDir: string;
  timeZone: string;
}

export function getSystemSnapshot(): SystemSnapshot {
  return {
    platform: process.platform,
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    nodeVersion: process.version,
    cpus: os.cpus().length,
    totalMemoryGb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    freeMemoryGb: Number((os.freemem() / 1024 ** 3).toFixed(2)),
    cwd: ROOT_DIR,
    homeDir: os.homedir(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function formatSystemSnapshot(snapshot = getSystemSnapshot()): string {
  return [
    `OS: ${snapshot.platform} ${snapshot.release}`,
    `Arch: ${snapshot.arch}`,
    `Hostname: ${snapshot.hostname}`,
    `Node: ${snapshot.nodeVersion}`,
    `CPUs: ${snapshot.cpus}`,
    `Memory: ${snapshot.freeMemoryGb} GB free / ${snapshot.totalMemoryGb} GB total`,
    `Workspace: ${snapshot.cwd}`,
    `Home: ${snapshot.homeDir}`,
    `Time zone: ${snapshot.timeZone}`,
  ].join("\n");
}
