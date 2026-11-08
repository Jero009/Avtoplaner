import { Capacitor, registerPlugin, type PermissionState } from '@capacitor/core';
import type { NativeCalendarAdapter, DeviceCalendarOp } from './sync';

/** A writable calendar on the device (CalendarProvider row). */
export interface DeviceCalendarInfo {
  /** CalendarProvider _ID, as a string (it may exceed JS safe ints on some devices). */
  id: string;
  name: string;
  accountName: string | null;
}

export interface DeviceCalendarPermissions {
  readCalendar: PermissionState;
  writeCalendar: PermissionState;
}

export interface DeviceCalendarApplyResult {
  /** Native event ids of the created ops, aligned with the create ops' order. */
  createdIds: number[];
}

export interface DeviceCalendarPluginInterface {
  checkPermissions(): Promise<DeviceCalendarPermissions>;
  requestPermissions(): Promise<DeviceCalendarPermissions>;
  listWritableCalendars(): Promise<{ calendars: DeviceCalendarInfo[] }>;
  createCalendar(options: { name: string }): Promise<{ id: string }>;
  applyChanges(options: { ops: DeviceCalendarOp[] }): Promise<DeviceCalendarApplyResult>;
}

/**
 * Custom in-app Capacitor plugin (android/…/DeviceCalendarPlugin.kt) doing
 * CalendarProvider CRUD. Chosen over @capacitor-community/calendar because
 * that package is not published on npm — a small purpose-built plugin also
 * gives us batched atomic apply + per-calendar delete scoping.
 */
export const DeviceCalendarPlugin = registerPlugin<DeviceCalendarPluginInterface>(
  'DeviceCalendar',
  {
    web: () =>
      import('./web').then((module) => new module.DeviceCalendarWeb()),
  },
);

/** Device-calendar writes exist only in the Android app. */
export function deviceCalendarSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Adapter over the plugin for syncDeviceCalendar (injectable in tests). */
export function createNativeCalendarAdapter(): NativeCalendarAdapter {
  return {
    checkPermissions: () => DeviceCalendarPlugin.checkPermissions(),
    applyChanges: (ops) => DeviceCalendarPlugin.applyChanges({ ops }),
  };
}

export function permissionsGranted(permissions: DeviceCalendarPermissions): boolean {
  return permissions.readCalendar === 'granted' && permissions.writeCalendar === 'granted';
}
