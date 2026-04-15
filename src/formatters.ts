/** Format workspace/project list */
export function formatWorkspaces(workspaces: any[]): string {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return "No workspaces found.";

  const lines: string[] = ["# My Workspaces\n"];
  for (const ws of workspaces) {
    const status = ws.status === "normal" ? "" : ` [${ws.status}]`;
    lines.push(`- **${ws.project_name}** (workspace_id: ${ws.id})${status}`);
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
  lines.push(`# Bug List (${totalCount || bugsList.length} total, page ${page || 1}, ${perpage || 50}/page)\n`);

  for (const item of bugsList) {
    const bug = item.Bug;
    if (!bug) continue;

    const severityIcon = getSeverityIcon(bug.severity);
    const statusLabel = bug.status_alias || bug.status || "unknown";

    lines.push(`## ${severityIcon} ${bug.title}`);
    lines.push(`- **ID:** ${bug.id} (short: ${bug.short_id || "-"})`);
    lines.push(`- **Status:** ${statusLabel}`);
    lines.push(`- **Severity:** ${bug.severity || "-"}`);
    lines.push(`- **Reporter:** ${bug.reporter || "-"}`);
    lines.push(`- **Owner:** ${bug.current_owner || bug.de || "-"}`);
    lines.push(`- **Created:** ${bug.created || "-"}`);
    if (bug.version_report) lines.push(`- **Version:** ${bug.version_report}`);
    if (bug.resolution && bug.resolution !== "--") lines.push(`- **Resolution:** ${bug.resolution}`);
    if (bug.due) lines.push(`- **Due:** ${bug.due}`);

    // Related story
    if (item.BugStoryRelation && item.BugStoryRelation.length > 0) {
      const story = item.BugStoryRelation[0];
      if (bug.BugStoryRelation_story_name) {
        lines.push(`- **Related Story:** ${bug.BugStoryRelation_story_name} (${story.relative_id})`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/** Format a single bug detail */
export function formatBugDetail(bug: any): string {
  if (!bug) return "Bug not found.";

  const b = bug.Bug || bug;
  const lines: string[] = [];

  const severityIcon = getSeverityIcon(b.severity);
  lines.push(`# ${severityIcon} ${b.title}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **ID** | ${b.id} |`);
  lines.push(`| **Short ID** | ${b.short_id || "-"} |`);
  lines.push(`| **Status** | ${b.status_alias || b.status || "-"} |`);
  lines.push(`| **Severity** | ${b.severity || "-"} |`);
  lines.push(`| **Priority** | ${b.priority || "-"} |`);
  lines.push(`| **Reporter** | ${b.reporter || "-"} |`);
  lines.push(`| **Owner** | ${b.current_owner || b.de || "-"} |`);
  lines.push(`| **Developer** | ${b.de || "-"} |`);
  lines.push(`| **Created** | ${b.created || "-"} |`);
  lines.push(`| **Version** | ${b.version_report || "-"} |`);
  lines.push(`| **Resolution** | ${b.resolution || "-"} |`);
  lines.push(`| **Due** | ${b.due || "-"} |`);
  lines.push(`| **Workspace** | ${b.project_id || b.workspace_id || "-"} |`);

  if (b.custom_field_one) lines.push(`| **Platform** | ${b.custom_field_one} |`);
  if (b.custom_field_11) lines.push(`| **Custom Field** | ${b.custom_field_11} |`);

  // Related story
  if (bug.BugStoryRelation && bug.BugStoryRelation.length > 0) {
    lines.push("");
    lines.push("### Related Stories");
    for (const rel of bug.BugStoryRelation) {
      const name = b.BugStoryRelation_story_name || rel.relative_id;
      lines.push(`- ${name} (ID: ${rel.relative_id})`);
    }
  }

  // Description (if available)
  if (b.description) {
    lines.push("");
    lines.push("### Description");
    lines.push(b.description);
  }

  return lines.join("\n");
}

/** Format workspace config (bug workflow) */
export function formatBugWorkflow(data: any): string {
  const workflow = data?.workflow_infos?.bug;
  if (!workflow) return "No bug workflow found.";

  const lines: string[] = ["# Bug Workflow Configuration\n"];

  // Status map
  if (workflow.status_map) {
    lines.push("## Status Map");
    for (const [wsId, statuses] of Object.entries(workflow.status_map as Record<string, any>)) {
      lines.push(`\n### Workspace: ${wsId}`);
      for (const [key, label] of Object.entries(statuses as Record<string, string>)) {
        lines.push(`  - \`${key}\` → ${label}`);
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
