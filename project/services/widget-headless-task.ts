import { AppRegistry, Platform } from 'react-native';
import { readCoupleIdentityFromStorage, requestForusWidgetUpdate, syncWidgetCacheFromFirestore } from './androidWidget';

const TASK_NAME = 'ForusWidgetRefreshTask';
const LOG_PREFIX = '[widget-headless]';

type WidgetRefreshPayload = {
  type?: string;
  coupleCode?: string;
  from?: string;
};

async function handleWidgetRefresh(payload: WidgetRefreshPayload) {
  if (Platform.OS !== 'android') return;

  const identity = await readCoupleIdentityFromStorage();
  if (!identity?.coupleCode || !identity?.nickname) {
    console.log(`${LOG_PREFIX} skipped-no-identity`);
    return;
  }

  if (String(payload?.type || '') !== 'widget-update') {
    console.log(`${LOG_PREFIX} skipped-non-widget-payload`, payload);
    return;
  }

  if (payload?.coupleCode && String(payload.coupleCode) !== identity.coupleCode) {
    console.log(`${LOG_PREFIX} skipped-couple-mismatch`, {
      expected: identity.coupleCode,
      actual: payload.coupleCode,
    });
    return;
  }

  try {
    await syncWidgetCacheFromFirestore(identity);
    await requestForusWidgetUpdate(identity.coupleCode);
    console.log(`${LOG_PREFIX} refreshed`, {
      coupleCode: identity.coupleCode,
      from: payload?.from || 'System',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} refresh-failed`, error);
  }
}

export function registerForusWidgetHeadlessTask() {
  if (
    Platform.OS !== 'android' ||
    typeof (AppRegistry as any)?.registerHeadlessTask !== 'function'
  ) {
    return;
  }

  AppRegistry.registerHeadlessTask(TASK_NAME, () => async (data: WidgetRefreshPayload) => {
    await handleWidgetRefresh(data || {});
  });

  console.log(`${LOG_PREFIX} registered`, { task: TASK_NAME });
}
