// Characterization scenarios for the NC-brand email templates. Inputs cover
// the realistic link shape (with & separators) and the escaping edge case.
// The expected file is generated FROM these scenarios — keep them in sync.

export const CHARACTERIZATION_SCENARIOS = [
  {
    name: "invite-marco",
    kind: "invite" as const,
    input: {
      firstName: "Marco",
      actionLink:
        "https://xgxtplqlewpqjzghvbke.supabase.co/auth/v1/verify?token=abc123&type=invite&redirect_to=https://nc-performace-mu.vercel.app",
    },
  },
  {
    name: "invite-escape",
    kind: "invite" as const,
    input: {
      firstName: "D'Angelo <script>",
      actionLink: "https://example.test/verify?token=t&x=1",
    },
  },
  {
    name: "recovery",
    kind: "recovery" as const,
    input: {
      firstName: "",
      actionLink:
        "https://xgxtplqlewpqjzghvbke.supabase.co/auth/v1/verify?token=xyz789&type=recovery&redirect_to=https://nc-performace-mu.vercel.app",
    },
  },
  {
    name: "login-link",
    kind: "login-link" as const,
    input: {
      firstName: "",
      code: "482915",
      actionLink:
        "https://xgxtplqlewpqjzghvbke.supabase.co/auth/v1/verify?token=mno456&type=magiclink&redirect_to=https://nc-performace-mu.vercel.app/attiva",
    },
  },
];
