# 🚀 PairJob — Next-Gen AI-Powered Job Matching & Career Progression Platform

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript_5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-384--dim-green?style=for-the-badge&logo=vectorlogozone&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/Prisma_ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Vercel_Deployment-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/License-ISC-blue.style=for-the-badge" alt="License" />
</p>

---

## 🌐 Trải Nghiệm Trực Tiếp & Thông Tin Bàn Giao

* 🚀 **Production Deployment**: [https://pairjob.vercel.app](https://pairjob.vercel.app)
* 📦 **Báo Cáo Bàn Giao & Release**: [GitHub Releases](https://github.com/Minwsun/pairjob/releases/latest)
* 👤 **Tác giả**: Nguyễn Nhật Minh
* 📧 **Email**: [ngynhaatminh@gmail.com](mailto:ngynhaatminh@gmail.com)
* 📱 **Điện thoại**: 0373973754
* 🏛️ **Đơn vị phát triển**: PairJob Engineering Team

---

## 🌟 Mục Lục

1. [Tổng Quan & Bài Toán Thực Tế](#-tổng-quan--bài-toán-thực-tế)
2. [Đột Phá Kỹ Thuật & Giá Trị Khác Biệt](#-đột-phá-kỹ-thuật--giá-trị-khác-biệt)
3. [Kiến Trúc Hệ Thống Toàn Diện](#-kiến-trúc-hệ-thống-toàn-diện)
4. [Các Pipeline Xử Lý Cốt Lõi](#-các-pipeline-xử-lý-cốt-lõi)
5. [Thuật Toán Matching, RAG & Career Roadmap](#-thuật-toán-matching-rag--career-roadmap)
6. [Công Nghệ & Model Routing](#-công-nghệ--model-routing)
7. [Mô Hình Dữ Liệu Thực Thể (Database Schema)](#-mô-hình-dữ-liệu-thực-thể-database-schema)
8. [Hướng Dẫn Sử Dụng Chi Tiết (User Journeys)](#-hướng-dẫn-sử-dụng-chi-tiết-user-journeys)
9. [Danh Mục RESTful API Routes](#-danh-mục-restful-api-routes)
10. [Hướng Dẫn Cài Đặt & Chạy Môi Trường Local](#-hướng-dẫn-cài-đặt--chạy-môi-trường-local)
11. [Triển Khai Production & Bảo Mật](#-triển-khai-production--bảo-mật)
12. [Định Hướng Mở Rộng & Giới Hạn](#-định-hướng-mở-rộng--giới-hạn)
13. [License & Third-Party Notices](#-license--third-party-notices)

---

## 🎯 Tổng Quan & Bài Toán Thực Tế

Trong thị trường tuyển dụng việc làm công nghệ và tự do (freelance), các nền tảng truyền thống gặp phải những giới hạn cốt lõi:

| Vấn đề Tuyển dụng Truyền thống | Giải pháp Đột phá của PairJob |
|---|---|
| **JD mơ hồ, thiếu dữ liệu**: Viết tắt, không rõ ràng giữa kỹ năng bắt buộc (*Must-have*) và ưu tiên (*Nice-to-have*). | **Active Clarification Loop**: AI tự động phát hiện lỗ hổng thông tin và tương tác hỏi thêm để thu thập dữ liệu giá trị cao (*Information Gain*). |
| **CV phi cấu trúc đa định dạng**: Ứng viên nộp PDF scan, DOCX hoặc link Portfolio/LinkedIn với cách hành văn phân tán. | **Multi-Modal Document Parser**: Đọc PDF text layer, DOCX, URL portfolio với bộ lọc bảo mật SSRF và chuẩn hóa về Schema thống nhất. |
| **Black-box Keyword Matching**: Tìm kiếm từ khóa thuần túy bỏ sót các kỹ năng chuyển đổi (*Transferable Skills*) hoặc kỹ năng gần nghĩa. | **Ontology Taxonomy Graph + RRF v9**: Đồ thị tri thức chuẩn O\*NET/SFIA với 5 quan hệ ngữ nghĩa kết hợp vector 384 chiều. |
| **Không có tính giải thích (Black-box AI)**: Chấm điểm bằng LLM thiếu nhất quán, khó kiểm chứng, dễ bị ảo giác (*Hallucination*). | **Deterministic DAG Matching Engine**: Chấm điểm logic tất định, minh bạch từng tiêu chí, trích xuất bằng chứng xác thực (*Evidence*). |
| **Bỏ rơi ứng viên bị từ chối**: Ứng viên không biết vì sao trượt và cần bổ sung gì để đáp ứng thị trường. | **Counterfactual AI Career Roadmap**: Mô phỏng kịch bản bù đắp kỹ năng thiếu và lượng hóa chính xác mức tăng điểm số. |

---

## 💡 Đột Phá Kỹ Thuật & Giá Trị Khác Biệt

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                 PAIRJOB CORE INNOVATIONS                │
                     └─────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  ACTIVE DIALOG   │     │  TAXONOMY GRAPH  │     │ COUNTERFACTUAL   │
│  CLARIFICATION   │     │  & RRF RETRIEVAL │     │ CAREER ROADMAP   │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ AI chủ động hỏi  │     │ 5 cấp quan hệ:   │     │ Mô phỏng điểm số │
│ các trường thiếu │     │ Exact, Ancestor, │     │ khi bù đắp skill;│
│ có Information   │     │ Descendant,      │     │ lộ trình hành    │
│ Gain cao nhất    │     │ Transferable...  │     │ động thực tế     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

1. **Active Information Gain Clarification**: Hệ thống không đoán mò khi dữ liệu thiếu hụt; hệ thống tạo câu hỏi tương tác ngắn giúp người dùng bổ sung thông tin chính xác nhất.
2. **Domain-Specific Knowledge Graph (Taxonomy Engine)**: Phân tầng năng lực theo chuẩn SFIA & O\*NET, tự động ánh xạ Alias, sửa lỗi chính tả tiếng Việt/Anh và tính toán độ tương đồng giữa các nghề nghiệp.
3. **RRF Hybrid Retrieval v9 + Semantic MMR v10**: Kết hợp Reciprocal Rank Fusion giữa Dense Vector (pgvector) + Lexical Search + Graph Traversal, lọc trùng và tối ưu hóa độ đa dạng kết quả bằng Maximal Marginal Relevance.
4. **Deterministic & Explainable Matching**: Tách bạch hoàn toàn giữa suy luận ngôn ngữ (AI trích xuất) và thuật toán tính điểm (Mã nguồn tất định), đảm bảo tính công bằng và loại bỏ hoàn toàn sai số ảo giác.
5. **Auditable Pipeline & Real-time Streaming**: Mọi giai đoạn xử lý đều lưu vết `PipelineRun` và truyền tải trạng thái trực quan thời gian thực (real-time progress stages) đến giao diện người dùng.

---

## 🏗️ Kiến Trúc Hệ Thống Toàn Diện

Hệ thống được thiết kế theo nguyên lý **Clean Architecture** và **Decoupled AI Engine**, tách biệt giao diện, lớp nghiệp vụ, mô hình dữ liệu và AI Gateway:

```mermaid
flowchart TD
  subgraph Client_Layer["🖥️ Frontend & Client Layer (Next.js 16 App Router)"]
    UI_E["🏢 Employer Portal\n(JD Creation, Candidate Review)"]
    UI_C["👨‍💻 Candidate Portal\n(CV Upload, Jobs, Roadmap)"]
    PROGRESS["⚡ Real-time Progress & Audit Panel"]
  end

  subgraph API_Gateway["🛡️ Route Handlers & Business Logic"]
    API_DOC["/api/documents\n(Document Ingestion & SSRF Guard)"]
    API_EXT["/api/*/extract\n(Zod Schema Structured Extraction)"]
    API_CLAR["/api/*/clarifications\n(Information Gain Engine)"]
    API_MATCH["/api/matches & /api/recommendations\n(Matching & MMR Ranking)"]
    API_ROAD["/api/candidate/roadmap\n(Counterfactual Simulation)"]
  end

  subgraph Core_Engines["⚙️ Core Domain Engines"]
    PARSER["📄 Document Parser\n(pdf-parse / mammoth / cheerio)"]
    TAXONOMY["🕸️ Taxonomy Graph Resolver\n(SFIA/O*NET 5-Hop Ontology)"]
    RETRIEVAL["🔍 RRF Hybrid Retrieval v9\n(Vector 384d + Full-text + Graph)"]
    MATCHING["🎯 Typed DAG Matching Engine\n(Multi-Objective Weighted Scoring)"]
    ROADMAP["📈 Career Progression Simulator"]
  end

  subgraph Storage_AI["💾 Storage & AI Services"]
    DB[("🐘 PostgreSQL + pgvector\n(Neon Cloud Database)")]
    BLOB["📦 Vercel Blob Storage\n(Encrypted CV/JD Files)"]
    LLM_REASON["🧠 Reasoning LLM\n(cx/gpt-5.6-terra)"]
    LLM_FAST["⚡ Fast LLM\n(cx/gpt-5.4-mini)"]
  end

  UI_E --> API_EXT & API_CLAR & API_MATCH
  UI_C --> API_DOC & API_EXT & API_MATCH & API_ROAD
  PROGRESS <--> API_DOC & API_EXT

  API_DOC --> PARSER
  API_EXT --> LLM_REASON & TAXONOMY
  API_CLAR --> LLM_FAST
  API_MATCH --> RETRIEVAL --> MATCHING
  API_ROAD --> ROADMAP --> LLM_REASON

  PARSER --> BLOB
  TAXONOMY & RETRIEVAL & MATCHING & ROADMAP <--> DB
  RETRIEVAL <--> DB
```

Chi tiết tài liệu kiến trúc: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🔄 Các Pipeline Xử Lý Cốt Lõi

### 1. Job Description (JD) Lifecycle Pipeline

```mermaid
sequenceDiagram
  autonumber
  actor Employer as 🏢 Nhà Tuyển Dụng
  participant UI as 🖥️ Next.js Web UI
  participant API as 🛡️ Route Handler
  participant AI as 🧠 Reasoning LLM
  participant Tax as 🕸️ Taxonomy Graph
  participant DB as 🐘 PostgreSQL / pgvector

  Employer->>UI: Nhập JD thô (Tiêu đề, Mô tả tự nhiên)
  UI->>API: POST /api/jobs (Khởi tạo PipelineRun)
  API->>AI: Trích xuất có cấu trúc (Zod Schema Validation)
  AI-->>API: Trả về Occupations, Skills, Experience, Work Mode, Evidence
  API->>Tax: Resolve Alias, chuẩn hóa kỹ năng vào Taxonomy Ontology
  Tax-->>API: Danh sách Canonical Labels & Hierarchy Paths
  API->>DB: Lưu trữ Raw Data + Canonical Profile + Embeddings (384-d)
  
  alt Nếu phát hiện thiếu thông tin cốt lõi
    API-->>UI: Render Popup câu hỏi làm rõ (Active Clarification)
    Employer->>UI: Bổ sung câu trả lời
    UI->>API: POST /api/jobs/{id}/clarifications/answer
    API->>DB: Cập nhật Canonical Requirements
  end

  API-->>UI: Xác nhận publish JD thành công
```

### 2. Candidate CV Ingestion & Processing Pipeline

```mermaid
sequenceDiagram
  autonumber
  actor Candidate as 👨‍💻 Ứng Viên
  participant UI as 🖥️ Web UI
  participant Parser as 📄 Document Parser
  participant AI as 🧠 AI Harness
  participant Tax as 🕸️ Taxonomy Graph
  participant DB as 🐘 Database & Vector

  Candidate->>UI: Nộp CV (PDF text-layer / DOCX / URL Portfolio)
  UI->>Parser: Tải tài liệu & Quét bảo mật SSRF
  Parser-->>AI: Trích xuất Raw Text & phân tích các Sections
  AI->>Tax: Chuẩn hóa kỹ năng, chức danh, bằng cấp & chứng chỉ
  Tax-->>DB: Ghi nhận CandidateConceptAssertion & ProfileRevision
  DB-->>UI: Trả về hồ sơ chuẩn hóa + Điểm tự tin (Evidence Quality)
  
  alt CV thiếu kinh nghiệm / kỹ năng quan trọng
    UI->>Candidate: Đề xuất câu hỏi bổ sung ngắn
    Candidate->>UI: Xác nhận thông tin bổ sung
    UI->>DB: Tạo ProfileRevision mới & Trigger Recompute Task
  end
```

---

## 🔬 Thuật Toán Matching, RAG & Career Roadmap

### 1. Phân Tầng Quan Hệ Ngữ Nghĩa (Semantic Taxonomy Graph)

Đồ thị tri thức Taxonomy của PairJob đánh giá độ liên quan của kỹ năng và nghề nghiệp qua 5 mức độ trọng số:

$$\text{Credited Strength}(M) = \begin{cases} 
1.00 & \text{khi } M = \text{Exact Match} \\
\min(0.95, \text{strength}) & \text{khi } M = \text{Equivalent} \\
\min(0.92, \text{strength}) & \text{khi } M = \text{Descendant (Kỹ năng chuyên sâu hơn)} \\
\min(0.72, \max(0.50, \text{strength})) & \text{khi } M = \text{Transferable (Kỹ năng có thể chuyển đổi)} \\
\min(0.58, \max(0.40, \text{strength})) & \text{khi } M = \text{Ancestor (Kỹ năng cấp cao/bao quát)} \\
\min(0.42, \max(0.25, \text{strength})) & \text{cho các quan hệ liên đới khác}
\end{cases}$$

### 2. Thuật Toán Chấm Điểm Đa Mục Tiêu Tất Định (Deterministic Matching Engine)

Hệ thống tính điểm dựa trên **Dynamic Weighted Scoring** thích ứng theo từng loại công việc:

```
                  ┌──────────────────────────────────────────────┐
                  │          DYNAMIC MATCHING WEIGHTS            │
                  ├──────────────────────────────────────────────┤
                  │  • Kỹ năng bắt buộc (Required Skills): 38%   │
                  │  • Mức tương thích nghề nghiệp (Occupation): 20% │
                  │  • Trình độ & Bằng chứng (Proficiency): 10%  │
                  │  • Chất lượng minh chứng (Evidence Quality): 10% │
                  │  • Độ sâu lĩnh vực (Domain Alignment): 9%    │
                  │  • Số năm kinh nghiệm (Experience Years): 8% │
                  │  • Kỹ năng ưu tiên (Preferred Skills): 5%    │
                  └──────────────────────────────────────────────┘
```

* **Trạng thái phân loại rõ ràng**:
  * 🟢 **Phù hợp (Qualified)**: Điểm số cao, đáp ứng đầy đủ kỹ năng cốt lõi và định hướng nghề nghiệp.
  * 🟡 **Phù hợp nhưng còn thiếu (Partial Fit)**: Có nền tảng chuyển đổi tốt nhưng thiếu một số công nghệ cụ thể.
  * 🔴 **Chưa phù hợp (Not Qualified)**: Khác nhóm nghề hoặc vi phạm các điều kiện ràng buộc bắt buộc (Hard Blockers).

### 3. Thuật Toán Mô Phỏng Lộ Trình Nghề Nghiệp (Counterfactual Career Roadmap)

Hệ thống áp dụng phương pháp **Counterfactual Reasoning**:
1. Phân tích các tin tuyển dụng mục tiêu của thị trường.
2. Tìm ra tập hợp các khoảng cách kỹ năng (*Skill Gaps*, *Proficiency Gaps*, *Evidence Gaps*).
3. Tạo đối tượng ứng viên giả định đã nâng cấp từng kỹ năng (`upgradedCandidate`).
4. Chạy lại thuật toán Matching Engine để tính toán **Estimated Impact** ($\Delta \text{Score}$).
5. AI tổng hợp thành lộ trình hành động có cấu trúc với các mốc thời gian và dự án rèn luyện cụ thể.

---

## 💻 Công Nghệ & Model Routing

### Tech Stack Chi Tiết

| Phân Vùng | Công Nghệ / Thư Viện | Phiên Bản | Mục Đích Sử Dụng |
|---|---|---|---|
| **Framework** | Next.js (App Router) | `16.2.12` | Server-Side Rendering, Streaming Progress, Route Handlers |
| **UI Library** | React | `19.2.0` | Quản lý UI Components và State đồng bộ |
| **Language** | TypeScript | `5.7.0` | Strict Type-Safety trên toàn bộ codebase |
| **Database** | PostgreSQL + pgvector | `16.x` | Lưu trữ dữ liệu quan hệ, quan hệ đồ thị và Vector 384-dim |
| **ORM** | Prisma Client | `6.19.0` | Type-safe Database Access & Migration Management |
| **Cloud DB** | Neon Serverless Postgres | Cloud | Hệ thống cơ sở dữ liệu trên môi trường Production |
| **File Storage**| Vercel Blob | `2.6.1` | Lưu trữ tài liệu CV, Portfolio và File tuyển dụng an toàn |
| **Validation** | Zod | `4.4.3` | Kiểm thực Runtime Schema cho API Payload và LLM Output |
| **PDF Parsing** | `pdf-parse` / `pdf-lib` | `2.4.5` | Phân tích và trích xuất Text Layer từ tài liệu PDF |
| **Word Parsing**| `mammoth` / `docx` | `1.12.0` | Đọc và xử lý tài liệu Microsoft Word (.docx) |
| **HTML Parser** | `cheerio` | `1.2.0` | Làm sạch và cào dữ liệu từ Portfolio URL công khai |

### AI Model Routing Strategy

PairJob triển khai chiến lược **Dual-Tier Model Routing** giúp tối ưu hóa chi phí và tốc độ phản hồi:

* 🧠 **Reasoning Tier (`cx/gpt-5.6-terra`)**: Đảm nhiệm các tác vụ phức tạp đòi hỏi suy luận sâu như trích xuất JD/CV phi cấu trúc, suy luận quan hệ Taxonomy, giải thích điểm matching và xây dựng lộ trình sự nghiệp.
* ⚡ **Fast Tier (`cx/gpt-5.4-mini`)**: Đảm nhiệm các tác vụ thời gian thực như tạo câu hỏi làm rõ (Active Clarification), tóm tắt hồ sơ ngắn và phân loại nhãn.

---

## 🗄️ Mô Hình Dữ Liệu Thực Thể (Database Schema)

Dưới đây là các thực thể quan trọng nhất được định nghĩa trong [prisma/schema.prisma](prisma/schema.prisma):

```
┌─────────────────────────┐          ┌─────────────────────────┐
│          User           │1        1│    CandidateProfile     │
│  - email, role, name    ├──────────┤  - occupation, skills   │
└───────────┬─────────────┘          │  - embedding: vector    │
            │1                       │  - completeness         │
            │                        └────────────┬────────────┘
            │*                                    │1
┌───────────▼─────────────┐                       │*
│          Job            │1         *┌───────────▼────────────┐
│  - rawTitle, rawDesc    ├───────────┤       MatchResult       │
│  - requiredSkills       │           │  - score, confidence    │
│  - workMode, budget     │           │  - breakdown, reasons   │
└───────────┬─────────────┘           └─────────────────────────┘
            │1
            │*
┌───────────▼─────────────┐          ┌─────────────────────────┐
│     TaxonomyLabel       │1        *│      TaxonomyEdge       │
│  - preferredName, type  ├──────────┤  - fromId, toId         │
│  - semanticFingerprint  │          │  - relation, confidence │
└─────────────────────────┘          └─────────────────────────┘
```

* **`TaxonomyLabel` & `TaxonomyEdge`**: Đồ thị tri thức năng lực và quan hệ ngữ nghĩa (5 hops, ontology mapping).
* **`CandidateConceptAssertion`**: Ghi nhận bằng chứng (*Evidence*) và mức độ thành thạo (*Proficiency*) của ứng viên đối với từng kỹ năng.
* **`ProfileRevision`**: Lưu snapshot lịch sử hồ sơ mỗi khi có thay đổi, đảm bảo tính toàn vẹn dữ liệu khi tính toán lại.
* **`PipelineRun` & `PipelineStage`**: Theo dõi tiến độ thời gian thực của từng bước trong quy trình xử lý tài liệu.
* **`MatchResult` & `RecommendationItem`**: Lưu vết điểm số, giải thích lý do và phân tích chi tiết (*Breakdown*).

---

## 📱 Hướng Dẫn Sử Dụng Chi Tiết (User Journeys)

### 🏢 Dành Cho Nhà Tuyển Dụng (Employer Workspace)

1. **Khởi tạo tin tuyển dụng**:
   * Truy cập phân hệ **Nhà tuyển dụng** $\rightarrow$ Chọn **Tạo tin mới**.
   * Nhập tiêu đề và mô tả công việc bằng ngôn ngữ tự nhiên.
   * Hệ thống tự động phân tích qua các stage: *Document Parsing* $\rightarrow$ *AI Structured Extraction* $\rightarrow$ *Taxonomy Normalization*.
2. **Tương tác làm rõ (Active Clarification)**:
   * Nếu JD chưa rõ mức ngân sách, năm kinh nghiệm hoặc kỹ năng bắt buộc, popup hỏi đáp sẽ xuất hiện.
   * Nhà tuyển dụng lựa chọn các phương án nhanh để hoàn thiện JD.
3. **Quản lý ứng viên & Đánh giá mức độ phù hợp**:
   * Danh sách ứng viên được xếp hạng tự động với điểm số trực quan.
   * Nhấp vào từng ứng viên để xem **Bảng phân tích chi tiết (Breakdown)**: Kỹ năng bắt buộc đã có, kỹ năng tương đương, kỹ năng còn thiếu và trích dẫn bằng chứng cụ thể.
4. **Xử lý hồ sơ ứng tuyển**:
   * Tiếp nhận hồ sơ từ ứng viên chủ động ứng tuyển và chuyển đổi trạng thái tiếp nhận/phỏng vấn.

### 👨‍💻 Dành Cho Ứng Viên (Candidate Workspace)

1. **Tải lên và Chuẩn hóa CV**:
   * Truy cập phân hệ **Ứng viên** $\rightarrow$ Chọn **Nhập CV**.
   * Hỗ trợ nộp file **PDF (có text layer)**, **DOCX** hoặc nhập **URL Portfolio/LinkedIn**.
   * Theo dõi tiến trình trích xuất trực quan. Bổ sung các thông tin còn thiếu nếu được hệ thống đề xuất.
2. **Khám phá Việc làm Phù hợp**:
   * Hệ thống tự động đề xuất danh sách việc làm với độ tương thích từ cao xuống thấp.
   * Xem chi tiết điểm mạnh của bản thân đối với công việc và những điểm cần lưu ý trước khi ứng tuyển.
3. **Ứng tuyển & Theo dõi trạng thái**:
   * Nộp hồ sơ chỉ với 1 cú nhấp chuột kèm ghi chú cá nhân hóa.
4. **Nhận Lộ Trình Phát Triển Sự Nghiệp (AI Career Roadmap)**:
   * Chọn nghề nghiệp mục tiêu mong muốn.
   * Hệ thống phân tích toàn diện thị trường và trả về:
     * **Điểm mạnh hiện tại** & **Vị trí phù hợp nhất**.
     * **Khoảng cách kỹ năng (Skill Gaps)** xếp hạng theo mức độ ảnh hưởng đến điểm số tuyển dụng.
     * **Kế hoạch hành động cụ thể (Actionable Steps)** chia theo từng giai đoạn ngắn hạn và dài hạn.

---

## 📡 Danh Mục RESTful API Routes

| Endpoint | Method | Chức Năng |
|---|---|---|
| `/api/documents` | `POST` | Tiếp nhận upload file PDF/DOCX hoặc cào dữ liệu từ Portfolio URL |
| `/api/candidates/extract` | `POST` | Kích hoạt AI Extraction để tạo hồ sơ ứng viên từ tài liệu |
| `/api/candidate/profile` | `GET`, `PUT` | Truy vấn và cập nhật thông tin hồ sơ ứng viên |
| `/api/candidate/clarifications` | `GET`, `POST`| Quản lý và trả lời các câu hỏi làm rõ hồ sơ ứng viên |
| `/api/candidate/roadmap` | `GET`, `POST` | Tính toán và xuất lộ trình phát triển sự nghiệp cá nhân hóa |
| `/api/jobs` | `GET`, `POST` | Lấy danh sách tin tuyển dụng hoặc tạo tin tuyển dụng mới |
| `/api/jobs/[id]` | `GET`, `PUT` | Truy vấn chi tiết hoặc cập nhật tin tuyển dụng |
| `/api/jobs/[id]/extract` | `POST` | Kích hoạt AI trích xuất yêu cầu công việc từ bản mô tả thô |
| `/api/jobs/[id]/clarifications`| `GET`, `POST`| Truy vấn và lưu câu trả lời làm rõ tin tuyển dụng |
| `/api/jobs/[id]/confirm` | `POST` | Xác nhận và Publish tin tuyển dụng lên hệ thống |
| `/api/matches` | `GET` | Truy vấn điểm tương thích giữa Job và Ứng viên |
| `/api/recommendations/jobs` | `GET` | Đề xuất danh sách việc làm tối ưu cho ứng viên (MMR Reranked) |
| `/api/recommendations/candidates`| `GET` | Đề xuất danh sách ứng viên sáng giá cho nhà tuyển dụng |
| `/api/applications` | `GET`, `POST`| Nộp hồ sơ ứng tuyển và quản lý trạng thái tuyển dụng |
| `/api/pipeline/[runId]` | `GET` | Kiểm tra tiến độ thời gian thực của tác vụ xử lý nền |

---

## 🛠️ Hướng Dẫn Cài Đặt & Chạy Môi Trường Local

### Yêu Cầu Hệ Thống

* **Node.js**: Phiên bản `20.x` trở lên.
* **Docker & Docker Compose**: Dùng để chạy PostgreSQL với extension `pgvector` cục bộ (hoặc dùng tài khoản Neon Cloud).
* **OpenAI-Compatible LLM Endpoint**: Cần endpoint API tương thích chuẩn OpenAI Chat Completions.

### Các Bước Cài Đặt

**1. Clone mã nguồn về máy:**
```powershell
git clone -b submission https://github.com/Minwsun/pairjob.git
cd pairjob
```

**2. Cài đặt các gói phụ thuộc:**
```powershell
npm install
```

**3. Thiết lập biến môi trường:**
```powershell
Copy-Item .env.example .env
```

Cập nhật các thông số trong tệp `.env`:
```env
# Database Connection (Hỗ trợ PostgreSQL với pgvector)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pairjob?schema=public"

# LLM Gateway Configuration (Tương thích OpenAI API)
LLM_BASE_URL="https://your-llm-provider.com/v1"
LLM_API_KEY="your_api_key_here"
LLM_REASONING_MODEL="cx/gpt-5.6-terra"
LLM_FAST_MODEL="cx/gpt-5.4-mini"

# Storage & Security (Dùng cho Production/Blob)
BLOB_READ_WRITE_TOKEN="your_vercel_blob_token_if_needed"
CRON_SECRET="your_secure_cron_secret"
```

**4. Khởi động Cơ sở Dữ liệu & Khởi tạo Schema:**
```powershell
# Chạy PostgreSQL container với pgvector
npm run db:up

# Áp dụng migration vào cơ sở dữ liệu
npm run db:deploy

# Seed dữ liệu đồ thị tri thức Taxonomy & Học vấn
npm run db:seed-taxonomy
npm run db:seed-education
```

**5. Khởi chạy máy chủ phát triển:**
```powershell
npm run dev
```

Mở trình duyệt và truy cập: `http://localhost:3000`

---

## 🚀 Triển Khai Production & Bảo Mật

### Quy Trình Build & Deploy Production

Dự án đã được cấu hình tối ưu sẵn sàng triển khai trên **Vercel** và cơ sở dữ liệu **Neon PostgreSQL**:

```powershell
# Build kiểm thử tính hợp lệ
npm run db:deploy
npm run build
npm run start
```

### Chính Sách An Toàn & Bảo Mật Dữ Liệu

* 🔒 **Bảo Vệ Bí Mật Môi Trường (Zero-Secret Policy)**: Không commit bất kỳ token, secret key hoặc connection string thật vào git repository. Mọi cấu hình nhạy cảm đều được quản lý qua Vercel Environment Variables.
* 🛡️ **Bảo Vệ Chống Tấn Công SSRF**: Bộ nạp URL Portfolio kiểm tra địa chỉ IP nghiêm ngặt, chặn truy cập vào dải mạng nội bộ (private IP ranges) và các dịch vụ metadata của đám mây.
* 📝 **Audit Logging & Clean Release**: Bản phân phối `submission` được dọn sạch các tệp rác, logs phát triển, dữ liệu cá nhân nhạy cảm và mock data không cần thiết.

---

## 🧭 Định Hướng Mở Rộng & Giới Hạn

1. **Xử lý tài liệu scan (OCR)**: Các tệp PDF scan không chứa text layer hiện được gắn nhãn `OCR_REQUIRED`. Do không nhúng các thư viện OCR AGPL nặng vào bản phân phối tiêu chuẩn, đơn vị triển khai có thể tích hợp Cloud OCR API (Google Cloud Vision / AWS Textract) tùy theo nhu cầu.
2. **Distributed Background Queue**: Hệ thống tác vụ nền hiện vận hành mượt mà trên nền tảng Serverless của Next.js/Vercel. Trong các kịch bản tải siêu lớn, hệ thống có thể kết nối thêm Redis/BullMQ hoặc AWS SQS.
3. **Multi-Tenant Authentication**: Bản demo tích hợp sẵn bộ chuyển đổi vai trò Demo Persona trực quan. Hệ thống có thể dễ dàng mở rộng sang NextAuth.js / Clerk / Supabase Auth khi đưa vào thương mại hóa quy mô lớn.

---

## 📄 License & Third-Party Notices

* Mã nguồn PairJob được phát hành theo giấy phép **ISC License**.
* Bản quyền và giấy phép của các thư viện, thành phần mã nguồn mở bên thứ ba được ghi nhận chi tiết tại [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

<p align="center">
  <b>PairJob</b> — <i>Kiến tạo tương lai kết nối việc làm thông minh với Trí Tuệ Nhân Tạo.</i>
</p>
