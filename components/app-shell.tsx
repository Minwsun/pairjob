"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/types";

const employerLinks = [
  ["⌂", "Tổng quan", "/employer"],
  ["◇", "Tin tuyển dụng", "/employer/jobs"],
  ["✓", "Đơn ứng tuyển", "/employer/applications"],
] as const;

const candidateLinks = [
  ["⌂", "Tổng quan", "/candidate"],
  ["◫", "Hồ sơ của tôi", "/candidate/profile"],
  ["◇", "Việc phù hợp", "/candidate/jobs"],
  ["✓", "Đơn ứng tuyển", "/candidate/applications"],
  ["↗", "Lộ trình phát triển", "/candidate/roadmap"],
] as const;

export function AppShell({ role, children }: { role: Role; active?: string; children: React.ReactNode }) {
  const employer = role === "employer"; const links = employer ? employerLinks : candidateLinks; const pathname = usePathname(); const router = useRouter();
  const [query, setQuery] = useState(""); const [help, setHelp] = useState(false);
  function search(event: FormEvent) { event.preventDefault(); const value = query.trim(); if (!value) return; router.push(`${employer ? "/employer/jobs" : "/candidate/jobs"}?q=${encodeURIComponent(value)}`); }
  return <div className="shell">
    <aside className="sidebar">
      <Link className="brand" href="/" prefetch={false}><span className="brand-mark">P</span> PairJob</Link>
      <div className="side-caption">Không gian làm việc</div>
      {links.map(([icon, label, href]) => { const active = pathname === href || (href !== `/${role}` && pathname.startsWith(`${href}/`)); return <Link className={`side-link ${active ? "active" : ""}`} href={href} prefetch={false} key={href}><span className="side-icon">{icon}</span>{label}</Link>; })}
      <div className="side-caption">Hệ thống</div>
      <Link className={`side-link ${pathname === "/settings" ? "active" : ""}`} href={`/settings?role=${role}`} prefetch={false}><span className="side-icon">⚙</span>Cài đặt</Link>
      <div className="side-profile"><div className="avatar">{employer ? "NT" : "UV"}</div><div><b>{employer ? "Tài khoản tuyển dụng" : "Hồ sơ ứng viên"}</b><small>{employer ? "Nhà tuyển dụng" : "Ứng viên"}</small></div></div>
    </aside>
    <main className="main">
      <header className="appbar"><form onSubmit={search} style={{ flex: 1 }}><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={employer ? "Tìm job, kỹ năng, ứng viên..." : "Tìm việc, kỹ năng..."} aria-label="Tìm kiếm" /></form><div className="nav-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelp(true)}>Trợ giúp</button><span className="badge green">● AI sẵn sàng</span></div></header>
      <div className="content">{children}</div>
    </main>
    {help && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="modal"><div className="card-title"><h2 id="help-title">Trợ giúp PairJob</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelp(false)}>Đóng</button></div><p>{employer ? "Tạo JD, làm rõ yêu cầu và mở từng tin tuyển dụng để xem ứng viên phù hợp." : "Cập nhật CV, xem việc phù hợp, ứng tuyển và theo dõi lộ trình phát triển."}</p><div className="ai-note">Mọi tác vụ AI dài sẽ hiển thị loading và trạng thái xử lý. Nếu lỗi, thông báo sẽ giữ nguyên để bạn thử lại.</div></div></div>}
  </div>;
}
