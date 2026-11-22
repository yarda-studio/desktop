import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLexiconLabel, getLexiconLanguage } from "./lexiconUtils.ts";

test("getLexiconLanguage detects Greek and Hebrew lexicons correctly", () => {
  assert.equal(getLexiconLanguage({ id: "THAYER", name: "Thayer's Greek-English Lexicon" }), "G");
  assert.equal(getLexiconLanguage({ id: "TBESG", name: "Abbott-Smith Greek Lexicon" }), "G");
  assert.equal(getLexiconLanguage({ id: "TFLSJ", name: "Liddell-Scott-Jones Greek Lexicon" }), "G");
  assert.equal(getLexiconLanguage({ id: "TBESH", name: "Brown-Driver-Briggs Hebrew Lexicon" }), "H");

  // User downloaded Dodson
  assert.equal(
    getLexiconLanguage({
      id: "Dodson",
      name: "Dodson Greek-English Lexicon",
      features: ["greekdef"],
    }),
    "G"
  );

  // Hebrew lexicon by feature
  assert.equal(
    getLexiconLanguage({
      id: "SomeHebrew",
      name: "Hebrew Dictionary",
      features: ["hebrewdef"],
    }),
    "H"
  );
});

test("cleanLexiconLabel produces clean short labels for tabs and chips", () => {
  assert.equal(cleanLexiconLabel({ id: "THAYER", name: "Thayer's Greek-English Lexicon" }), "Thayer");
  assert.equal(cleanLexiconLabel({ id: "TBESG", name: "Abbott-Smith Greek Lexicon" }), "Abbott-Smith");
  assert.equal(cleanLexiconLabel({ id: "TBESH", name: "Brown-Driver-Briggs Hebrew Lexicon" }), "BDB");
  assert.equal(cleanLexiconLabel({ id: "TFLSJ", name: "Liddell-Scott-Jones Greek Lexicon (full)" }), "Full LSJ");
  assert.equal(cleanLexiconLabel({ id: "Dodson", name: "Dodson Greek-English Lexicon" }), "Dodson");
});
