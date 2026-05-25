/**
 * WebdriverIO + Appium — Android smoke tests (local only).
 *
 * Prerequisites: see docs/android-smoke-tests.md
 */
/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Capabilities, Options } from '@wdio/types';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const appiumBin = path.join(rootDir, 'node_modules', '.bin', 'appium');

const apkPath =
  process.env.ANDROID_APK_PATH
  ?? path.join(rootDir, 'android/app/build/outputs/apk/debug/app-debug.apk');

const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'Android',
  'appium:app': apkPath,
  'appium:appPackage': process.env.ANDROID_APP_PACKAGE ?? 'io.ionic.starter',
  'appium:appActivity': process.env.ANDROID_APP_ACTIVITY ?? '.MainActivity',
  'appium:autoGrantPermissions': true,
  'appium:newCommandTimeout': 120,
  // UiAutomator2 option not yet in @wdio/types
  'appium:chromedriverAutodownload': true,
} as Capabilities.RequestedStandaloneCapabilities;

export const config: Options.Testrunner & Capabilities.WithRequestedTestrunnerCapabilities = {
  runner: 'local',

  specs: ['./tests/smoke/android/**/*.spec.ts'],

  maxInstances: 1,

  capabilities: [androidCapabilities],

  services: [
    [
      'appium',
      {
        command: appiumBin,
        args: { relaxedSecurity: true },
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
  },

  logLevel: 'info',
};
