# Changelog

## 0.2.0

- Redesign the header popover: **生成名称** (Generate) is now a large full-width button at the top, right below the header button, so the two clicks are close together. It can be clicked as soon as the popover opens: it does not wait for the workspace details, and a click made before the settings load is queued. Scope buttons are smaller, the manual-edit **应用** (Apply) button sits next to the name field (Enter also applies), and **更多** (More) and **设置** (Settings) moved to a footer.
- Fit the popover inside the host popover, which is at most 420 px wide, so no part of it is cut off.

## 0.1.0

- Rename a workspace from its Tabs: the most recent Tab, all Tabs, or one Tab you pick. The name is applied as soon as it is generated.
- Open it from the ✨ button in the workspace header or from the command center, including a searchable list of every workspace.
- One set of settings for all workspaces: provider and model (from the providers enabled in Paseo), thinking level, input budget, name length, timeout, and naming prompt.
- Preview the exact input and budget use without calling the model.
