import { Pressable, Text, TextInput, View } from "react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import type { ReactNode } from "react";
export type Theme = PluginHostProps["theme"];
export function Button({
  theme,
  children,
  onPress,
  disabled = false,
  primary = false,
  small = false,
  large = false,
  ghost = false,
}: {
  theme: Theme;
  children: string;
  onPress(): void;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
  /** A tall target for the main action of a surface. */
  large?: boolean;
  ghost?: boolean;
}) {
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: small ? 10 : 14,
        paddingVertical: small ? 6 : 10,
        minHeight: large ? 56 : undefined,
        borderRadius: small ? 6 : large ? 10 : 8,
        borderWidth: 1,
        borderColor: primary ? c.accent : ghost ? "transparent" : c.border,
        backgroundColor: primary
          ? c.accent
          : ghost
            ? "transparent"
            : c.surface1,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: primary
            ? c.accentForeground
            : ghost
              ? c.foregroundMuted
              : c.foreground,
          fontWeight: ghost ? "400" : "600",
          fontSize: small ? 13 : large ? 16 : 14,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({
  theme,
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  onSubmit,
  accessory,
}: {
  theme: Theme;
  label: string;
  value: string;
  onChange(v: string): void;
  multiline?: boolean;
  disabled?: boolean;
  onSubmit?(): void;
  /** Shown to the right of a single-line input, e.g. an apply button. */
  accessory?: ReactNode;
}) {
  const c = theme.colors;
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: c.foreground, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          multiline={multiline}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            padding: 12,
            minHeight: multiline ? 160 : 44,
            textAlignVertical: "top",
            color: c.foreground,
            backgroundColor: c.surface1,
            fontSize: 14,
            lineHeight: 21,
          }}
        />
        {accessory}
      </View>
    </View>
  );
}
export function Note({
  theme,
  children,
  error = false,
}: {
  theme: Theme;
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      style={{
        color: error ? theme.colors.statusDanger : theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 20,
      }}
    >
      {children}
    </Text>
  );
}
export function Choices<T extends string>({
  theme,
  value,
  options,
  onChange,
  disabled = false,
  small = false,
}: {
  theme: Theme;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", gap: small ? 6 : 8 }}
    >
      {options.map((o) => (
        <Button
          key={o.value}
          theme={theme}
          primary={value === o.value}
          small={small}
          disabled={disabled}
          onPress={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </View>
  );
}
