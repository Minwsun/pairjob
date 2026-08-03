import Link from "next/link";

export default function Home() {
  return <div className="landing">
    <nav className="topbar">
      <Link className="brand" href="/"><span className="brand-mark">P</span> PairJob</Link>
      <div className="nav-actions">
        <Link className="btn btn-ghost" href="#how">Cách hoạt động</Link>
        <Link className="btn btn-light" href="/candidate">Ứng viên</Link>
        <Link className="btn btn-primary" href="/employer">Nhà tuyển dụng</Link>
      </div>
    </nav>
    <section className="hero">
      <div>
        <div className="eyebrow">Matching dựa trên bằng chứng</div>
        <h1>Đúng người.<br/><span>Đúng việc.</span><br/>Đúng lý do.</h1>
        <p>PairJob biến JD và CV lộn xộn thành dữ liệu chuẩn hóa, matching có thể giải thích và lộ trình phát triển cá nhân hóa.</p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/employer">Tìm ứng viên phù hợp →</Link>
          <Link className="btn btn-light" href="/candidate">Tìm việc cho tôi</Link>
        </div>
      </div>
      <div className="hero-card">
        <div className="card-title"><h2>Pipeline dữ liệu thật</h2><span className="badge green">PostgreSQL</span></div>
        {["JD/CV gốc được bảo toàn", "Parser tạo text và sections", "LLM trích xuất kèm evidence", "Code chuẩn hóa và tính matching", "Dashboard truy vấn kết quả từ DB"].map((item,index)=><div className="extract-row" key={item}><b>{String(index+1).padStart(2,"0")}</b> · {item}</div>)}
        <div className="evidence"><b>Không có dữ liệu dựng sẵn</b><br/>Kết quả chỉ xuất hiện sau khi người dùng nhập dữ liệu hoặc chạy AI seed.</div>
      </div>
    </section>
    <section className="trust-row" id="how">
      <div className="trust-item"><strong>01 · Trích xuất</strong><span>Đọc JD, PDF, DOCX, HTML, Markdown và portfolio.</span></div>
      <div className="trust-item"><strong>02 · Chuẩn hóa</strong><span>Đưa dữ liệu về taxonomy nghề nghiệp có kiểm soát.</span></div>
      <div className="trust-item"><strong>03 · Matching</strong><span>Tính điểm bằng code, tách confidence và eligibility.</span></div>
      <div className="trust-item"><strong>04 · Phát triển</strong><span>Đề xuất skill gap theo tác động lên cơ hội thực tế.</span></div>
    </section>
  </div>;
}
