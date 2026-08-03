const asArray = <T>(value: unknown) => Array.isArray(value) ? value as T[] : [];

export function jobSearchDocument(job: any) {
  return [job.displayTitle, job.rawTitle, job.rawDescription, job.occupation,
    ...asArray<any>(job.requiredSkills).map((item) => item.label),
    ...asArray<any>(job.preferredSkills).map((item) => item.label),
    ...asArray<string>(job.domains), ...asArray<any>(job.educationRequirements).map((item) => item.label),
  ].filter(Boolean).join("\n");
}

export function candidateSearchDocument(profile: any) {
  return [profile.displayTitle, profile.occupation,
    ...asArray<any>(profile.skills).map((item) => `${item.label}: ${asArray<any>(item.evidence).map((evidence) => evidence.sourceText).join(" ")}`),
    ...asArray<string>(profile.domains),
    ...asArray<any>(profile.experiences).map((item) => `${item.title ?? ""} ${item.description ?? ""}`),
    ...asArray<any>(profile.projects).map((item) => `${item.name ?? ""} ${item.description ?? ""}`),
    ...asArray<any>(profile.education).map((item) => `${item.degree ?? ""} ${item.field ?? ""}`),
  ].filter(Boolean).join("\n");
}
