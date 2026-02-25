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
  Settings2
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
  ctr: number;
  cpm: number;
}

interface StatsData {
  data: {
    result: StatItem[];
    resultTotal?: StatItem;
  };
  role: 'Advertiser' | 'Publisher';
}

const DEMO_DATA: Record<string, { b: number; c: number; d: number }> = {
  '2026-02-11': { b: 316.6324, c: 188.1444969, d: 343.0874691 },
  '2026-02-12': { b: 409.0804, c: 211.326337, d: 390.7748033 },
  '2026-02-13': { b: 391.338, c: 205.2474423, d: 412.2200933 },
  '2026-02-14': { b: 351.2901, c: 228.8147848, d: 368.3482055 },
};

export default function Dashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/stats');
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
  }, []);

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
    const isDemoAvailable = isDemoMode && DEMO_DATA[item.ddate];

    const publisherCost = isDemoAvailable ? DEMO_DATA[item.ddate].b : (item.cost || item.revenue || item.value || 0);
    const topsRevenue = isDemoAvailable ? DEMO_DATA[item.ddate].c : 0;
    const blastRevenue = isDemoAvailable ? DEMO_DATA[item.ddate].d : 0;

    const netRevenue = topsRevenue + blastRevenue; // E
    const profit = netRevenue - publisherCost; // F
    const roi = publisherCost === 0 ? 0 : (profit / publisherCost); // G

    return {
      ...item,
      publisherCost,
      topsRevenue,
      blastRevenue,
      netRevenue,
      profit,
      roi: roi * 100 // Convert to percentage
    };
  });

  // Calculate enhanced totals
  const totalPubCost = enhancedResult.reduce((sum, item) => sum + item.publisherCost, 0);
  const totalTopsRev = enhancedResult.reduce((sum, item) => sum + item.topsRevenue, 0);
  const totalBlastRev = enhancedResult.reduce((sum, item) => sum + item.blastRevenue, 0);
  const totalNetRev = totalTopsRev + totalBlastRev;
  const totalProfit = totalNetRev - totalPubCost;
  const totalRoi = totalPubCost === 0 ? 0 : (totalProfit / totalPubCost) * 100;

  // Chart Data
  const chartLabels = [...enhancedResult].reverse().map(item => item.ddate);
  const costData = [...enhancedResult].reverse().map(item => item.publisherCost);
  const profitData = [...enhancedResult].reverse().map(item => item.profit);

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Publisher Cost ($)',
        data: costData,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Profit ($)',
        data: profitData,
        borderColor: '#10b981',
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
    <div className="dashboard-container">
      <header className="header" style={{ marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1>Link Publisher Dashboard</h1>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(255,255,255,0.05)',
              padding: '0.4rem 0.8rem',
              borderRadius: '2rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              border: '1px solid var(--border)'
            }}>
              <input
                type="checkbox"
                checked={isDemoMode}
                onChange={() => setIsDemoMode(!isDemoMode)}
              />
              <Settings2 size={14} />
              Demo Data
            </label>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '4px' }}>
            <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            Performance Tracking • {stats.role} Account
          </p>
        </div>
        <LayoutDashboard size={32} color="var(--accent)" />
      </header>

      <div className="summary-grid">
        <div className="stat-card">
          <div className="stat-label">
            <DollarSign size={18} color="var(--accent)" />
            Total Cost (B)
          </div>
          <div className="stat-value">${totalPubCost.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <Wallet size={18} color="var(--accent-secondary)" />
            Net Revenue (E)
          </div>
          <div className="stat-value">{isDemoMode ? 'N/A' : `$${totalNetRev.toFixed(2)}`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            {totalProfit >= 0 ? <ArrowUpRight size={18} color="var(--success)" /> : <ArrowDownRight size={18} color="var(--error)" />}
            Total Profit (F)
          </div>
          <div className="stat-value" style={{ color: totalProfit >= 0 ? 'var(--success)' : 'var(--error)' }}>
            {isDemoMode ? 'N/A' : `$${totalProfit.toFixed(2)}`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <TrendingUp size={18} color="var(--accent)" />
            Overall ROI (G)
          </div>
          <div className="stat-value" style={{ color: totalRoi >= 0 ? 'var(--success)' : 'var(--error)' }}>
            {isDemoMode ? 'N/A' : `${totalRoi.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className="table-section">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Daily Performance Breakdown</h2>
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
              {enhancedResult.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'left' }}>{item.ddate}</td>
                  <td style={{ fontWeight: 500 }}>${item.publisherCost.toFixed(4)}</td>
                  <td style={{ color: item.topsRevenue > 0 ? 'inherit' : 'var(--text-dim)' }}>
                    ${item.topsRevenue.toFixed(2)}
                  </td>
                  <td style={{ color: item.blastRevenue > 0 ? 'inherit' : 'var(--text-dim)' }}>
                    ${item.blastRevenue.toFixed(2)}
                  </td>
                  <td>${item.netRevenue.toFixed(2)}</td>
                  <td style={{ fontWeight: 600, color: item.profit >= 0 ? 'var(--success)' : 'var(--error)' }}>
                    {isDemoMode && item.netRevenue === 0 ? 'N/A' : `$${item.profit.toFixed(2)}`}
                  </td>
                  <td style={{ fontWeight: 600, color: item.roi >= 0 ? 'var(--success)' : 'var(--error)' }}>
                    {isDemoMode && item.netRevenue === 0 ? 'N/A' : `${item.roi.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ textAlign: 'left', fontWeight: 'bold' }}>TOTAL</td>
                <td style={{ fontWeight: 'bold' }}>${totalPubCost.toFixed(2)}</td>
                <td style={{ fontWeight: 'bold' }}>${isDemoMode ? 'N/A' : `$${totalTopsRev.toFixed(2)}`}</td>
                <td style={{ fontWeight: 'bold' }}>${isDemoMode ? 'N/A' : `$${totalBlastRev.toFixed(2)}`}</td>
                <td style={{ fontWeight: 'bold' }}>{isDemoMode ? 'N/A' : `$${totalNetRev.toFixed(2)}`}</td>
                <td style={{ fontWeight: 'bold', color: totalProfit >= 0 ? 'var(--success)' : 'var(--error)' }}>
                  {isDemoMode ? 'N/A' : `$${totalProfit.toFixed(2)}`}
                </td>
                <td style={{ fontWeight: 'bold', color: totalRoi >= 0 ? 'var(--success)' : 'var(--error)' }}>
                  {isDemoMode ? 'N/A' : `${totalRoi.toFixed(0)}%`}
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
    </div>
  );
}
