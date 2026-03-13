import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#0f766e',
  primaryDark: '#115e59',
  background: '#f4f7f6',
  surface: '#ffffff',
  border: '#d6e1de',
  text: '#1f2937',
  muted: '#6b7280',
  danger: '#b91c1c'
};

export const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.background
  },
  shellContent: {
    flex: 1
  },
  screen: {
    padding: 16,
    gap: 16
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
    gap: 12
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16
  },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700'
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '600'
  },
  dangerButton: {
    borderRadius: 12,
    backgroundColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center'
  },
  dangerButtonText: {
    color: '#fff',
    fontWeight: '700'
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 13
  },
  metricValue: {
    marginTop: 6,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700'
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text
  },
  rowSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted
  },
  statusPill: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700'
  },
  errorText: {
    color: colors.danger
  },
  helperText: {
    fontSize: 13,
    color: colors.muted
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background
  },
  tabButtonActive: {
    backgroundColor: colors.primary
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted
  },
  tabButtonTextActive: {
    color: '#fff'
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  backButtonText: {
    color: colors.text,
    fontWeight: '600'
  },
  infoGrid: {
    gap: 12
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  infoLabel: {
    fontSize: 13,
    color: colors.muted
  },
  infoValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right'
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    minHeight: 96,
    textAlignVertical: 'top'
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#d1fae5'
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark
  },
  divider: {
    height: 1,
    backgroundColor: colors.border
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center'
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 14
  }
});
