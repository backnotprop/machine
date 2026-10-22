// Provider catalog: the few providers the hosted credential store knows, as data.
// Two kinds cover every example machine: `static` (the member pastes fields) and `oauth` (the member authorises).
// URLs for GitHub are copied by hand from Nango's providers.yaml (github, github-app). No plugins, no YAML.
// Templates use ${field} with the field names of the secret JSON; oauth providers always have ${token}.

export type ProviderKind = "static" | "oauth";
export interface ProviderField { id: string; label: string; secret?: boolean; optional?: boolean }
export interface Provider {
  kind: ProviderKind;
  name: string;
  /** static: the fields the connect form asks for and the secret JSON stores */
  fields?: ProviderField[];
  /** oauth: where to send the member and where to exchange the code; ${app_public_link} and ${installation_id} are filled by the server */
  authorize_url?: string;
  token_url?: string;
  scope_separator?: string;
  /** the `request` tool: method base_url + path, with this header. `http` has no base_url; the slot declaration supplies it. aws has no proxy (SigV4), only the lease */
  proxy?: { base_url?: string; header: string };
  /** what `machine run` puts in the child process. env: name → template. file: a 0600 temp file whose path goes in env[file.env]. slot_env: MACHINE_<SLOT>_<FIELD> for every field */
  inject: { env?: Record<string, string>; file?: { name: string; content: string; env: string }; slot_env?: boolean };
  /** run after save to confirm the credential works and learn the account; `account` is the field of the JSON response (or command output) to show */
  verify?: { method: string; path: string; account?: string } | { command: string[]; account?: string };
  /** the commands this credential is for; shown on the state card as `machine run <run_id> -- <cli>` */
  cli?: string;
}

const gitHelper = "!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f";
const githubInject = { env: { GH_TOKEN: "${token}", GITHUB_TOKEN: "${token}", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: gitHelper } };

export const providers = {
  github: {
    kind: "static", name: "GitHub",
    fields: [{ id: "token", label: "Personal access token (fine-grained, with the repositories the machine touches)", secret: true }],
    proxy: { base_url: "https://api.github.com", header: "Authorization: Bearer ${token}" },
    inject: githubInject,
    verify: { method: "GET", path: "/user", account: "login" },
    cli: "gh … / git push …",
  },
  "github-app": {
    kind: "oauth", name: "GitHub App",
    // Nango github-app: authorization_url ${connectionConfig.appPublicLink}/installations/new,
    // token_url https://api.github.com/app/installations/${connectionConfig.installation_id}/access_tokens.
    // The stored secret is { installation_id }; ${token} is an installation token minted with MACHINE_GITHUB_APP_KEY, good for one hour.
    authorize_url: "${app_public_link}/installations/new",
    token_url: "https://api.github.com/app/installations/${installation_id}/access_tokens",
    scope_separator: ",",
    proxy: { base_url: "https://api.github.com", header: "Authorization: Bearer ${token}" },
    inject: githubInject,
    verify: { method: "GET", path: "/installation/repositories" }, // account comes from the installation callback, not from verify
    cli: "gh … / git push …",
  },
  npm: {
    kind: "static", name: "npm",
    fields: [{ id: "token", label: "Access token (granular, publish)", secret: true }],
    proxy: { base_url: "https://registry.npmjs.org", header: "Authorization: Bearer ${token}" },
    inject: { file: { name: ".npmrc", content: "//registry.npmjs.org/:_authToken=${token}\n", env: "NPM_CONFIG_USERCONFIG" } },
    verify: { method: "GET", path: "/-/whoami", account: "username" },
    cli: "npm publish",
  },
  aws: {
    kind: "static", name: "AWS",
    fields: [
      { id: "access_key_id", label: "Access key id" },
      { id: "secret_access_key", label: "Secret access key", secret: true },
      { id: "session_token", label: "Session token (temporary credentials only)", secret: true, optional: true },
    ],
    inject: { env: { AWS_ACCESS_KEY_ID: "${access_key_id}", AWS_SECRET_ACCESS_KEY: "${secret_access_key}", AWS_SESSION_TOKEN: "${session_token}" } },
    verify: { command: ["aws", "sts", "get-caller-identity"], account: "Account" },
    cli: "aws …",
  },
  basic: {
    kind: "static", name: "Username and password",
    fields: [{ id: "username", label: "Username" }, { id: "password", label: "Password", secret: true }],
    proxy: { header: "Authorization: Basic ${base64(username:password)}" },
    inject: { slot_env: true },
    cli: "curl -u \"$MACHINE_<SLOT>_USERNAME:$MACHINE_<SLOT>_PASSWORD\" …",
  },
  http: {
    kind: "static", name: "Bearer token",
    fields: [{ id: "token", label: "Token", secret: true }],
    proxy: { header: "Authorization: Bearer ${token}" },
    inject: { slot_env: true },
    cli: "curl -H \"Authorization: Bearer $MACHINE_<SLOT>_TOKEN\" …",
  },
} satisfies Record<string, Provider>;

export type ProviderId = keyof typeof providers;
export const provider = (id: string): Provider | undefined => (providers as Record<string, Provider>)[id];

/** Fill a ${field} template from the secret fields. Returns undefined when a referenced field is absent (optional fields). */
export function fill(template: string, fields: Record<string, string | undefined>): string | undefined {
  let missing = false;
  const out = template.replace(/\$\{base64\((\w+):(\w+)\)\}|\$\{(\w+)\}/g, (_, u, p, k) => {
    if (u) { if (fields[u] === undefined || fields[p] === undefined) missing = true; return Buffer.from(`${fields[u]}:${fields[p]}`).toString("base64"); }
    if (fields[k] === undefined) { missing = true; return ""; }
    return fields[k]!;
  });
  return missing ? undefined : out;
}

/** The environment `machine run` adds for one leased slot: env vars, plus temp files to write (0600) and point at. */
export function injection(providerId: string, slot: string, fields: Record<string, string | undefined>) {
  const p = provider(providerId);
  if (!p) throw new Error(`unknown provider "${providerId}"`);
  const env: Record<string, string> = {};
  const files: { name: string; content: string; env: string }[] = [];
  for (const [k, t] of Object.entries(p.inject.env ?? {})) { const v = fill(t, fields); if (v !== undefined) env[k] = v; }
  if (p.inject.file) { const content = fill(p.inject.file.content, fields); if (content !== undefined) files.push({ ...p.inject.file, content }); }
  if (p.inject.slot_env) for (const [k, v] of Object.entries(fields)) if (v !== undefined) env[`MACHINE_${slot}_${k}`.toUpperCase().replace(/[^A-Z0-9]/g, "_")] = v;
  return { env, files };
}
