import fs from "fs";
import path from "path";
import os from "os";
import { chromium } from "playwright-core";

export interface Credentials {
  cookies: string; // Full cookie string for TAPD requests
  expiresAt: number;
}

// --- Credentials persistence ---

const CREDS_DIR = path.join(os.homedir(), ".tapd-mcp");
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");
const BROWSER_DATA_DIR = path.join(CREDS_DIR, "browser-data");

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    if (!fs.existsSync(CREDS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8"));
    if (data && data.expiresAt > Date.now()) return data;
    return null;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  if (!fs.existsSync(CREDS_DIR)) fs.mkdirSync(CREDS_DIR, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
}

export async function clearCredentials(): Promise<void> {
  try { fs.unlinkSync(CREDS_FILE); } catch { /* ignore */ }
}

// --- Find system Chromium installed by Playwright ---

function findChromium(): string | undefined {
  const cacheDir = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cacheDir)) return undefined;

  const dirs = fs.readdirSync(cacheDir)
    .filter(d => d.startsWith("chromium-"))
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidates = [
      path.join(cacheDir, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      path.join(cacheDir, dir, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      path.join(cacheDir, dir, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(cacheDir, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(cacheDir, dir, "chrome-linux", "chrome"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return undefined;
}

/**
 * Launch browser for TAPD login. User logs in manually.
 * Once we detect the user has landed on the TAPD dashboard (logged in),
 * we capture all cookies for tapd.cn domain.
 */
export async function startBrowserLogin(): Promise<Credentials> {
  const execPath = findChromium();
  if (!execPath) {
    throw new Error(
      "Cannot find Chromium. Please install Playwright browsers: npx playwright install chromium"
    );
  }

  if (!fs.existsSync(BROWSER_DATA_DIR)) fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });

  console.error("[Auth] Launching browser for TAPD login...");
  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: false,
    executablePath: execPath,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://www.tapd.cn/", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for user to login — detect by checking if we land on a TAPD workspace page
    console.error("[Auth] Waiting for user to complete login (up to 180s)...");

    const cookieStr = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Login timed out (180s)")), 180000);

      // Check periodically if user has logged in
      const check = setInterval(async () => {
        try {
          const url = page.url();
          // After login, TAPD redirects to workspace/dashboard pages
          if (
            url.includes("/tapd_fe/") ||
            url.includes("/my/work") ||
            url.includes("/company/") ||
            url.match(/tapd\.cn\/\d+\//)
          ) {
            clearInterval(check);
            clearTimeout(timeout);

            // Capture all cookies
            const cookies = await context.cookies("https://www.tapd.cn");
            const cookieParts = cookies.map(c => `${c.name}=${c.value}`);
            resolve(cookieParts.join("; "));
          }
        } catch {
          // page might be navigating, ignore
        }
      }, 1000);
    });

    console.error("[Auth] Login detected, cookies captured!");
    return {
      cookies: cookieStr,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  } finally {
    await context.close();
  }
}
