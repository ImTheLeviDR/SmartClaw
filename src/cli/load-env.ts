import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import dotenv from "dotenv";

const rootDir = process.cwd();
const envFiles = [".env.local", ".env"];

for (const fileName of envFiles) {
  const filePath = path.join(rootDir, fileName);

  if (!existsSync(filePath)) {
    continue;
  }

  dotenv.config({
    path: filePath,
    override: false,
  });
}
