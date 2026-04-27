"use client";
import { useEffect, useState } from "react";
import { Line, Bar } from "react-chartjs-2";
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
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface AnalyticsData {
  overview: {
    totalUsers: number;
    activeUsers24h: number;
    activeUsers7d: number;
    avgSessionDuration: number;
    avgBillsPerSession: number;
  };
  topBills: Array<{ billId: string; views: number; avgTimeSpent: number }>;
  pageViewsByDay: Array<{ date: string; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/dashboard")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-civic-blue rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <p className="text-red-500">Failed to load analytics</p>
      </div>
    );
  }

  const pageViewsChart = {
    labels: data.pageViewsByDay.map((d) => d.date),
    datasets: [
      {
        label: "Page Views",
        data: data.pageViewsByDay.map((d) => d.count),
        borderColor: "rgb(75, 192, 192)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
      },
    ],
  };

  const topTopicsChart = {
    labels: data.topTopics.map((t) => t.topic),
    datasets: [
      {
        label: "Interest Count",
        data: data.topTopics.map((t) => t.count),
        backgroundColor: "rgba(54, 162, 235, 0.5)",
      },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="font-display text-4xl font-bold text-navy mb-8">
        Analytics Dashboard
      </h1>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-12">
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Total Users</p>
          <p className="text-3xl font-bold text-navy">{data.overview.totalUsers}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Active (24h)</p>
          <p className="text-3xl font-bold text-civic-blue">
            {data.overview.activeUsers24h}
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Active (7d)</p>
          <p className="text-3xl font-bold text-civic-blue">
            {data.overview.activeUsers7d}
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Avg Session</p>
          <p className="text-3xl font-bold text-navy">
            {Math.floor(data.overview.avgSessionDuration / 60)}m
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Bills/Session</p>
          <p className="text-3xl font-bold text-navy">
            {data.overview.avgBillsPerSession}
          </p>
        </div>
      </div>

      {/* Page Views Over Time */}
      <div className="card p-8 mb-8">
        <h2 className="font-bold text-navy text-xl mb-4">Page Views (Last 30 Days)</h2>
        <Line data={pageViewsChart} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Bills */}
        <div className="card p-8">
          <h2 className="font-bold text-navy text-xl mb-4">Most Viewed Bills</h2>
          <div className="space-y-3">
            {data.topBills.map((bill, i) => (
              <div key={bill.billId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-civic-blue text-white text-xs flex items-center justify-center">
                    {i + 1}
                  </span>
                  <a
                    href={`/bill/${bill.billId}`}
                    className="text-sm font-medium text-navy hover:text-civic-blue"
                  >
                    {bill.billId}
                  </a>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-navy">{bill.views} views</p>
                  <p className="text-xs text-gray-500">{bill.avgTimeSpent}s avg</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Topics */}
        <div className="card p-8">
          <h2 className="font-bold text-navy text-xl mb-4">Popular Topics</h2>
          <Bar data={topTopicsChart} />
        </div>
      </div>
    </div>
  );
}
