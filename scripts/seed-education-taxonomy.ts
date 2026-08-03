import { PrismaClient } from "@prisma/client";
import { normalizeTaxonomyText } from "../lib/taxonomy/service";

const db = new PrismaClient();
const fields = [
  ["isced_00", "Generic programmes and qualifications", ["chương trình chung"]],
  ["isced_01", "Education", ["giáo dục", "sư phạm"]],
  ["isced_02", "Arts and humanities", ["nghệ thuật và nhân văn", "mỹ thuật", "ngôn ngữ học"]],
  ["isced_03", "Social sciences, journalism and information", ["khoa học xã hội", "báo chí", "truyền thông"]],
  ["isced_04", "Business, administration and law", ["kinh doanh", "quản trị", "luật", "tài chính kế toán"]],
  ["isced_05", "Natural sciences, mathematics and statistics", ["khoa học tự nhiên", "toán", "thống kê"]],
  ["isced_06", "Information and Communication Technologies", ["công nghệ thông tin", "cntt", "khoa học máy tính", "phần mềm"]],
  ["isced_07", "Engineering, manufacturing and construction", ["kỹ thuật", "công nghệ kỹ thuật", "sản xuất", "xây dựng"]],
  ["isced_08", "Agriculture, forestry, fisheries and veterinary", ["nông nghiệp", "lâm nghiệp", "thủy sản", "thú y"]],
  ["isced_09", "Health and welfare", ["y tế", "sức khỏe", "dược", "điều dưỡng", "công tác xã hội"]],
  ["isced_10", "Services", ["dịch vụ", "du lịch", "khách sạn", "an ninh", "vận tải"]],
] as const;

async function main() {
  await db.taxonomyLabel.upsert({ where: { id: "fields_of_study" }, update: {}, create: { id: "fields_of_study", type: "field_of_study_group", preferredName: "Fields of Study", parentId: "qualifications", semanticFingerprint: "field_of_study_group:fields of study", createdBy: "isced_import", reviewStatus: "VERIFIED", status: "ACTIVE" } });
  for (const [id, name, aliases] of fields) {
    await db.taxonomyLabel.upsert({ where: { id }, update: { preferredName: name }, create: { id, type: "field_of_study", preferredName: name, parentId: "fields_of_study", semanticFingerprint: `field_of_study:${normalizeTaxonomyText(name)}`, externalSource: "ISCED-F", externalId: id.replace("isced_", ""), sourceVersion: "2013", locale: "en", activationReason: "Imported from ISCED-F broad fields", createdBy: "isced_import", reviewStatus: "VERIFIED", status: "ACTIVE" } });
    await db.taxonomyAlias.createMany({ data: [name, ...aliases].map((alias) => ({ labelId: id, alias, normalized: normalizeTaxonomyText(alias), language: alias === name ? "en" : "vi", kind: "official_or_localized" })), skipDuplicates: true });
  }
  console.log(`Seeded ${fields.length} ISCED-F broad fields.`);
}

main().finally(() => db.$disconnect());
