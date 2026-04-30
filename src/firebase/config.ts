import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAndIa4rm3Iqenhn2aghPxhsEKyT9WLBh8",
  authDomain: "raheequiz.firebaseapp.com",
  databaseURL: "https://raheequiz-default-rtdb.firebaseio.com",
  projectId: "raheequiz",
  storageBucket: "raheequiz.firebasestorage.app",
  messagingSenderId: "720624816759",
  appId: "1:720624816759:web:9065249508609304c6ec72"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
