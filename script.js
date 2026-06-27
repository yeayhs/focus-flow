const STORAGE_KEY = 'homework-tracker-tasks';

function showLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
}

document.getElementById('lightbox').addEventListener('click', () => {
  document.getElementById('lightbox').classList.add('hidden');
});
document.getElementById('lightbox-close').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('lightbox').classList.add('hidden');
});

function showAppAlert(message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('app-dialog');
    const cancelBtn = document.getElementById('app-dialog-cancel');
    const okBtn = document.getElementById('app-dialog-ok');
    document.getElementById('app-dialog-message').textContent = message;
    cancelBtn.classList.add('hidden');
    dialog.classList.remove('hidden');
    const onOk = () => {
      dialog.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      resolve();
    };
    okBtn.addEventListener('click', onOk);
  });
}

function showAppConfirm(message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('app-dialog');
    const cancelBtn = document.getElementById('app-dialog-cancel');
    const okBtn = document.getElementById('app-dialog-ok');
    document.getElementById('app-dialog-message').textContent = message;
    cancelBtn.classList.remove('hidden');
    dialog.classList.remove('hidden');
    const cleanup = () => {
      dialog.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    console.warn('localStorage unavailable, using in-memory storage', e);
    return [];
  }
}

let tasks = loadTasks();
let timerInterval = null;
let timerSecondsLeft = 0;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.warn('localStorage unavailable, changes will not persist', e);
  }
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Alarm sound ----------
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepAt = (startTime, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    };
    const now = ctx.currentTime;
    beepAt(now, 880);
    beepAt(now + 0.35, 880);
    beepAt(now + 0.7, 1100);
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {
    console.warn('Could not play alarm sound', e);
  }
}

// ---------- Ambient break music ----------
let ambientCtx = null;
let ambientNodes = [];
let ambientBeatTimer = null;
let musicMuted = false;

function startAmbientMusic() {
  stopAmbientMusic();
  if (musicMuted) return;
  try {
    ambientCtx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = ambientCtx.createGain();
    masterGain.gain.value = 0.08;
    masterGain.connect(ambientCtx.destination);

    // Slow-shifting pad chord
    const notes = [196, 246.94, 293.66]; // soft G-B-D pad
    notes.forEach((freq, i) => {
      const osc = ambientCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const lfo = ambientCtx.createOscillator();
      lfo.frequency.value = 0.08 + i * 0.02;
      const lfoGain = ambientCtx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain);

      const noteGain = ambientCtx.createGain();
      noteGain.gain.value = 0.15;
      lfoGain.connect(noteGain.gain);

      osc.connect(noteGain);
      noteGain.connect(masterGain);
      osc.start();
      lfo.start();

      ambientNodes.push(osc, lfo);
    });

    ambientNodes.push(masterGain);

    // Rhythmic bass pattern, ~92 BPM with a repeating 8-step groove
    const beatGain = ambientCtx.createGain();
    beatGain.gain.value = 0.5;
    beatGain.connect(masterGain);
    ambientNodes.push(beatGain);

    const tickGain = ambientCtx.createGain();
    tickGain.gain.value = 0.18;
    tickGain.connect(masterGain);
    ambientNodes.push(tickGain);

    const bassPattern = [110, 0, 98, 0, 130.81, 0, 98, 0]; // 0 = rest
    let stepCount = 0;

    const playStep = () => {
      if (!ambientCtx) return;
      const t = ambientCtx.currentTime;
      const freq = bassPattern[stepCount % bassPattern.length];

      if (freq > 0) {
        const osc = ambientCtx.createOscillator();
        const env = ambientCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(env);
        env.connect(beatGain);
        osc.start(t);
        osc.stop(t + 0.4);
      }

      // soft shimmer tick on every step for a more textured rhythm
      const tick = ambientCtx.createOscillator();
      const tickEnv = ambientCtx.createGain();
      tick.type = 'triangle';
      tick.frequency.value = stepCount % 2 === 0 ? 587.33 : 659.25;
      tickEnv.gain.setValueAtTime(0.0001, t);
      tickEnv.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      tickEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      tick.connect(tickEnv);
      tickEnv.connect(tickGain);
      tick.start(t);
      tick.stop(t + 0.15);

      stepCount++;
    };

    playStep();
    ambientBeatTimer = setInterval(playStep, 325);
  } catch (e) {
    console.warn('Could not start ambient music', e);
  }
}

function stopAmbientMusic() {
  if (ambientBeatTimer) {
    clearInterval(ambientBeatTimer);
    ambientBeatTimer = null;
  }
  ambientNodes.forEach(node => {
    try { node.stop && node.stop(); } catch (e) {}
  });
  ambientNodes = [];
  if (ambientCtx) {
    ambientCtx.close().catch(() => {});
    ambientCtx = null;
  }
}

const MAX_PHOTOS = 10;

function getTaskPhotos(task) {
  if (task.photos && task.photos.length > 0) return task.photos;
  if (task.photo) return [task.photo];
  return [];
}

const SUBJECT_COLORS = {
  math: '#7d68c2',
  science: '#3fd0c9',
  english: '#e0524a',
  history: '#d98a1f',
  other: '#888888'
};

function getSubjectBadge(subject) {
  if (!subject || !SUBJECT_COLORS[subject]) return '';
  const label = subject.charAt(0).toUpperCase() + subject.slice(1);
  return `<span class="subject-badge" style="background:${SUBJECT_COLORS[subject]}">${label}</span>`;
}

// ---------- View switching ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    const view = document.getElementById('view-' + tab.dataset.view);
    view.classList.add('active');
    view.classList.remove('fade-in');
    requestAnimationFrame(() => view.classList.add('fade-in'));
    renderAll();
  });
});

// ---------- Photo picker ----------
let pendingPhotos = [];

function renderPhotoPreviewGallery() {
  const gallery = document.getElementById('photo-preview-gallery');
  gallery.innerHTML = '';
  pendingPhotos.forEach((src, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';
    wrap.innerHTML = `<img class="progress-thumb" src="${src}"><button type="button" class="remove-thumb-btn" data-i="${i}">×</button>`;
    wrap.querySelector('.remove-thumb-btn').addEventListener('click', () => {
      pendingPhotos.splice(i, 1);
      renderPhotoPreviewGallery();
    });
    gallery.appendChild(wrap);
  });
}

document.getElementById('task-photo').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  const room = MAX_PHOTOS - pendingPhotos.length;
  if (room <= 0) {
    showAppAlert(`You can add up to ${MAX_PHOTOS} photos.`);
    e.target.value = '';
    return;
  }
  const filesToAdd = files.slice(0, room);
  if (files.length > room) {
    showAppAlert(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (max ${MAX_PHOTOS}).`);
  }
  let remaining = filesToAdd.length;
  filesToAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      pendingPhotos.push(reader.result);
      remaining--;
      if (remaining === 0) renderPhotoPreviewGallery();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
});

// ---------- Due date ----------
document.getElementById('no-due-btn').addEventListener('click', () => {
  const dueInput = document.getElementById('task-due');
  const btn = document.getElementById('no-due-btn');
  const isActive = btn.classList.toggle('active');
  if (isActive) dueInput.value = '';
});

document.getElementById('task-due').addEventListener('input', () => {
  document.getElementById('no-due-btn').classList.remove('active');
});

// ---------- Add / Edit task ----------
let editingTaskId = null;

document.getElementById('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const notes = document.getElementById('task-notes').value.trim();
  const dueInput = document.getElementById('task-due');
  const noDueBtn = document.getElementById('no-due-btn');
  const dueDate = noDueBtn.classList.contains('active') ? null : (dueInput.value || null);
  const subject = document.getElementById('task-subject').value || null;
  if (!title) return;

  if (editingTaskId) {
    const task = tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = title;
      task.notes = notes;
      task.dueDate = dueDate;
      task.subject = subject;
      task.photos = pendingPhotos.slice();
      delete task.photo;
    }
  } else {
    tasks.push({
      id: genId(),
      title,
      notes,
      photos: pendingPhotos.slice(),
      dueDate,
      subject,
      order: Date.now(),
      status: 'planned', // planned | active | done
      createdAt: Date.now(),
      completedAt: null
    });
  }

  save();
  resetForm();
  renderAll();
});

function resetForm() {
  editingTaskId = null;
  document.getElementById('task-title').value = '';
  document.getElementById('task-notes').value = '';
  document.getElementById('task-due').value = '';
  document.getElementById('no-due-btn').classList.remove('active');
  document.getElementById('task-subject').value = '';
  pendingPhotos = [];
  document.getElementById('task-photo').value = '';
  renderPhotoPreviewGallery();
  document.getElementById('submit-btn').textContent = 'Add to Planned';
  document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function startEditTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-notes').value = task.notes || '';
  document.getElementById('task-due').value = task.dueDate || '';
  document.getElementById('no-due-btn').classList.toggle('active', !task.dueDate);
  document.getElementById('task-subject').value = task.subject || '';
  pendingPhotos = getTaskPhotos(task).slice();
  renderPhotoPreviewGallery();
  document.getElementById('submit-btn').textContent = 'Update Task';
  document.getElementById('cancel-edit-btn').classList.remove('hidden');
  document.getElementById('add-form').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
  resetForm();
});

// ---------- Rendering ----------
function renderAll() {
  renderPlanned();
  renderActive();
  renderHistory();
  renderStats();
  renderExportReminder();
  updateDemoDataButtons();
}

function updateDemoDataButtons() {
  const hasDemo = tasks.some(t => t.isDemo);
  document.getElementById('demo-data-btn').classList.toggle('hidden', hasDemo);
  document.getElementById('remove-demo-data-btn').classList.toggle('hidden', !hasDemo);
}

let searchQuery = '';

function sortPlanned(taskArr) {
  return taskArr.slice().sort((a, b) => {
    if (a.dueDate && b.dueDate) {
      const cmp = a.dueDate.localeCompare(b.dueDate);
      if (cmp !== 0) return cmp;
      return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
  });
}

function createPlannedTaskCard(task, options = {}) {
  const li = document.createElement('li');
  li.className = 'task-card';
  li.dataset.id = task.id;
  const due = getDueDateInfo(task.dueDate);
  const thumbSrc = getTaskPhotos(task)[0];

  if (options.draggable) {
    li.draggable = true;
  }

  li.innerHTML = `
    ${options.draggable ? '<span class="drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>' : ''}
    ${thumbSrc ? `<img class="task-thumb" src="${thumbSrc}" alt="Photo for ${escapeHtml(task.title)}">` : ''}
    <div class="task-text">
      <div class="task-title">${getSubjectBadge(task.subject)}${escapeHtml(task.title)}</div>
      <div class="task-date ${due.className}">${due.text}</div>
    </div>
    <button class="edit-btn" title="Edit" aria-label="Edit ${escapeHtml(task.title)}">✏️</button>
    <button class="delete-btn" title="Delete" aria-label="Delete ${escapeHtml(task.title)}">🗑️</button>
    <button class="start-btn">Start</button>
  `;
  li.querySelector('.task-title').addEventListener('click', () => showDetail(task));
  const thumb = li.querySelector('.task-thumb');
  if (thumb) {
    thumb.addEventListener('click', (e) => {
      e.stopPropagation();
      showLightbox(thumbSrc);
    });
  }
  li.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    startEditTask(task.id);
  });
  li.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTasks([task.id]);
  });
  li.querySelector('.start-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    startWorkingOn(task.id);
  });
  if (options.draggable) {
    attachDragHandlers(li);
  }
  return li;
}

function renderPlanned() {
  const list = document.getElementById('planned-list');
  list.innerHTML = '';
  let planned = tasks.filter(t => t.status === 'planned');

  document.getElementById('planned-count').textContent =
    planned.length === 0 ? '' : `📋 ${planned.length} task${planned.length === 1 ? '' : 's'} planned`;

  if (searchQuery) {
    planned = planned.filter(t =>
      t.title.toLowerCase().includes(searchQuery) ||
      (t.notes && t.notes.toLowerCase().includes(searchQuery))
    );
  }

  planned = sortPlanned(planned);

  if (planned.length === 0) {
    list.innerHTML = searchQuery
      ? '<div class="empty-msg">🔍 No tasks match your search.</div>'
      : '<div class="empty-msg">✨ Nothing planned yet — what\'s on your list today?</div>';
  } else {
    planned.forEach(task => {
      list.appendChild(createPlannedTaskCard(task, { draggable: true }));
    });
  }

  renderTodaySection();
}

function renderTodaySection() {
  const section = document.getElementById('today-section');
  const list = document.getElementById('today-list');
  list.innerHTML = '';

  const todayTasks = sortPlanned(
    tasks.filter(t => t.status === 'planned' && getDueDateInfo(t.dueDate).className === 'due-urgent')
  );

  if (todayTasks.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  todayTasks.forEach(task => {
    list.appendChild(createPlannedTaskCard(task, { draggable: false }));
  });
}

document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  renderPlanned();
});

let dragSourceId = null;

function attachDragHandlers(li) {
  li.addEventListener('dragstart', () => {
    dragSourceId = li.dataset.id;
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetId = li.dataset.id;
    if (!dragSourceId || dragSourceId === targetId) return;
    reorderPlanned(dragSourceId, targetId);
  });
}

function reorderPlanned(sourceId, targetId) {
  const list = document.getElementById('planned-list');
  const ids = Array.from(list.children).map(el => el.dataset.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return;
  ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, sourceId);
  ids.forEach((id, i) => {
    const task = tasks.find(t => t.id === id);
    if (task) task.order = i;
  });
  save();
  renderAll();
}

function startWorkingOn(id) {
  const hasActive = tasks.some(t => t.status === 'active');
  if (hasActive) {
    showAppAlert('Finish or stop your current task first!');
    return;
  }
  const task = tasks.find(t => t.id === id);
  task.status = 'active';
  save();
  if (!workTimerInterval) {
    document.getElementById('work-timer-setup').classList.remove('hidden');
    document.getElementById('work-timer-show-btn').classList.add('hidden');
  }
  document.querySelector('.tab[data-view="active"]').click();
}

let activeUiMode = 'task'; // task | break-prompt | break-running

function renderActive() {
  const task = tasks.find(t => t.status === 'active');
  const empty = document.getElementById('active-empty');
  const taskBox = document.getElementById('active-task');
  const breakPrompt = document.getElementById('break-prompt');
  const breakRunning = document.getElementById('break-running');

  const onBreak = activeUiMode === 'break-prompt' || activeUiMode === 'break-running';

  if (!task && !onBreak) {
    empty.classList.remove('hidden');
    taskBox.classList.add('hidden');
    breakPrompt.classList.add('hidden');
    breakRunning.classList.add('hidden');
    activeUiMode = 'task';
    return;
  }

  empty.classList.add('hidden');
  if (task) {
    document.getElementById('active-title').innerHTML = `${getSubjectBadge(task.subject)}${escapeHtml(task.title)}`;
    const activeDue = getDueDateInfo(task.dueDate);
    const activeDueEl = document.getElementById('active-due');
    activeDueEl.textContent = activeDue.text;
    activeDueEl.className = `due-label ${activeDue.className}`;
    document.getElementById('active-notes').textContent = task.notes || '(no details)';
    renderPhotoGallery('active-photo-gallery', getTaskPhotos(task));
    renderProgressGallery(task);
  }

  if (activeUiMode === 'break-prompt' && lastCompletedTaskId) {
    const completedTask = tasks.find(t => t.id === lastCompletedTaskId);
    if (completedTask) {
      renderPhotoGallery('completed-photo-gallery', completedTask.completedPhotos);
    }
  }

  taskBox.classList.toggle('hidden', activeUiMode !== 'task');
  breakPrompt.classList.toggle('hidden', activeUiMode !== 'break-prompt');
  breakRunning.classList.toggle('hidden', activeUiMode !== 'break-running');
}

function renderPhotoGallery(elementId, photos) {
  const gallery = document.getElementById(elementId);
  gallery.innerHTML = '';
  (photos || []).forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Photo ${i + 1}`;
    img.className = 'progress-thumb';
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.addEventListener('click', () => showLightbox(src));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showLightbox(src);
      }
    });
    gallery.appendChild(img);
  });
}

function renderProgressGallery(task) {
  renderPhotoGallery('progress-photo-gallery', task.progressPhotos);
}

function setupMultiPhotoUploader(inputId, photoField, galleryElementId, getTargetTask) {
  document.getElementById(inputId).addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const task = getTargetTask();
    if (!task) return;
    if (!task[photoField]) task[photoField] = [];

    const room = MAX_PHOTOS - task[photoField].length;
    if (room <= 0) {
      showAppAlert(`You can add up to ${MAX_PHOTOS} photos.`);
      e.target.value = '';
      return;
    }
    const filesToAdd = files.slice(0, room);
    if (files.length > room) {
      showAppAlert(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (max ${MAX_PHOTOS}).`);
    }

    let remaining = filesToAdd.length;
    filesToAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        task[photoField].push(reader.result);
        remaining--;
        if (remaining === 0) {
          save();
          renderPhotoGallery(galleryElementId, task[photoField]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  });
}

setupMultiPhotoUploader('progress-photo-input', 'progressPhotos', 'progress-photo-gallery', () => tasks.find(t => t.status === 'active'));
setupMultiPhotoUploader('completed-photo-input', 'completedPhotos', 'completed-photo-gallery', () => tasks.find(t => t.id === lastCompletedTaskId));

let lastCompletedTaskId = null;

document.getElementById('mark-done-btn').addEventListener('click', () => {
  const task = tasks.find(t => t.status === 'active');
  if (!task) return;
  task.status = 'done';
  task.completedAt = Date.now();
  lastCompletedTaskId = task.id;
  save();
  activeUiMode = 'break-prompt';
  renderAll();
  showCelebration();
});

// ---------- Work timer ----------
let workTimerInterval = null;
let workTimerSecondsLeft = 0;

function resetWorkTimerUI() {
  clearInterval(workTimerInterval);
  workTimerInterval = null;
  document.getElementById('work-timer-setup').classList.remove('hidden');
  document.getElementById('work-timer-running').classList.add('hidden');
  document.getElementById('work-timer-show-btn').classList.add('hidden');
}

function updateWorkTimerDisplay() {
  const m = Math.floor(workTimerSecondsLeft / 60).toString().padStart(2, '0');
  const s = (workTimerSecondsLeft % 60).toString().padStart(2, '0');
  document.getElementById('work-timer-display').textContent = `${m}:${s}`;
}

document.getElementById('start-work-timer-btn').addEventListener('click', () => {
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  const minutes = parseInt(document.getElementById('work-minutes').value, 10) || 30;
  workTimerSecondsLeft = minutes * 60;
  document.getElementById('work-timer-setup').classList.add('hidden');
  document.getElementById('work-timer-running').classList.remove('hidden');
  document.getElementById('work-timer-show-btn').classList.add('hidden');
  updateWorkTimerDisplay();

  workTimerInterval = setInterval(() => {
    workTimerSecondsLeft--;
    updateWorkTimerDisplay();
    if (workTimerSecondsLeft <= 0) {
      clearInterval(workTimerInterval);
      workTimerInterval = null;
      playAlarm();
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Focus Flow', { body: "Time's up! Take a break if you need one — done or not. 🎉" });
      }
      showAppAlert("Time's up! You can take a break now, whether you're done or not.");
      resetWorkTimerUI();
    }
  }, 1000);
});

document.getElementById('stop-work-timer-btn').addEventListener('click', () => {
  resetWorkTimerUI();
});

document.getElementById('work-timer-not-needed-btn').addEventListener('click', () => {
  document.getElementById('work-timer-setup').classList.add('hidden');
  document.getElementById('work-timer-show-btn').classList.remove('hidden');
});

document.getElementById('work-timer-show-btn').addEventListener('click', () => {
  document.getElementById('work-timer-show-btn').classList.add('hidden');
  document.getElementById('work-timer-setup').classList.remove('hidden');
});

function showCelebration() {
  const pop = document.createElement('div');
  pop.className = 'celebrate-pop';
  pop.textContent = '🎉';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 900);
}

document.getElementById('no-break-btn').addEventListener('click', () => {
  activeUiMode = 'task';
  renderAll();
});

let breakStartedAt = null;
let breakPlannedSeconds = 0;

document.getElementById('start-break-btn').addEventListener('click', () => {
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  const minutes = parseInt(document.getElementById('break-minutes').value, 10) || 10;
  timerSecondsLeft = minutes * 60;
  breakPlannedSeconds = timerSecondsLeft;
  breakStartedAt = Date.now();
  activeUiMode = 'break-running';
  musicMuted = false;
  document.getElementById('mute-music-btn').textContent = '🔇 Stop Music';
  document.getElementById('ambient-note').textContent = '🎵 Playing calming music';
  renderAll();
  updateTimerDisplay();
  startAmbientMusic();

  timerInterval = setInterval(() => {
    timerSecondsLeft--;
    updateTimerDisplay();
    if (timerSecondsLeft <= 0) {
      clearInterval(timerInterval);
      stopAmbientMusic();
      playAlarm();
      logBreak(breakPlannedSeconds);
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Focus Flow', { body: "Break's over! Time to get back to it. 🎉" });
      }
      showAppAlert("Break's over! Time to get back to it.");
      activeUiMode = 'task';
      renderAll();
    }
  }, 1000);
});

document.getElementById('stop-break-btn').addEventListener('click', () => {
  clearInterval(timerInterval);
  stopAmbientMusic();
  musicMuted = false;
  const elapsedSeconds = breakStartedAt ? Math.round((Date.now() - breakStartedAt) / 1000) : 0;
  logBreak(elapsedSeconds);
  activeUiMode = 'task';
  renderAll();
});

const BREAK_LOG_KEY = 'focus-flow-break-log';

function logBreak(seconds) {
  if (seconds <= 0) return;
  try {
    const log = JSON.parse(localStorage.getItem(BREAK_LOG_KEY)) || [];
    log.push({ at: Date.now(), seconds });
    localStorage.setItem(BREAK_LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn('Could not log break', e);
  }
}

function loadBreakLog() {
  try {
    return JSON.parse(localStorage.getItem(BREAK_LOG_KEY)) || [];
  } catch (e) {
    return [];
  }
}

document.getElementById('mute-music-btn').addEventListener('click', () => {
  const btn = document.getElementById('mute-music-btn');
  const note = document.getElementById('ambient-note');
  musicMuted = !musicMuted;
  if (musicMuted) {
    stopAmbientMusic();
    btn.textContent = '🎵 Play Music';
    note.textContent = '🔇 Music paused';
  } else {
    startAmbientMusic();
    btn.textContent = '🔇 Stop Music';
    note.textContent = '🎵 Playing calming music';
  }
});

function updateTimerDisplay() {
  const m = Math.floor(timerSecondsLeft / 60).toString().padStart(2, '0');
  const s = (timerSecondsLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

// ---------- Log a past task ----------
let editingHistoryId = null;
let pendingPastPhotos = [];

function renderPastPhotoPreviewGallery() {
  const gallery = document.getElementById('past-photo-preview-gallery');
  gallery.innerHTML = '';
  pendingPastPhotos.forEach((src, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';
    wrap.innerHTML = `<img class="progress-thumb" src="${src}"><button type="button" class="remove-thumb-btn" data-i="${i}">×</button>`;
    wrap.querySelector('.remove-thumb-btn').addEventListener('click', () => {
      pendingPastPhotos.splice(i, 1);
      renderPastPhotoPreviewGallery();
    });
    gallery.appendChild(wrap);
  });
}

document.getElementById('past-photo-input').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  const room = MAX_PHOTOS - pendingPastPhotos.length;
  if (room <= 0) {
    showAppAlert(`You can add up to ${MAX_PHOTOS} photos.`);
    e.target.value = '';
    return;
  }
  const filesToAdd = files.slice(0, room);
  if (files.length > room) {
    showAppAlert(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (max ${MAX_PHOTOS}).`);
  }
  let remaining = filesToAdd.length;
  filesToAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      pendingPastPhotos.push(reader.result);
      remaining--;
      if (remaining === 0) renderPastPhotoPreviewGallery();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
});

document.getElementById('log-past-btn').addEventListener('click', () => {
  document.getElementById('log-past-form').classList.remove('hidden');
  document.getElementById('log-past-btn').classList.add('hidden');
  const now = new Date();
  document.getElementById('past-date').value = now.toISOString().slice(0, 10);
  document.getElementById('past-time').value = now.toTimeString().slice(0, 5);
});

function startEditHistoryTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingHistoryId = id;
  document.getElementById('log-past-form').classList.remove('hidden');
  document.getElementById('log-past-btn').classList.add('hidden');
  document.getElementById('past-title').value = task.title;
  document.getElementById('past-subject').value = task.subject || '';
  const completed = new Date(task.completedAt);
  document.getElementById('past-date').value = completed.toISOString().slice(0, 10);
  document.getElementById('past-time').value = completed.toTimeString().slice(0, 5);
  document.getElementById('past-minutes').value = task.timeSpentMinutes || '';
  pendingPastPhotos = getTaskPhotos(task).slice();
  renderPastPhotoPreviewGallery();

  const dateBtn = document.getElementById('past-date-unsure-btn');
  const timeBtn = document.getElementById('past-time-unsure-btn');
  if (dateBtn.classList.contains('active') !== !!task.dateApproximate) dateBtn.click();
  if (!task.dateApproximate && timeBtn.classList.contains('active') !== !!task.timeApproximate) timeBtn.click();

  document.querySelector('#log-past-form button[type="submit"]').textContent = 'Update Task';
  document.getElementById('log-past-form').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('past-date-unsure-btn').addEventListener('click', () => {
  const btn = document.getElementById('past-date-unsure-btn');
  const dateLabel = document.getElementById('past-date-label');
  const dateVague = document.getElementById('past-date-vague');
  const isActive = btn.classList.toggle('active');
  dateLabel.classList.toggle('hidden', isActive);
  dateVague.classList.toggle('hidden', !isActive);
  if (isActive) {
    // an unsure date implies an unsure time too
    const timeBtn = document.getElementById('past-time-unsure-btn');
    if (!timeBtn.classList.contains('active')) timeBtn.click();
  }
});

document.getElementById('past-time-unsure-btn').addEventListener('click', () => {
  const btn = document.getElementById('past-time-unsure-btn');
  const timeInput = document.getElementById('past-time');
  const isActive = btn.classList.toggle('active');
  timeInput.disabled = isActive;
  if (isActive) timeInput.value = '';
});

document.getElementById('cancel-log-past-btn').addEventListener('click', () => {
  resetLogPastForm();
});

function resetLogPastForm() {
  document.getElementById('log-past-form').reset();
  document.getElementById('log-past-form').classList.add('hidden');
  document.getElementById('log-past-btn').classList.remove('hidden');
  document.getElementById('past-time-unsure-btn').classList.remove('active');
  document.getElementById('past-time').disabled = false;
  document.getElementById('past-date-unsure-btn').classList.remove('active');
  document.getElementById('past-date-label').classList.remove('hidden');
  document.getElementById('past-date-vague').classList.add('hidden');
  document.querySelector('#log-past-form button[type="submit"]').textContent = 'Add to History';
  editingHistoryId = null;
  pendingPastPhotos = [];
  renderPastPhotoPreviewGallery();
}

document.getElementById('log-past-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('past-title').value.trim();
  const subject = document.getElementById('past-subject').value || null;
  const dateUnsure = document.getElementById('past-date-unsure-btn').classList.contains('active');
  const timeUnsure = document.getElementById('past-time-unsure-btn').classList.contains('active');
  const minutes = parseInt(document.getElementById('past-minutes').value, 10);

  let dateValue;
  if (dateUnsure) {
    const daysAgo = parseInt(document.getElementById('past-date-vague').value, 10);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    dateValue = d.toISOString().slice(0, 10);
  } else {
    dateValue = document.getElementById('past-date').value;
  }

  const timeValue = timeUnsure ? '12:00' : document.getElementById('past-time').value;
  if (!title || !dateValue || (!timeUnsure && !timeValue) || !minutes || minutes <= 0) return;

  const completedAt = new Date(`${dateValue}T${timeValue || '12:00'}`).getTime();

  if (editingHistoryId) {
    const task = tasks.find(t => t.id === editingHistoryId);
    if (task) {
      const createdAt = completedAt - minutes * 60000;
      task.title = title;
      task.subject = subject;
      task.completedAt = completedAt;
      task.createdAt = createdAt;
      task.timeSpentMinutes = minutes;
      task.timeApproximate = timeUnsure;
      task.dateApproximate = dateUnsure;
      task.photos = pendingPastPhotos.slice();
      delete task.photo;
    }
  } else {
    const createdAt = completedAt - minutes * 60000;
    tasks.push({
      id: genId(),
      title,
      notes: '',
      photos: pendingPastPhotos.slice(),
      dueDate: null,
      subject,
      status: 'done',
      createdAt,
      completedAt,
      timeSpentMinutes: minutes,
      timeApproximate: timeUnsure,
      dateApproximate: dateUnsure,
      loggedRetroactively: true
    });
  }

  save();
  resetLogPastForm();
  renderAll();
});

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  const done = tasks.filter(t => t.status === 'done').sort((a, b) => b.completedAt - a.completedAt);

  if (done.length === 0) {
    list.innerHTML = '<div class="empty-msg">🗒️ No completed tasks yet — finish one and it\'ll show up here!</div>';
    return;
  }

  done.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-card done';
    const thumbSrc = getTaskPhotos(task)[0];
    li.innerHTML = `
      <input type="checkbox" class="select-box" data-id="${task.id}" aria-label="Select ${escapeHtml(task.title)}">
      ${thumbSrc ? `<img class="task-thumb" src="${thumbSrc}" alt="Photo for ${escapeHtml(task.title)}">` : ''}
      <div class="task-text">
        <div class="task-title">${getSubjectBadge(task.subject)}${escapeHtml(task.title)}</div>
        <div class="task-date">Completed ${(task.timeApproximate || task.dateApproximate) ? '~' : ''}${formatDate(task.completedAt)}${task.timeSpentMinutes ? ` · ${task.timeSpentMinutes} min` : ''}</div>
      </div>
      <button class="edit-btn" title="Edit" aria-label="Edit ${escapeHtml(task.title)}">✏️</button>
      <button class="delete-btn" title="Delete" aria-label="Delete ${escapeHtml(task.title)}">🗑️</button>
    `;
    li.querySelector('.task-text').addEventListener('click', () => showDetail(task));
    li.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startEditHistoryTask(task.id);
    });
    li.querySelector('.select-box').addEventListener('click', e => e.stopPropagation());
    const thumb = li.querySelector('.task-thumb');
    if (thumb) {
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        showLightbox(thumbSrc);
      });
    }
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTasks([task.id]);
    });
    list.appendChild(li);
  });
}

let undoBuffer = null;
let undoTimeout = null;

function deleteTasks(ids) {
  const removed = tasks.filter(t => ids.includes(t.id));
  tasks = tasks.filter(t => !ids.includes(t.id));
  save();
  renderAll();
  showUndoToast(removed);
}

function showUndoToast(removedTasks) {
  undoBuffer = removedTasks;
  clearTimeout(undoTimeout);
  const toast = document.getElementById('undo-toast');
  document.getElementById('undo-toast-text').textContent =
    `${removedTasks.length} task(s) deleted`;
  toast.classList.remove('hidden');
  undoTimeout = setTimeout(() => {
    toast.classList.add('hidden');
    undoBuffer = null;
  }, 6000);
}

document.getElementById('undo-btn').addEventListener('click', () => {
  if (!undoBuffer) return;
  tasks.push(...undoBuffer);
  save();
  renderAll();
  undoBuffer = null;
  clearTimeout(undoTimeout);
  document.getElementById('undo-toast').classList.add('hidden');
});

document.getElementById('delete-selected-btn').addEventListener('click', () => {
  const ids = Array.from(document.querySelectorAll('#history-list .select-box:checked')).map(cb => cb.dataset.id);
  if (ids.length === 0) {
    showAppAlert('Check the tasks you want to delete first.');
    return;
  }
  deleteTasks(ids);
});

document.getElementById('delete-all-btn').addEventListener('click', async () => {
  const doneIds = tasks.filter(t => t.status === 'done').map(t => t.id);
  if (doneIds.length === 0) return;
  if (await showAppConfirm('Delete all history? This cannot be undone.')) {
    deleteTasks(doneIds);
  }
});

// ---------- Detail modal ----------
function showDetail(task) {
  document.getElementById('detail-title').innerHTML = `${getSubjectBadge(task.subject)}${escapeHtml(task.title)}`;
  const detailDueEl = document.getElementById('detail-due');
  if (task.status === 'done') {
    detailDueEl.textContent = 'Great job you finished it! 🎉';
    detailDueEl.className = 'due-label due-done';
  } else {
    const detailDue = getDueDateInfo(task.dueDate);
    detailDueEl.textContent = detailDue.text;
    detailDueEl.className = `due-label ${detailDue.className}`;
  }
  document.getElementById('detail-notes').textContent = task.notes || '(no details)';
  let meta = `Added: ${formatDate(task.createdAt)}`;
  if (task.completedAt) meta += ` · Completed: ${(task.timeApproximate || task.dateApproximate) ? '~' : ''}${formatDate(task.completedAt)}`;
  if (task.timeSpentMinutes) meta += ` · Time spent: ${task.timeSpentMinutes} min`;
  document.getElementById('detail-meta').textContent = meta;

  renderPhotoGallery('detail-photo-gallery', getTaskPhotos(task));

  const progressSection = document.getElementById('detail-progress-section');
  if (task.progressPhotos && task.progressPhotos.length > 0) {
    renderPhotoGallery('detail-progress-gallery', task.progressPhotos);
    progressSection.classList.remove('hidden');
  } else {
    progressSection.classList.add('hidden');
  }

  const completedSection = document.getElementById('detail-completed-section');
  if (task.completedPhotos && task.completedPhotos.length > 0) {
    renderPhotoGallery('detail-completed-gallery', task.completedPhotos);
    completedSection.classList.remove('hidden');
  } else {
    completedSection.classList.add('hidden');
  }

  document.getElementById('detail-modal').classList.remove('hidden');
}

document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('detail-modal').classList.add('hidden');
});

// ---------- Helpers ----------
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDueDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function getDueDateInfo(dueDate) {
  if (!dueDate) return { text: 'No due date', className: 'due-none' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.round((due - today) / 86400000);

  const text = `Due ${formatDueDate(dueDate)}`;
  if (diffDays < 0) return { text: `${text} (overdue)`, className: 'due-urgent' };
  if (diffDays === 0) return { text: `${text} (today)`, className: 'due-urgent' };
  if (diffDays === 1) return { text: `${text} (tomorrow)`, className: 'due-soon' };
  return { text, className: 'due-future' };
}

// ---------- Export / Import ----------
const LAST_EXPORT_KEY = 'focus-flow-last-export';

document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focus-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_EXPORT_KEY, Date.now().toString());
  renderExportReminder();
});

function renderExportReminder() {
  const banner = document.getElementById('export-reminder');
  if (!banner) return;
  const lastExport = parseInt(localStorage.getItem(LAST_EXPORT_KEY), 10);
  const daysSince = lastExport ? Math.floor((Date.now() - lastExport) / 86400000) : Infinity;

  if (tasks.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  if (!lastExport) {
    banner.textContent = "💡 You haven't exported a backup yet. Click Export Data so you never lose your tasks.";
    banner.classList.remove('hidden');
  } else if (daysSince >= 7) {
    banner.textContent = `💡 It's been ${daysSince} days since your last backup. Consider exporting again.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('Invalid file format');
      if (await showAppConfirm(`Import ${imported.length} tasks? This will replace your current data.`)) {
        tasks = imported;
        save();
        renderAll();
      }
    } catch (err) {
      showAppAlert('That file could not be read as a backup. Make sure it\'s a file exported from this app.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function buildDemoTasks() {
  const now = Date.now();
  const day = 86400000;
  const isoDaysFromNow = (n) => new Date(now + n * day).toISOString().slice(0, 10);

  return [
    {
      id: genId(), title: 'Math worksheet — fractions', notes: 'Pages 12-13, show all work', photos: [],
      dueDate: isoDaysFromNow(1), subject: 'math', status: 'planned', createdAt: now, completedAt: null, isDemo: true
    },
    {
      id: genId(), title: 'Read Chapter 5', notes: 'Take notes on main characters', photos: [],
      dueDate: isoDaysFromNow(3), subject: 'english', status: 'planned', createdAt: now, completedAt: null, isDemo: true
    },
    {
      id: genId(), title: 'Science fair project research', notes: '', photos: [],
      dueDate: null, subject: 'science', status: 'planned', createdAt: now, completedAt: null, isDemo: true
    },
    {
      id: genId(), title: 'History timeline poster', notes: 'Ancient Egypt unit', photos: [], progressPhotos: [],
      dueDate: isoDaysFromNow(2), subject: 'history', status: 'active', createdAt: now, completedAt: null, isDemo: true
    },
    {
      id: genId(), title: 'Spelling list practice', notes: '', photos: [], completedPhotos: [],
      dueDate: null, subject: 'english', status: 'done',
      createdAt: now - 2 * day, completedAt: now - 2 * day + 25 * 60000, timeSpentMinutes: 25, isDemo: true
    },
    {
      id: genId(), title: 'Volcano diagram', notes: '', photos: [], completedPhotos: [],
      dueDate: null, subject: 'science', status: 'done',
      createdAt: now - 5 * day, completedAt: now - 5 * day + 40 * 60000, timeSpentMinutes: 40, isDemo: true
    }
  ];
}

document.getElementById('demo-data-btn').addEventListener('click', async () => {
  if (await showAppConfirm('Load some sample demo tasks for showing off the app? These are clearly marked and easy to remove later.')) {
    tasks.push(...buildDemoTasks());
    save();
    renderAll();
  }
});

document.getElementById('remove-demo-data-btn').addEventListener('click', async () => {
  if (await showAppConfirm('Remove all demo tasks? Your real tasks will not be affected.')) {
    tasks = tasks.filter(t => !t.isDemo);
    save();
    renderAll();
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Stats ----------
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function computeStreak(doneTasks) {
  const daysWithCompletion = new Set(doneTasks.map(t => dateKey(t.completedAt)));
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (daysWithCompletion.has(dateKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderStats() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const doneTasks = tasks.filter(t => t.status === 'done');
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedThisWeek = doneTasks.filter(t => t.completedAt >= oneWeekAgo).length;

  const breakLog = loadBreakLog();
  const breakMinutesThisWeek = Math.round(
    breakLog.filter(b => b.at >= oneWeekAgo).reduce((sum, b) => sum + b.seconds, 0) / 60
  );

  const totalPhotos = tasks.reduce((sum, t) => {
    return sum + getTaskPhotos(t).length + (t.progressPhotos ? t.progressPhotos.length : 0);
  }, 0);

  const streak = computeStreak(doneTasks);

  const cards = [
    { icon: '✅', label: 'Completed this week', value: completedThisWeek },
    { icon: '🏆', label: 'Total completed', value: doneTasks.length },
    { icon: '☕', label: 'Break minutes this week', value: breakMinutesThisWeek },
    { icon: '🔥', label: 'Day streak', value: streak },
    { icon: '📷', label: 'Photos taken', value: totalPhotos }
  ];

  grid.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');

  renderSubjectStats(doneTasks);
}

function estimateMinutes(task) {
  if (task.timeSpentMinutes) return task.timeSpentMinutes;
  if (task.completedAt && task.createdAt) {
    return Math.max(0, Math.round((task.completedAt - task.createdAt) / 60000));
  }
  return 0;
}

function renderSubjectStats(doneTasks) {
  const container = document.getElementById('stats-subjects');
  if (!container) return;

  const bySubject = {};
  doneTasks.forEach(t => {
    const key = t.subject || 'other';
    if (!bySubject[key]) bySubject[key] = { count: 0, minutes: 0 };
    bySubject[key].count++;
    bySubject[key].minutes += estimateMinutes(t);
  });

  const entries = Object.entries(bySubject).sort((a, b) => b[1].minutes - a[1].minutes);

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-msg">No completed tasks with a subject yet.</div>';
    return;
  }

  const maxMinutes = Math.max(...entries.map(([, v]) => v.minutes), 1);

  container.innerHTML = entries.map(([subject, v]) => {
    const label = subject.charAt(0).toUpperCase() + subject.slice(1);
    const barWidth = Math.round((v.minutes / maxMinutes) * 100);
    return `
      <div class="subject-stat-row">
        <div class="subject-stat-label">${label}</div>
        <div class="subject-stat-bar-track">
          <div class="subject-stat-bar" style="width:${barWidth}%"></div>
        </div>
        <div class="subject-stat-value">${v.count} task${v.count === 1 ? '' : 's'} · ${v.minutes} min</div>
      </div>
    `;
  }).join('');
}

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('lightbox').classList.contains('hidden')) {
      document.getElementById('lightbox').classList.add('hidden');
    } else if (!document.getElementById('detail-modal').classList.contains('hidden')) {
      document.getElementById('detail-modal').classList.add('hidden');
    }
  }
});

renderAll();
