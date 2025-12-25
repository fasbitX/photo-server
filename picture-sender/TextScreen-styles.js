// TextScreen-styles.js
import { StyleSheet, Platform } from 'react-native';

const MAX_WIDTH = 300;
const PHONE_HEIGHT_IN = 6;
const CSS_PX_PER_IN = 96;
const PHONE_HEIGHT_PX = PHONE_HEIGHT_IN * CSS_PX_PER_IN; // 576px

export const styles = StyleSheet.create({
  kav: { flex: 1 },

  // ✅ edge-to-edge dark blue on native; web keeps black around the "phone preview"
  outerContainer: Platform.select({
    web: {
      flex: 1,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingVertical: 16,
    },
    default: {
      flex: 1,
      backgroundColor: '#111827',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      paddingVertical: 0,
    },
  }),

  // ✅ web preview stays 300px wide; native becomes full width
  phoneFrame: Platform.select({
    web: {
      width: '100%',
      maxWidth: MAX_WIDTH,
      height: PHONE_HEIGHT_PX,
      overflow: 'hidden',
      backgroundColor: '#111827',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#1F2937',
      boxShadow: '0px 10px 30px rgba(0,0,0,0.45)',
    },
    default: {
      flex: 1,
      width: '100%',
      backgroundColor: '#111827',
    },
  }),

  container: { flex: 1, width: '100%', backgroundColor: '#111827' },

  // ✅ top transparent title bar
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: 'transparent',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
  },
  topBarMenuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#111827',
  },

  headerCard: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },

  headerAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerAvatarInitials: { color: '#93C5FD', fontWeight: '900', fontSize: 12 },

  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  content: { paddingHorizontal: 16, paddingBottom: 10, flex: 1 },

  empty: { color: '#9CA3AF', textAlign: 'center', paddingTop: 18 },

  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 8,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: '#1D4ED8' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#020617' },
  bubbleText: { color: '#FFF', fontSize: 14 },

  attachmentPressable: { borderRadius: 14, overflow: 'hidden' },
  attachmentImg: { width: 220, height: 220, borderRadius: 14, backgroundColor: '#0B1220' },

  composerDock: { marginTop: 6 },

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0B1220',
    marginBottom: 6,
  },
  pendingThumb: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#020617' },
  pendingText: { flex: 1, color: '#D1D5DB', fontSize: 12 },

  composerCard: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 16,
    padding: 8,
  },

  composerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  composerIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  sendIconBtn: {
    width: 25,
    height: 25,
    borderRadius: 500,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  sendIconBtnDisabled: { opacity: 0.6 },

  inputRow: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: { color: '#FFF', fontSize: 14, padding: 0, lineHeight: 18 },

  chatList: Platform.select({
    web: { scrollbarWidth: 'none', msOverflowStyle: 'none' },
    default: {},
  }),

  viewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  viewerFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 10 },
  viewerFooterText: { color: '#E5E7EB', fontSize: 12, opacity: 0.9 },

  forwardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  forwardCard: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    borderRadius: 18,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
  },
  forwardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  forwardTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  forwardEmpty: { color: '#9CA3AF', paddingVertical: 14, textAlign: 'center' },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#020617',
    marginBottom: 8,
  },
  forwardAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  forwardAvatarTxt: { color: '#93C5FD', fontWeight: '900', fontSize: 11 },
  forwardRowTxt: { flex: 1, color: '#E5E7EB', fontWeight: '800' },

  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImageWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerImageTransformWrap: { width: '100%', height: '100%' },
});