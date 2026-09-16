# نظام إدارة مركز تعليمي متعدد الفروع

Multi-Branch Education Center Management System — نظام ويب عربي (RTL) خفيف ومُحسَّن للهاتف المحمول لإدارة
مركز تعليمي له عدة فروع: الفروع، الشُعب، الطلاب، المعلمون، الجداول الأسبوعية، الحضور اليومي، مستحقات
المعلمين، التقارير القابلة للطباعة، بوابة المعلم، وصفحة استعلام عامة لأولياء الأمور والطلاب.

## الحالة

اكتملت **كل المراحل من 0 إلى 10**: التأسيس، قاعدة البيانات وسياسات عزل الفروع (RLS)، المصادقة
والأدوار، شاشات الإدارة العامة، الشُعب والطلاب بكامل دورة القيد، المعلمون وأجورهم، محرك الجداول،
الحضور والحصص، المستحقات والتقارير، بوابة المعلم واستعلام ولي الأمر، ثم التقسية والنشر.

كل الفحوص خضراء: **419 اختباراً** (290 وحدة + 129 تكامل على PostgreSQL حقيقي) و **210 اختبار e2e**
على مقاسي سطح المكتب والهاتف.

- المواصفات الكاملة: [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)
- قواعد العمل لكل جلسة: [`CLAUDE.md`](CLAUDE.md)
- سجل التقدم والقرارات: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- **المراجعة الأمنية**: [`docs/SECURITY-REVIEW.md`](docs/SECURITY-REVIEW.md)
- **دليل التشغيل (نسخ احتياطي واستعادة)**: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
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

| الأمر                                                 | الغرض                     |
| ----------------------------------------------------- | ------------------------- |
| `pnpm dev`                                            | تشغيل التطبيق             |
| `pnpm typecheck`                                      | `tsc --noEmit`            |
| `pnpm lint` / `pnpm format`                           | ESLint / Prettier         |
| `pnpm test`                                           | Vitest (وحدات + تكامل)    |
| `pnpm test:e2e`                                       | Playwright                |
| `pnpm db:up` / `db:migrate` / `db:seed` / `db:studio` | قاعدة البيانات            |
| `pnpm create-super-admin`                             | إنشاء أول حساب إدارة عامة |

### قواعد معمارية مفروضة بالـ lint

- لا يُستورد من وحدة أخرى إلا عبر واجهتها العامة `@/modules/<module>` — الاستيراد العميق خطأ lint.
- طبقة `domain/` لا تستورد `next` أو `react` أو `drizzle-orm` أو `@/shared/db` — خطأ lint.

## النشر على خادم جديد

خادم واحد (2 vCPU / 4GB) عليه Docker، وأربع حاويات: قاعدة البيانات، حاوية ترحيلات تعمل مرة واحدة،
التطبيق، و Caddy لشهادة HTTPS تلقائية، بالإضافة إلى حاوية نسخ احتياطي.

### 1. المتغيرات

```bash
cp .env.example .env.production
```

ثم املأ **كل** القيم — لا يوجد قيمة افتراضية لأي سر، و`docker compose` يرفض الإقلاع بدونها عمداً:

| المتغير                                 | ملاحظات                                        |
| --------------------------------------- | ---------------------------------------------- |
| `POSTGRES_PASSWORD`                     | كلمة مرور `postgres`                           |
| `DB_OWNER_PASSWORD` / `DB_APP_PASSWORD` | دورا القاعدة: المالك (للترحيلات) والتطبيق      |
| `DATABASE_URL`                          | دور **التطبيق** — `school_app` بلا `BYPASSRLS` |
| `DATABASE_OWNER_URL`                    | دور **المالك** — للترحيلات فقط                 |
| `BETTER_AUTH_SECRET`                    | `openssl rand -base64 32`                      |
| `BETTER_AUTH_URL`                       | `https://your-domain`                          |
| `LOOKUP_IP_SALT`                        | 16 حرفاً على الأقل — به تُجزّأ عناوين IP       |
| `DOMAIN`                                | النطاق الذي يستخرج له Caddy الشهادة            |
| `BACKUP_PASSPHRASE`                     | بدونها تُكتب النسخ الاحتياطية **غير مشفّرة**   |

الفصل بين `DATABASE_URL` و`DATABASE_OWNER_URL` ليس تنظيماً: التطبيق يتصل بدور **لا يستطيع تجاوز
RLS**، وهو السطر الذي يجعل كل سياسة عزل في المنتج ذات معنى.

### 2. الإقلاع

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

الترتيب مفروض: القاعدة تُقلع، ثم حاوية `migrate` تطبّق الترحيلات بدور المالك وتنتهي بنجاح، وعندها
فقط يبدأ التطبيق. تطبيق لا يعرف مخطط قاعدته لا يجب أن يقبل طلباً.

### 3. أول حساب

```bash
docker compose -f docker-compose.prod.yml exec -it app node -e "console.log('use the host shell')"
# من مجلد المشروع على الخادم:
DATABASE_OWNER_URL="..." pnpm create-super-admin
```

يسأل عن الاسم واسم المستخدم وكلمة المرور تفاعلياً — لا يأخذها كوسيط سطر أوامر، لأن الوسيط ينتهي
في سجل الأوامر وفي `ps`.

### 4. التحقق

```bash
curl -s https://your-domain/api/health        # {"status":"ok"} — ويفحص القاعدة فعلاً
curl -sI https://your-domain/lookup | grep -i security
```

## النسخ الاحتياطي والاستعادة

نسخة يومية بصيغة `pg_dump --format=custom` مشفّرة بـ AES-256، تُحفظ 14 يوماً، ويتم **التحقق من كل
نسخة بقراءتها** قبل حذف القديمة. التفاصيل وتمرين الاستعادة في [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

نسخة لم يقرأها أحد ليست نسخة احتياطية — نفّذ تمرين الاستعادة قبل التشغيل الفعلي.

## الترخيص

خاص — جميع الحقوق محفوظة.
