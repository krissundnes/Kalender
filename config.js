// =====================================================================
//  Innstillinger for familiekalenderen
// =====================================================================

window.KALENDER_CONFIG = {
  // Fra Supabase: Project Settings → API (eller "Connect"-knappen øverst).
  // Bruk "Project URL" og den OFFENTLIGE nøkkelen ("anon" / "publishable").
  // Disse er laget for å ligge i nettleseren; det er tilgangsreglene i
  // databasen som beskytter dataene. Bruk ALDRI "service_role"/"secret"-nøkkelen her.
  // La feltene stå tomme for å prøve appen i demomodus.
  SUPABASE_URL: "https://vjzzopfgqghrzxtbaeht.supabase.co",
  SUPABASE_KEY: "sb_publishable_JAaaBRVfxIB8H3Oix37viQ_e36sgIpz",

  APP_NAME: "Familiekalender",

  // Personene i kalenderen. id må stemme med member_id i databasen.
  MEMBERS: [
    { id: "kristoffer", name: "Kristoffer", short: "K", color: "#2563eb" },
    { id: "hilde",      name: "Hilde",      short: "H", color: "##16a34a" },
    { id: "ane",        name: "Ane",        short: "A", color: "#c026d3" },
    { id: "vegard",     name: "Vegard",     short: "V", color: "#ea580c" },
  ],

  // Farge for avtaler som gjelder hele familien
  FAMILY_COLOR: "#475569",

  // Hvor uke- og dagsvisningen starter når den åpnes (klokketime)
  SCROLL_TO_HOUR: 7,
};
