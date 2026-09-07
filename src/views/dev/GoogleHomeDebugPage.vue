<!--
  GH02 spike (v1.6.0, ADR-036) — temporary debug page for the GoogleHome
  Capacitor plugin. Not a product surface. Drives requestGoogleHomePermissions
  -> listDevices -> readDeviceState/executeAction directly, printing raw
  results so it's usable without remote devtools on a physical device.
-->
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>GH02 — Google Home Debug</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-button expand="block" @click="run('ping')">ping()</ion-button>
      <ion-button expand="block" @click="run('requestGoogleHomePermissions')">
        requestGoogleHomePermissions()
      </ion-button>
      <ion-button expand="block" @click="run('listDevices')">listDevices()</ion-button>

      <ion-item>
        <ion-label position="stacked">deviceId</ion-label>
        <ion-input v-model="deviceId" placeholder="paste an id from listDevices()"></ion-input>
      </ion-item>
      <ion-button expand="block" @click="run('readDeviceState')">readDeviceState()</ion-button>
      <ion-button expand="block" color="success" @click="run('executeAction', { action: 'on' })">
        executeAction(on)
      </ion-button>
      <ion-button expand="block" color="medium" @click="run('executeAction', { action: 'off' })">
        executeAction(off)
      </ion-button>

      <pre class="output">{{ output }}</pre>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonItem, IonLabel, IonInput } from '@ionic/vue';
import { registerPlugin } from '@capacitor/core';

interface GoogleHomePlugin {
  ping(): Promise<unknown>;
  requestGoogleHomePermissions(): Promise<unknown>;
  listDevices(): Promise<unknown>;
  readDeviceState(options: { deviceId: string }): Promise<unknown>;
  executeAction(options: { deviceId: string; action: 'on' | 'off' }): Promise<unknown>;
}

const GoogleHome = registerPlugin<GoogleHomePlugin>('GoogleHome');

const deviceId = ref('');
const output = ref('(no calls yet)');

async function run(method: keyof GoogleHomePlugin, extra: Record<string, unknown> = {}) {
  output.value = `calling ${method}()...`;
  try {
    const args = method === 'readDeviceState' || method === 'executeAction'
      ? { deviceId: deviceId.value, ...extra }
      : undefined;
    const fn = GoogleHome[method] as (options?: unknown) => Promise<unknown>;
    const result = await fn(args);
    output.value = JSON.stringify(result, null, 2);
  } catch (e) {
    output.value = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}
</script>

<style scoped>
.output {
  margin-top: 16px;
  padding: 12px;
  background: #f4f4f4;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}
</style>
