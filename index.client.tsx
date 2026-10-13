import { ScrollView } from "react-native";
import type {
  PluginClientContext,
  PluginSidebarItemProps,
  PluginScreenProps,
  PluginButtonContentProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { RenameForm, RenameScreen } from "./client/rename";
import { SettingsScreen } from "./client/settings";
function Sidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Sparkles"
      active={currentScreen?.screenId === "rename"}
      onPress={() => openScreen({ screenId: "rename" })}
    />
  );
}
export default function contribute(client: PluginClientContext) {
  const openSettings = () => client.openSettings("rename-settings");
  const Screen = (props: PluginScreenProps) => (
    <RenameScreen {...props} openSettings={openSettings} />
  );
  const Popover = (props: PluginButtonContentProps) => (
    <ScrollView
      style={{ maxHeight: 720, width: props.layout.compact ? "100%" : 540 }}
      contentContainerStyle={{ padding: 18 }}
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
    </ScrollView>
  );
  client.addScreen({ id: "rename", title: "AI 重命名", Component: Screen });
  client.addSettingsScreen({
    id: "rename-settings",
    title: "AI 重命名",
    icon: "Sparkles",
    Component: SettingsScreen,
  });
  client.addSidebarFooterItem({
    id: "ai-rename",
    title: "AI 重命名",
    Component: Sidebar,
  });
  client.addCommandCenterItem({
    id: "rename-workspace",
    title: "AI 重命名当前 workspace",
    icon: "Sparkles",
    context: "workspace",
    keywords: ["rename", "name", "重命名", "名称"],
    onSelect({ workspace, openScreen }) {
      openScreen({ screenId: "rename", params: { workspaceId: workspace.id } });
    },
  });
  client.addCommandCenterItem({
    id: "rename-agent",
    title: "AI 重命名：根据当前会话",
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
    title: "AI 重命名设置",
    icon: "Settings",
    context: "global",
    keywords: ["rename", "prompt", "tokens", "重命名"],
    onSelect: openSettings,
  });
  const buttons = new Map<string, ReturnType<typeof client.addHeaderButton>>();
  let disposed = false,
    fetching = false;
  const refresh = async () => {
    if (disposed || fetching) return;
    fetching = true;
    try {
      const found = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await client.paseo.workspaces.list({
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
        });
        if (disposed) return;
        for (const w of page.entries) {
          found.add(w.id);
          if (!buttons.has(w.id))
            buttons.set(
              w.id,
              client.addHeaderButton({
                id: "ai-rename",
                workspaceId: w.id,
                button: {
                  title: "AI 重命名",
                  icon: "Sparkles",
                  behavior: { kind: "popover", Content: Popover },
                },
              }),
            );
        }
        cursor = page.pageInfo.nextCursor ?? undefined;
      } while (cursor);
      for (const [id, button] of buttons)
        if (!found.has(id)) {
          button.remove();
          buttons.delete(id);
        }
    } catch {
      /* Screen RPCs surface errors; polling retries registration. */
    } finally {
      fetching = false;
    }
  };
  const unsubscribe = client.paseo.workspaces.subscribe(() => {
    void refresh();
  });
  const timer = setInterval(() => {
    void refresh();
  }, 30000);
  void refresh();
  return () => {
    disposed = true;
    clearInterval(timer);
    unsubscribe();
    for (const button of buttons.values()) button.remove();
    buttons.clear();
  };
}
