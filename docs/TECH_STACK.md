# Công Cụ, Mô Hình, API Và Nguồn Tham Khảo

## Công nghệ

| Nhóm | Công cụ | Vai trò |
|---|---|---|
| Web | Next.js, React, TypeScript | UI, SSR, API route, streaming progress |
| Database | PostgreSQL, Prisma, pgvector | Dữ liệu canonical, graph, vector, workflow |
| Validation | Zod | API payload và structured AI output |
| PDF | pdf-parse | Đọc PDF có text layer |
| DOCX | Mammoth | Trích xuất nội dung Word |
| URL | Cheerio | Làm sạch HTML portfolio công khai |
| Storage | Vercel Blob | Lưu tài liệu production |
| Hosting | Vercel | Build và triển khai Next.js |
| Database cloud | Neon | PostgreSQL production |

## Mô hình AI

| Tier | Model mặc định | Tác vụ |
|---|---|---|
| Reasoning | `cx/gpt-5.6-terra` | JD/CV khó, taxonomy, clarification, roadmap |
| Fast | `cx/gpt-5.4-mini` | Tác vụ ngắn, chi phí thấp |

Model được gọi qua API tương thích OpenAI Chat Completions. PairJob không chứa API key hoặc model weight.

## API nội bộ chính

- `/api/documents`: upload hoặc nhập URL.
- `/api/candidates/extract`: tạo hồ sơ từ tài liệu.
- `/api/candidate/profile`: đọc và chỉnh hồ sơ.
- `/api/candidate/clarifications/*`: làm rõ CV.
- `/api/jobs`: danh sách và tạo tin.
- `/api/jobs/{id}/extract`: phân tích JD.
- `/api/jobs/{id}/clarifications/*`: làm rõ JD.
- `/api/jobs/{id}/confirm`: xác nhận/publish.
- `/api/matches` và `/api/matches/detail`: matching và breakdown.
- `/api/recommendations/jobs`: job cho ứng viên.
- `/api/recommendations/candidates`: ứng viên cho nhà tuyển dụng.
- `/api/applications/*`: ứng tuyển.
- `/api/pipeline/{runId}`: tiến độ tác vụ.
- `/api/recompute/*`: tính lại dữ liệu phụ thuộc.

## Nguồn tham khảo

- Next.js: https://nextjs.org/docs
- React: https://react.dev
- TypeScript: https://www.typescriptlang.org/docs
- Prisma: https://www.prisma.io/docs
- PostgreSQL: https://www.postgresql.org/docs
- pgvector: https://github.com/pgvector/pgvector
- Neon: https://neon.tech/docs
- Vercel: https://vercel.com/docs
- Vercel Blob: https://vercel.com/docs/storage/vercel-blob
- Zod: https://zod.dev
- Mammoth: https://github.com/mwilliamson/mammoth.js
- Cheerio: https://cheerio.js.org
- O*NET Database: https://www.onetcenter.org/database.html

License và attribution: [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
