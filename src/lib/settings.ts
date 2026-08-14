import { db } from "./db";
import { AppSettings, DEFAULT_SETTINGS } from "./types";

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.appSetting.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    ...DEFAULT_SETTINGS,
    theme: (map.theme as AppSettings["theme"]) ?? DEFAULT_SETTINGS.theme,
    fontSize: map.fontSize ? Number(map.fontSize) : DEFAULT_SETTINGS.fontSize,
    tabSize: map.tabSize ? Number(map.tabSize) : DEFAULT_SETTINGS.tabSize,
    wordWrap: map.wordWrap ? map.wordWrap === "true" : DEFAULT_SETTINGS.wordWrap,
    minimap: map.minimap ? map.minimap === "true" : DEFAULT_SETTINGS.minimap,
    lineNumbers: map.lineNumbers ? map.lineNumbers === "true" : DEFAULT_SETTINGS.lineNumbers,
    autoSave: map.autoSave ? map.autoSave === "true" : DEFAULT_SETTINGS.autoSave,
    formatOnSave: map.formatOnSave ? map.formatOnSave === "true" : DEFAULT_SETTINGS.formatOnSave,
    defaultViewport: (map.defaultViewport as AppSettings["defaultViewport"]) ?? DEFAULT_SETTINGS.defaultViewport,
    autoReload: map.autoReload ? map.autoReload === "true" : DEFAULT_SETTINGS.autoReload,
    consoleVisible: map.consoleVisible ? map.consoleVisible === "true" : DEFAULT_SETTINGS.consoleVisible,
    errorOverlay: map.errorOverlay ? map.errorOverlay === "true" : DEFAULT_SETTINGS.errorOverlay,
    openLinksExternally: map.openLinksExternally ? map.openLinksExternally === "true" : DEFAULT_SETTINGS.openLinksExternally,
  };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  const entries: [string, string][] = [
    ["theme", next.theme],
    ["fontSize", String(next.fontSize)],
    ["tabSize", String(next.tabSize)],
    ["wordWrap", String(next.wordWrap)],
    ["minimap", String(next.minimap)],
    ["lineNumbers", String(next.lineNumbers)],
    ["autoSave", String(next.autoSave)],
    ["formatOnSave", String(next.formatOnSave)],
    ["defaultViewport", next.defaultViewport],
    ["autoReload", String(next.autoReload)],
    ["consoleVisible", String(next.consoleVisible)],
    ["errorOverlay", String(next.errorOverlay)],
    ["openLinksExternally", String(next.openLinksExternally)],
  ];
  await db.$transaction(
    entries.map(([k, v]) =>
      db.appSetting.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } })
    )
  );
  return next;
}

// JSON helpers for Prisma string fields
export function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJSON(value: unknown): string {
  return JSON.stringify(value);
}
