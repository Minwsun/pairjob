import { AppShell } from "@/components/app-shell";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams; const activeRole = role === "employer" ? "employer" : "candidate";
  return <AppShell role={activeRole}><div className="page-head"><div><h1>Cài đặt</h1><p>Cấu hình hiển thị và trải nghiệm cho workspace hiện tại.</p></div></div><div className="grid layout-2-1"><div className="card"><h2>Tùy chọn hệ thống</h2><div className="requirement-row"><div><b>Ngôn ngữ</b><small>Tiếng Việt</small></div><span className="badge green">Đang dùng</span></div><div className="requirement-row"><div><b>Tiền tệ</b><small>Việt Nam Đồng</small></div><span className="badge green">VND</span></div><div className="requirement-row"><div><b>AI matching</b><small>Deterministic trước, AI review chạy sau</small></div><span className="badge blue">Bật</span></div></div><aside className="card"><h3>Vai trò hiện tại</h3><p>{activeRole === "employer" ? "Nhà tuyển dụng" : "Ứng viên"}</p></aside></div></AppShell>;
}
