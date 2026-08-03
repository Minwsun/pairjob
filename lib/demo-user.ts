import { db } from "./db";

async function userByEmail(email: string, displayName: string, role: "EMPLOYER" | "CANDIDATE") {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  try { return await db.user.create({ data: { email, displayName, role } }); }
  catch (error) { const raced = await db.user.findUnique({ where: { email } }); if (raced) return raced; throw error; }
}

export function getDemoEmployer() {
  return userByEmail("employer@pairjob.local", "Nhà tuyển dụng Demo", "EMPLOYER");
}

export async function getDemoCandidate() {
  const user = await userByEmail("candidate@pairjob.local", "Ứng viên Demo", "CANDIDATE");
  const existing = await db.candidateProfile.findUnique({ where: { userId: user.id } });
  if (existing) return { user, profile: existing };
  try { return { user, profile: await db.candidateProfile.create({ data: { userId: user.id } }) }; }
  catch (error) { const raced = await db.candidateProfile.findUnique({ where: { userId: user.id } }); if (raced) return { user, profile: raced }; throw error; }
}
