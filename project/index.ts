import './services/push-notifications';
import { AppRegistry, Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widget-task-handler';
import { registerForusWidgetHeadlessTask } from './services/widget-headless-task';

registerForusWidgetHeadlessTask();

if (
	Platform.OS === 'android' &&
	typeof (AppRegistry as any)?.registerHeadlessTask === 'function'
) {
	registerWidgetTaskHandler(widgetTaskHandler);
}

require('expo-router/entry');
