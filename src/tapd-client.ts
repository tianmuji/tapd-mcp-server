import https from "https";
import http from "http";
import fs from "fs";
import { URL } from "url";
import type { Credentials } from "./auth.js";

export interface TapdResponse<T = any> {
  data: T;
  meta?: any;
  timestamp?: number;
  request_id?: string;
}

export class TapdClient {
  private baseUrl = "https://www.tapd.cn";
  private credentials: Credentials | null = null;

  setCredentials(creds: Credentials | null): void {
    this.credentials = creds;
  }

  isAuthenticated(): boolean {
    return !!(this.credentials && Date.now() < this.credentials.expiresAt);
  }

  private get<T>(path: string, params: Record<string, string> = {}): Promise<TapdResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error("Not authenticated. Please call 'tapd-auth' first."));
        return;
      }

      const url = new URL(this.baseUrl + path);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const options: https.RequestOptions = {
        timeout: 30000,
        headers: {
          Cookie: this.credentials.cookies,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json, text/plain, */*",
        },
      };

      const req = https.get(url.toString(), options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON response from ${path}`));
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout: ${path}`));
      });
    });
  }

  private post<T>(path: string, body: Record<string, any>): Promise<TapdResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error("Not authenticated. Please call 'tapd-auth' first."));
        return;
      }

      const url = new URL(this.baseUrl + path);
      const data = JSON.stringify(body);

      const options: https.RequestOptions = {
        method: "POST",
        timeout: 30000,
        headers: {
          Cookie: this.credentials.cookies,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.tapd.cn/",
        },
      };

      const req = https.request(url.toString(), options, (res) => {
        let respBody = "";
        res.on("data", (chunk) => (respBody += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(respBody));
          } catch {
            reject(new Error(`Invalid JSON response from ${path}: ${respBody.substring(0, 200)}`));
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout: ${path}`));
      });
      req.write(data);
      req.end();
    });
  }

  /** Get current user info and workspace list */
  async getUserAndWorkspaces(): Promise<TapdResponse> {
    return this.get(
      "/api/aggregation/user_and_workspace_aggregation/get_user_and_workspace_basic_info",
      { workspace_id: "0", location: "/tapd_fe/my/work" }
    );
  }

  /** Get bug list for a workspace */
  async getBugsList(params: {
    workspace_id: string;
    page?: number;
    perpage?: number;
    sort_name?: string;
    order?: string;
    dsc_token?: string;
  }): Promise<TapdResponse> {
    return this.post("/api/aggregation/bug_aggregation/get_bugs_list", {
      workspace_id: params.workspace_id,
      conf_id: "",
      sort_name: params.sort_name || "",
      confIdType: "CACHE",
      order: params.order || "desc",
      perpage: params.perpage || 50,
      page: params.page || 1,
      selected_workspace_ids: "",
      query_token: "",
      location: "/bugtrace/bugreports/my_view",
      target: `${params.workspace_id}/bug/normal`,
      entity_types: ["bug"],
      use_scene: "bug_list",
      return_url: `https://www.tapd.cn/tapd_fe/${params.workspace_id}/bug/list`,
      identifier: "app_for_list_tools,app_for_list_operation",
      multiple_group_location: "multiple_group/bug_list",
      dsc_token: params.dsc_token || "",
    });
  }

  /** Get bug fields and views for a workspace */
  async getBugFieldsAndViews(workspaceId: string, dscToken?: string): Promise<TapdResponse> {
    return this.post("/api/aggregation/bug_aggregation/get_bug_fields_userview_and_list", {
      workspace_id: workspaceId,
      conf_id: "",
      sort_name: "",
      confIdType: "CACHE",
      order: "desc",
      perpage: 50,
      page: 1,
      selected_workspace_ids: "",
      query_token: "",
      location: "/bugtrace/bugreports/my_view",
      target: `${workspaceId}/bug/normal`,
      entity_types: ["bug"],
      use_scene: "bug_list",
      return_url: `https://www.tapd.cn/tapd_fe/${workspaceId}/bug/list`,
      identifier: "app_for_list_tools,app_for_list_operation",
      multiple_group_location: "multiple_group/bug_list",
      dsc_token: dscToken || "",
    });
  }

  /** Get filter options (status, priority, etc.) */
  async getFilterOptions(params: {
    workspace_ids: string[];
    fields: { field: string; entity_type: string; is_system: string; html_type: string }[];
    dsc_token?: string;
  }): Promise<TapdResponse> {
    return this.post("/api/new_filter/new_filter/get_options_batch?needRepeatInterceptors=false", {
      workspace_ids: params.workspace_ids,
      fields: params.fields.map(f => ({ ...f, menu_workitem_type_id: "" })),
      use_scene: "bug_list",
      app_id: "1",
      filter_status: "",
      include_in_process: false,
      dsc_token: params.dsc_token || "",
    });
  }

  /** Get single bug detail by ID */
  async getBugDetail(workspaceId: string, bugId: string): Promise<TapdResponse> {
    return this.post("/api/aggregation/workitem_aggregation/common_get_info", {
      workspace_id: workspaceId,
      entity_id: bugId,
      entity_type: "bug",
      api_controller_prefix: "",
      enable_description: "true",
      is_detail: 1,
      blacklist_fields: [],
      identifier: "app_for_editor,app_for_obj_more,app_for_obj_dialog_dropdown,app_for_obj_detail_panel,app_for_obj_detail_bottom_card,app_for_obj_attachment,app_for_obj_copy_link,app_for_obj_additional_panel",
      installed_app_entity: {
        obj_id: bugId,
        obj_type: "bug",
        obj_name: "",
      },
      has_edit_rule_fields: [],
      is_archived: 0,
      is_assistant_exec_log: 1,
      dsc_token: "",
    });
  }

  /** Download a file (attachment) to local path, following redirects */
  downloadFile(fileUrl: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error("Not authenticated. Please call 'tapd-auth' first."));
        return;
      }

      const doRequest = (url: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === "https:" ? https : http;
        const options: https.RequestOptions = {
          timeout: 120000,
          headers: {
            Cookie: this.credentials!.cookies,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        };

        const req = protocol.get(url, options, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            doRequest(res.headers.location, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with status ${res.statusCode}`));
            return;
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Download timeout"));
        });
      };

      doRequest(fileUrl);
    });
  }

  /** Get the download URL for a bug attachment */
  getAttachmentDownloadUrl(workspaceId: string, attachmentId: string): string {
    return `${this.baseUrl}/tfl/${workspaceId}/attachments/download/${attachmentId}`;
  }

  /** Get workspace config (workflow statuses, workitem types, etc.) */
  async getWorkspaceConfig(workspaceId: string): Promise<TapdResponse> {
    return this.get("/api/entity/entity_preview/get_workspaces_config", {
      needRepeatInterceptors: "false",
      program_id: "",
      workspace_id: "0",
      app_id: "1",
      "all_workspace_ids[]": workspaceId,
      entity_type: "story,tobject,board_card,launchform,task,bug",
      more_option: "1",
      need_origin_to_alias: "0",
      "append_configs[]": "workspace_info_map",
    });
  }
}
