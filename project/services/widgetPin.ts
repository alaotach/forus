import { NativeModules, Platform } from 'react-native';

type WidgetPinResult = {
  ok: boolean;
  message?: string;
};

type WidgetPinNativeModule = {
  requestPinWidgetForSize: (cols: number, rows: number) => Promise<boolean>;
};

const widgetPinModule: WidgetPinNativeModule | undefined = NativeModules.WidgetPinModule;

export async function requestWidgetPin(cols: number, rows: number): Promise<WidgetPinResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Home widgets are only available on Android.' };
  }

  if (!widgetPinModule?.requestPinWidgetForSize) {
    return { ok: false, message: 'Widget pin module is not available in this build.' };
  }

  try {
    const pinned = await widgetPinModule.requestPinWidgetForSize(cols, rows);
    if (!pinned) {
      return { ok: false, message: 'Launcher did not accept widget pin request.' };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error?.message || 'Failed to request widget pin.' };
  }
}
