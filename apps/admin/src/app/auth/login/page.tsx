'use client';

import { useState } from 'react';
import styles from './login.module.css';

type LoginResponse = {
  success?: boolean;
  redirectTo?: string;
  details?: string;
  error?: string;
};

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as LoginResponse;
      if (res.ok && data.success) {
        window.location.href = data.redirectTo || '/';
        return;
      }

      setError(data.details || data.error || 'Login failed');
      setIsSubmitting(false);
    } catch {
      setError('An error occurred during login');
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Medical CRM</h1>
          <p className={styles.subtitle}>Unified Portal Login</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            Sign in to your account
          </h2>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="username" className={styles.label}>
                Username / Email
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                required
                className={styles.input}
                placeholder="Enter username or email"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
                className={styles.input}
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submit}
            >
              {isSubmitting ? (
                <>
                  <div className={styles.spinner} />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
