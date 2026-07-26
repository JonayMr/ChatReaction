document.addEventListener('DOMContentLoaded', async () => {
  const imageBtn = document.getElementById('choose-image');
  const audioBtn = document.getElementById('choose-audio');
  const imagePathSpan = document.getElementById('image-path');
  const audioPathSpan = document.getElementById('audio-path');
  const form = document.getElementById('reaction-form');
  const reactionsList = document.getElementById('reactions-list');
  const globalDirectionSelect = document.getElementById('global-direction');
  const globalVolume = document.getElementById('global-volume');
  const globalVolumeValue = document.getElementById('global-volume-value');
  const applyVolumeBtn = document.getElementById('apply-volume');
  const volumeStatus = document.getElementById('volume-status');
  const appDialogModal = document.getElementById('app-dialog-modal');
  const appDialogTitle = document.getElementById('app-dialog-title');
  const appDialogMessage = document.getElementById('app-dialog-message');
  const appDialogOk = document.getElementById('app-dialog-ok');
  const appDialogCancel = document.getElementById('app-dialog-cancel');
  const twitchCta = document.querySelector('.twitch-cta');
  const previewImage = document.getElementById('preview-image');
  const previewAudio = document.getElementById('preview-audio');

  let imagePath = null;
  let audioPath = null;
  let editingId = null;
  let previewExitTimer = null;
  let previewAudioStopTimer = null;
  let previewActive = false;
  let previewExiting = false;
  const previewQueue = [];

  function normalizeDirection(dir) {
    const d = String(dir || '').toLowerCase();
    return (d === 'left' || d === 'top' || d === 'bottom') ? d : 'right';
  }

  function clearPreviewClasses() {
    if (!previewImage) return;
    previewImage.classList.remove(
      'preview-in-right', 'preview-out-right',
      'preview-in-left', 'preview-out-left',
      'preview-in-top', 'preview-out-top',
      'preview-in-bottom', 'preview-out-bottom'
    );
  }

  function enqueuePreviewReaction(reaction) {
    previewQueue.push(reaction);
    processPreviewQueue();
  }

  function processPreviewQueue() {
    if (!previewImage || !previewAudio) return;
    if (previewActive || previewExiting) return;
    const item = previewQueue.shift();
    if (!item) return;

    previewActive = true;
    const direction = normalizeDirection(globalDirectionSelect ? globalDirectionSelect.value : 'right');
    const inClass = 'preview-in-' + direction;
    const outClass = 'preview-out-' + direction;
    const imageWidth = Number.isFinite(Number(item.imageWidth)) && Number(item.imageWidth) > 0
      ? Math.round(Number(item.imageWidth))
      : (Number.isFinite(Number(item.imageHeight)) && Number(item.imageHeight) > 0
        ? Math.round(Number(item.imageHeight))
        : 256);
    const volume = Math.max(0, Math.min(1, Number(globalVolume.value || 1)));

    if (previewExitTimer) clearTimeout(previewExitTimer);
    if (previewAudioStopTimer) clearTimeout(previewAudioStopTimer);
    previewExitTimer = null;
    previewAudioStopTimer = null;

    clearPreviewClasses();

    if (item.image) {
      previewImage.src = 'file://' + encodeURI(item.image);
      previewImage.style.width = `${imageWidth}px`;
      previewImage.style.height = 'auto';
      previewImage.style.display = 'block';
      previewImage.style.animation = 'none';
      void previewImage.offsetHeight;
      previewImage.style.animation = '';
      requestAnimationFrame(() => previewImage.classList.add(inClass));
    }

    if (item.audio) {
      previewAudio.src = 'file://' + encodeURI(item.audio);
      previewAudio.volume = volume;
      previewAudio.loop = false;
      previewAudio.pause();
      previewAudio.currentTime = 0;
      previewAudio.load();
      previewAudio.play().catch(() => {});
    }

    previewExitTimer = setTimeout(() => {
      previewExiting = true;
      clearPreviewClasses();
      if (item.image) {
        previewImage.classList.add(outClass);
        previewImage.addEventListener('animationend', () => {
          previewImage.style.display = 'none';
          clearPreviewClasses();
          previewExiting = false;
          previewActive = false;
          processPreviewQueue();
        }, { once: true });
      } else {
        previewExiting = false;
        previewActive = false;
        processPreviewQueue();
      }
    }, 2500);

    previewAudioStopTimer = setTimeout(() => {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    }, 3200);
  }

  function showDialog(opts) {
    const title = opts && opts.title ? String(opts.title) : 'Notice';
    const message = opts && opts.message ? String(opts.message) : '';
    const confirmText = opts && opts.confirmText ? String(opts.confirmText) : 'OK';
    const cancelText = opts && opts.cancelText ? String(opts.cancelText) : '';

    return new Promise((resolve) => {
      if (!appDialogModal || !appDialogTitle || !appDialogMessage || !appDialogOk || !appDialogCancel) {
        resolve(true);
        return;
      }

      appDialogTitle.textContent = title;
      appDialogMessage.textContent = message;
      appDialogOk.textContent = confirmText;

      if (cancelText) {
        appDialogCancel.textContent = cancelText;
        appDialogCancel.style.display = 'inline-block';
      } else {
        appDialogCancel.style.display = 'none';
      }

      const finish = (result) => {
        appDialogModal.classList.remove('active');
        appDialogModal.setAttribute('aria-hidden', 'true');
        appDialogOk.removeEventListener('click', onOk);
        appDialogCancel.removeEventListener('click', onCancel);
        appDialogModal.removeEventListener('click', onBackdrop);
        resolve(result);
      };

      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (ev) => {
        if (ev.target === appDialogModal && cancelText) finish(false);
      };

      appDialogOk.addEventListener('click', onOk);
      appDialogCancel.addEventListener('click', onCancel);
      appDialogModal.addEventListener('click', onBackdrop);

      appDialogModal.classList.add('active');
      appDialogModal.setAttribute('aria-hidden', 'false');
    });
  }

  async function showAlert(message, title) {
    await showDialog({
      title: title || 'Notice',
      message,
      confirmText: 'OK'
    });
  }

  async function showConfirm(message, title) {
    return showDialog({
      title: title || 'Confirm',
      message,
      confirmText: 'Yes, continue',
      cancelText: 'Cancel'
    });
  }

  if (twitchCta && window.links && window.links.openExternal) {
    twitchCta.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const href = twitchCta.getAttribute('href');
      const res = await window.links.openExternal(href);
      if (!res || !res.ok) {
        await showAlert('Could not open the link in the default browser.', 'Error');
      }
    });
  }

  async function refreshList() {
    const items = await window.store.listReactions();
    reactionsList.innerHTML = '';
    items.sort((a, b) => a.trigger.localeCompare(b.trigger));

    for (const it of items) {
      const el = document.createElement('div');
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'space-between';
      el.style.padding = '8px';
      el.style.border = '1px solid rgba(255,255,255,0.04)';
      el.style.borderRadius = '8px';
      el.style.marginBottom = '8px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '12px';

      const thumb = document.createElement('img');
      thumb.src = it.image ? ('file://' + encodeURI(it.image)) : '';
      thumb.width = 64;
      thumb.style.borderRadius = '6px';
      left.appendChild(thumb);

      const info = document.createElement('div');
      info.innerHTML = `<strong style="color:#fff">${it.trigger}</strong><div style="font-size:12px;color:#999">${it.audio ? it.audio.split(/[\\/]/).pop() : 'No audio'} · Trigger threshold: ${it.threshold || 1}</div>`;
      left.appendChild(info);

      el.appendChild(left);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';

      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.onclick = () => {
        editingId = it.id;
        document.getElementById('trigger').value = it.trigger || '';
        document.getElementById('threshold').value = it.threshold !== undefined ? it.threshold : 1;
        imagePath = it.image || null;
        audioPath = it.audio || null;
        imagePathSpan.textContent = imagePath || '';
        audioPathSpan.textContent = audioPath || '';
      };

      const test = document.createElement('button');
      test.textContent = 'Test';
      test.onclick = async () => {
        if (!it.image && !it.audio) {
          await showAlert('This reaction has no image or audio to test.', 'No media');
          return;
        }
        enqueuePreviewReaction(it);
      };

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.style.background = 'linear-gradient(135deg,#ff6b6b,#d7263d)';
      del.style.color = '#fff4f4';
      del.onclick = async () => {
        const accepted = await showConfirm('Are you sure you want to delete this reaction?', 'Delete reaction');
        if (!accepted) return;
        const res = await window.store.deleteReaction(it.id);
        if (res && res.ok) {
          await refreshList();
        } else {
          await showAlert('Error deleting reaction: ' + (res && res.error), 'Error');
        }
      };

      actions.appendChild(edit);
  actions.appendChild(test);
      actions.appendChild(del);
      el.appendChild(actions);

      reactionsList.appendChild(el);
    }
  }

  imageBtn.addEventListener('click', async () => {
    const p = await window.api.openFile('image');
    if (p) {
      imagePath = p;
      imagePathSpan.textContent = p;
    }
  });

  audioBtn.addEventListener('click', async () => {
    const p = await window.api.openFile('audio');
    if (p) {
      audioPath = p;
      audioPathSpan.textContent = p;
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const trigger = document.getElementById('trigger').value.trim();
    const threshold = Number(document.getElementById('threshold').value) || 1;

    if (!trigger) {
      await showAlert('A trigger name is required.', 'Required field');
      return;
    }

    const payload = { id: editingId, trigger, imagePath, audioPath, threshold };
    const res = await window.api.saveReaction(payload);
    if (res && res.ok) {
      const overlayPath = await window.overlay.getPath();
      document.getElementById('browser-source-url').textContent = overlayPath;
      document.getElementById('browser-source-modal').classList.add('active');

      document.getElementById('twitch-status').textContent = 'Reaction saved and exported.';

      form.reset();
      editingId = null;
      imagePath = null;
      audioPath = null;
      imagePathSpan.textContent = '';
      audioPathSpan.textContent = '';
      await refreshList();
    } else {
      await showAlert('Error saving reaction: ' + (res && res.error), 'Error');
    }
  });

  function updateVolumeLabel(v) {
    const pct = Math.round((Number(v) || 0) * 100);
    globalVolumeValue.textContent = pct + '%';
  }

  updateVolumeLabel(globalVolume.value);

  globalVolume.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    updateVolumeLabel(v);
    if (volumeStatus) volumeStatus.textContent = 'Unsaved volume change.';
  });

  if (applyVolumeBtn) {
    applyVolumeBtn.addEventListener('click', async () => {
      const v = parseFloat(globalVolume.value);
      const res = await window.settings.setVolume(v);
      if (res && res.ok) {
        if (volumeStatus) volumeStatus.textContent = 'Volume applied successfully.';
      } else {
        await showAlert('Error applying volume: ' + (res && res.error), 'Error');
      }
    });
  }

  document.getElementById('save-twitch-settings').addEventListener('click', async () => {
    const channel = document.getElementById('channel').value.trim();
    const animationDirection = globalDirectionSelect ? globalDirectionSelect.value : 'right';

    if (!channel) {
      await showAlert('A Twitch channel is required.', 'Required field');
      return;
    }

    const res = await window.twitch.saveSettings({ channel, bot: '', token: '', animationDirection });
    if (res && res.ok) {
      document.getElementById('twitch-status').textContent = 'Twitch settings saved.';
    } else {
      await showAlert('Error saving settings: ' + (res && res.error), 'Error');
    }
  });

  document.getElementById('clear-data').addEventListener('click', async () => {
    const accepted = await showConfirm('All saved reactions will be deleted. Continue?', 'Clear data');
    if (!accepted) return;
    const res = await window.store.clearReactions();
    if (res && res.ok) {
      await refreshList();
      document.getElementById('twitch-status').textContent = 'Reactions cleared and overlay config updated.';
    } else {
      await showAlert('Error clearing data: ' + (res && res.error), 'Error');
    }
  });

  async function loadTwitchConfig() {
    const settings = await window.twitch.getSettings();
    if (settings) {
      document.getElementById('channel').value = settings.channel || '';
      const persistedVolume = Number(settings.globalVolume);
      if (Number.isFinite(persistedVolume)) {
        globalVolume.value = String(Math.max(0, Math.min(1, persistedVolume)));
      }
      if (globalDirectionSelect) {
        globalDirectionSelect.value = settings.animationDirection || 'right';
      }
      updateVolumeLabel(globalVolume.value);
      if (volumeStatus) volumeStatus.textContent = '';
      if (settings.channel) {
        document.getElementById('twitch-status').textContent = 'Channel configured. Save any changes to re-export the overlay config.';
      } else {
        document.getElementById('twitch-status').textContent = 'Enter your Twitch channel and save your settings.';
      }
    }
  }

  await loadTwitchConfig();
  await refreshList();
});
