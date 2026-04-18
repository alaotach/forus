import 'expo-router/entry';
import './services/push-notifications';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
