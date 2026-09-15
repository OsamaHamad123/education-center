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

  nav: {
    dashboard: "لوحة التحكم",
    branches: "الفروع",
    users: "المستخدمون",
    classes: "الشُعب",
    students: "الطلاب",
    teachers: "المعلمون",
    subjects: "المواد",
    timetable: "جدول الحصص",
    attendance: "الحضور",
    payroll: "المستحقات",
    reports: "التقارير",
    audit: "سجل التدقيق",
    settings: "الإعدادات",
    menu: "القائمة",
    allBranches: "كافة الفروع",
    switchBranch: "تبديل الفرع",
    logout: "تسجيل الخروج",
    myAccount: "حسابي",
    teacherHome: "حصص اليوم",
    teacherTimetable: "جدولي",
    teacherEarnings: "مستحقاتي",
  },

  auth: {
    loginTitle: "تسجيل الدخول",
    loginSubtitle: "ادخل إلى نظام إدارة المركز",
    adminTab: "إدارة",
    teacherTab: "معلم",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    phone: "رقم الهاتف",
    accessCode: "كود الدخول",
    submit: "دخول",
    submitting: "جارٍ الدخول…",
    invalidCredentials: "اسم المستخدم أو كلمة المرور غير صحيحة.",
    accountInactive: "هذا الحساب موقوف. راجع الإدارة العامة.",
    tooManyAttempts: "محاولات كثيرة. انتظر ربع ساعة ثم أعد المحاولة.",
    changePasswordTitle: "تغيير كلمة المرور",
    changePasswordHint: "كلمة المرور الحالية مؤقتة — اختر كلمة مرور جديدة للمتابعة.",
    currentPassword: "كلمة المرور الحالية",
    newPassword: "كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور",
    passwordsDoNotMatch: "كلمتا المرور غير متطابقتين.",
    passwordTooShort: "كلمة المرور قصيرة جداً (8 أحرف على الأقل).",
    passwordChanged: "تم تغيير كلمة المرور.",
  },

  banners: {
    allBranchesReadOnly: "أنت في وضع «كافة الفروع» — العرض فقط. اختر فرعاً محدداً لإجراء أي تعديل.",
    activeBranch: "الفرع النشط",
  },

  dashboard: {
    welcome: "أهلاً",
    comingSoon: "قيد التطوير — تُبنى هذه الشاشة في مرحلة لاحقة.",
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
