// Shared types for the AI HTML Workspace Editor

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
};

export type WorkspaceSettings = {
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  minimap?: boolean;
  lineNumbers?: boolean;
  autoSave?: boolean;
  defaultViewport?: "desktop" | "tablet" | "mobile";
  autoReload?: boolean;
  consoleVisible?: boolean;
  errorOverlay?: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  activeFile: string | null;
  template: string;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
};

export type FileItem = {
  id: string;
  workspaceId: string;
  path: string;
  content: string;
  isBinary: boolean;
  updatedAt: string;
};

// Message segment model
export type MessageSegment =
  | { type: "thinking"; content: string }
  | { type: "content"; content: string }
  | {
      type: "tool_call";
      tool: string;
      arguments: Record<string, unknown>;
      // Raw streaming text of the arguments — filled in as the model streams
      // the tool call. Used for live display in the tool card before the
      // arguments JSON is complete.
      argumentsText?: string;
      callId: string;
      status: "running" | "success" | "error" | "cancelled";
      label?: string;
      detail?: string;
      result?: unknown;
      error?: string;
    }
  | { type: "error"; content: string };

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  segments: MessageSegment[];
  createdAt: string;
};

export type Chat = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: string;
};

export type Provider = {
  id: string;
  name: string;
  baseURL: string;
  hasApiKey: boolean;
  model: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderInput = {
  name: string;
  baseURL: string;
  apiKey?: string;
  model: string;
  isActive?: boolean;
};

export type PreviewRefreshBehavior = "auto" | "onsave" | "manual";

// UI Color Themes - 32 professional color combinations
export type UITheme = 
  | "default" | "oceanic" | "midnight" | "cyberpunk" | "dracula" 
  | "monokai" | "nord" | "gruvbox" | "github-dark" | "github-light"
  | "vscode-dark" | "vscode-light" | "synthwave" | "aurora" | "deep-sea"
  | "golden-hour" | "purple-haze" | "teal-dream" | "cherry-blossom" | "mint-fresh"
  | "sunset" | "forest" | "desert" | "arctic" | "lavender"
  | "coral" | "sky-blue" | "rose-pine" | "tokyo-night" | "one-dark"
  | "material-ocean" | "material-light";

export type AppSettings = {
  theme: "light" | "dark" | "system";
  uiTheme: UITheme;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  autoSave: boolean;
  formatOnSave: boolean;
  defaultViewport: "desktop" | "tablet" | "mobile";
  previewRefreshBehavior: PreviewRefreshBehavior;
  autoReload: boolean;
  consoleVisible: boolean;
  errorOverlay: boolean;
  openLinksExternally: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  uiTheme: "default",
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
  autoSave: true,
  formatOnSave: false,
  defaultViewport: "desktop",
  previewRefreshBehavior: "auto",
  autoReload: true,
  consoleVisible: true,
  errorOverlay: true,
  openLinksExternally: false,
};

// UI Theme color definitions - CSS custom properties for each theme
export const UI_THEMES: Record<UITheme, {
  name: string;
  description: string;
  colors: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    accent: string;
    accentForeground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    ring: string;
  };
}> = {
  default: {
    name: "Default",
    description: "Clean and minimal default theme",
    colors: {
      background: "0 0% 100%",
      foreground: "240 10% 3.9%",
      card: "0 0% 100%",
      cardForeground: "240 10% 3.9%",
      primary: "240 5.9% 10%",
      primaryForeground: "0 0% 98%",
      secondary: "240 4.8% 95.9%",
      secondaryForeground: "240 5.9% 10%",
      accent: "240 4.8% 95.9%",
      accentForeground: "240 5.9% 10%",
      muted: "240 4.8% 95.9%",
      mutedForeground: "240 3.8% 46.1%",
      border: "240 5.9% 90%",
      ring: "240 5.9% 10%",
    }
  },
  oceanic: {
    name: "Oceanic",
    description: "Deep blue ocean vibes",
    colors: {
      background: "210 40% 5%",
      foreground: "210 20% 95%",
      card: "210 40% 8%",
      cardForeground: "210 20% 95%",
      primary: "200 80% 50%",
      primaryForeground: "210 40% 5%",
      secondary: "210 30% 15%",
      secondaryForeground: "210 20% 95%",
      accent: "190 70% 45%",
      accentForeground: "210 40% 5%",
      muted: "210 30% 12%",
      mutedForeground: "210 15% 65%",
      border: "210 30% 15%",
      ring: "200 80% 50%",
    }
  },
  midnight: {
    name: "Midnight",
    description: "Dark purple night sky",
    colors: {
      background: "250 30% 5%",
      foreground: "250 20% 95%",
      card: "250 30% 8%",
      cardForeground: "250 20% 95%",
      primary: "260 70% 60%",
      primaryForeground: "250 30% 5%",
      secondary: "250 25% 12%",
      secondaryForeground: "250 20% 95%",
      accent: "270 60% 55%",
      accentForeground: "250 30% 5%",
      muted: "250 25% 10%",
      mutedForeground: "250 15% 65%",
      border: "250 25% 15%",
      ring: "260 70% 60%",
    }
  },
  cyberpunk: {
    name: "Cyberpunk",
    description: "Neon futuristic city",
    colors: {
      background: "280 30% 5%",
      foreground: "320 50% 95%",
      card: "280 30% 8%",
      cardForeground: "320 50% 95%",
      primary: "320 100% 50%",
      primaryForeground: "280 30% 5%",
      secondary: "280 25% 12%",
      secondaryForeground: "320 50% 95%",
      accent: "180 100% 40%",
      accentForeground: "280 30% 5%",
      muted: "280 25% 10%",
      mutedForeground: "280 20% 60%",
      border: "320 80% 40%",
      ring: "320 100% 50%",
    }
  },
  dracula: {
    name: "Dracula",
    description: "Classic dark with vibrant accents",
    colors: {
      background: "240 20% 10%",
      foreground: "60 30% 95%",
      card: "240 20% 12%",
      cardForeground: "60 30% 95%",
      primary: "320 80% 60%",
      primaryForeground: "240 20% 10%",
      secondary: "240 15% 18%",
      secondaryForeground: "60 30% 95%",
      accent: "100 70% 50%",
      accentForeground: "240 20% 10%",
      muted: "240 15% 15%",
      mutedForeground: "240 10% 60%",
      border: "240 15% 20%",
      ring: "320 80% 60%",
    }
  },
  monokai: {
    name: "Monokai",
    description: "Warm dark editor classic",
    colors: {
      background: "40 20% 12%",
      foreground: "50 30% 90%",
      card: "40 20% 15%",
      cardForeground: "50 30% 90%",
      primary: "70 80% 50%",
      primaryForeground: "40 20% 12%",
      secondary: "40 15% 20%",
      secondaryForeground: "50 30% 90%",
      accent: "30 90% 60%",
      accentForeground: "40 20% 12%",
      muted: "40 15% 18%",
      mutedForeground: "40 10% 55%",
      border: "40 15% 22%",
      ring: "70 80% 50%",
    }
  },
  nord: {
    name: "Nord",
    description: "Arctic blue minimalist",
    colors: {
      background: "200 20% 15%",
      foreground: "200 15% 90%",
      card: "200 20% 18%",
      cardForeground: "200 15% 90%",
      primary: "200 50% 60%",
      primaryForeground: "200 20% 15%",
      secondary: "200 15% 22%",
      secondaryForeground: "200 15% 90%",
      accent: "180 40% 55%",
      accentForeground: "200 20% 15%",
      muted: "200 15% 20%",
      mutedForeground: "200 10% 60%",
      border: "200 15% 25%",
      ring: "200 50% 60%",
    }
  },
  gruvbox: {
    name: "Gruvbox",
    description: "Warm retro terminal",
    colors: {
      background: "30 30% 15%",
      foreground: "40 30% 90%",
      card: "30 30% 18%",
      cardForeground: "40 30% 90%",
      primary: "100 50% 50%",
      primaryForeground: "30 30% 15%",
      secondary: "30 25% 22%",
      secondaryForeground: "40 30% 90%",
      accent: "20 70% 60%",
      accentForeground: "30 30% 15%",
      muted: "30 25% 20%",
      mutedForeground: "30 20% 60%",
      border: "30 25% 25%",
      ring: "100 50% 50%",
    }
  },
  "github-dark": {
    name: "GitHub Dark",
    description: "GitHub's dark mode",
    colors: {
      background: "210 20% 8%",
      foreground: "210 15% 92%",
      card: "210 20% 10%",
      cardForeground: "210 15% 92%",
      primary: "220 90% 60%",
      primaryForeground: "210 20% 8%",
      secondary: "210 15% 15%",
      secondaryForeground: "210 15% 92%",
      accent: "260 60% 65%",
      accentForeground: "210 20% 8%",
      muted: "210 15% 12%",
      mutedForeground: "210 10% 60%",
      border: "210 15% 18%",
      ring: "220 90% 60%",
    }
  },
  "github-light": {
    name: "GitHub Light",
    description: "GitHub's light mode",
    colors: {
      background: "0 0% 100%",
      foreground: "210 20% 15%",
      card: "0 0% 100%",
      cardForeground: "210 20% 15%",
      primary: "210 90% 45%",
      primaryForeground: "0 0% 100%",
      secondary: "210 10% 95%",
      secondaryForeground: "210 20% 15%",
      accent: "260 60% 55%",
      accentForeground: "0 0% 100%",
      muted: "210 10% 95%",
      mutedForeground: "210 10% 45%",
      border: "210 10% 90%",
      ring: "210 90% 45%",
    }
  },
  "vscode-dark": {
    name: "VS Code Dark",
    description: "Visual Studio Code dark+",
    colors: {
      background: "240 15% 10%",
      foreground: "240 10% 90%",
      card: "240 15% 12%",
      cardForeground: "240 10% 90%",
      primary: "250 80% 60%",
      primaryForeground: "240 15% 10%",
      secondary: "240 10% 18%",
      secondaryForeground: "240 10% 90%",
      accent: "200 70% 50%",
      accentForeground: "240 15% 10%",
      muted: "240 10% 15%",
      mutedForeground: "240 8% 55%",
      border: "240 10% 20%",
      ring: "250 80% 60%",
    }
  },
  "vscode-light": {
    name: "VS Code Light",
    description: "Visual Studio Code light+",
    colors: {
      background: "0 0% 100%",
      foreground: "240 15% 15%",
      card: "0 0% 100%",
      cardForeground: "240 15% 15%",
      primary: "220 80% 50%",
      primaryForeground: "0 0% 100%",
      secondary: "240 5% 95%",
      secondaryForeground: "240 15% 15%",
      accent: "180 70% 45%",
      accentForeground: "0 0% 100%",
      muted: "240 5% 95%",
      mutedForeground: "240 8% 45%",
      border: "240 5% 90%",
      ring: "220 80% 50%",
    }
  },
  synthwave: {
    name: "Synthwave",
    description: "80s neon sunset",
    colors: {
      background: "280 40% 8%",
      foreground: "320 60% 92%",
      card: "280 40% 10%",
      cardForeground: "320 60% 92%",
      primary: "320 100% 55%",
      primaryForeground: "280 40% 8%",
      secondary: "280 35% 15%",
      secondaryForeground: "320 60% 92%",
      accent: "40 100% 50%",
      accentForeground: "280 40% 8%",
      muted: "280 35% 12%",
      mutedForeground: "280 30% 65%",
      border: "320 80% 45%",
      ring: "320 100% 55%",
    }
  },
  aurora: {
    name: "Aurora",
    description: "Northern lights gradient",
    colors: {
      background: "160 30% 8%",
      foreground: "160 20% 92%",
      card: "160 30% 10%",
      cardForeground: "160 20% 92%",
      primary: "150 70% 50%",
      primaryForeground: "160 30% 8%",
      secondary: "160 25% 15%",
      secondaryForeground: "160 20% 92%",
      accent: "180 60% 45%",
      accentForeground: "160 30% 8%",
      muted: "160 25% 12%",
      mutedForeground: "160 15% 60%",
      border: "160 25% 18%",
      ring: "150 70% 50%",
    }
  },
  "deep-sea": {
    name: "Deep Sea",
    description: "Underwater abyss",
    colors: {
      background: "200 50% 5%",
      foreground: "200 30% 90%",
      card: "200 50% 8%",
      cardForeground: "200 30% 90%",
      primary: "190 80% 45%",
      primaryForeground: "200 50% 5%",
      secondary: "200 40% 12%",
      secondaryForeground: "200 30% 90%",
      accent: "220 70% 50%",
      accentForeground: "200 50% 5%",
      muted: "200 40% 10%",
      mutedForeground: "200 20% 55%",
      border: "200 40% 15%",
      ring: "190 80% 45%",
    }
  },
  "golden-hour": {
    name: "Golden Hour",
    description: "Warm sunset glow",
    colors: {
      background: "35 40% 12%",
      foreground: "35 30% 92%",
      card: "35 40% 15%",
      cardForeground: "35 30% 92%",
      primary: "30 90% 55%",
      primaryForeground: "35 40% 12%",
      secondary: "35 35% 20%",
      secondaryForeground: "35 30% 92%",
      accent: "45 80% 50%",
      accentForeground: "35 40% 12%",
      muted: "35 35% 18%",
      mutedForeground: "35 25% 60%",
      border: "35 35% 22%",
      ring: "30 90% 55%",
    }
  },
  "purple-haze": {
    name: "Purple Haze",
    description: "Mystical purple fog",
    colors: {
      background: "270 40% 8%",
      foreground: "270 25% 92%",
      card: "270 40% 10%",
      cardForeground: "270 25% 92%",
      primary: "280 80% 60%",
      primaryForeground: "270 40% 8%",
      secondary: "270 35% 15%",
      secondaryForeground: "270 25% 92%",
      accent: "300 70% 55%",
      accentForeground: "270 40% 8%",
      muted: "270 35% 12%",
      mutedForeground: "270 20% 60%",
      border: "270 35% 18%",
      ring: "280 80% 60%",
    }
  },
  "teal-dream": {
    name: "Teal Dream",
    description: "Soothing teal waves",
    colors: {
      background: "170 40% 8%",
      foreground: "170 25% 92%",
      card: "170 40% 10%",
      cardForeground: "170 25% 92%",
      primary: "170 70% 45%",
      primaryForeground: "170 40% 8%",
      secondary: "170 35% 15%",
      secondaryForeground: "170 25% 92%",
      accent: "160 60% 50%",
      accentForeground: "170 40% 8%",
      muted: "170 35% 12%",
      mutedForeground: "170 20% 60%",
      border: "170 35% 18%",
      ring: "170 70% 45%",
    }
  },
  "cherry-blossom": {
    name: "Cherry Blossom",
    description: "Soft pink spring",
    colors: {
      background: "340 30% 95%",
      foreground: "340 20% 20%",
      card: "340 30% 98%",
      cardForeground: "340 20% 20%",
      primary: "340 70% 55%",
      primaryForeground: "340 30% 95%",
      secondary: "340 20% 90%",
      secondaryForeground: "340 20% 20%",
      accent: "350 60% 60%",
      accentForeground: "340 30% 95%",
      muted: "340 20% 92%",
      mutedForeground: "340 15% 45%",
      border: "340 20% 88%",
      ring: "340 70% 55%",
    }
  },
  "mint-fresh": {
    name: "Mint Fresh",
    description: "Cool mint breeze",
    colors: {
      background: "150 30% 95%",
      foreground: "150 20% 20%",
      card: "150 30% 98%",
      cardForeground: "150 20% 20%",
      primary: "150 60% 40%",
      primaryForeground: "150 30% 95%",
      secondary: "150 20% 90%",
      secondaryForeground: "150 20% 20%",
      accent: "160 50% 45%",
      accentForeground: "150 30% 95%",
      muted: "150 20% 92%",
      mutedForeground: "150 15% 40%",
      border: "150 20% 88%",
      ring: "150 60% 40%",
    }
  },
  sunset: {
    name: "Sunset",
    description: "Orange horizon glow",
    colors: {
      background: "25 50% 12%",
      foreground: "25 35% 92%",
      card: "25 50% 15%",
      cardForeground: "25 35% 92%",
      primary: "20 90% 55%",
      primaryForeground: "25 50% 12%",
      secondary: "25 45% 20%",
      secondaryForeground: "25 35% 92%",
      accent: "35 85% 50%",
      accentForeground: "25 50% 12%",
      muted: "25 45% 18%",
      mutedForeground: "25 30% 60%",
      border: "25 45% 22%",
      ring: "20 90% 55%",
    }
  },
  forest: {
    name: "Forest",
    description: "Deep woodland green",
    colors: {
      background: "130 40% 8%",
      foreground: "130 25% 90%",
      card: "130 40% 10%",
      cardForeground: "130 25% 90%",
      primary: "130 60% 45%",
      primaryForeground: "130 40% 8%",
      secondary: "130 35% 15%",
      secondaryForeground: "130 25% 90%",
      accent: "120 50% 50%",
      accentForeground: "130 40% 8%",
      muted: "130 35% 12%",
      mutedForeground: "130 20% 55%",
      border: "130 35% 18%",
      ring: "130 60% 45%",
    }
  },
  desert: {
    name: "Desert",
    description: "Warm sandy dunes",
    colors: {
      background: "40 30% 15%",
      foreground: "40 20% 90%",
      card: "40 30% 18%",
      cardForeground: "40 20% 90%",
      primary: "35 70% 50%",
      primaryForeground: "40 30% 15%",
      secondary: "40 25% 22%",
      secondaryForeground: "40 20% 90%",
      accent: "50 60% 55%",
      accentForeground: "40 30% 15%",
      muted: "40 25% 20%",
      mutedForeground: "40 15% 55%",
      border: "40 25% 25%",
      ring: "35 70% 50%",
    }
  },
  arctic: {
    name: "Arctic",
    description: "Ice cold blue-white",
    colors: {
      background: "200 30% 95%",
      foreground: "200 20% 20%",
      card: "200 30% 98%",
      cardForeground: "200 20% 20%",
      primary: "200 60% 45%",
      primaryForeground: "200 30% 95%",
      secondary: "200 20% 90%",
      secondaryForeground: "200 20% 20%",
      accent: "190 50% 50%",
      accentForeground: "200 30% 95%",
      muted: "200 20% 92%",
      mutedForeground: "200 15% 40%",
      border: "200 20% 88%",
      ring: "200 60% 45%",
    }
  },
  lavender: {
    name: "Lavender",
    description: "Soft purple calm",
    colors: {
      background: "260 30% 95%",
      foreground: "260 20% 20%",
      card: "260 30% 98%",
      cardForeground: "260 20% 20%",
      primary: "270 60% 55%",
      primaryForeground: "260 30% 95%",
      secondary: "260 20% 90%",
      secondaryForeground: "260 20% 20%",
      accent: "280 50% 60%",
      accentForeground: "260 30% 95%",
      muted: "260 20% 92%",
      mutedForeground: "260 15% 45%",
      border: "260 20% 88%",
      ring: "270 60% 55%",
    }
  },
  coral: {
    name: "Coral",
    description: "Vibrant reef orange",
    colors: {
      background: "10 40% 95%",
      foreground: "10 25% 20%",
      card: "10 40% 98%",
      cardForeground: "10 25% 20%",
      primary: "10 80% 50%",
      primaryForeground: "10 40% 95%",
      secondary: "10 30% 90%",
      secondaryForeground: "10 25% 20%",
      accent: "20 70% 55%",
      accentForeground: "10 40% 95%",
      muted: "10 30% 92%",
      mutedForeground: "10 20% 45%",
      border: "10 30% 88%",
      ring: "10 80% 50%",
    }
  },
  "sky-blue": {
    name: "Sky Blue",
    description: "Clear daytime sky",
    colors: {
      background: "210 40% 95%",
      foreground: "210 25% 20%",
      card: "210 40% 98%",
      cardForeground: "210 25% 20%",
      primary: "210 80% 50%",
      primaryForeground: "210 40% 95%",
      secondary: "210 30% 90%",
      secondaryForeground: "210 25% 20%",
      accent: "200 70% 45%",
      accentForeground: "210 40% 95%",
      muted: "210 30% 92%",
      mutedForeground: "210 20% 45%",
      border: "210 30% 88%",
      ring: "210 80% 50%",
    }
  },
  "rose-pine": {
    name: "Rose Pine",
    description: "Minimalist rose tinted",
    colors: {
      background: "340 20% 12%",
      foreground: "340 15% 85%",
      card: "340 20% 15%",
      cardForeground: "340 15% 85%",
      primary: "340 60% 65%",
      primaryForeground: "340 20% 12%",
      secondary: "340 15% 20%",
      secondaryForeground: "340 15% 85%",
      accent: "350 50% 70%",
      accentForeground: "340 20% 12%",
      muted: "340 15% 18%",
      mutedForeground: "340 10% 55%",
      border: "340 15% 22%",
      ring: "340 60% 65%",
    }
  },
  "tokyo-night": {
    name: "Tokyo Night",
    description: "Modern Tokyo darkness",
    colors: {
      background: "240 25% 8%",
      foreground: "240 15% 90%",
      card: "240 25% 10%",
      cardForeground: "240 15% 90%",
      primary: "250 70% 65%",
      primaryForeground: "240 25% 8%",
      secondary: "240 20% 15%",
      secondaryForeground: "240 15% 90%",
      accent: "200 60% 55%",
      accentForeground: "240 25% 8%",
      muted: "240 20% 12%",
      mutedForeground: "240 12% 55%",
      border: "240 20% 18%",
      ring: "250 70% 65%",
    }
  },
  "one-dark": {
    name: "One Dark",
    description: "Atom One Dark Pro",
    colors: {
      background: "220 20% 12%",
      foreground: "220 15% 88%",
      card: "220 20% 15%",
      cardForeground: "220 15% 88%",
      primary: "220 70% 60%",
      primaryForeground: "220 20% 12%",
      secondary: "220 15% 20%",
      secondaryForeground: "220 15% 88%",
      accent: "190 60% 55%",
      accentForeground: "220 20% 12%",
      muted: "220 15% 18%",
      mutedForeground: "220 10% 55%",
      border: "220 15% 22%",
      ring: "220 70% 60%",
    }
  },
  "material-ocean": {
    name: "Material Ocean",
    description: "Google Material ocean",
    colors: {
      background: "210 45% 10%",
      foreground: "210 20% 92%",
      card: "210 45% 12%",
      cardForeground: "210 20% 92%",
      primary: "200 75% 50%",
      primaryForeground: "210 45% 10%",
      secondary: "210 35% 18%",
      secondaryForeground: "210 20% 92%",
      accent: "190 65% 45%",
      accentForeground: "210 45% 10%",
      muted: "210 35% 15%",
      mutedForeground: "210 15% 60%",
      border: "210 35% 20%",
      ring: "200 75% 50%",
    }
  },
  "material-light": {
    name: "Material Light",
    description: "Google Material light",
    colors: {
      background: "0 0% 100%",
      foreground: "220 15% 18%",
      card: "0 0% 100%",
      cardForeground: "220 15% 18%",
      primary: "210 80% 48%",
      primaryForeground: "0 0% 100%",
      secondary: "220 10% 94%",
      secondaryForeground: "220 15% 18%",
      accent: "180 65% 42%",
      accentForeground: "0 0% 100%",
      muted: "220 10% 94%",
      mutedForeground: "220 10% 45%",
      border: "220 10% 90%",
      ring: "210 80% 48%",
    }
  },
};

// Streaming events normalized from providers
export type StreamEvent =
  | { type: "reasoning_content"; content: string }
  | { type: "content"; content: string }
  | {
      type: "tool_call";
      tool: string;
      arguments: Record<string, unknown>;
      argumentsText?: string;
      callId: string;
      label?: string;
      detail?: string;
      status?: "running" | "success" | "error" | "cancelled";
    }
  | {
      type: "tool_result";
      callId: string;
      status: "success" | "error" | "cancelled";
      result?: unknown;
      error?: string;
      label?: string;
      detail?: string;
    }
  | { type: "error"; content: string }
  | { type: "done" };

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const DEVICE_SIZES: Record<PreviewDevice, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: "Desktop" },
  tablet: { width: 768, height: 1024, label: "Tablet" },
  mobile: { width: 390, height: 844, label: "Mobile" },
};

// Tool registry types
export type ToolName =
  | "list_files"
  | "read_file"
  | "create_file"
  | "write_file"
  | "edit_file"
  | "delete_file"
  | "rename_file"
  | "move_file"
  | "replace_content"
  | "create_folder"
  | "search_files"
  | "open_page"
  | "reload_page"
  | "click"
  | "type"
  | "press_key"
  | "scroll"
  | "hover"
  | "select"
  | "wait"
  | "get_dom"
  | "get_element"
  | "inspect_element"
  | "get_console_logs"
  | "get_page_errors"
  | "get_network_errors"
  | "take_screenshot"
  | "run_javascript"
  | "browser_execute_js"
  | "browser_read_page"
  | "run_test"
  | "terminal_exec"
  | "terminal_reset"
  | "check_page"
  | "check_console"
  | "check_links"
  // ---- Testing tools ----
  | "run_unit_tests"
  | "run_integration_tests"
  | "run_e2e_test"
  | "assert_text"
  | "assert_element"
  | "assert_url"
  | "assert_title"
  | "assert_attribute"
  | "assert_visible"
  | "assert_hidden"
  | "assert_enabled"
  | "assert_disabled"
  | "assert_screenshot"
  | "test_api_endpoint"
  | "test_form"
  | "test_navigation"
  | "test_responsive_layout"
  | "test_console"
  | "test_network"
  | "test_performance"
  | "run_qa_suite";

export const TOOL_LABELS: Record<ToolName, string> = {
  list_files: "List files",
  read_file: "Read file",
  create_file: "Create file",
  write_file: "Write file",
  edit_file: "Edit file",
  delete_file: "Delete file",
  rename_file: "Rename file",
  move_file: "Move file",
  replace_content: "Replace content",
  create_folder: "Create folder",
  search_files: "Search files",
  open_page: "Open page",
  reload_page: "Reload page",
  click: "Click element",
  type: "Type text",
  press_key: "Press key",
  scroll: "Scroll",
  hover: "Hover",
  select: "Select option",
  wait: "Wait",
  get_dom: "Get DOM",
  get_element: "Get element",
  inspect_element: "Inspect element",
  get_console_logs: "Get console logs",
  get_page_errors: "Get page errors",
  get_network_errors: "Get network errors",
  take_screenshot: "Take screenshot",
  run_javascript: "Run JavaScript",
  browser_execute_js: "Execute JS",
  browser_read_page: "Read page",
  run_test: "Run test",
  terminal_exec: "Terminal exec",
  terminal_reset: "Terminal reset",
  check_page: "Check page",
  check_console: "Check console",
  check_links: "Check links",
  run_unit_tests: "Run unit tests",
  run_integration_tests: "Run integration tests",
  run_e2e_test: "Run E2E test",
  assert_text: "Assert text",
  assert_element: "Assert element",
  assert_url: "Assert URL",
  assert_title: "Assert title",
  assert_attribute: "Assert attribute",
  assert_visible: "Assert visible",
  assert_hidden: "Assert hidden",
  assert_enabled: "Assert enabled",
  assert_disabled: "Assert disabled",
  assert_screenshot: "Assert screenshot",
  test_api_endpoint: "Test API endpoint",
  test_form: "Test form",
  test_navigation: "Test navigation",
  test_responsive_layout: "Test responsive layout",
  test_console: "Test console",
  test_network: "Test network",
  test_performance: "Test performance",
  run_qa_suite: "QA suite",
};
