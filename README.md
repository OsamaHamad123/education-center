# نظام إدارة مركز تعليمي متعدد الفروع

Multi-Branch Education Center Management System — نظام ويب عربي (RTL) خفيف ومُحسَّن للهاتف المحمول لإدارة
مركز تعليمي له عدة فروع: الفروع، الشُعب، الطلاب، المعلمون، الجداول الأسبوعية، الحضور اليومي، مستحقات
المعلمين، التقارير القابلة للطباعة، بوابة المعلم، وصفحة استعلام عامة لأولياء الأمور والطلاب.

## الحالة

اكتملت **المرحلتان 0 و 1**: التأسيس وأدوات الجودة، ثم مخطط قاعدة البيانات والـ migrations
وسياسات عزل الفروع (RLS) والبيانات التجريبية. كل الفحوص خضراء: 77 اختباراً منها 37 اختبار تكامل
تعمل على PostgreSQL حقيقي. المرحلة التالية: المصادقة وواجهة التطبيق.

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

## البدء

مطلوب: Node.js 22+، pnpm، و Docker Desktop.

```bash
pnpm install
cp .env.example .env     # القيم الافتراضية تطابق docker-compose
pnpm db:up               # تشغيل PostgreSQL 16 (ينشئ الدورين وقاعدة الاختبار)
pnpm dev                 # http://localhost:3000
```

```bash
pnpm db:migrate          # يطبّق المخطط + سياسات RLS
pnpm db:seed             # بيانات تجريبية ويطبع بيانات الدخول
```

بيانات الدخول التجريبية: `admin` للإدارة العامة، و`admin_nsr` / `admin_obr` / `admin_giz`
لمديري الفروع، بكلمة المرور `Password123!`. المعلمون يدخلون برقم الهاتف وكود `123456`.

أوامر الجودة المطلوبة قبل أي commit (يشغّلها Husky تلقائياً أيضاً):

```bash
pnpm typecheck && pnpm lint && pnpm test
```

| الأمر                                                 | الغرض                  |
| ----------------------------------------------------- | ---------------------- |
| `pnpm dev`                                            | تشغيل التطبيق          |
| `pnpm typecheck`                                      | `tsc --noEmit`         |
| `pnpm lint` / `pnpm format`                           | ESLint / Prettier      |
| `pnpm test`                                           | Vitest (وحدات + تكامل) |
| `pnpm test:e2e`                                       | Playwright             |
| `pnpm db:up` / `db:migrate` / `db:seed` / `db:studio` | قاعدة البيانات         |

### قواعد معمارية مفروضة بالـ lint

- لا يُستورد من وحدة أخرى إلا عبر واجهتها العامة `@/modules/<module>` — الاستيراد العميق خطأ lint.
- طبقة `domain/` لا تستورد `next` أو `react` أو `drizzle-orm` أو `@/shared/db` — خطأ lint.

## الترخيص

خاص — جميع الحقوق محفوظة.
