# نظام إدارة مركز تعليمي متعدد الفروع

Multi-Branch Education Center Management System — نظام ويب عربي (RTL) خفيف ومُحسَّن للهاتف المحمول لإدارة
مركز تعليمي له عدة فروع: الفروع، الشُعب، الطلاب، المعلمون، الجداول الأسبوعية، الحضور اليومي، مستحقات
المعلمين، التقارير القابلة للطباعة، بوابة المعلم، وصفحة استعلام عامة لأولياء الأمور والطلاب.

## الحالة

المشروع في مرحلة التأسيس. هذا المستودع يحتوي حالياً على **هيكل المجلدات والوثائق فقط** — لم يتم بعد
تثبيت أي اعتماديات ولا كتابة كود التطبيق. ابدأ من `Phase 0` في خطة المشروع.

- المواصفات الكاملة: [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)
- قواعد العمل لكل جلسة: [`CLAUDE.md`](CLAUDE.md)
- سجل التقدم والقرارات: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- قرارات معمارية (ADR): [`docs/decisions/`](docs/decisions)

## التقنيات

Next.js (App Router) + TypeScript strict · PostgreSQL 16 + Drizzle ORM · Better Auth · Zod ·
Tailwind CSS + shadcn/ui (RTL، خط Cairo) · TanStack Table · React Hook Form · date-fns
(المنطقة الزمنية دائماً `Africa/Cairo`) · Vitest + Playwright · pnpm + Docker Compose.

## البنية

معمارية Modular Monolith بطبقات صارمة داخل `src/modules/<module>/`:

```
domain/          منطق عمل خالص (بدون إطار عمل وبدون قاعدة بيانات)
application/     حالات الاستخدام (use cases) والاستعلامات ومخططات Zod
infrastructure/  مستودعات Drizzle
ui/              مكونات الواجهة
index.ts         الواجهة العامة للوحدة — الاستيراد من وحدة أخرى يتم عبره فقط
```

عزل الفروع مطبَّق على طبقتين: طبقة التطبيق (`TenantContext` + `withTenant`) وطبقة قاعدة البيانات
(Row Level Security). التفاصيل في [ADR 0001](docs/decisions/0001-row-level-tenancy.md).

## البدء (بعد تنفيذ Phase 0)

```bash
corepack enable pnpm   # pnpm غير مثبت على الجهاز حالياً
pnpm install
cp .env.example .env   # ثم املأ القيم
pnpm db:up             # تشغيل PostgreSQL عبر Docker
pnpm db:migrate
pnpm db:seed
pnpm dev
```

أوامر الجودة المطلوبة قبل أي commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## الترخيص

خاص — جميع الحقوق محفوظة.
