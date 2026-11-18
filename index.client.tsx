import { View } from "react-native";
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginButtonContentProps,
} from "@getpaseo/plugin/client";
import { RenameForm, RenameScreen } from "./client/rename";
import { SettingsScreen } from "./client/settings";
export default function contribute(client: PluginClientContext) {
  const openSettings = () => client.openSettings("rename-settings");
  const Screen = (props: PluginScreenProps) => (
    <RenameScreen {...props} openSettings={openSettings} />
  );
  // The host surface is at most 420 wide, pads its content and scrolls it,
  // so the popover only sets a width that fits inside that padding.
  const Popover = (props: PluginButtonContentProps) => (
    <View
      style={{
        width: props.layout.compact ? "100%" : 392,
        maxWidth: "100%",
        padding: 2,
      }}
    >
      <RenameForm
        key={props.workspaceId}
        {...props}
        workspaceId={props.workspaceId}
        openSettings={() => {
          props.close();
          openSettings();
        }}
      />
    </View>
  );
  client.addScreen({ id: "rename", title: "Tab Namer", Component: Screen });
  client.addSettingsScreen({
    id: "rename-settings",
    title: "Tab Namer",
    icon: "Sparkles",
    Component: SettingsScreen,
  });
  client.addCommandCenterItem({
    id: "rename-any",
    title: "Tab Namer：选择 workspace 重命名",
    icon: "Sparkles",
    context: "global",
    keywords: ["rename", "name", "workspace", "重命名", "名称"],
    onSelect({ openScreen }) {
      openScreen({ screenId: "rename" });
    },
  });
  client.addCommandCenterItem({
    id: "rename-workspace",
    title: "Tab Namer：重命名当前 workspace",
    icon: "Sparkles",
    context: "workspace",
    keywords: ["rename", "name", "重命名", "名称"],
    onSelect({ workspace, openScreen }) {
      openScreen({ screenId: "rename", params: { workspaceId: workspace.id } });
    },
  });
  client.addCommandCenterItem({
    id: "rename-agent",
    title: "Tab Namer：根据当前 Tab",
    icon: "Sparkles",
    context: "agent",
    keywords: ["rename", "name", "重命名"],
    onSelect({ workspace, agent, openScreen }) {
      openScreen({
        screenId: "rename",
        params: { workspaceId: workspace.id, agentId: agent.id },
      });
    },
  });
  client.addCommandCenterItem({
    id: "rename-settings",
    title: "Tab Namer 设置",
    icon: "Settings",
    context: "global",
    keywords: ["rename", "prompt", "tokens", "重命名"],
    onSelect: openSettings,
  });
  const buttons = new Map<string, ReturnType<typeof client.addHeaderButton>>();
  let disposed = false;
  const addButton = (workspaceId: string) => {
    if (disposed || buttons.has(workspaceId)) return;
    buttons.set(
      workspaceId,
      client.addHeaderButton({
        id: "tab-namer",
        workspaceId,
        button: {
          title: "Tab Namer",
          icon: "Sparkles",
          behavior: { kind: "popover", Content: Popover },
        },
      }),
    );
  };
  const removeButton = (workspaceId: string) => {
    buttons.get(workspaceId)?.remove();
    buttons.delete(workspaceId);
  };
  // Live updates add and remove buttons, so the list is read only once.
  const unsubscribe = client.paseo.workspaces.subscribe((update) => {
    if (update.kind === "upsert") addButton(update.workspace.id);
    else removeButton(update.id);
  });
  void (async () => {
    let cursor: string | undefined;
    do {
      // `subscribe` on the first page makes the daemon stream workspace
      // updates to the handler above; without it the handler gets nothing.
      const page = await client.paseo.workspaces.list({
        page: { limit: 100, ...(cursor ? { cursor } : {}) },
        ...(cursor === undefined ? { subscribe: {} } : {}),
      });
      page.entries.forEach((w) => addButton(w.id));
      cursor = page.pageInfo.hasMore
        ? (page.pageInfo.nextCursor ?? undefined)
        : undefined;
    } while (cursor && !disposed);
  })().catch((error: unknown) =>
    console.error("[tab-namer] cannot list workspaces", error),
  );
  return () => {
    disposed = true;
    unsubscribe();
    for (const button of buttons.values()) button.remove();
    buttons.clear();
  };
}
