#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v3";
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
