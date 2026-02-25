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
  AlertCircle
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

export default function Dashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const { result, resultTotal } = stats.data;
  const isAdvertiser = stats.role === 'Advertiser';
  const valKey = isAdvertiser ? 'cost' : 'revenue';

  // Defensive values for totals
  const totalImpressions = resultTotal?.impressions || 0;
  const totalClicks = resultTotal?.clicks || 0;
  const totalCtr = resultTotal?.ctr || 0;
  const totalValue = resultTotal?.revenue || resultTotal?.cost || resultTotal?.value || 0;

  // Chart Data
  const chartLabels = [...result].reverse().map(item => item.ddate);
  const impressionsData = [...result].reverse().map(item => item.impressions);
  const valueData = [...result].reverse().map(item => item.revenue || item.cost || item.value || 0);

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Impressions',
        data: impressionsData,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y',
      },
      {
        label: isAdvertiser ? 'Cost ($)' : 'Revenue ($)',
        data: valueData,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y1',
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
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
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
      <header className="header">
        <div>
          <h1>ExoClick Dashboard</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
            <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
            Last 14 Days • {stats.role} Account
          </p>
        </div>
        <LayoutDashboard size={32} color="var(--accent)" />
      </header>

      <div className="summary-grid">
        <div className="stat-card">
          <div className="stat-label">
            <Eye size={18} color="var(--accent)" />
            Total Impressions
          </div>
          <div className="stat-value">{totalImpressions.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <MousePointer2 size={18} color="var(--accent-secondary)" />
            Total Clicks
          </div>
          <div className="stat-value">{totalClicks.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <TrendingUp size={18} color="var(--success)" />
            Avg. CTR
          </div>
          <div className="stat-value">{totalCtr.toFixed(3)}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <DollarSign size={18} color="var(--accent)" />
            Total {isAdvertiser ? 'Cost' : 'Revenue'}
          </div>
          <div className="stat-value">${totalValue.toFixed(2)}</div>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-header">
          <h2 style={{ fontSize: '1.25rem' }}>Performance Trends</h2>
        </div>
        <div className="chart-container">
          <Line options={chartOptions as any} data={lineChartData} />
        </div>
      </div>

      <div className="table-section">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Daily Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>{isAdvertiser ? 'Cost' : 'Revenue'}</th>
            </tr>
          </thead>
          <tbody>
            {result.map((item, idx) => (
              <tr key={idx}>
                <td>{item.ddate}</td>
                <td>{item.impressions.toLocaleString()}</td>
                <td>{item.clicks.toLocaleString()}</td>
                <td>{item.ctr.toFixed(3)}%</td>
                <td style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                  ${(item.revenue || item.cost || item.value || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
