#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require("@ffmpeg-installer/ffmpeg").path;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobePath: string = require("@ffprobe-installer/ffprobe").path;
import { TapdClient } from "./tapd-client.js";
import { loadCredentials, saveCredentials, startBrowserLogin, clearCredentials } from "./auth.js";
import {
  formatWorkspaces,
  formatBugsList,
  formatBugDetail,
  formatBugWorkflow,
} from "./formatters.js";

const client = new TapdClient();

// --- Helper: check auth before API call ---
async function requireAuth(): Promise<string | null> {
  if (!client.isAuthenticated()) {
    const savedCreds = await loadCredentials();
    if (savedCreds) {
      client.setCredentials(savedCreds);
      console.error("Restored saved credentials (valid until " + new Date(savedCreds.expiresAt).toLocaleString() + ")");
    }
  }
  if (!client.isAuthenticated()) {
    return "Not authenticated. Please call the 'tapd-auth' tool first to login via browser.";
  }
  return null;
}

// --- MCP Server ---
const server = new McpServer({
  name: "tapd",
  version: "1.0.0",
});

// Tool: tapd-auth
server.tool(
  "tapd-auth",
  "Login to TAPD via browser. Opens a Chromium window for you to login manually.",
  {},
  async () => {
    if (client.isAuthenticated()) {
      return { content: [{ type: "text", text: "Already authenticated. Use 'tapd-logout' to re-authenticate." }] };
    }
    try {
      const creds = await startBrowserLogin();
      client.setCredentials(creds);
      await saveCredentials(creds);
      return { content: [{ type: "text", text: "Authentication successful! You can now use all TAPD tools." }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Authentication failed: ${err.message}` }] };
    }
  }
);

// Tool: tapd-logout
server.tool(
  "tapd-logout",
  "Clear saved TAPD credentials and logout.",
  {},
  async () => {
    await clearCredentials();
    client.setCredentials(null);
    return { content: [{ type: "text", text: "Logged out. Call 'tapd-auth' to login again." }] };
  }
);

// Tool: list_workspaces
server.tool(
  "list_workspaces",
  "List all TAPD workspaces (projects) the current user has access to",
  {},
  async () => {
    const authErr = await requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    try {
      const res = await client.getUserAndWorkspaces();
      const workspaces = res.data?.my_workspaces?.data || [];
      return { content: [{ type: "text", text: formatWorkspaces(workspaces) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool: get_bugs_list
server.tool(
  "get_bugs_list",
  "Get bug list for a TAPD workspace. Returns bug titles, status, severity, owner, etc.",
  {
    workspace_id: z.string().describe("TAPD workspace ID (from list_workspaces)"),
    page: z.number().optional().describe("Page number (default: 1)"),
    perpage: z.number().optional().describe("Items per page (default: 50, max: 200)"),
    order: z.enum(["asc", "desc"]).optional().describe("Sort order (default: desc)"),
  },
  async ({ workspace_id, page, perpage, order }) => {
    const authErr = await requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    try {
      const res = await client.getBugsList({
        workspace_id,
        page: page || 1,
        perpage: perpage || 50,
        order: order || "desc",
      });
      return { content: [{ type: "text", text: formatBugsList(res.data) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool: get_bug_detail
server.tool(
  "get_bug_detail",
  "Get full detail of a specific bug including description, comments, attachments, and all fields",
  {
    workspace_id: z.string().describe("TAPD workspace ID"),
    bug_id: z.string().describe("Bug ID (full ID like 1159504807001098704)"),
  },
  async ({ workspace_id, bug_id }) => {
    const authErr = await requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    try {
      const res = await client.getBugDetail(workspace_id, bug_id);
      const info = res.data?.get_info_ret?.data;
      if (!info) {
        return { content: [{ type: "text", text: `Bug "${bug_id}" not found.` }] };
      }
      return { content: [{ type: "text", text: formatBugDetail(info) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool: get_bug_workflow
server.tool(
  "get_bug_workflow",
  "Get bug workflow configuration (status map, transitions) for a workspace",
  {
    workspace_id: z.string().describe("TAPD workspace ID"),
  },
  async ({ workspace_id }) => {
    const authErr = await requireAuth();
    if (authErr) return { content: [{ type: "text", text: authErr }] };

    try {
      const res = await client.getWorkspaceConfig(workspace_id);
      return { content: [{ type: "text", text: formatBugWorkflow(res.data) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool: analyze_bug_video
server.tool(
  "analyze_bug_video",
  "Download video attachment from a TAPD bug, extract key frames using ffmpeg, and return them as images for visual analysis. Useful for understanding video-recorded bugs.",
  {
    workspace_id: z.string().describe("TAPD workspace ID"),
    bug_id: z.string().describe("Bug ID (full ID like 1159504807001098704)"),
    max_frames: z.number().optional().describe("Maximum number of frames to extract (default: 8, max: 15)"),
  },
  async ({ workspace_id, bug_id, max_frames }) => {
    const authErr = await requireAuth();
    if (authErr) return { content: [{ type: "text" as const, text: authErr }] };

    const targetFrames = Math.min(max_frames || 8, 15);

    // Verify bundled ffmpeg binary exists
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: bundled ffmpeg binary not found. Try reinstalling: npm install ffmpeg-static",
        }],
      };
    }

    // 1. Get bug detail to find video attachments
    let info: any;
    try {
      const res = await client.getBugDetail(workspace_id, bug_id);
      info = res.data?.get_info_ret?.data;
      if (!info) {
        return { content: [{ type: "text" as const, text: `Bug "${bug_id}" not found.` }] };
      }
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error fetching bug: ${err.message}` }] };
    }

    // 2. Find video attachments
    const attachments = info.attachment_list?.attachments || [];
    const videoAttachments = attachments.filter((att: any) => {
      const ct = (att.content_type || "").toLowerCase();
      const fn = (att.filename || "").toLowerCase();
      return ct.startsWith("video/") ||
        [".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv"].some(ext => fn.endsWith(ext));
    });

    if (videoAttachments.length === 0) {
      const allFiles = attachments.map((a: any) => `  - ${a.filename} (${a.content_type || "?"})`).join("\n");
      return {
        content: [{
          type: "text" as const,
          text: `No video attachments found in bug ${bug_id}.\n\nAll attachments:\n${allFiles || "  (none)"}`,
        }],
      };
    }

    // 3. Process first video attachment
    const video = videoAttachments[0];
    const videoId = video.id || video.attachment_id;
    const videoName = video.filename || "video";

    if (!videoId) {
      return {
        content: [{
          type: "text" as const,
          text: `Video attachment "${videoName}" found but has no downloadable ID. Attachment data: ${JSON.stringify(video, null, 2)}`,
        }],
      };
    }

    // Create temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tapd-video-"));
    const videoPath = path.join(tmpDir, videoName);
    const framesDir = path.join(tmpDir, "frames");
    fs.mkdirSync(framesDir);

    try {
      // 4. Download video
      const downloadUrl = video.download_url || client.getAttachmentDownloadUrl(workspace_id, videoId);
      await client.downloadFile(downloadUrl, videoPath);

      // Verify download
      const stats = fs.statSync(videoPath);
      if (stats.size < 1000) {
        const content = fs.readFileSync(videoPath, "utf-8").substring(0, 500);
        return {
          content: [{
            type: "text" as const,
            text: `Download returned small file (${stats.size} bytes), possibly an error page.\nContent: ${content}\n\nDownload URL: ${downloadUrl}`,
          }],
        };
      }

      // 5. Get video duration and compute smart interval
      let duration = 0;
      try {
        const probeResult = execSync(
          `"${ffprobePath}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
          { encoding: "utf-8" }
        ).trim();
        duration = parseFloat(probeResult) || 0;
      } catch {
        // Duration unknown, will use fallback
      }

      // Smart frame interval: spread targetFrames evenly across the video
      // - Short video (<=5s): first + last + keyframes, minimum 2s interval
      // - Medium video (5-60s): evenly spaced
      // - Long video (>60s): evenly spaced, capped at targetFrames
      let interval: number;
      let frameCount: number;
      if (duration > 0) {
        interval = Math.max(2, Math.ceil(duration / targetFrames));
        frameCount = Math.min(targetFrames, Math.floor(duration / interval) + 1);
      } else {
        // Duration unknown: use conservative 3s interval
        interval = 3;
        frameCount = targetFrames;
      }

      // 6. Extract frames
      const framePattern = path.join(framesDir, "frame_%04d.png");
      execSync(
        `"${ffmpegPath}" -i "${videoPath}" -vf "fps=1/${interval}" -frames:v ${frameCount} -q:v 2 "${framePattern}"`,
        { stdio: "pipe", timeout: 60000 }
      );

      // 7. Read frames and convert to base64
      const frameFiles = fs.readdirSync(framesDir)
        .filter(f => f.endsWith(".png"))
        .sort();

      if (frameFiles.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to extract frames from video "${videoName}". The video might be corrupted or in an unsupported format.`,
          }],
        };
      }

      // Build response with text info + frame images
      const contents: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

      contents.push({
        type: "text" as const,
        text: [
          `Bug: ${info.Bug?.title || bug_id}`,
          `Video: ${videoName} (${Math.round(stats.size / 1024)}KB)`,
          `Duration: ${duration ? duration.toFixed(1) + "s" : "unknown"}`,
          `Frames extracted: ${frameFiles.length} (every ${interval}s, target ${targetFrames})`,
          `\nPlease analyze each frame below to identify the bug behavior:`,
        ].join("\n"),
      });

      for (let i = 0; i < frameFiles.length; i++) {
        const framePath = path.join(framesDir, frameFiles[i]);
        const frameData = fs.readFileSync(framePath).toString("base64");
        const timestamp = i * interval;

        contents.push({
          type: "text" as const,
          text: `\n--- Frame ${i + 1}/${frameFiles.length} (t=${timestamp}s) ---`,
        });
        contents.push({
          type: "image" as const,
          data: frameData,
          mimeType: "image/png",
        });
      }

      return { content: contents };
    } catch (err: any) {
      return {
        content: [{
          type: "text" as const,
          text: `Error processing video: ${err.message}`,
        }],
      };
    } finally {
      // Cleanup temp files
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TAPD MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
