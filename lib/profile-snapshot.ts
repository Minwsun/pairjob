import type { CandidateProfile } from "@prisma/client";

export function profileSnapshot(profile: CandidateProfile) {
  return {
    displayTitle: profile.displayTitle,
    occupation: profile.occupation,
    skills: profile.skills,
    domains: profile.domains,
    experiences: profile.experiences,
    projects: profile.projects,
    education: profile.education,
    experienceYears: profile.experienceYears,
    workModes: profile.workModes,
    availabilityHours: profile.availabilityHours,
    hourlyRate: profile.hourlyRate,
    evidenceQuality: profile.evidenceQuality,
    completeness: profile.completeness,
    verified: profile.verified,
    selectedTargetOccupationId: profile.selectedTargetOccupationId,
  };
}
