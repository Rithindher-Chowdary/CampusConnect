// ============================================================
// CAMPUSCONNECT — FIREBASE + CLOUDINARY CONFIGURATION
// ============================================================
// Firebase handles: Auth + Firestore database (FREE tier)
// Cloudinary handles: File storage (FREE 25GB — no credit card)
//
// SETUP STEPS:
// 1. Firebase (firebase.google.com) — create project, enable
//    Auth (Email/Password) + Firestore. NO Storage needed.
// 2. Cloudinary (cloudinary.com) — free signup, get cloud name
//    and create an unsigned upload preset (see SETUP_GUIDE.html)
// 3. Replace the placeholder values below with your actual values
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔴 STEP 1 — Replace with YOUR Firebase config
// (Get this from Firebase Console → Project Settings → Your apps → SDK setup)
const firebaseConfig = {
  apiKey: "AIzaSyCrG0r5vN17G4h9dz4pDi_1STU0366ZFss",
  authDomain: "campusconnect-84ca4.firebaseapp.com",
  projectId: "campusconnect-84ca4",
  storageBucket: "campusconnect-84ca4.firebasestorage.app",
  messagingSenderId: "954235608862",
  appId: "1:954235608862:web:da3bb26e264675f114730f"
};

// 🔴 STEP 2 — Replace with YOUR Cloudinary details
// Cloud name: shown on your Cloudinary dashboard (top-left)
// Upload preset: Cloudinary Dashboard → Settings → Upload → Upload presets → Add unsigned preset
export const CLOUDINARY_CLOUD_NAME = "dieb4xhvh";   // e.g. "dxyz1234abc"
export const CLOUDINARY_UPLOAD_PRESET = "campusconnect_uploads";   // e.g. "campusconnect_uploads"

// ---- Initialize Firebase ----
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ============================================================
// FIRESTORE SECURITY RULES — Paste in Firebase Console > Firestore > Rules
// ============================================================
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null &&
        (request.auth.uid == userId ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
      allow delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /registeredIds/{docId} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /communities/{communityId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        (resource.data.createdBy == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }

    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        (resource.data.authorId == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty']);
    }

    match /comments/{commentId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        (resource.data.authorId == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty']);
    }

    match /doubts/{doubtId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        (resource.data.authorId == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty']);
    }

    match /answers/{answerId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        (resource.data.authorId == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty']);
    }

    match /resources/{resourceId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        (resource.data.authorId == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }

    match /tests/{testId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        (resource.data.createdBy == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }

    match /testSubmissions/{subId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null &&
        (resource.data.userId == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty']);
      allow delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /notices/{noticeId} {
      allow read: if request.auth != null;
      allow update: if request.auth != null;
      allow create, delete: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty'];
    }

    match /adminLogs/{logId} {
      allow read, write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
*/