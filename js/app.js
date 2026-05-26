// ============================================================
// CAMPUSCONNECT — MAIN APP JS (app.js)
// ============================================================

import { auth, db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit,
  onSnapshot, updateDoc, serverTimestamp, addDoc, getDocs,
  increment, deleteDoc, writeBatch, arrayUnion, arrayRemove,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export let currentUser = null;
export let currentUserData = null;

// ---- AUTH GUARD ----
export function requireAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../index.html'; return; }
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) { await signOut(auth); window.location.href = '../index.html'; return; }
    currentUser = user;
    currentUserData = snap.data();

    const path = window.location.pathname;
    const isAdminPage = path.includes('admin.html');
    const isIndexPage = path.includes('index.html') || path.endsWith('/') || path.endsWith('/campusconnect');

    if (isAdminPage && currentUserData.role !== 'admin') { window.location.href = 'dashboard.html'; return; }
    if (isIndexPage && currentUserData.role === 'admin') { window.location.href = 'pages/admin.html'; return; }

    if (!currentUserData.approved && currentUserData.role !== 'admin') {
      document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080c18;font-family:'Sora',sans-serif;color:#eaf0ff">
          <div style="text-align:center;padding:40px;max-width:400px">
            <div style="font-size:3rem;margin-bottom:16px">⏳</div>
            <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:8px">Awaiting Approval</h2>
            <p style="color:#8896b3;font-size:0.9rem;margin-bottom:24px">Your account is pending admin approval. You'll be notified once approved.</p>
            <button onclick="window._signOut()" style="background:#4f8ef7;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-family:'Sora',sans-serif;font-weight:600;cursor:pointer">Sign Out</button>
          </div>
        </div>`;
      window._signOut = () => signOut(auth).then(() => window.location.href = '../index.html');
      return;
    }

    callback(currentUser, currentUserData);
    initSidebar();
    initTopbar();
    loadNotifications();
    initTheme();
  });
}

// ---- SIDEBAR ----
function initSidebar() {
  const role = currentUserData.role;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const nav = document.getElementById('sidebar-nav');
  if (nav) nav.innerHTML = getSidebarHTML(role);
  const initials = (currentUserData.name || 'U').charAt(0).toUpperCase();
  const avatar = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-name');
  const roleEl = document.getElementById('sidebar-role');
  if (avatar) avatar.textContent = initials;
  if (nameEl) nameEl.textContent = currentUserData.name || 'User';
  if (roleEl) roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1) + (currentUserData.dept ? ' • ' + currentUserData.dept : '');
  const topAvatar = document.getElementById('topbar-avatar-btn');
  if (topAvatar) topAvatar.textContent = initials;
  const page = window.location.pathname.split('/').pop().replace('.html', '');
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    if (item.dataset.page === page) item.classList.add('active');
  });
  // Highlight active bottom nav item
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
    if (item.dataset.page === page || (!page && item.dataset.page === 'dashboard')) {
      item.classList.add('active');
    }
  });
  // Highlight More btn for pages in the more sheet
  const morePages = ['notices','tests','leaderboard','profile'];
  const moreBtn = document.getElementById('more-btn');
  if (moreBtn && morePages.includes(page)) moreBtn.classList.add('active');
  const hamburger = document.getElementById('hamburger-btn');
  const overlay = document.getElementById('sidebar-overlay');
  if (hamburger) hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
  });
  if (overlay) overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });
}

// ---- TOPBAR ----
function initTopbar() {
  const avatarBtn = document.getElementById('topbar-avatar-btn');
  const userDropdown = document.getElementById('user-dropdown');
  if (avatarBtn && userDropdown) {
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('active');
      document.getElementById('notif-dropdown')?.classList.remove('active');
    });
  }
  const notifBtn = document.getElementById('notif-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('active');
      userDropdown?.classList.remove('active');
      markNotificationsRead();
    });
  }
  document.addEventListener('click', () => {
    document.querySelectorAll('.notif-dropdown,.user-dropdown').forEach(d => d.classList.remove('active'));
  });
  const searchInput = document.getElementById('topbar-search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openGlobalSearch(searchInput.value);
    });
  }
}

// ---- NOTIFICATIONS (Two-tier system) ----
let unreadCount = 0;
const NOTIF_STORAGE_KEY = 'cc_last_read_notif_' + (currentUser?.uid || '');

function markNotificationsRead() {
  localStorage.setItem('cc_last_read_' + currentUser?.uid, Date.now().toString());
  unreadCount = 0;
  const badge = document.getElementById('notif-badge');
  if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
}

function loadNotifications() {
  const container = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if (!container) return;

  // Simple query - no compound index needed
  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(20));

  onSnapshot(q, (snap) => {
    const lastRead = parseInt(localStorage.getItem('cc_last_read_' + currentUser?.uid) || '0');
    container.innerHTML = '';

    // Tip button is in layout HTML - always visible

    // Filter approved only client-side (avoids needing composite index)
    const approvedDocs = snap.docs.filter(d => d.data().approved === true);

    if (approvedDocs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notif-empty';
      empty.textContent = 'No notifications yet';
      container.appendChild(empty);
      return;
    }

    let newCount = 0;
    approvedDocs.forEach(d => {
      const n = d.data();
      const createdMs = n.createdAt?.toMillis?.() || 0;
      const isNew = createdMs > lastRead;
      if (isNew) newCount++;

      const typeIcons = { internship:'💼', hackathon:'🏆', placement:'🎓', exam:'📝', event:'🎉', general:'📢', tip:'💡' };
      const el = document.createElement('div');
      el.className = 'notif-item' + (isNew ? ' unread' : '');
      el.innerHTML = `
        <div class="notif-icon">${typeIcons[n.type] || '📢'}</div>
        <div class="notif-body">
          <div class="notif-text">${n.title}</div>
          <div class="notif-meta">
            <span class="notif-from">${n.authorName || 'Admin'}</span>
            <span class="notif-time">${timeAgo(n.createdAt?.toDate?.())}</span>
          </div>
        </div>
        ${isNew ? '<div class="notif-dot"></div>' : ''}`;
      el.onclick = () => window.location.href = 'notices.html';
      container.appendChild(el);
    });

    unreadCount = newCount;
    if (badge) {
      badge.textContent = newCount;
      badge.style.display = newCount > 0 ? 'flex' : 'none';
    }
  });
}

// ---- TIP MODAL (for students) ----
function showTipModal() {
  // Remove existing modal if any
  document.getElementById('tip-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'tip-modal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2>💡 Share a Notification Tip</h2>
        <button class="modal-close" onclick="document.getElementById('tip-modal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem">
          Know something useful? Share it! Admin will review and publish it to everyone.
        </p>
        <div class="form-group">
          <label class="form-label">Title *</label>
          <input type="text" class="form-input" id="tip-title" placeholder="e.g., Google Internship applications are open"/>
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-input" id="tip-type">
            <option value="general">📢 General</option>
            <option value="internship">💼 Internship</option>
            <option value="hackathon">🏆 Hackathon</option>
            <option value="placement">🎓 Placement</option>
            <option value="exam">📝 Exam</option>
            <option value="event">🎉 Event</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Details</label>
          <textarea class="form-input" id="tip-content" rows="4" placeholder="Add more details, links, deadlines..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Source Link (optional)</label>
          <input type="url" class="form-input" id="tip-link" placeholder="https://..."/>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="document.getElementById('tip-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="window._submitTip()">Submit for Review</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  window._submitTip = async () => {
    const title = document.getElementById('tip-title').value.trim();
    const type = document.getElementById('tip-type').value;
    const content = document.getElementById('tip-content').value.trim();
    const link = document.getElementById('tip-link').value.trim();
    if (!title) { toast('Please enter a title', 'error'); return; }
    try {
      await addDoc(collection(db, 'notifications'), {
        title, type, content, link: link || null,
        approved: false,
        submittedBy: currentUser.uid,
        authorName: currentUserData.name || 'Student',
        createdAt: serverTimestamp()
      });
      document.getElementById('tip-modal').remove();
      toast('Tip submitted! Admin will review it shortly.', 'success');
    } catch(e) { toast('Failed to submit', 'error'); }
  };
}

export { showTipModal };

// ---- PUSH NOTIFICATION (for admin/faculty from notices.html) ----
export async function pushNotification(title, type, content, link, authorName) {
  await addDoc(collection(db, 'notifications'), {
    title, type, content: content || '', link: link || null,
    approved: true,
    authorName: authorName || 'Admin',
    createdAt: serverTimestamp()
  });
}

// ---- GLOBAL SEARCH ----
export async function openGlobalSearch(q) {
  if (!q.trim()) return;
  window.location.href = 'search.html?q=' + encodeURIComponent(q);
}

// ---- LOGOUT ----
export async function logout() {
  await signOut(auth);
  window.location.href = '../index.html';
}

// ---- TOAST ----
export function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  t.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span>' + msg + '</span>';
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = '0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// ---- LOADING ----
export function showLoading(v) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = v ? 'flex' : 'none';
}

// ---- MODAL ----
export function openModal(id) { document.getElementById(id)?.classList.add('active'); }
export function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
window.closeModal = closeModal;

// ---- TIME AGO ----
export function timeAgo(date) {
  if (!date) return '';
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return date.toLocaleDateString();
}

// ---- FILE HELPERS ----
export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
export function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = { pdf:'📄', doc:'📝', docx:'📝', ppt:'📊', pptx:'📊', xls:'📈', xlsx:'📈', zip:'🗜️', rar:'🗜️', mp4:'🎬', mp3:'🎵', jpg:'🖼️', jpeg:'🖼️', png:'🖼️' };
  return map[ext] || '📁';
}
export function getFileClass(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc','docx'].includes(ext)) return 'doc';
  if (['ppt','pptx'].includes(ext)) return 'ppt';
  if (['zip','rar'].includes(ext)) return 'zip';
  return 'other';
}

// ---- UPLOAD FILE (Cloudinary) ----
export function uploadFile(file, _unusedPath, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('access_mode', 'public');
    formData.append('resource_type', 'auto');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/auto/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) { resolve(JSON.parse(xhr.responseText).secure_url); }
      else { try { reject(new Error(JSON.parse(xhr.responseText).error?.message || 'Upload failed')); } catch { reject(new Error('Upload failed')); } }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

// uploadAttachment — for images and PDFs in doubts/notices
// Uses /auto/upload same as uploadFile — works with existing unsigned preset
export function uploadAttachment(file, onProgress) {
  return new Promise((resolve, reject) => {
    const preset = CLOUDINARY_UPLOAD_PRESET;
    const cloud = CLOUDINARY_CLOUD_NAME;
    if (!preset || !cloud) {
      reject(new Error('Cloudinary config missing. Check firebase-config.js'));
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', preset);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) { resolve(JSON.parse(xhr.responseText).secure_url); }
      else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error?.message || 'Upload failed'));
        } catch { reject(new Error('Upload failed')); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

// ---- SIDEBAR HTML ----
export function getSidebarHTML(role) {
  if (role === 'admin') {
    return '<div class="nav-section-title">Management</div>'
      + '<div class="nav-item" data-page="admin" onclick="navigate(\'admin.html\')"><span class="nav-item-icon">🛡️</span>Dashboard</div>'
      + '<div class="nav-section-title">Platform</div>'
      + '<div class="nav-item" data-page="communities" onclick="navigate(\'communities.html\')"><span class="nav-item-icon">👥</span>Communities</div>'
      + '<div class="nav-item" data-page="doubts" onclick="navigate(\'doubts.html\')"><span class="nav-item-icon">❓</span>Doubts</div>'
      + '<div class="nav-item" data-page="resources" onclick="navigate(\'resources.html\')"><span class="nav-item-icon">📚</span>Resources</div>'
      + '<div class="nav-item" data-page="notices" onclick="navigate(\'notices.html\')"><span class="nav-item-icon">📢</span>Notices</div>'
      + '<div class="nav-item" data-page="tests" onclick="navigate(\'tests.html\')"><span class="nav-item-icon">📝</span>Tests</div>'
      + '<div class="nav-item" data-page="leaderboard" onclick="navigate(\'leaderboard.html\')"><span class="nav-item-icon">🏆</span>Leaderboard</div>'
      + '<div class="nav-section-title">Account</div>'
      + '<div class="nav-item" data-page="profile" onclick="navigate(\'profile.html\')"><span class="nav-item-icon">👤</span>My Profile</div>';
  }
  if (role === 'faculty') {
    return '<div class="nav-section-title">Main</div>'
      + '<div class="nav-item" data-page="dashboard" onclick="navigate(\'dashboard.html\')"><span class="nav-item-icon">🏠</span>Dashboard</div>'
      + '<div class="nav-item" data-page="communities" onclick="navigate(\'communities.html\')"><span class="nav-item-icon">👥</span>Communities</div>'
      + '<div class="nav-item" data-page="doubts" onclick="navigate(\'doubts.html\')"><span class="nav-item-icon">❓</span>Doubts</div>'
      + '<div class="nav-section-title">Manage</div>'
      + '<div class="nav-item" data-page="resources" onclick="navigate(\'resources.html\')"><span class="nav-item-icon">📚</span>Resources</div>'
      + '<div class="nav-item" data-page="notices" onclick="navigate(\'notices.html\')"><span class="nav-item-icon">📢</span>Notices</div>'
      + '<div class="nav-item" data-page="tests" onclick="navigate(\'tests.html\')"><span class="nav-item-icon">📝</span>Tests</div>'
      + '<div class="nav-section-title">Account</div>'
      + '<div class="nav-item" data-page="profile" onclick="navigate(\'profile.html\')"><span class="nav-item-icon">👤</span>My Profile</div>';
  }
  return '<div class="nav-section-title">Main</div>'
    + '<div class="nav-item" data-page="dashboard" onclick="navigate(\'dashboard.html\')"><span class="nav-item-icon">🏠</span>Dashboard</div>'
    + '<div class="nav-item" data-page="communities" onclick="navigate(\'communities.html\')"><span class="nav-item-icon">👥</span>Communities</div>'
    + '<div class="nav-item" data-page="doubts" onclick="navigate(\'doubts.html\')"><span class="nav-item-icon">❓</span>Doubt Solver</div>'
    + '<div class="nav-section-title">Resources</div>'
    + '<div class="nav-item" data-page="resources" onclick="navigate(\'resources.html\')"><span class="nav-item-icon">📚</span>Resources</div>'
    + '<div class="nav-item" data-page="notices" onclick="navigate(\'notices.html\')"><span class="nav-item-icon">📢</span>Notice Board</div>'
    + '<div class="nav-section-title">Assessment</div>'
    + '<div class="nav-item" data-page="tests" onclick="navigate(\'tests.html\')"><span class="nav-item-icon">📝</span>Tests & Exams</div>'
    + '<div class="nav-item" data-page="leaderboard" onclick="navigate(\'leaderboard.html\')"><span class="nav-item-icon">🏆</span>Leaderboard</div>'
    + '<div class="nav-section-title">Account</div>'
    + '<div class="nav-item" data-page="profile" onclick="navigate(\'profile.html\')"><span class="nav-item-icon">👤</span>My Profile</div>';
}

// ---- LAYOUT HTML ----
export function getLayoutHTML(pageTitle, contentHTML, role) {
  return '<div id="toast-container"></div>'
    + '<div id="loading-overlay" class="loading-overlay" style="display:none">'
    + '<div class="loading-box"><div class="loading-spinner" style="width:32px;height:32px;border-width:3px;"></div>'
    + '<div style="font-size:0.9rem;color:var(--text-secondary)">Loading...</div></div></div>'
    + '<div class="sidebar-overlay" id="sidebar-overlay"></div>'
    + '<nav class="bottom-nav" id="bottom-nav">'
    + '<div class="bottom-nav-scroll">'
    + '<a class="bottom-nav-item" onclick="navigate(\'dashboard.html\')" data-page="dashboard"><i class="fa fa-home"></i><span>Home</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'communities.html\')" data-page="communities"><i class="fa fa-users"></i><span>Groups</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'doubts.html\')" data-page="doubts"><i class="fa fa-question-circle"></i><span>Doubts</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'resources.html\')" data-page="resources"><i class="fa fa-book"></i><span>Resources</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'notices.html\')" data-page="notices"><i class="fa fa-bullhorn"></i><span>Notices</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'tests.html\')" data-page="tests"><i class="fa fa-file-alt"></i><span>Tests</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'leaderboard.html\')" data-page="leaderboard"><i class="fa fa-trophy"></i><span>Ranks</span></a>'
    + '<a class="bottom-nav-item" onclick="navigate(\'profile.html\')" data-page="profile"><i class="fa fa-user"></i><span>Profile</span></a>'
    + '</div>'
    + '</nav>'
    + '<div class="app-layout">'
    + '<aside class="sidebar" id="sidebar">'
    + '<div class="sidebar-logo"><div class="logo-icon">🎓</div><div class="logo-text">CampusConnect<span>Academic Platform</span></div></div>'
    + '<div class="sidebar-user">'
    + '<div class="sidebar-user-avatar" id="sidebar-avatar">U</div>'
    + '<div class="sidebar-user-info">'
    + '<div class="sidebar-user-name" id="sidebar-name">Loading...</div>'
    + '<div class="sidebar-user-role" id="sidebar-role">Loading...</div>'
    + '</div></div>'
    + '<nav class="sidebar-nav" id="sidebar-nav"></nav>'
    + '<div class="sidebar-footer">'
    + '<button class="logout-btn" onclick="window._logout()"><i class="fa fa-sign-out-alt"></i> Sign Out</button>'
    + '</div></aside>'
    + '<div class="main-content">'
    + '<header class="topbar">'
    + '<div class="topbar-left">'
    + '<button class="hamburger-btn" id="hamburger-btn"><i class="fa fa-bars"></i></button>'
    + '<div class="topbar-logo-mobile"><span>🎓</span><span class="topbar-logo-text">CampusConnect</span></div>'
    + '<span class="topbar-title topbar-title-desktop">' + pageTitle + '</span>'
    + '</div>'
    + '<div class="topbar-search">'
    + '<i class="fa fa-search search-icon"></i>'
    + '<input type="text" placeholder="Search..." id="topbar-search-input"/>'
    + '</div>'
    + '<div class="topbar-right">'
    + '<button class="theme-toggle-btn topbar-theme-btn" id="theme-btn" title="Toggle theme" onclick="window._toggleTheme()">🌙</button>'
    + '<div style="position:relative">'
    + '<button class="topbar-btn" id="notif-btn" title="Notifications"><i class="fa fa-bell"></i><span class="badge" id="notif-badge" style="display:none">0</span></button>'
    + '<div class="notif-dropdown" id="notif-dropdown" style="position:fixed;top:60px;right:8px;left:8px;width:auto;max-height:65vh;overflow-y:auto;z-index:9999">'
    + '<div class="notif-header">'
    + '<span class="notif-title">🔔 Notifications</span>'
    + '<span class="notif-mark-read" onclick="window._markRead()" style="font-size:0.75rem;color:var(--accent);cursor:pointer">Mark all read</span>'
    + '</div>'
    + (role === 'student' ? '<div class="notif-tip-btn" onclick="window._showTip()">💡 Share a notification tip</div>' : '')
    + (role === 'faculty' ? '<div class="notif-tip-btn" onclick="navigate(\'notices.html\')">🔔 Push a notification</div>' : '')
    + '<div id="notif-list"></div>'
    + '</div></div>'
    + '<div style="position:relative">'
    + '<div class="avatar-btn" id="topbar-avatar-btn">U</div>'
    + '<div class="user-dropdown" id="user-dropdown">'
    + '<div class="user-dropdown-item" onclick="navigate(\'profile.html\')"><i class="fa fa-user" style="width:16px"></i> My Profile</div>'
    + '<div class="user-dropdown-divider"></div>'
    + '<div class="user-dropdown-item danger" onclick="window._logout()"><i class="fa fa-sign-out-alt" style="width:16px"></i> Sign Out</div>'
    + '</div></div>'
    + '</div></header>'
    + '<main>' + contentHTML + '</main>'
    + '</div></div>';
}

window.navigate = (page) => window.location.href = page;

// ---- THEME SYSTEM ----
function initTheme() {
  const saved = localStorage.getItem('cc_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cc_theme', next);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

window._toggleTheme = toggleTheme;

window.toggleMoreSheet = function() {
  const sheet = document.getElementById('more-sheet');
  if (sheet) sheet.classList.toggle('open');
  // Highlight more btn if on a "more" page
  const page = window.location.pathname.split('/').pop().replace('.html','');
  const morePages = ['notices','tests','leaderboard','profile'];
  const moreBtn = document.getElementById('more-btn');
  if (moreBtn && morePages.includes(page)) moreBtn.classList.add('active');
};

// Init theme on page load
initTheme();

window._markRead = markNotificationsRead;
window._showTip = showTipModal;

export { auth, db, onAuthStateChanged, signOut, doc, getDoc, collection, query, where, orderBy, limit, onSnapshot, updateDoc, serverTimestamp, addDoc, getDocs, increment, deleteDoc, writeBatch, arrayUnion, arrayRemove, getCountFromServer };