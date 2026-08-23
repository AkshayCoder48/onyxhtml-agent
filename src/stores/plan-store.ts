"use client";
import { create } from "zustand";

export type PlanStep = {
  id: string;
  title: string;
  file?: string;
  status: "todo" | "doing" | "done" | "error";
  description?: string;
};

export type Plan = {
  id: string;
  title: string;
  steps: PlanStep[];
  createdAt: number;
  approved: boolean;
};

type PlanState = {
  currentPlan: Plan | null;
  setPlan: (title: string, steps: PlanStep[]) => void;
  updateStep: (stepId: string, status: PlanStep["status"]) => void;
  approvePlan: () => void;
  clearPlan: () => void;
};

export const usePlanStore = create<PlanState>((set) => ({
  currentPlan: null,
  setPlan: (title, steps) =>
    set({
      currentPlan: {
        id: `plan_${Date.now()}`,
        title,
        steps: steps.map((s) => ({ ...s, status: s.status || "todo" })),
        createdAt: Date.now(),
        approved: false,
      },
    }),
  updateStep: (stepId, status) =>
    set((s) => {
      if (!s.currentPlan) return s;
      return {
        currentPlan: {
          ...s.currentPlan,
          steps: s.currentPlan.steps.map((st) => (st.id === stepId ? { ...st, status } : st)),
        },
      };
    }),
  approvePlan: () =>
    set((s) => {
      if (!s.currentPlan) return s;
      return { currentPlan: { ...s.currentPlan, approved: true } };
    }),
  clearPlan: () => set({ currentPlan: null }),
}));
