export type OnyxPlanStep = {
  id: string;
  title: string;
  file?: string;
  status?: "todo" | "doing" | "done" | "error";
  description?: string;
};

export type OnyxPlanProps = {
  title: string;
  steps: OnyxPlanStep[];
};

export type OnyxDiffProps = {
  path: string;
  old?: string;
  new?: string;
  oldContent?: string;
  newContent?: string;
  language?: string;
};

export type OnyxFileTreeProps = {
  files: string[] | { path: string; content?: string }[];
  title?: string;
};

export type OnyxAskUserProps = {
  question: string;
  options: string[];
};

export type OnyxPaletteProps = {
  name?: string;
  colors?: string[];
  palette?: string[];
  mood?: string;
};

export type OnyxReasoningTreeProps = {
  goal?: string;
  steps?: { title: string; thought?: string; status?: string; tools?: string[] }[];
  title?: string;
};

export type OnyxChecklistProps = {
  items: { text: string; checked?: boolean; file?: string }[] | string[];
  title?: string;
};

export type OnyxCommandProps = {
  commands: { label: string; prompt: string; icon?: string }[] | string[];
  title?: string;
};

export type OnyxSymbolsProps = {
  path?: string;
  symbols?: {
    ids?: string[];
    classes?: string[];
    tags?: string[];
    functions?: string[];
  };
  symbolsList?: any;
};

export type OnyxComponentProps =
  | OnyxPlanProps
  | OnyxDiffProps
  | OnyxFileTreeProps
  | OnyxAskUserProps
  | OnyxPaletteProps
  | OnyxReasoningTreeProps
  | OnyxChecklistProps
  | OnyxCommandProps
  | OnyxSymbolsProps
  | Record<string, any>;
