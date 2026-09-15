/**
 * All user-facing Arabic text. Components never hard-code strings (CLAUDE.md,
 * "Coding conventions"), so this file is the single place to review wording.
 *
 * Keys are grouped by area and use the code vocabulary from PROJECT_PLAN section 2
 * (branch / class / student …), while the values use the Arabic the center actually uses.
 */
export const ar = {
  app: {
    name: "مركز التعليم",
    description: "نظام إدارة مركز تعليمي متعدد الفروع",
  },

  common: {
    save: "حفظ",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    archive: "أرشفة",
    restore: "استعادة",
    search: "بحث",
    filter: "تصفية",
    print: "طباعة",
    export: "تصدير",
    back: "رجوع",
    next: "التالي",
    previous: "السابق",
    confirm: "تأكيد",
    loading: "جارٍ التحميل…",
    saving: "جارٍ الحفظ…",
    noResults: "لا توجد نتائج",
    all: "الكل",
    active: "نشط",
    inactive: "غير نشط",
    yes: "نعم",
    no: "لا",
    from: "من",
    to: "إلى",
    total: "الإجمالي",
  },

  entities: {
    branch: "فرع",
    branches: "الفروع",
    class: "شعبة",
    classes: "الشُعب",
    student: "طالب",
    students: "الطلاب",
    teacher: "معلم",
    teachers: "المعلمون",
    subject: "مادة",
    subjects: "المواد",
    timetable: "جدول الحصص",
    session: "حصة",
    sessions: "الحصص",
    attendance: "الحضور",
    payroll: "المستحقات",
    reports: "التقارير",
    auditLog: "سجل التدقيق",
    settings: "الإعدادات",
  },

  roles: {
    super_admin: "الإدارة العامة",
    branch_admin: "مدير الفرع",
    teacher: "معلم",
  },

  tracks: {
    scientific: "علمي",
    literary: "أدبي",
  },

  attendanceStatus: {
    present: "حاضر",
    absent: "غائب",
    late: "متأخر",
    excused: "بعذر",
  },

  /** Error messages keyed by AppErrorCode — see src/shared/lib/result.ts. */
  errors: {
    UNAUTHORIZED: "يجب تسجيل الدخول أولاً.",
    FORBIDDEN: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
    NOT_FOUND: "العنصر المطلوب غير موجود.",
    VALIDATION_ERROR: "تحقق من البيانات المُدخلة.",
    CONFLICT: "هناك تعارض مع بيانات موجودة بالفعل.",
    BRANCH_REQUIRED: "اختر فرعاً محدداً أولاً — هذا الإجراء غير متاح في وضع «كافة الفروع».",
    RATE_LIMITED: "محاولات كثيرة جداً. انتظر قليلاً ثم أعد المحاولة.",
    INTERNAL: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  },

  /** Day names indexed by ISO weekday (1 = Monday … 7 = Sunday). */
  weekdays: {
    1: "الإثنين",
    2: "الثلاثاء",
    3: "الأربعاء",
    4: "الخميس",
    5: "الجمعة",
    6: "السبت",
    7: "الأحد",
  },

  units: {
    currency: "ج.م",
    period: "الحصة",
    minute: "دقيقة",
  },
} as const;

export type Ar = typeof ar;
