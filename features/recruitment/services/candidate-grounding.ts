export interface GroundingToolRecord {
  toolName: string;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

export interface GroundedCandidate {
  name: string;
  cvId?: string;
  candidateId?: string;
  score?: number;
  stage?: string;
  jobTitle?: string;
  owner?: string;
  createdAt?: string;
  skills: string[];
  languages: string[];
  experience?: string;
  evidence: string[];
  sourceTools: string[];
}

export interface AllowedCandidateSet {
  candidates: GroundedCandidate[];
  normalizedNames: Set<string>;
  punctuationInsensitiveNames: Set<string>;
  sourceTools: string[];
}

export interface CandidateNameValidationResult {
  ok: boolean;
  detectedNames: string[];
  rejectedNames: string[];
}

export interface GroundedAssistantResponse {
  text: string;
  blocked: boolean;
  deterministic: boolean;
  candidateCount: number;
  rejectedNames: string[];
  sourceTools: string[];
}

export interface GroundAssistantResponseOptions {
  userMessage: string;
  forceDeterministicRanking?: boolean;
  locale?: "en" | "fr";
}

const GROUNDED_CANDIDATE_TOOL_NAMES = new Set([
  "list_cv_pool",
  "search_cv_pool",
  "semantic_search_cvs",
  "rag_search_cvs",
  "match_cvs_to_job",
  "match_cvs_to_job_with_filters",
  "hybrid_search_cvs",
  "compare_candidates",
  "get_candidates_by_stage",
  "get_candidates_by_job",
  "get_candidate",
  "get_screening",
  "direct_named_search",
  "direct_compare_candidates",
]);

const PLACEHOLDER_NAMES = new Set([
  "candidate",
  "unknown",
  "unknown candidate",
  "unknown cv",
  "cv",
  "resume",
  "n/a",
  "na",
  "none",
  "null",
]);

const NON_PERSON_PHRASES = new Set([
  "ai service",
  "business unit",
  "candidate comparison",
  "candidate lists",
  "capgemini talentiq",
  "cv lists",
  "fallback mode",
  "key skills",
  "next steps",
  "no response",
  "project management",
  "resume based",
  "single candidate",
  "target role",
  "top candidates",
  "top matches",
  "top results",
]);

const BROAD_NAME_RE =
  /\b[A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:[-'][A-Z]?[a-zÀ-ÖØ-öø-ÿ]+)?(?:\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:[-'][A-Z]?[a-zÀ-ÖØ-öø-ÿ]+)?){1,3}\b/g;

export function normalizeCandidateName(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeCandidateNameLoose(value: string): string {
  return normalizeCandidateName(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCandidateRosterIntent(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  const hasCandidateNoun = /\b(candidates?|candidats?|profiles?|profils?)\b/.test(normalized);
  const hasRosterLanguage =
    /\b(assigned\s+to\s+me|my\s+(?:assigned\s+)?candidates?|current\s+stage|job\s+title|candidate\s+roster|who\s+is\s+assigned|mes\s+candidats?|[eé]tape\s+actuelle|poste|propri[eé]taire)\b/.test(
      normalized,
    ) ||
    /\b(list|show|liste|lister|montre|montrer|affiche|afficher)\b.*\b(candidates?|candidats?|profiles?|profils?)\b/.test(normalized);
  const hasRankingLanguage =
    /\b(top|best|meilleur|meilleurs|rank(?:ing|ed)?|classement|shortlist|match(?:es|ing)?|correspondance|recommend(?:ation|ed)?|recommandation|compare|comparison|comparer|prioriti[sz]e|prioriser|priority)\b/.test(
      normalized,
    );

  return hasCandidateNoun && hasRosterLanguage && !hasRankingLanguage;
}

export function isCandidateSearchOrRankingIntent(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  const isSkillDemandComparison =
    /\b(compare|comparison|gap|demand|supply)\b.*\b(cv\s+pool|job\s+demand|skills?)\b/.test(
      normalized,
    ) ||
    /\b(cv\s+pool|job\s+demand|skills?)\b.*\b(compare|comparison|gap|demand|supply)\b/.test(
      normalized,
    );

  if (isSkillDemandComparison || isCandidateRosterIntent(message)) {
    return false;
  }


  return (
    /\b(transferable\s+skills?|competences?\s+transferables?|top\s+\d*\s*(?:candidates?|candidats?)|best\s+fit|best\s+candidates?|meilleurs?\s+candidats?|rank(?:ing|ed)?|classement|shortlist|recommend(?:ation|ed)?|recommandation|compare|comparison|comparer)\b/.test(
      normalized,
    ) ||
    /\b(match(?:es|ed)?|find|search|show|list|trouve|trouver|recherche|rechercher|montre|montrer|liste|lister)\b.*\b(candidates?|candidats?|cvs?|resumes?|profiles?|profils?)\b/.test(
      normalized,
    )
  );
}

export function isExplicitNamedSearchIntent(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  const isJobAuthoringName =
    /\b(job|role|position|requirement|description)\b/.test(normalized) &&
    /\b(create|new|generate|write|publish|named|called)\b/.test(normalized);

  if (isJobAuthoringName) {
    return false;
  }


  return (
    /\bname\s*(?:is|=)\s+["']?[^"'\n,]+["']?/.test(normalized) ||
    /\b(?:called|named)\s+["']?[^"'\n,]+["']?/.test(normalized) ||
    /\b(?:find|search|show|look\s+for)\b.*\b(?:candidate|cv|resume|profile)\b.*\b[A-Z][a-zÀ-ÖØ-öø-ÿ]+\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+/.test(
      String(message ?? ""),
    )
  );
}

export function buildAllowedCandidatesFromToolRecords(
  records: GroundingToolRecord[],
): AllowedCandidateSet {
  const byIdentity = new Map<string, GroundedCandidate>();
  const sourceTools = new Set<string>();

  for (const record of records) {
    if (
      !record.result.success ||
      !GROUNDED_CANDIDATE_TOOL_NAMES.has(record.toolName)
    ) {
      continue;
    }

    sourceTools.add(record.toolName);
    for (const candidate of extractCandidatesFromToolData(
      record.toolName,
      record.result.data,
    )) {
      mergeCandidate(byIdentity, candidate);
    }
  }

  for (const record of records) {
    if (
      record.result.success &&
      GROUNDED_CANDIDATE_TOOL_NAMES.has(record.toolName)
    ) {
      mergeScreeningSignalsFromToolData(
        byIdentity,
        record.toolName,
        record.result.data,
      );
    }
  }

  const candidates = Array.from(byIdentity.values()).sort(compareCandidatePriority);
  const normalizedNames = new Set<string>();
  const punctuationInsensitiveNames = new Set<string>();

  for (const candidate of candidates) {
    normalizedNames.add(normalizeCandidateName(candidate.name));
    punctuationInsensitiveNames.add(
      normalizeCandidateNameLoose(candidate.name),
    );
  }

  return {
    candidates,
    normalizedNames,
    punctuationInsensitiveNames,
    sourceTools: Array.from(sourceTools),
  };
}

export function validateGroundedCandidateNames(
  text: string,
  allowedCandidates: AllowedCandidateSet,
  options: { broad?: boolean } = {},
): CandidateNameValidationResult {
  const detectedNames = extractCandidateLikeNames(text, options);
  const rejectedNames = detectedNames.filter(
    (name) => !isAllowedCandidateName(name, allowedCandidates),
  );

  return {
    ok: rejectedNames.length === 0,
    detectedNames,
    rejectedNames,
  };
}

export function groundAssistantResponse(
  rawText: string,
  records: GroundingToolRecord[],
  options: GroundAssistantResponseOptions,
): GroundedAssistantResponse {
  const allowedCandidates = buildAllowedCandidatesFromToolRecords(records);
  const isRosterFlow = isCandidateRosterIntent(options.userMessage);
  const isRankingFlow =
    !isRosterFlow &&
    (Boolean(options.forceDeterministicRanking) ||
      isCandidateSearchOrRankingIntent(options.userMessage));
  const shouldUseBroadNameDetection =
    isRankingFlow ||
    allowedCandidates.candidates.length > 0 ||
    isExplicitNamedSearchIntent(options.userMessage);
  const needsCandidateGuard =
    isRankingFlow ||
    allowedCandidates.candidates.length > 0 ||
    isExplicitNamedSearchIntent(options.userMessage);

  if (!needsCandidateGuard) {
    return {
      text: rawText,
      blocked: false,
      deterministic: false,
      candidateCount: 0,
      rejectedNames: [],
      sourceTools: [],
    };
  }


  if (isRosterFlow) {
    const validation = validateGroundedCandidateNames(
      rawText,
      allowedCandidates,
      { broad: true },
    );

    return {
      text: buildDeterministicCandidateRosterResponse(
        allowedCandidates,
        options.locale,
      ),
      blocked: !validation.ok,
      deterministic: true,
      candidateCount: allowedCandidates.candidates.length,
      rejectedNames: validation.rejectedNames,
      sourceTools: allowedCandidates.sourceTools,
    };
  }

  if (isRankingFlow) {
    const validation = validateGroundedCandidateNames(
      rawText,
      allowedCandidates,
      {
        broad: shouldUseBroadNameDetection,
      },
    );

    return {
      text: buildDeterministicGroundedCandidateResponse(
        allowedCandidates,
        options.userMessage,
        options.locale,
      ),
      blocked: !validation.ok,
      deterministic: true,
      candidateCount: allowedCandidates.candidates.length,
      rejectedNames: validation.rejectedNames,
      sourceTools: allowedCandidates.sourceTools,
    };
  }

  const validation = validateGroundedCandidateNames(
    rawText,
    allowedCandidates,
    {
      broad: shouldUseBroadNameDetection,
    },
  );

  if (validation.ok) {
    return {
      text: rawText,
      blocked: false,
      deterministic: false,
      candidateCount: allowedCandidates.candidates.length,
      rejectedNames: [],
      sourceTools: allowedCandidates.sourceTools,
    };
  }

  return {
    text: buildDeterministicGroundedCandidateResponse(
      allowedCandidates,
      options.userMessage,
      options.locale,
    ),
    blocked: true,
    deterministic: true,
    candidateCount: allowedCandidates.candidates.length,
    rejectedNames: validation.rejectedNames,
    sourceTools: allowedCandidates.sourceTools,
  };
}

export function buildDeterministicCandidateRosterResponse(
  allowedCandidates: AllowedCandidateSet,
  locale: "en" | "fr" = "en",
): string {
  const rows = allowedCandidates.candidates.slice(0, 20);

  if (rows.length === 0) {
    return locale === "fr"
      ? [
          "## Liste des candidats assignes",
          "Aucun candidat n'est accessible dans le perimetre de votre role pour les etapes demandees.",
          "",
          "## Limites",
          "- Aucun nom n'est deduit des conversations precedentes ni d'hypotheses du modele.",
          "",
          "## Prochaines etapes",
          "1. Verifier les etapes demandees.",
          "2. Verifier si un candidat a ete assigne a l'utilisateur courant.",
          "3. Demander a un administrateur de verifier l'assignation si la liste ne devrait pas etre vide.",
        ].join("\n")
      : [
          "## Assigned candidate roster",
          "No candidates are accessible in the current role scope for the requested stages.",
          "",
          "## Caveats",
          "- No names are inferred from prior conversations or model assumptions.",
          "",
          "## Next Steps",
          "1. Verify the requested stages.",
          "2. Check whether a candidate has been assigned to the current user.",
          "3. Ask an administrator to review the assignment if the roster should not be empty.",
        ].join("\n");
  }

  const unavailable = locale === "fr" ? "Non disponible" : "Not available";
  const table = [
    locale === "fr"
      ? "| Nom | Score | Etape actuelle | Poste | Proprietaire |"
      : "| Name | Score | Current stage | Job | Owner |",
    "|-----|-------|----------------|-------|--------------|",
    ...rows.map(
      (candidate) =>
        `| ${escapeMarkdownTableCell(candidate.name)} | ${
          candidate.score === undefined
            ? unavailable
            : formatScore(candidate.score)
        } | ${escapeMarkdownTableCell(
          formatStageLabel(candidate.stage, locale) ?? unavailable,
        )} | ${escapeMarkdownTableCell(
          candidate.jobTitle ?? unavailable,
        )} | ${escapeMarkdownTableCell(
          formatOwnerLabel(candidate.owner, locale) ?? unavailable,
        )} |`,
    ),
  ].join("\n");

  if (locale === "fr") {
    return [
      "## Liste des candidats assignes",
      `J'ai trouve **${rows.length}** candidat${rows.length === 1 ? "" : "s"} accessible${rows.length === 1 ? "" : "s"} dans le perimetre de votre role.`,
      "",
      table,
      "",
      "## Preuves",
      `- Outils sources limites au role : ${allowedCandidates.sourceTools.join(", ") || "resultat d'un outil candidat"}.`,
      "",
      "## Limites",
      "- Cette liste est factuelle ; ce n'est ni un classement, ni une shortlist, ni une recommandation d'embauche.",
      "- Seuls les candidats retournes par les outils limites au role pendant ce cycle sont affiches.",
      "",
      "## Prochaines etapes",
      "1. Ouvrir un candidat de la liste pour consulter ses preuves et l'historique de ses etapes.",
      "2. Demander les preuves manquantes pour un candidat de la liste.",
      "3. Utiliser le workflow direct de l'etape actuelle ; aucune etape n'a ete modifiee.",
    ].join("\n");
  }

  return [
    "## Assigned candidate roster",
    `I found **${rows.length}** candidate${rows.length === 1 ? "" : "s"} accessible in the current role scope.`,
    "",
    table,
    "",
    "## Evidence",
    `- Role-scoped source tools: ${allowedCandidates.sourceTools.join(", ") || "candidate tool output"}.`,
    "",
    "## Caveats",
    "- This is a factual roster, not a ranking, shortlist, or hiring recommendation.",
    "- Only candidates returned by the current response cycle's role-scoped tools are shown.",
    "",
    "## Next Steps",
    "1. Open one listed candidate to review evidence and stage history.",
    "2. Ask for missing evidence for one listed candidate.",
    "3. Use the direct workflow for the candidate's current stage; no stage change was executed.",
  ].join("\n");
}

export function buildDeterministicGroundedCandidateResponse(
  allowedCandidates: AllowedCandidateSet,
  userMessage: string,
  locale: "en" | "fr" = "en",
): string {
  if (allowedCandidates.candidates.length === 0) {
    return locale === "fr"
      ? [
          "Je n'ai trouve aucun candidat accessible dans les resultats d'outils pour cette requete.",
          "",
          "Aucun nom de candidat ne sera deduit de l'historique du chat ni d'hypotheses du modele.",
          "",
          "Essayez une requete plus sure :",
          "1. Rechercher des CV par competence, seniorite ou langue.",
          "2. Lister d'abord le pool de CV accessible.",
          "3. Lancer une recherche plus precise avec des criteres indispensables explicites.",
        ].join("\n")
      : [
          "I couldn’t find any accessible candidates in the current tool results for this request.",
          "",
          "No candidate names will be inferred from prior chat context or model assumptions.",
          "",
          "Try a safer next query such as:",
          "1. Search CVs for a specific skill, seniority, or language.",
          "2. List the accessible CV pool first.",
          "3. Run a narrower candidate search with explicit must-have criteria.",
        ].join("\n");
  }

  const rows = allowedCandidates.candidates.slice(0, 10);
  const isRanking = isCandidateSearchOrRankingIntent(userMessage) || rows.length > 1;
  const topCandidate = rows[0];
  const topSkills = safeList(topCandidate.skills, 5);
  const topLanguages = safeList(topCandidate.languages, 4);
  const topScore = normalizeScore(topCandidate.score);
  const scoreText = formatScore(topCandidate.score);
  const fitLabel =
    locale === "fr"
      ? typeof topScore !== "number"
        ? "un profil qui doit encore etre valide"
        : topScore >= 75
          ? "une excellente correspondance"
          : topScore >= 60
            ? "une correspondance prometteuse"
            : topScore >= 45
              ? "une correspondance possible mais non automatique"
              : "une correspondance exploratoire"
      : typeof topScore !== "number"
        ? "a profile that still needs validation"
        : topScore >= 75
          ? "a strong match"
          : topScore >= 60
            ? "a promising match"
            : topScore >= 45
              ? "a workable but not automatic match"
              : "an exploratory match";
  const recommendation =
    locale === "fr"
      ? typeof topScore !== "number"
        ? "commencer par une preselection structuree car le score est absent"
        : topScore >= 75
          ? "placer ce profil dans la shortlist, puis le comparer aux criteres indispensables du poste cible"
          : topScore >= 60
            ? "evaluer ce profil par rapport aux exigences du poste avant de poursuivre"
            : topScore >= 45
              ? "effectuer une preselection ciblee avant de placer ce profil dans la shortlist"
              : "garder ce profil en reserve, sauf si le role cible correspond precisement a ses competences"
      : typeof topScore !== "number"
        ? "start with a structured screening because the score is missing"
        : topScore >= 75
          ? "shortlist them, then compare against the target job must-haves"
          : topScore >= 60
            ? "screen them against the job requirements before moving forward"
            : topScore >= 45
              ? "run a focused screening before shortlisting"
              : "keep them as a backup unless the target role matches their skills closely";

  const hasPipelineContext = rows.some(
    (candidate) => candidate.stage || candidate.jobTitle,
  );
  const notProvided = locale === "fr" ? "Non fourni" : "Not provided";
  const table = [
    hasPipelineContext
      ? locale === "fr"
        ? "| Rang | Nom | Score | Etape | Poste | Competences cles | Experience | Langues |"
        : "| Rank | Name | Score | Stage | Job | Key Skills | Experience | Languages |"
      : locale === "fr"
        ? "| Rang | Nom | Score | Competences cles | Experience | Langues |"
        : "| Rank | Name | Score | Key Skills | Experience | Languages |",
    hasPipelineContext
      ? "|------|-----|-------|-------|-------|------------------|------------|---------|"
      : "|------|-----|-------|------------------|------------|---------|",
    ...rows
      .map((candidate, index) => {
        const skills = safeList(candidate.skills, 5);
        const languages = safeList(candidate.languages, 4);
        const cells = hasPipelineContext
          ? [
              String(index + 1),
              escapeMarkdownTableCell(candidate.name),
              formatScore(candidate.score),
              escapeMarkdownTableCell(
                formatStageLabel(candidate.stage, locale) ?? "N/A",
              ),
              escapeMarkdownTableCell(candidate.jobTitle ?? "N/A"),
              escapeMarkdownTableCell(skills || notProvided),
              escapeMarkdownTableCell(candidate.experience ?? notProvided),
              escapeMarkdownTableCell(languages || notProvided),
            ]
          : [
              String(index + 1),
              escapeMarkdownTableCell(candidate.name),
              formatScore(candidate.score),
              escapeMarkdownTableCell(skills || notProvided),
              escapeMarkdownTableCell(candidate.experience ?? notProvided),
              escapeMarkdownTableCell(languages || notProvided),
            ];
        return cells.join(" | ");
      })
      .map((row) => `| ${row} |`),
  ].join("\n");

  const evidenceLines = rows.slice(0, 3).map((candidate, index) => {
    const evidence = candidate.evidence.slice(0, 2).join(", ");
    return `${index + 1}. **${candidate.name}** — ${candidate.sourceTools.join(", ")}${evidence ? ` (${evidence})` : ""}.`;
  });

  if (locale === "fr") {
    const intro = isRanking
      ? `J'ai trouve ${rows.length} profil${rows.length === 1 ? "" : "s"} candidat${rows.length === 1 ? "" : "s"} fonde${rows.length === 1 ? "" : "s"} sur les donnees. Ma premiere lecture place **${topCandidate.name}** en tete avec **${scoreText}**.`
      : `**${topCandidate.name}** est **${fitLabel}** a **${scoreText}**, d'apres les preuves de recrutement disponibles.`;

    return [
      isRanking ? "## Lecture de la shortlist" : "## Lecture du candidat",
      intro,
      "",
      "### Mon analyse",
      `Je recommande de ${recommendation}.`,
      "",
      "### Points saillants",
      `- **Competences** : ${topSkills || "Aucune competence n'a ete extraite des donnees CV disponibles."}`,
      `- **Signal d'experience** : ${topCandidate.experience ?? "Non fourni dans les donnees consultees."}`,
      `- **Langues** : ${topLanguages || "Non fournies dans les donnees consultees."}`,
      "",
      "### Risques et informations manquantes",
      `- ${
        typeof topScore === "number" && topScore < 60
          ? `Le score est de **${scoreText}** ; je ne traiterais donc pas ce profil comme une shortlist automatique.`
          : "Le score doit encore etre verifie par rapport aux exigences exactes du poste."
      }`,
      `- ${
        topCandidate.stage
          ? `L'etape actuelle est **${formatStageLabel(topCandidate.stage, locale)}** ; choisissez l'action suivante qui fait avancer ce workflow, pas une action generique du pool CV.`
          : "Les donnees CV analysees peuvent manquer de contexte ; validez les competences indispensables pendant la preselection."
      }`,
      "- Les champs manquants restent des limites ; ne deduisez pas une experience, des langues ou des resultats d'entretien caches.",
      "",
      "### Tableau de decision",
      table,
      "",
      "### Preuves",
      ...evidenceLines,
    ].join("\n");
  }

  const intro = isRanking
    ? `I found ${rows.length} grounded candidate profile${rows.length === 1 ? "" : "s"}. My first read puts **${topCandidate.name}** on top at **${scoreText}**.`
    : `**${topCandidate.name}** looks like **${fitLabel}** at **${scoreText}** based on the available recruitment evidence.`;

  return [
    isRanking ? "## Shortlist read" : "## Candidate read",
    intro,
    "",
    "### My take",
    `I would ${recommendation}.`,
    "",
    "### What stands out",
    `- **Skills**: ${topSkills || "No skills were parsed from the available CV data."}`,
    `- **Experience signal**: ${topCandidate.experience ?? "Not provided in the fetched data."}`,
    `- **Languages**: ${topLanguages || "Not provided in the fetched data."}`,
    "",
    "### Risks / missing info",
    `- ${
      typeof topScore === "number" && topScore < 60
        ? `The score is **${scoreText}**, so I would not treat this as an automatic shortlist.`
        : "The score should still be checked against the exact job requirements."
    }`,
    `- ${
      topCandidate.stage
        ? `Current stage is **${formatStageLabel(topCandidate.stage, locale)}**; choose the next action that moves this workflow, not a generic CV-pool action.`
        : "Parsed CV data can miss context, so validate the must-have skills in screening."
    }`,
    "- Missing fields stay caveats; do not infer hidden experience, languages, or interview outcomes.",
    "",
    "### Decision table",
    table,
    "",
    "### Evidence",
    ...evidenceLines,
  ].join("\n");
}

export function maskUserIdForTelemetry(userId: string): string {
  const raw = String(userId ?? "");
  if (raw.length <= 8) return "[masked]";
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function extractCandidatesFromToolData(
  toolName: string,
  data: unknown,
): GroundedCandidate[] {
  if (!data) return [];

  if (toolName === "list_cv_pool" || toolName === "search_cv_pool") {
    return Array.isArray(data)
      ? data.flatMap((item) => candidateFromCvPoolItem(item, toolName))
      : [];
  }

  if (toolName === "semantic_search_cvs" && isRecord(data)) {
    const results = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((item) => candidateFromSearchItem(item, toolName));
  }

  if (toolName === "rag_search_cvs" && isRecord(data)) {
    const candidates: GroundedCandidate[] = [];
    const citations = Array.isArray(data.citations) ? data.citations : [];
    const chunks = Array.isArray(data.chunks) ? data.chunks : [];

    for (const citation of citations) {
      candidates.push(...candidateFromRagCitation(citation, toolName));
    }

    for (const chunk of chunks) {
      candidates.push(...candidateFromSearchItem(chunk, toolName));
    }

    return candidates;
  }

  if (
    toolName === "match_cvs_to_job" ||
    toolName === "match_cvs_to_job_with_filters" ||
    toolName === "hybrid_search_cvs"
  ) {
    return Array.isArray(data)
      ? data.flatMap((item) => candidateFromSearchItem(item, toolName))
      : [];
  }

  if (toolName === "get_candidates_by_stage" || toolName === "get_candidates_by_job") {
    return Array.isArray(data)
      ? data.flatMap((item) => candidateFromPipelineItem(item, toolName))
      : [];
  }

  if (toolName === "get_candidate") {
    return candidateFromPipelineItem(data, toolName);
  }

  if (toolName === "compare_candidates" && isRecord(data)) {
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    return candidates.flatMap((item) =>
      candidateFromComparisonItem(item, toolName),
    );
  }

  if (toolName === "direct_named_search" && isRecord(data)) {
    const results = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((result) => {
      if (!isRecord(result)) return [];
      const profileCandidates = candidateFromProfileItem(
        result.profile,
        toolName,
        readNumberField(result, ["combinedScore", "nameScore", "roleScore"]),
      );
      return profileCandidates;
    });
  }

  if (toolName === "direct_compare_candidates" && isRecord(data)) {
    const profiles = Array.isArray(data.comparedCandidates)
      ? data.comparedCandidates
      : [];
    return profiles.flatMap((profile) =>
      candidateFromProfileItem(profile, toolName),
    );
  }

  return [];
}

function candidateFromCvPoolItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "extractedName",
    "candidateName",
    "fullName",
  ]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId", "id"]),
      candidateId: readStringField(value, ["candidateId"]),
      score: readNumberField(value, ["score", "matchScore", "similarityScore"]),
      skills: readStringArrayField(value, [
        "extractedSkills",
        "candidateSkills",
        "matchedMustHave",
      ]),
      languages: readStringArrayField(value, [
        "extractedLanguages",
        "candidateLanguages",
      ]),
      experience: formatExperience(value),
      evidence: ["CV pool result"],
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromSearchItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "candidateName",
    "extractedName",
    "fullName",
    "name",
  ]);
  if (!isUsableCandidateName(name)) return [];

  const matchedSkills = [
    ...readStringArrayField(value, ["matchedMustHave", "matchedNiceToHave"]),
    ...readStringArrayField(value, ["extractedSkills", "candidateSkills"]),
  ];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId", "id"]),
      candidateId: readStringField(value, ["candidateId"]),
      score: readNumberField(value, [
        "matchScore",
        "similarityScore",
        "rrfScore",
        "score",
        "finalScore",
      ]),
      skills: uniqueStrings(matchedSkills),
      languages: readStringArrayField(value, [
        "extractedLanguages",
        "candidateLanguages",
        "languages",
      ]),
      experience: formatExperience(value),
      evidence: buildEvidence(value),
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromRagCitation(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, ["candidateName", "name"]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId"]),
      candidateId: readStringField(value, ["candidateId"]),
      skills: [],
      languages: [],
      experience: undefined,
      evidence: readStringArrayField(value, ["sections"]).map(
        (section) => `matched ${section}`,
      ),
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromPipelineItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "fullName",
    "candidateName",
    "displayName",
    "extractedName",
    "name",
  ]);
  if (!isUsableCandidateName(name)) return [];

  const stage = readStringField(value, ["stage", "candidateStage", "status"]);
  const jobTitle = readStringField(value, ["jobTitle", "title"]);
  const evidence = [
    stage ? `stage: ${formatStageLabel(stage)}` : undefined,
    jobTitle ? `job: ${jobTitle}` : undefined,
  ].filter((item): item is string => Boolean(item));

  return [
    {
      name,
      cvId: readStringField(value, ["cvId"]),
      candidateId: readStringField(value, ["candidateId", "id"]),
      score: readNumberField(value, [
        "matchScore",
        "screeningScore",
        "score",
        "overallFit",
      ]),
      stage,
      jobTitle,
      owner: readCandidateOwner(value),
      createdAt: readDateField(value, ["createdAt", "updatedAt"]),
      skills: readStringArrayField(value, [
        "skills",
        "extractedSkills",
        "candidateSkills",
        "matchedMustHave",
        "matchedNiceToHave",
      ]),
      languages: readStringArrayField(value, [
        "languages",
        "extractedLanguages",
        "candidateLanguages",
      ]),
      experience: formatExperience(value),
      evidence: evidence.length > 0 ? evidence : ["candidate pipeline result"],
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromComparisonItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, ["name", "candidateName", "fullName"]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId"]),
      candidateId: readStringField(value, ["candidateId", "id"]),
      score: readNumberField(value, ["overallFit", "score", "screeningScore"]),
      skills: [],
      languages: [],
      experience: undefined,
      evidence: ["comparison result"],
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromProfileItem(
  value: unknown,
  sourceTool: string,
  score?: number,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "displayName",
    "candidateName",
    "fullName",
    "extractedName",
    "name",
  ]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId", "id"]),
      candidateId: readStringField(value, ["candidateId"]),
      score,
      skills: readStringArrayField(value, ["skills", "extractedSkills"]),
      languages: readStringArrayField(value, [
        "languages",
        "extractedLanguages",
      ]),
      experience: formatExperience(value),
      evidence: ["deterministic search result"],
      sourceTools: [sourceTool],
    },
  ];
}

function mergeCandidate(
  byIdentity: Map<string, GroundedCandidate>,
  candidate: GroundedCandidate,
): void {
  const key = candidate.candidateId
    ? `candidate:${candidate.candidateId}`
    : candidate.cvId
      ? `cv:${candidate.cvId}`
      : `name:${normalizeCandidateName(candidate.name)}`;

  const existing = byIdentity.get(key);
  if (!existing) {
    byIdentity.set(key, {
      ...candidate,
      skills: uniqueStrings(candidate.skills),
      languages: uniqueStrings(candidate.languages),
      evidence: uniqueStrings(candidate.evidence),
      sourceTools: uniqueStrings(candidate.sourceTools),
    });
    return;
  }

  existing.score = Math.max(existing.score ?? -1, candidate.score ?? -1);
  if (existing.score < 0) existing.score = undefined;
  existing.stage = existing.stage ?? candidate.stage;
  existing.jobTitle = existing.jobTitle ?? candidate.jobTitle;
  existing.owner = existing.owner ?? candidate.owner;
  existing.createdAt = existing.createdAt ?? candidate.createdAt;
  existing.skills = uniqueStrings([...existing.skills, ...candidate.skills]);
  existing.languages = uniqueStrings([
    ...existing.languages,
    ...candidate.languages,
  ]);
  existing.evidence = uniqueStrings([
    ...existing.evidence,
    ...candidate.evidence,
  ]);
  existing.sourceTools = uniqueStrings([
    ...existing.sourceTools,
    ...candidate.sourceTools,
  ]);
  existing.experience = existing.experience ?? candidate.experience;
}

function mergeScreeningSignalsFromToolData(
  byIdentity: Map<string, GroundedCandidate>,
  toolName: string,
  data: unknown,
): void {
  if (toolName !== "get_screening") return;

  const items = Array.isArray(data) ? data : [data];
  for (const item of items) {
    if (!isRecord(item)) continue;

    const candidate = findCandidateByIdentity(byIdentity, {
      candidateId: readStringField(item, ["candidateId"]),
      cvId: readStringField(item, ["cvId"]),
    });
    if (!candidate) continue;

    const score = readNumberField(item, ["score", "screeningScore"]);
    if (typeof score === "number") {
      candidate.score = Math.max(candidate.score ?? -1, score);
      if (candidate.score < 0) candidate.score = undefined;
    }

    candidate.skills = uniqueStrings([
      ...candidate.skills,
      ...readStringArrayField(item, ["matchedMustHave", "matchedNiceToHave"]),
    ]);
    candidate.evidence = uniqueStrings([
      score === undefined ? undefined : `screening score: ${formatScore(score)}`,
      readStringField(item, ["aiSummary"]),
      ...candidate.evidence,
    ].filter((value): value is string => Boolean(value)));
    candidate.sourceTools = uniqueStrings([...candidate.sourceTools, toolName]);
  }
}

function findCandidateByIdentity(
  byIdentity: Map<string, GroundedCandidate>,
  identity: { candidateId?: string; cvId?: string },
): GroundedCandidate | undefined {
  for (const candidate of byIdentity.values()) {
    if (identity.candidateId && candidate.candidateId === identity.candidateId) {
      return candidate;
    }
    if (identity.cvId && candidate.cvId === identity.cvId) {
      return candidate;
    }
  }

  return undefined;
}

function compareCandidatePriority(
  left: GroundedCandidate,
  right: GroundedCandidate,
): number {
  const leftScore = normalizeScore(left.score);
  const rightScore = normalizeScore(right.score);

  if (typeof leftScore === "number" || typeof rightScore === "number") {
    return (rightScore ?? -1) - (leftScore ?? -1);
  }

  const leftTime = parseDateMs(left.createdAt);
  const rightTime = parseDateMs(right.createdAt);
  if (typeof leftTime === "number" && typeof rightTime === "number") {
    return leftTime - rightTime;
  }

  return left.name.localeCompare(right.name);
}


function extractCandidateLikeNames(
  text: string,
  options: { broad?: boolean },
): string[] {
  const found = new Set<string>();

  for (const name of extractCandidateNamesFromMarkdownTables(text)) {
    addDetectedName(found, name);
  }

  for (const name of extractCandidateNamesFromHeadings(text)) {
    addDetectedName(found, name);
  }

  for (const name of extractCandidateNamesFromBoldText(text)) {
    addDetectedName(found, name);
  }

  for (const name of extractCandidateNamesFromPersonContexts(text)) {
    addDetectedName(found, name);
  }

  if (options.broad) {
    for (const match of text.matchAll(BROAD_NAME_RE)) {
      addDetectedName(found, match[0]);
    }
  }

  return Array.from(found);
}

function extractCandidateNamesFromMarkdownTables(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const names: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) continue;

    const headers = splitMarkdownTableRow(line).map((cell) =>
      normalizeCandidateNameLoose(cell),
    );
    const nameColumnIndex = headers.findIndex(
      (header) => header === "name" || header === "candidate",
    );

    if (nameColumnIndex === -1) continue;

    for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex++) {
      const row = lines[rowIndex];
      if (!row.trim().startsWith("|")) break;
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(row)) {
        continue;
      }

      const cells = splitMarkdownTableRow(row);
      const candidateCell = cells[nameColumnIndex];
      if (candidateCell) names.push(candidateCell);
    }
  }

  return names;
}

function extractCandidateNamesFromHeadings(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^#{2,5}\s+(.+)$/)?.[1])
    .filter((line): line is string => Boolean(line))
    .map(cleanDetectedName)
    .filter((line) => BROAD_NAME_RE.test(resetRegex(line)));
}

function extractCandidateNamesFromBoldText(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const cleaned = cleanDetectedName(match[1]);
    if (looksLikePersonName(cleaned)) names.push(cleaned);
  }
  return names;
}

function extractCandidateNamesFromPersonContexts(text: string): string[] {
  const names: string[] = [];
  const contextPatterns = [
    /\b(?:candidate|profile|resume|cv)\s+(?:called|named)?\s*([A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+){1,3})\b/g,
    /\b([A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+){1,3})\s+(?:ranks|ranked|scores|scored|matches|appears|should|has)\b/g,
  ];

  for (const pattern of contextPatterns) {
    for (const match of text.matchAll(pattern)) {
      names.push(cleanDetectedName(match[1]));
    }
  }

  return names;
}

function addDetectedName(found: Set<string>, rawName: string): void {
  const cleaned = cleanDetectedName(rawName);
  if (!isUsableCandidateName(cleaned)) return;

  const normalized = normalizeCandidateName(cleaned);
  if (NON_PERSON_PHRASES.has(normalized)) return;

  found.add(cleaned);
}

function isAllowedCandidateName(
  name: string,
  allowedCandidates: AllowedCandidateSet,
): boolean {
  const normalized = normalizeCandidateName(name);
  const loose = normalizeCandidateNameLoose(name);

  return (
    allowedCandidates.normalizedNames.has(normalized) ||
    allowedCandidates.punctuationInsensitiveNames.has(loose)
  );
}

function isUsableCandidateName(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const normalized = normalizeCandidateName(value);
  if (!normalized || PLACEHOLDER_NAMES.has(normalized)) return false;

  return normalized.length >= 2;
}

function looksLikePersonName(value: string): boolean {
  const cleaned = cleanDetectedName(value);
  BROAD_NAME_RE.lastIndex = 0;
  return BROAD_NAME_RE.test(cleaned);
}

function cleanDetectedName(value: string): string {
  return String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/[`_[\]]/g, "")
    .replace(/\([^)]*\)/g, "")
    .split(/\s+[—–-]\s+|:|\|/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function resetRegex(value: string): string {
  BROAD_NAME_RE.lastIndex = 0;
  return value;
}

function buildEvidence(value: Record<string, unknown>): string[] {
  const evidence: string[] = [];

  const sectionType = readStringField(value, ["sectionType"]);
  if (sectionType) evidence.push(`matched ${sectionType}`);

  const matchedMustHave = readStringArrayField(value, ["matchedMustHave"]);
  if (matchedMustHave.length > 0) {
    evidence.push(`matched must-have: ${safeList(matchedMustHave, 3)}`);
  }

  const matchedNiceToHave = readStringArrayField(value, ["matchedNiceToHave"]);
  if (matchedNiceToHave.length > 0) {
    evidence.push(`matched nice-to-have: ${safeList(matchedNiceToHave, 3)}`);
  }

  return evidence.length > 0 ? evidence : ["tool result"];
}

function formatExperience(value: Record<string, unknown>): string | undefined {
  const explicitCount = readNumberField(value, [
    "experienceCount",
    "extractedExperiences",
    "extractedExperienceCount",
  ]);

  if (typeof explicitCount === "number") {
    return `${Math.round(explicitCount)} experience entr${Math.round(explicitCount) === 1 ? "y" : "ies"}`;
  }

  const experiences = value.experiences ?? value.extractedExperiences;
  if (Array.isArray(experiences)) {
    return `${experiences.length} experience entr${experiences.length === 1 ? "y" : "ies"}`;
  }

  return undefined;
}

function readCandidateOwner(value: Record<string, unknown>): string | undefined {
  const namedOwner = readStringField(value, [
    "ownerName",
    "assignedToName",
    "assignedManagerName",
    "assignedHrName",
    "assignedByName",
  ]);
  if (namedOwner) return namedOwner;
  if (readStringField(value, ["assignedHrId"])) return "hr";
  if (readStringField(value, ["assignedManagerId"])) return "manager";
  if (readStringField(value, ["assignedBy"])) return "ta";
  return undefined;
}

function formatOwnerLabel(
  owner: string | undefined,
  locale: "en" | "fr",
): string | undefined {
  if (!owner) return undefined;
  if (owner === "ta") return locale === "fr" ? "Responsable TA" : "TA assignee";
  if (owner === "manager") {
    return locale === "fr" ? "Manager assigne" : "Manager assignee";
  }
  if (owner === "hr") return locale === "fr" ? "Responsable RH" : "HR assignee";
  return owner;
}

function normalizeScore(score: number | undefined): number | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  return score > 0 && score <= 1 ? score * 100 : score;
}

function formatScore(score: number | undefined): string {
  const normalizedScore = normalizeScore(score);
  if (typeof normalizedScore !== "number") return "N/A";
  return `${Math.round(normalizedScore)}%`;
}

function formatStageLabel(
  stage: string | undefined,
  locale: "en" | "fr" = "en",
): string | undefined {
  if (!stage) return undefined;

  if (locale === "fr") {
    const labels: Readonly<Record<string, string>> = {
      new: "Nouveau",
      ta_screening: "Preselection TA",
      ta_interview: "Entretien TA",
      ta_accepted: "Accepte par TA",
      ta_rejected: "Refuse par TA",
      manager_interview: "Entretien manager",
      manager_accepted: "Accepte par le manager",
      manager_rejected: "Refuse par le manager",
      hr_interview: "Entretien RH",
      hr_accepted: "Accepte par les RH",
      hr_rejected: "Refuse par les RH",
      hired: "Embauche",
    };
    const localized = labels[stage.toLowerCase()];
    if (localized) return localized;
  }

  const acronyms = new Map([
    ["ai", "AI"],
    ["cv", "CV"],
    ["hr", "HR"],
    ["ta", "TA"],
  ]);

  return stage
    .split("_")
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      return acronyms.get(lower) ?? lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function safeList(values: string[], limit: number): string {
  return uniqueStrings(values).slice(0, limit).join(", ");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function readStringField(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const nestedValue = value[key];
    if (typeof nestedValue === "string" && nestedValue.trim()) {
      return nestedValue.trim();
    }
  }

  return undefined;
}

function readNumberField(
  value: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const nestedValue = value[key];

    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      return nestedValue;
    }

    if (Array.isArray(nestedValue)) {
      return nestedValue.length;
    }

    if (typeof nestedValue === "string" && nestedValue.trim()) {
      const parsed = Number(nestedValue);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function readDateField(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const nestedValue = value[key];
    if (nestedValue instanceof Date) {
      return nestedValue.toISOString();
    }
    if (typeof nestedValue === "string" && Number.isFinite(Date.parse(nestedValue))) {
      return nestedValue;
    }
  }

  return undefined;
}

function parseDateMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readStringArrayField(
  value: Record<string, unknown>,
  keys: string[],
): string[] {
  const result: string[] = [];

  for (const key of keys) {
    const nestedValue = value[key];
    if (!Array.isArray(nestedValue)) continue;

    for (const item of nestedValue) {
      if (typeof item === "string" && item.trim()) {
        result.push(item.trim());
      }
    }
  }

  return uniqueStrings(result);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeCandidateNameLoose(value);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
