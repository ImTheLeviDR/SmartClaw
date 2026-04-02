import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "chat",
    "@chat-adapter/discord",
    "@chat-adapter/gchat",
    "@chat-adapter/github",
    "@chat-adapter/linear",
    "@chat-adapter/slack",
    "@chat-adapter/state-memory",
    "@chat-adapter/teams",
    "@chat-adapter/telegram",
  ],
};

export default nextConfig;
