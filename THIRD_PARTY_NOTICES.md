# Third-Party Notices

PairJob sử dụng các dự án mã nguồn mở theo license riêng của từng dự án. Danh sách này mô tả dependency trực tiếp của bản bàn giao; dependency bắc cầu được ghi trong `package-lock.json`.

| Thành phần | Phiên bản | License | Mục đích |
|---|---:|---|---|
| @napi-rs/canvas | 0.1.80 | MIT | Canvas runtime cho PDF dependency |
| @prisma/client | 6.19.0 | Apache-2.0 | Database client |
| Prisma CLI | 6.19.x | Apache-2.0 | Schema và migration |
| @vercel/blob | 2.6.1 | Apache-2.0 | Object storage |
| Cheerio | 1.2.0 | MIT | HTML parsing |
| Mammoth | 1.12.0 | BSD-2-Clause | DOCX extraction |
| Next.js | 16.2.12 | MIT | Web framework |
| pdf-parse | 2.4.5 | Apache-2.0 | PDF text extraction |
| React / React DOM | 19.2.0 | MIT | UI runtime |
| Zod | 4.4.3 | MIT | Schema validation |
| docx | 9.7.1 | MIT | Development document tooling |
| pdf-lib | 1.17.1 | MIT | Development PDF tooling |
| tsx | 4.x | MIT | TypeScript script runtime |
| TypeScript | 5.x | Apache-2.0 | Compiler |

## O*NET

Thiết kế taxonomy tham khảo O*NET Database. Bản bàn giao không chứa snapshot O*NET. Khi nhập hoặc sử dụng dữ liệu O*NET, đơn vị triển khai cần tuân thủ Attribution License và ghi nguồn theo hướng dẫn tại https://www.onetcenter.org/database.html.

## Model Và Dịch Vụ

PairJob chỉ tích hợp API tương thích OpenAI và không phân phối model weight. Quyền sử dụng model, Neon, Vercel và Vercel Blob phụ thuộc tài khoản cùng điều khoản dịch vụ của người triển khai.

## Phạm vi

ISC License trong `LICENSE` chỉ áp dụng cho mã PairJob do tác giả cung cấp. Nó không thay thế license của thành phần bên thứ ba.
