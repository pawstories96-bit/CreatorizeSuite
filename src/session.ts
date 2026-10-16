import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
type Session = {
  page: string;
  activeId: string;
  collapsed: boolean;
  setPage: (page: string) => void;
  setActiveId: (activeId: string) => void;
  setCollapsed: (collapsed: boolean) => void;
};
const legacy = (key: string, fallback: string) =>
  typeof window !== "undefined"
    ? localStorage.getItem(key) || fallback
    : fallback;
let sessionWrites = Promise.resolve();
export const useSession = create<Session>()(
  persist(
    (set) => ({
      page: legacy("page", "Home"),
      activeId: legacy("activeProject", ""),
      collapsed: false,
      setPage: (page) => set({ page }),
      setActiveId: (activeId) => set({ activeId }),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: "creatorize-ui",
      storage: createJSONStorage(() => ({
        async getItem(name) {
          try {
            const response = await fetch("/api/ui-session");
            if (response.ok) {
              const saved = await response.json();
              if (saved)
                return JSON.stringify({
                  state: {
                    page: saved.page,
                    activeId: saved.activeId,
                    collapsed: saved.collapsed,
                  },
                  version: 0,
                });
            }
          } catch {}
          return localStorage.getItem(name);
        },
        async setItem(name, value) {
          localStorage.setItem(name, value);
          sessionWrites = sessionWrites.then(async () => {
            try {
              await fetch("/api/ui-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(JSON.parse(value).state),
              });
            } catch {}
          });
          await sessionWrites;
        },
        async removeItem(name) {
          localStorage.removeItem(name);
        },
      })),
    },
  ),
);
