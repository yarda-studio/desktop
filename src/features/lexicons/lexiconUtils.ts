/**
 * Utility functions for classifying and labelling lexicons.
 */

export function getLexiconLanguage(m: {
  features?: string[];
  id: string;
  name: string;
  description?: string;
}): "G" | "H" | "both" {
  const idUpper = m.id.toUpperCase();
  if (idUpper === "THAYER" || idUpper === "TBESG" || idUpper === "TFLSJ" || idUpper === "STRONGSGREEK") {
    return "G";
  }
  if (idUpper === "TBESH" || idUpper === "STRONGSHEBREW") {
    return "H";
  }

  const feats = (m.features || []).map((f) => f.toLowerCase());
  const hasGreek = feats.some((f) => f.includes("greek") || f === "greekdef" || f === "greekparse");
  const hasHebrew = feats.some((f) => f.includes("hebrew") || f === "hebrewdef" || f === "hebrewparse");
  if (hasGreek && hasHebrew) return "both";
  if (hasGreek) return "G";
  if (hasHebrew) return "H";

  const text = `${m.id} ${m.name} ${m.description || ""}`.toLowerCase();
  if (text.includes("greek") && !text.includes("hebrew")) return "G";
  if (text.includes("hebrew") && !text.includes("greek")) return "H";
  return "both";
}

export function cleanLexiconLabel(m: { id: string; name: string }): string {
  const idUpper = m.id.toUpperCase();
  if (idUpper === "THAYER") return "Thayer";
  if (idUpper === "TBESG") return "Abbott-Smith";
  if (idUpper === "TBESH") return "BDB";
  if (idUpper === "TFLSJ") return "Full LSJ";
  if (idUpper === "STRONGSGREEK" || idUpper === "STRONGSHEBREW") return "Strong's";
  if (m.id.toLowerCase() === "dodson") return "Dodson";

  const cleaned = m.name
    .replace(/Greek-English|Hebrew-English|Lexicon|Dictionary/gi, "")
    .replace(/A Manual Greek Lexicon of the New Testament/gi, "Abbott-Smith")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || m.id;
}
