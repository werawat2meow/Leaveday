"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ["#08f7fe", "#ff4d6d", "#7cffcb", "#fce94f", "#a78bfa"];

// สีเฉพาะสำหรับสถานะ
const getStatusColor = (status: string) => {
  switch (status) {
    case 'รออนุมัติ': return '#fbbf24';   // ส้ม (orange-500)
    case 'อนุมัติ': return '#22c55e';      // เขียว (green-500) 
    case 'ไม่อนุมัติ': return '#ef4444';  // แดง (red-500)
    default: return '#8b5cf6';            // ม่วง (default)
  }
};


// Type
type DashboardData = {
  monthlyLeaves: { m: string; avgDays: number }[];
  leaveTypes: { type: string; count: number }[];
  statusDist: { name: string; value: number }[];
  // attendanceRadar: { k: string; a: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from API
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/dashboard');
        const result = await response.json();

        if (result.ok) {
          setData(result.data);
        } else {
          setError('ไม่สามารถโหลดข้อมูลได้');
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-slate-600 dark:text-slate-400">กำลังโหลดข้อมูล..</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️ {error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    )
  }

  // No data\
  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500">ไม่มีข้อมูลแสดง</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Row - 2 Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="neon-card rounded-2xl p-4">
          <h2 className="neon-title mb-2 text-lg font-semibold">แนวโน้มวันลาเฉลี่ยรายเดือน</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={data.monthlyLeaves} margin={{ left:4, right:8, top:8, bottom:0 }}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="m" stroke="#a3adc2" />
                <YAxis stroke="#a3adc2" />
                <Tooltip />
                <Line type="monotone" dataKey="avgDays" stroke="#08f7fe" strokeWidth={3} dot={{ r:3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Leave Types */}
        <section className="neon-card rounded-2xl p-4">
          <h2 className="neon-title mb-2 text-lg font-semibold">จำนวนคำขอตามประเภทลา</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.leaveTypes} margin={{ left:4, right:8, top:8, bottom:0 }}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="type" stroke="#a3adc2" />
                <YAxis stroke="#a3adc2" />
                <Tooltip />
                <Bar dataKey="count">
                  {data.leaveTypes.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Bottom Row - Status Pie Chart (Full Width) */}
      <div className="grid gap-6">
        <section className="neon-card rounded-2xl p-4">
          <h2 className="neon-title mb-2 text-lg font-semibold">สัดส่วนสถานะคำขอ</h2>
          <div className="h-80">
            <ResponsiveContainer>
              <PieChart>
                <Pie 
                  data={data.statusDist} 
                  dataKey="value" 
                  nameKey="name" 
                  innerRadius={60} 
                  outerRadius={120}
                  cx="50%"
                  cy="50%"
                >
                  {data.statusDist.map((entry, i) => (
                    <Cell key={i} fill={getStatusColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}