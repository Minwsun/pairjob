export function Progress({ value, color = "var(--green)" }: { value: number; color?: string }) {
  return <div className="bar"><span style={{ width: `${value}%`, background: color }} /></div>;
}

export function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: string }) {
  return <div className="card stat"><small>{label}</small><strong>{value}</strong><span className="delta">{detail}</span><span className="stat-icon">{icon}</span></div>;
}

export function Stepper({ current }: { current: number }) {
  return <div className="steps">
    {["Nội dung", "AI trích xuất", "Xác nhận", "Hoàn tất"].map((label, index) => (
      <div className={`step ${index + 1 < current ? "done" : index + 1 === current ? "current" : ""}`} data-step={index + 1} key={label}>{label}</div>
    ))}
  </div>;
}
