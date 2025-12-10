'use client';
import React, { useCallback, Suspense, useMemo, useEffect, useState } from "react";
import dynamic from "next/dynamic"; // kept as requested
import styles from './page.module.css';

/* -------------------------
   Types
   ------------------------- */
type Expense = {
  id: number;
  payerName: string;
  amount: number;
  description: string;
  // backend may return CSV string or array; handle both client-side
  participants: string | string[];
  createdAt: string;
};

type Settlement = {
  from: string;
  to: string;
  amount: number;
};

type SettlementsResponse = {
  balances: Record<string, number>;
  settlements: Settlement[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/* -------------------------
   Helper utilities
   ------------------------- */
const formatCurrency = (n: number) => Number(n).toFixed(2);

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const c = Math.abs(h % 360);
  return `hsl(${c} 70% 55%)`;
}

/* -------------------------
   Participants parsing + shares
   ------------------------- */

type ParticipantShare = { name: string; count: number };

/**
 * Accepts:
 *  - CSV string: "Alice,Bob,Charlie"
 *  - weighted CSV: "Alice:2,Bob:1"
 *  - array: ["Alice","Bob"]
 */
const parseParticipantsInput = (input: string | string[] | undefined): ParticipantShare[] => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((n) => ({ name: String(n).trim(), count: 1 })).filter((p) => p.name);
  }
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [rawName, rawCount] = s.split(':').map((x) => x.trim());
      const count = rawCount ? Math.max(1, Number(rawCount) || 1) : 1;
      return { name: rawName, count };
    })
    .filter((p) => p.name);
};

/**
 * Compute per-person shares for one expense.
 * Returns map: name -> amount
 */
const computeSharesForExpense = (expense: Expense): Record<string, number> => {
  const shares = parseParticipantsInput(expense.participants);
  const totalUnits = shares.reduce((s, p) => s + p.count, 0) || 1;
  const amount = Number(expense.amount) || 0;
  const perUnit = amount / totalUnits;
  const map: Record<string, number> = {};
  shares.forEach((p) => {
    map[p.name] = (map[p.name] || 0) + p.count * perUnit;
  });
  return map;
};

/* -------------------------
   Simple toast hook
   ------------------------- */
type Toast = { id: string; text: string; kind?: 'success' | 'error' | 'info' };
const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return { toasts, push, remove: (id: string) => setToasts((t) => t.filter((x) => x.id !== id)) };
};

/* -------------------------
   Main Page component
   ------------------------- */
export default function HomePage() {
  // kept as requested
  const [payerName, setPayerName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [participantsInput, setParticipantsInput] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  // safe additions
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'amount' | 'payer'>('newest');
  const [expandedExpense, setExpandedExpense] = useState<number | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [dark, setDark] = useState(false);
  const [showEmptyIllustration, setShowEmptyIllustration] = useState(true);
  const [skeletonLoading, setSkeletonLoading] = useState(false);

  // group filter (client-side): uses description tag [group:Name]
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const { toasts, push: pushToast } = useToasts();

  /* -------------------------
     Fetch function with AbortController & defensive parsing
     ------------------------- */
  const fetchExpensesAndSettlements = useCallback(async (signal?: AbortSignal) => {
    try {
      setSkeletonLoading(true);
      const [expensesRes, settlementsRes] = await Promise.all([
        fetch(`${API_URL}/expenses`, { signal }),
        fetch(`${API_URL}/expenses/settlements`, { signal }),
      ]);

      if (!expensesRes.ok) {
        const t = await expensesRes.text();
        throw new Error(`Expenses fetch failed: ${expensesRes.status} ${t}`);
      }
      if (!settlementsRes.ok) {
        const t = await settlementsRes.text();
        throw new Error(`Settlements fetch failed: ${settlementsRes.status} ${t}`);
      }

      const expensesData = await expensesRes.json();
      const settlementsData: SettlementsResponse = await settlementsRes.json();

      // defensive normalization: participants as string or array -> store as returned type (we'll handle both).
      setExpenses(
        (expensesData || []).map((ex: any) => ({
          ...ex,
          participants: Array.isArray(ex.participants) ? ex.participants : String(ex.participants ?? ''),
        }))
      );
      setSettlements(settlementsData?.settlements ?? []);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // aborted - ignore
        console.info('fetch aborted');
      } else {
        console.error('Fetch error', err);
        pushToast('Failed to load data', 'error');
      }
    } finally {
      setSkeletonLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    const controller = new AbortController();
    fetchExpensesAndSettlements(controller.signal).catch((e) => console.warn(e));
    return () => controller.abort();
  }, [fetchExpensesAndSettlements]);

  /* -------------------------
     Group tag helper e.g. "[group:Trip1]"
     ------------------------- */
  const parseGroupTag = useCallback((desc?: string): string | null => {
    if (!desc) return null;
    const m = desc.match(/\[group:([^\]]+)\]/i);
    return m ? m[1].trim() : null;
  }, []);

  const groups = useMemo(() => {
    const s = new Set<string>();
    expenses.forEach((e) => {
      const g = parseGroupTag(e.description);
      if (g) s.add(g);
    });
    return Array.from(s);
  }, [expenses, parseGroupTag]);

  /* -------------------------
     Filtering / Sorting (respects groupFilter)
     ------------------------- */
  const filtered = useMemo(() => {
    let list = expenses.slice();

    if (groupFilter) {
      list = list.filter((e) => parseGroupTag(e.description) === groupFilter);
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) => {
        const parts = Array.isArray(e.participants) ? e.participants.join(',') : String(e.participants);
        return (
          e.payerName.toLowerCase().includes(q) ||
          String(e.description).toLowerCase().includes(q) ||
          parts.toLowerCase().includes(q)
        );
      });
    }

    if (sortBy === 'amount') list.sort((a, b) => Number(b.amount) - Number(a.amount));
    else if (sortBy === 'payer') list.sort((a, b) => a.payerName.localeCompare(b.payerName));
    else list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return list;
  }, [expenses, query, sortBy, groupFilter, parseGroupTag]);

  /* -------------------------
     Total summary (memoized)
     ------------------------- */
  const summary = useMemo(() => {
    const list = groupFilter
      ? expenses.filter((e) => parseGroupTag(e.description) === groupFilter)
      : expenses;
    const total = list.reduce((s, e) => s + Number(e.amount || 0), 0);

    const peopleSet = new Set<string>();
    list.forEach((e) =>
      parseParticipantsInput(e.participants).forEach((p) => {
        if (p.name) peopleSet.add(p.name);
      })
    );
    const people = Array.from(peopleSet);
    const avg = people.length ? total / people.length : 0;
    return { total, peopleCount: people.length, avg };
  }, [expenses, groupFilter, parseGroupTag]);

  /* -------------------------
     Submit: validate and post
     ------------------------- */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const parsedAmount = Number(amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      pushToast('Please enter a valid positive amount', 'error');
      setLoading(false);
      return;
    }

    // build participants array to send to API (names only)
    const parsedParticipants = parseParticipantsInput(participantsInput).map((p) => p.name);
    if (parsedParticipants.length === 0) {
      pushToast('Please add at least one participant', 'error');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payerName,
          amount: parsedAmount,
          description,
          participants: parsedParticipants,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to create expense: ${res.status} ${body}`);
      }

      setPayerName('');
      setAmount('');
      setDescription('');
      setParticipantsInput('');
      pushToast('Expense added', 'success');
      await fetchExpensesAndSettlements();
    } catch (err) {
      console.error(err);
      pushToast('Error adding expense. See console for details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [payerName, amount, description, participantsInput, fetchExpensesAndSettlements, pushToast]);

  /* -------------------------
     Delete single expense (with confirm)
     ------------------------- */
  const deleteExpense = useCallback(async (id: number) => {
    if (!confirm('Delete this single expense?')) return;
    try {
      const res = await fetch(`${API_URL}/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Delete failed');
      }
      pushToast('Expense deleted', 'success');
      await fetchExpensesAndSettlements();
    } catch (err) {
      console.error(err);
      pushToast('Failed to delete', 'error');
    }
  }, [fetchExpensesAndSettlements, pushToast]);

  /* -------------------------
     Clear history
     ------------------------- */
  const performClear = useCallback(async () => {
    setShowClearModal(false);
    setClearing(true);
    try {
      const res = await fetch(`${API_URL}/expenses`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Failed to clear: ${res.status} ${text}`);
      }
      pushToast('History cleared', 'success');
      await fetchExpensesAndSettlements();
      setShowEmptyIllustration(true);
    } catch (err) {
      console.error('Clear error', err);
      pushToast('Failed to clear history', 'error');
    } finally {
      setClearing(false);
    }
  }, [fetchExpensesAndSettlements, pushToast]);

  /* -------------------------
     Copy settlements summary
     ------------------------- */
  const copySettlements = useCallback(async () => {
    if (!navigator.clipboard) {
      pushToast('Clipboard not available', 'error');
      return;
    }
    const text = settlements.length
      ? settlements.map((s) => `${s.from} → ${s.to}: ₹${formatCurrency(s.amount)}`).join('\n')
      : 'No settlements';
    try {
      await navigator.clipboard.writeText(text);
      pushToast('Settlements copied', 'success');
    } catch {
      pushToast('Failed to copy', 'error');
    }
  }, [settlements, pushToast]);

  /* -------------------------
     Expand / collapse
     ------------------------- */
  const toggleExpand = useCallback((id: number) => {
    setExpandedExpense((p) => (p === id ? null : id));
  }, []);

  /* -------------------------
     UI Render
     ------------------------- */
  return (
    <main className={`${styles.container} ${dark ? styles.dark : ''}`}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>💚</div>
          <div>
            <h1 className={styles.title}>Expense Splitter</h1>
            <div className={styles.subtitle}>Smart, minimal — who owes whom</div>
          </div>
        </div>

        <div className={styles.headerControls}>
          <button
            className={styles.iconBtn}
            title="Toggle dark / light"
            onClick={() => setDark((d) => !d)}
            aria-pressed={dark}
          >
            {dark ? '🌙' : '☀️'}
          </button>

          <button
            className={styles.iconBtn}
            onClick={() => {
              pushToast('Auto refresh', 'info');
              fetchExpensesAndSettlements().catch(console.error);
            }}
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </header>

      {/* Grid */}
      <div className={styles.grid}>
        {/* LEFT: Form + Summary */}
        <aside className={styles.left}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Add Expense</h2>
              <div className={styles.cardActions}>
                <button
                  onClick={() => {
                    setPayerName(''); setAmount(''); setDescription(''); setParticipantsInput('');
                    pushToast('Cleared form', 'info');
                  }}
                  className={styles.ghostBtn}
                  title="Clear form"
                >
                  ✖
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.floatingLabel}>
                  <input
                    placeholder=" "
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    required
                  />
                  <span>Payer name </span>
                </label>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.floatingLabel}>
                    <input
                      placeholder=" "
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                    <span>Amount</span>
                  </label>
                </div>

                <div className={styles.field}>
                  <label className={styles.floatingLabel}>
                    <input
                      placeholder=" "
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                    <span>Description</span>
                  </label>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.floatingLabel}>
                  <input
                    placeholder=" "
                    value={participantsInput}
                    onChange={(e) => setParticipantsInput(e.target.value)}
                    required
                  />
                  <span>Participants</span>
                </label>
                <div className={styles.helper}>
                  e.g. Alice,Bob,Charlie 
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="submit" disabled={loading} className={styles.primaryBtn}>
                  {loading ? 'Saving...' : 'Add Expense'}
                </button>

                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowClearModal(true)}
                >
                  {clearing ? 'Clearing...' : 'Clear history'}
                </button>
              </div>
            </form>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Summary</h3>
              <div className={styles.cardActions}>
                <button className={styles.ghostBtn} onClick={copySettlements} title="Copy settlements">
                  📋
                </button>
              </div>
            </div>

            <div className={styles.summary}>
              <div>
                <div className={styles.summaryLabel}>Total</div>
                <div className={styles.summaryValue}>₹ {formatCurrency(summary.total)}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>People</div>
                <div className={styles.summaryValue}>{summary.peopleCount}</div>
              </div>
              <div>
                <div className={styles.summaryLabel}>Avg / person</div>
                <div className={styles.summaryValue}>₹ {formatCurrency(summary.avg)}</div>
              </div>
            </div>

           
          </div>
        </aside>

        {/* RIGHT: Expenses & Settlements */}
        <section className={styles.right}>
          <div className={styles.topRow}>
            <div className={styles.searchBox}>
              <input
                placeholder="Search expenses..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="newest">Newest</option>
                <option value="amount">Amount</option>
                <option value="payer">Payer</option>
              </select>

              {groups.length > 0 && (
                <select
                  value={groupFilter ?? ''}
                  onChange={(e) => setGroupFilter(e.target.value || null)}
                  title="Filter by group"
                >
                  <option value="">All groups</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.settlementSummary}>
              <h4>Settlements</h4>
              <div className={styles.settlementList}>
                {skeletonLoading ? (
                  <div className={styles.skeletonRow} />
                ) : settlements.length === 0 ? (
                  <div className={styles.emptyInline}>
                    <div>No settlements yet</div>
                  </div>
                ) : (
                  settlements.map((s, i) => (
                    <div className={styles.settlementCard} key={i}>
                      <div className={styles.avatar} style={{ background: avatarColor(s.from) }}>
                        {initials(s.from)}
                      </div>
                      <div className={styles.settlementText}>
                        <div className={styles.settlementFromTo}>
                          <strong>{s.from}</strong> → <strong>{s.to}</strong>
                        </div>
                        <div className={styles.settlementAmount}>₹ {formatCurrency(s.amount)}</div>
                      </div>
                      <div>
                        <button
                          className={styles.iconSmall}
                          onClick={() => {
                            navigator.clipboard?.writeText(`${s.from} owes ${s.to}: ₹${formatCurrency(s.amount)}`);
                            pushToast('Copied', 'success');
                          }}
                          title="Copy"
                        >
                          📎
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Expenses list */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Expenses</h3>
              <div className={styles.cardActions}>
                <small>{expenses.length} total</small>
              </div>
            </div>

            {skeletonLoading ? (
              <div className={styles.skeletonList}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className={styles.skeletonCard} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <h4>No expenses yet</h4>
                <p>Add your first expense on the left to get started.</p>
              </div>
            ) : (
              <ul className={styles.expenseList}>
                {filtered.map((e) => {
                  const expanded = expandedExpense === e.id;
                  const shares = computeSharesForExpense(e);
                  return (
                    <li key={e.id} className={`${styles.expenseCard} ${expanded ? styles.expanded : ''}`}>
                      <div className={styles.expenseRow}>
                        <div className={styles.expenseLeft}>
                          <div className={styles.avatarSmall} style={{ background: avatarColor(e.payerName) }}>
                            {initials(e.payerName)}
                          </div>
                          <div>
                            <div className={styles.expenseTitle}>
                              <strong>{e.payerName}</strong> paid ₹ {formatCurrency(Number(e.amount))}
                            </div>
                            <div className={styles.expenseMeta}>
                              <span>{e.description}</span> • <span>{timeAgo(e.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className={styles.expenseRight}>
                          <button className={styles.iconSmall} onClick={() => toggleExpand(e.id)} title="Expand">
                            {expanded ? '▾' : '▸'}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className={styles.expenseDetails}>
                          <div>
                            <strong>Participants:</strong>{' '}
                            {Array.isArray(e.participants) ? e.participants.join(', ') : String(e.participants)}
                          </div>

                          <div style={{ marginTop: 8 }}>
                            <strong>Split:</strong>
                            <ul>
                              {Object.entries(shares).map(([name, amt]) => (
                                <li key={name}>
                                  {name}: ₹ {formatCurrency(amt)}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className={styles.detailActions}>
                            <button
                              className={styles.ghostBtn}
                              onClick={() => {
                                navigator.clipboard?.writeText(
                                  `Expense: ${e.description} — ₹${formatCurrency(Number(e.amount))}`
                                );
                                pushToast('Expense copied', 'success');
                              }}
                            >
                              Copy
                            </button>
                            <button
                              className={styles.ghostBtn}
                              onClick={() => deleteExpense(e.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <small>Made with ❤️ — keeps your API & state logic exactly as before.</small>
      </footer>

      {/* Confirm modal (for clearing) */}
      {showClearModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Clear all expense history?</h3>
            <p>This will permanently delete all expenses and reset balances. This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button className={styles.ghostBtn} onClick={() => setShowClearModal(false)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={performClear} disabled={clearing}>
                {clearing ? 'Clearing...' : 'Yes, clear history'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className={styles.toastWrap}>
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.kind}`]}`}>
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}
