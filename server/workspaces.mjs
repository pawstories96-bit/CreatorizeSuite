export const workspaceId = value => value?.workspaceId || "personal";
export const activeWorkspace = store => store.settings().activeWorkspace || "personal";
export const inWorkspace = (store, records) => records.filter(r => workspaceId(r) === activeWorkspace(store));
export function workspaceList(store) {
  return [{ id: "personal", name: "Personal workspace" }, ...store.all("workspaces")];
}
