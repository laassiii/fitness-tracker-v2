import { ApiError } from "./auth";
import { database, type Identity } from "./database";
import type { Env } from "./index";
import { upstream } from "./upstream";
export interface LegalDocument {
  document_type: "terms" | "privacy";
  version: string;
  content: string;
  content_hash: string;
}
export async function documents(env: Env): Promise<LegalDocument[]> {
  const response = await upstream(
    env,
    `${env.SUPABASE_URL}/rest/v1/legal_document_versions?is_current=eq.true&select=document_type,version,content,content_hash&order=document_type`,
    {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new ApiError(
      503,
      "legal_unavailable",
      "Legal documents are unavailable",
    );
  const docs = (await response.json()) as LegalDocument[];
  if (docs.length !== 2)
    throw new ApiError(
      503,
      "legal_unavailable",
      "Legal documents are unavailable",
    );
  return docs;
}
export function acceptance(
  body: Record<string, unknown>,
  docs: LegalDocument[],
) {
  const versions = body.versions as Record<string, unknown> | undefined;
  if (
    body.accepted !== true ||
    !versions ||
    typeof versions !== "object" ||
    Array.isArray(versions) ||
    Object.keys(versions).length !== 2 ||
    docs.some((d) => versions[d.document_type] !== d.version)
  )
    throw new ApiError(
      422,
      "consent_required",
      "Accept the current Terms and Privacy Policy",
    );
}
export async function consentStatus(env: Env, user: Identity) {
  const docs = await documents(env);
  const records = (await database(
    env,
    user,
    `consent_acceptances?user_id=eq.${user.id}&select=document_type,document_version,accepted_at`,
  )) as {
    document_type: string;
    document_version: string;
    accepted_at: string;
  }[];
  return {
    documents: docs,
    records,
    accepted: docs.every((d) =>
      records.some(
        (r) =>
          r.document_type === d.document_type &&
          r.document_version === d.version,
      ),
    ),
  };
}

// Fitness routing needs current version acceptance, not full legal text/history.
// Both reads still occur on every request; nothing is cached across requests.
export async function hasCurrentConsent(env: Env, user: Identity) {
  const [docs, records] = (await Promise.all([
    database(
      env,
      user,
      "legal_document_versions?is_current=eq.true&select=document_type,version",
    ),
    database(
      env,
      user,
      `consent_acceptances?user_id=eq.${user.id}&select=document_type,document_version`,
    ),
  ])) as [
    { document_type: string; version: string }[],
    { document_type: string; document_version: string }[],
  ];
  if (docs.length !== 2)
    throw new ApiError(
      503,
      "legal_unavailable",
      "Legal documents are unavailable",
    );
  return docs.every((d) =>
    records.some(
      (r) =>
        r.document_type === d.document_type && r.document_version === d.version,
    ),
  );
}
