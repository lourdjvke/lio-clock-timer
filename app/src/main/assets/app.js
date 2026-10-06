// Lio Clock & Timer Application Controller
(function() {
  let isTimerRunning = false;
  let timerSecondsLeft = 25 * 60; // 25 minutes default
  let timerTotalSeconds = 25 * 60;
  let timerInterval = null;
  let currentTheme = 'white';

  const hourMinEl = document.getElementById('hourMin');
  const secDigitEl = document.getElementById('secDigit');
  const ampmEl = document.getElementById('ampmDisplay');
  const dateDisplayEl = document.getElementById('dateDisplay');
  const timerCountdownEl = document.getElementById('timerCountdown');
  const timerProgressEl = document.getElementById('timerProgress');
  const timerBtnText = document.getElementById('timerBtnText');
  const timerBtnIcon = document.getElementById('timerBtnIcon');
  const statusBanner = document.getElementById('statusBanner');
  const statusText = document.getElementById('statusText');
  const secureSettingsCard = document.getElementById('secureSettingsCard');

  // Smooth fade out for the custom splash screen
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
      }, 500);
    }
  }, 1800);

  function showStatus(msg) {
    statusText.textContent = msg;
    statusBanner.style.display = 'block';
    setTimeout(() => {
      statusBanner.style.display = 'none';
    }, 4000);
  }

  // 1. Local Real-Time Digital Clock
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12 || 12;
    const formattedHours = String(hours).padStart(2, '0');

    hourMinEl.textContent = `${formattedHours}:${minutes}`;
    secDigitEl.textContent = `:${seconds}`;
    ampmEl.textContent = `${ampm} • LOCAL TIME`;

    // Date
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    dateDisplayEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;

    // Periodic sync with Android Home Widget every 15s
    if (now.getSeconds() % 15 === 0) {
      syncToWidget();
    }
  }

  setInterval(updateClock, 1000);
  updateClock();

  // 2. Focus Timer
  function formatTimer(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Inject widget.html as a dynamic file asset for compiler downloads
  function updateTimerDisplay() {
    timerCountdownEl.textContent = formatTimer(timerSecondsLeft);
    const pct = Math.max(0, (timerSecondsLeft / timerTotalSeconds) * 100);
    timerProgressEl.style.width = `${pct}%`;
  }

  function toggleTimer() {
    if (isTimerRunning) {
      // Pause
      clearInterval(timerInterval);
      isTimerRunning = false;
      timerBtnText.textContent = 'Resume Focus Timer';
      timerBtnIcon.textContent = '▶';
      showStatus('Timer Paused');
    } else {
      // Start
      isTimerRunning = true;
      timerBtnText.textContent = 'Pause Timer';
      timerBtnIcon.textContent = '⏸';
      showStatus('Focus Timer Active');

      timerInterval = setInterval(() => {
        if (timerSecondsLeft > 0) {
          timerSecondsLeft--;
          updateTimerDisplay();
        } else {
          clearInterval(timerInterval);
          isTimerRunning = false;
          timerBtnText.textContent = 'Start Focus Timer';
          timerBtnIcon.textContent = '▶';
          timerSecondsLeft = timerTotalSeconds;
          updateTimerDisplay();

          // Fire local completed notification with chime audio!
          fireNotification({
            title: '⏰ Focus Session Finished',
            body: '25 minutes completed. Great work! Take a 5-minute break.',
            sound: 'potion',
            vibration: [0, 300, 150, 300]
          });
        }
      }, 1000);
    }
    syncToWidget();
  }

  document.getElementById('btnToggleTimer').addEventListener('click', toggleTimer);

  // 3. Android Home Screen Widget Sync
  function syncToWidget() {
    const now = new Date();
    let hours = now.getHours() % 12 || 12;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const pct = Math.round((timerSecondsLeft / timerTotalSeconds) * 100);

    const widgetData = {
      clock_display: timeStr,
      timer_status: isTimerRunning ? `TIMER RUNNING • ${formatTimer(timerSecondsLeft)}` : `TIMER IDLE • ${formatTimer(timerSecondsLeft)}`,
      date_display: dateDisplayEl.textContent,
      timer_progress: pct,
      focus_mode: isTimerRunning ? 'Deep Focus Session' : 'Ready'
    };

    if (window.LARPs?.widget) {
      window.LARPs.widget.update(widgetData).then(() => {
        showStatus('✓ Synced with Android Widget');
      }).catch(err => {
        console.warn('Widget update error', err);
      });
    }
  }

  document.getElementById('btnSyncWidget').addEventListener('click', () => {
    syncToWidget();
    // Pin shortcut to Android home screen
    if (window.LARPs?.widget) {
      window.LARPs.widget.pinShortcut('Lio Focus Widget', 'icon.png', 'widget.html');
      showStatus('🧩 Synced! Lio Home Shortcut added!');
    } else {
      showStatus('Widget Sim: Update Dispatched');
    }
  });

  // 4. Custom App Device Notification with Audio & Vibration
  function fireNotification(opts = {}) {
    if (window.LARPs?.notifications) {
      window.LARPs.notifications.dispatch({
        title: opts.title || '⏰ Lio Focus Reminder',
        body: opts.body || 'Your 25-minute deep work block is actively tracking.',
        channelId: 'lio_focus_alerts',
        channelName: 'Lio Focus Alarms',
        priority: 'high',
        sound: {
          type: opts.sound || 'sci_fi',
          frequency: 880
        },
        vibrationPattern: opts.vibration || [0, 200, 100, 200],
        richMedia: {
          type: 'big_picture',
          imageUrl: 'https://picsum.photos/seed/lioclock/600/300'
        },
        actions: [
          { id: 'act_pause', title: 'Pause Timer', deepLink: 'larps://timer/toggle' },
          { id: 'act_reset', title: 'Reset', deepLink: 'larps://timer/reset' }
        ],
        deepLink: 'larps://screen/clock'
      }).then(() => {
        showStatus('🔔 Custom audio notification dispatched!');
      });
    } else {
      showStatus('🔔 Simulation: Local notification dispatched');
    }
  }

  document.getElementById('btnCustomNotification').addEventListener('click', () => {
    fireNotification();
  });

  // 5. Hardware Biometric Authentication (Fingerprint / Face Unlock)
  document.getElementById('btnBiometricAuth').addEventListener('click', () => {
    if (window.LARPs?.biometrics) {
      // Trigger haptic vibration first
      if (window.LARPs.haptics) {
        window.LARPs.haptics.vibrate([0, 50, 40, 50]);
      }
      
      // Request real hardware biometric verification (no fake modals)
      window.LARPs.biometrics.authenticate({
        title: 'Unlock Lio Settings',
        subtitle: 'Please verify your identity using fingerprint or device PIN',
        cancelTitle: 'Cancel'
      }).then(res => {
        if (res && res.success) {
          secureSettingsCard.style.display = 'block';
          showStatus('🔓 Settings Unlocked via Biometrics!');
        } else {
          showStatus('Biometric Verification Failed');
        }
      }).catch(err => {
        console.warn('[Biometric Error]', err);
        showStatus('Biometrics Unsupported or Cancelled');
      });
    } else {
      showStatus('Biometrics API Unavailable');
    }
  });

  // 6. Explicit Request Permissions Button
  document.getElementById('btnRequestPermission').addEventListener('click', () => {
    if (window.LARPs?.permissions) {
      window.LARPs.permissions.request(['notifications', 'vibrate']);
      showStatus('🛡️ Requesting device permissions from Android OS...');
    } else {
      showStatus('🛡️ Browser: Permissions simulated');
    }
  });

  // 7. Fullscreen & Edge-to-Edge Drawing Toggle
  let isFullscreen = false;
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    
    // Toggle Document Fullscreen
    if (isFullscreen) {
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

    if (window.LARPs?.statusBar) {
      window.LARPs.statusBar.setStyle({
        theme: currentTheme === 'midnight' ? 'dark' : 'light',
        backgroundColor: currentTheme === 'midnight' ? '#09090B' : '#FFFFFF',
        drawUnder: true,
        fullScreen: isFullscreen
      });
    }

    document.body.classList.toggle('edge-to-edge-fullscreen', isFullscreen);
    showStatus(isFullscreen ? 'Edge-to-Edge Immersive: ON' : 'Edge-to-Edge Normal');
  });

  // 8. Bottom Theme Dock (Color circles)
  const themeColors = {
    white: '#FFFFFF',
    ocean: '#F0F9FF',
    sage: '#F2FBF5',
    sunset: '#FFF7ED',
    midnight: '#09090B'
  };

  document.querySelectorAll('.color-palette .color-circle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.color-palette .color-circle').forEach(b => b.classList.remove('active'));
      const circle = e.currentTarget;
      circle.classList.add('active');
      const theme = circle.dataset.theme;
      currentTheme = theme;

      document.body.className = `theme-${theme}`;

      // Update meta theme-color tag dynamically
      const hexColor = themeColors[theme] || '#FFFFFF';
      const metaTheme = document.getElementById('themeColorMeta');
      if (metaTheme) metaTheme.setAttribute('content', hexColor);

      // Pass parameters to Android status bar to draw over or under & match theme!
      if (window.LARPs?.statusBar) {
        const isLight = theme !== 'midnight';
        window.LARPs.statusBar.setStyle({
          theme: isLight ? 'light' : 'dark', // 'light' means dark status icons on light background
          backgroundColor: hexColor,
          drawUnder: true,
          fullScreen: isFullscreen
        });
      }

      showStatus(`Theme: ${theme.toUpperCase()}`);
    });
  });

  // 9. Inbound Deep Link Routing (Handling notification action taps)
  if (window.LARPs?.deepLink) {
    window.LARPs.deepLink.onReceive((url) => {
      if (url.includes('toggle')) {
        toggleTimer();
      } else if (url.includes('reset')) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        timerSecondsLeft = timerTotalSeconds;
        timerBtnText.textContent = 'Start Focus Timer';
        timerBtnIcon.textContent = '▶';
        updateTimerDisplay();
        showStatus('Timer Reset via Deep Link');
      }
    });
  }

  // Initial status bar setup (pure white light theme, drawing under top mobile bar)
  if (window.LARPs?.statusBar) {
    window.LARPs.statusBar.setStyle({
      theme: 'light',
      backgroundColor: '#FFFFFF',
      drawUnder: true,
      fullScreen: false
    });
  }

  // Request native permissions automatically 1.2s after startup so that they get prompted immediately!
  if (window.LARPs?.permissions) {
    setTimeout(() => {
      window.LARPs.permissions.request(['notifications', 'vibrate']);
    }, 1200);
  }
})();
