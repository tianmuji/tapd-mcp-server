/** Format workspace/project list */
export function formatWorkspaces(workspaces: any[]): string {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return "No workspaces found.";

  const lines: string[] = ["My Workspaces:\n"];
  for (const ws of workspaces) {
    const status = ws.status === "normal" ? "" : ` [${ws.status}]`;
    lines.push(`- ${ws.project_name} (workspace_id: ${ws.id})${status}`);
    if (ws.category) lines.push(`  Category: ${ws.category}`);
    if (ws.creator) lines.push(`  Creator: ${ws.creator}`);
  }
  return lines.join("\n");
}

/** Format bug list */
export function formatBugsList(data: any): string {
  const bugsList = data?.bugs_list_ret?.data?.bugs_list;
  const totalCount = data?.bugs_list_ret?.data?.total_count;
  const page = data?.bugs_list_ret?.data?.page;
  const perpage = data?.bugs_list_ret?.data?.perpage;

  if (!Array.isArray(bugsList) || bugsList.length === 0) {
    return "No bugs found.";
  }

  const lines: string[] = [];
  lines.push(`Bug List (${totalCount || bugsList.length} total, page ${page || 1}, ${perpage || 50}/page)\n`);

  for (const item of bugsList) {
    const bug = item.Bug;
    if (!bug) continue;

    const severityIcon = getSeverityIcon(bug.severity);
    const statusLabel = bug.status_alias || bug.status || "unknown";

    lines.push(`${severityIcon} ${bug.title}`);
    lines.push(`  ID: ${bug.id} (short: ${bug.short_id || "-"})`);
    lines.push(`  Status: ${statusLabel} | Severity: ${bug.severity || "-"}`);
    lines.push(`  Reporter: ${bug.reporter || "-"} | Owner: ${bug.current_owner || bug.de || "-"}`);
    lines.push(`  Created: ${bug.created || "-"}`);
    if (bug.version_report) lines.push(`  Version: ${bug.version_report}`);
    if (bug.resolution && bug.resolution !== "--") lines.push(`  Resolution: ${bug.resolution}`);

    // Related story
    if (item.BugStoryRelation && item.BugStoryRelation.length > 0) {
      if (bug.BugStoryRelation_story_name) {
        lines.push(`  Related Story: ${bug.BugStoryRelation_story_name}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/** Format a single bug detail (from common_get_info API) */
export function formatBugDetail(data: any): string {
  if (!data) return "Bug not found.";

  const b = data.Bug || data;
  const lines: string[] = [];

  const severityIcon = getSeverityIcon(b.severity);
  lines.push(`${severityIcon} ${b.title}\n`);

  lines.push(`ID: ${b.id}`);
  lines.push(`Status: ${b.status || "-"}`);
  lines.push(`Severity: ${b.severity || "-"}`);
  if (b.priority) lines.push(`Priority: ${b.priority}`);
  if (b.platform) lines.push(`Platform: ${b.platform}`);
  lines.push(`Reporter: ${b.reporter || "-"}`);
  lines.push(`Owner: ${b.current_owner || b.de || "-"}`);
  if (b.de) lines.push(`Developer: ${b.de}`);
  if (b.te) lines.push(`Tester: ${b.te}`);
  lines.push(`Created: ${b.created || "-"}`);
  if (b.modified) lines.push(`Modified: ${b.modified}`);
  if (b.resolved) lines.push(`Resolved: ${b.resolved}`);
  if (b.closed) lines.push(`Closed: ${b.closed}`);
  if (b.version_report) lines.push(`Version (Report): ${b.version_report}`);
  if (b.version_fix) lines.push(`Version (Fix): ${b.version_fix}`);
  if (b.resolution) lines.push(`Resolution: ${b.resolution}`);
  if (b.module) lines.push(`Module: ${b.module}`);
  if (b.source) lines.push(`Source: ${b.source}`);
  if (b.frequency) lines.push(`Frequency: ${b.frequency}`);
  lines.push(`Workspace: ${b.project_id || "-"}`);
  if (b.custom_field_one) lines.push(`Custom (Platform): ${b.custom_field_one}`);
  if (b.custom_field_two) lines.push(`Custom (Intro Version): ${b.custom_field_two}`);
  if (b.story_id) lines.push(`Story ID: ${b.story_id}`);

  // URL
  if (data.copy_info?.url) {
    lines.push(`URL: ${data.copy_info.url}`);
  }

  // Description
  if (b.description) {
    lines.push("\nDescription:");
    lines.push(stripHtml(b.description));
  }

  // Comments
  if (data.comment_list?.comments?.length > 0) {
    lines.push("\nComments:");
    for (const comment of data.comment_list.comments) {
      lines.push(`  ${comment.author || "?"} (${comment.created || "?"}): ${stripHtml(comment.description || "")}`);
    }
  }

  // Attachments
  if (data.attachment_list?.attachments?.length > 0) {
    lines.push("\nAttachments:");
    for (const att of data.attachment_list.attachments) {
      lines.push(`  - ${att.filename} (${att.content_type || "?"}, ${att.size ? Math.round(att.size / 1024) + "KB" : "?"})`);
    }
  }

  return lines.join("\n");
}

/** Strip HTML tags to plain text */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Format workspace config (bug workflow) */
export function formatBugWorkflow(data: any): string {
  const workflow = data?.workflow_infos?.bug;
  if (!workflow) return "No bug workflow found.";

  const lines: string[] = ["Bug Workflow Configuration\n"];

  if (workflow.status_map) {
    lines.push("Status Map:");
    for (const [wsId, statuses] of Object.entries(workflow.status_map as Record<string, any>)) {
      lines.push(`\n  Workspace: ${wsId}`);
      for (const [key, label] of Object.entries(statuses as Record<string, string>)) {
        lines.push(`    ${key} → ${label}`);
      }
    }
  }

  return lines.join("\n");
}

function getSeverityIcon(severity: string | undefined): string {
  switch (severity) {
    case "fatal": return "[FATAL]";
    case "serious": return "[SERIOUS]";
    case "normal": return "[NORMAL]";
    case "prompt": return "[MINOR]";
    case "advice": return "[ADVICE]";
    default: return `[${severity || "?"}]`;
  }
}
