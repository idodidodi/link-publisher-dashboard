'use client';

import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  TrendingUp,
  MousePointer2,
  Eye,
  DollarSign,
  LayoutDashboard,
  Calendar,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Settings2,
  X
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StatItem {
  ddate: string;
  impressions: number;
  clicks: number;
  revenue?: number;
  cost?: number;
  value?: number;
  blastRevenue?: number;
  topsRevenue?: number;
  ctr: number;
  cpm: number;
}

interface StatsData {
  data: {
    result: StatItem[];
  };
  role: string | null;
}

const PUBLISHERS_TABS = ['Adsterra', 'Exoclick', 'Rollerads', 'TrafficShop', 'TrafficStars', 'Traforama', 'Twinred'];


export default function Dashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePublisher, setActivePublisher] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('activePublisher');
      if (saved && PUBLISHERS_TABS.includes(saved)) return saved;
    }
    return 'TrafficStars';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activePublisher', activePublisher);
    }
  }, [activePublisher]);

  // Applied dates (used for fetching)
  const [appliedFrom, setAppliedFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const [appliedTo, setAppliedTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Modal & Selection States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(appliedFrom);
  const [pendingTo, setPendingTo] = useState(appliedTo);
  const [validationError, setValidationError] = useState<string | null>(null);


  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/stats?publisher=${activePublisher}&from=${appliedFrom}&to=${appliedTo}`);
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [appliedFrom, appliedTo, activePublisher]);

  const handleApplyDates = () => {
    if (!pendingFrom || !pendingTo) {
      setValidationError('Please select both start and end dates.');
      return;
    }
    if (new Date(pendingFrom) > new Date(pendingTo)) {
      setValidationError('Start date cannot be after end date.');
      return;
    }

    setValidationError(null);
    setAppliedFrom(pendingFrom);
    setAppliedTo(pendingTo);
    setIsModalOpen(false);
  };

  const openModal = () => {
    setPendingFrom(appliedFrom);
    setPendingTo(appliedTo);
    setValidationError(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Fetching your latest stats...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="loading-container">
        <AlertCircle size={48} color="var(--error)" />
        <h2 style={{ marginTop: '1rem' }}>Oops! Something went wrong</h2>
        <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>{error || 'Could not load data'}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: 'var(--accent)',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div >
    );
  }

  const { result } = stats.data;

  // Calculate enhanced metrics for each row
  const enhancedResult = result.map(item => {
    const publisherCost = item.cost ?? item.revenue ?? item.value ?? null;
    const topsRevenue = item.topsRevenue ?? null;
    const blastRevenue = item.blastRevenue ?? null;

    let netRevenue: number | null = null;
    if (topsRevenue !== null || blastRevenue !== null) {
      netRevenue = (topsRevenue || 0) + (blastRevenue || 0);
    }

    let profit: number | null = null;
    if (netRevenue !== null && publisherCost !== null) {
      profit = netRevenue - publisherCost;
    }

    let roi: number | null = null;
    if (profit !== null && publisherCost !== null) {
      roi = publisherCost === 0 ? 0 : (profit / publisherCost) * 100;
    }

    return {
      ...item,
      publisherCost,
      topsRevenue,
      blastRevenue,
      netRevenue,
      profit,
      roi
    };
  });

  // Calculate enhanced totals
  const totalPubCost = enhancedResult.some(i => i.publisherCost !== null)
    ? enhancedResult.reduce((sum, item) => sum + (item.publisherCost || 0), 0) : null;
  const totalTopsRev = enhancedResult.some(i => i.topsRevenue !== null)
    ? enhancedResult.reduce((sum, item) => sum + (item.topsRevenue || 0), 0) : null;
  const totalBlastRev = enhancedResult.some(i => i.blastRevenue !== null)
    ? enhancedResult.reduce((sum, item) => sum + (item.blastRevenue || 0), 0) : null;

  let totalNetRev: number | null = null;
  if (totalTopsRev !== null || totalBlastRev !== null) {
    totalNetRev = (totalTopsRev || 0) + (totalBlastRev || 0);
  }

  let totalProfit: number | null = null;
  if (totalNetRev !== null && totalPubCost !== null) {
    totalProfit = totalNetRev - totalPubCost;
  }

  let totalRoi: number | null = null;
  if (totalProfit !== null && totalPubCost !== null) {
    totalRoi = totalPubCost === 0 ? 0 : (totalProfit / totalPubCost) * 100;
  }

  // Format helpers
  const formatCurrency = (val: number | null | undefined, precision = 2) => {
    if (val === null || val === undefined) return 'N/A';
    return `$${val.toFixed(precision)}`;
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/A';
    return `${val.toFixed(0)}%`;
  };

  // For the table, we want newest on top
  const tableResult = [...enhancedResult].sort((a, b) => b.ddate.localeCompare(a.ddate));

  // Chart Data (use 0 for nulls in the chart so it draws a continuous line instead of breaking)
  const chartLabels = enhancedResult.map(item => item.ddate);
  const costData = enhancedResult.map(item => item.publisherCost || 0);
  const netRevenueData = enhancedResult.map(item => item.netRevenue || 0);

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Pub Cost (B) ($)',
        data: costData,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Net Revenue (E) ($)',
        data: netRevenueData,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        fill: true,
        tension: 0.4,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#94a3b8', font: { family: 'Inter' } }
      },
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' }
      }
    },
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'row' }}>
      {/* Sidebar for tabs */}
      <div style={{
        width: '240px',
        borderRight: '1px solid var(--card-border)',
        background: 'rgba(255, 255, 255, 0.02)',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Publishers
        </h3>
        {PUBLISHERS_TABS.map((pub) => (
          <button
            key={pub}
            onClick={() => setActivePublisher(pub)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              background: activePublisher === pub ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              border: '1px solid',
              borderColor: activePublisher === pub ? 'var(--accent)' : 'transparent',
              color: activePublisher === pub ? 'white' : 'var(--text-dim)',
              textAlign: 'left',
              cursor: 'pointer',
              fontWeight: activePublisher === pub ? 600 : 500,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            {pub}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="dashboard-container" style={{ flex: 1 }}>
        <header className="header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h1>{activePublisher} Dashboard</h1>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '4px' }}>
              <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              Performance Tracking • {stats.role}
            </p>
          </div>

          <button
            onClick={openModal}
            className="date-filter-trigger"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.6rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
            }}
          >
            <Calendar size={18} color="var(--accent)" />
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              {appliedFrom} — {appliedTo}
            </span>
          </button>
        </header>

        {/* Date Selection Modal */}
        {isModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}>
            <div style={{
              background: '#1e1e2d',
              width: '100%',
              maxWidth: '400px',
              borderRadius: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                padding: '1.25rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Select Custom Dates</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={pendingFrom}
                    onChange={(e) => setPendingFrom(e.target.value)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      color: 'white',
                      fontSize: '1rem',
                      outline: 'none',
                      width: '100%'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={pendingTo}
                    onChange={(e) => setPendingTo(e.target.value)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      color: 'white',
                      fontSize: '1rem',
                      outline: 'none',
                      width: '100%'
                    }}
                  />
                </div>

                {validationError && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '0.5rem',
                    color: '#ef4444',
                    fontSize: '0.85rem'
                  }}>
                    <AlertCircle size={16} />
                    {validationError}
                  </div>
                )}
              </div>

              <div style={{
                padding: '1.25rem',
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'flex',
                gap: '1rem'
              }}>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'transparent',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyDates}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                  }}
                >
                  Apply Dates
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="summary-grid">
          <div className="stat-card">
            <div className="stat-label">
              <DollarSign size={18} color="var(--accent)" />
              Total Cost (B)
            </div>
            <div className="stat-value">{formatCurrency(totalPubCost)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <Wallet size={18} color="var(--accent-secondary)" />
              Net Revenue (E)
            </div>
            <div className="stat-value">{formatCurrency(totalNetRev)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              {totalProfit !== null && totalProfit >= 0 ? <ArrowUpRight size={18} color="var(--success)" /> : <ArrowDownRight size={18} color={totalProfit === null ? 'var(--text-dim)' : 'var(--error)'} />}
              Total Profit (F)
            </div>
            <div className="stat-value" style={{ color: totalProfit === null ? 'var(--text-dim)' : (totalProfit >= 0 ? 'var(--success)' : 'var(--error)') }}>
              {formatCurrency(totalProfit)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <TrendingUp size={18} color="var(--accent)" />
              Overall ROI (G)
            </div>
            <div className="stat-value" style={{ color: totalRoi === null ? 'var(--text-dim)' : (totalRoi >= 0 ? 'var(--success)' : 'var(--error)') }}>
              {formatPercent(totalRoi)}
            </div>
          </div>
        </div>

        <div className="table-section">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
            Daily Performance Breakdown ({appliedFrom} — {appliedTo})
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Date (A)</th>
                  <th>Pub Cost (B)</th>
                  <th>Tops Rev (C)</th>
                  <th>Blast Rev (D)</th>
                  <th>Net Rev (E)</th>
                  <th>Profit (F)</th>
                  <th>ROI (G)</th>
                </tr>
              </thead>
              <tbody>
                {tableResult.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'left' }}>{item.ddate}</td>
                    <td style={{ fontWeight: 500, color: item.publisherCost === null ? 'var(--text-dim)' : 'inherit' }}>
                      {item.publisherCost === null ? 'N/A' : formatCurrency(item.publisherCost, 4)}
                    </td>
                    <td style={{ color: item.topsRevenue !== null && item.topsRevenue > 0 ? 'inherit' : 'var(--text-dim)' }}>
                      {formatCurrency(item.topsRevenue)}
                    </td>
                    <td style={{ color: item.blastRevenue !== null && item.blastRevenue > 0 ? 'inherit' : 'var(--text-dim)' }}>
                      {formatCurrency(item.blastRevenue)}
                    </td>
                    <td style={{ color: item.netRevenue === null ? 'var(--text-dim)' : 'inherit' }}>
                      {formatCurrency(item.netRevenue)}
                    </td>
                    <td style={{ fontWeight: 600, color: item.profit === null ? 'var(--text-dim)' : (item.profit >= 0 ? 'var(--success)' : 'var(--error)') }}>
                      {formatCurrency(item.profit)}
                    </td>
                    <td style={{ fontWeight: 600, color: item.roi === null ? 'var(--text-dim)' : (item.roi >= 0 ? 'var(--success)' : 'var(--error)') }}>
                      {formatPercent(item.roi)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--card-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <td style={{ textAlign: 'left', fontWeight: 'bold' }}>TOTAL</td>
                  <td style={{ fontWeight: 'bold', color: totalPubCost === null ? 'var(--text-dim)' : 'inherit' }}>
                    {formatCurrency(totalPubCost)}
                  </td>
                  <td style={{ fontWeight: 'bold', color: totalTopsRev === null ? 'var(--text-dim)' : 'inherit' }}>
                    {formatCurrency(totalTopsRev)}
                  </td>
                  <td style={{ fontWeight: 'bold', color: totalBlastRev === null ? 'var(--text-dim)' : 'inherit' }}>
                    {formatCurrency(totalBlastRev)}
                  </td>
                  <td style={{ fontWeight: 'bold', color: totalNetRev === null ? 'var(--text-dim)' : 'inherit' }}>
                    {formatCurrency(totalNetRev)}
                  </td>
                  <td style={{ fontWeight: 'bold', color: totalProfit === null ? 'var(--text-dim)' : (totalProfit >= 0 ? 'var(--success)' : 'var(--error)') }}>
                    {formatCurrency(totalProfit)}
                  </td>
                  <td style={{ fontWeight: 'bold', color: totalRoi === null ? 'var(--text-dim)' : (totalRoi >= 0 ? 'var(--success)' : 'var(--error)') }}>
                    {formatPercent(totalRoi)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="chart-section">
          <div className="chart-header">
            <h2 style={{ fontSize: '1.25rem' }}>Profit vs Cost Trends</h2>
          </div>
          <div className="chart-container">
            <Line options={chartOptions as any} data={lineChartData} />
          </div>
        </div>
        {/* Close Main Content */}
      </div>
      {/* Close Layout Flex Container */}
    </div>
  );
}
