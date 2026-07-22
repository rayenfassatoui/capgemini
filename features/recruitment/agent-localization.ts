export type AgentLocale = "en" | "fr";

const FR_EVIDENCE_TEXT: Readonly<Record<string, string>> = {
  "Recommendations are synthesized from the observed sources above; they are not separate database facts.":
    "Les recommandations sont synthetisees a partir des sources observees ci-dessus ; elles ne constituent pas des faits distincts de la base de donnees.",
  "No row-level evidence was returned, so conclusions should stay at summary level.":
    "Aucune preuve au niveau des lignes n'a ete retournee ; les conclusions doivent rester au niveau du resume.",
  "No role-scoped source was fetched for this response.":
    "Aucune source limitee au role n'a ete consultee pour cette reponse.",
  "No successful live recruitment source was available, so the answer must stay limited to the user prompt and role rules.":
    "Aucune source de recrutement en direct n'etait disponible ; la reponse reste limitee a la requete et aux regles du role.",
  "Fetch a concrete CV, job, candidate, or analytics source before making a hiring recommendation.":
    "Consultez un CV, un poste, un candidat ou une source analytique avant toute recommandation de recrutement.",
  "Update recruitment workflow state. This action can change recruitment data and needs your explicit confirmation.":
    "Mettre a jour l'etat du workflow de recrutement. Cette action peut modifier les donnees de recrutement et requiert votre confirmation explicite.",
};

const FR_TOOL_NAMES: Readonly<Record<string, string>> = {
  upload_cv: "Televerser un CV",
  delete_cv: "Supprimer un CV",
  create_job: "Creer un poste",
  close_job: "Cloturer un poste",
  save_job_as_template: "Enregistrer le poste comme modele",
  create_job_from_template: "Creer un poste depuis un modele",
  update_candidate_stage: "Mettre a jour l'etape du candidat",
  bulk_update_candidate_stage: "Mettre a jour les etapes des candidats",
  assign_cv_to_job: "Associer un CV a un poste",
  assign_manager: "Assigner un manager",
  assign_hr: "Assigner les RH",
  schedule_interview: "Planifier un entretien",
  cancel_interview: "Annuler un entretien",
  create_interview_report: "Creer un rapport d'entretien",
  send_interview_invite_email: "Envoyer l'invitation a l'entretien",
  send_rejection_email: "Envoyer l'e-mail de refus",
  mark_notification_read: "Marquer la notification comme lue",
  mark_all_notifications_read: "Marquer toutes les notifications comme lues",
  toggle_onboarding_task: "Basculer la tache d'integration",
  add_onboarding_task: "Ajouter une tache d'integration",
  list_jobs: "Liste des postes",
  get_candidates_by_stage: "Candidats par etape",
  get_candidates_by_job: "Candidats du poste",
  get_candidate: "Profil candidat",
  get_candidate_details: "Details du candidat",
  get_screening: "Rapport de preselection",
  list_cv_pool: "Pool CV",
  search_cv_pool: "Recherche dans le pool CV",
  semantic_search_cvs: "Recherche semantique de CV",
  rag_search_cvs: "Recherche documentaire de CV",
  compare_candidates: "Comparer les candidats",
  get_dashboard_stats: "Statistiques du tableau de bord",
  get_smart_insights: "Analyses intelligentes",
  get_cv_pool_stats: "Statistiques du pool CV",
  get_jobs_stats: "Statistiques des postes",
};

const FR_SOURCE_LABELS: Readonly<Record<string, string>> = {
  "CV similarity search": "Recherche de CV similaires",
  "CV knowledge search": "Recherche dans les connaissances CV",
  "Job-fit CV search": "Recherche de CV adaptes au poste",
  "CV pool search": "Recherche dans le pool CV",
  "CV pool": "Pool CV",
  "CV profile details": "Details du profil CV",
  "Candidate stage list": "Liste des candidats par etape",
  "Job candidate list": "Liste des candidats du poste",
  "Candidate profile": "Profil candidat",
  "Candidate comparison": "Comparaison des candidats",
  "Named candidate search": "Recherche de candidat par nom",
  "Job match scoring": "Score d'adequation au poste",
  "Filtered job match scoring": "Score d'adequation filtre au poste",
  "Recruitment dashboard": "Tableau de bord du recrutement",
  "Recruitment insights": "Analyses du recrutement",
  "CV pool analytics": "Analyse du pool CV",
  "Job analytics": "Analyse des postes",
  "List Jobs": "Liste des postes",
  "Get Screening": "Rapport de preselection",
};

export function localizeAgentEvidenceText(
  text: string,
  locale: AgentLocale,
): string {
  if (locale === "en") return text;

  const exact = FR_EVIDENCE_TEXT[text];
  if (exact) return exact;

  const returnedItems = text.match(
    /^(.*?) returned \((\d+) items?\) — (\d+) accessible records?\.$/,
  );
  if (returnedItems) {
    const source = localizeAgentSourceLabel(returnedItems[1], locale);
    return `${source} a retourne ${returnedItems[2]} element${returnedItems[2] === "1" ? "" : "s"} — ${returnedItems[3]} enregistrement${returnedItems[3] === "1" ? "" : "s"} accessible${returnedItems[3] === "1" ? "" : "s"}.`;
  }

  const roleScoped = text.match(/^(.*?) returned — Role-scoped tool output\.$/);
  if (roleScoped) {
    return `${localizeAgentSourceLabel(roleScoped[1], locale)} a retourne un resultat limite au role.`;
  }

  const failedSource = text.match(/^(.*?) failed — (.*?)\.?$/);
  if (failedSource) {
    const rawDetail = failedSource[2].replace(/\.$/, "");
    const detail =
      rawDetail === "Candidate not found or not accessible"
        ? "Candidat introuvable ou inaccessible"
        : rawDetail;
    return `${localizeAgentSourceLabel(failedSource[1], locale)} a echoue — ${detail}.`;
  }

  return text;
}

export function localizeAgentToolName(
  toolName: string,
  locale: AgentLocale,
): string {
  if (locale === "fr") {
    const localized = FR_TOOL_NAMES[toolName];
    if (localized) return localized;
  }

  return toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function localizeAgentSourceLabel(
  label: string,
  locale: AgentLocale,
): string {
  return locale === "fr" ? (FR_SOURCE_LABELS[label] ?? label) : label;
}
