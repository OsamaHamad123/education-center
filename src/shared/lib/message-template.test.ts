import { describe, expect, it } from "vitest";
import { renderTemplate, TEMPLATE_PREVIEW, TEMPLATE_TOKENS } from "./message-template";

describe("renderTemplate", () => {
  it("substitutes every token it is given", () => {
    const out = renderTemplate("{الطالب} غاب اليوم {اليوم} في: {الحصص}", {
      الطالب: "محمد أحمد",
      اليوم: "الأحد",
      الحصص: "رياضيات، فيزياء",
    });
    expect(out).toBe("محمد أحمد غاب اليوم الأحد في: رياضيات، فيزياء");
  });

  it("substitutes a token that appears more than once", () => {
    expect(renderTemplate("{الطالب} — {الطالب}", { الطالب: "سارة" })).toBe("سارة — سارة");
  });

  it("leaves an unsupplied token visible rather than dropping it", () => {
    // Dropping it would send "نسبة غياب أحمد بلغت %" and nobody would know why. Left in
    // the text, the gap is obvious in the settings preview — where it is cheap to find.
    expect(renderTemplate("نسبة غياب {الطالب} بلغت {النسبة}%", { الطالب: "أحمد" })).toBe(
      "نسبة غياب أحمد بلغت {النسبة}%",
    );
  });

  it("leaves a misspelled token alone", () => {
    expect(renderTemplate("{النسبه}", { النسبة: "32" })).toBe("{النسبه}");
  });

  it("does not treat a value as a template", () => {
    // A student called {اليوم} is absurd, but a value that gets re-scanned is how a
    // substitution routine becomes an injection.
    expect(renderTemplate("{الطالب}", { الطالب: "{اليوم}", اليوم: "الأحد" })).toBe("{اليوم}");
  });

  it("returns a template with no tokens unchanged", () => {
    expect(renderTemplate("نرجو التواصل مع المكتب.", {})).toBe("نرجو التواصل مع المكتب.");
  });

  it("previews every token the editor is offered", () => {
    // If a token is offered in the settings help text it must preview, or the admin
    // sees a placeholder survive and thinks the feature is broken.
    const preview = renderTemplate(TEMPLATE_TOKENS.map((t) => `{${t}}`).join(" "), TEMPLATE_PREVIEW);
    expect(preview).not.toContain("{");
  });
});
