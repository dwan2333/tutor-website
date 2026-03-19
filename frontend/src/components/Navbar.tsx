'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout, isLoggedIn } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  const handleLogout = () => {
    logout();
    setLoggedIn(false);
    router.push('/login');
  };

  return (
    <nav className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="text-lg font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
          TutorAI
        </Link>

        <div className="flex items-center gap-4">
          {loggedIn ? (
            <>
              <Link href="/dashboard" className="text-sm text-gray-300 hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link href="/upload" className="text-sm text-gray-300 hover:text-white transition-colors">
                Upload
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="text-sm px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
