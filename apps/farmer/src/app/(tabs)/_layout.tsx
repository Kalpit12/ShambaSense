import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, type ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { CameraIcon, HouseIcon, NotebookIcon, PlantIcon, UserIcon } from '@/components/icons';
import { PressableScale } from '@/components/motion';
import { color, font, motion, space } from '@/theme/tokens';

type IconProps = { size?: number; color?: string; weight?: 'regular' | 'fill' | 'bold' };
const ICONS: Record<string, ComponentType<IconProps>> = {
  home: HouseIcon,
  shamba: PlantIcon,
  journal: NotebookIcon,
  profile: UserIcon,
};
const LABELS: Record<string, string> = { home: 'tabs.home', shamba: 'tabs.shamba', journal: 'tabs.journal', profile: 'tabs.profile' };

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: color.stone50 } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="shamba" />
      <Tabs.Screen name="journal" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

/**
 * Five slots (design.md §7.1): Home, Shamba, a raised Check button in the middle, Journal, Profile.
 * Check opens the camera flow as its own screen, so it is a button rather than a tab.
 */
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const routes = state.routes;

  const tab = (i: number) => {
    const route = routes[i];
    const focused = state.index === i;
    return (
      <TabItem
        key={route.key}
        label={t(LABELS[route.name])}
        Icon={ICONS[route.name]}
        focused={focused}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        }}
      />
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[2]) }]} role="tablist">
      {tab(0)}
      {tab(1)}
      <PressableScale
        onPress={() => router.push('/check')}
        accessibilityRole="button"
        accessibilityLabel={t('check.title')}
        scaleTo={0.94}
        containerStyle={styles.slot}
        style={styles.item}>
        <View style={styles.fab}>
          <CameraIcon size={28} color={color.lime} weight="fill" />
        </View>
        <Text style={[styles.label, styles.fabLabel]}>{t('tabs.check')}</Text>
      </PressableScale>
      {tab(2)}
      {tab(3)}
    </View>
  );
}

function TabItem({ label, Icon, focused, onPress }: { label: string; Icon: ComponentType<IconProps>; focused: boolean; onPress: () => void }) {
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, motion.color);
  }, [focused, on]);
  const pill = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scaleX: 0.7 + 0.3 * on.value }] }));
  return (
    <PressableScale
      onPress={onPress}
      role="tab"
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      containerStyle={styles.slot}
      style={styles.item}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.pill, pill]} />
        {/* Icon sits above the pill; on some renderers an absolute sibling paints on top otherwise. */}
        <View style={styles.icon}>
          <Icon size={24} color={focused ? color.forest900 : color.stone600} weight={focused ? 'fill' : 'regular'} />
        </View>
      </View>
      <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: color.stone200,
    paddingTop: space[2],
  },
  slot: { flex: 1, alignItems: 'center' },
  item: { alignItems: 'center', minHeight: 52, justifyContent: 'center', gap: 2 },
  iconWrap: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: color.forest100 },
  icon: { zIndex: 1 },
  label: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: color.stone600 },
  labelOn: { fontFamily: font.semibold, color: color.forest900 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -24,
    backgroundColor: color.forest900,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    boxShadow: '0 4px 12px rgba(15,61,38,0.25)',
  },
  fabLabel: { fontFamily: font.semibold, color: color.forest900, marginTop: 2 },
});
