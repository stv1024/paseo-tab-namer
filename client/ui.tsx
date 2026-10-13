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
}: {
  theme: Theme;
  children: string;
  onPress(): void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: primary ? c.accent : c.border,
        backgroundColor: primary ? c.accent : c.surface1,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: primary ? c.accentForeground : c.foreground,
          fontWeight: "600",
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
}: {
  theme: Theme;
  label: string;
  value: string;
  onChange(v: string): void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const c = theme.colors;
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: c.foreground, fontWeight: "600" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
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
}: {
  theme: Theme;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Button
          key={o.value}
          theme={theme}
          primary={value === o.value}
          disabled={disabled}
          onPress={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </View>
  );
}
