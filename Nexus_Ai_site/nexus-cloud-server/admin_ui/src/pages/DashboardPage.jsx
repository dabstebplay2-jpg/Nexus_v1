import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adminFetch } from '../lib/adminApi';

const PIE_COLORS = ['#71717a', '#22d3ee', '#a78bfa', '#4ade80', '#fbbf24'];

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [regs, setRegs] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [s, r, t, rev] = await Promise.all([
        adminFetch('/analytics/summary'),
        adminFetch('/analytics/registrations?days=30'),
        adminFetch('/analytics/tiers'),
        adminFetch('/analytics/revenue?days=30'),
      ]);
      setSummary(s);
      setRegs(r.items || []);
      setTiers(t.items || []);
      setRevenue(rev.items || []);
    } catch {
      /* parent handles auth */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (loading && !summary) {
    return (
      <>
        <h1 className="page-title">Обзор</h1>
        <div className="skeleton" />
      </>
    );
  }

  const kpis = [
    { label: 'Пользователей', value: summary?.users_total ?? '—' },
    { label: 'Новых за 7д', value: summary?.users_new_7d ?? '—' },
    { label: 'Платных', value: summary?.users_paid ?? '—' },
    { label: 'MRR (оценка)', value: summary ? `$${summary.mrr_usd_estimate}` : '—' },
    { label: 'TG привязано', value: summary?.users_telegram_linked ?? '—' },
    { label: 'OpenRouter ключей', value: summary?.users_with_openrouter_key ?? '—' },
    { label: 'Счетов pending', value: summary?.invoices_pending ?? '—' },
  ];

  return (
    <>
      <h1 className="page-title">Обзор</h1>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="kpi-card">
            <div className="label">{k.label}</div>
            <div className="value">{k.value}</div>
          </div>
        ))}
      </div>
      <div className="chart-grid">
        <div className="chart-card">
          <h3>Регистрации (30 дней)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={regs}>
              <CartesianGrid stroke="#2a2a33" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#18181f', border: '1px solid #2a2a33' }} />
              <Line type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Тарифы</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={tiers} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius={70} label>
                {tiers.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#18181f', border: '1px solid #2a2a33' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <h3>Выручка / транзакции (30 дней)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenue}>
              <CartesianGrid stroke="#2a2a33" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#18181f', border: '1px solid #2a2a33' }} />
              <Bar dataKey="tx_usd" fill="#22d3ee" name="TX USD" />
              <Bar dataKey="invoice_rub" fill="#a78bfa" name="Invoice ₽" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
