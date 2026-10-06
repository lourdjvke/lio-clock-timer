
(function() {
  if (window.LARPs) return;

  const eventListeners = new Map();
  let pendingCallbacks = new Map();
  let callbackIdCounter = 1;

  function registerCallback(resolve, reject) {
    const id = 'cb_' + (callbackIdCounter++) + '_' + Date.now();
    pendingCallbacks.set(id, { resolve, reject });
    return id;
  }

  // Handle messages dispatched from Android Native WebView or Simulated Environment
  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    const { type, callbackId, payload, error } = event.data;

    if (callbackId && pendingCallbacks.has(callbackId)) {
      const cb = pendingCallbacks.get(callbackId);
      pendingCallbacks.delete(callbackId);
      if (error) {
        cb.reject(new Error(error));
      } else {
        cb.resolve(payload);
      }
      return;
    }

    if (type && eventListeners.has(type)) {
      const handlers = eventListeners.get(type);
      handlers.forEach(fn => {
        try { fn(payload); } catch(e) { console.error('[LARPs Bridge Event Error]', e); }
      });
    }
  });

  // Call native Android bridge or emit to parent simulator frame
  function invokeNative(action, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackId = registerCallback(resolve, reject);
      const messagePayload = {
        action,
        params,
        callbackId,
        source: 'LARPs_WEBVIEW'
      };

      // 1. Native Kotlin WebChromeClient / JavascriptInterface (if present)
      if (window.AndroidBridge && typeof window.AndroidBridge[action] === 'function') {
        try {
          window.AndroidBridge[action](JSON.stringify(messagePayload));
          return;
        } catch (err) {
          console.warn('[AndroidBridge Call Error]', err);
        }
      }

      // 2. Direct Nitronplus Native Android Bridge (window.android)
      if (window.android && window.parent === window) {
        if (action === 'authenticateBiometrics') {
          if (navigator.credentials && navigator.credentials.create) {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const userID = new Uint8Array(16);
            window.crypto.getRandomValues(userID);

            const publicKeyCredentialCreationOptions = {
              challenge: challenge,
              rp: { name: "Lio Focus App", id: window.location.hostname || "localhost" },
              user: { id: userID, name: "user", displayName: "Lio User" },
              pubKeyCredParams: [{ type: "public-key", alg: -7 }],
              authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
              timeout: 60000
            };

            navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions })
              .then(() => {
                if (pendingCallbacks.has(callbackId)) {
                  pendingCallbacks.delete(callbackId);
                  resolve({ success: true, biometryType: 'FINGERPRINT_STRONG' });
                }
              })
              .catch(err => {
                console.warn('Real biometrics failed:', err);
                if (pendingCallbacks.has(callbackId)) {
                  pendingCallbacks.delete(callbackId);
                  resolve({ success: false, error: err.message });
                }
              });
            return;
          } else {
            setTimeout(() => {
              if (pendingCallbacks.has(callbackId)) {
                pendingCallbacks.delete(callbackId);
                resolve({ success: false, error: 'Hardware biometrics unsupported in this WebView context' });
              }
            }, 50);
            return;
          }
        }

        // Direct handled in dedicated modules below, resolve callback immediately with success flag
        setTimeout(() => {
          if (pendingCallbacks.has(callbackId)) {
            pendingCallbacks.delete(callbackId);
            resolve({ success: true, status: 'success', platform: 'android_native', action });
          }
        }, 30);
        return;
      }

      // 3. Browser simulation mode (communicates with LARPs device frame)
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'LARPS_NATIVE_CALL',
            ...messagePayload
          }, '*');
        }
      } catch (e) {
        // Ignored
      }

      // Auto-fallback timeout if no bridge response within 3s
      setTimeout(() => {
        if (pendingCallbacks.has(callbackId)) {
          const cb = pendingCallbacks.get(callbackId);
          pendingCallbacks.delete(callbackId);
          cb.resolve({ status: 'success', fallback: true, action });
        }
      }, 3000);
    });
  }

  window.LARPs = {
    version: '1.2.0',
    platform: (typeof window.android !== 'undefined') ? 'android_native' : ((typeof window.AndroidBridge !== 'undefined') ? 'android_custom' : 'android_simulator'),

    // ==========================================
    // 1. NATIVE ANDROID WIDGET INTEGRATION
    // ==========================================
    widget: {
      /**
       * Updates the Android Home Screen Widget remote views in real-time
       * @param {Object} data - Key/value pairs matching app.widget.json keys
       */
      update: function(data) {
        try {
          localStorage.setItem('larps_widget_data', JSON.stringify(data));
        } catch(e) {}

        // If running inside Android with floating widget support
        if (window.android) {
          try {
            const widgetEl = document.getElementById('lio_floating_widget') || document.getElementById('larps_widget_card');
            if (widgetEl) {
              const clockEl = widgetEl.querySelector('.widget-clock-text');
              if (clockEl && data.clock_display) clockEl.textContent = data.clock_display;
              const subEl = widgetEl.querySelector('.widget-sub-text');
              if (subEl && data.timer_status) subEl.textContent = data.timer_status;
              const progEl = widgetEl.querySelector('.widget-prog-bar');
              if (progEl && data.timer_progress !== undefined) progEl.style.width = data.timer_progress + '%';
            }
          } catch(e) {}
        }
        return invokeNative('updateWidgetData', { data });
      },
      /**
       * Forces an immediate refresh of widget layout & RemoteViews
       */
      refresh: function() {
        return invokeNative('refreshWidget', {});
      },
      /**
       * Retrieves currently stored widget state
       */
      getData: function() {
        try {
          const raw = localStorage.getItem('larps_widget_data');
          if (raw) return Promise.resolve(JSON.parse(raw));
        } catch(e) {}
        return invokeNative('getWidgetData', {});
      },
      /**
       * Launches a real system-level Android Floating Widget overlay on top of all apps!
       */
      launchFloatingWidget: function() {
        if (window.android) {
          try {
            if (typeof window.android.requestPermission === 'function') {
              window.android.requestPermission('SYSTEM_ALERT_WINDOW');
            }
            if (typeof window.android.showFloating === 'function') {
              window.android.showFloating('lio_floating_widget', '320x190', 'topright');
              return Promise.resolve({ success: true, mode: 'system_floating_overlay' });
            }
          } catch(e) {
            console.warn('[Floating Widget Launch Failed]', e);
          }
        }
        return invokeNative('launchFloatingWidget', {});
      },
      /**
       * Pins a direct widget launcher shortcut to Android home screen
       */
      pinShortcut: function(name = 'Lio Focus Widget', icon = 'icon.png', target = 'widget.html') {
        if (window.android && typeof window.android.createShortcut === 'function') {
          try {
            window.android.createShortcut(name, icon, target);
            return Promise.resolve({ success: true, pinned: true });
          } catch(e) {
            console.warn('[Pin Shortcut Error]', e);
          }
        }
        return invokeNative('pinShortcut', { name, icon, target });
      }
    },

    // ==========================================
    // 2. DEVICE PUSH & RICH NOTIFICATIONS
    // ==========================================
    notifications: {
      /**
       * Sends an intricate, fully custom Android device notification
       * with custom sound, vibration rhythm, media preview, and action buttons.
       */
      dispatch: function(payload) {
        const title = payload.title || 'Lio Notification';
        const body = payload.body || '';
        const channelId = payload.channelId || 'lio_focus_alerts';
        const channelName = payload.channelName || 'Lio Alarms & Timer';
        const vibPattern = payload.vibrationPattern || [0, 250, 150, 250];

        // 1. Android Native Execution (Real device notification in system drawer!)
        if (window.android) {
          try {
            // Request POST_NOTIFICATIONS permission
            if (typeof window.android.requestPermission === 'function') {
              window.android.requestPermission('POST_NOTIFICATIONS');
            }
            // Create notification channel with sound, vibration, banner
            if (typeof window.android.newNotificationChannel === 'function') {
              window.android.newNotificationChannel(channelId, 'sound,vibrate,banner,lockscreen');
            }
            // Fire the native system notification
            if (typeof window.android.showNotification === 'function') {
              window.android.showNotification(channelId, title, body);
            }
            // Vibrate physical device
            if (typeof window.android.vibrate === 'function') {
              window.android.vibrate(vibPattern);
            }
            // Real audio / speech feedback
            if (payload.sound && typeof window.android.speak === 'function') {
              window.android.speak(title + '. ' + body, 'notification');
            }
          } catch (err) {
            console.warn('[Native Android Notification Error]', err);
          }
        }

        // 2. Browser fallback for web testing
        if (typeof Notification !== 'undefined') {
          try {
            if (Notification.permission === 'granted') {
              new Notification(title, { body, icon: 'icon.png' });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission().then(p => {
                if (p === 'granted') new Notification(title, { body, icon: 'icon.png' });
              });
            }
          } catch (e) {}
        }

        return invokeNative('dispatchNotification', {
          id: payload.id || 'notif_' + Date.now(),
          title,
          body,
          channelId,
          channelName,
          priority: payload.priority || 'high',
          sound: payload.sound || { type: 'sci_fi' },
          vibrationPattern: vibPattern,
          richMedia: payload.richMedia || null,
          actions: payload.actions || [],
          deepLink: payload.deepLink || null
        });
      },
      schedule: function(payload, delaySeconds) {
        return invokeNative('scheduleNotification', { payload, delaySeconds });
      },
      cancel: function(notificationId) {
        return invokeNative('cancelNotification', { notificationId });
      }
    },

    // ==========================================
    // 3. BIOMETRIC AUTHENTICATION (FINGERPRINT/FACE)
    // ==========================================
    biometrics: {
      /**
       * Prompts biometric authentication on Android
       * @param {Object} options - { title, subtitle, cancelTitle }
       * @returns {Promise<{ success: boolean, biometryType?: string }>}
       */
      authenticate: function(options = {}) {
        // Haptic feedback pulse on mobile
        if (window.android && typeof window.android.vibrate === 'function') {
          window.android.vibrate([0, 50, 40, 50]);
        } else if (navigator.vibrate) {
          navigator.vibrate([50, 40, 50]);
        }

        return invokeNative('authenticateBiometrics', {
          title: options.title || 'Biometric Verification Required',
          subtitle: options.subtitle || 'Scan fingerprint or use Face Unlock to continue',
          cancelTitle: options.cancelTitle || 'Cancel',
          allowDeviceCredential: options.allowDeviceCredential ?? true
        });
      },
      isAvailable: function() {
        return invokeNative('checkBiometricsAvailable', {});
      }
    },

    // ==========================================
    // 4. PERMISSIONS & MOBILE BRIDGES
    // ==========================================
    permissions: {
      /**
       * Requests permissions with persistent retention on Android
       * @param {string|string[]} permissions - 'notifications' | 'camera' | 'location' | 'vibrate' | 'overlay'
       */
      request: function(permissions) {
        const list = Array.isArray(permissions) ? permissions : [permissions];

        if (window.android && typeof window.android.requestPermission === 'function') {
          list.forEach(p => {
            let permKey = String(p).toUpperCase();
            if (permKey === 'NOTIFICATIONS' || permKey === 'NOTIFICATION') permKey = 'POST_NOTIFICATIONS';
            if (permKey === 'OVERLAY' || permKey === 'WIDGET') permKey = 'SYSTEM_ALERT_WINDOW';
            try {
              window.android.requestPermission(permKey);
            } catch(e) {
              console.warn('[Native Permission Request Failed]', permKey, e);
            }
          });
        }

        if (typeof Notification !== 'undefined' && Notification.requestPermission) {
          Notification.requestPermission().catch(() => {});
        }

        return invokeNative('requestPermissions', { permissions: list });
      },
      status: function(permission) {
        return invokeNative('getPermissionStatus', { permission });
      }
    },

    camera: {
      captureImage: function(options = {}) {
        return invokeNative('captureCameraImage', options);
      }
    },

    location: {
      getCurrentPosition: function(options = {}) {
        return invokeNative('getCurrentLocation', options);
      },
      watchPosition: function(callback, options = {}) {
        const watchId = 'watch_' + Date.now();
        eventListeners.set('location_update_' + watchId, [callback]);
        invokeNative('startLocationWatch', { watchId, options });
        return watchId;
      }
    },

    media: {
      pickFromGallery: function(options = {}) {
        return invokeNative('pickGalleryMedia', options);
      }
    },

    // ==========================================
    // 5. BACKGROUND SYNCHRONIZATION (WORKMANAGER)
    // ==========================================
    backgroundSync: {
      register: function(config) {
        return invokeNative('registerBackgroundSync', {
          tag: config.tag || 'larps_bg_sync',
          intervalMinutes: config.intervalMinutes || 15,
          requiresNetwork: config.requiresNetwork ?? true,
          requiresBatteryNotLow: config.requiresBatteryNotLow ?? true,
          endpointUrl: config.endpointUrl || ''
        });
      },
      cancel: function(tag) {
        return invokeNative('cancelBackgroundSync', { tag });
      }
    },

    // ==========================================
    // 6. DEEP LINKING & EVENTS
    // ==========================================
    deepLink: {
      onReceive: function(callback) {
        if (!eventListeners.has('deep_link')) {
          eventListeners.set('deep_link', []);
        }
        eventListeners.get('deep_link').push(callback);
        invokeNative('checkInitialDeepLink', {}).then(res => {
          if (res && res.deepLink) callback(res.deepLink, res.params || {});
        });
      }
    },

    // ==========================================
    // 7. SYSTEM STATUS BAR & EDGE-TO-EDGE IMMERSION
    // ==========================================
    statusBar: {
      /**
       * Dynamically controls the Android status bar and navigation bar:
       * - Draw under / overlay status bar
       * - Light/Dark icons for pure white or dark themes
       * - Fullscreen mode
       */
      setStyle: function(options = {}) {
        const isFullScreen = Boolean(options.fullScreen);

        // 1. Native HTML5 Fullscreen API
        try {
          if (isFullScreen) {
            if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else if (document.documentElement.webkitRequestFullscreen) {
              document.documentElement.webkitRequestFullscreen();
            }
          } else {
            if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen().catch(() => {});
            }
          }
        } catch(e) {}

        // 2. Dynamic theme-color meta for Android system status & nav bar tinting
        if (options.backgroundColor) {
          let metaTheme = document.querySelector('meta[name="theme-color"]');
          if (!metaTheme) {
            metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            document.head.appendChild(metaTheme);
          }
          metaTheme.content = options.backgroundColor;
        }

        // 3. Edge-to-edge class for safe area styling
        document.body.classList.toggle('edge-to-edge-fullscreen', isFullScreen);

        return invokeNative('setSystemBarStyle', {
          theme: options.theme || 'light',
          backgroundColor: options.backgroundColor || '#FFFFFF',
          drawUnder: options.drawUnder ?? true,
          fullScreen: isFullScreen,
        });
      },
      setFullScreen: function(enabled) {
        return this.setStyle({ fullScreen: Boolean(enabled) });
      }
    },

    // ==========================================
    // 8. AUDIO FEEDBACK & HAPTICS
    // ==========================================
    haptics: {
      vibrate: function(pattern = [0, 200, 100, 200]) {
        if (window.android && typeof window.android.vibrate === 'function') {
          try {
            window.android.vibrate(pattern);
            return Promise.resolve({ success: true });
          } catch(e) {}
        }
        if (navigator.vibrate) {
          try { navigator.vibrate(pattern); } catch(e) {}
        }
        return invokeNative('triggerVibration', { pattern });
      }
    }
  };

  // Signal bridge ready
  window.dispatchEvent(new CustomEvent('larpsready', { detail: { bridge: window.LARPs } }));
  console.log('[LARPs Engine] Native Bridge Initialized (v1.2.0, platform=' + window.LARPs.platform + ')');
})();
