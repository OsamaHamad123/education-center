/**
 * The message templates the office sends to parents (P4a).
 *
 * Pure text substitution, in `shared/lib` rather than in a module, because two
 * modules need it: `settings` previews a template while it is being edited, and
 * `reports` renders one into a `wa.me` link.
 *
 * Nothing here sends anything. The rendered text goes into a click-to-chat link and
 * a person presses send — see docs/MESSAGING-AND-FEES-PLAN.md for why that stays true
 * until somebody owns the replies.
 */

/**
 * The placeholders a template may use. Arabic words, because the person editing the
 * template in settings reads Arabic and `{studentName}` would be noise to them.
 */
export const TEMPLATE_TOKENS = ["الطالب", "اليوم", "الحصص", "النسبة", "مرات", "الفرع", "المركز"] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export type TemplateValues = Partial<Record<TemplateToken, string>>;

/**
 * Substitutes `{token}` for each value given.
 *
 * An unknown or unsupplied token is left in the text EXACTLY as written, deliberately.
 * Dropping it silently would send `نسبة غياب أحمد بلغت %` to a parent and nobody would
 * know why; leaving `{النسبه}` visible makes the typo obvious in the settings preview,
 * which is where it is cheap to find.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  // ONE pass, not a loop of replacements. A loop re-scans what it has already
  // substituted, so a value containing braces would itself be treated as a template —
  // which is how a substitution routine turns into an injection.
  return template.replace(/\{([^{}]+)\}/g, (whole, name: string) => {
    if (!isToken(name)) return whole;
    return values[name] ?? whole;
  });
}

function isToken(name: string): name is TemplateToken {
  return (TEMPLATE_TOKENS as readonly string[]).includes(name);
}

/** Sample values for the live preview on the settings screen. */
export const TEMPLATE_PREVIEW: Required<TemplateValues> = {
  الطالب: "محمد أحمد",
  اليوم: "الأحد",
  الحصص: "رياضيات (الحصة ٢)، فيزياء (الحصة ٣)",
  النسبة: "32",
  مرات: "4",
  الفرع: "فرع مدينة نصر",
  المركز: "مركز النخبة التعليمي",
};
