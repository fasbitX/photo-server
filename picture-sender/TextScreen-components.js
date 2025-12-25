// TextScreen-components.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  Animated,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PinchGestureHandler, PanGestureHandler, State } from 'react-native-gesture-handler';
import { styles } from './TextScreen-styles';

/**
 * ZoomableImageModal
 * - Web: simple full-screen modal + right click opens full size
 * - Native: pinch-to-zoom + pan using gesture-handler and Animated
 */
export function ZoomableImageModal({
  visible,
  uri,
  onClose,
  onSave,
  onShare,
  onForward,
  working,
  insets,
  footerText,
  viewerMeta = {},
}) {
  // ===== WEB IMPLEMENTATION =====
  if (Platform.OS === 'web') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.viewerOverlay}>
          <View style={[styles.viewerHeader, { paddingTop: (insets?.top || 0) + 10 }]}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {working ? (
              <ActivityIndicator />
            ) : (
              <View style={styles.viewerHeaderActions}>
                <TouchableOpacity onPress={onSave} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                  <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onShare} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                  <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onForward} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                  <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Pressable style={styles.viewerBackdrop} onPress={onClose}>
            <Pressable style={styles.viewerImageWrap} onPress={() => {}}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                  onContextMenu={(e) => {
                    try {
                      e.preventDefault?.();
                    } catch {}
                    try {
                      window.open(uri, '_blank', 'noopener,noreferrer');
                    } catch {}
                  }}
                />
              ) : null}
            </Pressable>
          </Pressable>

          <View style={[styles.viewerFooter, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
            <Text style={styles.viewerFooterText} numberOfLines={1}>
              {footerText || viewerMeta?.originalName || 'Right-click to open full size'}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  // ===== NATIVE IMPLEMENTATION =====
  const baseScale = React.useRef(new Animated.Value(1)).current;
  const pinchScale = React.useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);

  const baseX = React.useRef(new Animated.Value(0)).current;
  const baseY = React.useRef(new Animated.Value(0)).current;
  const panX = React.useRef(new Animated.Value(0)).current;
  const panY = React.useRef(new Animated.Value(0)).current;

  const translateX = Animated.add(baseX, panX);
  const translateY = Animated.add(baseY, panY);

  const last = React.useRef({ x: 0, y: 0, s: 1 }).current;

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPanEvent = Animated.event([{ nativeEvent: { translationX: panX, translationY: panY } }], {
    useNativeDriver: true,
  });

  const resetTransforms = () => {
    last.x = 0;
    last.y = 0;
    last.s = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
    baseX.setValue(0);
    baseY.setValue(0);
    panX.setValue(0);
    panY.setValue(0);
  };

  const onPinchStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.s *= e.nativeEvent.scale;
      if (last.s < 1) last.s = 1;
      if (last.s > 6) last.s = 6;

      baseScale.setValue(last.s);
      pinchScale.setValue(1);

      if (last.s === 1) {
        baseX.setValue(0);
        baseY.setValue(0);
        panX.setValue(0);
        panY.setValue(0);
        last.x = 0;
        last.y = 0;
      }
    }
  };

  const onPanStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      last.x += e.nativeEvent.translationX;
      last.y += e.nativeEvent.translationY;

      baseX.setValue(last.x);
      baseY.setValue(last.y);
      panX.setValue(0);
      panY.setValue(0);

      if (last.s === 1) {
        baseX.setValue(0);
        baseY.setValue(0);
        last.x = 0;
        last.y = 0;
      }
    }
  };

  // Debug logging
  React.useEffect(() => {
    if (visible && uri) {
      console.log('[ZoomableImageModal] Opening viewer with URI:', uri);
      console.log('[ZoomableImageModal] Metadata:', viewerMeta);
    }
  }, [visible, uri, viewerMeta]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        resetTransforms();
        onClose();
      }}
    >
      <View style={styles.viewerOverlay}>
        <View style={[styles.viewerHeader, { paddingTop: (insets?.top || 0) + 10 }]}>
          <TouchableOpacity
            onPress={() => {
              resetTransforms();
              onClose();
            }}
            activeOpacity={0.8}
            style={styles.viewerHeaderBtn}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {working ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.viewerHeaderActions}>
              <TouchableOpacity onPress={onSave} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onShare} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                <Ionicons name="share-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onForward} activeOpacity={0.8} style={styles.viewerHeaderBtn}>
                <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => {
            resetTransforms();
            onClose();
          }}
        >
          <Pressable style={styles.viewerImageWrap} onPress={() => {}}>
            <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange}>
              <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
                  <Animated.View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    {uri ? (
                      <Animated.View
                        style={[
                          styles.viewerImageTransformWrap,
                          { transform: [{ translateX }, { translateY }, { scale }] },
                        ]}
                      >
                        <Image
                          key={uri}
                          source={{ uri }}
                          style={styles.viewerImage}
                          resizeMode="contain"
                          onLoadStart={() => console.log('[viewer] Image load start:', uri)}
                          onLoad={(e) => {
                            console.log('[viewer] Image loaded successfully:', {
                              uri,
                              width: e?.nativeEvent?.source?.width,
                              height: e?.nativeEvent?.source?.height,
                            });
                          }}
                          onError={(e) => {
                            console.error('[viewer] Image load ERROR:', {
                              uri,
                              error: e?.nativeEvent?.error,
                            });
                            Alert.alert(
                              'Image Load Error',
                              `Failed to load image.\n\nURI: ${uri}\n\nError: ${JSON.stringify(e?.nativeEvent)}`
                            );
                          }}
                        />
                      </Animated.View>
                    ) : (
                      <View style={{ padding: 20 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 16 }}>No image URI provided</Text>
                      </View>
                    )}
                  </Animated.View>
                </PinchGestureHandler>
              </Animated.View>
            </PanGestureHandler>
          </Pressable>
        </Pressable>

        <View style={[styles.viewerFooter, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
          <Text style={styles.viewerFooterText} numberOfLines={1}>
            {footerText || viewerMeta?.originalName || 'Pinch to zoom • Drag to pan'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
/**
 * ForwardModal
 * Modal for selecting a contact to forward an image to
 */
export function ForwardModal({
  visible,
  onClose,
  loading,
  contacts,
  onForwardToContact,
  insets,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.forwardOverlay}>
        <View style={[styles.forwardCard, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
          <View style={styles.forwardHeader}>
            <Text style={styles.forwardTitle}>Forward to…</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={22} color="#E5E7EB" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 18 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(it) => String(it.id)}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={styles.forwardEmpty}>No saved contacts.</Text>}
              renderItem={({ item }) => {
                const handle = String(item?.user_name || '').trim() || 'contact';
                return (
                  <TouchableOpacity
                    style={styles.forwardRow}
                    onPress={() => onForwardToContact(item)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.forwardAvatar}>
                      <Text style={styles.forwardAvatarTxt}>
                        {String(handle).replace(/^@/, '').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.forwardRowTxt} numberOfLines={1}>
                      @{handle.replace(/^@/, '')}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}