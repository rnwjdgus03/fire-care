import { ReactNode } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, shadow } from '../theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const content = <View style={styles.screenContent}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  secureTextEntry?: boolean; keyboardType?: KeyboardTypeOptions; multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <View style={[styles.pill, tone === 'success' && styles.pillSuccess, tone === 'warning' && styles.pillWarning, tone === 'danger' && styles.pillDanger]}>
      <Text style={[styles.pillText, tone === 'success' && styles.pillTextSuccess, tone === 'warning' && styles.pillTextWarning, tone === 'danger' && styles.pillTextDanger]}>{label}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  row: { alignItems: 'center', flexDirection: 'row' },
  gap: { height: 16 },
});

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { flexGrow: 1 },
  screenContent: { flex: 1, padding: 20, paddingBottom: 36 },
  header: { alignItems: 'center', flexDirection: 'row', marginBottom: 22, minHeight: 52 },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  headerSubtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  backButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, height: 42, justifyContent: 'center', marginRight: 12, width: 42 },
  backText: { color: colors.text, fontSize: 32, lineHeight: 34 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, padding: 18, ...shadow },
  button: { alignItems: 'center', borderRadius: 13, justifyContent: 'center', minHeight: 50, paddingHorizontal: 18 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.primarySoft, borderColor: '#CDD6FF', borderWidth: 1 },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  buttonTextSecondary: { color: colors.primary },
  fieldWrap: { marginBottom: 15 },
  label: { color: '#374151', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFC', borderColor: '#DDE2EA', borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 50, paddingHorizontal: 15 },
  inputMultiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  pill: { backgroundColor: '#F1F3F6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillSuccess: { backgroundColor: colors.successSoft },
  pillWarning: { backgroundColor: colors.warningSoft },
  pillDanger: { backgroundColor: colors.dangerSoft },
  pillText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  pillTextSuccess: { color: colors.success },
  pillTextWarning: { color: '#B86E00' },
  pillTextDanger: { color: colors.danger },
});
